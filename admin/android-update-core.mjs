export const ANDROID_UPDATE_DOCUMENT_PATH = ["public_config", "android_update"];
export const MAX_ANDROID_VERSION_CODE = 2_147_483_647;
export const ANDROID_UPDATE_SCHEMA_VERSION = 1;
export const ANDROID_PACKAGE_NAME = "com.lucas.goregister";
export const OFFICIAL_APK_PATH_PREFIX = "/ShinaS2-WEB/go_Register_apk/releases/download/";

export function defaultAndroidUpdateConfig() {
  return {
    schemaVersion: ANDROID_UPDATE_SCHEMA_VERSION,
    packageName: ANDROID_PACKAGE_NAME,
    latestVersionCode: 1,
    minimumVersionCode: 1,
    latestVersionName: "",
    apkUrl: "",
    sha256: "",
    releaseNotes: "",
    publishedAt: 0,
    updatedAt: 0,
    updatedByUid: "",
    enabled: false,
  };
}

function requiredText(value, label, maxLength) {
  const clean = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) throw new Error(`Informe ${label}.`);
  if (clean.length > maxLength) throw new Error(`${label} deve ter no máximo ${maxLength} caracteres.`);
  return clean;
}

function versionCode(value, label) {
  const clean = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(clean)) throw new Error(`${label} deve ser um número inteiro maior que zero.`);
  const parsed = Number(clean);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_ANDROID_VERSION_CODE) {
    throw new Error(`${label} está fora do limite permitido pelo Android.`);
  }
  return parsed;
}

function httpsApkUrl(value) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new Error("Informe a URL HTTPS do APK.");
  if (clean.length > 2048) throw new Error("A URL do APK deve ter no máximo 2048 caracteres.");
  let parsed;
  try {
    parsed = new URL(clean);
  } catch {
    throw new Error("Informe uma URL válida para o APK.");
  }
  const officialRelease = parsed.protocol === "https:"
    && parsed.hostname.toLowerCase() === "github.com"
    && parsed.port === ""
    && parsed.pathname.startsWith(OFFICIAL_APK_PATH_PREFIX)
    && parsed.pathname.toLowerCase().endsWith(".apk")
    && !parsed.search
    && !parsed.hash
    && !parsed.username
    && !parsed.password;
  if (!officialRelease) {
    throw new Error("Use a URL HTTPS de um APK publicado nos Releases oficiais do GO REGISTER.");
  }
  return parsed.toString();
}

function optionalSha256(value) {
  const clean = String(value ?? "").trim().toUpperCase();
  if (clean && !/^[0-9A-F]{64}$/.test(clean)) {
    throw new Error("O SHA-256 deve conter exatamente 64 caracteres hexadecimais.");
  }
  return clean;
}

function releaseNotes(value) {
  const clean = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (clean.length > 5000) throw new Error("As notas da atualização devem ter no máximo 5000 caracteres.");
  return clean;
}

function checked(value) {
  return value === true || value === "true" || value === "on";
}

export function normalizeAndroidUpdateConfig(input, now = Date.now(), updatedByUid = "") {
  const latestVersionCode = versionCode(input?.latestVersionCode, "O código da nova versão");
  const forceLatest = checked(input?.forceLatest);
  const minimumVersionCode = forceLatest
    ? latestVersionCode
    : versionCode(input?.minimumVersionCode, "O código mínimo aceito");
  if (minimumVersionCode > latestVersionCode) {
    throw new Error("O código mínimo aceito não pode ser maior que o código da nova versão.");
  }
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Não foi possível determinar a data da publicação.");
  const actorUid = requiredText(updatedByUid, "o administrador responsável", 128);
  return {
    schemaVersion: ANDROID_UPDATE_SCHEMA_VERSION,
    packageName: ANDROID_PACKAGE_NAME,
    latestVersionCode,
    minimumVersionCode,
    latestVersionName: requiredText(input?.latestVersionName, "o nome da nova versão", 50),
    apkUrl: httpsApkUrl(input?.apkUrl),
    sha256: optionalSha256(input?.sha256),
    releaseNotes: releaseNotes(input?.releaseNotes),
    publishedAt: now,
    updatedAt: now,
    updatedByUid: actorUid,
    enabled: checked(input?.enabled),
  };
}

export function androidUpdateConfigFromData(value) {
  const defaults = defaultAndroidUpdateConfig();
  if (!value || typeof value !== "object") return defaults;
  return {
    schemaVersion: value.schemaVersion === ANDROID_UPDATE_SCHEMA_VERSION
      ? value.schemaVersion
      : defaults.schemaVersion,
    packageName: value.packageName === ANDROID_PACKAGE_NAME
      ? value.packageName
      : defaults.packageName,
    latestVersionCode: Number.isSafeInteger(value.latestVersionCode) && value.latestVersionCode > 0
      ? value.latestVersionCode
      : defaults.latestVersionCode,
    minimumVersionCode: Number.isSafeInteger(value.minimumVersionCode) && value.minimumVersionCode > 0
      ? value.minimumVersionCode
      : defaults.minimumVersionCode,
    latestVersionName: typeof value.latestVersionName === "string" ? value.latestVersionName : "",
    apkUrl: typeof value.apkUrl === "string" ? value.apkUrl : "",
    sha256: typeof value.sha256 === "string" ? value.sha256.toUpperCase() : "",
    releaseNotes: typeof value.releaseNotes === "string" ? value.releaseNotes : "",
    publishedAt: Number.isSafeInteger(value.publishedAt) && value.publishedAt >= 0 ? value.publishedAt : 0,
    updatedAt: Number.isSafeInteger(value.updatedAt) && value.updatedAt >= 0 ? value.updatedAt : 0,
    updatedByUid: typeof value.updatedByUid === "string" ? value.updatedByUid : "",
    enabled: value.enabled === true,
  };
}
