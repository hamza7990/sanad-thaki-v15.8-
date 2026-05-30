-- v15.10 Billing Transactions History table
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
);

-- Enable RLS
ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_transactions FORCE ROW LEVEL SECURITY;

-- Tenant Isolation Policy
DROP POLICY IF EXISTS billing_transactions_tenant_isolation ON billing_transactions;
CREATE POLICY billing_transactions_tenant_isolation ON billing_transactions
  FOR ALL USING (company_id = current_setting('app.company_id', true));

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS billing_transactions_company_idx ON billing_transactions(company_id, created_at DESC);
