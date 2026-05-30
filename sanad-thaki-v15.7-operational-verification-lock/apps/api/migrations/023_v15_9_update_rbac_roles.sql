-- v15.9 Update RBAC Roles check constraint
-- Permits OWNER and MEMBER roles in app_users table.

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('OWNER','ADMIN','MEMBER','FINANCE_MANAGER','ACCOUNTANT'));
