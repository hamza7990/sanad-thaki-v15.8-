const keyCache = new Map();

function normalizeTenantId(companyId) {
  return String(companyId || "").trim();
}

function ensureEntry(companyId) {
  const tenantId = normalizeTenantId(companyId);
  if (!keyCache.has(tenantId)) keyCache.set(tenantId, { activeVersion: null, keys: new Map() });
  return keyCache.get(tenantId);
}

function setTenantDataKey(companyId, key, version = 1, active = true) {
  const tenantId = normalizeTenantId(companyId);
  if (!tenantId || !key) return;
  const numericVersion = Number(version || 1);
  const entry = ensureEntry(tenantId);
  entry.keys.set(numericVersion, String(key));
  if (active || !entry.activeVersion) entry.activeVersion = numericVersion;
}

function setTenantDataKeyVersions(companyId, versions = [], activeVersion = null) {
  for (const item of versions || []) {
    if (!item?.key) continue;
    setTenantDataKey(companyId, item.key, Number(item.version || 1), Boolean(item.active));
  }
  if (activeVersion) ensureEntry(companyId).activeVersion = Number(activeVersion);
}

function getTenantDataKey(companyId, version = null) {
  const entry = keyCache.get(normalizeTenantId(companyId));
  if (!entry) return null;
  const v = version ? Number(version) : entry.activeVersion;
  return entry.keys.get(v) || null;
}

function getActiveTenantDataKeyVersion(companyId) {
  return keyCache.get(normalizeTenantId(companyId))?.activeVersion || null;
}

function getAllTenantDataKeys(companyId) {
  const entry = keyCache.get(normalizeTenantId(companyId));
  if (!entry) return [];
  return Array.from(entry.keys.entries()).map(([version, key]) => ({ version, key, active: version === entry.activeVersion }));
}

function clearTenantDataKey(companyId) {
  keyCache.delete(normalizeTenantId(companyId));
}

module.exports = {
  setTenantDataKey,
  setTenantDataKeyVersions,
  getTenantDataKey,
  getActiveTenantDataKeyVersion,
  getAllTenantDataKeys,
  clearTenantDataKey
};
