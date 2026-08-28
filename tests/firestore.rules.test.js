"use strict";

// Executado contra o Emulator por `npm run test:rules`.
const { readFileSync } = require("node:fs");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const test = require("node:test");

let env;

function customerData(companyId, customerId, uid, now = Date.now()) {
  return {
    id: customerId,
    name: "Cliente Teste",
    phone: "",
    document: "",
    notes: "",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdByUid: uid,
    updatedByUid: uid,
    empresa_id: companyId,
    companyId
  };
}

function receivableData(companyId, receivableId, customerId, uid, now = Date.now()) {
  return {
    id: receivableId,
    customerId,
    customerName: "Cliente Teste",
    description: "Conta de teste",
    originalAmountCents: 3300,
    outstandingAmountCents: 3300,
    createdAt: now,
    dueAt: now + 86400000,
    status: "OPEN",
    lastPaymentId: "",
    lastPaymentAt: 0,
    createdByUid: uid,
    updatedAt: now,
    updatedByUid: uid,
    empresa_id: companyId,
    companyId
  };
}

function androidUpdateData(uid, now = Date.now(), overrides = {}) {
  return {
    schemaVersion: 1,
    packageName: "com.lucas.goregister",
    latestVersionCode: 9,
    minimumVersionCode: 8,
    latestVersionName: "1.8",
    apkUrl: "https://github.com/ShinaS2-WEB/go_Register_apk/releases/download/v1.8/GO_REGISTER.apk",
    sha256: "A".repeat(64),
    releaseNotes: "Atualizador automático",
    publishedAt: now,
    updatedAt: now,
    updatedByUid: uid,
    enabled: true,
    ...overrides
  };
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "go-register-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = Date.now() - 1000;
    await db.doc("companies/a").set({ isActive: true });
    await db.doc("companies/b").set({ isActive: true });
    await db.doc("companies/c").set({ isActive: true });
    await db.doc("companies/d").set({ isActive: true });
    await db.doc("companies/a/users/operator").set({ role: "OPERATOR", isActive: true, companyId: "a" });
    await db.doc("companies/a/users/operator-restore").set({ role: "OPERATOR", isActive: true, companyId: "a" });
    await db.doc("companies/a/users/admin").set({ role: "ADMIN", isActive: true, companyId: "a" });
    await db.doc("companies/a/users/master").set({ role: "MASTER_ADMIN", isActive: true, companyId: "a" });
    await db.doc("companies/a/users/inactive").set({ role: "ADMIN", isActive: false, companyId: "a" });
    await db.doc("companies/b/users/operator-b").set({ role: "OPERATOR", isActive: true, companyId: "b" });
    await db.doc("companies/c/users/operator-c").set({ role: "OPERATOR", isActive: true, companyId: "c" });
    await db.doc("companies/d/users/operator-d").set({ role: "OPERATOR", isActive: true, companyId: "d" });
    await db.doc("companies/off").set({ isActive: false });
    await db.doc("companies/off/users/offuser").set({ role: "MASTER_ADMIN", isActive: true, companyId: "off" });
    await db.doc("platform_admins/platform").set({ isActive: true });
    await db.doc("companies/a/products/p").set({ name: "P", stockQuantity: 2 });
    await db.doc("companies/a/sales/s").set({ totalAmountInCents: 100 });
    await db.doc("companies/a/private_settings/cancellation").set({ passwordHash: "secret" });
    await db.doc("companies/a/entitlements/accounts_receivable").set({
      enabled: true,
      status: "ACTIVE",
      validUntil: null,
      updatedAt: now,
      updatedByUid: "platform"
    });
    await db.doc("companies/b/entitlements/accounts_receivable").set({
      enabled: true,
      status: "TRIAL",
      validUntil: now + 86400000,
      updatedAt: now,
      updatedByUid: "platform"
    });
    await db.doc("companies/c/entitlements/accounts_receivable").set({
      enabled: false,
      status: "SUSPENDED",
      validUntil: null,
      updatedAt: now,
      updatedByUid: "platform"
    });
    await db.doc("companies/a/billing/accounts_receivable").set({
      priceCents: 2990,
      billingCycle: "MONTHLY",
      nextDueAt: now + 86400000,
      notes: "Plano adicional",
      updatedAt: now,
      updatedByUid: "platform"
    });
    for (const receivableId of ["payment-ok", "payment-over-limit", "payment-integrity", "payment-corrupt"]) {
      const customerId = `customer-${receivableId}`;
      await db.doc(`companies/a/customers/${customerId}`).set(customerData("a", customerId, "operator", now));
      await db.doc(`companies/a/receivables/${receivableId}`).set(
        receivableData("a", receivableId, customerId, "operator", now)
      );
    }
    await db.doc("companies/a/receivables/payment-corrupt").update({
      outstandingAmountCents: 4000
    });
    await db.doc("companies/a/customers/customer-immutable").set(
      customerData("a", "customer-immutable", "operator", now)
    );
  });
});
test.after(async () => env?.cleanup());

