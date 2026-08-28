"use strict";

const { createHash, timingSafeEqual } = require("node:crypto");

function safeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyCancellationPasswordHash(password, storedHash) {
  const value = String(storedHash || "");
  if (!value || !String(password || "")) return false;
  const modernHash = value.match(/^sha256\$([a-f0-9]{32,})\$([a-f0-9]{64})$/i);
  if (!modernHash) return safeTextEqual(password, value);

  const [, salt, expectedHash] = modernHash;
  const actualHash = createHash("sha256").update(`${salt}:${String(password || "")}`).digest("hex");
  return safeTextEqual(actualHash, expectedHash);
}

module.exports = { verifyCancellationPasswordHash };
