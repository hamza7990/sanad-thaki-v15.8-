#!/usr/bin/env node
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const { withPlatformScope, withTenant } = require('../src/db.js');
const { provisionTenant } = require('../src/provisioning.js');
const { getSecret } = require('../src/secrets.js');

function fail(message, detail) {
  console.error(`PRODUCTION_DB_PER_TENANT_ACCEPTANCE_FAILED: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_NON_PRODUCTION_ACCEPTANCE !== 'true') {
  fail('Set NODE_ENV=production or ALLOW_NON_PRODUCTION_ACCEPTANCE=true for staging rehearsal.');
}
if (process.env.REQUIRE_DATABASE_PER_TENANT !== 'true') fail('REQUIRE_DATABASE_PER_TENANT=true is required.');
if (!process.env.PROVISIONER_DATABASE_URL) fail('PROVISIONER_DATABASE_URL is required.');
if ((process.env.SECRETS_PROVIDER || '').toLowerCase() !== 'aws' && process.env.ALLOW_LOCAL_SECRETS_ACCEPTANCE !== 'true') {
  fail('SECRETS_PROVIDER=aws is required, unless ALLOW_LOCAL_SECRETS_ACCEPTANCE=true for local rehearsal.');
}

const suffix = crypto.randomBytes(5).toString('hex');
const companies = [
  { id: `company-ACCEPTA${suffix}`, name: `قبول أ ${suffix}`, email: `accept-a-${suffix}@sanad.local` },
  { id: `company-ACCEPTB${suffix}`, name: `قبول ب ${suffix}`, email: `accept-b-${suffix}@sanad.local` }
];
const passwordHash = await bcrypt.hash(`Accept@${suffix}A1!`, 12);

await withPlatformScope(async client => {
  await client.query(
    `INSERT INTO production_acceptance_runs (run_type, status, detail) VALUES ('db_per_tenant', 'STARTED', $1::jsonb)`,
    [JSON.stringify({ suffix, companies: companies.map(c => c.id) })]
  ).catch(() => {});
  for (const c of companies) {
    await client.query(
      `INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
       VALUES ($1,$2,'ACCEPTANCE',$3,'الرياض','TRIAL','basic',100,0,true)
       ON CONFLICT (id) DO NOTHING`,
      [c.id, c.name, c.email]
    );
  }
});

for (const c of companies) {
  await provisionTenant({
    companyId: c.id,
    seed: {
      company: { id: c.id, name: c.name, tax_number: 'ACCEPTANCE', email: c.email, city: 'الرياض', status: 'TRIAL', package_code: 'basic', invoice_monthly_limit: 100, whatsapp_monthly_limit: 0, is_active: true },
      adminUser: { id: `user-${c.id.slice(-12)}`, name: 'مدير قبول', email: c.email, password_hash: passwordHash, role: 'ADMIN', password_must_change: false }
    }
  });
}

const registry = await withPlatformScope(async client => {
  const r = await client.query(
    `SELECT company_id, db_secret_ref, provision_status, schema_version FROM tenant_registry WHERE company_id = ANY($1::text[]) ORDER BY company_id`,
    [companies.map(c => c.id)]
  );
  return r.rows;
});
if (registry.length !== 2 || registry.some(r => r.provision_status !== 'READY')) fail('Both acceptance tenants must be READY.', JSON.stringify(registry));
if (registry.some(r => Number(r.schema_version) < 22)) fail('Acceptance tenants must be schema_version >= 22.', JSON.stringify(registry));
const urls = await Promise.all(registry.map(r => getSecret(r.db_secret_ref)));
if (new Set(urls).size !== 2) fail('Acceptance tenants are not routed to two distinct database URLs.');
if (urls.some(u => u === process.env.DATABASE_URL)) fail('Tenant database URL must not equal Control DATABASE_URL.');

await withTenant(companies[0].id, async client => {
  await client.query(
    `INSERT INTO invoices (company_id, invoice_number, customer_name, supplier_tax_number, total_amount, status, locked_for_review)
     VALUES ($1,$2,'Acceptance Customer','300000000000003',123.45,'DRAFT',false)`,
    [companies[0].id, `ACCEPT-${suffix}`]
  );
});
const bSeesA = await withTenant(companies[1].id, async client => {
  const r = await client.query(`SELECT count(*)::int AS count FROM invoices WHERE invoice_number=$1`, [`ACCEPT-${suffix}`]);
  return Number(r.rows[0].count || 0);
});
if (bSeesA !== 0) fail('Tenant B can see Tenant A invoice; isolation failed.');

await withPlatformScope(async client => {
  await client.query(
    `INSERT INTO production_acceptance_runs (run_type, status, detail) VALUES ('db_per_tenant', 'PASSED', $1::jsonb)`,
    [JSON.stringify({ suffix, companies: companies.map(c => c.id), schemaVersions: registry.map(r => r.schema_version) })]
  ).catch(() => {});
});

console.log(JSON.stringify({ ok: true, code: 'PRODUCTION_DB_PER_TENANT_ACCEPTANCE_PASSED', companies: companies.map(c => c.id), distinctTenantDatabases: true, isolationVerified: true }, null, 2));
