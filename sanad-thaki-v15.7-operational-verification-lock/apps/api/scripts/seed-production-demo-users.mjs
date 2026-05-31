import pg from "pg";
import bcrypt from "bcryptjs";

const { Client } = pg;
const url = process.env.DATABASE_URL || "postgres://postgres:123456@127.0.0.1:5432/postgres?sslmode=disable";

const usersToSeed = [
  {
    id: "user-owner-demo",
    name: "مالك المنشأة",
    email: "owner@company.com",
    password: "OwnerSecurePass123",
    role: "OWNER",
    type: "CLIENT"
  },
  {
    id: "user-admin-demo",
    name: "مدير النظام",
    email: "admin@company.com",
    password: "AdminSecurePass123",
    role: "ADMIN",
    type: "CLIENT"
  },
  {
    id: "user-cfo-demo",
    name: "المدير المالي",
    email: "cfo@company.com",
    password: "CfoSecurePass123",
    role: "FINANCE_MANAGER",
    type: "CLIENT"
  },
  {
    id: "user-accountant-demo",
    name: "المحاسب",
    email: "accountant@company.com",
    password: "AccSecurePass123",
    role: "ACCOUNTANT",
    type: "CLIENT"
  },
  {
    id: "user-member-demo",
    name: "عضو المنصة",
    email: "member@company.com",
    password: "MemberSecurePass123",
    role: "MEMBER",
    type: "CLIENT"
  },
  {
    id: "platform-admin-main",
    name: "مدير المنصة",
    email: "platform.admin@sanad.sa",
    password: "AdminSecurePass123",
    role: "SANAD_ADMIN",
    type: "PLATFORM"
  }
];

async function seed() {
  console.log("Connecting to database at:", url);
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    
    // Clear old data
    console.log("Cleaning database tables...");
    await client.query("SELECT set_config('app.login_lookup', '1', true)");
    await client.query("DELETE FROM platform_admins");
    await client.query("DELETE FROM auth_sessions");
    await client.query("DELETE FROM user_directory");
    await client.query("DELETE FROM app_users");
    await client.query("DELETE FROM companies");

    // 1. Seed Company
    const companyId = "company-demo-tenant";
    console.log(`Seeding company ${companyId}...`);
    await client.query(`
      INSERT INTO companies (id, name, tax_number, email, city, is_active)
      VALUES ($1, 'شركة سند ذكي التجريبية', '300000000000003', 'demo@sanad.local', 'الرياض', true)
      ON CONFLICT (id) DO UPDATE SET name=excluded.name, is_active=true
    `, [companyId]);

    // Set config so RLS doesn't block insertion of client users
    await client.query("SELECT set_config('app.company_id', $1, true)", [companyId]);

    // 2. Seed Users
    for (const u of usersToSeed) {
      console.log(`Seeding user: ${u.email} (${u.role})...`);
      const hash = await bcrypt.hash(u.password, 12);
      
      if (u.type === "PLATFORM") {
        await client.query(`
          INSERT INTO platform_admins (id, email, password_hash, role, is_active)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (email) DO UPDATE SET password_hash=excluded.password_hash, is_active=true
        `, [u.id, u.email, hash, u.role]);
      } else {
        await client.query(`
          INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change)
          VALUES ($1, $2, $3, $4, $5, $6, true, 'ACTIVE', false)
          ON CONFLICT (email) DO UPDATE SET password_hash=excluded.password_hash, role=excluded.role, is_active=true, user_status='ACTIVE', password_must_change=false
        `, [u.id, companyId, u.name, u.email, hash, u.role]);

        // Seed user_directory
        await client.query(`
          INSERT INTO user_directory (email_lower, company_id, user_id, is_active)
          VALUES (lower($1), $2, $3, true)
          ON CONFLICT (email_lower) DO UPDATE SET company_id=excluded.company_id, user_id=excluded.user_id, is_active=true
        `, [u.email, companyId, u.id]);
      }
    }

    await client.query("COMMIT");
    console.log("Seeding completed successfully!");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Seeding failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
