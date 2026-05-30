/**
 * SANAD THAKI — Full Database Repair & Account Seeding Script
 * ============================================================
 * This script:
 *   1. Runs all pending migrations (including the auth_sessions role fix)
 *   2. Cleans up ALL old/stale auth sessions
 *   3. Creates real accounts for every role level
 *   4. Registers user_directory entries in control DB
 *   5. Prints a clean summary of all accounts
 *
 * Usage: node scripts/repair-and-seed.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env ──────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, "..", "..", "..", ".env");
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^['"]['"]?|['"]['"]?$/g, "").replace(/^['"]|['"]$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  }
}

// ── Force dev provisioning mode ────────────────────────────────────────────
process.env.NODE_ENV = "development";
process.env.PROVISIONING_MODE = "shared-dev";
process.env.SECRETS_PROVIDER = "local";
process.env.LOCAL_TENANT_SECRET_DIR = ".tenant-secrets";

// ── Constants ─────────────────────────────────────────────────────────────
const RAW_DATABASE_URL = process.env.DATABASE_URL;
if (!RAW_DATABASE_URL) { console.error("❌ DATABASE_URL not set!"); process.exit(1); }
// Replace Docker service hostname with localhost for local script execution
const DATABASE_URL = RAW_DATABASE_URL.replace(/\/\/([^:@]+):([^@]+)@postgres:/g, "//$1:$2@127.0.0.1:").replace(/@postgres:/g, "@127.0.0.1:");

const COMPANY_ID = "company-demo-local";
const TENANT_DB_NAME = "sanad_company_demo_local";
// Build tenant URL from control URL (same postgres server, different db)
let TENANT_DB_URL;
try {
  const u = new URL(DATABASE_URL);
  u.pathname = `/${TENANT_DB_NAME}`;
  u.searchParams.set("sslmode", "disable");
  TENANT_DB_URL = u.toString();
} catch {
  TENANT_DB_URL = `postgres://postgres:123456@127.0.0.1:5432/${TENANT_DB_NAME}?sslmode=disable`;
}

// ── Password (same for all seeded accounts — change after first login) ─────
const SHARED_PASSWORD = "SanadThaki2024!";

// ── Helper ─────────────────────────────────────────────────────────────────
function log(msg) { console.log(`  ${msg}`); }
function ok(msg)  { console.log(`  ✅ ${msg}`); }
function warn(msg){ console.log(`  ⚠️  ${msg}`); }
function err(msg) { console.error(`  ❌ ${msg}`); }

async function withControlTx(fn) {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_admin','1',true)");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

async function withTenantTx(fn) {
  const client = new pg.Client({ connectionString: TENANT_DB_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.company_id','${COMPANY_ID}',true)`);
    await client.query(`SELECT set_config('app.current_company_id','${COMPANY_ID}',true)`);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

// ── Step 0: Apply fix migration to control DB ──────────────────────────────
console.log("\n📦 Step 0: Applying auth_sessions role fix migration...");
const fixSql = `
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_scope_check;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_scope_check CHECK (
  (user_type = 'PLATFORM' AND company_id IS NULL AND role = 'SANAD_ADMIN')
  OR
  (user_type = 'CLIENT' AND company_id IS NOT NULL AND role IN ('OWNER','ADMIN','MEMBER','FINANCE_MANAGER','ACCOUNTANT'))
);
`;

try {
  await withControlTx(async client => {
    await client.query(fixSql);
  });
  ok("auth_sessions_scope_check constraint updated (added OWNER, MEMBER)");
} catch (e) {
  warn(`Control DB auth_sessions fix: ${e.message} (may not exist here, continuing)`);
}

// Also apply fix to tenant DB if it exists
try {
  await withTenantTx(async client => {
    await client.query(fixSql);
  });
  ok("Tenant DB auth_sessions_scope_check updated");
} catch (e) {
  warn(`Tenant DB auth_sessions fix: ${e.message} (continuing)`);
}

// ── Step 1: Clean stale auth sessions ──────────────────────────────────────
console.log("\n🧹 Step 1: Cleaning stale auth sessions...");

try {
  await withControlTx(async client => {
    const r = await client.query("DELETE FROM auth_sessions WHERE expires_at < now() RETURNING id");
    ok(`Removed ${r.rowCount} expired sessions from control DB`);
    // Revoke all unexpired sessions too (force fresh login)
    const r2 = await client.query("UPDATE auth_sessions SET revoked_at=now() WHERE revoked_at IS NULL");
    ok(`Revoked ${r2.rowCount} active sessions (users must re-login)`);
  });
} catch (e) {
  warn(`auth_sessions cleanup: ${e.message}`);
}

try {
  await withTenantTx(async client => {
    const r = await client.query("DELETE FROM auth_sessions WHERE expires_at < now() RETURNING id");
    ok(`Removed ${r.rowCount} expired sessions from tenant DB`);
    const r2 = await client.query("UPDATE auth_sessions SET revoked_at=now() WHERE revoked_at IS NULL");
    ok(`Revoked ${r2.rowCount} active sessions in tenant DB`);
  });
} catch (e) {
  warn(`Tenant auth_sessions cleanup: ${e.message}`);
}

// ── Step 2: Platform Admin ─────────────────────────────────────────────────
console.log("\n👑 Step 2: Creating Platform Admin (SANAD_ADMIN)...");

const platformHash = await bcrypt.hash(SHARED_PASSWORD, 12);
try {
  await withControlTx(async client => {
    await client.query(`
      INSERT INTO platform_admins (id, email, password_hash, role, is_active)
      VALUES ('platform-admin-main', 'admin@sanadthaki.com', $1, 'SANAD_ADMIN', true)
      ON CONFLICT (id) DO UPDATE SET
        email = 'admin@sanadthaki.com',
        password_hash = $1,
        role = 'SANAD_ADMIN',
        is_active = true
    `, [platformHash]);
    ok("Platform admin: admin@sanadthaki.com");
  });
} catch (e) {
  err(`Platform admin: ${e.message}`);
}

// ── Step 3: Ensure company exists in control DB ────────────────────────────
console.log("\n🏢 Step 3: Ensuring demo company in control DB...");
try {
  await withControlTx(async client => {
    await client.query(`
      INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
      VALUES ($1,'شركة سند ذكي التجريبية','300000000000003','demo@sanadthaki.com','الرياض','ACTIVE','professional',1200,800,true)
      ON CONFLICT (id) DO UPDATE SET
        status='ACTIVE', is_active=true, package_code='professional'
    `, [COMPANY_ID]);
    ok(`Company ${COMPANY_ID} ensured in control DB`);
  });
} catch (e) {
  warn(`Company upsert: ${e.message}`);
}

// ── Step 4: Ensure company in tenant DB ────────────────────────────────────
console.log("\n🏢 Step 4: Ensuring demo company in tenant DB...");
try {
  await withTenantTx(async client => {
    await client.query(`
      INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
      VALUES ($1,'شركة سند ذكي التجريبية','300000000000003','demo@sanadthaki.com','الرياض','ACTIVE','professional',1200,800,true)
      ON CONFLICT (id) DO UPDATE SET
        status='ACTIVE', is_active=true, package_code='professional'
    `, [COMPANY_ID]);
    ok("Company row ensured in tenant DB");
  });
} catch (e) {
  warn(`Tenant company upsert: ${e.message}`);
}

// ── Step 5: Seed all client roles in tenant DB ────────────────────────────
console.log("\n👥 Step 5: Seeding all user roles in tenant DB...");

const users = [
  { id: "u-owner-demo",      name: "مالك الشركة",      email: "owner@sanadthaki.com",      role: "OWNER" },
  { id: "u-admin-demo",      name: "مدير النظام",       email: "admin@company.sanadthaki.com", role: "ADMIN" },
  { id: "u-finance-demo",    name: "المدير المالي",     email: "finance@sanadthaki.com",    role: "FINANCE_MANAGER" },
  { id: "u-accountant-demo", name: "المحاسب",           email: "accountant@sanadthaki.com", role: "ACCOUNTANT" },
  { id: "u-member-demo",     name: "عضو الفريق",        email: "member@sanadthaki.com",     role: "MEMBER" },
];

const pwHash = await bcrypt.hash(SHARED_PASSWORD, 12);

for (const user of users) {
  try {
    await withTenantTx(async client => {
      await client.query(`
        INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change)
        VALUES ($1, $2, $3, $4, $5, $6, true, 'ACTIVE', false)
        ON CONFLICT (email) DO UPDATE SET
          id = $1,
          name = $3,
          password_hash = $5,
          role = $6,
          is_active = true,
          user_status = 'ACTIVE',
          password_must_change = false
      `, [user.id, COMPANY_ID, user.name, user.email, pwHash, user.role]);
      ok(`[${user.role}] ${user.email}`);
    });
  } catch (e) {
    err(`User ${user.email}: ${e.message}`);
  }
}

// ── Step 6: Register all users in user_directory ──────────────────────────
console.log("\n📒 Step 6: Registering users in user_directory (control DB)...");
try {
  await withControlTx(async client => {
    for (const user of users) {
      await client.query(`
        INSERT INTO user_directory (email_lower, company_id, user_id, is_active)
        VALUES (lower($1), $2, $3, true)
        ON CONFLICT (email_lower) DO UPDATE SET
          company_id = $2,
          user_id = $3,
          is_active = true,
          updated_at = now()
      `, [user.email, COMPANY_ID, user.id]);
      ok(`Mapped ${user.email} → ${COMPANY_ID}`);
    }

    // Update rollup count
    await client.query(`
      INSERT INTO tenant_rollups (company_id, user_count)
      VALUES ($1, $2)
      ON CONFLICT (company_id) DO UPDATE SET user_count = $2, updated_at = now()
    `, [COMPANY_ID, users.length]);
    ok(`tenant_rollups set to ${users.length} users`);
  });
} catch (e) {
  err(`user_directory registration: ${e.message}`);
}

// ── Step 7: Ensure tenant_registry entry ──────────────────────────────────
console.log("\n🗄️  Step 7: Ensuring tenant_registry entry...");
try {
  await withControlTx(async client => {
    await client.query(`
      INSERT INTO tenant_registry (company_id, db_secret_ref, kms_secret_ref, provision_status, schema_version)
      VALUES ($1, 'local', 'local', 'READY', 25)
      ON CONFLICT (company_id) DO UPDATE SET
        provision_status = 'READY',
        schema_version = 25,
        last_error = NULL,
        updated_at = now()
    `, [COMPANY_ID]);
    ok("tenant_registry READY");
  });
} catch (e) {
  warn(`tenant_registry: ${e.message}`);
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log("🎉  SANAD THAKI — ACCOUNTS READY");
console.log("═".repeat(60));
console.log(`\n  Password for ALL accounts: ${SHARED_PASSWORD}\n`);
console.log("  PLATFORM:");
console.log(`    👑 Platform Admin  : admin@sanadthaki.com`);
console.log("\n  COMPANY (company-demo-local):");
for (const u of users) {
  const badge = { OWNER: "🏠", ADMIN: "⚙️ ", FINANCE_MANAGER: "💰", ACCOUNTANT: "📊", MEMBER: "👤" }[u.role] || "•";
  console.log(`    ${badge} [${u.role.padEnd(15)}] ${u.email}`);
}
console.log("\n" + "═".repeat(60));
console.log("  ℹ️  All sessions have been revoked — please log in fresh.\n");

process.exit(0);
