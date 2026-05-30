-- v15.6 Commercial Value Features Lock - tenant database
-- Adds per-company WhatsApp Business, CFO collection analytics metadata,
-- and accounting import/mapping/sync logging.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS collection_status text NOT NULL DEFAULT 'NORMAL'
  CHECK (collection_status IN ('NORMAL','PROMISED','DISPUTED'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS promised_payment_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dispute_reason text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS external_source text;
CREATE INDEX IF NOT EXISTS idx_invoices_company_collection_status ON invoices(company_id, collection_status);
CREATE INDEX IF NOT EXISTS idx_invoices_company_due_date ON invoices(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_company_customer ON invoices(company_id, customer_name);

CREATE TABLE IF NOT EXISTS whatsapp_business_settings (
  company_id text PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta','bsp')),
  phone_number_id text NOT NULL,
  business_account_id text,
  display_name text NOT NULL,
  encrypted_access_token text,
  encrypted_app_secret text,
  bsp_name text,
  encrypted_bsp_config text,
  is_active boolean NOT NULL DEFAULT true,
  updated_by text REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reminder_stage text NOT NULL CHECK (reminder_stage IN ('FIRST','SECOND','FINAL')),
  meta_template_name text NOT NULL,
  language text NOT NULL DEFAULT 'ar',
  category text NOT NULL DEFAULT 'UTILITY',
  body_preview text NOT NULL,
  meta_status text NOT NULL DEFAULT 'APPROVED' CHECK (meta_status IN ('APPROVED','PENDING','REJECTED')),
  is_active boolean NOT NULL DEFAULT true,
  updated_by text REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, reminder_stage)
);

ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS to_phone text;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS reminder_stage text CHECK (reminder_stage IN ('FIRST','SECOND','FINAL'));
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'QUEUED'
  CHECK (delivery_status IN ('QUEUED','SENT','DELIVERED','READ','FAILED'));
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_queue ON whatsapp_messages(company_id, status, next_attempt_at, attempts);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_provider_id ON whatsapp_messages(company_id, provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_reminder_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  whatsapp_message_id uuid REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
  reminder_stage text NOT NULL CHECK (reminder_stage IN ('FIRST','SECOND','FINAL')),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','DELIVERED','READ','FAILED')),
  requested_by text REFERENCES app_users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, invoice_id, reminder_stage)
);

CREATE TABLE IF NOT EXISTS accounting_import_mappings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  system_name text NOT NULL CHECK (system_name IN ('qoyod','daftara','odoo','zoho','generic')),
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  updated_by text REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, system_name)
);

CREATE TABLE IF NOT EXISTS accounting_import_batches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  system_name text NOT NULL,
  original_filename text,
  total_rows int NOT NULL DEFAULT 0,
  imported_rows int NOT NULL DEFAULT 0,
  skipped_rows int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PROCESSING',
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS accounting_sync_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  system_name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
  event_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('SUCCESS','FAILED','QUEUED','SKIPPED')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounting_sync_logs_company_created ON accounting_sync_logs(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS accounting_outbound_webhooks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_name text NOT NULL,
  target_url text NOT NULL,
  encrypted_secret text,
  events text[] NOT NULL DEFAULT ARRAY['invoice.paid'],
  is_active boolean NOT NULL DEFAULT true,
  updated_by text REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_business_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_reminder_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_reminder_events FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting_import_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_import_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_import_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_sync_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting_outbound_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_outbound_webhooks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_business_settings_isolation ON whatsapp_business_settings;
CREATE POLICY whatsapp_business_settings_isolation ON whatsapp_business_settings USING (company_id = current_setting('app.company_id', true)) WITH CHECK (company_id = current_setting('app.company_id', true));
DROP POLICY IF EXISTS whatsapp_templates_isolation ON whatsapp_templates;
CREATE POLICY whatsapp_templates_isolation ON whatsapp_templates USING (company_id = current_setting('app.company_id', true)) WITH CHECK (company_id = current_setting('app.company_id', true));
DROP POLICY IF EXISTS whatsapp_reminder_events_isolation ON whatsapp_reminder_events;
CREATE POLICY whatsapp_reminder_events_isolation ON whatsapp_reminder_events USING (company_id = current_setting('app.company_id', true)) WITH CHECK (company_id = current_setting('app.company_id', true));
DROP POLICY IF EXISTS accounting_import_mappings_isolation ON accounting_import_mappings;
CREATE POLICY accounting_import_mappings_isolation ON accounting_import_mappings USING (company_id = current_setting('app.company_id', true)) WITH CHECK (company_id = current_setting('app.company_id', true));
DROP POLICY IF EXISTS accounting_import_batches_isolation ON accounting_import_batches;
CREATE POLICY accounting_import_batches_isolation ON accounting_import_batches USING (company_id = current_setting('app.company_id', true)) WITH CHECK (company_id = current_setting('app.company_id', true));
DROP POLICY IF EXISTS accounting_sync_logs_isolation ON accounting_sync_logs;
CREATE POLICY accounting_sync_logs_isolation ON accounting_sync_logs USING (company_id = current_setting('app.company_id', true)) WITH CHECK (company_id = current_setting('app.company_id', true));
DROP POLICY IF EXISTS accounting_outbound_webhooks_isolation ON accounting_outbound_webhooks;
CREATE POLICY accounting_outbound_webhooks_isolation ON accounting_outbound_webhooks USING (company_id = current_setting('app.company_id', true)) WITH CHECK (company_id = current_setting('app.company_id', true));
