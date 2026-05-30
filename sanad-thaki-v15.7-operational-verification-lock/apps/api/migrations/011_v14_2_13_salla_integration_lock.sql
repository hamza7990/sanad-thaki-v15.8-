-- v14.2.13 Salla integration lock
-- Adds secure e-commerce order linking without changing Sanad core workflow.

CREATE TABLE IF NOT EXISTS ecommerce_integrations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('SALLA','ZID','QOYOD','GENERIC')),
  webhook_secret_encrypted text,
  access_token_encrypted text,
  paid_status_slug text NOT NULL DEFAULT 'completed',
  is_active boolean NOT NULL DEFAULT true,
  created_by text REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider)
);

CREATE TABLE IF NOT EXISTS ecommerce_order_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('SALLA','ZID','QOYOD','GENERIC')),
  external_order_id text NOT NULL,
  external_order_number text,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  customer_name text,
  customer_mobile text,
  total_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'SAR',
  external_status text NOT NULL DEFAULT 'ORDER_CREATED',
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_webhook_at timestamptz,
  paid_synced_at timestamptz,
  last_sync_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_order_links_invoice ON ecommerce_order_links(company_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_order_links_provider ON ecommerce_order_links(company_id, provider, external_status);

ALTER TABLE ecommerce_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecommerce_integrations FORCE ROW LEVEL SECURITY;
ALTER TABLE ecommerce_order_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecommerce_order_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ecommerce_integrations_isolation ON ecommerce_integrations;
CREATE POLICY ecommerce_integrations_isolation ON ecommerce_integrations
  USING (company_id = current_setting('app.company_id', true))
  WITH CHECK (company_id = current_setting('app.company_id', true));

DROP POLICY IF EXISTS ecommerce_order_links_isolation ON ecommerce_order_links;
CREATE POLICY ecommerce_order_links_isolation ON ecommerce_order_links
  USING (company_id = current_setting('app.company_id', true))
  WITH CHECK (company_id = current_setting('app.company_id', true));
