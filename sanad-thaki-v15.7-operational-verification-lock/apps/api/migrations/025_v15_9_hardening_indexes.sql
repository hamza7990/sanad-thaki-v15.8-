-- v15.9 Database performance hardening indexes
-- Speed up queries for bank reconciliation, audit log history, and invoice status aggregation.

CREATE INDEX IF NOT EXISTS idx_bank_transactions_performance 
  ON bank_transactions (company_id, transaction_date, status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_performance 
  ON audit_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_performance 
  ON invoices (company_id, created_at DESC, status);
