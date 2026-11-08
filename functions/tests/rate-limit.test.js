"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createMemoryLimiter } = require("../src/rate-limit");
const { createProtection, POLICIES } = require("../src/protection");

class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
function store() {
  const documents = new Map();
  let queue = Promise.resolve();
  const db = {
    reads: 0, fail: false, documents,
    doc: (path) => path,
    runTransaction(callback) {
      const task = queue.then(async () => {
        if (db.fail) throw new Error("offline");
        const writes = [];
        const result = await callback({
          get: async (ref) => { db.reads++; return { exists: documents.has(ref), data: () => documents.get(ref) }; },
          set: (ref, data) => writes.push([ref, data]),
        });
        writes.forEach(([ref, data]) => documents.set(ref, data));
        return result;
      });
      queue = task.catch(() => {});
      return task;
    },
  };
  return db;
}
function instance(db, clock) {
  return createProtection({
    getFirestore: () => db, HttpsError, clock,
    onCall: (options, handler) => Object.assign(handler, { options }),
  });
}
const request = (uid = "user-a", data = {}) => ({ auth: { uid }, data });

test("janela deslizante bloqueia rajadas na virada e libera sem prolongar bloqueios", () => {
  let now = 59999;
  const limiter = createMemoryLimiter({ limit: 2, windowMs: 60000, clock: () => now });
  assert.equal(limiter.consume("a").allowed, true);
  assert.equal(limiter.consume("a").allowed, true);
  now = 60000;
  assert.deepEqual(limiter.consume("a"), { allowed: false, retryAfterSeconds: 60 });
  assert.equal(limiter.consume("b").allowed, true);
  now = 119999;
  assert.equal(limiter.consume("a").allowed, true);
});

test("memória limitada não expulsa bloqueados para permitir contornar a cota", () => {
  let now = 0;
  const limiter = createMemoryLimiter({ limit: 1, windowMs: 1000, maxKeys: 2, clock: () => now });
  assert.equal(limiter.consume("a").allowed, true);
  assert.equal(limiter.consume("b").allowed, true);
  assert.equal(limiter.consume("c").allowed, false);
  assert.equal(limiter.consume("a").allowed, false);
  assert.equal(limiter.size, 2);
  now = 1000;
  assert.equal(limiter.consume("c").allowed, true);
  assert.equal(limiter.size, 1);
});

test("todas as políticas recusam excesso antes do handler e retornam tempo de espera", async () => {
  for (const [action, policy] of Object.entries(POLICIES)) {
    let now = 1000000, runs = 0;
    const db = store();
    const handler = instance(db, () => now)(action, async () => {}, async () => ++runs);
    for (let i = 0; i < policy.limit; i++) await handler(request());
    await assert.rejects(handler(request()), (error) => error.code === "resource-exhausted" && error.details.retryAfterSeconds > 0);
    assert.equal(runs, policy.limit);
    assert.equal(db.documents.size, 1);
    now += policy.windowMs;
    await handler(request());
    assert.equal(runs, policy.limit + 1);
    assert.equal(handler.options.maxInstances, action === "clearCompanyData" ? 1 : 3);
    assert.equal(handler.options.concurrency, action === "clearCompanyData" ? 1 : 10);
  }
});

test("instâncias concorrentes compartilham cota por UID e dados enviados não trocam a identidade", async () => {
  const db = store();
  const instances = Array.from({ length: 4 }, () => instance(db, () => 1000)("updateCompanyUserPassword", async () => {}, async () => "ok"));
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
    instances[index % 4](request("user-a", { uid: `forged-${index}`, companyId: `company-${index}` }))));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 5);
  for (const result of results.filter((result) => result.status === "rejected")) assert.equal(result.reason.code, "resource-exhausted");
  assert.equal(db.documents.size, 1);
  assert.match([...db.documents.keys()][0], /^_rate_limits\/[a-f0-9]{64}$/);
  await instances[0](request("user-b"));
  assert.equal(db.documents.size, 2);
});

test("anônimos e não autorizados não criam contadores; excesso é cortado antes da autorização", async () => {
  const db = store();
  let authorizations = 0;
  const handler = instance(db, () => 1000)("cancelReceivable", async () => {
    authorizations++;
    throw new HttpsError("permission-denied", "denied");
  }, async () => assert.fail("handler não deveria executar"));
  await assert.rejects(handler({ data: {} }), { code: "unauthenticated" });
  for (let i = 0; i < 30; i++) await assert.rejects(handler(request()), { code: "permission-denied" });
  await assert.rejects(handler(request()), { code: "resource-exhausted" });
  assert.equal(authorizations, 30);
  assert.equal(db.reads, 0);
});

test("falha ou corrupção do contador bloqueia operação e erro do handler consome tentativa", async () => {
  const db = store();
  let runs = 0;
  const handler = instance(db, () => 1000)("clearCompanyData", async () => {}, async () => { runs++; throw new HttpsError("invalid-argument", "invalid"); });
  db.fail = true;
  await assert.rejects(handler(request()), { code: "unavailable" });
  assert.equal(runs, 0);
  db.fail = false;
  await assert.rejects(handler(request()), { code: "invalid-argument" });
  await assert.rejects(handler(request()), { code: "resource-exhausted" });
  assert.equal(runs, 1);
  db.documents.set([...db.documents.keys()][0], { timestamps: "invalid" });
  await assert.rejects(handler(request()), { code: "unavailable" });
  assert.equal(runs, 1);
});
