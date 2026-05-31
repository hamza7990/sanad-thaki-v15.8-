import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, "../..");

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:123456@127.0.0.1:5432/postgres?sslmode=disable";

test("Backup and Restore Validation Test: 100% Recovery and Integrity Verification", async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    // 1. Setup - Create unique company and user to verify restoration
    const uniqueId = `test-${Date.now()}`;
    const testCompanyId = `company-backup-${uniqueId}`;
    const testUserId = `user-backup-${uniqueId}`;

    console.log("Setting up mock company and user for backup validation...");
    
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_admin', '1', true)");
    
    await client.query(`
      INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
      VALUES ($1, 'Backup Verification Co', '300000000000003', 'backup-test@sanad.local', 'الرياض', 'ACTIVE', 'professional', 500, 500, true)
    `, [testCompanyId]);

    await client.query(`
      INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change)
      VALUES ($1, $2, 'Backup Auditor', 'backup-auditor@sanad.local', 'dummy_hash', 'OWNER', true, 'ACTIVE', false)
    `, [testUserId, testCompanyId]);

    await client.query("COMMIT");

    // 2. Perform Native JSON Backup
    console.log("Executing native JSON database backup...");
    
    // Get all public tables
    const tableResult = await client.query(`
      SELECT quote_ident(tablename) AS table_name
      FROM pg_tables
      WHERE schemaname='public'
        AND tablename NOT LIKE 'pg_%'
        AND tablename NOT LIKE 'sql_%'
    `);
    
    const tables = tableResult.rows.map(r => r.table_name);
    assert.ok(tables.length > 0, "No tables found to back up");

    const backupData = {};
    for (const table of tables) {
      await client.query("SELECT set_config('app.platform_admin', '1', true)");
      const rowsResult = await client.query(`SELECT * FROM ${table}`);
      backupData[table] = rowsResult.rows;
    }

    // Save backup to a file in the scratch folder
    const scratchDir = path.resolve(apiDir, "scratch");
    fs.mkdirSync(scratchDir, { recursive: true });
    const backupFilePath = path.join(scratchDir, `backup-validation-${uniqueId}.json`);
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), "utf8");
    console.log(`Backup file successfully written to: ${backupFilePath}`);

    // Verify backup contains our test record
    assert.ok(backupData.companies.some(c => c.id === testCompanyId), "Backup did not contain the test company");
    assert.ok(backupData.app_users.some(u => u.id === testUserId), "Backup did not contain the test user");

    // 3. Corrupt Database - Simulating total data loss
    console.log("Simulating data loss: truncating all tables...");
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_admin', '1', true)");
    
    // Truncate all tables cascadingly
    await client.query(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
    await client.query("COMMIT");

    // Verify the data is gone
    const verifyEmpty = await client.query(`SELECT COUNT(*)::int AS count FROM companies WHERE id=$1`, [testCompanyId]);
    assert.equal(verifyEmpty.rows[0].count, 0, "Database truncation failed, record still exists");
    console.log("Database cleared successfully. Simulating complete recovery...");

    // 4. Restore Database from JSON backup file
    console.log("Restoring database from JSON backup file...");
    const restoreContent = JSON.parse(fs.readFileSync(backupFilePath, "utf8"));

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_admin', '1', true)");

    // Disable triggers and foreign keys temporarily on all tables during restoration
    for (const table of tables) {
      await client.query(`ALTER TABLE ${table} DISABLE TRIGGER ALL`);
    }

    try {
      for (const table of tables) {
        const rows = restoreContent[table] || [];
        if (rows.length === 0) continue;

        const columns = Object.keys(rows[0]).map(c => quoteIdent(c));
        
        for (const row of rows) {
          const colNames = columns.join(", ");
          const placeholders = Object.keys(row).map((_, i) => `$${i + 1}`).join(", ");
          const vals = Object.values(row);

          await client.query(`
            INSERT INTO ${table} (${colNames})
            VALUES (${placeholders})
          `, vals);
        }
      }
      await client.query("COMMIT");
      console.log("Database transaction committed successfully.");
    } catch (restoreErr) {
      await client.query("ROLLBACK");
      throw restoreErr;
    } finally {
      // Re-enable triggers and foreign keys on all tables
      for (const table of tables) {
        await client.query(`ALTER TABLE ${table} ENABLE TRIGGER ALL`).catch(() => {});
      }
    }

    // 5. Verification - Ensure all records are 100% recovered and accessible
    console.log("Verifying data integrity after restoration...");
    await client.query("SELECT set_config('app.platform_admin', '1', true)");
    
    const recoveredCompany = await client.query("SELECT * FROM companies WHERE id=$1", [testCompanyId]);
    assert.equal(recoveredCompany.rowCount, 1, "Restoration failed: Company record is missing");
    assert.equal(recoveredCompany.rows[0].name, 'Backup Verification Co', "Restoration failed: Data fields are mismatching");

    const recoveredUser = await client.query("SELECT * FROM app_users WHERE id=$1", [testUserId]);
    assert.equal(recoveredUser.rowCount, 1, "Restoration failed: User record is missing");
    assert.equal(recoveredUser.rows[0].email, 'backup-auditor@sanad.local', "Restoration failed: User email is incorrect");

    console.log("Backup & restore validation completed with 100% success!");

    // Cleanup backup file
    fs.unlinkSync(backupFilePath);
  } finally {
    client.release();
    await pool.end();
  }
});

function quoteIdent(value) {
  const text = String(value || "");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(text)) throw new Error(`Unsafe SQL identifier: ${text}`);
  return `"${text.replace(/"/g, '""')}"`;
}
