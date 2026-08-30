import test from "node:test";
import assert from "node:assert/strict";
import { calculateBusinessAnalytics, previousPeriodBounds } from "../business-analytics-core.mjs";

const day = 24 * 60 * 60 * 1000;
const start = new Date(2026, 7, 20).getTime();

test("calcula ticket, lucro, comparação e rankings", () => {
  const result = calculateBusinessAnalytics({
    bounds: [start, start + day],
    products: [{ id: 1, name: "Arroz", costPrice: 4, stockQuantity: 8 }, { id: 2, name: "Feijão", costPrice: 3 }],
    sales: [
      { timestamp: start + 1000, amount: 20, payments: [{ method: "PIX", amount: 20 }], items: [{ productId: 1, quantity: 2, subtotal: 20 }] },
      { timestamp: start - 1000, amount: 10, items: [] },
    ],
  });
  assert.equal(result.averageTicket, 20);
  assert.equal(result.estimatedProfit, 12);
  assert.equal(result.comparisonPercent, 100);
  assert.equal(result.topProducts[0].name, "Arroz");
  assert.equal(result.paymentMethods[0].name, "Pix");
  assert.equal(result.inactiveProducts[0].name, "Feijão");
});

test("período anterior possui a mesma duração", () => {
  assert.deepEqual(previousPeriodBounds([100, 200]), [0, 100]);
  assert.equal(previousPeriodBounds(null), null);
});
