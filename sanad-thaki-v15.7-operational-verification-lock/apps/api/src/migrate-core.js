const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function runMigrationsOnUrl(databaseUrl, kind = "tenant") {
  if (!databaseUrl) throw new Error("databaseUrl is required");
  const dir = kind === "control"
    ? path.join(__dirname, "..", "migrations", "control")
    : path.join(__dirname, "..", "migrations");
  if (!fs.existsSync(dir)) throw new Error(`Migration directory not found: ${dir}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
  const client = await pool.connect();
  let locked = false;
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
    await client.query("SELECT pg_advisory_lock(14230023)");
    locked = true;
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.platform_admin', '1', true)");
      await client.query(sql);
      await client.query("COMMIT");
      console.log(`Applied ${kind} migration: ${file}`);
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(14230023)").catch(() => {});
    client.release();
    await pool.end();
  }
}

module.exports = { runMigrationsOnUrl };
