-- v15.1 Commercial Requirements Lock - tenant database
-- Adds password reset, integration-key tracking, tenant crypto version metadata, and mapping maintenance columns.

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  requested_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_live
  ON password_reset_codes(company_id, user_id, expires_at DESC)
  WHERE used_at IS NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_key_version int;
ALTER TABLE invoice_processing_jobs ADD COLUMN IF NOT EXISTS tenant_key_version int;
ALTER TABLE integration_api_keys ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE integration_api_keys ADD COLUMN IF NOT EXISTS disabled_reason text;
ALTER TABLE bank_statement_column_mappings ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE password_reset_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_codes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS password_reset_codes_isolation ON password_reset_codes;
CREATE POLICY password_reset_codes_isolation ON password_reset_codes
  USING (company_id = current_setting('app.company_id', true) OR current_setting('app.login_lookup', true) = '1')
  WITH CHECK (company_id = current_setting('app.company_id', true) OR current_setting('app.login_lookup', true) = '1');
