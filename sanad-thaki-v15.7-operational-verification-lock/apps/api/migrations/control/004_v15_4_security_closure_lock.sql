-- v15.4 Security Closure Lock - control database
-- Adds operational metadata required for key-scoped rate limiting and safer integration-key incident response.

ALTER TABLE integration_key_directory ADD COLUMN IF NOT EXISTS last_used_ip text;
ALTER TABLE integration_key_directory ADD COLUMN IF NOT EXISTS failure_count int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_integration_key_directory_last_used
  ON integration_key_directory(is_active, last_used_at);

CREATE TABLE IF NOT EXISTS dangerous_operation_confirmations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL,
  operation text NOT NULL,
  actor_id text,
  confirmed_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dangerous_operation_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dangerous_operation_confirmations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dangerous_operation_confirmations_platform ON dangerous_operation_confirmations;
CREATE POLICY dangerous_operation_confirmations_platform ON dangerous_operation_confirmations
  USING (current_setting('app.platform_admin', true) = '1')
  WITH CHECK (current_setting('app.platform_admin', true) = '1');
