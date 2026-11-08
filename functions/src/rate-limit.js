"use strict";

// Sliding window: rejecting a request never extends the ban. Bounded storage;
// a full table rejects new identities instead of evicting active counters.
function createMemoryLimiter({ limit, windowMs, maxKeys = 10000, clock = Date.now }) {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1
      || !Number.isInteger(maxKeys) || maxKeys < 1) throw new Error("Invalid rate limit");
  const buckets = new Map();
  let nextSweep = 0;
  return {
    consume(key) {
      const now = clock();
      if (now >= nextSweep || buckets.size >= maxKeys) {
        for (const [id, times] of buckets) {
          if (times[times.length - 1] <= now - windowMs) buckets.delete(id);
        }
        nextSweep = now + windowMs;
      }
      const times = (buckets.get(key) || []).filter((time) => time > now - windowMs);
      if (times.length >= limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000)) };
      if (!buckets.has(key) && buckets.size >= maxKeys) return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
      times.push(now);
      buckets.set(key, times);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    get size() { return buckets.size; },
  };
}

module.exports = { createMemoryLimiter };
