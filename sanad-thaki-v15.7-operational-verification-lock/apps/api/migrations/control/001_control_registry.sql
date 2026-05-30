CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Control/identity database only. No tenant business data lives here.
CREATE TABLE IF NOT EXISTS companies (
  id text PRIMARY KEY,
  name text NOT NULL,
  tax_number text,
  email text,
  phone text,
  city text,
  address text,
  default_currency text NOT NULL DEFAULT 'SAR',
  status text NOT NULL DEFAULT 'TRIAL' CHECK (status IN ('TRIAL','ACTIVE','SUSPENDED','CANCELLED')),
  package_code text NOT NULL DEFAULT 'basic' CHECK (package_code IN ('basic','growth','professional')),
  invoice_monthly_limit int NOT NULL DEFAULT 100,
  whatsapp_monthly_limit int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_admins (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'SANAD_ADMIN' CHECK (role = 'SANAD_ADMIN'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  jti_hash text NOT NULL UNIQUE,
  user_type text NOT NULL CHECK (user_type IN ('PLATFORM','CLIENT')),
  user_id text NOT NULL,
  company_id text,
  role text NOT NULL,
  issuer text NOT NULL,
  audience text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  CHECK ((user_type='PLATFORM' AND company_id IS NULL AND role='SANAD_ADMIN') OR (user_type='CLIENT' AND company_id IS NOT NULL AND role IN ('ADMIN','FINANCE_MANAGER','ACCOUNTANT')))
);
CREATE INDEX IF NOT EXISTS idx_control_auth_sessions_user_live ON auth_sessions (user_type, user_id, company_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS tenant_registry (
  company_id text PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  db_secret_ref text NOT NULL,
  kms_secret_ref text NOT NULL,
  region text NOT NULL DEFAULT 'me-south-1',
  provision_status text NOT NULL DEFAULT 'PENDING' CHECK (provision_status IN ('PENDING','MIGRATING','READY','FAILED','DISABLED')),
  schema_version int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_directory (
  email_lower text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_directory_company ON user_directory(company_id);

CREATE TABLE IF NOT EXISTS integration_key_directory (
  key_hash text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_key_id text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['invoices:write'],
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_key_directory_company ON integration_key_directory(company_id);

CREATE TABLE IF NOT EXISTS tenant_rollups (
  company_id text PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  invoice_count int NOT NULL DEFAULT 0,
  whatsapp_count int NOT NULL DEFAULT 0,
  open_tickets int NOT NULL DEFAULT 0,
  user_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companies_platform_operator ON companies;
CREATE POLICY companies_platform_operator ON companies USING (current_setting('app.platform_admin', true) = '1' OR current_setting('app.login_lookup', true) = '1') WITH CHECK (current_setting('app.platform_admin', true) = '1');

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_admins_platform ON platform_admins;
CREATE POLICY platform_admins_platform ON platform_admins USING (current_setting('app.platform_admin', true) = '1' OR current_setting('app.login_lookup', true) = '1') WITH CHECK (current_setting('app.platform_admin', true) = '1');

ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_audit_logs_platform ON platform_audit_logs;
CREATE POLICY platform_audit_logs_platform ON platform_audit_logs USING (current_setting('app.platform_admin', true) = '1') WITH CHECK (current_setting('app.platform_admin', true) = '1');

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_sessions_platform_policy ON auth_sessions;
CREATE POLICY auth_sessions_platform_policy ON auth_sessions USING (current_setting('app.platform_admin', true) = '1' OR current_setting('app.login_lookup', true) = '1') WITH CHECK (current_setting('app.platform_admin', true) = '1' OR current_setting('app.login_lookup', true) = '1');

ALTER TABLE tenant_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_registry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_registry_platform ON tenant_registry;
CREATE POLICY tenant_registry_platform ON tenant_registry USING (current_setting('app.platform_admin', true) = '1' OR current_setting('app.login_lookup', true) = '1') WITH CHECK (current_setting('app.platform_admin', true) = '1');

ALTER TABLE user_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_directory FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_directory_access ON user_directory;
CREATE POLICY user_directory_access ON user_directory USING (current_setting('app.platform_admin', true) = '1' OR current_setting('app.login_lookup', true) = '1') WITH CHECK (current_setting('app.platform_admin', true) = '1');

ALTER TABLE integration_key_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_key_directory FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_key_directory_access ON integration_key_directory;
CREATE POLICY integration_key_directory_access ON integration_key_directory USING (current_setting('app.platform_admin', true) = '1' OR current_setting('app.integration_lookup', true) = '1') WITH CHECK (current_setting('app.platform_admin', true) = '1');

ALTER TABLE tenant_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_rollups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_rollups_platform ON tenant_rollups;
CREATE POLICY tenant_rollups_platform ON tenant_rollups USING (current_setting('app.platform_admin', true) = '1') WITH CHECK (current_setting('app.platform_admin', true) = '1');
