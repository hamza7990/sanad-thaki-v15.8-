-- v14.1.0 migration: lightweight Sanad platform/operator dashboard.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE companies ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'TRIAL';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS package_code text NOT NULL DEFAULT 'basic';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_monthly_limit int NOT NULL DEFAULT 100;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS whatsapp_monthly_limit int NOT NULL DEFAULT 100;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

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

DROP POLICY IF EXISTS companies_platform_operator ON companies;
CREATE POLICY companies_platform_operator ON companies
USING (current_setting('app.platform_admin', true) = '1')
WITH CHECK (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS app_users_platform_operator ON app_users;
CREATE POLICY app_users_platform_operator ON app_users
USING (current_setting('app.platform_admin', true) = '1')
WITH CHECK (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS invoices_platform_aggregate ON invoices;
CREATE POLICY invoices_platform_aggregate ON invoices FOR SELECT
USING (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS whatsapp_platform_aggregate ON whatsapp_messages;
CREATE POLICY whatsapp_platform_aggregate ON whatsapp_messages FOR SELECT
USING (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS support_tickets_platform_operator ON support_tickets;
CREATE POLICY support_tickets_platform_operator ON support_tickets
USING (current_setting('app.platform_admin', true) = '1')
WITH CHECK (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS audit_logs_platform_read ON audit_logs;
CREATE POLICY audit_logs_platform_read ON audit_logs FOR SELECT
USING (current_setting('app.platform_admin', true) = '1');
