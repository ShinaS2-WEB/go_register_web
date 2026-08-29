import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

test("site oferece auditoria somente em rota administrativa", () => {
  assert.match(source, /\["audit", "Auditoria", "policy", "admin"\]/);
  assert.match(source, /adminRoutes = new Set\([^\n]+"audit"/);
  assert.match(source, /function renderAudit\(\)/);
});

test("operações sensíveis do site geram registros de auditoria", () => {
  [
    "SALE_CREATED", "SALE_CANCELLED", "CASH_OPENED", "CASH_CLOSED",
    "MANUAL_ENTRY_CREATED", "MANUAL_EXIT_CREATED", "PRODUCT_CREATED",
    "PRODUCT_UPDATED", "PRODUCT_DELETED", "STOCK_ADDED", "STOCK_REMOVED",
    "CUSTOMER_CREATED", "RECEIVABLE_CREATED", "RECEIVABLE_CANCELLED",
    "RECEIVABLE_DELETED", "PAYMENT_RECEIVED", "USER_CREATED", "USER_DELETED",
  ].forEach((action) => assert.match(source, new RegExp(`action: [^\\n]*"${action}"`)));
});

test("auditoria limita textos e não recebe senha", () => {
  const helper = source.slice(source.indexOf("async function writeAuditLog"), source.indexOf("function syncSessionUser"));
  assert.match(helper, /description:[\s\S]*slice\(0, 500\)/);
  assert.doesNotMatch(helper, /password/i);
  assert.match(helper, /actorUid/);
});

