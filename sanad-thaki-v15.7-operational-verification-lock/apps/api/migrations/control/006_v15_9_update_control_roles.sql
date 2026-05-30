-- v15.9 Update control registry check constraint for roles
-- Permits OWNER and MEMBER roles in auth_sessions of control database.

ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_check;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_check CHECK (
  (user_type='PLATFORM' AND company_id IS NULL AND role='SANAD_ADMIN') OR 
  (user_type='CLIENT' AND company_id IS NOT NULL AND role IN ('OWNER','ADMIN','MEMBER','FINANCE_MANAGER','ACCOUNTANT'))
);
