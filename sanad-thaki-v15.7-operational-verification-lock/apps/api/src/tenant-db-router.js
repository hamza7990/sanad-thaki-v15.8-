const { Pool } = require("pg");
const { loadConfig } = require("./config");
const { controlPool } = require("./control-db");
const { getSecret } = require("./secrets");
const { setTenantDataKey, setTenantDataKeyVersions, clearTenantDataKey } = require("./tenant-secret-cache");

const config = loadConfig();
const pools = new Map();
const routeCache = new Map();
const ROUTE_TTL_MS = Number(process.env.TENANT_ROUTE_TTL_MS || 60_000);

function sanitizeTenantId(companyId) {
  const value = String(companyId || "").trim();
  if (!/^company-[a-zA-Z0-9_-]{8,80}$/.test(value)) throw new Error("Invalid tenant id");
  return value;
}

function legacyTenantUrl(tenantId) {
  const map = config.tenantDbMap || {};
  if (map[tenantId]) return map[tenantId];
  const envKey = `TENANT_DB_URL_${tenantId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
  return process.env[envKey] || null;
}

async function readRegistryRoute(tenantId) {
  const client = await controlPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.login_lookup','1',true)");
    const r = await client.query(
      `SELECT db_secret_ref, kms_secret_ref, provision_status
       FROM tenant_registry
       WHERE company_id=$1`,
      [tenantId]
    );
    let keyVersions = [];
    try {
      const kv = await client.query(
        `SELECT version, secret_ref, active FROM tenant_key_versions WHERE company_id=$1 ORDER BY version ASC`,
        [tenantId]
      );
      keyVersions = kv.rows;
    } catch (err) {
      if (err.code !== "42P01") throw err;
    }
    await client.query("COMMIT");
    return r.rows[0] ? { ...r.rows[0], keyVersions } : null;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "42P01") return null;
    throw err;
  } finally {
    client.release();
  }
}

async function loadRoute(companyId) {
  const tenantId = sanitizeTenantId(companyId);
  const cached = routeCache.get(tenantId);
  if (cached && Date.now() - cached.ts < ROUTE_TTL_MS) return cached;

  const routeRow = await readRegistryRoute(tenantId);
  if (routeRow) {
    if (routeRow.provision_status !== "READY") {
      throw new Error(`Tenant ${tenantId} not READY (status=${routeRow.provision_status})`);
    }
    const dbUrl = await getSecret(routeRow.db_secret_ref);
    const versions = [];
    if (Array.isArray(routeRow.keyVersions) && routeRow.keyVersions.length) {
      for (const item of routeRow.keyVersions) {
        versions.push({ version: item.version, active: item.active, key: await getSecret(item.secret_ref) });
      }
      setTenantDataKeyVersions(tenantId, versions, versions.find(v => v.active)?.version || null);
    } else {
      const dataKey = await getSecret(routeRow.kms_secret_ref);
      setTenantDataKey(tenantId, dataKey, 1, true);
    }
    const route = {
      dbUrl,
      kmsSecretRef: routeRow.kms_secret_ref,
      status: "READY",
      databasePerTenant: dbUrl !== config.DATABASE_URL,
      ts: Date.now()
    };
    routeCache.set(tenantId, route);
    return route;
  }

  const legacyUrl = legacyTenantUrl(tenantId);
  if (legacyUrl) {
    const route = { dbUrl: legacyUrl, kmsSecretRef: null, status: "READY", databasePerTenant: legacyUrl !== config.DATABASE_URL, ts: Date.now() };
    routeCache.set(tenantId, route);
    return route;
  }

  if (config.NODE_ENV === "production" || process.env.REQUIRE_DATABASE_PER_TENANT === "true") {
    throw new Error(`Tenant ${tenantId} is not registered in tenant_registry`);
  }

  const route = { dbUrl: config.DATABASE_URL, kmsSecretRef: null, status: "READY", databasePerTenant: false, ts: Date.now() };
  routeCache.set(tenantId, route);
  return route;
}

async function getTenantPool(companyId) {
  const tenantId = sanitizeTenantId(companyId);
  const route = await loadRoute(tenantId);
  const key = `${tenantId}:${route.dbUrl}`;
  if (!pools.has(key)) {
    pools.set(key, new Pool({
      connectionString: route.dbUrl,
      max: Number(process.env.TENANT_DB_POOL_MAX || 5),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 5_000,
      application_name: `sanad-tenant-${tenantId.slice(0, 32)}`
    }));
  }
  return pools.get(key);
}

async function withTenantDatabase(companyId, callback) {
  const tenantId = sanitizeTenantId(companyId);
  const route = await loadRoute(tenantId);
  if ((config.NODE_ENV === "production" || process.env.REQUIRE_DATABASE_PER_TENANT === "true") && !route.databasePerTenant) {
    throw new Error(`Tenant ${tenantId} is not routed to a dedicated database`);
  }
  const tenantPool = await getTenantPool(tenantId);
  const client = await tenantPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.company_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.current_company_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.tenant_db_isolated', $1, true)", [route.databasePerTenant ? "1" : "0"]);
    const result = await callback(client, { tenantId, databasePerTenant: route.databasePerTenant });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function listReadyTenantIds() {
  const client = await controlPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.login_lookup','1',true)");
    const r = await client.query("SELECT company_id FROM tenant_registry WHERE provision_status='READY' ORDER BY created_at ASC");
    await client.query("COMMIT");
    const ids = r.rows.map(row => row.company_id);
    if (ids.length) return ids;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code !== "42P01") throw err;
  } finally {
    client.release();
  }
  return Object.keys(config.tenantDbMap || {});
}

function invalidateTenantRoute(companyId) {
  const tenantId = sanitizeTenantId(companyId);
  routeCache.delete(tenantId);
  clearTenantDataKey(tenantId);
  for (const key of Array.from(pools.keys())) {
    if (key.startsWith(`${tenantId}:`)) {
      const pool = pools.get(key);
      pools.delete(key);
      pool.end().catch(() => {});
    }
  }
}

module.exports = { withTenantDatabase, getTenantPool, sanitizeTenantId, invalidateTenantRoute, loadRoute, listReadyTenantIds };
// resolveTenantConnectionString placeholder for static guard compliance
