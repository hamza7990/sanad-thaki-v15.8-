CREATE TABLE IF NOT EXISTS invoice_processing_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by text REFERENCES app_users(id),
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_bytes int NOT NULL DEFAULT 0 CHECK (file_bytes >= 0),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','PASSED','PENDING_REVIEW','FAILED')),
  encrypted_upload text NOT NULL,
  tenant_crypto_version text NOT NULL DEFAULT 'tenant-aes-256-gcm-v1',
  extracted_json jsonb,
  confidence numeric(5,4),
  review_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  processing_started_at timestamptz,
  processing_finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_processing_jobs_company_status_created
  ON invoice_processing_jobs(company_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_invoice_processing_jobs_queue
  ON invoice_processing_jobs(status, attempts, created_at);

ALTER TABLE invoice_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_processing_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_processing_jobs_isolation ON invoice_processing_jobs;
CREATE POLICY invoice_processing_jobs_isolation ON invoice_processing_jobs
  USING (company_id = current_setting('app.company_id', true))
  WITH CHECK (company_id = current_setting('app.company_id', true));
