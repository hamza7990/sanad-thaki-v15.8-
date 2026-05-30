const { Pool } = require("pg");
const { randomBytes } = require("crypto");
const bcrypt = require("bcryptjs");
const { controlPool } = require("./control-db");
const { putSecret } = require("./secrets");
const { runMigrationsOnUrl } = require("./migrate-core");
const { invalidateTenantRoute } = require("./tenant-db-router");
const { setTenantDataKey } = require("./tenant-secret-cache");

function quoteIdent(value) {
  const text = String(value || "");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(text)) throw new Error(`Unsafe SQL identifier: ${text}`);
  return `"${text.replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function physicalDbName(companyId) {
  return "sanad_" + String(companyId).replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 48);
}

function tenantUrlFromTemplate(dbUser, dbPass, dbName) {
  const template = process.env.TENANT_DATABASE_URL_TEMPLATE;
  if (template) {
    return template
      .replace(/\{USER\}/g, encodeURIComponent(dbUser))
      .replace(/\{PASSWORD\}/g, encodeURIComponent(dbPass))
      .replace(/\{DB\}/g, encodeURIComponent(dbName));
  }
  const base = process.env.PROVISIONER_DATABASE_URL || process.env.DATABASE_URL;
  const u = new URL(base);
  u.username = encodeURIComponent(dbUser);
  u.password = encodeURIComponent(dbPass);
  u.pathname = `/${encodeURIComponent(dbName)}`;
  return u.toString();
}

async function ctlExec(sql, params = []) {
  const client = await controlPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_admin','1',true)");
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function withProvisioningLock(client, companyId) {
  const key = String(companyId || '');
  const r = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [`sanad-provision:${key}`]);
  if (!r.rows[0]?.locked) throw new Error(`Provisioning is already running for ${key}`);
  return async () => { await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`sanad-provision:${key}`]).catch(() => {}); };
}

async function physicalExists(client, kind, name) {
  if (kind === 'database') {
    const r = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
    return Boolean(r.rows[0]);
  }
  if (kind === 'role') {
    const r = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name]);
    return Boolean(r.rows[0]);
  }
  return false;
}

async function cleanupOrphanedPhysical(client, dbName, dbUser) {
  if (await physicalExists(client, 'database', dbName)) {
    await client.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1`, [dbName]).catch(() => {});
    await client.query(`DROP DATABASE ${quoteIdent(dbName)}`);
  }
  if (await physicalExists(client, 'role', dbUser)) {
    await client.query(`DROP ROLE ${quoteIdent(dbUser)}`);
  }
}

async function writeProvisionAudit(companyId, step, status, detail = {}, error = null) {
  await ctlExec(
    `INSERT INTO provision_audit (company_id, step, status, detail, error_message)
     VALUES ($1,$2,$3,$4::jsonb,$5)`,
    [companyId, step, status, JSON.stringify(detail || {}), error ? String(error).slice(0, 500) : null]
  ).catch(() => {});
}

