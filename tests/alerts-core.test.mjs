import test from "node:test";
import assert from "node:assert/strict";
import { buildInternalAlerts } from "../alerts-core.mjs";

const now = new Date(2026, 7, 29, 14).getTime();

test("gera alertas operacionais e financeiros sem duplicar produtos", () => {
  const alerts = buildInternalAlerts({
    now,
    products: [
      { stockQuantity: 0, minStockThreshold: 2 },
      { stockQuantity: 1, minStockThreshold: 2 },
    ],
    receivables: [{ status: "OPEN", outstandingAmountCents: 1000, dueAt: new Date(2026, 7, 28).getTime() }],
    openRegister: { isOpen: true, openingTimestamp: now - 13 * 60 * 60 * 1000 },
  });
  assert.deepEqual(alerts.map((item) => item.id), [
    "stock-zero", "stock-low", "receivables-overdue", "cash-open-long",
  ]);
});

test("avisa assinatura dentro da antecedência configurada", () => {
  const alerts = buildInternalAlerts({
    now,
    subscription: { status: "ACTIVE", nextDueAt: new Date(2026, 8, 3).getTime(), noticeDays: 7 },
  });
  assert.equal(alerts.at(-1)?.id, "subscription-due");
});

test("assinatura atrasada prevalece sobre lembrete", () => {
  const alerts = buildInternalAlerts({
    now,
    subscription: { status: "PAST_DUE", nextDueAt: new Date(2026, 7, 20).getTime() },
  });
  assert.equal(alerts.filter((item) => item.id.startsWith("subscription")).length, 1);
  assert.equal(alerts.at(-1)?.id, "subscription-overdue");
});
