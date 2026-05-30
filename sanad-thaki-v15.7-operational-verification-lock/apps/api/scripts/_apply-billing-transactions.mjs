import pg from 'pg';

const tenantUrl = 'postgres://postgres:123456@127.0.0.1:5432/sanad_company_demo_local?sslmode=disable';
const client = new pg.Client({ connectionString: tenantUrl });
await client.connect();

await client.query("SELECT set_config('app.company_id', 'company-demo-local', true)");

// Apply billing_transactions table
await client.query(`
  CREATE TABLE IF NOT EXISTS billing_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_code text NOT NULL,
    plan_label text NOT NULL,
    amount_sar numeric(10,2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID','FAILED','PENDING','REFUNDED')),
    invoice_number text NOT NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`);

await client.query(`ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY`);
await client.query(`ALTER TABLE billing_transactions FORCE ROW LEVEL SECURITY`);
await client.query(`DROP POLICY IF EXISTS billing_transactions_tenant_isolation ON billing_transactions`);
await client.query(`
  CREATE POLICY billing_transactions_tenant_isolation ON billing_transactions
    FOR ALL USING (company_id = current_setting('app.company_id', true))
`);
await client.query(`CREATE INDEX IF NOT EXISTS billing_transactions_company_idx ON billing_transactions(company_id, created_at DESC)`);

// Insert initial record based on current company plan
const companyRes = await client.query(`SELECT id, package_code FROM companies WHERE id='company-demo-local' LIMIT 1`);
if (companyRes.rows.length > 0) {
  const company = companyRes.rows[0];
  const planLabels = {
    basic: { label: 'الأساسية', price: 99 },
    growth: { label: 'النمو', price: 249 },
    professional: { label: 'الاحترافية', price: 499 },
  };
  const plan = planLabels[company.package_code] || { label: company.package_code, price: 0 };
  
  await client.query(`
    INSERT INTO billing_transactions (company_id, plan_code, plan_label, amount_sar, status, invoice_number, notes)
    VALUES ($1, $2, $3, $4, 'PAID', $5, 'اشتراك أولي عند إنشاء الحساب')
    ON CONFLICT DO NOTHING
  `, [company.id, company.package_code, plan.label, plan.price, `SUB-${company.package_code.toUpperCase()}-INIT`]);
  console.log(`✅ Created initial billing record for company: ${company.id}`);
}

await client.end();
console.log('✅ billing_transactions migration applied successfully');
