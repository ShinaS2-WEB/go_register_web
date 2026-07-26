"use strict";

const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { normalizePaymentMethod } = require("../functions/src/validation");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
if (apply && !args.has("--backup-confirmed")) {
  throw new Error("--apply exige --backup-confirmed. Faça um export do Firestore antes da migração.");
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const report = { mode: apply ? "apply" : "dry-run", analyzed: 0, changed: 0, skipped: 0, invalid: 0, errors: [] };

function legacyMoneyInCents(data, centsField, legacyFields) {
  if (Number.isSafeInteger(data[centsField])) return null;
  for (const field of legacyFields) {
    const value = Number(data[field]);
    if (Number.isFinite(value) && value >= 0) return Math.round(value * 100);
  }
  return undefined;
}

async function migrateCollection(companyId, collectionName, mapper) {
  const snapshot = await db.collection(`companies/${companyId}/${collectionName}`).get();
  for (const document of snapshot.docs) {
    report.analyzed++;
    try {
      const patch = mapper(document.data(), document.id);
      if (patch === null) {
        report.skipped++;
      } else if (!patch || !Object.keys(patch).length) {
        report.invalid++;
      } else {
        report.changed++;
        if (apply) await document.ref.set({ ...patch, migrationVersion: 1, migratedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    } catch (error) {
      report.errors.push({ path: document.ref.path, message: error.message });
    }
  }
}

async function main() {
  const companies = await db.collection("companies").get();
  for (const company of companies.docs) {
    await migrateCollection(company.id, "products", (data, id) => {
      const patch = {};
      const selling = legacyMoneyInCents(data, "sellingPriceInCents", ["sellingPrice", "price"]);
      const cost = legacyMoneyInCents(data, "costPriceInCents", ["costPrice"]);
      if (selling === undefined) return {};
      if (selling !== null) patch.sellingPriceInCents = selling;
      if (cost !== null && cost !== undefined) patch.costPriceInCents = cost;
      if (!data.documentId) patch.documentId = id;
      return Object.keys(patch).length ? patch : null;
    });
    await migrateCollection(company.id, "sales", (data, id) => {
      const sale = data.sale && typeof data.sale === "object" ? data.sale : data;
      const patch = {};
      const total = legacyMoneyInCents(sale, "totalAmountInCents", ["finalAmount", "totalAmount", "amount"]);
      const discount = legacyMoneyInCents(sale, "discountInCents", ["discount"]);
      if (total === undefined) return {};
      if (total !== null) patch.totalAmountInCents = total;
      if (discount !== null && discount !== undefined) patch.discountInCents = discount;
      const paymentMethod = normalizePaymentMethod(sale.paymentMethod || sale.payment_method);
      if (paymentMethod && paymentMethod !== sale.paymentMethod) patch.paymentMethod = paymentMethod;
      if (!data.documentId) patch.documentId = id;
      return Object.keys(patch).length ? patch : null;
    });
    for (const name of ["financial_entries", "financial_exits"]) {
      await migrateCollection(company.id, name, (data, id) => {
        const amount = legacyMoneyInCents(data, "amountInCents", ["amount"]);
        if (amount === undefined) return {};
        const patch = {};
        if (amount !== null) patch.amountInCents = amount;
        const paymentMethod = normalizePaymentMethod(data.paymentMethod || data.payment_method);
        if (paymentMethod && paymentMethod !== data.paymentMethod) patch.paymentMethod = paymentMethod;
        if (!data.documentId) patch.documentId = id;
        return Object.keys(patch).length ? patch : null;
      });
    }
  }
  report.errorCount = report.errors.length;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  report.errors.push({ path: "global", message: error.message });
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
});
