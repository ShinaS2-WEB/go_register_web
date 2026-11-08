const ACTIVE_ENTITLEMENT_STATUSES = new Set(["ACTIVE", "TRIAL"]);
const RECEIVABLE_STATUSES = new Set(["OPEN", "PARTIAL", "PAID", "CANCELLED"]);
const MAX_RECEIVABLE_AMOUNT_CENTS = 99_999_999_999;

function timestampMillis(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") {
    return value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1000000);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function receivablesEntitlementAccess(entitlement, now = Date.now()) {
  if (!entitlement || typeof entitlement !== "object") {
    return { visible: false, canCreate: false, canCollect: false, mode: "HIDDEN" };
  }

  const status = String(entitlement.status || "").trim().toUpperCase();
  const enabled = entitlement.enabled === true;
  const validUntil = timestampMillis(entitlement.validUntil);
  const expired = validUntil != null && validUntil < now;
  const isActive = enabled && ACTIVE_ENTITLEMENT_STATUSES.has(status) && !expired;
  // A existência do documento significa que a empresa já foi provisionada.
  // Quando o acesso completo termina, o histórico e os recebimentos existentes
  // permanecem disponíveis para não bloquear dados financeiros do cliente.
  const keepsHistory = !isActive;
  const visible = true;

  return {
    visible,
    canCreate: isActive,
    canCollect: visible,
    mode: isActive ? "FULL" : visible ? "HISTORY" : "HIDDEN",
  };
}

export function parseMoneyToCents(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return 0;
    const rawCents = value * 100;
    const roundedCents = Math.round(rawCents);
    return Number.isSafeInteger(roundedCents) && Math.abs(rawCents - roundedCents) < 1e-7
      ? roundedCents
      : 0;
  }

  const normalized = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/^R\$/i, "");

  let integerDigits = "";
  let fraction = "";
  let match = normalized.match(/^(\d+)$/);
  if (match) {
    integerDigits = match[1];
  } else if ((match = normalized.match(/^(\d+),(\d{1,2})$/))) {
    integerDigits = match[1];
    fraction = match[2];
  } else if ((match = normalized.match(/^(\d+)\.(\d{1,2})$/))) {
    integerDigits = match[1];
    fraction = match[2];
  } else if ((match = normalized.match(/^([1-9]\d{0,2}(?:\.\d{3})+)$/))) {
    integerDigits = match[1].replace(/\./g, "");
  } else if ((match = normalized.match(/^([1-9]\d{0,2}(?:\.\d{3})+),(\d{1,2})$/))) {
    integerDigits = match[1].replace(/\./g, "");
    fraction = match[2];
  } else {
    return 0;
  }

  const cents = Number(integerDigits) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_RECEIVABLE_AMOUNT_CENTS ? cents : 0;
}

export function matchesExistingPayment(payment, expected) {
  return String(payment?.receivableId || "") === String(expected?.receivableId || "")
    && String(payment?.customerId || "") === String(expected?.customerId || "")
    && Number(payment?.amountCents) === Number(expected?.amountCents)
    && String(payment?.paymentMethod || "").toUpperCase() === String(expected?.paymentMethod || "").toUpperCase()
    && String(payment?.notes || "") === String(expected?.notes || "")
    && String(payment?.createdByUid || "") === String(expected?.createdByUid || "");
}

export function receivablePaymentsForCustomer(payments, customerId) {
  const expectedCustomerId = String(customerId ?? "").trim();
  if (!expectedCustomerId) return [];
  return (payments || [])
    .filter((payment) => String(payment?.customerId ?? payment?.customer_id ?? "") === expectedCustomerId)
    .slice()
    .sort((left, right) => (timestampMillis(right?.timestamp) || 0) - (timestampMillis(left?.timestamp) || 0));
}

export function groupReceivablesByCustomer(receivables) {
  const groups = new Map();
  (receivables || []).forEach((receivable) => {
    const customerId = String(receivable?.customerId ?? receivable?.customer_id ?? "").trim();
    const customerName = String(receivable?.customerName ?? receivable?.customer_name ?? "Cliente").trim() || "Cliente";
    const key = customerId || `name:${customerName.toLocaleLowerCase("pt-BR")}`;
    if (!groups.has(key)) groups.set(key, { key, customerName, receivables: [] });
    groups.get(key).receivables.push(receivable);
  });
  return [...groups.values()]
    .sort((left, right) => left.customerName.localeCompare(right.customerName, "pt-BR", {
      sensitivity: "base",
      numeric: true,
    }) || left.key.localeCompare(right.key))
    .flatMap((group) => group.receivables);
}

