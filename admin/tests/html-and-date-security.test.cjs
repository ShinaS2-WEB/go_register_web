const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");

function adminHarness(overrides = {}) {
  const context = {
    companies: [], users: [], administrators: [],
    companyModalOpen: false, subscriptionModalOpen: false,
    administratorModalOpen: false, userModalOpen: false,
    administratorLoadError: "", editingCompany: null,
    ...overrides,
  };
  // Evaluate the real rendering/validation functions without initializing Firebase or the UI.
  const start = source.indexOf("const esc=");
  const end = source.lastIndexOf("\nrenderLogin();");
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start, end), context);
  return context;
}

const maliciousId = `customer\" autofocus onfocus=\"alert(1)'<>&`;
const encodedId = "customer&quot; autofocus onfocus=&quot;alert(1)&#39;&lt;&gt;&amp;";

function assertSafeAttribute(markup, name) {
  assert.ok(markup.includes(`${name}="${encodedId}"`), `${name} deve preservar o valor sem criar atributos`);
  assert.ok(!markup.includes(maliciousId), "O identificador não pode ser interpolado sem codificação");
}

test("identificadores de empresas permanecem dentro dos atributos das ações", () => {
  const context = adminHarness({ companies: [{ id: maliciousId, name: "Empresa", identifier: "empresa" }] });
  const companies = context.companyView();
  for (const attribute of ["data-edit-company", "data-toggle-company", "data-delete-company"]) {
    assertSafeAttribute(companies, attribute);
  }
  const subscriptions = context.subscriptionView();
  for (const attribute of ["data-edit-subscription", "data-toggle-subscription-access"]) {
    assertSafeAttribute(subscriptions, attribute);
  }
});

test("uids permanecem dentro dos atributos de usuários e administradores", () => {
  const company = { id: "company", name: "Empresa", identifier: "empresa" };
  const context = adminHarness({
    companies: [company], editingCompany: company,
    users: [{ uid: maliciousId, empresa_id: company.id, username: "Operador" }],
    administrators: [{ uid: maliciousId, name: "Administrador" }],
  });
  const companyModal = context.companyModal();
  for (const attribute of ["data-edit-company-user", "data-delete-company-user"]) {
    assertSafeAttribute(companyModal, attribute);
  }
  const users = context.companyUsersView();
  for (const attribute of ["data-edit-user", "data-delete-user"]) assertSafeAttribute(users, attribute);
  const administrators = context.administratorView();
  for (const attribute of ["data-edit-administrator", "data-delete-administrator"]) {
    assertSafeAttribute(administrators, attribute);
  }
});

test("texto, campos e textarea exibem conteúdo malicioso como texto", () => {
  const payload = `</textarea><img src=x onerror="alert('x')">&lt;`;
  const encoded = "&lt;/textarea&gt;&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;lt;";
  const company = { id: "company", name: payload, identifier: "empresa", profile: { institutionalNotes: payload } };
  const context = adminHarness({ companies: [company], editingCompany: company });
  const companies = context.companyView();
  assert.ok(companies.includes(`<strong>${encoded}</strong>`));
  const modal = context.companyModal();
  assert.ok(modal.includes(`value="${encoded}"`));
  assert.ok(modal.includes(`${encoded}</textarea>`));
  assert.ok(!modal.includes(payload));
  assert.ok(!companies.includes(payload));
});

test("datas válidas preservam início/fim do dia e valores opcionais", () => {
  const context = adminHarness();
  assert.equal(context.optionalDateMillis("2024-02-29", "data"), new Date(2024, 1, 29).getTime());
  assert.equal(context.optionalDateMillis("2024-02-29", "data", true), new Date(2024, 1, 29, 23, 59, 59, 999).getTime());
  assert.equal(context.normalizeOpeningDate("2024-02-29"), "2024-02-29");
  for (const value of [undefined, null, "", "   "]) {
    assert.equal(context.optionalDateMillis(value, "data"), null);
    assert.equal(context.normalizeOpeningDate(value), "");
  }
});

test("datas inválidas e entradas longas são rejeitadas, sem aceitar prefixos truncados", () => {
  const context = adminHarness();
  for (const value of ["2023-02-29", "2024-04-31", "2024-13-01", "2024-00-01", "2024-01-00", "2024-1-01", "2024-01-01suffix", "2024-01-01" + "9".repeat(100000)]) {
    assert.throws(() => context.optionalDateMillis(value, "data"), /válida/);
    assert.throws(() => context.normalizeOpeningDate(value), /válida/);
  }
});
