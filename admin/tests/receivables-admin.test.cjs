const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const adminSource = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8");

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Trecho inicial ausente: ${start}`);
  assert.notEqual(endIndex, -1, `Trecho final ausente: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("empresa nunca configurada não provisiona o adicional por padrão", () => {
  const declaration = adminSource.match(/const shouldPersistReceivables=.*?;\r?\n/);
  assert.ok(declaration, "Função de decisão de provisionamento não encontrada.");
  const context = {};
  vm.runInNewContext(`${declaration[0]}this.shouldPersistReceivables=shouldPersistReceivables;`, context);
  const defaults = {
    entitlement: {enabled: false, status: "SUSPENDED", validUntil: null},
    billing: {priceCents: 0, nextDueAt: null, notes: ""},
  };
  assert.equal(context.shouldPersistReceivables(defaults, false), false);
  assert.equal(context.shouldPersistReceivables({...defaults, entitlement: {...defaults.entitlement, enabled: true}}, false), true);
  assert.equal(context.shouldPersistReceivables({...defaults, billing: {...defaults.billing, priceCents: 100}}, false), true);
  assert.equal(context.shouldPersistReceivables(defaults, true), true);
  assert.match(adminSource, /receivablesConfigured:entitlementExists/);
  assert.match(adminSource, /if\(writeReceivables\)\{batch\.set\(entitlementRef/);
  assert.match(adminSource, /receivablesConfigurationChanged\(editingCompany,receivablesConfiguration\)/);
});

test("limpeza e exclusão tratam dados pessoais sem apagar a licença por engano", () => {
  const operational = sourceBetween(adminSource, "const operationalCollections=", ";\n");
  for (const collectionName of ["customers", "receivables", "receivable_payments"]) {
    assert.match(operational, new RegExp(`"${collectionName}"`));
  }
  assert.doesNotMatch(operational, /"entitlements"|"billing"/);
  const removal = sourceBetween(adminSource, "async function removeCompany", "async function removeUser");
  const deletionLock = sourceBetween(adminSource, "async function beginCompanyDataDeletion", "async function deleteCompanyOperationalDocuments");
  assert.match(deletionLock, /runTransaction\(db/);
  assert.match(deletionLock, /operationId=randomToken\(\)/);
  assert.match(deletionLock, /companyDeletionCanStart\(data\)/);
  assert.match(deletionLock, /isActive:false[\s\S]*dataDeletionInProgress:true[\s\S]*dataDeletionOperationId:operationId/);
  assert.match(deletionLock, /dataDeletionOperationId!==maintenance\.operationId/);
  assert.match(deletionLock, /async function finishCompanyDataDeletion[\s\S]*runTransaction\(db/);
  assert.match(rulesSource, /function activeCompany[\s\S]*dataDeletionInProgress[\s\S]*!= true/);
  assert.match(removal, /await beginCompanyDataDeletion\(company\.id\)/);
  assert.match(removal, /await deleteCompanyOperationalDocuments\(company\.id\)/);
  assert.match(removal, /await requireCompanyDataDeletionOwner\(maintenance\)/);
  assert.match(removal, /"billing","accounts_receivable"/);
  assert.match(removal, /"entitlements","accounts_receivable"/);
});

test("lease da limpeza bloqueia concorrência recente e libera retomada segura", () => {
  const storedMillisDeclaration = adminSource.match(/const storedMillis=.*?;\r?\n/);
  const leaseDeclaration = adminSource.match(/const companyDeletionLeaseMillis=.*?;\r?\n/);
  const leaseFunction = adminSource.match(/function companyDeletionCanStart.*?\}\r?\n/);
  assert.ok(storedMillisDeclaration);
  assert.ok(leaseDeclaration);
  assert.ok(leaseFunction);
  const context = {};
  vm.runInNewContext(
    `${storedMillisDeclaration[0]}${leaseDeclaration[0]}${leaseFunction[0]}this.canStart=companyDeletionCanStart;`,
    context
  );
  const now = 2_000_000_000_000;
  const recent = now - 5 * 60 * 1000;
  const stale = now - 31 * 60 * 1000;
  assert.equal(context.canStart({dataDeletionInProgress: false}, now), true);
  assert.equal(context.canStart({dataDeletionInProgress: true, dataDeletionStartedAt: recent}, now), false);
  assert.equal(context.canStart({dataDeletionInProgress: true, dataDeletionStartedAt: recent, dataDeletionFailedAt: now}, now), true);
  assert.equal(context.canStart({dataDeletionInProgress: true, dataDeletionStartedAt: stale}, now), true);
  assert.equal(context.canStart({dataDeletionInProgress: true, dataDeletionStartedAt: "inválido"}, now), true);
  assert.equal(context.canStart({dataDeletionInProgress: true}, now), true);
});

test("billing é privado e entitlement é legível pela empresa", () => {
  const entitlementRules = sourceBetween(rulesSource, "match /entitlements/{moduleId}", "match /billing/{moduleId}");
  const billingRules = sourceBetween(rulesSource, "match /billing/{moduleId}", "match /customers/{customerId}");
  assert.match(entitlementRules, /platformAdmin\(\) \|\| companyUser\(companyId\)/);
  assert.match(entitlementRules, /platformAdmin\(\)[\s\S]*validEntitlement/);
  assert.match(billingRules, /allow read: if moduleId == 'accounts_receivable' && platformAdmin\(\)/);
  assert.doesNotMatch(billingRules, /companyUser/);
  assert.match(billingRules, /validBilling\(request\.resource\.data\)/);
});

test("novas contas exigem licença ativa e validade não expirada", () => {
  const gate = sourceBetween(rulesSource, "function receivablesCreationEnabled", "function validEntitlement");
  assert.match(gate, /enabled == true/);
  assert.match(gate, /\['ACTIVE', 'TRIAL'\]/);
  assert.match(gate, /request\.time\.toMillis\(\)/);
  const customerRules = sourceBetween(rulesSource, "match /customers/{customerId}", "match /receivables/{receivableId}");
  const receivableRules = sourceBetween(rulesSource, "match /receivables/{receivableId}", "match /receivable_payments/{paymentId}");
  assert.match(customerRules, /allow create:[\s\S]*receivablesCreationEnabled/);
  assert.match(receivableRules, /allow create:[\s\S]*receivablesCreationEnabled/);
  assert.match(receivableRules, /allow read:[\s\S]*receivablesProvisioned/);
});

test("pagamento exige criação e redução de saldo na mesma operação", () => {
  const paymentValidation = sourceBetween(rulesSource, "function validPaymentCreate", "match /platform_admins/{uid}");
  assert.match(paymentValidation, /let linkedReceivable = receivablePath[\s\S]*getAfter\(linkedReceivable\)/);
  assert.match(paymentValidation, /before\.lastPaymentId != paymentId[\s\S]*after\.lastPaymentId == paymentId/);
  assert.match(paymentValidation, /let linkedPayment = paymentPath[\s\S]*getAfter\(linkedPayment\)/);
  assert.match(paymentValidation, /!exists\(linkedPayment\)[\s\S]*existsAfter\(linkedPayment\)/);
  assert.match(paymentValidation, /outstandingAmountCents - payment\.amountCents/);
  assert.match(paymentValidation, /payment\.timestamp >= before\.lastPaymentAt/);
  assert.match(paymentValidation, /after\.updatedAt == payment\.timestamp/);
  assert.match(paymentValidation, /after\.updatedAt >= before\.updatedAt/);
  assert.match(paymentValidation, /affectedKeys\(\)\.hasOnly/);
  assert.equal((paymentValidation.match(/validPayment\(/g) || []).length, 1,
    "O documento do pagamento deve ser validado uma vez, pela própria criação.");
  assert.equal((paymentValidation.match(/validReceivable\(/g) || []).length, 1,
    "O estado final da conta deve ser validado uma vez, pela atualização.");
  const paymentRules = sourceBetween(rulesSource, "match /receivable_payments/{paymentId}", "match /{collectionName}/{documentId}");
  assert.match(paymentRules, /allow create:[\s\S]*receivablesProvisioned/);
  assert.match(paymentRules, /allow update, delete: if platformAdmin\(\)/);
  assert.match(rulesSource, /function currentPaymentTimestamp[\s\S]*request\.time\.toMillis\(\) - 300000[\s\S]*request\.time\.toMillis\(\) \+ 300000/);
});

test("ids, uids e valores financeiros possuem limites seguros", () => {
  const boundedIds = sourceBetween(rulesSource, "function boundedDocumentId", "function strictTenant");
  assert.match(boundedIds, /value\.size\(\) > 0[\s\S]*value\.size\(\) <= 64/);
  assert.match(boundedIds, /function boundedUid[\s\S]*value\.size\(\) <= 128/);
  assert.match(boundedIds, /function boundedPositiveMoneyCents[\s\S]*value > 0[\s\S]*value <= 99999999999/);

  const customerValidation = sourceBetween(rulesSource, "function validCustomer", "function validReceivable");
  const receivableValidation = sourceBetween(rulesSource, "function validReceivable", "function validPayment");
  const paymentValidation = sourceBetween(rulesSource, "function validPayment", "function receivablePath");
  assert.match(customerValidation, /boundedDocumentId\(data\.id\)/);
  assert.match(customerValidation, /boundedUid\(data\.createdByUid\)[\s\S]*boundedUid\(data\.updatedByUid\)/);
  assert.match(receivableValidation, /boundedDocumentId\(data\.id\)[\s\S]*boundedDocumentId\(data\.customerId\)/);
  assert.match(receivableValidation, /boundedPositiveMoneyCents\(data\.originalAmountCents\)/);
  assert.match(receivableValidation, /data\.lastPaymentId == '' \|\| boundedDocumentId\(data\.lastPaymentId\)/);
  assert.match(paymentValidation, /boundedDocumentId\(data\.id\)[\s\S]*boundedDocumentId\(data\.receivableId\)[\s\S]*boundedDocumentId\(data\.customerId\)/);
  assert.match(paymentValidation, /boundedPositiveMoneyCents\(data\.amountCents\)/);
  assert.match(paymentValidation, /boundedUid\(data\.createdByUid\)/);
});
