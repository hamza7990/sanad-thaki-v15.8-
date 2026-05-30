-- v15.4 Security Closure Lock - tenant database
-- Tracks integration-key usage/failures per tenant and supports safer incident response.

ALTER TABLE integration_api_keys ADD COLUMN IF NOT EXISTS last_used_ip text;
ALTER TABLE integration_api_keys ADD COLUMN IF NOT EXISTS failure_count int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_integration_api_keys_usage
  ON integration_api_keys(company_id, is_active, last_used_at);