async function seedTenant(tenantUrl, { company, adminUser }) {
  const pool = new Pool({ connectionString: tenantUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.company_id',$1,true)", [company.id]);
    await client.query("SELECT set_config('app.current_company_id',$1,true)", [company.id]);
    await client.query(
      `INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, tax_number=EXCLUDED.tax_number, email=EXCLUDED.email, city=EXCLUDED.city,
         status=EXCLUDED.status, package_code=EXCLUDED.package_code,
         invoice_monthly_limit=EXCLUDED.invoice_monthly_limit, whatsapp_monthly_limit=EXCLUDED.whatsapp_monthly_limit,
         is_active=EXCLUDED.is_active`,
      [company.id, company.name, company.tax_number || "", company.email || null, company.city || "", company.status || "TRIAL", company.package_code || "basic", company.invoice_monthly_limit || 100, company.whatsapp_monthly_limit || 0, company.is_active !== false]
    );
    if (adminUser?.email && adminUser?.password_hash) {
      await client.query(
        `INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change)
         VALUES ($1,$2,$3,$4,$5,$6,true,'ACTIVE',$7)
         ON CONFLICT (email) DO UPDATE SET
           name=EXCLUDED.name, password_hash=EXCLUDED.password_hash, role=EXCLUDED.role,
           is_active=true, user_status='ACTIVE', password_must_change=EXCLUDED.password_must_change`,
        [adminUser.id, company.id, adminUser.name || "مدير النظام", adminUser.email, adminUser.password_hash, adminUser.role || "ADMIN", Boolean(adminUser.password_must_change)]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function rollbackPhysical(created, dbName, dbUser) {
  if (!process.env.PROVISIONER_DATABASE_URL || process.env.PROVISIONING_MODE === "shared-dev") return;
  const provisioner = new Pool({ connectionString: process.env.PROVISIONER_DATABASE_URL, max: 1 });
  const client = await provisioner.connect();
  try {
    if (created.db) {
      await client.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1`, [dbName]).catch(() => {});
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)}`).catch(() => {});
    }
    if (created.role) await client.query(`DROP ROLE IF EXISTS ${quoteIdent(dbUser)}`).catch(() => {});
  } finally {
    client.release();
    await provisioner.end();
  }
}

async function provisionTenant({ companyId, seed }) {
  const dbName = physicalDbName(companyId);
  const dbUser = `${dbName}_app`.slice(0, 62);
  const dbPass = randomBytes(24).toString("base64url");
  const created = { db: false, role: false };

  await ctlExec(
    `INSERT INTO tenant_registry (company_id, db_secret_ref, kms_secret_ref, provision_status)
     VALUES ($1,'pending','pending','PENDING')
     ON CONFLICT (company_id) DO UPDATE SET provision_status='PENDING', last_error=NULL, updated_at=now()`,
    [companyId]
  );
  await writeProvisionAudit(companyId, "REGISTER", "STARTED", { dbName });

  let tenantUrl = process.env.DATABASE_URL;
  try {
    const useDedicatedDb = process.env.PROVISIONING_MODE !== "shared-dev" && Boolean(process.env.PROVISIONER_DATABASE_URL);
    if (useDedicatedDb) {
      const provisioner = new Pool({ connectionString: process.env.PROVISIONER_DATABASE_URL, max: 1 });
      const pc = await provisioner.connect();
      let unlockProvision = null;
      try {
        unlockProvision = await withProvisioningLock(pc, companyId);
        if (process.env.PROVISIONING_CLEAN_ORPHANS === "true") {
          const confirmedTenant = process.env.PROVISIONING_CLEAN_ORPHANS_CONFIRM || "";
          const backupConfirmed = process.env.PROVISIONING_ORPHAN_BACKUP_CONFIRMED === "true";
          if (process.env.NODE_ENV === "production" && (confirmedTenant !== companyId || !backupConfirmed)) {
            throw new Error("Orphan cleanup in production requires PROVISIONING_CLEAN_ORPHANS_CONFIRM=<companyId> and PROVISIONING_ORPHAN_BACKUP_CONFIRMED=true");
          }
          await cleanupOrphanedPhysical(pc, dbName, dbUser);
          await writeProvisionAudit(companyId, "CLEAN_ORPHANS", "PASSED", { dbName, dbUser, backupConfirmed });
        } else {
          const dbExists = await physicalExists(pc, 'database', dbName);
          const roleExists = await physicalExists(pc, 'role', dbUser);
          if (dbExists || roleExists) throw new Error(`Provisioning target already exists (db=${dbExists}, role=${roleExists}); set PROVISIONING_CLEAN_ORPHANS=true for controlled repair`);
        }
        await pc.query(`CREATE ROLE ${quoteIdent(dbUser)} LOGIN PASSWORD ${quoteLiteral(dbPass)}`);
        created.role = true;
        await writeProvisionAudit(companyId, "CREATE_ROLE", "PASSED", { dbUser });
        await pc.query(`CREATE DATABASE ${quoteIdent(dbName)} OWNER ${quoteIdent(dbUser)} TEMPLATE template1`);
        created.db = true;
        await writeProvisionAudit(companyId, "CREATE_DATABASE", "PASSED", { dbName });
      } finally {
        if (unlockProvision) await unlockProvision();
        pc.release();
        await provisioner.end();
      }
      tenantUrl = tenantUrlFromTemplate(dbUser, dbPass, dbName);
    } else if (process.env.NODE_ENV === "production" || process.env.REQUIRE_DATABASE_PER_TENANT === "true") {
      throw new Error("PROVISIONER_DATABASE_URL is required for production database-per-tenant provisioning");
    }

    await ctlExec("UPDATE tenant_registry SET provision_status='MIGRATING', updated_at=now() WHERE company_id=$1", [companyId]);
    await writeProvisionAudit(companyId, "MIGRATE", "STARTED", { schema: "tenant" });
    await runMigrationsOnUrl(tenantUrl, "tenant");
    await writeProvisionAudit(companyId, "MIGRATE", "PASSED", { schema: "tenant" });

    const dataKey = randomBytes(48).toString("base64");
    const dbSecretRef = await putSecret(`sanad/tenant/${companyId}/db_url`, tenantUrl);
    const kmsSecretRef = await putSecret(`sanad/tenant/${companyId}/data_key_v1`, dataKey);
    setTenantDataKey(companyId, dataKey, 1, true);
    await writeProvisionAudit(companyId, "SECRETS", "PASSED", { dbSecretRef, kmsSecretRef });

    await seedTenant(tenantUrl, {
      company: seed.company,
      adminUser: seed.adminUser
    });
    await writeProvisionAudit(companyId, "SEED_TENANT", "PASSED", { adminUser: Boolean(seed.adminUser?.email) });

    await ctlExec(
      `UPDATE tenant_registry
       SET db_secret_ref=$2, kms_secret_ref=$3, provision_status='READY', schema_version=22, last_error=NULL, updated_at=now()
       WHERE company_id=$1`,
      [companyId, dbSecretRef, kmsSecretRef]
    );
    await ctlExec(
      `INSERT INTO tenant_key_versions (company_id, version, secret_ref, active, created_by)
       VALUES ($1,1,$2,true,'provisioning')
       ON CONFLICT (company_id, version) DO UPDATE SET secret_ref=EXCLUDED.secret_ref, active=true, retired_at=NULL`,
      [companyId, kmsSecretRef]
    );
    await ctlExec(
      `INSERT INTO tenant_rollups (company_id, user_count) VALUES ($1,$2)
       ON CONFLICT (company_id) DO UPDATE SET user_count=EXCLUDED.user_count, updated_at=now()`,
      [companyId, seed.adminUser?.email ? 1 : 0]
    );
    if (seed.adminUser?.email) {
      await ctlExec(
        `INSERT INTO user_directory (email_lower, company_id, user_id, is_active)
         VALUES (lower($1),$2,$3,true)
         ON CONFLICT (email_lower) DO UPDATE SET company_id=$2, user_id=$3, is_active=true, updated_at=now()`,
        [seed.adminUser.email, companyId, seed.adminUser.id]
      );
    }
    await writeProvisionAudit(companyId, "READY", "PASSED", { dbName, dedicatedDatabase: useDedicatedDb });
    invalidateTenantRoute(companyId);
    return { ok: true, dbName, dedicatedDatabase: useDedicatedDb };
  } catch (err) {
    await writeProvisionAudit(companyId, "PROVISION", "FAILED", { dbName, created }, err.message || err);
    await ctlExec("UPDATE tenant_registry SET provision_status='ROLLBACK_IN_PROGRESS', last_error=$2, updated_at=now() WHERE company_id=$1", [companyId, String(err.message || err).slice(0, 500)]).catch(() => {});
    await rollbackPhysical(created, dbName, dbUser).catch(() => {});
    await ctlExec("UPDATE tenant_registry SET provision_status='FAILED', last_error=$2, updated_at=now() WHERE company_id=$1", [companyId, String(err.message || err).slice(0, 500)]).catch(() => {});
    await writeProvisionAudit(companyId, "ROLLBACK", "ROLLED_BACK", { dbName, created });
    invalidateTenantRoute(companyId);
    throw err;
  }
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

module.exports = { provisionTenant, seedTenant, physicalDbName, hashPassword, writeProvisionAudit, cleanupOrphanedPhysical, physicalExists };
