const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {pathToFileURL} = require("node:url");

const moduleUrl = pathToFileURL(path.join(__dirname, "..", "android-update-core.mjs")).href;
const adminSource = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");
const workflowSource = fs.readFileSync(
  path.join(__dirname, "..", "..", ".github", "workflows", "pages.yml"),
  "utf8"
);

test("normaliza metadados seguros para o aplicativo", async () => {
  const {normalizeAndroidUpdateConfig} = await import(moduleUrl);
  const now = 2_000_000_000_000;
  const result = normalizeAndroidUpdateConfig({
    latestVersionCode: "9",
    minimumVersionCode: "8",
    latestVersionName: "1.8",
    apkUrl: "https://github.com/ShinaS2-WEB/go_Register_apk/releases/download/v1.8/GO_REGISTER.apk",
    sha256: "a".repeat(64),
    releaseNotes: "Correções\r\n\r\nNovo atualizador",
    enabled: "on",
  }, now, "platform-admin");

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.packageName, "com.lucas.goregister");
  assert.equal(result.latestVersionCode, 9);
  assert.equal(result.minimumVersionCode, 8);
  assert.equal(result.sha256, "A".repeat(64));
  assert.equal(result.updatedByUid, "platform-admin");
  assert.equal(result.updatedAt, now);
  assert.equal(result.enabled, true);
});

test("rejeita domínio, repositório e códigos inseguros", async () => {
  const {normalizeAndroidUpdateConfig} = await import(moduleUrl);
  const base = {
    latestVersionCode: "9",
    minimumVersionCode: "8",
    latestVersionName: "1.8",
    apkUrl: "https://github.com/ShinaS2-WEB/go_Register_apk/releases/download/v1.8/GO_REGISTER.apk",
    sha256: "",
    releaseNotes: "",
  };

  assert.throws(() => normalizeAndroidUpdateConfig({...base, apkUrl: "https://example.com/app.apk"}, 1, "admin"), /Releases oficiais/);
  assert.throws(() => normalizeAndroidUpdateConfig({...base, apkUrl: "https://github.com/outro/app/releases/download/v1/app.apk"}, 1, "admin"), /Releases oficiais/);
  assert.throws(() => normalizeAndroidUpdateConfig({...base, minimumVersionCode: "10"}, 1, "admin"), /não pode ser maior/);
  assert.throws(() => normalizeAndroidUpdateConfig({...base, sha256: "123"}, 1, "admin"), /64 caracteres/);
});

test("painel e publicação incluem o módulo de atualização", () => {
  assert.match(adminSource, /data-section="updates"/);
  assert.match(adminSource, /id="androidUpdateForm"/);
  assert.match(adminSource, /normalizeAndroidUpdateConfig/);
  assert.match(adminSource, /ANDROID_UPDATE_DOCUMENT_PATH/);
  assert.match(workflowSource, /admin\/android-update-core\.mjs/);
});
