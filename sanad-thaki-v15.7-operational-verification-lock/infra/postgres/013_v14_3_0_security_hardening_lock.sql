-- v14.3.0 Security Hardening Lock
-- Adds replay protection storage for external webhooks and keeps it tenant-scoped.

CREATE TABLE IF NOT EXISTS webhook_replay_nonces (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL,
  webhook_id text NOT NULL,
  signature_hash text NOT NULL,
  body_hash text NOT NULL,
  webhook_timestamp timestamptz NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  source_ip text,
  UNIQUE(company_id, provider, webhook_id),
  UNIQUE(company_id, provider, body_hash)
);

CREATE INDEX IF NOT EXISTS webhook_replay_nonces_company_provider_signature_idx
  ON webhook_replay_nonces(company_id, provider, signature_hash);

CREATE INDEX IF NOT EXISTS webhook_replay_nonces_company_provider_seen_idx
  ON webhook_replay_nonces(company_id, provider, first_seen_at DESC);

ALTER TABLE webhook_replay_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_replay_nonces FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_replay_nonces_isolation ON webhook_replay_nonces;
CREATE POLICY webhook_replay_nonces_isolation ON webhook_replay_nonces
  USING (company_id = current_setting('app.company_id', true))
  WITH CHECK (company_id = current_setting('app.company_id', true));
