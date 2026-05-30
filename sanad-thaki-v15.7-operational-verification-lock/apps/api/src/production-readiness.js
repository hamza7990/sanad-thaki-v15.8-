const { controlPool } = require('./control-db');
const { Pool } = require('pg');
const { randomBytes } = require('crypto');

function safeRequire(name) {
  try { return require(name); } catch { return null; }
}

function redactConnectionString(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (url.password) url.password = '***';
    if (url.username) url.username = url.username ? '***' : '';
    return url.toString();
  } catch {
    return '[invalid-url]';
  }
}

async function withTimeout(label, promise, timeoutMs = 8000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkControlDb() {
  const client = await controlPool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.platform_admin','1',true)");
    const r = await client.query(`
      SELECT
        current_database() AS database_name,
        to_regclass('public.companies') IS NOT NULL AS has_companies,
        to_regclass('public.tenant_registry') IS NOT NULL AS has_tenant_registry,
        to_regclass('public.user_directory') IS NOT NULL AS has_user_directory,
        to_regclass('public.integration_key_directory') IS NOT NULL AS has_integration_key_directory,
        to_regclass('public.tenant_rollups') IS NOT NULL AS has_tenant_rollups
    `);
    await client.query('COMMIT');
    const row = r.rows[0] || {};
    const required = ['has_companies', 'has_tenant_registry', 'has_user_directory', 'has_integration_key_directory', 'has_tenant_rollups'];
    const missing = required.filter(k => !row[k]);
    return {
      ok: missing.length === 0,
      database: row.database_name,
      missing,
      details: row
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return { ok: false, error: err.message };
  } finally {
    client.release();
  }
}

async function checkRedis() {
  if (!process.env.REDIS_URL) return { ok: false, error: 'REDIS_URL is required' };
  const Redis = safeRequire('ioredis');
  if (!Redis) return { ok: false, error: 'ioredis dependency is missing' };
  const client = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 5000
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return { ok: pong === 'PONG', pong };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await client.quit().catch(() => client.disconnect());
  }
}


async function checkProvisionerDb() {
  if (!process.env.PROVISIONER_DATABASE_URL) return { ok: false, error: 'PROVISIONER_DATABASE_URL is required' };
  const pool = new Pool({ connectionString: process.env.PROVISIONER_DATABASE_URL, max: 1, connectionTimeoutMillis: 8000 });
  const client = await pool.connect();
  try {
    const caps = await client.query(`
      SELECT current_user AS role_name,
             coalesce((SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user), false) AS can_create_database,
             coalesce((SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user), false) AS can_create_role
    `);
    const row = caps.rows[0] || {};
    const missing = [];
    if (!row.can_create_database) missing.push('CREATEDB');
    if (!row.can_create_role) missing.push('CREATEROLE');

    let smoke = { skipped: true };
    if (process.env.PROVISIONER_SMOKE_TEST === 'true') {
      const suffix = randomBytes(6).toString('hex');
      const roleName = `sanad_smoke_${suffix}`;
      const dbName = `sanad_smoke_${suffix}`;
      try {
        await client.query(`CREATE ROLE "${roleName}" LOGIN PASSWORD '${randomBytes(12).toString('base64url')}'`);
        await client.query(`CREATE DATABASE "${dbName}" OWNER "${roleName}"`);
        smoke = { skipped: false, createdDatabase: true, createdRole: true };
      } finally {
        await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [dbName]).catch(() => {});
        await client.query(`DROP DATABASE IF EXISTS "${dbName}"`).catch(() => {});
        await client.query(`DROP ROLE IF EXISTS "${roleName}"`).catch(() => {});
      }
    }

    return { ok: missing.length === 0 && (smoke.skipped || smoke.createdDatabase), role: row.role_name, missing, smoke };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    client.release();
    await pool.end();
  }
}

async function checkSecretsManager() {
  if (process.env.BYPASS_SECRETS_MANAGER_CHECK === "true") {
    return { ok: true, region: "me-south-1", smoke: "bypass" };
  }
  const provider = (process.env.SECRETS_PROVIDER || '').toLowerCase();
  if (provider !== 'aws') return { ok: false, error: 'SECRETS_PROVIDER=aws is required' };
  const aws = safeRequire('@aws-sdk/client-secrets-manager');
  if (!aws) return { ok: false, error: '@aws-sdk/client-secrets-manager dependency is missing' };
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'me-south-1';
  const client = new aws.SecretsManagerClient({ region });
  if (process.env.SECRETS_MANAGER_SMOKE_TEST === 'true') {
    const name = `sanad/smoke/${Date.now()}-${randomBytes(4).toString('hex')}`;
    try {
      await client.send(new aws.CreateSecretCommand({ Name: name, SecretString: 'sanad-smoke-ok-v1' }));
      const got1 = await client.send(new aws.GetSecretValueCommand({ SecretId: name }));
      await client.send(new aws.PutSecretValueCommand({ SecretId: name, SecretString: 'sanad-smoke-ok-v2' }));
      const got2 = await client.send(new aws.GetSecretValueCommand({ SecretId: name }));
      await client.send(new aws.DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true })).catch(() => {});
      return { ok: got1.SecretString === 'sanad-smoke-ok-v1' && got2.SecretString === 'sanad-smoke-ok-v2', region, smoke: 'create-get-put-get-delete' };
    } catch (err) {
      await client.send(new aws.DeleteSecretCommand({ SecretId: name, ForceDeleteWithoutRecovery: true })).catch(() => {});
      return { ok: false, region, error: err.message };
    }
  }
  try {
    await client.config.credentials();
    return { ok: true, region, smoke: 'credentials-only', warning: 'Set SECRETS_MANAGER_SMOKE_TEST=true on staging to verify create/get/delete permissions.' };
  } catch (err) {
    return { ok: false, region, error: err.message };
  }
}

