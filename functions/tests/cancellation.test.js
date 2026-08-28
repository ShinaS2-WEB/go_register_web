"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const { verifyCancellationPasswordHash } = require("../src/cancellation");

test("valida a senha moderna de cancelamento", () => {
  const salt = "0123456789abcdef0123456789abcdef";
  const password = "senha-segura";
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");

  assert.equal(verifyCancellationPasswordHash(password, `sha256$${salt}$${hash}`), true);
  assert.equal(verifyCancellationPasswordHash("senha-errada", `sha256$${salt}$${hash}`), false);
});

test("mantem compatibilidade com senha legada e rejeita valor ausente", () => {
  assert.equal(verifyCancellationPasswordHash("senha-legada", "senha-legada"), true);
  assert.equal(verifyCancellationPasswordHash("outra", "senha-legada"), false);
  assert.equal(verifyCancellationPasswordHash("", ""), false);
});
