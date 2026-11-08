import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { buildCompanyAccess } = createRequire(import.meta.url)("../scripts/migrate-company-access.cjs");
test("migração de login não exporta CPF, telefone, endereço nem credenciais", () => {
  const data = { identifier: " Loja Á ", name: "Loja", taxIdentifier: "private", phone: "private", address: "private", password: "private" };
  const [entry] = buildCompanyAccess([{ id: "a", data }]);
  assert.deepEqual(entry.data, { companyId: "a", name: "Loja", logoUrl: "" });
  assert.match(entry.id, /^[a-f0-9]{64}$/);
  assert.equal(entry.id, buildCompanyAccess([{ id: "a", data: { ...data, identifier: "loja a" } }])[0].id);
  assert.throws(() => buildCompanyAccess([{ id: "a", data }, { id: "b", data }]));
  assert.throws(() => buildCompanyAccess([{ id: "a", data: {} }]));
});
