"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const bcrypt = require("bcryptjs");

initializeApp();
const db = getFirestore();
const REGION = process.env.FUNCTIONS_REGION || "southamerica-east1";
const callable = (handler, options = {}) => onCall({ region: REGION, ...options }, async (request) => {
  try {
    return await handler(request);
  } catch (error) {
    logger.error("callable_failed", { functionName: handler.name, code: error.code || "internal", uid: request.auth?.uid, errorMessage: error.message, stack: error.stack });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Não foi possível concluir a operação.");
  }
});

const clean = (value) => String(value ?? "").trim();
const assert = (condition, code, message) => { if (!condition) throw new HttpsError(code, message); };
const canonicalPayment = (value) => {
  const aliases = { CREDIT_CREDIT: "CREDIT_CARD", CARD_CREDIT: "CREDIT_CARD", CREDIT: "CREDIT_CARD", DEBIT: "DEBIT_CARD" };
  const result = aliases[clean(value).toUpperCase()] || clean(value).toUpperCase();
  assert(["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD"].includes(result), "invalid-argument", "Forma de pagamento inválida.");
  return result;
};
const positiveQuantity = (value) => {
  const number = Number(value);
  assert(Number.isFinite(number) && number > 0 && number <= 1_000_000, "invalid-argument", "Quantidade inválida.");
  return number;
};
const cents = (value, field, allowZero = true) => {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= (allowZero ? 0 : 1), "invalid-argument", `${field} inválido.`);
  return number;
};

async function context(request, companyId, transaction, roles = []) {
  assert(request.auth, "unauthenticated", "Faça login novamente.");
  const id = clean(companyId);
  assert(id && id.length <= 128, "invalid-argument", "Empresa inválida.");
  const companyRef = db.doc(`companies/${id}`);
  const profileRef = db.doc(`companies/${id}/users/${request.auth.uid}`);
  const [companySnap, profileSnap] = transaction
    ? await Promise.all([transaction.get(companyRef), transaction.get(profileRef)])
    : await Promise.all([companyRef.get(), profileRef.get()]);
  assert(companySnap.exists && companySnap.data().isActive !== false, "failed-precondition", "Empresa inativa ou inexistente.");
  assert(profileSnap.exists && profileSnap.data().isActive !== false, "permission-denied", "Acesso desativado.");
  const profile = profileSnap.data();
  assert(!profile.companyId || profile.companyId === id, "permission-denied", "Empresa inválida para este usuário.");
  assert(!profile.empresa_id || profile.empresa_id === id, "permission-denied", "Empresa inválida para este usuário.");
  if (roles.length) assert(roles.includes(profile.role), "permission-denied", "Você não tem permissão para esta operação.");
  return { companyId: id, uid: request.auth.uid, role: profile.role, profile };
}

async function platformContext(request) {
  assert(request.auth, "unauthenticated", "Faça login como administrador da plataforma.");
  const snap = await db.doc(`platform_admins/${request.auth.uid}`).get();
  assert(snap.exists && snap.data().isActive !== false, "permission-denied", "Conta sem autorização administrativa.");
  return { uid: request.auth.uid, role: "PLATFORM_ADMIN" };
}

function audit(transaction, ctx, action, targetType, targetId, operationId, details = {}) {
  const ref = db.collection(`companies/${ctx.companyId}/audit_logs`).doc();
  transaction.create(ref, {
    action, targetType, targetId: clean(targetId), actorUid: ctx.uid, actorRole: ctx.role,
    operationId: clean(operationId) || ref.id, details, result: "SUCCESS", timestamp: FieldValue.serverTimestamp()
  });
}

function productPriceInCents(data) {
  if (Number.isSafeInteger(data.unitPriceInCents)) return data.unitPriceInCents;
  if (Number.isSafeInteger(data.sellingPriceInCents)) return data.sellingPriceInCents;
  const legacy = Number(data.sellingPrice ?? data.price);
  assert(Number.isFinite(legacy) && legacy >= 0, "failed-precondition", "Produto sem preço válido.");
  return Math.round(legacy * 100);
}

