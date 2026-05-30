-- v15.1 Commercial Requirements Lock - control database
-- Adds recoverability, tenant key rotation registry, integration key aging, and alert/ops metadata.

ALTER TABLE tenant_registry DROP CONSTRAINT IF EXISTS tenant_registry_provision_status_check;
ALTER TABLE tenant_registry ADD CONSTRAINT tenant_registry_provision_status_check
  CHECK (provision_status IN ('PENDING','MIGRATING','READY','FAILED','DISABLED','ROLLBACK_IN_PROGRESS'));
ALTER TABLE tenant_registry ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE tenant_registry ADD COLUMN IF NOT EXISTS last_reprovision_at timestamptz;

CREATE TABLE IF NOT EXISTS provision_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  step text NOT NULL,
  status text NOT NULL CHECK (status IN ('STARTED','PASSED','FAILED','ROLLED_BACK')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provision_audit_company_created ON provision_audit(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_key_versions (
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version int NOT NULL CHECK (version > 0),
  secret_ref text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY (company_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_tenant_key_version ON tenant_key_versions(company_id) WHERE active=true;

ALTER TABLE integration_key_directory ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE integration_key_directory ADD COLUMN IF NOT EXISTS disabled_reason text;

CREATE TABLE IF NOT EXISTS platform_alert_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  severity text NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  event_type text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE provision_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE provision_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provision_audit_platform ON provision_audit;
CREATE POLICY provision_audit_platform ON provision_audit
  USING (current_setting('app.platform_admin', true) = '1')
  WITH CHECK (current_setting('app.platform_admin', true) = '1');

ALTER TABLE tenant_key_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_key_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_key_versions_platform ON tenant_key_versions;
CREATE POLICY tenant_key_versions_platform ON tenant_key_versions
  USING (current_setting('app.platform_admin', true) = '1' OR current_setting('app.login_lookup', true) = '1')
  WITH CHECK (current_setting('app.platform_admin', true) = '1');

ALTER TABLE platform_alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_alert_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_alert_events_platform ON platform_alert_events;
CREATE POLICY platform_alert_events_platform ON platform_alert_events
  USING (current_setting('app.platform_admin', true) = '1')
  WITH CHECK (current_setting('app.platform_admin', true) = '1');
