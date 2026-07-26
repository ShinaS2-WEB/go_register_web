"use strict";

// Executado contra o Emulator por `npm run test:rules`.
const { readFileSync } = require("node:fs");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const test = require("node:test");

let env;
test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "go-register-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 }
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc("companies/a").set({ isActive: true });
    await db.doc("companies/b").set({ isActive: true });
    await db.doc("companies/a/users/operator").set({ role: "OPERATOR", isActive: true, companyId: "a" });
    await db.doc("companies/a/users/admin").set({ role: "ADMIN", isActive: true, companyId: "a" });
    await db.doc("companies/a/users/master").set({ role: "MASTER_ADMIN", isActive: true, companyId: "a" });
    await db.doc("companies/a/users/inactive").set({ role: "ADMIN", isActive: false, companyId: "a" });
    await db.doc("companies/off").set({ isActive: false });
    await db.doc("companies/off/users/offuser").set({ role: "MASTER_ADMIN", isActive: true, companyId: "off" });
    await db.doc("platform_admins/platform").set({ isActive: true });
    await db.doc("companies/a/products/p").set({ name: "P", stockQuantity: 2 });
    await db.doc("companies/a/sales/s").set({ totalAmountInCents: 100 });
    await db.doc("companies/a/private_settings/cancellation").set({ passwordHash: "secret" });
  });
});
test.after(async () => env?.cleanup());

test("empresa privada exige usuário da própria empresa", async () => {
  await assertFails(env.unauthenticatedContext().firestore().doc("companies/a").get());
  await assertSucceeds(env.authenticatedContext("operator").firestore().doc("companies/a").get());
  await assertFails(env.authenticatedContext("operator").firestore().doc("companies/b").get());
});
test("operador não escreve venda, estoque, role nem lê hash", async () => {
  const db = env.authenticatedContext("operator").firestore();
  await assertFails(db.doc("companies/a/sales/new").set({ totalAmountInCents: 1 }));
  await assertFails(db.doc("companies/a/products/p").update({ stockQuantity: 99 }));
  await assertFails(db.doc("companies/a/users/operator").update({ role: "MASTER_ADMIN" }));
  await assertFails(db.doc("companies/a/private_settings/cancellation").get());
});

test("administrador comum não promove usuário nem escreve campos protegidos", async () => {
  const db = env.authenticatedContext("admin").firestore();
  await assertFails(db.doc("companies/a/users/operator").update({ role: "MASTER_ADMIN" }));
  await assertFails(db.doc("companies/a/products/p").update({ stockQuantity: 3 }));
  await assertFails(db.doc("companies/a/audit_logs/fake").set({ action: "FORGED" }));
});

test("usuário e empresa desativados perdem acesso", async () => {
  await assertFails(env.authenticatedContext("inactive").firestore().doc("companies/a").get());
  await assertFails(env.authenticatedContext("offuser").firestore().doc("companies/off").get());
});

test("platform admin autorizado mantém acesso administrativo sem ler segredo", async () => {
  const db = env.authenticatedContext("platform").firestore();
  await assertSucceeds(db.doc("companies/a").get());
  await assertSucceeds(db.doc("companies/a/products/p").get());
  await assertFails(db.doc("companies/a/private_settings/cancellation").get());
  await assertFails(db.doc("companies/a").update({ name: "forjado" }));
  await assertFails(db.doc("platform_admins/other").set({ isActive: true }));
});

test("movimentos financeiros e caixa não aceitam escrita direta", async () => {
  const db = env.authenticatedContext("master").firestore();
  await assertFails(db.doc("companies/a/cash_registers/r").set({ isOpen: true }));
  await assertFails(db.doc("companies/a/financial_entries/e").set({ amountInCents: 100 }));
  await assertFails(db.doc("companies/a/financial_exits/x").set({ amountInCents: 100 }));
  await assertFails(db.doc("companies/a/stock_movements/m").set({ quantity: 1 }));
});