test("compatibilidade Spark: raiz ativa é pública, mas raiz inativa permanece privada", async () => {
  await assertSucceeds(env.unauthenticatedContext().firestore().doc("companies/a").get());
  await assertSucceeds(env.authenticatedContext("operator").firestore().doc("companies/a").get());
  await assertSucceeds(env.authenticatedContext("operator").firestore().doc("companies/b").get());
  await assertFails(env.unauthenticatedContext().firestore().doc("companies/off").get());
});

test("compatibilidade Spark: operador grava venda e estoque, mas não administra perfil nem lê hash privado", async () => {
  const db = env.authenticatedContext("operator").firestore();
  await assertSucceeds(db.doc("companies/a/sales/new").set({ totalAmountInCents: 1 }));
  await assertSucceeds(db.doc("companies/a/products/p").update({ stockQuantity: 99 }));
  await assertFails(db.doc("companies/a/users/operator").update({ role: "MASTER_ADMIN" }));
  await assertFails(db.doc("companies/a/private_settings/cancellation").get());
});

test("compatibilidade Spark: administrador atualiza usuários e estoque, mas audit_logs segue protegido", async () => {
  const db = env.authenticatedContext("admin").firestore();
  await assertSucceeds(db.doc("companies/a/users/operator").update({ role: "MASTER_ADMIN" }));
  await assertSucceeds(db.doc("companies/a/products/p").update({ stockQuantity: 3 }));
  await assertFails(db.doc("companies/a/audit_logs/fake").set({ action: "FORGED" }));
});

test("dívida de compatibilidade: usuário ou empresa inativos perdem acesso às subcoleções", async () => {
  await assertFails(env.authenticatedContext("inactive").firestore().doc("companies/a/products/p").get());
  await assertFails(env.authenticatedContext("offuser").firestore().doc("companies/off/products/p").get());
});

test("platform admin administra raiz e cadastro global, mas não lê private_settings legado", async () => {
  const db = env.authenticatedContext("platform").firestore();
  await assertSucceeds(db.doc("companies/a").get());
  await assertSucceeds(db.doc("companies/a/products/p").get());
  await assertFails(db.doc("companies/a/private_settings/cancellation").get());
  await assertSucceeds(db.doc("companies/a").update({ name: "administrada pela plataforma" }));
  await assertSucceeds(db.doc("platform_admins/other").set({ isActive: true }));
});

test("metadados do APK são públicos para leitura, mas somente a plataforma publica", async () => {
  const platformDb = env.authenticatedContext("platform").firestore();
  const operatorDb = env.authenticatedContext("operator").firestore();
  const publicDb = env.unauthenticatedContext().firestore();
  const reference = platformDb.doc("public_config/android_update");
  const now = Date.now();

  await assertFails(operatorDb.doc("public_config/android_update").set(androidUpdateData("operator", now)));
  await assertFails(reference.set(androidUpdateData("platform", now, {apkUrl: "https://example.com/app.apk"})));
  await assertFails(reference.set(androidUpdateData("platform", now, {unexpected: true})));
  await assertSucceeds(reference.set(androidUpdateData("platform", now)));
  await assertSucceeds(publicDb.doc("public_config/android_update").get());
  await assertFails(publicDb.collection("public_config").get());
  await assertFails(reference.delete());
});

