"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PAYMENT_METHODS, normalizePaymentMethod, parseMoneyToCents, safeCsvCell, dateInputBounds, zonedParts } = require("../src/validation");

test("interpreta dinheiro brasileiro e decimal internacional em centavos", () => {
  assert.equal(parseMoneyToCents("2,99"), 299);
  assert.equal(parseMoneyToCents("2.99"), 299);
  assert.equal(parseMoneyToCents("1.234,56"), 123456);
  assert.equal(parseMoneyToCents("1,234.56"), 123456);
  assert.equal(parseMoneyToCents("R$ 2,99"), 299);
});

test("normaliza todos os aliases de cartão e débito", () => {
  assert.deepEqual(PAYMENT_METHODS, ["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD"]);
  assert.equal(normalizePaymentMethod("CREDIT_CREDIT"), "CREDIT_CARD");
  assert.equal(normalizePaymentMethod("CARD_CREDIT"), "CREDIT_CARD");
  assert.equal(normalizePaymentMethod("CREDIT"), "CREDIT_CARD");
  assert.equal(normalizePaymentMethod("DEBIT"), "DEBIT_CARD");
});

test("neutraliza formula injection e escapa aspas em CSV", () => {
  for (const dangerous of ["=SUM(A1:A2)", "+CMD", "-10+20", "@IMPORT", "    =1+1", "\tcmd", "\rformula"]) {
    assert.match(safeCsvCell(dangerous), /^"'|^"\s*'/);
  }
  assert.equal(safeCsvCell('a"b'), '"a""b"');
});

test("intervalos de data são fechado-aberto em America/Belem", () => {
  const [start, end] = dateInputBounds("2026-12-31");
  assert.deepEqual(zonedParts(new Date(start)), { month: 12, day: 31, year: 2026, hour: 0, minute: 0, second: 0 });
  assert.deepEqual(zonedParts(new Date(end)), { month: 1, day: 1, year: 2027, hour: 0, minute: 0, second: 0 });
  assert.equal(end - start, 24 * 60 * 60 * 1000);
  assert.ok(start <= Date.parse("2026-12-31T23:59:59-03:00"));
  assert.ok(end > Date.parse("2026-12-31T23:59:59-03:00"));
});
