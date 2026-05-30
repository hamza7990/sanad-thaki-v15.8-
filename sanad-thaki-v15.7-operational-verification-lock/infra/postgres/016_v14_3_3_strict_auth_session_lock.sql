-- v14.3.3 Strict Authentication Session Lock
-- Stores JWT jti hashes server-side so every request is validated against a live session.

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
  last_seen_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_live
  ON auth_sessions (user_type, user_id, company_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_company_seen
  ON auth_sessions (company_id, last_seen_at DESC);

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_sessions_platform_policy ON auth_sessions;
CREATE POLICY auth_sessions_platform_policy ON auth_sessions
  USING (current_setting('app.platform_admin', true) = '1')
  WITH CHECK (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS auth_sessions_tenant_policy ON auth_sessions;
CREATE POLICY auth_sessions_tenant_policy ON auth_sessions
  USING (
    company_id = current_setting('app.company_id', true)
    OR current_setting('app.login_lookup', true) = '1'
  )
  WITH CHECK (
    company_id = current_setting('app.company_id', true)
    OR current_setting('app.login_lookup', true) = '1'
  );

-- Platform sessions must never belong to a tenant; client sessions must always belong to one.
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_scope_check;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_scope_check CHECK (
  (user_type='PLATFORM' AND company_id IS NULL AND role='SANAD_ADMIN')
  OR
  (user_type='CLIENT' AND company_id IS NOT NULL AND role IN ('ADMIN','FINANCE_MANAGER','ACCOUNTANT'))
);
