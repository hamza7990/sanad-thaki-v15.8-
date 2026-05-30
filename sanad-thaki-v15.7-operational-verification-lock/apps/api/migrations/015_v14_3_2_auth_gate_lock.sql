-- v14.3.2 Authentication Gate Lock
-- Tightens platform-vs-tenant context and fixes security audit trail tenant policy.

DROP POLICY IF EXISTS security_audit_trail_company_isolation ON security_audit_trail;

ALTER TABLE security_audit_trail
  ALTER COLUMN company_id TYPE text USING company_id::text,
  ALTER COLUMN actor_user_id TYPE text USING actor_user_id::text;

CREATE POLICY security_audit_trail_company_isolation ON security_audit_trail
  USING (
    current_setting('app.platform_admin', true) = '1'
    OR company_id = current_setting('app.company_id', true)
  )
  WITH CHECK (
    current_setting('app.platform_admin', true) = '1'
    OR company_id = current_setting('app.company_id', true)
  );

CREATE INDEX IF NOT EXISTS idx_security_audit_trail_company_created_text
  ON security_audit_trail (company_id, created_at DESC);


-- Allow backend login lookup to verify whether the user's company is active without exposing company data to clients.
DROP POLICY IF EXISTS companies_login_lookup ON companies;
CREATE POLICY companies_login_lookup ON companies FOR SELECT
  USING (current_setting('app.login_lookup', true) = '1');

-- Platform admins remain separated from company users by table and role constraint.
ALTER TABLE platform_admins
  DROP CONSTRAINT IF EXISTS platform_admins_role_check;
ALTER TABLE platform_admins
  ADD CONSTRAINT platform_admins_role_check CHECK (role = 'SANAD_ADMIN');

ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_check CHECK (role IN ('ADMIN','FINANCE_MANAGER','ACCOUNTANT'));

-- Make it explicit that a platform admin row never belongs to a tenant.
-- Tenant company IDs are validated at application authentication middleware and RLS layer.
