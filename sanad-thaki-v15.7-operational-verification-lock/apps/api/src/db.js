const { controlPool } = require("./control-db");
const { withTenantDatabase } = require("./tenant-db-router");

const pool = controlPool;

async function withTenant(companyId, callback) {
  if (!companyId) throw new Error("Missing company tenant");
  return withTenantDatabase(companyId, callback);
}

async function withPlatformScope(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_admin', '1', true)");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTenant, withPlatformScope };
