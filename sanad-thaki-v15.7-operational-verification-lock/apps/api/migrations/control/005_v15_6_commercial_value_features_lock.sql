-- v15.6 Commercial Value Features Lock - control database
-- Routes Meta/BSP WhatsApp delivery webhooks back to the correct tenant.

CREATE TABLE IF NOT EXISTS whatsapp_phone_directory (
  phone_number_id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'meta',
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_phone_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_phone_directory FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_phone_directory_platform ON whatsapp_phone_directory;
CREATE POLICY whatsapp_phone_directory_platform ON whatsapp_phone_directory
  USING (current_setting('app.platform_admin', true) = '1' OR current_setting('app.login_lookup', true) = '1')
  WITH CHECK (current_setting('app.platform_admin', true) = '1');
