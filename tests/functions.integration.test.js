"use strict";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "go-register-functions-test";
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const requireFromFunctions = createRequire(require.resolve("../functions/index"));
const { getFirestore, Timestamp } = requireFromFunctions("firebase-admin/firestore");
const { getAuth } = requireFromFunctions("firebase-admin/auth");
const bcrypt = requireFromFunctions("bcryptjs");
const backend = require("../functions/index");

const db = getFirestore();
const companyId = "company-test";
const operator = { uid: "operator-uid" };
const admin = { uid: "admin-uid" };
const call = (callable, auth, data) => callable.run({ auth: { uid: auth.uid, token: {} }, data, rawRequest: {} });

test.beforeEach(async () => {
  await db.recursiveDelete(db.collection("companies"));
  await db.doc(`companies/${companyId}`).set({ isActive: true });
  await db.doc(`companies/${companyId}/users/${operator.uid}`).set({ username: "operador", role: "OPERATOR", isActive: true, companyId });
  await db.doc(`companies/${companyId}/users/${admin.uid}`).set({ username: "admin", role: "MASTER_ADMIN", isActive: true, companyId });
  await db.doc(`companies/${companyId}/products/product-a`).set({ name: "Produto A", sellingPriceInCents: 299, stockQuantity: 3, hasStockControl: true, isActive: true });
  await db.doc(`companies/${companyId}/cash_registers/register-a`).set({ isOpen: true, openedAt: Timestamp.now() });
  await db.doc(`companies/${companyId}/cash_registers/active_register`).set({ isOpen: true, registerDocumentId: "register-a" });
});

test.after(async () => {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/accounts`, { method: "DELETE" });
  assert.ok(response.ok);
});

test("venda usa preço real, UID autenticado, centavos e idempotência", async () => {
  const data = { companyId, cashRegisterId: "register-a", paymentMethod: "CREDIT_CREDIT", discountInCents: 0, items: [{ productId: "product-a", quantity: 1 }], idempotencyKey: "sale-idempotency-0001" };
  const first = await call(backend.finalizeSale, operator, data);
  const repeated = await call(backend.finalizeSale, operator, data);
  assert.deepEqual(repeated, first);
  assert.equal(first.totalAmountInCents, 299);
  assert.equal(first.paymentMethod, "CREDIT_CARD");
  const sale = (await db.doc(`companies/${companyId}/sales/${first.saleId}`).get()).data();
  assert.equal(sale.userUid, operator.uid);
  assert.equal(sale.totalAmountInCents, 299);
  assert.equal((await db.doc(`companies/${companyId}/products/product-a`).get()).data().stockQuantity, 2);
  assert.equal((await db.collection(`companies/${companyId}/sales`).get()).size, 1);
});

test("vendas concorrentes nunca deixam estoque negativo", async () => {
  const base = { companyId, cashRegisterId: "register-a", paymentMethod: "PIX", discountInCents: 0, items: [{ productId: "product-a", quantity: 2 }] };
  const results = await Promise.allSettled([
    call(backend.finalizeSale, operator, { ...base, idempotencyKey: "concurrent-sale-0001" }),
    call(backend.finalizeSale, operator, { ...base, idempotencyKey: "concurrent-sale-0002" })
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await db.doc(`companies/${companyId}/products/product-a`).get()).data().stockQuantity, 1);
  assert.equal((await db.collection(`companies/${companyId}/sales`).get()).size, 1);
});

test("caixa fechado e usuário desativado impedem venda", async () => {
  await db.doc(`companies/${companyId}/cash_registers/active_register`).update({ isOpen: false });
  await assert.rejects(() => call(backend.finalizeSale, operator, { companyId, paymentMethod: "CASH", discountInCents: 0, items: [{ productId: "product-a", quantity: 1 }], idempotencyKey: "closed-register-0001" }));
  await db.doc(`companies/${companyId}/users/${operator.uid}`).update({ isActive: false });
  await assert.rejects(() => call(backend.openCashRegister, operator, { companyId, initialBalanceInCents: 0, idempotencyKey: "inactive-user-0001" }));
});

test("cancelamento restaura estoque exatamente uma vez e exige permissão", async () => {
  await db.doc(`companies/${companyId}/private_settings/cancellation`).set({ passwordHash: await bcrypt.hash("senha-segura", 4), failedAttempts: 0 });
  const sale = await call(backend.finalizeSale, operator, {
    companyId, cashRegisterId: "register-a", paymentMethod: "CASH", discountInCents: 0,
    items: [{ productId: "product-a", quantity: 2 }], idempotencyKey: "sale-for-cancel-0001"
  });
  await assert.rejects(() => call(backend.cancelSale, operator, {
    companyId, saleId: sale.saleId, password: "senha-segura", reason: "teste", idempotencyKey: "cancel-operation-0001"
  }));
  await assert.rejects(() => call(backend.cancelSale, admin, {
    companyId, saleId: sale.saleId, password: "senha-errada", reason: "teste", idempotencyKey: "cancel-operation-0002"
  }));
  await db.doc(`companies/${companyId}/private_settings/cancellation`).update({ failedAttempts: 0, lockUntil: Timestamp.fromMillis(0) });
  const first = await call(backend.cancelSale, admin, {
    companyId, saleId: sale.saleId, password: "senha-segura", reason: "teste", idempotencyKey: "cancel-operation-0003"
  });
  const repeated = await call(backend.cancelSale, admin, {
    companyId, saleId: sale.saleId, password: "senha-segura", reason: "teste", idempotencyKey: "cancel-operation-0004"
  });
  assert.equal(first.alreadyCancelled, false);
  assert.equal(repeated.alreadyCancelled, true);
  assert.equal((await db.doc(`companies/${companyId}/products/product-a`).get()).data().stockQuantity, 3);
  assert.equal((await db.collection(`companies/${companyId}/stock_movements`).where("type", "==", "ENTRY").get()).size, 1);
});

test("criação de usuário usa Authentication e não salva senha no Firestore", async () => {
  const result = await call(backend.createCompanyUser, admin, {
    companyId, username: "novo operador", password: "senha-forte", role: "OPERATOR", isActive: true
  });
  const authUser = await getAuth().getUser(result.uid);
  const profile = (await db.doc(`companies/${companyId}/users/${result.uid}`).get()).data();
  assert.equal(authUser.disabled, false);
  assert.equal(profile.role, "OPERATOR");
  assert.equal(profile.password, undefined);
  assert.equal(profile.passwordHash, undefined);
});