export function receivablePaymentFingerprint(payment) {
  const canonical = JSON.stringify([
    String(payment?.companyId || ""),
    String(payment?.receivableId || ""),
    String(payment?.customerId || ""),
    Math.trunc(Number(payment?.expectedOutstandingAmountCents) || 0),
    Math.trunc(Number(payment?.amountCents) || 0),
    String(payment?.paymentMethod || "").toUpperCase(),
    String(payment?.notes || ""),
    String(payment?.createdByUid || ""),
  ]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${canonical.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function localDayStart(value = Date.now()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function localDateInputToMillis(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return 0;
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return 0;
  return date.getTime();
}

export function millisToLocalDateInput(value) {
  const millis = timestampMillis(value);
  if (millis == null) return "";
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function receivableDisplayStatus(receivable, now = Date.now()) {
  const storedStatus = String(receivable?.status || "OPEN").toUpperCase();
  if (storedStatus === "CANCELLED") return "CANCELLED";

  const original = Math.max(0, Math.trunc(Number(receivable?.originalAmountCents) || 0));
  const outstanding = Math.max(0, Math.trunc(Number(receivable?.outstandingAmountCents) || 0));
  if (outstanding === 0 || storedStatus === "PAID") return "PAID";

  const dueAt = timestampMillis(receivable?.dueAt);
  if (dueAt != null && dueAt < localDayStart(now)) return "OVERDUE";
  if (outstanding < original || storedStatus === "PARTIAL") return "PARTIAL";
  return "OPEN";
}

export function applyReceivablePayment(receivable, amountCents) {
  const amount = Math.trunc(Number(amountCents) || 0);
  const outstanding = Math.max(0, Math.trunc(Number(receivable?.outstandingAmountCents) || 0));
  const storedStatus = String(receivable?.status || "OPEN").toUpperCase();

  if (!RECEIVABLE_STATUSES.has(storedStatus)) throw new Error("Situacao da conta invalida.");
  if (storedStatus === "CANCELLED") throw new Error("Nao e possivel receber uma conta cancelada.");
  if (outstanding <= 0 || storedStatus === "PAID") throw new Error("Esta conta ja esta paga.");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Informe um valor de pagamento valido.");
  if (amount > outstanding) throw new Error("O pagamento nao pode ser maior que o saldo da conta.");

  const nextOutstanding = outstanding - amount;
  return {
    outstandingAmountCents: nextOutstanding,
    status: nextOutstanding === 0 ? "PAID" : "PARTIAL",
  };
}

export function receivablesSummary(receivables, now = Date.now()) {
  return (receivables || []).reduce((summary, receivable) => {
    const status = receivableDisplayStatus(receivable, now);
    if (status === "CANCELLED") return summary;
    const original = Math.max(0, Math.trunc(Number(receivable?.originalAmountCents) || 0));
    const outstanding = Math.max(0, Math.trunc(Number(receivable?.outstandingAmountCents) || 0));
    summary.originalAmountCents += original;
    summary.receivedAmountCents += Math.max(0, original - outstanding);
    summary.outstandingAmountCents += outstanding;
    if (status === "OVERDUE") summary.overdueAmountCents += outstanding;
    return summary;
  }, {
    originalAmountCents: 0,
    receivedAmountCents: 0,
    outstandingAmountCents: 0,
    overdueAmountCents: 0,
  });
}

export function filterReceivables(receivables, filter = "ALL", now = Date.now()) {
  const normalizedFilter = String(filter || "ALL").toUpperCase();
  return (receivables || []).filter((receivable) => {
    const status = receivableDisplayStatus(receivable, now);
    if (normalizedFilter === "ALL") return status !== "CANCELLED";
    if (normalizedFilter === "OPEN") return ["OPEN", "PARTIAL", "OVERDUE"].includes(status);
    if (normalizedFilter === "PARTIAL") {
      return ["PARTIAL", "OVERDUE"].includes(status)
        && (String(receivable.status || "").toUpperCase() === "PARTIAL"
          || Number(receivable.outstandingAmountCents) < Number(receivable.originalAmountCents));
    }
    return status === normalizedFilter;
  });
}