test("dívida de compatibilidade Spark: caixa e movimentos ainda aceitam escrita direta", async () => {
  const db = env.authenticatedContext("master").firestore();
  await assertSucceeds(db.doc("companies/a/cash_registers/r").set({ isOpen: true }));
  await assertSucceeds(db.doc("companies/a/financial_entries/e").set({ amountInCents: 100 }));
  await assertSucceeds(db.doc("companies/a/financial_exits/x").set({ amountInCents: 100 }));
  await assertSucceeds(db.doc("companies/a/stock_movements/m").set({ quantity: 1 }));
});

test("licença do adicional controla criação sem esconder dados já provisionados", async () => {
  const activeDb = env.authenticatedContext("operator").firestore();
  const suspendedDb = env.authenticatedContext("operator-c").firestore();
  const unprovisionedDb = env.authenticatedContext("operator-d").firestore();
  const now = Date.now();

  await assertSucceeds(activeDb.doc("companies/a/customers/customer-active-license").set(
    customerData("a", "customer-active-license", "operator", now)
  ));
  await assertSucceeds(suspendedDb.doc("companies/c/entitlements/accounts_receivable").get());
  await assertSucceeds(suspendedDb.collection("companies/c/customers").get());
  await assertFails(suspendedDb.doc("companies/c/customers/customer-suspended").set(
    customerData("c", "customer-suspended", "operator-c", now)
  ));
  await assertFails(unprovisionedDb.collection("companies/d/customers").get());
  await assertFails(unprovisionedDb.doc("companies/d/customers/customer-no-license").set(
    customerData("d", "customer-no-license", "operator-d", now)
  ));
});

test("dados de contas a receber ficam isolados por empresa", async () => {
  const companyADb = env.authenticatedContext("operator").firestore();
  const companyBDb = env.authenticatedContext("operator-b").firestore();

  await assertSucceeds(companyADb.doc("companies/a/customers/customer-immutable").get());
  await assertFails(companyADb.collection("companies/b/customers").get());
  await assertFails(companyBDb.collection("companies/a/receivables").get());
});

test("recuperação histórica exige administrador, tenant correto e sessão temporária", async () => {
  const now = Date.now();
  const oldTimestamp = now - 365 * 86400000;
  const operatorDb = env.authenticatedContext("operator-restore").firestore();
  const adminDb = env.authenticatedContext("admin").firestore();
  const session = {
    empresa_id: "a",
    companyId: "a",
    createdAt: now,
    expiresAt: now + 9 * 60 * 1000,
    createdByUid: "admin",
    backupCreatedAt: oldTimestamp
  };

  await assertFails(operatorDb.doc("companies/a/settings/backup_restore_operator-restore").set({
    ...session,
    createdByUid: "operator-restore"
  }));
  await assertSucceeds(adminDb.doc("companies/a/settings/backup_restore_admin").set(session));
  await assertSucceeds(adminDb.doc("companies/a/customers/restored-old").set(
    customerData("a", "restored-old", "operator", oldTimestamp)
  ));
  const restoredPaymentAt = oldTimestamp + 3600000;
  await assertSucceeds(adminDb.doc("companies/a/receivables/restored-receivable").set({
    ...receivableData("a", "restored-receivable", "restored-old", "operator", oldTimestamp),
    outstandingAmountCents: 0,
    status: "PAID",
    lastPaymentId: "restored-payment",
    lastPaymentAt: restoredPaymentAt,
    updatedAt: restoredPaymentAt
  }));
  await assertSucceeds(adminDb.doc("companies/a/receivable_payments/restored-payment").set({
    id: "restored-payment",
    receivableId: "restored-receivable",
    customerId: "restored-old",
    amountCents: 3300,
    paymentMethod: "PIX",
    timestamp: restoredPaymentAt,
    notes: "Pagamento recuperado",
    createdByUid: "operator",
    empresa_id: "a",
    companyId: "a"
  }));
  await assertFails(adminDb.doc("companies/a/customers/restored-wrong-tenant").set(
    customerData("b", "restored-wrong-tenant", "operator-b", oldTimestamp)
  ));
  await assertSucceeds(adminDb.doc("companies/a/settings/backup_restore_admin").delete());
  await assertFails(adminDb.doc("companies/a/customers/restored-without-session").set(
    customerData("a", "restored-without-session", "operator", oldTimestamp)
  ));
});

