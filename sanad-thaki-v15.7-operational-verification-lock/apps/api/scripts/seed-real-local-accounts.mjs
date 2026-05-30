import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";

// Load root .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", "..", "..", ".env");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

// Override settings for local development provisioning
process.env.NODE_ENV = "development";
process.env.REQUIRE_DATABASE_PER_TENANT = "true";
process.env.PROVISIONING_MODE = "dedicated-db";
process.env.SECRETS_PROVIDER = "local";
process.env.LOCAL_TENANT_SECRET_DIR = ".tenant-secrets";
process.env.PROVISIONING_CLEAN_ORPHANS = "true"; // Allow re-running the seed

// Load app core modules dynamically after process.env is set
const { runMigrationsOnUrl } = await import("../src/migrate-core.js");
const { provisionTenant } = await import("../src/provisioning.js");

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

console.log("Control Database URL:", databaseUrl);

// A. Run Control DB Migrations
console.log("Running control database migrations...");
await runMigrationsOnUrl(databaseUrl, "control");
console.log("Control migrations applied successfully.");

// B. Seed SANAD_ADMIN (Platform Operator)
const controlClient = new Client({ connectionString: databaseUrl });
await controlClient.connect();
try {
  await controlClient.query("BEGIN");
  await controlClient.query("SELECT set_config('app.platform_admin', '1', true)");
  
  const platformEmail = "platform-admin@sanad.local";
  const platformPasswordHash = await bcrypt.hash("ChangeMe123!Secure", 12);
  
  await controlClient.query("DELETE FROM platform_admins WHERE id='platform-admin-main' OR email=$1", [platformEmail]);
  
  await controlClient.query(
    `INSERT INTO platform_admins (id, email, password_hash, role, is_active)
     VALUES ('platform-admin-main', $1, $2, 'SANAD_ADMIN', true)`,
    [platformEmail, platformPasswordHash]
  );
  console.log("Seeded platform admin:", platformEmail);
  await controlClient.query("COMMIT");
} catch (err) {
  await controlClient.query("ROLLBACK").catch(() => {});
  console.error("Platform admin seeding failed:", err.message);
  process.exit(1);
} finally {
  await controlClient.end();
}

