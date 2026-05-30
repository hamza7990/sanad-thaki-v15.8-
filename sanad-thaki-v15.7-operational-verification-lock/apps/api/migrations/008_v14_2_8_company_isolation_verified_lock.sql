-- v14.2.8 Company Isolation Verified Lock
-- Purpose: keep integration API keys protected by RLS while allowing lookup only through
-- a short-lived backend-only transaction context. The client still cannot supply company_id.

ALTER TABLE integration_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_api_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_api_keys_backend_lookup ON integration_api_keys;
CREATE POLICY integration_api_keys_backend_lookup ON integration_api_keys FOR SELECT
  USING (current_setting('app.integration_lookup', true) = '1');

-- Keep tenant isolation for all normal company operations.
DROP POLICY IF EXISTS integration_api_keys_isolation ON integration_api_keys;
CREATE POLICY integration_api_keys_isolation ON integration_api_keys
  USING (company_id = current_setting('app.company_id', true))
  WITH CHECK (company_id = current_setting('app.company_id', true));
