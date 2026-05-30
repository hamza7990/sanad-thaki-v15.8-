-- v14.2.3 Staging Repair Lock
-- Fixes migration safety and accepted package entitlements without expanding scope.

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS support_response text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS internal_note text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS handled_by text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at timestamptz;

UPDATE companies
SET invoice_monthly_limit = 100, whatsapp_monthly_limit = 0
WHERE package_code = 'basic';

UPDATE companies
SET invoice_monthly_limit = 400, whatsapp_monthly_limit = 400
WHERE package_code = 'growth';

UPDATE companies
SET invoice_monthly_limit = 1200, whatsapp_monthly_limit = 800
WHERE package_code = 'professional';
