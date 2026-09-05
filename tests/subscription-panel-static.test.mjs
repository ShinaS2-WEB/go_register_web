import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../admin/admin.js", import.meta.url), "utf8");
const html = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");

test("painel administrativo oferece a aba de assinaturas", () => {
  assert.match(source, /data-section="subscriptions">Assinaturas/);
  assert.match(source, /function subscriptionView\(\)/);
  assert.match(source, /Receita mensal estimada/);
});

test("assinatura controla plano, vencimento, tolerância, módulo e acesso", () => {
  assert.match(source, /subscriptionPlanName/);
  assert.match(source, /subscriptionNextDueAt/);
  assert.match(source, /subscriptionGraceUntil/);
  assert.match(source, /Contas a Receber/);
  assert.match(source, /subscriptionAccess/);
  assert.match(source, /isActive,updatedAt:serverTimestamp/);
});

test("cache do painel é invalidado para a nova versão", () => {
  assert.match(html, /admin\.js\?v=site-ui-release-v3/);
  assert.match(html, /admin\.css\?v=admin-ui-release-v3/);
});