test("pagamento só é aceito junto da redução exata do saldo", async () => {
  const db = env.authenticatedContext("operator").firestore();
  const receivableRef = db.doc("companies/a/receivables/payment-ok");
  const paymentRef = db.doc("companies/a/receivable_payments/payment-ok-1");
  const timestamp = Date.now();
  const payment = {
    id: "payment-ok-1",
    receivableId: "payment-ok",
    customerId: "customer-payment-ok",
    amountCents: 2000,
    paymentMethod: "PIX",
    timestamp,
    notes: "Parcela",
    createdByUid: "operator",
    empresa_id: "a",
    companyId: "a"
  };

  await assertFails(paymentRef.set(payment));
  await assertFails(receivableRef.update({
    outstandingAmountCents: 1300,
    status: "PARTIAL",
    lastPaymentId: "payment-ok-1",
    lastPaymentAt: timestamp,
    updatedAt: timestamp,
    updatedByUid: "operator"
  }));

  const batch = db.batch();
  batch.set(paymentRef, payment);
  batch.update(receivableRef, {
    outstandingAmountCents: 1300,
    status: "PARTIAL",
    lastPaymentId: "payment-ok-1",
    lastPaymentAt: timestamp,
    updatedAt: timestamp,
    updatedByUid: "operator"
  });
  await assertSucceeds(batch.commit());
});

test("pagamento maior que o saldo é rejeitado mesmo em lote atômico", async () => {
  const db = env.authenticatedContext("operator").firestore();
  const timestamp = Date.now();
  const batch = db.batch();
  batch.set(db.doc("companies/a/receivable_payments/payment-too-large"), {
    id: "payment-too-large",
    receivableId: "payment-over-limit",
    customerId: "customer-payment-over-limit",
    amountCents: 3301,
    paymentMethod: "CASH",
    timestamp,
    notes: "",
    createdByUid: "operator",
    empresa_id: "a",
    companyId: "a"
  });
  batch.update(db.doc("companies/a/receivables/payment-over-limit"), {
    outstandingAmountCents: 0,
    status: "PAID",
    lastPaymentId: "payment-too-large",
    lastPaymentAt: timestamp,
    updatedAt: timestamp,
    updatedByUid: "operator"
  });
  await assertFails(batch.commit());
});

