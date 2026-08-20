import test from "node:test";
import assert from "node:assert/strict";

import {
  applyReceivablePayment,
  filterReceivables,
  localDateInputToMillis,
  matchesExistingPayment,
  millisToLocalDateInput,
  parseMoneyToCents,
  receivableDisplayStatus,
  receivablePaymentFingerprint,
  receivablesEntitlementAccess,
  receivablesSummary,
} from "../receivables-core.mjs";

test("gating diferencia modulo oculto, completo e historico", () => {
  const now = new Date(2026, 7, 20, 12).getTime();
  assert.deepEqual(receivablesEntitlementAccess(null, now), {
    visible: false,
    canCreate: false,
    canCollect: false,
    mode: "HIDDEN",
  });
  assert.equal(receivablesEntitlementAccess({ enabled: true, status: "ACTIVE" }, now).mode, "FULL");
  assert.equal(receivablesEntitlementAccess({ enabled: true, status: "TRIAL", validUntil: now + 1000 }, now).canCreate, true);
  assert.deepEqual(receivablesEntitlementAccess({ enabled: true, status: "ACTIVE", validUntil: now - 1 }, now), {
    visible: true,
    canCreate: false,
    canCollect: true,
    mode: "HISTORY",
  });
  assert.equal(receivablesEntitlementAccess({ enabled: false, status: "SUSPENDED" }, now).mode, "HISTORY");
  assert.equal(receivablesEntitlementAccess({ enabled: false, status: "ACTIVE" }, now).mode, "HISTORY");
});

test("valores monetarios sao convertidos para centavos inteiros", () => {
  assert.equal(parseMoneyToCents("R$ 1.234,56"), 123456);
  assert.equal(parseMoneyToCents("19,9"), 1990);
  assert.equal(parseMoneyToCents("1.234"), 123400);
  assert.equal(parseMoneyToCents("1234.56"), 123456);
  assert.equal(parseMoneyToCents("1,234"), 0);
  assert.equal(parseMoneyToCents("1,234.56"), 0);
  assert.equal(parseMoneyToCents("0,009"), 0);
  assert.equal(parseMoneyToCents("1e2"), 0);
  assert.equal(parseMoneyToCents(3.33), 333);
  assert.equal(parseMoneyToCents("999999999,99"), 99_999_999_999);
  assert.equal(parseMoneyToCents("1000000000,00"), 0);
  assert.equal(parseMoneyToCents("valor invalido"), 0);
});

test("data do formulario preserva o dia no fuso local", () => {
  const millis = localDateInputToMillis("2026-08-20");
  assert.ok(millis > 0);
  assert.equal(millisToLocalDateInput(millis), "2026-08-20");
  assert.equal(localDateInputToMillis("2026-02-31"), 0);
});

test("situacao exibida deriva pago, parcial e atraso sem alterar o documento", () => {
  const now = new Date(2026, 7, 20, 12).getTime();
  const yesterday = new Date(2026, 7, 19, 0).getTime();
  const tomorrow = new Date(2026, 7, 21, 0).getTime();
  assert.equal(receivableDisplayStatus({ status: "OPEN", originalAmountCents: 1000, outstandingAmountCents: 1000, dueAt: tomorrow }, now), "OPEN");
  assert.equal(receivableDisplayStatus({ status: "PARTIAL", originalAmountCents: 1000, outstandingAmountCents: 400, dueAt: tomorrow }, now), "PARTIAL");
  assert.equal(receivableDisplayStatus({ status: "PARTIAL", originalAmountCents: 1000, outstandingAmountCents: 400, dueAt: yesterday }, now), "OVERDUE");
  assert.equal(receivableDisplayStatus({ status: "PAID", originalAmountCents: 1000, outstandingAmountCents: 0, dueAt: yesterday }, now), "PAID");
});

test("pagamentos parciais reduzem o saldo e pagamento total encerra a conta", () => {
  const open = { status: "OPEN", outstandingAmountCents: 3300 };
  assert.deepEqual(applyReceivablePayment(open, 2000), {
    outstandingAmountCents: 1300,
    status: "PARTIAL",
  });
  assert.deepEqual(applyReceivablePayment(open, 3300), {
    outstandingAmountCents: 0,
    status: "PAID",
  });
  assert.throws(() => applyReceivablePayment(open, 3301), /maior que o saldo/i);
  assert.throws(() => applyReceivablePayment({ status: "PAID", outstandingAmountCents: 0 }, 100), /ja esta paga/i);
});

test("resumo e filtros usam saldos em centavos", () => {
  const now = new Date(2026, 7, 20, 12).getTime();
  const items = [
    { status: "OPEN", originalAmountCents: 1000, outstandingAmountCents: 1000, dueAt: new Date(2026, 7, 21).getTime() },
    { status: "PARTIAL", originalAmountCents: 2000, outstandingAmountCents: 500, dueAt: new Date(2026, 7, 19).getTime() },
    { status: "PAID", originalAmountCents: 3000, outstandingAmountCents: 0, dueAt: new Date(2026, 7, 18).getTime() },
  ];
  assert.deepEqual(receivablesSummary(items, now), {
    originalAmountCents: 6000,
    receivedAmountCents: 4500,
    outstandingAmountCents: 1500,
    overdueAmountCents: 500,
  });
  assert.equal(filterReceivables(items, "OVERDUE", now).length, 1);
  assert.equal(filterReceivables(items, "PAID", now).length, 1);
});

test("repeticao so e idempotente com os mesmos dados", () => {
  const payment = {
    receivableId: "r-1",
    customerId: "c-1",
    amountCents: 500,
    paymentMethod: "PIX",
    notes: "Parcela 1",
    createdByUid: "u-1",
  };
  assert.equal(matchesExistingPayment(payment, { ...payment }), true);
  assert.equal(matchesExistingPayment(payment, { ...payment, amountCents: 501 }), false);
  assert.equal(matchesExistingPayment(payment, { ...payment, receivableId: "r-2" }), false);
  assert.equal(matchesExistingPayment(payment, { ...payment, paymentMethod: "CASH" }), false);
  assert.equal(matchesExistingPayment(payment, { ...payment, createdByUid: "u-2" }), false);
});

test("fingerprint de retry muda quando os dados financeiros mudam", () => {
  const base = {
    companyId: "empresa-a",
    receivableId: "conta-1",
    customerId: "cliente-1",
    expectedOutstandingAmountCents: 10_000,
    amountCents: 2_000,
    paymentMethod: "PIX",
    notes: "Parcela",
    createdByUid: "operador-1",
  };
  assert.equal(receivablePaymentFingerprint(base), receivablePaymentFingerprint({ ...base }));
  assert.notEqual(receivablePaymentFingerprint(base), receivablePaymentFingerprint({ ...base, amountCents: 2_001 }));
  assert.notEqual(receivablePaymentFingerprint(base), receivablePaymentFingerprint({ ...base, companyId: "empresa-b" }));
});
