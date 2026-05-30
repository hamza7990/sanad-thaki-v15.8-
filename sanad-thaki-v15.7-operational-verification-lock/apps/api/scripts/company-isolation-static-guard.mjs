import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const server = read('apps/api/src/server.js');
const db = read('apps/api/src/db.js');
const guards = read('apps/api/src/guards.js');
const rbac = read('apps/api/src/rbac.js');
const migrations = fs.readdirSync(path.join(root, 'apps/api/migrations'))
  .filter(f => f.endsWith('.sql'))
  .map(f => read(`apps/api/migrations/${f}`))
  .join('\n');

const roleBlock = role => {
  const re = new RegExp(`${role}: \\[([\\s\\S]*?)\\]`, 'm');
  return (rbac.match(re) || ['', ''])[1];
};
const adminBlock = roleBlock('ADMIN');
const accountantBlock = roleBlock('ACCOUNTANT');

const checks = [
  ['withTenant requires companyId', /if \(!companyId\) throw new Error\("Missing company tenant"\)/.test(db)],
  ['withTenant sets app.company_id', /set_config\('app\.company_id', \$1, true\)/.test(db) || /set_config\('app\.company_id', \$1, true\)/.test(read('apps/api/src/tenant-db-router.js'))],
  ['client companyId is blocked', /companyId لا يُقبل من العميل/.test(guards)],
  ['invoices queries are company scoped', /FROM invoices WHERE company_id=\$1/.test(server) && /WHERE id=\$1 AND company_id=\$2/.test(server)],
  ['bank transactions are company scoped', /FROM bank_transactions WHERE company_id=\$1/.test(server)],
  ['matches are company scoped', /WHERE m\.company_id=\$1/.test(server) && /JOIN invoices i ON i\.id=m\.invoice_id AND i\.company_id=\$1/.test(server)],
  ['whatsapp messages are company scoped', /FROM whatsapp_messages WHERE company_id=\$1/.test(server)],
  ['support tickets are company scoped', /FROM support_tickets WHERE company_id=\$1/.test(server)],
  ['audit logs are company scoped', /FROM audit_logs WHERE company_id=\$1/.test(server)],
  ['integration import blocks client companyId', /app\.post\("\/integrations\/accounting\/invoices", blockClientCompanyId/.test(server)],
  ['database-per-tenant router is wired', /withTenantDatabase/.test(db) && /resolveTenantConnectionString/.test(read('apps/api/src/tenant-db-router.js'))],
  ['tenant encryption is wired for invoice payloads', /buildTenantEncryptedInvoicePayload/.test(server) && /encryptForTenant/.test(read('apps/api/src/tenant-crypto.js'))],
  ['tenant AI temp sessions are isolated', /withTenantAiSession/.test(server) && /fs\.rm\(tempDir/.test(read('apps/api/src/ai-session-isolation.js'))],
  ['tenant usage metering exists', /tenant_usage_events/.test(server) && /CREATE TABLE IF NOT EXISTS tenant_usage_events/.test(migrations)],
  ['integration lookup uses backend RLS context', /app\.integration_lookup/.test(server) && /integration_api_keys_backend_lookup/.test(migrations)],
  ['RLS forced on invoices', /ALTER TABLE invoices FORCE ROW LEVEL SECURITY/.test(migrations)],
  ['RLS forced on app_users', /ALTER TABLE app_users FORCE ROW LEVEL SECURITY/.test(migrations)],
  ['RLS forced on bank_transactions', /ALTER TABLE bank_transactions FORCE ROW LEVEL SECURITY/.test(migrations)],
  ['RLS forced on reconciliation_matches', /ALTER TABLE reconciliation_matches FORCE ROW LEVEL SECURITY/.test(migrations)],
  ['RLS forced on whatsapp_messages', /ALTER TABLE whatsapp_messages FORCE ROW LEVEL SECURITY/.test(migrations)],
  ['RLS forced on support_tickets', /ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY/.test(migrations)],
  ['RLS forced on audit_logs', /ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY/.test(migrations)],
  ['company admin cannot approve invoices', !adminBlock.includes('INVOICE_APPROVE')],
  ['accountant cannot access bank/matching/admin', !accountantBlock.includes('BANK_MANAGE') && !accountantBlock.includes('MATCH_APPROVE') && !accountantBlock.includes('USERS_MANAGE')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error(`Company isolation static guard failed: ${failed} issue(s).`);
  process.exit(1);
}
console.log('COMPANY_ISOLATION_STATIC_GUARD_PASSED');
