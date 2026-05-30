-- v14.2.9 Database-per-Tenant Isolation Lock
-- Adds tenant metering and encrypted invoice payload columns while preserving existing core fields/UI.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS encrypted_payload text,
  ADD COLUMN IF NOT EXISTS tenant_crypto_version text;

CREATE TABLE IF NOT EXISTS tenant_usage_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metric text NOT NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_usage_events_company_isolation ON tenant_usage_events;
CREATE POLICY tenant_usage_events_company_isolation ON tenant_usage_events
  USING (company_id = current_setting('app.company_id', true))
  WITH CHECK (company_id = current_setting('app.company_id', true));

CREATE INDEX IF NOT EXISTS idx_tenant_usage_events_company_metric_date
  ON tenant_usage_events(company_id, metric, created_at DESC);
