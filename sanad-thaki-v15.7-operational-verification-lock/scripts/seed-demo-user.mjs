import pg from "pg";
import bcrypt from "bcryptjs";

const { Client } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_LOGIN !== "true") {
  console.error("Demo seed is blocked unless ALLOW_DEMO_LOGIN=true. Do not enable it in production.");
  process.exit(1);
}

const email = process.env.DEMO_ADMIN_EMAIL || "admin@sanad.local";
const password = process.env.DEMO_ADMIN_PASSWORD || "ChangeMe123!Secure";
const hash = await bcrypt.hash(password, 12);

const client = new Client({ connectionString: url });
await client.connect();

await client.query("BEGIN");
await client.query("SELECT set_config('app.company_id', 'company-demo', true)");
await client.query(`
  INSERT INTO companies (id, name, tax_number, email, city)
  VALUES ('company-demo', 'شركة سند ذكي التجريبية', '300000000000003', 'demo@sanad.local', 'الرياض')
  ON CONFLICT (id) DO NOTHING
`);
await client.query(`
  INSERT INTO app_users (id, company_id, email, password_hash, role)
  VALUES ('u-admin-demo', 'company-demo', $1, $2, 'ADMIN')
  ON CONFLICT (email) DO UPDATE SET password_hash=excluded.password_hash
`, [email, hash]);
await client.query("COMMIT");

await client.end();
console.log("Demo admin seeded:", email);
