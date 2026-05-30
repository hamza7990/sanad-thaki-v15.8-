import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const config = read('apps/api/src/config.js');
const router = read('apps/api/src/tenant-db-router.js');
const crypto = read('apps/api/src/tenant-crypto.js');
const server = read('apps/api/src/server.js');
const provisioning = read('apps/api/src/provisioning.js');
const controlMigration = read('apps/api/migrations/control/001_control_registry.sql');
const env = read('.env.production.example');

const checks = [
  ['production requires REQUIRE_DATABASE_PER_TENANT=true', /Production startup blocked: REQUIRE_DATABASE_PER_TENANT=true is mandatory/.test(config)],
  ['production uses provisioning or existing tenant registry routes', /PROVISIONER_DATABASE_URL is mandatory for real Database-per-Tenant provisioning/.test(config)],
  ['control migration creates tenant registry', /CREATE TABLE IF NOT EXISTS tenant_registry/.test(controlMigration) && /provision_status/.test(controlMigration)],
  ['control migration creates user directory', /CREATE TABLE IF NOT EXISTS user_directory/.test(controlMigration)],
  ['control migration creates integration key directory', /CREATE TABLE IF NOT EXISTS integration_key_directory/.test(controlMigration)],
  ['tenant router loads routes from tenant_registry', /FROM tenant_registry/.test(router) && /provision_status !== "READY"/.test(router)],
  ['tenant router fetches DB URL and KMS secret via secrets layer', /getSecret\(routeRow\.db_secret_ref\)/.test(router) && /getSecret\(routeRow\.kms_secret_ref\)/.test(router)],
  ['tenant router blocks production shared fallback', /not routed to a dedicated database/.test(router)],
  ['tenant router marks app.tenant_db_isolated', /app\.tenant_db_isolated/.test(router)],
  ['provisioning creates physical database and runs tenant migrations', /CREATE DATABASE/.test(provisioning) && /runMigrationsOnUrl\(tenantUrl, "tenant"\)/.test(provisioning)],
  ['provisioning seeds tenant company and app user', /seedTenant/.test(provisioning) && /INSERT INTO app_users/.test(provisioning)],
  ['login uses user_directory before tenant auth', /lookupClientDirectory/.test(read('apps/api/src/auth.js')) && /withTenant\(dir\.company_id/.test(read('apps/api/src/auth.js'))],
  ['worker lists READY tenants dynamically', /listReadyTenantIds/.test(server) && /invoice_processing_jobs/.test(server)],
  ['tenant crypto forbids missing dedicated key in production', /Missing dedicated KMS\/data key for tenant/.test(crypto) && /Weak KMS key/.test(crypto)],
  ['env example exposes provisioning controls', /PROVISIONER_DATABASE_URL/.test(env) && /SECRETS_PROVIDER/.test(env)]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error(`Tenant isolation production gate failed: ${failed} issue(s).`);
  process.exit(1);
}
console.log('TENANT_ISOLATION_PRODUCTION_GATE_PASSED');
