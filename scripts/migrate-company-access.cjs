"use strict";
const { createHash } = require("node:crypto");

function buildCompanyAccess(companies) {
  const seen = new Set();
  return companies.map(({ id, data }) => {
    const raw = String(data.identifier || data.identifierNormalized || "").trim();
    const identifier = /^[\d\s./-]+$/.test(raw) ? raw.replace(/\D/g, "")
      : raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!identifier || seen.has(identifier)) throw new Error("Identificador vazio ou duplicado. Corrija o cadastro antes de migrar.");
    seen.add(identifier);
    return {
      id: createHash("sha256").update(identifier).digest("hex"),
      data: { companyId: id, name: String(data.name || "").slice(0, 160), logoUrl: String(data.logoUrl || "").slice(0, 500) },
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const project = args.find((arg) => arg.startsWith("--project="))?.slice(10);
  if (!project) throw new Error("Informe --project=ID_DO_PROJETO. O padrão é somente simular; --apply grava os documentos públicos.");
  const { initializeApp, applicationDefault } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  initializeApp({ credential: applicationDefault(), projectId: project });
  const db = getFirestore();
  const snapshot = await db.collection("companies").get();
  const entries = buildCompanyAccess(snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })));
  const apply = args.includes("--apply");
  if (apply) {
    for (let offset = 0; offset < entries.length; offset += 400) {
      const batch = db.batch();
      entries.slice(offset, offset + 400).forEach((entry) => batch.set(db.doc(`company_access/${entry.id}`), entry.data));
      await batch.commit();
    }
  }
  console.log(JSON.stringify({ project, mode: apply ? "apply" : "dry-run", documents: entries.length }));
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { buildCompanyAccess };
