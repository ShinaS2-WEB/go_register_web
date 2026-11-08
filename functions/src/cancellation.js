"use strict";

const { createHash, timingSafeEqual, pbkdf2Sync, randomBytes } = require("node:crypto");

function createCancellationPasswordHash(password) {
  if (typeof password !== "string" || password.length < 6 || password.length > 128) throw new Error("Invalid password length");
  const salt = randomBytes(24).toString("hex");
  const hash = pbkdf2Sync(password, salt, 600000, 32, "sha256").toString("hex");
  return `pbkdf2-sha256$600000$${salt}$${hash}`;
}

function safeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyCancellationPasswordHash(password, storedHash) {
  const value = String(storedHash || "");
  if (!value || typeof password !== "string" || !password || password.length > 128) return false;
  const strengthened = value.match(/^pbkdf2-sha256\$600000\$([a-f0-9]{48})\$([a-f0-9]{64})$/);
  if (strengthened) return safeTextEqual(pbkdf2Sync(password, strengthened[1], 600000, 32, "sha256").toString("hex"), strengthened[2]);
  const modernHash = value.match(/^sha256\$([a-f0-9]{32,})\$([a-f0-9]{64})$/i);
  if (!modernHash) return false;

  const [, salt, expectedHash] = modernHash;
  const actualHash = createHash("sha256").update(`${salt}:${String(password || "")}`).digest("hex");
  return safeTextEqual(actualHash, expectedHash);
}

module.exports = { verifyCancellationPasswordHash, createCancellationPasswordHash };
