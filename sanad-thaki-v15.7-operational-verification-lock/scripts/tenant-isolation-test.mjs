import pg from "pg";
import bcrypt from "bcryptjs";

const { Client } = pg;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();

const hash = await bcrypt.hash("ChangeMe123!Secure", 12);

async function seed(companyId, name, email) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.company_id', $1, true)", [companyId]);
  await client.query(
    "INSERT INTO companies (id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING",
    [companyId, name]
  );
  await client.query(
    `INSERT INTO app_users (id, company_id, email, password_hash, role)
     VALUES ($1,$1,$2,$3,'ACCOUNTANT') ON CONFLICT (email) DO NOTHING`,
    [companyId, email, hash]
  );
  await client.query(
    `INSERT INTO invoices (company_id, invoice_number, customer_name, supplier_tax_number, total_amount, status)
     VALUES ($1,$2,'عميل اختبار','300000000000003',100,'DRAFT')
     ON CONFLICT DO NOTHING`,
    [companyId, "INV-" + companyId]
  );
  await client.query("COMMIT");
}

await seed("company-a", "شركة أ", "a@sanad.local");
await seed("company-b", "شركة ب", "b@sanad.local");

// Setup non-superuser role to enforce RLS
await client.query("REVOKE SELECT ON invoices FROM sanad_test_user").catch(() => {});
await client.query("DROP ROLE IF EXISTS sanad_test_user").catch(() => {});
await client.query("CREATE ROLE sanad_test_user WITH LOGIN PASSWORD 'TestPassword123!'");
await client.query("GRANT SELECT ON invoices TO sanad_test_user");

const dbUrl = new URL(url);
dbUrl.username = "sanad_test_user";
dbUrl.password = "TestPassword123!";
const testUrl = dbUrl.toString();
const testClient = new Client({ connectionString: testUrl });
await testClient.connect();

async function visibleCount(companyId) {
  await testClient.query("BEGIN");
  await testClient.query("SELECT set_config('app.company_id', $1, true)", [companyId]);
  const res = await testClient.query("SELECT company_id, count(*)::int FROM invoices GROUP BY company_id ORDER BY company_id");
  await testClient.query("COMMIT");
  return res.rows;
}

const aRows = await visibleCount("company-a");
const bRows = await visibleCount("company-b");

await testClient.end();
await client.query("REVOKE SELECT ON invoices FROM sanad_test_user").catch(() => {});
await client.query("DROP ROLE IF EXISTS sanad_test_user").catch(() => {});
await client.end();

if (aRows.length !== 1 || aRows[0].company_id !== "company-a") {
  console.error("Isolation failed for company-a:", aRows);
  process.exit(1);
}
if (bRows.length !== 1 || bRows[0].company_id !== "company-b") {
  console.error("Isolation failed for company-b:", bRows);
  process.exit(1);
}

console.log("Tenant isolation test passed.");
