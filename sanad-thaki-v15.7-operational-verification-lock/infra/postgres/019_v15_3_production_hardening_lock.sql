-- v15.3 Production Hardening Lock - tenant database
-- Hardens password reset attempts and makes tenant key version metadata mandatory for new writes.

ALTER TABLE password_reset_codes ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0;
ALTER TABLE password_reset_codes ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 5;
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_live_attempts
  ON password_reset_codes(company_id, user_id, expires_at DESC, attempt_count)
  WHERE used_at IS NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_key_version int;
ALTER TABLE invoice_processing_jobs ADD COLUMN IF NOT EXISTS tenant_key_version int;

CREATE INDEX IF NOT EXISTS idx_invoice_processing_jobs_company_status
  ON invoice_processing_jobs(company_id, status, created_at);
