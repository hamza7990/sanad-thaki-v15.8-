const crypto = require('crypto');
const { logSecurityEvent } = require('./secure-logger');

const WEBHOOK_MAX_SKEW_SECONDS = Number(process.env.WEBHOOK_MAX_SKEW_SECONDS || 300);

function parseWebhookTimestamp(value) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const millis = raw.length >= 13 ? n : n * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractWebhookTimestamp(req) {
  return parseWebhookTimestamp(
    req.header('x-salla-timestamp') ||
    req.header('X-Salla-Timestamp') ||
    req.header('x-webhook-timestamp') ||
    req.header('X-Webhook-Timestamp') ||
    req.header('x-request-timestamp') ||
    req.header('X-Request-Timestamp')
  );
}

function extractWebhookId(req, rawBody) {
  const headerId = req.header('x-salla-webhook-id') ||
    req.header('X-Salla-Webhook-Id') ||
    req.header('x-salla-event-id') ||
    req.header('X-Salla-Event-Id') ||
    req.header('x-request-id') ||
    req.header('X-Request-Id');
  if (headerId) return String(headerId).trim().slice(0, 160);
  return crypto.createHash('sha256').update(rawBody || Buffer.alloc(0)).digest('hex');
}

function assertFreshWebhook(req, rawBody, provider = 'SALLA') {
  const receivedAt = new Date();
  const timestamp = extractWebhookTimestamp(req);
  const webhookId = extractWebhookId(req, rawBody);
  if (!timestamp) {
    if (process.env.WEBHOOK_REQUIRE_TIMESTAMP === 'true') {
      logSecurityEvent('WEBHOOK_REJECTED_MISSING_TIMESTAMP', { provider, webhookId, ip: req.ip });
      const err = new Error('Webhook timestamp is required');
      err.statusCode = 401;
      err.webhookId = webhookId;
      throw err;
    }
    logSecurityEvent('WEBHOOK_ACCEPTED_WITHOUT_TIMESTAMP_USING_SIGNATURE_AND_NONCE', { provider, webhookId, ip: req.ip });
    return { webhookId, timestamp: receivedAt.toISOString(), receivedAt: receivedAt.toISOString(), ageSeconds: 0, missingTimestamp: true };
  }
  const ageSeconds = Math.abs((receivedAt.getTime() - timestamp.getTime()) / 1000);
  if (ageSeconds > WEBHOOK_MAX_SKEW_SECONDS) {
    logSecurityEvent('WEBHOOK_REPLAY_OR_STALE_TIMESTAMP_REJECTED', { provider, webhookId, ageSeconds: Math.round(ageSeconds), ip: req.ip });
    const err = new Error('Webhook timestamp is outside allowed window');
    err.statusCode = 401;
    err.webhookId = webhookId;
    throw err;
  }
  return { webhookId, timestamp: timestamp.toISOString(), receivedAt: receivedAt.toISOString(), ageSeconds };
}

async function reserveWebhookReplayNonce(client, { companyId, provider, webhookId, signatureHash, timestamp, rawBodyHash, ip }) {
  const result = await client.query(
    `INSERT INTO webhook_replay_nonces
      (company_id, provider, webhook_id, signature_hash, body_hash, webhook_timestamp, first_seen_at, source_ip)
     VALUES ($1,$2,$3,$4,$5,$6,now(),$7)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [companyId, provider, webhookId, signatureHash, rawBodyHash, timestamp, ip || null]
  );
  if (!result.rows[0]) {
    logSecurityEvent('WEBHOOK_REPLAY_BLOCKED', { companyId, provider, webhookId, ip });
    const err = new Error('Duplicate webhook rejected');
    err.statusCode = 409;
    err.webhookId = webhookId;
    throw err;
  }
  await cleanupWebhookReplayNonces(client, companyId, provider).catch(err => logSecurityEvent('WEBHOOK_NONCE_CLEANUP_WARNING', { companyId, provider, error: err.message }));
  return result.rows[0].id;
}

async function cleanupWebhookReplayNonces(client, companyId, provider) {
  const keepSeconds = Math.max(WEBHOOK_MAX_SKEW_SECONDS * 4, Number(process.env.WEBHOOK_NONCE_RETENTION_SECONDS || 86400));
  await client.query(
    `DELETE FROM webhook_replay_nonces
     WHERE company_id=$1 AND provider=$2 AND first_seen_at < now() - ($3::int * interval '1 second')`,
    [companyId, provider, keepSeconds]
  );
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value || Buffer.alloc(0)).digest('hex');
}

module.exports = {
  WEBHOOK_MAX_SKEW_SECONDS,
  assertFreshWebhook,
  extractWebhookId,
  reserveWebhookReplayNonce,
  cleanupWebhookReplayNonces,
  sha256Hex
};