test("validações divididas não permitem schema inválido, vínculo divergente ou campo imutável", async () => {
  const db = env.authenticatedContext("operator").firestore();
  const receivableRef = db.doc("companies/a/receivables/payment-integrity");
  const timestamp = Date.now();
  const paymentData = (id, overrides = {}) => ({
    id,
    receivableId: "payment-integrity",
    customerId: "customer-payment-integrity",
    amountCents: 100,
    paymentMethod: "PIX",
    timestamp,
    notes: "",
    createdByUid: "operator",
    empresa_id: "a",
    companyId: "a",
    ...overrides
  });
  const receivableUpdate = (id, overrides = {}) => ({
    outstandingAmountCents: 3200,
    status: "PARTIAL",
    lastPaymentId: id,
    lastPaymentAt: timestamp,
    updatedAt: timestamp,
    updatedByUid: "operator",
    ...overrides
  });

  const invalidSchema = db.batch();
  invalidSchema.set(
    db.doc("companies/a/receivable_payments/payment-invalid-schema"),
    paymentData("payment-invalid-schema", { unexpectedField: true })
  );
  invalidSchema.update(receivableRef, receivableUpdate("payment-invalid-schema"));
  await assertFails(invalidSchema.commit());

  const wrongCustomer = db.batch();
  wrongCustomer.set(
    db.doc("companies/a/receivable_payments/payment-wrong-customer"),
    paymentData("payment-wrong-customer", { customerId: "customer-payment-ok" })
  );
  wrongCustomer.update(receivableRef, receivableUpdate("payment-wrong-customer"));
  await assertFails(wrongCustomer.commit());

  const immutableField = db.batch();
  immutableField.set(
    db.doc("companies/a/receivable_payments/payment-immutable-field"),
    paymentData("payment-immutable-field")
  );
  immutableField.update(
    receivableRef,
    receivableUpdate("payment-immutable-field", { description: "Alteração indevida" })
  );
  await assertFails(immutableField.commit());

  const corruptLegacyState = db.batch();
  corruptLegacyState.set(
    db.doc("companies/a/receivable_payments/payment-normalize-corrupt"),
    paymentData("payment-normalize-corrupt", {
      receivableId: "payment-corrupt",
      customerId: "customer-payment-corrupt",
      amountCents: 1000
    })
  );
  corruptLegacyState.update(db.doc("companies/a/receivables/payment-corrupt"), {
    outstandingAmountCents: 3000,
    status: "PARTIAL",
    lastPaymentId: "payment-normalize-corrupt",
    lastPaymentAt: timestamp,
    updatedAt: timestamp,
    updatedByUid: "operator"
  });
  await assertFails(corruptLegacyState.commit());
});

test("cobrança do plano é privada e respeita formato e limites", async () => {
  const operatorDb = env.authenticatedContext("operator").firestore();
  const platformDb = env.authenticatedContext("platform").firestore();
  const billingRef = platformDb.doc("companies/a/billing/accounts_receivable");

  await assertSucceeds(operatorDb.doc("companies/a/entitlements/accounts_receivable").get());
  await assertFails(operatorDb.doc("companies/a/billing/accounts_receivable").get());
  await assertFails(operatorDb.doc("companies/a/entitlements/accounts_receivable").update({ enabled: false }));
  await assertSucceeds(billingRef.get());
  await assertFails(billingRef.update({ priceCents: 100000000000, updatedByUid: "platform" }));
  await assertFails(billingRef.update({ priceCents: 2990, updatedByUid: "outro" }));
  await assertSucceeds(billingRef.update({
    priceCents: 3990,
    billingCycle: "MONTHLY",
    nextDueAt: null,
    notes: "Plano atualizado",
    updatedAt: Date.now(),
    updatedByUid: "platform"
  }));
});

test("identidade, tenant e campos de criação do cliente são imutáveis", async () => {
  const db = env.authenticatedContext("operator").firestore();
  const customerRef = db.doc("companies/a/customers/customer-immutable");
  const now = Date.now();

  await assertFails(customerRef.update({ id: "outro-id", updatedAt: now, updatedByUid: "operator" }));
  await assertFails(customerRef.update({ companyId: "b", empresa_id: "b", updatedAt: now, updatedByUid: "operator" }));
  await assertFails(customerRef.update({ createdAt: 0, updatedAt: now, updatedByUid: "operator" }));
  await assertFails(db.doc("companies/a/customers/customer-wrong-tenant").set(
    customerData("b", "customer-wrong-tenant", "operator", now)
  ));
  await assertFails(db.doc(`companies/a/customers/${"x".repeat(65)}`).set(
    customerData("a", "x".repeat(65), "operator", now)
  ));
});
