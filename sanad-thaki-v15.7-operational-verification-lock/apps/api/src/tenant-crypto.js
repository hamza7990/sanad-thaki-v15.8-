const { createCipheriv, createDecipheriv, createHash, randomBytes } = require("crypto");
const { loadConfig } = require("./config");
const { getSecretSync } = require("./secrets");
const { getTenantDataKey, getActiveTenantDataKeyVersion, getAllTenantDataKeys } = require("./tenant-secret-cache");

const config = loadConfig();

function rawTenantKey(companyId, version = null) {
  const tenantId = String(companyId || "").trim();
  let raw = getTenantDataKey(tenantId, version);
  if (!raw && !version) raw = (config.tenantKmsMap || {})[tenantId];
  if (!raw && !version && config.tenantKmsSecretRefsMap?.[tenantId]) raw = getSecretSync(config.tenantKmsSecretRefsMap[tenantId]);
  if (!raw && !version) {
    try { raw = getSecretSync(`local://sanad/tenant/${tenantId}/data_key`); } catch { /* no local provisioned key */ }
  }
  if (!raw) {
    if (config.NODE_ENV === "production" || process.env.REQUIRE_TENANT_KMS === "true") throw new Error(`Missing dedicated KMS/data key for tenant ${tenantId}`);
    const devFallback = process.env.DEFAULT_TENANT_KMS_KEY;
    if (!devFallback) throw new Error(`Missing dev KMS key for tenant ${tenantId}`);
    raw = `dev-only-${tenantId}-${devFallback}`;
  }
  if (String(raw).length < 32) throw new Error(`Weak KMS key for tenant ${tenantId}`);
  return String(raw);
}

function tenantKeyMaterial(companyId, version = null) {
  return createHash("sha256").update(rawTenantKey(companyId, version)).digest();
}

function encryptForTenant(companyId, plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  const version = getActiveTenantDataKeyVersion(companyId) || 1;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tenantKeyMaterial(companyId, version), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${version}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function decryptWithVersion(companyId, version, iv64, tag64, data64) {
  const decipher = createDecipheriv("aes-256-gcm", tenantKeyMaterial(companyId, version), Buffer.from(iv64, "base64"));
  decipher.setAuthTag(Buffer.from(tag64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data64, "base64")), decipher.final()]).toString("utf8");
}

function decryptForTenant(companyId, payload) {
  if (!payload) return "";
  const parts = String(payload).split(":");
  if (parts[0] === "v2") {
    const [, version, iv64, tag64, data64] = parts;
    return decryptWithVersion(companyId, Number(version), iv64, tag64, data64);
  }
  if (parts[0] !== "v1") throw new Error("Unsupported tenant encrypted payload");
  const [, iv64, tag64, data64] = parts;
  const candidateVersions = [1, getActiveTenantDataKeyVersion(companyId), ...getAllTenantDataKeys(companyId).map(k => k.version)]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  let lastError = null;
  for (const version of candidateVersions.length ? candidateVersions : [null]) {
    try { return decryptWithVersion(companyId, version, iv64, tag64, data64); }
    catch (err) { lastError = err; }
  }
  throw lastError || new Error("Tenant decrypt failed");
}

function getTenantEncryptionVersion(companyId) {
  return getActiveTenantDataKeyVersion(companyId) || 1;
}

module.exports = { encryptForTenant, decryptForTenant, tenantKeyMaterial, getTenantEncryptionVersion };
