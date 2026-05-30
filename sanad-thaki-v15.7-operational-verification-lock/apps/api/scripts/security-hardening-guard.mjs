import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const server = read('apps/api/src/server.js');
const salla = read('apps/api/src/integrations/salla.js');
const webhook = read('apps/api/src/webhook-security.js');
const logger = read('apps/api/src/secure-logger.js');
const securityMiddleware = read('apps/api/src/security-middleware.js');
const audit = read('apps/api/src/audit.js');
const commercial = read('apps/api/src/commercial-value-features.js');
const appJs = read('apps/api/public/app.js');
const indexHtml = read('apps/api/public/index.html');
const migrations = fs.readdirSync(path.join(root, 'apps/api/migrations'))
  .filter(f => f.endsWith('.sql'))
  .map(f => read(`apps/api/migrations/${f}`))
  .join('\n');

const checks = [
  ['Webhook timestamp freshness gate exists', /WEBHOOK_MAX_SKEW_SECONDS/.test(webhook) && /assertFreshWebhook/.test(salla)],
  ['Webhook replay nonce table exists', /CREATE TABLE IF NOT EXISTS webhook_replay_nonces/.test(migrations) && /UNIQUE\(company_id, provider, webhook_id\)/.test(migrations)],
  ['Webhook replay nonce RLS is forced', /ALTER TABLE webhook_replay_nonces FORCE ROW LEVEL SECURITY/.test(migrations)],
  ['Salla signature uses crypto.timingSafeEqual', /crypto\.timingSafeEqual/.test(salla) && /constantTimeHexEqual/.test(salla)],
  ['Salla signature rejects invalid signatures before business logic', /SALLA_WEBHOOK_INVALID_SIGNATURE/.test(salla) && /reserveWebhookReplayNonce/.test(salla)],
  ['Secure log redaction is installed', /installSecureConsoleRedaction\(\)/.test(server) && /redactSecrets/.test(logger)],
  ['Logger masks sensitive keywords', /access\[_-\]\?token/.test(logger) && /authorization/.test(logger) && /webhook\[_-\]\?secret/.test(logger)],
  ['Bank statement upload is limited to 2MB', /BANK_STATEMENT_MAX_FILE_BYTES\s*=\s*2 \* 1024 \* 1024/.test(server)],
  ['Bank statement cells are sanitized against CSV injection', /BANK_STATEMENT_DANGEROUS_PREFIX/.test(server) && /sanitizeSpreadsheetText/.test(server)],
  ['Bank statement row and column limits exist', /BANK_STATEMENT_MAX_ROWS\s*=\s*5000/.test(server) && /BANK_STATEMENT_MAX_COLUMNS\s*=\s*30/.test(server)],
  ['Bank statement import errors do not store raw row samples', !/sample:\s*parsed\.rows/.test(server)],
  ['Invoice update remains tenant scoped and returns 403 on denied update', /WHERE id=\$1 AND company_id=\$2/.test(server) && /return res\.status\(403\)/.test(server)],
  ['Dedicated login rate limiter is mounted', /loginLimiter/.test(securityMiddleware) && /app\.post\("\/auth\/login", loginLimiter, login\)/.test(server)],
  ['Dedicated webhook rate limiter is mounted', /webhookLimiter/.test(securityMiddleware) && /app\.use\("\/integrations\/salla\/webhook", webhookLimiter\)/.test(server)],
  ['HTTPS enforcement and HSTS headers exist', /enforceHttps/.test(securityMiddleware) && /hsts:/.test(securityMiddleware) && /app\.use\(enforceHttps\)/.test(server)],
  ['CSP security headers exist', /contentSecurityPolicy/.test(securityMiddleware) && /frameAncestors/.test(securityMiddleware) && /objectSrc/.test(securityMiddleware)],
  ['CSP blocks inline scripts and styles', !/unsafe-inline/.test(securityMiddleware) && /scriptSrc:\s*\["'self'"\]/.test(securityMiddleware) && /styleSrc:\s*\["'self'"\]/.test(securityMiddleware)],
  ['Public UI has no inline event attributes', !/\son(?:click|submit|change|input|load|error)=/i.test(appJs) && !/\son(?:click|submit|change|input|load|error)=/i.test(indexHtml)],
  ['Public UI uses delegated CSP-safe event handlers', /installCspSafeUiHandlers/.test(appJs) && /data-action/.test(appJs) && /data-submit/.test(appJs)],
  ['Immutable security audit trail migration exists', /CREATE TABLE IF NOT EXISTS security_audit_trail/.test(migrations) && /prevent_security_audit_trail_mutation/.test(migrations) && /BEFORE DELETE ON security_audit_trail/.test(migrations)],
  ['Sensitive operations write to security audit trail', /writeSecurityAuditTrail/.test(audit) && /INVOICE_APPROVED_WHATSAPP_UNLOCKED/.test(server) && /WHATSAPP_REMINDER_QUEUED/.test(commercial) && /BANK_STATEMENT_FILE_UPLOADED/.test(server) && /BANK_MATCH_APPROVED_INVOICE_PAID/.test(server) && /SALLA_WEBHOOK_ORDER_CREATED_ACCEPTED/.test(salla)]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed += 1;
}

async function optionalLiveIsolationProbe() {
  const baseUrl = process.env.SANAD_TEST_BASE_URL;
  const tenantAToken = process.env.TENANT_A_TOKEN;
  const tenantBInvoiceId = process.env.TENANT_B_INVOICE_ID;
  if (!baseUrl || !tenantAToken || !tenantBInvoiceId || typeof fetch !== 'function') {
    console.log('SKIP - optional live Tenant_A -> Tenant_B invoice IDOR probe needs SANAD_TEST_BASE_URL, TENANT_A_TOKEN, TENANT_B_INVOICE_ID');
    return;
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/invoices/${encodeURIComponent(tenantBInvoiceId)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tenantAToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ invoiceNumber: 'IDOR-PROBE', customerName: 'Tenant Probe', supplierTaxNumber: 'IDOR', totalAmount: 1 })
  });
  if (![403, 404].includes(response.status)) {
    failed += 1;
    console.log(`FAIL - live IDOR probe expected 403/404 but got ${response.status}`);
  } else {
    console.log(`PASS - live IDOR probe blocked cross-tenant invoice access with HTTP ${response.status}`);
  }
}

await optionalLiveIsolationProbe();

if (failed) {
  console.error(`Security hardening guard failed: ${failed} issue(s).`);
  process.exit(1);
}
console.log('SECURITY_HARDENING_GUARD_PASSED');
