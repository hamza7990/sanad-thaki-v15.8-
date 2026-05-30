import { createRequire } from "module";
import pg from "pg";

const require = createRequire(import.meta.url);
const { runMigrationsOnUrl } = require("../src/migrate-core.js");
const { getSecret } = require("../src/secrets.js");
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required before running migrations.");
  process.exit(1);
}

async function listReadyTenants(controlUrl) {
  const pool = new Pool({ connectionString: controlUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.login_lookup', '1', true)");
    const r = await client.query("SELECT company_id, db_secret_ref FROM tenant_registry WHERE provision_status='READY' ORDER BY created_at ASC");
    await client.query("COMMIT");
    return r.rows;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "42P01") return [];
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

try {
  await runMigrationsOnUrl(databaseUrl, "control");
  const tenants = await listReadyTenants(databaseUrl);
  for (const tenant of tenants) {
    const url = await getSecret(tenant.db_secret_ref);
    await runMigrationsOnUrl(url, "tenant");
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.platform_admin', '1', true)");
      await client.query("UPDATE tenant_registry SET schema_version=22, updated_at=now() WHERE company_id=$1", [tenant.company_id]);
      await client.query("COMMIT");
    } finally {
      client.release();
      await pool.end();
    }
  }
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
}
