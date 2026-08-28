import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("modal preserva a referencia do formulario durante o salvamento assincrono", async () => {
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const start = app.indexOf("function openModal(title, body, onSubmit)");
  const end = app.indexOf("function closeModal()", start);
  const modalSource = app.slice(start, end);
  const awaitIndex = modalSource.indexOf("await onSubmit");

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.notEqual(awaitIndex, -1);
  assert.match(modalSource.slice(0, awaitIndex), /const formElement = event\.currentTarget/);
  assert.match(modalSource, /await onSubmit\(new FormData\(formElement\)\)/);
  assert.match(modalSource, /delete formElement\.dataset\.submitting;[\s\S]*closeModal\(\)/);
  assert.doesNotMatch(modalSource.slice(awaitIndex), /event\.currentTarget/);
});
