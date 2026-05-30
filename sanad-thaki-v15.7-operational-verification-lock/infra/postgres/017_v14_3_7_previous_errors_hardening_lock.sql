-- v14.3.7 previous-errors hardening lock
-- Tenant DB only: closes remaining financial and WhatsApp-state gaps.

ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0);
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS provider_response jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS failed_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS one_approved_match_per_invoice
  ON reconciliation_matches(company_id, invoice_id)
  WHERE status='APPROVED';

CREATE UNIQUE INDEX IF NOT EXISTS one_approved_match_per_bank_transaction
  ON reconciliation_matches(company_id, bank_transaction_id)
  WHERE status='APPROVED';
