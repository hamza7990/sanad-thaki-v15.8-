const { randomBytes } = require("crypto");
const { withPlatformScope, withTenant } = require("./db");
const { putSecret } = require("./secrets");
const { setTenantDataKey, clearTenantDataKey } = require("./tenant-secret-cache");
const { invalidateTenantRoute } = require("./tenant-db-router");

function assertTenantId(companyId) {
  const tenantId = String(companyId || "").trim();
  if (!/^company-[a-zA-Z0-9_-]{8,80}$/.test(tenantId)) throw new Error("Invalid tenant id");
  return tenantId;
}

async function reencryptTenantData(companyId, targetVersion, options = {}) {
  const tenantId = assertTenantId(companyId);
  const batchSize = Math.max(1, Math.min(500, Number(options.batchSize || process.env.KEY_ROTATION_REENCRYPT_BATCH_SIZE || 100)));
  const { encryptForTenant, decryptForTenant } = require("./tenant-crypto");
  const result = { invoices: 0, invoiceProcessingJobs: 0 };

  async function reencryptTable(client, tableName, encryptedColumn, idColumn = "id") {
    let changed = 0;
    while (true) {
      const rows = await client.query(
        `SELECT ${idColumn} AS id, ${encryptedColumn} AS payload
         FROM ${tableName}
         WHERE company_id=$1 AND ${encryptedColumn} IS NOT NULL
           AND coalesce(tenant_key_version, 0) < $2
         ORDER BY created_at NULLS LAST, ${idColumn}
         LIMIT $3`,
        [tenantId, targetVersion, batchSize]
      );
      if (!rows.rowCount) break;
      for (const row of rows.rows) {
        const plaintext = decryptForTenant(tenantId, row.payload);
        const encrypted = encryptForTenant(tenantId, plaintext);
        await client.query(
          `UPDATE ${tableName}
           SET ${encryptedColumn}=$3, tenant_crypto_version='tenant-aes-256-gcm-v2', tenant_key_version=$4
           WHERE ${idColumn}=$1 AND company_id=$2`,
          [row.id, tenantId, encrypted, targetVersion]
        );
        changed += 1;
      }
      if (rows.rowCount < batchSize) break;
    }
    return changed;
  }

  await withTenant(tenantId, async client => {
    result.invoices = await reencryptTable(client, "invoices", "encrypted_payload");
    result.invoiceProcessingJobs = await reencryptTable(client, "invoice_processing_jobs", "encrypted_upload");
  });

  await withPlatformScope(async client => {
    await client.query(
      `INSERT INTO platform_audit_logs (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1,'TENANT_DATA_REENCRYPTED','tenant_key',$2,$3::jsonb)`,
      [options.actorId || "system", tenantId, JSON.stringify({ targetVersion, result })]
    ).catch(() => {});
  });

  return result;
}

async function rotateTenantKey(companyId, actorId = "system", options = {}) {
  const tenantId = assertTenantId(companyId);
  const dataKey = randomBytes(48).toString("base64");
  let created;
  await withPlatformScope(async client => {
    const status = await client.query("SELECT provision_status FROM tenant_registry WHERE company_id=$1", [tenantId]);
    if (!status.rows[0]) throw new Error("Tenant is not registered");
    if (status.rows[0].provision_status !== "READY") throw new Error(`Tenant is not READY (${status.rows[0].provision_status})`);
    const next = await client.query("SELECT COALESCE(max(version),0)+1 AS version FROM tenant_key_versions WHERE company_id=$1", [tenantId]);
    const version = Number(next.rows[0].version || 1);
    const secretRef = await putSecret(`sanad/tenant/${tenantId}/data_key_v${version}`, dataKey);
    await client.query("UPDATE tenant_key_versions SET active=false, retired_at=now() WHERE company_id=$1 AND active=true", [tenantId]);
    await client.query(
      `INSERT INTO tenant_key_versions (company_id, version, secret_ref, active, created_by)
       VALUES ($1,$2,$3,true,$4)
       ON CONFLICT (company_id, version) DO UPDATE SET secret_ref=EXCLUDED.secret_ref, active=true, retired_at=NULL, created_by=EXCLUDED.created_by`,
      [tenantId, version, secretRef, actorId]
    );
    await client.query("UPDATE tenant_registry SET kms_secret_ref=$2, updated_at=now() WHERE company_id=$1", [tenantId, secretRef]);
    await client.query(
      `INSERT INTO platform_audit_logs (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1,'TENANT_KEY_ROTATED','tenant_key',$2,$3::jsonb)`,
      [actorId, tenantId, JSON.stringify({ version, secretRef, reencryptRequested: Boolean(options.reencrypt) })]
    );
    created = { version, secretRef };
  });
  clearTenantDataKey(tenantId);
  setTenantDataKey(tenantId, dataKey, created.version, true);
  invalidateTenantRoute(tenantId);
  let reencrypted = null;
  if (options.reencrypt !== false) {
    reencrypted = await reencryptTenantData(tenantId, created.version, { actorId });
  }
  return { companyId: tenantId, ...created, reencrypted };
}

module.exports = { rotateTenantKey, reencryptTenantData };
