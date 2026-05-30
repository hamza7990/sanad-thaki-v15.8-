ALTER TABLE app_users ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS user_status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_must_change boolean NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE app_users SET name = email WHERE coalesce(name,'') = '';
UPDATE app_users SET user_status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'SUSPENDED' END WHERE user_status IS NULL OR user_status = '';

CREATE INDEX IF NOT EXISTS idx_app_users_company_role_status ON app_users(company_id, role, user_status);
CREATE INDEX IF NOT EXISTS idx_app_users_invite_expires ON app_users(invite_expires_at);

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_user_status_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_user_status_check CHECK (user_status IN ('ACTIVE','SUSPENDED','ARCHIVED'));
