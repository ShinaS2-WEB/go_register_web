const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { verifyCancellationPasswordHash, createCancellationPasswordHash } = require("./src/cancellation");
const { validDocumentId, activeProfile } = require("./src/validation");
const { createProtection } = require("./src/protection");

initializeApp();
const protectedCall = createProtection({ onCall, HttpsError, getFirestore });

const tenantCollections = ["products", "sales", "categories", "suppliers", "cash_registers", "financial_entries", "financial_exits", "stock_movements", "settings"];

async function requirePlatformAdministrator(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login como administrador da plataforma.");
  const administratorSnapshot = await getFirestore().doc(`platform_admins/${request.auth.uid}`).get();
  if (!administratorSnapshot.exists || !activeProfile(administratorSnapshot.data())) {
    throw new HttpsError("permission-denied", "Esta conta não possui autorização administrativa.");
  }
}

async function requireCompany(companyId) {
  const cleanCompanyId = String(companyId || "").trim();
  if (!validDocumentId(cleanCompanyId)) throw new HttpsError("invalid-argument", "Empresa inválida.");
  const companySnapshot = await getFirestore().doc(`companies/${cleanCompanyId}`).get();
  if (!companySnapshot.exists) throw new HttpsError("not-found", "Empresa não encontrada.");
  return cleanCompanyId;
}

async function requireActiveCompanyUser(request, companyId) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const cleanCompanyId = await requireCompany(companyId);
  const database = getFirestore();
  const [companySnapshot, userSnapshot] = await Promise.all([
    database.doc(`companies/${cleanCompanyId}`).get(),
    database.doc(`companies/${cleanCompanyId}/users/${request.auth.uid}`).get(),
  ]);
  const company = companySnapshot.data() || {};
  const user = userSnapshot.data() || {};
  const belongsToCompany = (!user.companyId || user.companyId === cleanCompanyId)
    && (!user.empresa_id || user.empresa_id === cleanCompanyId);
  if (company.isActive !== true || company.dataDeletionInProgress === true || !userSnapshot.exists || !activeProfile(user) || !belongsToCompany) {
    throw new HttpsError("permission-denied", "Usuário ou empresa sem autorização.");
  }
  return cleanCompanyId;
}

exports.updateCompanyUserPassword = protectedCall("updateCompanyUserPassword", requirePlatformAdministrator, async (request) => {
  const database = getFirestore();
  const uid = String(request.data?.uid || "").trim();
  const password = String(request.data?.password || "");
  if (!validDocumentId(uid)) throw new HttpsError("invalid-argument", "Usuário inválido.");
  if (password.length < 6 || password.length > 128) {
    throw new HttpsError("invalid-argument", "A senha deve ter entre 6 e 128 caracteres.");
  }

  const companyId = String(request.data?.companyId || "").trim();
  if (!validDocumentId(companyId)) throw new HttpsError("invalid-argument", "Empresa inválida.");
  const userReference = database.doc(`companies/${companyId}/users/${uid}`);
  const userSnapshot = await userReference.get();
  if (!userSnapshot.exists || userSnapshot.data().empresa_id !== companyId
      || (userSnapshot.data().companyId && userSnapshot.data().companyId !== companyId)) {
    throw new HttpsError("not-found", "Usuário de empresa não encontrado.");
  }

  await getAuth().updateUser(uid, { password });
  await getAuth().revokeRefreshTokens(uid);
  await userReference.update({
    passwordUpdatedAt: FieldValue.serverTimestamp(),
    passwordUpdatedBy: request.auth.uid,
    updatedAt: FieldValue.serverTimestamp()
  });

  return { success: true };
});

exports.resetCompanyCancellationPassword = protectedCall("resetCompanyCancellationPassword", requirePlatformAdministrator, async (request) => {
  const companyId = await requireCompany(request.data?.companyId);
  const password = String(request.data?.password || "");
  if (password.length < 6 || password.length > 128) throw new HttpsError("invalid-argument", "A senha deve ter entre 6 e 128 caracteres.");
  const passwordHash = createCancellationPasswordHash(password);
  await getFirestore().doc(`companies/${companyId}/settings/cancellation`).set({id:"cancellation",empresa_id:companyId,passwordHash,updatedAt:Date.now(),updatedByPlatformAdmin:request.auth.uid},{merge:true});
  return { success: true };
});

async function requireCancellationAdministrator(request) {
  const companyId = await requireActiveCompanyUser(request, request.data?.companyId);
  const profile = await getFirestore().doc(`companies/${companyId}/users/${request.auth.uid}`).get();
  if (!["ADMIN", "MASTER_ADMIN"].includes(profile.data()?.role)) {
    throw new HttpsError("permission-denied", "Somente administradores podem cancelar lançamentos.");
  }
  return companyId;
}

exports.cancelReceivable = protectedCall("cancelReceivable", requireCancellationAdministrator, async (request, companyId) => {
  const receivableId = String(request.data?.receivableId || "").trim();
  const password = String(request.data?.password || "");
  if (!validDocumentId(receivableId, 64)) throw new HttpsError("invalid-argument", "Lançamento inválido.");
  if (!password || password.length > 128) throw new HttpsError("invalid-argument", "Senha de cancelamento inválida.");

  const database = getFirestore();
  const [entitlementSnapshot, cancellationSnapshot] = await Promise.all([
    database.doc(`companies/${companyId}/entitlements/accounts_receivable`).get(),
    database.doc(`companies/${companyId}/settings/cancellation`).get(),
  ]);
  if (!entitlementSnapshot.exists) throw new HttpsError("failed-precondition", "Módulo de contas a receber não configurado.");
  const storedHash = cancellationSnapshot.data()?.passwordHash;
  if (!storedHash) throw new HttpsError("failed-precondition", "Senha de cancelamento não configurada.");
  if (!verifyCancellationPasswordHash(password, storedHash)) {
    throw new HttpsError("permission-denied", "Senha de cancelamento inválida.");
  }

  const receivableReference = database.doc(`companies/${companyId}/receivables/${receivableId}`);
  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(receivableReference);
    if (!snapshot.exists) throw new HttpsError("not-found", "Lançamento não encontrado.");
    const receivable = snapshot.data() || {};
    if (String(receivable.status || "").toUpperCase() === "CANCELLED") {
      return { success: true, alreadyCancelled: true };
    }
    transaction.update(receivableReference, {
      status: "CANCELLED",
      updatedAt: Date.now(),
      updatedByUid: request.auth.uid,
    });
    return { success: true, alreadyCancelled: false };
  });
});

exports.clearCompanyData = protectedCall("clearCompanyData", requirePlatformAdministrator, async (request) => {
  const companyId = await requireCompany(request.data?.companyId);
  if (request.data?.confirmation !== companyId) throw new HttpsError("invalid-argument", "Confirmação de exclusão inválida.");
  const database = getFirestore();
  const writer = database.bulkWriter();
  let deletedDocuments = 0;
  for (const collectionName of tenantCollections) {
    const snapshot = await database.collection(`companies/${companyId}/${collectionName}`).get();
    snapshot.docs.forEach((documentSnapshot) => { writer.delete(documentSnapshot.ref); deletedDocuments += 1; });
  }
  await writer.close();
  await database.doc(`companies/${companyId}`).set({dataClearedAt:FieldValue.serverTimestamp(),dataClearedBy:request.auth.uid,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return { success: true, deletedDocuments };
});
