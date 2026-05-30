-- v15.9 Fix: Update auth_sessions_scope_check to include OWNER and MEMBER roles
-- Root Cause: Migration 023 added OWNER/MEMBER to app_users but forgot to update
-- the auth_sessions constraint, causing login to fail with check violation.

ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_scope_check;

ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_scope_check CHECK (
  (user_type = 'PLATFORM' AND company_id IS NULL AND role = 'SANAD_ADMIN')
  OR
  (user_type = 'CLIENT' AND company_id IS NOT NULL AND role IN ('OWNER','ADMIN','MEMBER','FINANCE_MANAGER','ACCOUNTANT'))
);
