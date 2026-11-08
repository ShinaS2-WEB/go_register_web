import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createCancellationHash, verifyCancellationHash } from "../assets/js/password-core.mjs";
const { createCancellationPasswordHash, verifyCancellationPasswordHash } = createRequire(import.meta.url)("../functions/src/cancellation.js");

test("hashes de cancelamento têm salt aleatório e interoperam entre navegador e backend", async () => {
  const password = "senha de teste á123";
  const browserHash = await createCancellationHash(password);
  const serverHash = createCancellationPasswordHash(password);
  assert.notEqual(browserHash, serverHash);
  assert.equal(verifyCancellationPasswordHash(password, browserHash), true);
  assert.equal(await verifyCancellationHash(password, serverHash), true);
  assert.equal(await verifyCancellationHash("senha incorreta", serverHash), false);
  assert.equal(verifyCancellationPasswordHash("senha incorreta", browserHash), false);
});
test("verificação rejeita texto puro e parâmetros PBKDF2 adulterados", async () => {
  for (const hash of ["senha-teste", "pbkdf2-sha256$999999999$abc$def", "sha256$bad$bad", ""]) {
    assert.equal(await verifyCancellationHash("senha-teste", hash), false);
    assert.equal(verifyCancellationPasswordHash("senha-teste", hash), false);
  }
  await assert.rejects(createCancellationHash("admin"));
});