exports.finalizeSale = callable(async function finalizeSale(request) {
  const data = request.data || {};
  const key = clean(data.idempotencyKey);
  assert(/^[A-Za-z0-9_-]{16,128}$/.test(key), "invalid-argument", "Chave de idempotência inválida.");
  assert(Array.isArray(data.items) && data.items.length > 0 && data.items.length <= 100, "invalid-argument", "Itens inválidos.");
  const normalizedItems = data.items.map((item) => ({ productId: clean(item.productId), quantity: positiveQuantity(item.quantity) }));
  assert(new Set(normalizedItems.map((item) => item.productId)).size === normalizedItems.length, "invalid-argument", "Produto repetido na venda.");
  const paymentMethod = canonicalPayment(data.paymentMethod);
  const discountInCents = cents(data.discountInCents ?? 0, "Desconto");
  return db.runTransaction(async (transaction) => {
    const ctx = await context(request, data.companyId, transaction, ["OPERATOR", "ADMIN", "MASTER_ADMIN"]);
    const operationRef = db.doc(`companies/${ctx.companyId}/operations/${key}`);
    const operationSnap = await transaction.get(operationRef);
    if (operationSnap.exists) {
      assert(operationSnap.data().type === "FINALIZE_SALE" && operationSnap.data().actorUid === ctx.uid, "already-exists", "Chave já utilizada.");
      return operationSnap.data().result;
    }
    const activeRef = db.doc(`companies/${ctx.companyId}/cash_registers/active_register`);
    const activeSnap = await transaction.get(activeRef);
    assert(activeSnap.exists && activeSnap.data().isOpen === true, "failed-precondition", "Não existe caixa aberto.");
    const active = activeSnap.data();
    const requestedRegister = clean(data.cashRegisterId);
    assert(!requestedRegister || requestedRegister === clean(active.registerDocumentId || active.id), "failed-precondition", "O caixa informado não é o caixa ativo.");
    const productRefs = normalizedItems.map((item) => db.doc(`companies/${ctx.companyId}/products/${item.productId}`));
    const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
    const counterRef = db.doc(`companies/${ctx.companyId}/counters/sales`);
    const counterSnap = await transaction.get(counterRef);
    let subtotalInCents = 0;
    const saleItems = productSnaps.map((snap, index) => {
      const item = normalizedItems[index];
      assert(snap.exists, "not-found", "Produto não encontrado.");
      const product = snap.data();
      assert(product.isActive !== false && product.isDeleted !== true, "failed-precondition", "Produto indisponível.");
      const unitPriceInCents = productPriceInCents(product);
      const lineSubtotal = Math.round(unitPriceInCents * item.quantity);
      assert(Number.isSafeInteger(lineSubtotal), "invalid-argument", "Subtotal inválido.");
      subtotalInCents += lineSubtotal;
      const tracksStock = product.hasStockControl !== false && product.tracksStock !== false;
      const currentStock = Number(product.stockQuantity) || 0;
      if (tracksStock) {
        assert(currentStock >= item.quantity, "failed-precondition", `Estoque insuficiente para ${product.name || "produto"}.`);
        transaction.update(snap.ref, { stockQuantity: currentStock - item.quantity, updatedAt: FieldValue.serverTimestamp() });
      }
      return { productId: snap.id, productName: clean(product.name) || "Produto", quantity: item.quantity, tracksStock, unitPriceInCents, subtotalInCents: lineSubtotal };
    });
    assert(discountInCents <= subtotalInCents, "invalid-argument", "Desconto maior que o subtotal.");
    const saleNumber = Math.max(1, Number(counterSnap.data()?.nextNumber) || 1);
    transaction.set(counterRef, { nextNumber: saleNumber + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const saleRef = db.collection(`companies/${ctx.companyId}/sales`).doc();
    const totalAmountInCents = subtotalInCents - discountInCents;
    const registerId = clean(active.registerDocumentId || active.id || activeRef.id);
    transaction.create(saleRef, {
      documentId: saleRef.id, saleNumber, companyId: ctx.companyId, paymentMethod, subtotalInCents,
      discountInCents, totalAmountInCents, finalAmountInCents: totalAmountInCents, items: saleItems,
      userUid: ctx.uid, userDisplayNameSnapshot: clean(ctx.profile.username || ctx.profile.displayName),
      cashRegisterId: registerId, isCancelled: false, idempotencyKey: key, timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp()
    });
    saleItems.filter((item) => item.tracksStock).forEach((item) => {
      const movementRef = db.collection(`companies/${ctx.companyId}/stock_movements`).doc();
      transaction.create(movementRef, {
        documentId: movementRef.id, productId: item.productId, productNameSnapshot: item.productName,
        quantity: -item.quantity, type: "EXIT", reason: `Venda #${saleNumber}`, saleId: saleRef.id,
        userUid: ctx.uid, timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp()
      });
    });
    const result = { saleId: saleRef.id, saleNumber, subtotalInCents, discountInCents, totalAmountInCents, paymentMethod, items: saleItems };
    transaction.create(operationRef, { type: "FINALIZE_SALE", actorUid: ctx.uid, result, createdAt: FieldValue.serverTimestamp() });
    audit(transaction, ctx, "SALE_FINALIZED", "sale", saleRef.id, key, { saleNumber, totalAmountInCents });
    return result;
  });
});

exports.cancelSale = callable(async function cancelSale(request) {
  const data = request.data || {};
  const saleId = clean(data.saleId);
  const key = clean(data.idempotencyKey);
  const password = clean(data.password);
  assert(saleId && /^[A-Za-z0-9_-]{16,128}$/.test(key) && password, "invalid-argument", "Dados de cancelamento inválidos.");
  const preCtx = await context(request, data.companyId, null, ["ADMIN", "MASTER_ADMIN"]);
  const privateRef = db.doc(`companies/${preCtx.companyId}/private_settings/cancellation`);
  const privateSnap = await privateRef.get();
  assert(privateSnap.exists && privateSnap.data().passwordHash, "failed-precondition", "Senha de cancelamento não configurada.");
  const lock = privateSnap.data().lockUntil?.toMillis?.() || 0;
  assert(lock <= Date.now(), "resource-exhausted", "Muitas tentativas. Aguarde e tente novamente.");
  if (!(await bcrypt.compare(password, privateSnap.data().passwordHash))) {
    const attempts = (Number(privateSnap.data().failedAttempts) || 0) + 1;
    const delay = Math.min(15 * 60_000, attempts * attempts * 2_000);
    await privateRef.set({ failedAttempts: attempts, lastFailedAt: FieldValue.serverTimestamp(), lockUntil: new Date(Date.now() + delay) }, { merge: true });
    throw new HttpsError("permission-denied", "Não foi possível autorizar o cancelamento.");
  }
  await privateRef.set({ failedAttempts: 0, lockUntil: FieldValue.delete(), lastSuccessAt: FieldValue.serverTimestamp() }, { merge: true });
  return db.runTransaction(async (transaction) => {
    const ctx = await context(request, data.companyId, transaction, ["ADMIN", "MASTER_ADMIN"]);
    const saleRef = db.doc(`companies/${ctx.companyId}/sales/${saleId}`);
    const saleSnap = await transaction.get(saleRef);
    assert(saleSnap.exists, "not-found", "Venda não encontrada.");
    const sale = saleSnap.data();
    if (sale.isCancelled === true) return { saleId, alreadyCancelled: true, cancellationOperationId: sale.cancellationOperationId };
    const items = Array.isArray(sale.items) ? sale.items : [];
    const trackedItems = items.filter((entry) => entry.tracksStock !== false);
    const productRefs = trackedItems.map((item) => db.doc(`companies/${ctx.companyId}/products/${clean(item.productId)}`));
    const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
    trackedItems.forEach((item, index) => {
      const productRef = productRefs[index];
      const productSnap = productSnaps[index];
      if (productSnap.exists) {
        transaction.update(productRef, { stockQuantity: (Number(productSnap.data().stockQuantity) || 0) + positiveQuantity(item.quantity), updatedAt: FieldValue.serverTimestamp() });
      }
      const movementRef = db.collection(`companies/${ctx.companyId}/stock_movements`).doc();
      transaction.create(movementRef, { documentId: movementRef.id, productId: clean(item.productId), productNameSnapshot: clean(item.productName), quantity: Number(item.quantity), type: "ENTRY", reason: `Cancelamento venda #${sale.saleNumber || saleId}`, saleId, userUid: ctx.uid, timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
    });
    transaction.update(saleRef, { isCancelled: true, cancelledAt: FieldValue.serverTimestamp(), cancelledByUid: ctx.uid, cancellationReason: clean(data.reason) || "Cancelamento autorizado", cancellationOperationId: key });
    audit(transaction, ctx, "SALE_CANCELLED", "sale", saleId, key, { reason: clean(data.reason) || "Cancelamento autorizado" });
    return { saleId, alreadyCancelled: false, cancellationOperationId: key };
  });
});

exports.openCashRegister = callable(async function openCashRegister(request) {
  const data = request.data || {};
  const initialBalanceInCents = cents(data.initialBalanceInCents ?? 0, "Saldo inicial");
  const key = clean(data.idempotencyKey);
  assert(/^[A-Za-z0-9_-]{16,128}$/.test(key), "invalid-argument", "Chave de idempotência inválida.");
  return db.runTransaction(async (transaction) => {
    const ctx = await context(request, data.companyId, transaction, ["OPERATOR", "ADMIN", "MASTER_ADMIN"]);
    const operationRef = db.doc(`companies/${ctx.companyId}/operations/${key}`);
    const operationSnap = await transaction.get(operationRef);
    if (operationSnap.exists) {
      assert(operationSnap.data().type === "OPEN_CASH_REGISTER" && operationSnap.data().actorUid === ctx.uid, "already-exists", "Chave já utilizada.");
      return operationSnap.data().result;
    }
    const activeRef = db.doc(`companies/${ctx.companyId}/cash_registers/active_register`);
    const activeSnap = await transaction.get(activeRef);
    assert(!activeSnap.exists || activeSnap.data().isOpen !== true, "already-exists", "Já existe um caixa aberto.");
    const registerRef = db.collection(`companies/${ctx.companyId}/cash_registers`).doc();
    const register = { documentId: registerRef.id, initialBalanceInCents, isOpen: true, openedByUid: ctx.uid, userDisplayNameSnapshot: clean(ctx.profile.username), openingTimestamp: FieldValue.serverTimestamp(), openedAt: FieldValue.serverTimestamp() };
    transaction.create(registerRef, register);
    transaction.set(activeRef, { ...register, registerDocumentId: registerRef.id });
    const result = { cashRegisterId: registerRef.id };
    transaction.create(operationRef, { type: "OPEN_CASH_REGISTER", actorUid: ctx.uid, result, createdAt: FieldValue.serverTimestamp() });
    audit(transaction, ctx, "CASH_REGISTER_OPENED", "cash_register", registerRef.id, clean(data.idempotencyKey), { initialBalanceInCents });
    return result;
  });
});

exports.closeCashRegister = callable(async function closeCashRegister(request) {
  const data = request.data || {};
  const closingBalanceInCents = cents(data.closingBalanceInCents, "Saldo final");
  const key = clean(data.idempotencyKey);
  assert(/^[A-Za-z0-9_-]{16,128}$/.test(key), "invalid-argument", "Chave de idempotência inválida.");
  return db.runTransaction(async (transaction) => {
    const ctx = await context(request, data.companyId, transaction, ["OPERATOR", "ADMIN", "MASTER_ADMIN"]);
    const operationRef = db.doc(`companies/${ctx.companyId}/operations/${key}`);
    const operationSnap = await transaction.get(operationRef);
    if (operationSnap.exists) {
      assert(operationSnap.data().type === "CLOSE_CASH_REGISTER" && operationSnap.data().actorUid === ctx.uid, "already-exists", "Chave já utilizada.");
      return operationSnap.data().result;
    }
    const activeRef = db.doc(`companies/${ctx.companyId}/cash_registers/active_register`);
    const activeSnap = await transaction.get(activeRef);
    assert(activeSnap.exists && activeSnap.data().isOpen === true, "failed-precondition", "Não existe caixa aberto.");
    const registerId = clean(activeSnap.data().registerDocumentId || activeSnap.data().id);
    assert(!data.cashRegisterId || clean(data.cashRegisterId) === registerId, "failed-precondition", "O caixa ativo mudou.");
    const registerRef = db.doc(`companies/${ctx.companyId}/cash_registers/${registerId}`);
    transaction.update(registerRef, { isOpen: false, closingBalanceInCents, closedByUid: ctx.uid, closedAt: FieldValue.serverTimestamp() });
    transaction.set(activeRef, { isOpen: false, registerDocumentId: registerId, closedByUid: ctx.uid, closedAt: FieldValue.serverTimestamp() });
    const result = { cashRegisterId: registerId };
    transaction.create(operationRef, { type: "CLOSE_CASH_REGISTER", actorUid: ctx.uid, result, createdAt: FieldValue.serverTimestamp() });
    audit(transaction, ctx, "CASH_REGISTER_CLOSED", "cash_register", registerId, clean(data.idempotencyKey), { closingBalanceInCents });
    return result;
  });
});

exports.adjustStock = callable(async function adjustStock(request) {
  const data = request.data || {};
  const type = clean(data.type).toUpperCase();
  assert(["ENTRY", "EXIT"].includes(type), "invalid-argument", "Tipo de ajuste inválido.");
  const quantity = positiveQuantity(data.quantity);
  const key = clean(data.idempotencyKey);
  assert(/^[A-Za-z0-9_-]{16,128}$/.test(key), "invalid-argument", "Chave de idempotência inválida.");
  assert(clean(data.reason).length >= 3, "invalid-argument", "Informe o motivo.");
  return db.runTransaction(async (transaction) => {
    const ctx = await context(request, data.companyId, transaction, ["ADMIN", "MASTER_ADMIN"]);
    const operationRef = db.doc(`companies/${ctx.companyId}/operations/${key}`);
    const operationSnap = await transaction.get(operationRef);
    if (operationSnap.exists) {
      assert(operationSnap.data().type === "ADJUST_STOCK" && operationSnap.data().actorUid === ctx.uid, "already-exists", "Chave já utilizada.");
      return operationSnap.data().result;
    }
    const productRef = db.doc(`companies/${ctx.companyId}/products/${clean(data.productId)}`);
    const snap = await transaction.get(productRef);
    assert(snap.exists && snap.data().isDeleted !== true, "not-found", "Produto não encontrado.");
    const delta = type === "EXIT" ? -quantity : quantity;
    const stockQuantity = (Number(snap.data().stockQuantity) || 0) + delta;
    assert(stockQuantity >= 0, "failed-precondition", "Estoque insuficiente.");
    transaction.update(productRef, { stockQuantity, updatedAt: FieldValue.serverTimestamp() });
    const movementRef = db.collection(`companies/${ctx.companyId}/stock_movements`).doc();
    transaction.create(movementRef, { documentId: movementRef.id, productId: snap.id, productNameSnapshot: clean(snap.data().name), quantity: delta, type, reason: clean(data.reason), userUid: ctx.uid, timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
    const result = { productId: snap.id, stockQuantity };
    transaction.create(operationRef, { type: "ADJUST_STOCK", actorUid: ctx.uid, result, createdAt: FieldValue.serverTimestamp() });
    audit(transaction, ctx, "STOCK_ADJUSTED", "product", snap.id, clean(data.idempotencyKey), { type, quantity, reason: clean(data.reason) });
    return result;
  });
});

exports.createFinancialMovement = callable(async function createFinancialMovement(request) {
  const data = request.data || {};
  const kind = clean(data.kind).toUpperCase();
  assert(["ENTRY", "EXIT"].includes(kind), "invalid-argument", "Tipo de movimento inválido.");
  const amountInCents = cents(data.amountInCents, "Valor", false);
  const key = clean(data.idempotencyKey);
  assert(/^[A-Za-z0-9_-]{16,128}$/.test(key), "invalid-argument", "Chave de idempotência inválida.");
  const paymentMethod = canonicalPayment(data.paymentMethod);
  assert(clean(data.description).length >= 3, "invalid-argument", "Informe a descrição.");
  return db.runTransaction(async (transaction) => {
    const ctx = await context(request, data.companyId, transaction, ["OPERATOR", "ADMIN", "MASTER_ADMIN"]);
    const operationRef = db.doc(`companies/${ctx.companyId}/operations/${key}`);
    const operationSnap = await transaction.get(operationRef);
    if (operationSnap.exists) {
      assert(operationSnap.data().type === `FINANCIAL_${kind}` && operationSnap.data().actorUid === ctx.uid, "already-exists", "Chave já utilizada.");
      return operationSnap.data().result;
    }
    const activeRef = db.doc(`companies/${ctx.companyId}/cash_registers/active_register`);
    const activeSnap = await transaction.get(activeRef);
    assert(activeSnap.exists && activeSnap.data().isOpen === true, "failed-precondition", "Abra o caixa antes de registrar movimentos.");
    const registerId = clean(activeSnap.data().registerDocumentId || activeSnap.data().id);
    assert(!data.cashRegisterId || clean(data.cashRegisterId) === registerId, "failed-precondition", "O caixa ativo mudou.");
    const collectionName = kind === "ENTRY" ? "financial_entries" : "financial_exits";
    const ref = db.collection(`companies/${ctx.companyId}/${collectionName}`).doc();
    transaction.create(ref, {
      documentId: ref.id, kind, description: clean(data.description), category: clean(data.category) || null,
      amountInCents, paymentMethod, cashRegisterId: registerId, userUid: ctx.uid,
      userDisplayNameSnapshot: clean(ctx.profile.username), isCancelled: false, timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp()
    });
    const result = { documentId: ref.id };
    transaction.create(operationRef, { type: `FINANCIAL_${kind}`, actorUid: ctx.uid, result, createdAt: FieldValue.serverTimestamp() });
    audit(transaction, ctx, `FINANCIAL_${kind}_CREATED`, "financial_movement", ref.id, clean(data.idempotencyKey), { amountInCents });
    return result;
  });
});

exports.setCancellationPassword = callable(async function setCancellationPassword(request) {
  const data = request.data || {};
  const ctx = await context(request, data.companyId, null, ["MASTER_ADMIN"]);
  const password = clean(data.password);
  assert(password.length >= 6 && password.length <= 128, "invalid-argument", "A senha deve ter entre 6 e 128 caracteres.");
  const passwordHash = await bcrypt.hash(password, 12);
  await db.doc(`companies/${ctx.companyId}/private_settings/cancellation`).set({ passwordHash, failedAttempts: 0, updatedAt: FieldValue.serverTimestamp(), updatedByUid: ctx.uid }, { merge: true });
  await db.collection(`companies/${ctx.companyId}/audit_logs`).add({ action: "CANCELLATION_PASSWORD_CHANGED", targetType: "private_setting", targetId: "cancellation", actorUid: ctx.uid, actorRole: ctx.role, result: "SUCCESS", timestamp: FieldValue.serverTimestamp() });
  return { success: true };
});
exports.changeCancellationPassword = exports.setCancellationPassword;

async function createCompanyUserImpl(request) {
  const data = request.data || {};
  const ctx = await context(request, data.companyId, null, ["ADMIN", "MASTER_ADMIN"]);
  const username = clean(data.username);
  const password = clean(data.password);
  const role = clean(data.role || "OPERATOR").toUpperCase();
  assert(username.length >= 3 && username.length <= 80, "invalid-argument", "Usuário inválido.");
  assert(password.length >= 6 && password.length <= 128, "invalid-argument", "Senha inválida.");
  assert(["OPERATOR", "ADMIN", "MASTER_ADMIN"].includes(role), "invalid-argument", "Perfil inválido.");
  assert(ctx.role === "MASTER_ADMIN" || role === "OPERATOR", "permission-denied", "Administrador comum só pode criar operadores.");
  const normalized = username.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const aliasRef = db.doc(`login_aliases/${ctx.companyId}__${normalized}`);
  assert(!(await aliasRef.get()).exists, "already-exists", "Este usuário já existe.");
  const authEmail = `${ctx.companyId}.${Date.now()}.${Math.random().toString(36).slice(2)}@users.goregister.app`;
  const authUser = await getAuth().createUser({ email: authEmail, password, disabled: data.isActive === false, displayName: username });
  try {
    const profile = { uid: authUser.uid, companyId: ctx.companyId, empresa_id: ctx.companyId, username, usernameNormalized: normalized, authEmail, role, isActive: data.isActive !== false, createdByUid: ctx.uid, createdAt: FieldValue.serverTimestamp() };
    const batch = db.batch();
    batch.create(db.doc(`companies/${ctx.companyId}/users/${authUser.uid}`), profile);
    batch.create(aliasRef, { companyId: ctx.companyId, empresa_id: ctx.companyId, uid: authUser.uid, authEmail, username, isActive: data.isActive !== false, createdAt: FieldValue.serverTimestamp() });
    batch.create(db.collection(`companies/${ctx.companyId}/audit_logs`).doc(), { action: "USER_CREATED", targetType: "user", targetId: authUser.uid, actorUid: ctx.uid, actorRole: ctx.role, details: { role }, result: "SUCCESS", timestamp: FieldValue.serverTimestamp() });
    await batch.commit();
  } catch (error) {
    await getAuth().deleteUser(authUser.uid).catch(() => {});
    throw error;
  }
  return { uid: authUser.uid };
}
exports.createCompanyUser = callable(createCompanyUserImpl);

exports.updateCompanyUser = callable(async function updateCompanyUser(request) {
  const data = request.data || {};
  const ctx = await context(request, data.companyId, null, ["ADMIN", "MASTER_ADMIN"]);
  const uid = clean(data.uid);
  assert(uid && uid !== ctx.uid, "invalid-argument", "Usuário inválido.");
  const ref = db.doc(`companies/${ctx.companyId}/users/${uid}`);
  const snap = await ref.get();
  assert(snap.exists, "not-found", "Usuário não encontrado.");
  const current = snap.data();
  const role = clean(data.role ?? current.role).toUpperCase();
  assert(["OPERATOR", "ADMIN", "MASTER_ADMIN"].includes(role), "invalid-argument", "Perfil inválido.");
  assert(ctx.role === "MASTER_ADMIN" || (current.role === "OPERATOR" && role === "OPERATOR"), "permission-denied", "Administrador comum não pode gerenciar administradores.");
  const username = clean(data.username || current.username);
  const usernameNormalized = normalizeUsername(username);
  const oldNormalized = normalizeUsername(current.usernameNormalized || current.username);
  const batch = db.batch();
  batch.update(ref, { username, usernameNormalized, role, isActive: data.isActive !== false, updatedByUid: ctx.uid, updatedAt: FieldValue.serverTimestamp() });
  if (usernameNormalized !== oldNormalized) {
    const newAlias = db.doc(`login_aliases/${ctx.companyId}__${usernameNormalized}`);
    assert(!(await newAlias.get()).exists, "already-exists", "Este usuário já existe.");
    batch.delete(db.doc(`login_aliases/${ctx.companyId}__${oldNormalized}`));
    batch.create(newAlias, { companyId: ctx.companyId, empresa_id: ctx.companyId, uid, authEmail: current.authEmail, username, isActive: data.isActive !== false, updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  await getAuth().updateUser(uid, { disabled: data.isActive === false, displayName: username });
  return { success: true };
});

exports.disableCompanyUser = callable(async function disableCompanyUser(request) {
  const data = request.data || {}; const ctx = await context(request, data.companyId, null, ["ADMIN", "MASTER_ADMIN"]); const uid = clean(data.uid);
  assert(uid && uid !== ctx.uid, "invalid-argument", "Usuário inválido.");
  const ref = db.doc(`companies/${ctx.companyId}/users/${uid}`); const snap = await ref.get(); assert(snap.exists, "not-found", "Usuário não encontrado.");
  assert(ctx.role === "MASTER_ADMIN" || snap.data().role === "OPERATOR", "permission-denied", "Sem permissão.");
  await Promise.all([ref.update({ isActive: false, disabledByUid: ctx.uid, updatedAt: FieldValue.serverTimestamp() }), getAuth().updateUser(uid, { disabled: true })]);
  await db.collection(`companies/${ctx.companyId}/audit_logs`).add({ action: "USER_DISABLED", targetType: "user", targetId: uid, actorUid: ctx.uid, actorRole: ctx.role, result: "SUCCESS", timestamp: FieldValue.serverTimestamp() });
  return { success: true };
});
exports.deleteCompanyUser = exports.disableCompanyUser;

exports.resetCompanyUserPassword = callable(async function resetCompanyUserPassword(request) {
  const data = request.data || {}; const ctx = await context(request, data.companyId, null, ["ADMIN", "MASTER_ADMIN"]);
  const uid = clean(data.uid); const password = clean(data.password); assert(password.length >= 6 && password.length <= 128, "invalid-argument", "Senha inválida.");
  const snap = await db.doc(`companies/${ctx.companyId}/users/${uid}`).get(); assert(snap.exists, "not-found", "Usuário não encontrado.");
  assert(ctx.role === "MASTER_ADMIN" || snap.data().role === "OPERATOR", "permission-denied", "Sem permissão.");
  await getAuth().updateUser(uid, { password }); return { success: true };
});

exports.resetCompanyCancellationPassword = callable(async function resetCompanyCancellationPassword(request) {
  await platformContext(request); const companyId = clean(request.data?.companyId); const password = clean(request.data?.password);
  assert(companyId && password.length >= 6 && password.length <= 128, "invalid-argument", "Dados inválidos.");
  await db.doc(`companies/${companyId}/private_settings/cancellation`).set({ passwordHash: await bcrypt.hash(password, 12), failedAttempts: 0, updatedAt: FieldValue.serverTimestamp(), updatedByPlatformAdmin: request.auth.uid }, { merge: true });
  return { success: true };
});

exports.updateCompanyUserPassword = callable(async function updateCompanyUserPassword(request) {
  await platformContext(request); const companyId = clean(request.data?.companyId); const uid = clean(request.data?.uid); const password = clean(request.data?.password);
  assert(companyId && uid && password.length >= 6 && password.length <= 128, "invalid-argument", "Dados inválidos.");
  assert((await db.doc(`companies/${companyId}/users/${uid}`).get()).exists, "not-found", "Usuário não encontrado.");
  await getAuth().updateUser(uid, { password }); return { success: true };
});

exports.clearCompanyData = callable(async function clearCompanyData(request) {
  await platformContext(request); const companyId = clean(request.data?.companyId);
  assert(companyId && request.data?.confirmation === companyId, "invalid-argument", "Confirmação inválida.");
  const names = ["products", "sales", "categories", "suppliers", "cash_registers", "financial_entries", "financial_exits", "stock_movements", "settings", "operations", "counters"];
  let deletedDocuments = 0;
  for (const name of names) {
    const snap = await db.collection(`companies/${companyId}/${name}`).get();
    const writer = db.bulkWriter(); snap.docs.forEach((item) => { writer.delete(item.ref); deletedDocuments++; }); await writer.close();
  }
  await db.doc(`companies/${companyId}`).set({ dataClearedAt: FieldValue.serverTimestamp(), dataClearedBy: request.auth.uid }, { merge: true });
  return { success: true, deletedDocuments };
});

function normalizeUsername(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function validateCompanyPayload(data) {
  const name = clean(data.name);
  const identifier = clean(data.identifier);
  const identifierNormalized = clean(data.identifierNormalized || identifier).toLowerCase();
  const taxId = clean(data.taxId);
  const address = clean(data.address);
  const phone = clean(data.phone);
  assert(name.length >= 2 && identifierNormalized.length >= 2, "invalid-argument", "Nome ou identificador inválido.");
  assert(address.length >= 5 && phone.length >= 8, "invalid-argument", "Endereço ou telefone inválido.");
  return { name, identifier, identifierNormalized, taxId, taxIdNormalized: clean(data.taxIdNormalized), address, phone, receiptFooter: clean(data.receiptFooter) || "Obrigado pela preferência!" };
}

exports.platformSaveCompany = callable(async function platformSaveCompany(request) {
  const actor = await platformContext(request);
  const data = request.data || {};
  const payload = validateCompanyPayload(data);
  const companyId = clean(data.companyId);
  if (companyId) {
    const ref = db.doc(`companies/${companyId}`);
    assert((await ref.get()).exists, "not-found", "Empresa não encontrada.");
    await ref.update({ ...payload, isActive: data.isActive !== false, updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
    return { companyId };
  }
  const password = clean(data.adminPassword);
  const username = clean(data.adminUsername);
  assert(password.length >= 6 && username.length >= 3, "invalid-argument", "Administrador inicial inválido.");
  const ref = db.collection("companies").doc();
  await ref.create({ ...payload, isActive: true, createdAt: FieldValue.serverTimestamp(), createdByUid: actor.uid });
  const normalized = normalizeUsername(username);
  const authEmail = `${ref.id}.${Date.now()}.${Math.random().toString(36).slice(2)}@users.goregister.app`;
  let authUser;
  try {
    authUser = await getAuth().createUser({ email: authEmail, password, displayName: username });
    const batch = db.batch();
    batch.create(db.doc(`companies/${ref.id}/users/${authUser.uid}`), {
      uid: authUser.uid, companyId: ref.id, empresa_id: ref.id, companyName: payload.name,
      username, usernameNormalized: normalized, authEmail, role: "MASTER_ADMIN", isActive: true,
      createdByUid: actor.uid, createdAt: FieldValue.serverTimestamp()
    });
    batch.create(db.doc(`login_aliases/${ref.id}__${normalized}`), {
      companyId: ref.id, empresa_id: ref.id, uid: authUser.uid, authEmail, username,
      isActive: true, createdAt: FieldValue.serverTimestamp()
    });
    batch.create(db.doc(`public_companies/${payload.identifierNormalized}`), {
      alias: payload.identifierNormalized, name: payload.name, companyId: ref.id, isActive: true
    });
    await batch.commit();
  } catch (error) {
    if (authUser) await getAuth().deleteUser(authUser.uid).catch(() => {});
    await ref.delete().catch(() => {});
    throw error;
  }
  return { companyId: ref.id };
});

exports.platformSaveAdministrator = callable(async function platformSaveAdministrator(request) {
  const actor = await platformContext(request);
  const data = request.data || {};
  const uid = clean(data.uid);
  const name = clean(data.name);
  assert(name.length >= 2, "invalid-argument", "Nome inválido.");
  if (uid) {
    assert(uid !== actor.uid || data.isActive !== false, "failed-precondition", "Você não pode desativar a própria conta.");
    await db.doc(`platform_admins/${uid}`).update({ name, isActive: data.isActive !== false, updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
    await getAuth().updateUser(uid, { disabled: data.isActive === false, displayName: name });
    return { uid };
  }
  const email = clean(data.email).toLowerCase();
  const password = clean(data.password);
  assert(email.includes("@") && password.length >= 6, "invalid-argument", "E-mail ou senha inválidos.");
  const user = await getAuth().createUser({ email, password, displayName: name });
  try {
    await db.doc(`platform_admins/${user.uid}`).create({ name, email, isActive: true, createdAt: FieldValue.serverTimestamp(), createdByUid: actor.uid });
  } catch (error) {
    await getAuth().deleteUser(user.uid).catch(() => {});
    throw error;
  }
  return { uid: user.uid };
});

exports.platformDisableAdministrator = callable(async function platformDisableAdministrator(request) {
  const actor = await platformContext(request);
  const uid = clean(request.data?.uid);
  assert(uid && uid !== actor.uid, "failed-precondition", "Você não pode desativar a própria conta.");
  await Promise.all([
    db.doc(`platform_admins/${uid}`).update({ isActive: false, disabledAt: FieldValue.serverTimestamp(), disabledByUid: actor.uid }),
    getAuth().updateUser(uid, { disabled: true })
  ]);
  return { success: true };
});

exports.platformSaveCompanyUser = callable(async function platformSaveCompanyUser(request) {
  const actor = await platformContext(request);
  const data = request.data || {};
  const companyId = clean(data.companyId);
  const company = await db.doc(`companies/${companyId}`).get();
  assert(company.exists, "not-found", "Empresa não encontrada.");
  const uid = clean(data.uid);
  const username = clean(data.username);
  const role = clean(data.role || "OPERATOR").toUpperCase();
  assert(username.length >= 3 && ["OPERATOR", "ADMIN", "MASTER_ADMIN"].includes(role), "invalid-argument", "Dados do usuário inválidos.");
  if (uid) {
    const ref = db.doc(`companies/${companyId}/users/${uid}`);
    const currentSnap = await ref.get();
    assert(currentSnap.exists, "not-found", "Usuário não encontrado.");
    const current = currentSnap.data();
    const usernameNormalized = normalizeUsername(username);
    const oldNormalized = normalizeUsername(current.usernameNormalized || current.username);
    const batch = db.batch();
    batch.update(ref, { username, usernameNormalized, role, isActive: data.isActive !== false, updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
    if (usernameNormalized !== oldNormalized) {
      const newAlias = db.doc(`login_aliases/${companyId}__${usernameNormalized}`);
      assert(!(await newAlias.get()).exists, "already-exists", "Este usuário já existe.");
      batch.delete(db.doc(`login_aliases/${companyId}__${oldNormalized}`));
      batch.create(newAlias, { companyId, empresa_id: companyId, uid, authEmail: current.authEmail, username, isActive: data.isActive !== false, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
    await getAuth().updateUser(uid, { disabled: data.isActive === false, displayName: username, ...(clean(data.password) ? { password: clean(data.password) } : {}) });
    return { uid };
  }
  const password = clean(data.password);
  assert(password.length >= 6, "invalid-argument", "Senha inválida.");
  const normalized = normalizeUsername(username);
  const aliasRef = db.doc(`login_aliases/${companyId}__${normalized}`);
  assert(!(await aliasRef.get()).exists, "already-exists", "Este usuário já existe.");
  const authEmail = `${companyId}.${Date.now()}.${Math.random().toString(36).slice(2)}@users.goregister.app`;
  const user = await getAuth().createUser({ email: authEmail, password, disabled: data.isActive === false, displayName: username });
  try {
    const batch = db.batch();
    batch.create(db.doc(`companies/${companyId}/users/${user.uid}`), { uid: user.uid, companyId, empresa_id: companyId, companyName: company.data().name, username, usernameNormalized: normalized, authEmail, role, isActive: data.isActive !== false, createdAt: FieldValue.serverTimestamp(), createdByUid: actor.uid });
    batch.create(aliasRef, { companyId, empresa_id: companyId, uid: user.uid, authEmail, username, isActive: data.isActive !== false, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
  } catch (error) {
    await getAuth().deleteUser(user.uid).catch(() => {});
    throw error;
  }
  return { uid: user.uid };
});

exports.platformDisableCompanyUser = callable(async function platformDisableCompanyUser(request) {
  const actor = await platformContext(request);
  const companyId = clean(request.data?.companyId);
  const uid = clean(request.data?.uid);
  const ref = db.doc(`companies/${companyId}/users/${uid}`);
  assert((await ref.get()).exists, "not-found", "Usuário não encontrado.");
  await Promise.all([
    ref.update({ isActive: false, disabledAt: FieldValue.serverTimestamp(), disabledByUid: actor.uid }),
    getAuth().updateUser(uid, { disabled: true })
  ]);
  return { success: true };
});

exports.deactivateCompany = callable(async function deactivateCompany(request) {
  const actor = await platformContext(request);
  const companyId = clean(request.data?.companyId);
  assert(companyId && request.data?.confirmation === companyId, "invalid-argument", "Confirmação inválida.");
  const companyRef = db.doc(`companies/${companyId}`);
  assert((await companyRef.get()).exists, "not-found", "Empresa não encontrada.");
  const users = await db.collection(`companies/${companyId}/users`).get();
  await Promise.all(users.docs.map(async (user) => {
    await getAuth().updateUser(user.id, { disabled: true }).catch((error) => logger.warn("disable_auth_user_failed", { companyId, uid: user.id, code: error.code }));
  }));
  const batch = db.batch();
  batch.update(companyRef, { isActive: false, deactivatedAt: FieldValue.serverTimestamp(), deactivatedByUid: actor.uid });
  users.docs.forEach((user) => batch.update(user.ref, { isActive: false, disabledAt: FieldValue.serverTimestamp(), disabledByUid: actor.uid }));
  batch.create(db.collection(`companies/${companyId}/audit_logs`).doc(), { action: "COMPANY_DEACTIVATED", targetType: "company", targetId: companyId, actorUid: actor.uid, actorRole: actor.role, result: "SUCCESS", timestamp: FieldValue.serverTimestamp() });
  await batch.commit();
  return { success: true, disabledUsers: users.size };
});

exports.permanentlyDeleteCompany = callable(async function permanentlyDeleteCompany(request) {
  const actor = await platformContext(request);
  const companyId = clean(request.data?.companyId);
  assert(companyId && request.data?.confirmation === `DELETE:${companyId}`, "invalid-argument", "Confirmação forte inválida.");
  const companyRef = db.doc(`companies/${companyId}`);
  const company = await companyRef.get();
  assert(company.exists && company.data().isActive === false, "failed-precondition", "Desative a empresa antes da exclusão definitiva.");
  const users = await db.collection(`companies/${companyId}/users`).get();
  await db.collection("platform_audit_logs").add({
    action: "COMPANY_PERMANENT_DELETE_STARTED", targetType: "company", targetId: companyId,
    actorUid: actor.uid, result: "STARTED", timestamp: FieldValue.serverTimestamp()
  });
  for (const user of users.docs) {
    await getAuth().deleteUser(user.id).catch((error) => {
      if (error.code !== "auth/user-not-found") throw error;
    });
  }
  await db.recursiveDelete(companyRef);
  const aliases = await db.collection("login_aliases").where("empresa_id", "==", companyId).get();
  const writer = db.bulkWriter();
  aliases.docs.forEach((alias) => writer.delete(alias.ref));
  await writer.close();
  await db.collection("platform_audit_logs").add({
    action: "COMPANY_PERMANENT_DELETED", targetType: "company", targetId: companyId,
    actorUid: actor.uid, result: "SUCCESS", timestamp: FieldValue.serverTimestamp()
  });
  return { success: true, deletedUsers: users.size, deletedAliases: aliases.size };
});

exports.softDeleteProduct = callable(async function softDeleteProduct(request) {
  const data = request.data || {};
  const productId = clean(data.productId);
  return db.runTransaction(async (transaction) => {
    const ctx = await context(request, data.companyId, transaction, ["ADMIN", "MASTER_ADMIN"]);
    const ref = db.doc(`companies/${ctx.companyId}/products/${productId}`);
    const snap = await transaction.get(ref);
    assert(snap.exists, "not-found", "Produto não encontrado.");
    if (snap.data().isDeleted === true) return { alreadyDeleted: true };
    transaction.update(ref, { isDeleted: true, isActive: false, deletedAt: FieldValue.serverTimestamp(), deletedByUid: ctx.uid, updatedAt: FieldValue.serverTimestamp() });
    audit(transaction, ctx, "PRODUCT_SOFT_DELETED", "product", productId, clean(data.idempotencyKey), {});
    return { alreadyDeleted: false };
  });
});
