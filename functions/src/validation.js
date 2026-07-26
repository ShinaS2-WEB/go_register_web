"use strict";

const PAYMENT_ALIASES = Object.freeze({
  CREDIT_CREDIT: "CREDIT_CARD",
  CARD_CREDIT: "CREDIT_CARD",
  CREDIT: "CREDIT_CARD",
  DEBIT: "DEBIT_CARD"
});
const PAYMENT_METHODS = Object.freeze(["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD"]);

function normalizePaymentMethod(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return PAYMENT_ALIASES[normalized] || normalized;
}

function parseMoneyToCents(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : 0;
  let text = String(value ?? "").trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!text) return 0;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    text = text.replace(decimal === "," ? /\./g : /,/g, "").replace(decimal, ".");
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? "," : ".";
    const parts = text.split(separator);
    text = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : parts.join("");
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function safeCsvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function zonedParts(date, timezone = "America/Belem") {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function zonedMidnight(year, month, day, timezone = "America/Belem") {
  let instant = Date.UTC(year, month - 1, day);
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = zonedParts(new Date(instant), timezone);
    instant += Date.UTC(year, month - 1, day) - Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  }
  return instant;
}

function dateInputBounds(value, timezone = "America/Belem") {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [zonedMidnight(year, month, day, timezone), zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timezone)];
}

module.exports = { PAYMENT_METHODS, normalizePaymentMethod, parseMoneyToCents, safeCsvCell, dateInputBounds, zonedParts };
