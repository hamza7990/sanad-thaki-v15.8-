-- v15.3 Production Hardening Lock - control database
-- Tracks the current schema version and gives operators better production observability.

ALTER TABLE tenant_registry ADD COLUMN IF NOT EXISTS last_schema_migrated_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_tenant_registry_status_schema ON tenant_registry(provision_status, schema_version);

CREATE TABLE IF NOT EXISTS production_acceptance_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL CHECK (status IN ('STARTED','PASSED','FAILED')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE production_acceptance_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_acceptance_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_acceptance_runs_platform ON production_acceptance_runs;
CREATE POLICY production_acceptance_runs_platform ON production_acceptance_runs
  USING (current_setting('app.platform_admin', true) = '1')
  WITH CHECK (current_setting('app.platform_admin', true) = '1');
