-- v14.3.1 Production Readiness Lock
-- Immutable security audit trail for sensitive operations.
-- v14.3.6 fix: company_id and actor_user_id are text because tenant/company/user ids use company-* and user-* strings.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS security_audit_trail (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NULL,
  actor_user_id text NULL,
  actor_role text NULL,
  event_type text NOT NULL,
  entity_type text NULL,
  entity_id text NULL,
  severity text NOT NULL DEFAULT 'INFO',
  ip inet NULL,
  user_agent text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DROP POLICY IF EXISTS security_audit_trail_company_isolation ON security_audit_trail;

ALTER TABLE security_audit_trail
  ALTER COLUMN company_id TYPE text USING company_id::text,
  ALTER COLUMN actor_user_id TYPE text USING actor_user_id::text;

CREATE INDEX IF NOT EXISTS idx_security_audit_trail_company_created
  ON security_audit_trail (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_trail_event_created
  ON security_audit_trail (event_type, created_at DESC);

ALTER TABLE security_audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_trail FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_audit_trail_company_isolation ON security_audit_trail;
CREATE POLICY security_audit_trail_company_isolation ON security_audit_trail
  USING (
    current_setting('app.platform_admin', true) = '1'
    OR company_id = current_setting('app.current_company_id', true)
    OR company_id = current_setting('app.company_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_admin', true) = '1'
    OR company_id = current_setting('app.current_company_id', true)
    OR company_id = current_setting('app.company_id', true)
  );

CREATE OR REPLACE FUNCTION prevent_security_audit_trail_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY_AUDIT_TRAIL_IS_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_security_audit_trail_update ON security_audit_trail;
CREATE TRIGGER trg_prevent_security_audit_trail_update
  BEFORE UPDATE ON security_audit_trail
  FOR EACH ROW EXECUTE FUNCTION prevent_security_audit_trail_mutation();

DROP TRIGGER IF EXISTS trg_prevent_security_audit_trail_delete ON security_audit_trail;
CREATE TRIGGER trg_prevent_security_audit_trail_delete
  BEFORE DELETE ON security_audit_trail
  FOR EACH ROW EXECUTE FUNCTION prevent_security_audit_trail_mutation();
