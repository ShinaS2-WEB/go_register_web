import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { calculateExpectedRegisterBalance } from "../cash-register-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("saldo esperado soma vendas e entradas de todas as formas de pagamento", () => {
  const expected = calculateExpectedRegisterBalance({
    initialBalance: 100,
    sales: 230, // Dinheiro, Pix, debito e credito ja consolidados pelo caixa.
    entries: 25,
    exits: 15,
  });

  assert.equal(expected, 340);
});

test("saldo esperado trata valores ausentes ou invalidos como zero", () => {
  assert.equal(calculateExpectedRegisterBalance({ sales: "80.50", entries: null, exits: "invalido" }), 80.5);
});

test("relatorio do caixa usa os totais completos e publica o modulo de calculo", async () => {
  const [app, workflow] = await Promise.all([
    readFile(path.join(root, "app.js"), "utf8"),
    readFile(path.join(root, ".github", "workflows", "pages.yml"), "utf8"),
  ]);
  const start = app.indexOf("function registerReport(register)");
  const end = app.indexOf("function parseMoneyCents", start);
  const reportSource = app.slice(start, end);

  assert.match(reportSource, /calculateExpectedRegisterBalance\(\{[\s\S]*sales,[\s\S]*entries,[\s\S]*exits,/);
  assert.doesNotMatch(reportSource, /initialBalance[^;]+cashSales[^;]+cashEntries[^;]+cashExits/);
  assert.match(workflow, /cash-register-core\.mjs/);
});