// C. Provision Tenant (Company Admin)
console.log("Creating company in control database...");
const controlClient3 = new Client({ connectionString: databaseUrl });
await controlClient3.connect();
try {
  await controlClient3.query("BEGIN");
  await controlClient3.query("SELECT set_config('app.platform_admin', '1', true)");
  
  // Clear existing company to allow clean recreation
  await controlClient3.query("DELETE FROM companies WHERE id = 'company-demo-local'");
  
  await controlClient3.query(
    `INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
    ["company-demo-local", "شركة سند ذكي التجريبية", "300000000000003", "demo@sanad.local", "الرياض", "ACTIVE", "professional", 1200, 800]
  );
  await controlClient3.query("COMMIT");
  console.log("Company company-demo-local registered in control database.");
} catch (err) {
  await controlClient3.query("ROLLBACK").catch(() => {});
  console.error("Failed to register company in control DB:", err.message);
  process.exit(1);
} finally {
  await controlClient3.end();
}

console.log("Provisioning tenant company-demo-local...");
const adminPasswordHash = await bcrypt.hash("ChangeMe123!Secure", 12);
const seedData = {
  company: {
    id: "company-demo-local",
    name: "شركة سند ذكي التجريبية",
    tax_number: "300000000000003",
    email: "demo@sanad.local",
    city: "الرياض",
    status: "ACTIVE",
    package_code: "professional",
    invoice_monthly_limit: 1200,
    whatsapp_monthly_limit: 800,
    is_active: true
  },
  adminUser: {
    id: "u-admin-demo",
    name: "مدير النظام (أدمن)",
    email: "admin@company.local",
    password_hash: adminPasswordHash,
    role: "ADMIN",
    password_must_change: false
  }
};

try {
  const result = await provisionTenant({
    companyId: "company-demo-local",
    seed: seedData
  });
  console.log("Tenant provisioned successfully:", result);
} catch (err) {
  console.error("Tenant provisioning failed:", err.message);
  process.exit(1);
}

// D. Seed CFO and Accountant in company-demo-local Database
const tenantUrl = `postgres://postgres:123456@127.0.0.1:5432/sanad_company_demo_local?sslmode=disable`;
console.log("Connecting to tenant database:", tenantUrl);
const tenantClient = new Client({ connectionString: tenantUrl });
await tenantClient.connect();

const cfoPasswordHash = await bcrypt.hash("ChangeMe123!Secure", 12);
const accountantPasswordHash = await bcrypt.hash("ChangeMe123!Secure", 12);

try {
  await tenantClient.query("BEGIN");
  await tenantClient.query("SELECT set_config('app.company_id', 'company-demo-local', true)");
  await tenantClient.query("SELECT set_config('app.current_company_id', 'company-demo-local', true)");
  
  // Seed CFO user
  await tenantClient.query(
    `INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change)
     VALUES ('u-cfo-demo', 'company-demo-local', 'المدير المالي (CFO)', 'cfo@company.local', $1, 'FINANCE_MANAGER', true, 'ACTIVE', false)
     ON CONFLICT (email) DO UPDATE SET password_hash=excluded.password_hash, role='FINANCE_MANAGER'`,
    [cfoPasswordHash]
  );
  console.log("Seeded CFO user: cfo@company.local");

  // Seed Accountant user
  await tenantClient.query(
    `INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change)
     VALUES ('u-accountant-demo', 'company-demo-local', 'المحاسب (Accountant)', 'accountant@company.local', $1, 'ACCOUNTANT', true, 'ACTIVE', false)
     ON CONFLICT (email) DO UPDATE SET password_hash=excluded.password_hash, role='ACCOUNTANT'`,
    [accountantPasswordHash]
  );
  console.log("Seeded Accountant user: accountant@company.local");
  
  await tenantClient.query("COMMIT");
} catch (err) {
  await tenantClient.query("ROLLBACK").catch(() => {});
  console.error("Tenant users seeding failed:", err.message);
  process.exit(1);
} finally {
  await tenantClient.end();
}

// E. Map Tenant Users in user_directory (Control DB)
const controlClient2 = new Client({ connectionString: databaseUrl });
await controlClient2.connect();
try {
  await controlClient2.query("BEGIN");
  await controlClient2.query("SELECT set_config('app.platform_admin', '1', true)");
  
  await controlClient2.query(
    `INSERT INTO user_directory (email_lower, company_id, user_id, is_active)
     VALUES ('cfo@company.local', 'company-demo-local', 'u-cfo-demo', true)
     ON CONFLICT (email_lower) DO UPDATE SET company_id=excluded.company_id, user_id=excluded.user_id, is_active=true`
  );
  await controlClient2.query(
    `INSERT INTO user_directory (email_lower, company_id, user_id, is_active)
     VALUES ('accountant@company.local', 'company-demo-local', 'u-accountant-demo', true)
     ON CONFLICT (email_lower) DO UPDATE SET company_id=excluded.company_id, user_id=excluded.user_id, is_active=true`
  );
  
  // Set correct rolled-up count
  await controlClient2.query(
    `UPDATE tenant_rollups SET user_count = 3 WHERE company_id = 'company-demo-local'`
  );
  
  await controlClient2.query("COMMIT");
  console.log("User directory mapping completed.");
} catch (err) {
  await controlClient2.query("ROLLBACK").catch(() => {});
  console.error("User directory mapping failed:", err.message);
  process.exit(1);
} finally {
  await controlClient2.end();
}

console.log("\n=======================================================");
console.log("All accounts seeded successfully! Logins available:");
console.log("- Platform Admin: platform-admin@sanad.local / ChangeMe123!Secure");
console.log("- Company Admin: admin@company.local / ChangeMe123!Secure");
console.log("- CFO: cfo@company.local / ChangeMe123!Secure");
console.log("- Accountant: accountant@company.local / ChangeMe123!Secure");
console.log("=======================================================");

process.exit(0);
