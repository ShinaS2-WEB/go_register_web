"use strict";
const { createHash } = require("node:crypto");
const { createMemoryLimiter } = require("./rate-limit");

const minute = 60000;
const POLICIES = Object.freeze({
  updateCompanyUserPassword: { limit: 5, windowMs: minute },
  resetCompanyCancellationPassword: { limit: 5, windowMs: 15 * minute },
  cancelReceivable: { limit: 10, windowMs: minute },
  clearCompanyData: { limit: 1, windowMs: 15 * minute },
});

function createProtection({ onCall, HttpsError, getFirestore, clock = Date.now }) {
  const perUser = createMemoryLimiter({ limit: 30, windowMs: minute, clock });
  const perInstance = createMemoryLimiter({ limit: 300, windowMs: minute, maxKeys: 1, clock });
  function reject(retryAfterSeconds) {
    throw new HttpsError("resource-exhausted", "Muitas solicitações. Aguarde antes de tentar novamente.", { retryAfterSeconds });
  }

  async function consumeShared(action, uid) {
    const { limit, windowMs } = POLICIES[action];
    const key = createHash("sha256").update(JSON.stringify([action, uid])).digest("hex");
    const db = getFirestore();
    const ref = db.doc(`_rate_limits/${key}`);
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const now = clock();
        const previous = snapshot.exists ? snapshot.data().timestamps : [];
        if (!Array.isArray(previous) || previous.length > limit
            || previous.some((time) => !Number.isSafeInteger(time))) {
          throw new HttpsError("unavailable", "Controle de solicitações indisponível.");
        }
        const times = previous.filter((time) => time > now - windowMs).sort((a, b) => a - b);
        if (times.length >= limit) reject(Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000)));
        transaction.set(ref, {
          timestamps: [...times, now],
          // Optional Firestore TTL can remove inactive counters. Expiration is
          // calculated above, independently of asynchronous TTL deletion.
          expiresAt: new Date(now + windowMs + 86400000),
        });
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      // Fail closed: database failures must not disable the quota.
      throw new HttpsError("unavailable", "Controle de solicitações indisponível. Tente novamente depois.");
    }
  }

  return function protectedCall(action, authorize, handler) {
    if (!Object.hasOwn(POLICIES, action)) throw new Error("Unknown rate limit policy");
    return onCall({
      region: "southamerica-east1",
      minInstances: 0,
      maxInstances: action === "clearCompanyData" ? 1 : 3,
      concurrency: action === "clearCompanyData" ? 1 : 10,
      timeoutSeconds: action === "clearCompanyData" ? 540 : 60,
      memory: "256MiB",
    }, async (request) => {
      const uid = request.auth?.uid;
      if (typeof uid !== "string" || !uid || uid.length > 128) {
        throw new HttpsError("unauthenticated", "Faça login para continuar.");
      }
      // The UID is verified by the callable SDK; neither client data nor
      // X-Forwarded-For can choose a different quota identity.
      const local = perUser.consume(uid);
      if (!local.allowed) reject(local.retryAfterSeconds);
      const global = perInstance.consume("all");
      if (!global.allowed) reject(global.retryAfterSeconds);
      const context = await authorize(request);
      // Only authorized accounts can create persistent quota records.
      // Invalid arguments / wrong cancellation passwords still consume quota.
      await consumeShared(action, uid);
      return handler(request, context);
    });
  };
}

module.exports = { createProtection, POLICIES };
