CREATE TABLE IF NOT EXISTS integration_api_keys (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['invoices:write'],
  is_active boolean NOT NULL DEFAULT true,
  created_by text REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integration_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_api_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_api_keys_isolation ON integration_api_keys;
CREATE POLICY integration_api_keys_isolation ON integration_api_keys
  USING (company_id = current_setting('app.company_id', true))
  WITH CHECK (company_id = current_setting('app.company_id', true));

-- v14.3.5 fix: integration API lookup may occur before tenant context is known.
DROP POLICY IF EXISTS integration_api_keys_lookup ON integration_api_keys;
CREATE POLICY integration_api_keys_lookup ON integration_api_keys FOR SELECT
  USING (current_setting('app.integration_lookup', true) = '1');
