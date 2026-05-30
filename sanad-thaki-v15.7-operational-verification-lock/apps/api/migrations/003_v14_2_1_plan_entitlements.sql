-- v14.2.1 Package entitlements lock
-- Basic is an entry plan without WhatsApp/bank matching/advanced costly features.

UPDATE companies
SET invoice_monthly_limit = CASE package_code WHEN 'professional' THEN 800 WHEN 'growth' THEN 400 ELSE 100 END,
    whatsapp_monthly_limit = CASE package_code WHEN 'professional' THEN 800 WHEN 'growth' THEN 400 ELSE 0 END
WHERE package_code IN ('basic','growth','professional');
