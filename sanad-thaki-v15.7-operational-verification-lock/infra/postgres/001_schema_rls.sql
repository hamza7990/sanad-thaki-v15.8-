CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'TRIAL';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS package_code text NOT NULL DEFAULT 'basic';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_monthly_limit int NOT NULL DEFAULT 100;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS whatsapp_monthly_limit int NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS platform_admins (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'SANAD_ADMIN' CHECK (role = 'SANAD_ADMIN'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','FINANCE_MANAGER','ACCOUNTANT')),
  is_active boolean NOT NULL DEFAULT true,
  user_status text NOT NULL DEFAULT 'ACTIVE' CHECK (user_status IN ('ACTIVE','SUSPENDED','ARCHIVED')),
  password_must_change boolean NOT NULL DEFAULT false,
  invite_expires_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS user_status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_must_change boolean NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS archived_at timestamptz;


CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  customer_name text NOT NULL,
  supplier_tax_number text NOT NULL,
  total_amount numeric(14,2) NOT NULL CHECK (total_amount > 0),
  status text NOT NULL CHECK (status IN ('DRAFT','NEEDS_REVIEW','READY_FOR_REVIEW','APPROVED','REJECTED','PAID')),
  locked_for_review boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  locked_by text,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_number, supplier_tax_number)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_date date NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reference text,
  status text NOT NULL DEFAULT 'UNMATCHED' CHECK (status IN ('UNMATCHED','MATCHED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  bank_transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  score int NOT NULL CHECK (score >= 0 AND score <= 100),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, invoice_id, bank_transaction_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  sent_by text REFERENCES app_users(id),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','FAILED')),
  mode text NOT NULL DEFAULT 'disabled',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by text REFERENCES app_users(id),
  category text NOT NULL,
  priority text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','CLOSED')),
  support_response text,
  internal_note text,
  handled_by text,
  responded_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS support_response text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS internal_note text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS handled_by text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
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

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_matches FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_isolation ON companies;
CREATE POLICY companies_isolation ON companies
USING (id = current_setting('app.company_id', true))
WITH CHECK (id = current_setting('app.company_id', true));

DROP POLICY IF EXISTS companies_platform_operator ON companies;
CREATE POLICY companies_platform_operator ON companies
USING (current_setting('app.platform_admin', true) = '1')
WITH CHECK (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS app_users_isolation ON app_users;
CREATE POLICY app_users_isolation ON app_users
USING (company_id = current_setting('app.company_id', true))
WITH CHECK (company_id = current_setting('app.company_id', true));

DROP POLICY IF EXISTS app_users_login_lookup ON app_users;
CREATE POLICY app_users_login_lookup ON app_users FOR SELECT USING (current_setting('app.login_lookup', true) = '1');

DROP POLICY IF EXISTS app_users_platform_operator ON app_users;
CREATE POLICY app_users_platform_operator ON app_users
USING (current_setting('app.platform_admin', true) = '1')
WITH CHECK (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS invoices_isolation ON invoices;
CREATE POLICY invoices_isolation ON invoices
USING (company_id = current_setting('app.company_id', true))
WITH CHECK (company_id = current_setting('app.company_id', true));

DROP POLICY IF EXISTS invoices_platform_aggregate ON invoices;
CREATE POLICY invoices_platform_aggregate ON invoices FOR SELECT
USING (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS bank_transactions_isolation ON bank_transactions;
CREATE POLICY bank_transactions_isolation ON bank_transactions
USING (company_id = current_setting('app.company_id', true))
WITH CHECK (company_id = current_setting('app.company_id', true));

DROP POLICY IF EXISTS reconciliation_matches_isolation ON reconciliation_matches;
CREATE POLICY reconciliation_matches_isolation ON reconciliation_matches
USING (company_id = current_setting('app.company_id', true))
WITH CHECK (company_id = current_setting('app.company_id', true));

DROP POLICY IF EXISTS whatsapp_messages_isolation ON whatsapp_messages;
CREATE POLICY whatsapp_messages_isolation ON whatsapp_messages
USING (company_id = current_setting('app.company_id', true))
WITH CHECK (company_id = current_setting('app.company_id', true));

DROP POLICY IF EXISTS whatsapp_platform_aggregate ON whatsapp_messages;
CREATE POLICY whatsapp_platform_aggregate ON whatsapp_messages FOR SELECT
USING (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS support_tickets_isolation ON support_tickets;
CREATE POLICY support_tickets_isolation ON support_tickets
USING (company_id = current_setting('app.company_id', true))
WITH CHECK (company_id = current_setting('app.company_id', true));

DROP POLICY IF EXISTS support_tickets_platform_operator ON support_tickets;
CREATE POLICY support_tickets_platform_operator ON support_tickets
USING (current_setting('app.platform_admin', true) = '1')
WITH CHECK (current_setting('app.platform_admin', true) = '1');

DROP POLICY IF EXISTS audit_logs_isolation ON audit_logs;
CREATE POLICY audit_logs_isolation ON audit_logs
USING (company_id = current_setting('app.company_id', true))
WITH CHECK (company_id = current_setting('app.company_id', true));

DROP POLICY IF EXISTS audit_logs_platform_read ON audit_logs;
CREATE POLICY audit_logs_platform_read ON audit_logs FOR SELECT
USING (current_setting('app.platform_admin', true) = '1');