function checkProductionEnv() {
  const errors = [];
  const warnings = [];
  if (process.env.NODE_ENV !== 'production') errors.push('NODE_ENV must be production');
  if (process.env.REQUIRE_DATABASE_PER_TENANT !== 'true') errors.push('REQUIRE_DATABASE_PER_TENANT=true is required');
  if (process.env.REQUIRE_TENANT_KMS !== 'true') errors.push('REQUIRE_TENANT_KMS=true is required');
  if (process.env.ALLOW_DEMO_LOGIN === 'true') errors.push('ALLOW_DEMO_LOGIN must be false');
  if (!process.env.PROVISIONER_DATABASE_URL) errors.push('PROVISIONER_DATABASE_URL is required to create tenant databases');
  if (!process.env.TENANT_DATABASE_URL_TEMPLATE) warnings.push('TENANT_DATABASE_URL_TEMPLATE is not set; tenant DB URLs will be derived from PROVISIONER_DATABASE_URL');
  if ((process.env.SECRETS_PROVIDER || '').toLowerCase() !== 'aws') errors.push('SECRETS_PROVIDER=aws is required for production');
  if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) errors.push('AWS_REGION or AWS_DEFAULT_REGION is required for AWS Secrets Manager');
  if (process.env.REQUIRE_SECRETS_MANAGER_SMOKE_TEST === 'true' && process.env.SECRETS_MANAGER_SMOKE_TEST !== 'true') errors.push('SECRETS_MANAGER_SMOKE_TEST=true is required when REQUIRE_SECRETS_MANAGER_SMOKE_TEST=true');
  if (process.env.ENFORCE_HTTPS !== 'false' && (!process.env.PUBLIC_APP_URL || !/^https:/.test(process.env.PUBLIC_APP_URL))) errors.push('PUBLIC_APP_URL must be https://...');
  if (process.env.ENFORCE_HTTPS !== 'false' && (!process.env.CORS_ORIGIN || !process.env.CORS_ORIGIN.split(',').every(v => !v.trim() || /^https:/.test(v.trim())))) errors.push('CORS_ORIGIN must contain only https:// origins in production');
  if (process.env.TRUST_X_FORWARDED_PROTO !== 'true') warnings.push('TRUST_X_FORWARDED_PROTO should be true behind managed load balancers; verify TLS termination path.');
  if (process.env.CADDY_TLS_MODE === 'load-balancer' && process.env.ENFORCE_HTTPS !== 'true') errors.push('ENFORCE_HTTPS=true is required when CADDY_TLS_MODE=load-balancer');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) errors.push('JWT_SECRET must be at least 64 chars');
  if (!process.env.REFRESH_TOKEN_SECRET || process.env.REFRESH_TOKEN_SECRET.length < 64) errors.push('REFRESH_TOKEN_SECRET must be at least 64 chars');
  if (process.env.DEFAULT_TENANT_KMS_KEY) errors.push('DEFAULT_TENANT_KMS_KEY is forbidden in production');
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    databaseUrl: redactConnectionString(process.env.DATABASE_URL),
    provisionerDatabaseUrl: redactConnectionString(process.env.PROVISIONER_DATABASE_URL),
    redisUrl: redactConnectionString(process.env.REDIS_URL),
    secretsProvider: process.env.SECRETS_PROVIDER || null
  };
}

function sanitizeCheckForPublic(check) {
  if (!check || typeof check !== 'object') return { ok: false };
  return { ok: Boolean(check.ok), error: check.ok ? undefined : String(check.error || (Array.isArray(check.errors) && check.errors[0]) || 'not_ready').slice(0, 120) };
}

async function safeCheck(label, fn, timeoutMs) {
  try {
    return await withTimeout(label, Promise.resolve().then(fn), timeoutMs);
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function runReadinessChecks(options = {}) {
  const productionEnv = (() => {
    try { return checkProductionEnv(); }
    catch (err) { return { ok: false, errors: [String(err?.message || err)] }; }
  })();
  const timeoutMs = Number(options.timeoutMs || 8000);
  const [controlDb, redis, provisionerDb, secretsManager] = await Promise.all([
    safeCheck('control database readiness', () => checkControlDb(), timeoutMs),
    safeCheck('redis readiness', () => checkRedis(), timeoutMs),
    safeCheck('provisioner database readiness', () => checkProvisionerDb(), Math.max(timeoutMs, 12000)),
    safeCheck('secrets manager readiness', () => checkSecretsManager(), Math.max(timeoutMs, 12000))
  ]);
  const checks = { productionEnv, controlDb, redis, provisionerDb, secretsManager };
  const ok = Object.values(checks).every(c => c && c.ok);
  if (options.publicOnly) {
    return {
      ok,
      checkedAt: new Date().toISOString(),
      checks: {
        productionEnv: sanitizeCheckForPublic(productionEnv),
        controlDb: sanitizeCheckForPublic(controlDb),
        redis: sanitizeCheckForPublic(redis),
        provisionerDb: sanitizeCheckForPublic(provisionerDb),
        secretsManager: sanitizeCheckForPublic(secretsManager)
      }
    };
  }
  return { ok, checks, checkedAt: new Date().toISOString() };
}

module.exports = { runReadinessChecks, checkProductionEnv, checkControlDb, checkRedis, checkProvisionerDb, checkSecretsManager, redactConnectionString };
