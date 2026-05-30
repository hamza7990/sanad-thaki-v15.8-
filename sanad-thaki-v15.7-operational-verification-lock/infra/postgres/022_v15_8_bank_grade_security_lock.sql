-- v15.8 Bank-grade security closure for WhatsApp commercial layer.
-- Adds platform review metadata for Meta templates so tenant users cannot self-approve templates.
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS approval_reviewed_by text REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS approval_reviewed_at timestamptz;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS approval_note text NOT NULL DEFAULT '';

-- Do not let new templates default to approved when created by tenants.
ALTER TABLE whatsapp_templates ALTER COLUMN meta_status SET DEFAULT 'PENDING';
