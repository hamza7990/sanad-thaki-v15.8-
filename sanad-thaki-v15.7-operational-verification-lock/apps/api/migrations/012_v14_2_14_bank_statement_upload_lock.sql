-- v14.2.14 Bank Statement Excel/CSV Upload Lock
-- Adds direct Finance Manager upload for bank statement files without Open Banking.

CREATE TABLE IF NOT EXISTS bank_statement_imports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_key text NOT NULL DEFAULT 'default',
  original_filename text NOT NULL,
  file_type text,
  total_rows int NOT NULL DEFAULT 0,
  imported_rows int NOT NULL DEFAULT 0,
  skipped_rows int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PROCESSING',
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS bank_statement_column_mappings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_key text NOT NULL DEFAULT 'default',
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, bank_key)
);

ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES bank_statement_imports(id) ON DELETE SET NULL;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS source_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_company_source_hash_uq
  ON bank_transactions(company_id, source_hash)
  WHERE source_hash IS NOT NULL;

ALTER TABLE bank_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_imports FORCE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_column_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_column_mappings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_statement_imports_isolation ON bank_statement_imports;
CREATE POLICY bank_statement_imports_isolation ON bank_statement_imports
  USING (company_id = current_setting('app.company_id', true))
  WITH CHECK (company_id = current_setting('app.company_id', true));

DROP POLICY IF EXISTS bank_statement_column_mappings_isolation ON bank_statement_column_mappings;
CREATE POLICY bank_statement_column_mappings_isolation ON bank_statement_column_mappings
  USING (company_id = current_setting('app.company_id', true))
  WITH CHECK (company_id = current_setting('app.company_id', true));
