"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { activeProfile, validDocumentId } = require("../src/validation");
test("backend rejeita caminhos injetados e identificadores fora dos limites", () => {
  for (const id of ["", "..", ".", "a/b/c", "a\\b", "a\u0000", "x".repeat(129), null, 123]) {
    assert.equal(validDocumentId(id), false);
  }
  assert.equal(validDocumentId("company-123"), true);
  assert.equal(validDocumentId("x".repeat(65), 64), false);
});
test("backend exige booleano verdadeiro para status explícito", () => {
  for (const isActive of [false, "true", "false", 0, 1, null]) assert.equal(activeProfile({ isActive }), false);
  assert.equal(activeProfile({ isActive: true }), true);
  assert.equal(activeProfile({}), true);
});
