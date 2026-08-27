import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("pagina publica entrega o modulo e invalida caches antigos", async () => {
  const [index, app, workflow, firebaseJson, packageJson, firebaseWorkflow, localServer] = await Promise.all([
    readFile(path.join(root, "index.html"), "utf8"),
    readFile(path.join(root, "app.js"), "utf8"),
    readFile(path.join(root, ".github", "workflows", "pages.yml"), "utf8"),
    readFile(path.join(root, "firebase.json"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, ".github", "workflows", "firebase-deploy.yml"), "utf8"),
    readFile(path.join(root, "scripts", "serve.js"), "utf8"),
  ]);
  assert.match(index, /styles\.css\?v=all-notice-boxes-removed-v1/);
  assert.match(index, /app\.js\?v=all-notice-boxes-removed-v1/);
  assert.match(index, /script-src 'self'/);
  assert.match(app, /\.\/receivables-core\.mjs\?v=customer-debt-order-v1/);
  assert.match(workflow, /cp index\.html app\.js receivables-core\.mjs styles\.css _site\//);
  assert.match(workflow, /cp admin\/index\.html admin\/admin\.js admin\/admin\.css admin\/notifications\.css _site\/admin\//);
  assert.doesNotMatch(workflow, /cp -R admin/);
  assert.match(workflow, /npm run test:receivables/);
  assert.ok(JSON.parse(firebaseJson).hosting.ignore.includes("**/tests/**"));
  const scripts = JSON.parse(packageJson).scripts;
  assert.equal(scripts.test, "npm run test:functions && npm run test:receivables");
  assert.equal(scripts["test:functions"], "node --test functions/tests/validation.test.js");
  assert.equal(scripts["test:receivables"], "node --test tests/*.test.mjs admin/tests/*.test.cjs");
  assert.equal(scripts["test:emulator"], "node --test --test-concurrency=1 tests/firestore.rules.test.js");
  assert.equal(scripts["emulators:test"], "firebase emulators:exec --only firestore \"npm run test:emulator\"");
  assert.match(firebaseWorkflow, /run: npm test/);
  assert.match(firebaseWorkflow, /run: npm run emulators:test/);
  assert.match(localServer, /"\.mjs": "text\/javascript; charset=utf-8"/);
});

test("fluxo de contas a receber nao exibe avisos explicativos redundantes", async () => {
  const [app, styles] = await Promise.all([
    readFile(path.join(root, "app.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
  ]);
  const start = app.indexOf("function renderReceivables()");
  const end = app.indexOf("function openProductModal", start);
  const receivablesSource = app.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.doesNotMatch(receivablesSource, /Controle manual de d[ií]vidas|Esta conta controla somente a d[ií]vida|Este pagamento reduz a d[ií]vida/);
  assert.doesNotMatch(app, /receivables-scope-notice/);
  assert.doesNotMatch(styles, /receivables-scope-notice/);
});

test("nenhuma tela exibe caixas de aviso embutidas", async () => {
  const [app, styles, admin, adminStyles] = await Promise.all([
    readFile(path.join(root, "app.js"), "utf8"),
    readFile(path.join(root, "styles.css"), "utf8"),
    readFile(path.join(root, "admin", "admin.js"), "utf8"),
    readFile(path.join(root, "admin", "admin.css"), "utf8"),
  ]);

  assert.doesNotMatch(app, /class="[^"]*\bnotice\b/);
  assert.doesNotMatch(styles, /\.notice\b|\.error-notice\b|\.receivables-plan-notice\b/);
  assert.doesNotMatch(admin, /class="[^"]*\bnotice\b|addon-notice|addon-private-note/);
  assert.doesNotMatch(adminStyles, /addon-notice|addon-private-note/);
});

test("cada cliente possui acesso ao seu historico individual de pagamentos", async () => {
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const historyStart = app.indexOf("function openReceivableCustomerPaymentHistory");
  const historyEnd = app.indexOf("function whatsappPhone", historyStart);
  const historySource = app.slice(historyStart, historyEnd);

  assert.match(app, /data-receivable-customer-history=[\s\S]*Histórico<\/button>/);
  assert.match(app, /openReceivableCustomerPaymentHistory\(button\.dataset\.receivableCustomerHistory\)/);
  assert.match(historySource, /receivablePaymentsForCustomer\(state\.receivables\.payments, customerId\)/);
  assert.match(historySource, /Dívida:/);
});

test("filtro todas agrupa as dividas por cliente", async () => {
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const start = app.indexOf("function renderReceivables()");
  const end = app.indexOf("function reportSales(bounds)", start);
  const pageSource = app.slice(start, end);

  assert.match(pageSource, /receivablesStatus === "ALL"[\s\S]*groupReceivablesByCustomer\(matchingAccounts\)/);
});

test("backup operacional inclui o modulo sem dados de cobranca do plano", async () => {
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const start = app.indexOf("function exportBackupJson()");
  const end = app.indexOf("function dateStamp()", start);
  const backupSource = app.slice(start, end);
  assert.match(backupSource, /schemaVersion: 2/);
  assert.match(backupSource, /customers: state\.receivables\.customers/);
  assert.match(backupSource, /receivables: state\.receivables\.receivables/);
  assert.match(backupSource, /receivable_payments: state\.receivables\.payments/);
  assert.doesNotMatch(backupSource, /billing|planPrice|monthlyPrice|subscriptionPrice/i);
});

test("fluxo de recebimento nao grava entrada financeira nem venda", async () => {
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const start = app.indexOf("function openReceivablePaymentModal");
  const end = app.indexOf("function openReceivablePaymentHistory", start);
  const paymentSource = app.slice(start, end);
  assert.match(paymentSource, /runTransaction/);
  assert.match(paymentSource, /receivable_payments|receivablesCollections\.payments/);
  assert.match(paymentSource, /pendingReceivablePayments\.has\(receivableId\)/);
  assert.match(paymentSource, /getOrCreateReceivablePaymentRetry\(companyId, receivableId, fingerprint\)/);
  assert.match(paymentSource, /clearReceivablePaymentRetry\(operation\.scope, paymentId\)/);
  assert.match(app, /O navegador bloqueou o armazenamento seguro da tentativa/);
  assert.match(paymentSource, /const timestamp = Math\.max\(/);
  assert.doesNotMatch(paymentSource, /financial_entries|collections\.entries|collections\.sales/);
});

test("backup aguarda entitlement e snapshots completos", async () => {
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const start = app.indexOf("function exportBackupJson()");
  const end = app.indexOf("function dateStamp()", start);
  const backupSource = app.slice(start, end);
  assert.match(backupSource, /!state\.receivablesEntitlementLoaded/);
  assert.match(backupSource, /!receivablesDataReady\(\)/);
  assert.match(backupSource, /state\.receivables\.errors\.size > 0/);
  assert.match(
    backupSource,
    /if \(state\.receivables\.errors\.size > 0\)[\s\S]*if \(state\.receivablesEntitlement && !receivablesDataReady\(\)\)/,
  );
});

test("modal bloqueia fechamento enquanto o envio esta em andamento", async () => {
  const app = await readFile(path.join(root, "app.js"), "utf8");
  const start = app.indexOf("function openModal(");
  const end = app.indexOf("function openFormDialog", start);
  const modalSource = app.slice(start, end);
  const afterSubmitAwait = modalSource.slice(modalSource.indexOf("await onSubmit"));
  assert.match(modalSource, /const formElement = event\.currentTarget/);
  assert.match(modalSource, /new FormData\(formElement\)/);
  assert.doesNotMatch(afterSubmitAwait, /event\.currentTarget/);
  assert.match(modalSource, /dataset\.submitting = "true"/);
  assert.match(modalSource, /closeButtons\.forEach\(\(button\) => \{ button\.disabled = true; \}\)/);
  assert.match(modalSource, /#modalForm\[data-submitting='true'\]/);
});
