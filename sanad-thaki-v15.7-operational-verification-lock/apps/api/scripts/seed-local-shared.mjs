import pg from "pg";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:123456@127.0.0.1:5432/postgres?sslmode=disable";

async function main() {
  console.log("Seeding all local development accounts for shared-dev mode...");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");
    
    // 1. Enable Platform Admin scope for setup
    await client.query("SELECT set_config('app.platform_admin', '1', true)");

    // 2. Clear old demo data
    await client.query("DELETE FROM platform_admins WHERE email = 'platform-admin@sanad.local'");
    await client.query("DELETE FROM user_directory WHERE email_lower IN ('admin@company.local', 'cfo@company.local', 'accountant@company.local', 'admin@sanad.local')");
    await client.query("DELETE FROM companies WHERE id = 'company-demo'");

    // 3. Seed Platform Admin
    const platformPasswordHash = await bcrypt.hash("ChangeMe123!Secure", 12);
    await client.query(`
      INSERT INTO platform_admins (id, email, password_hash, role, is_active)
      VALUES ('platform-admin-main', 'platform-admin@sanad.local', $1, 'SANAD_ADMIN', true)
      ON CONFLICT (id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash, is_active = true
    `, [platformPasswordHash]);
    console.log("✔ Seeded Platform Admin: platform-admin@sanad.local");

    // 4. Seed Demo Company
    await client.query(`
      INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
      VALUES ('company-demo', 'شركة سند ذكي التجريبية', '300000000000003', 'demo@sanad.local', 'الرياض', 'ACTIVE', 'professional', 1200, 800, true)
    `);
    console.log("✔ Seeded Company: company-demo");

    // Set Tenant Scope for app_users inserts
    await client.query("SELECT set_config('app.company_id', 'company-demo', true)");

    // 5. Seed Company Users
    const sharedPasswordHash = await bcrypt.hash("ChangeMe123!Secure", 12);

    // Admin
    await client.query(`
      INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change)
      VALUES ('u-admin-demo', 'company-demo', 'أدمن النظام', 'admin@company.local', $1, 'ADMIN', true, 'ACTIVE', false)
      ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash, role = 'ADMIN', is_active = true
    `, [sharedPasswordHash]);
    console.log("✔ Seeded Company Admin: admin@company.local");

    // CFO
    await client.query(`
      INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change)
      VALUES ('u-cfo-demo', 'company-demo', 'المدير المالي', 'cfo@company.local', $1, 'FINANCE_MANAGER', true, 'ACTIVE', false)
      ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash, role = 'FINANCE_MANAGER', is_active = true
    `, [sharedPasswordHash]);
    console.log("✔ Seeded CFO: cfo@company.local");

    // Accountant
    await client.query(`
      INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change)
      VALUES ('u-accountant-demo', 'company-demo', 'المحاسب', 'accountant@company.local', $1, 'ACCOUNTANT', true, 'ACTIVE', false)
      ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash, role = 'ACCOUNTANT', is_active = true
    `, [sharedPasswordHash]);
    console.log("✔ Seeded Accountant: accountant@company.local");

    // 6. Map all users in User Directory
    await client.query("SELECT set_config('app.platform_admin', '1', true)");
    
    await client.query(`
      INSERT INTO user_directory (email_lower, company_id, user_id, is_active)
      VALUES 
        ('admin@company.local', 'company-demo', 'u-admin-demo', true),
        ('cfo@company.local', 'company-demo', 'u-cfo-demo', true),
        ('accountant@company.local', 'company-demo', 'u-accountant-demo', true)
      ON CONFLICT (email_lower) DO UPDATE SET company_id = excluded.company_id, user_id = excluded.user_id, is_active = true
    `);
    console.log("✔ Mapped all users in global directory successfully");

    // 7. Update tenant rollups
    await client.query(`
      INSERT INTO tenant_rollups (company_id, invoice_count, whatsapp_count, open_tickets, user_count)
      VALUES ('company-demo', 0, 0, 0, 3)
      ON CONFLICT (company_id) DO UPDATE SET user_count = 3
    `);

    await client.query("COMMIT");
    console.log("\n=======================================================");
    console.log("All shared-dev seed accounts are ready!");
    console.log("- Platform Admin: platform-admin@sanad.local / ChangeMe123!Secure");
    console.log("- Company Admin: admin@company.local / ChangeMe123!Secure");
    console.log("- CFO: cfo@company.local / ChangeMe123!Secure");
    console.log("- Accountant: accountant@company.local / ChangeMe123!Secure");
    console.log("=======================================================");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Seeding failed:", err.message);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
