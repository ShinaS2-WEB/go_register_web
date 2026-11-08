"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const requireBackend = createRequire(require.resolve("../index.js"));

function harness(profiles) {
  const writes = [];
  const database = { doc: (path) => ({
    path,
    get: async () => ({ exists: profiles.has(path), data: () => profiles.get(path) }),
    update: async (data) => writes.push({ path, data }),
  }) };
  const quotas = new Map();
  database.runTransaction = async (callback) => callback({
    get: async (ref) => ({ exists: quotas.has(ref.path), data: () => quotas.get(ref.path) }),
    set: (ref, payload) => quotas.set(ref.path, payload),
  });
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const exports = {};
  const auth = { updateUser: async (uid) => writes.push({ password: uid }), revokeRefreshTokens: async (uid) => writes.push({ revoke: uid }) };
  vm.runInNewContext(readFileSync(require.resolve("../index.js"), "utf8"), {
    exports, require: (name) => {
      if (name === "firebase-functions/v2/https") return { HttpsError, onCall: (_options, handler) => handler };
      if (name === "firebase-admin/app") return { initializeApp: () => {} };
      if (name === "firebase-admin/auth") return { getAuth: () => auth };
      if (name === "firebase-admin/firestore") return { getFirestore: () => database, FieldValue: { serverTimestamp: () => 1 } };
      return requireBackend(name);
    },
  });
  return { exports, writes };
}

test("callables administrativos recusam anônimo e status adulterado antes de escrever", async () => {
  for (const isActive of [false, "true", 1, null]) {
    const { exports, writes } = harness(new Map([["platform_admins/p", { isActive }]]));
    for (const name of ["updateCompanyUserPassword", "resetCompanyCancellationPassword", "clearCompanyData"]) {
      await assert.rejects(exports[name]({ data: {} }), { code: "unauthenticated" });
      await assert.rejects(exports[name]({ auth: { uid: "p" }, data: {} }), { code: "permission-denied" });
    }
    assert.equal(writes.length, 0);
  }
});

test("reset de senha valida caminho, vínculo e revoga sessões renováveis", async () => {
  const profiles = new Map([["platform_admins/p", { isActive: true }], ["companies/a/users/u", { empresa_id: "a", companyId: "a" }]]);
  const { exports, writes } = harness(profiles);
  const request = { auth: { uid: "p" }, data: { companyId: "a", uid: "u", password: "test-password" } };
  await assert.rejects(exports.updateCompanyUserPassword({ ...request, data: { ...request.data, companyId: "a/users/u" } }), { code: "invalid-argument" });
  profiles.set("companies/a/users/u", { empresa_id: "b" });
  await assert.rejects(exports.updateCompanyUserPassword(request), { code: "not-found" });
  assert.equal(writes.length, 0);
  profiles.set("companies/a/users/u", { empresa_id: "a", companyId: "a" });
  await exports.updateCompanyUserPassword(request);
  assert.equal(writes[0].password, "u");
  assert.equal(writes[1].revoke, "u");
});

test("cancelamento no backend exige administrador ativo da própria empresa", async () => {
  for (const profile of [{ role: "OPERATOR", isActive: true }, { role: "ADMIN", isActive: "true" }, { role: "ADMIN", companyId: "b" }]) {
    const { exports, writes } = harness(new Map([["companies/a", { isActive: true }], ["companies/a/users/u", profile]]));
    await assert.rejects(exports.cancelReceivable({ auth: { uid: "u" }, data: { companyId: "a", receivableId: "r", password: "test" } }), { code: "permission-denied" });
    assert.equal(writes.length, 0);
  }
});
