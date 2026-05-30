import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

// Create tenant DB URL secret file in local secrets dir
const secretDir = '.tenant-secrets';
const tenantUrl = 'postgres://postgres:123456@127.0.0.1:5432/sanad_company_demo_local?sslmode=disable';
const COMPANY_ID = 'company-demo-local';

if (!fs.existsSync(secretDir)) fs.mkdirSync(secretDir, { recursive: true, mode: 0o700 });

// The secrets.js normalizes 'local://X' => reads file `.tenant-secrets/X.secret`
// So we use ref 'local://company-demo-local-db' => file '.tenant-secrets/company-demo-local-db.secret'
const secretRef = 'local://company-demo-local-db';
const secretFile = path.join(secretDir, 'company-demo-local-db.secret');
fs.writeFileSync(secretFile, tenantUrl + '\n', { mode: 0o600 });
console.log('✅ Created secret file:', secretFile);

// Also create a data key secret
const dataKeyFile = path.join(secretDir, 'company-demo-local-key.secret');
if (!fs.existsSync(dataKeyFile)) {
  fs.writeFileSync(dataKeyFile, 'dGVzdC1kYXRhLWtleS1sb2NhbC1kZXZlbG9wbWVudC0xMjM0NTY3\n', { mode: 0o600 });
}
console.log('✅ Created data key file:', dataKeyFile);

// Update tenant_registry to use these refs
const ctrl = new pg.Client({ connectionString: 'postgres://postgres:123456@127.0.0.1:5432/postgres?sslmode=disable' });
await ctrl.connect();
await ctrl.query("BEGIN");
await ctrl.query("SELECT set_config('app.platform_admin','1',true)");
await ctrl.query(`
  UPDATE tenant_registry SET
    db_secret_ref = 'local://company-demo-local-db',
    kms_secret_ref = 'local://company-demo-local-key',
    provision_status = 'READY',
    schema_version = 26,
    last_error = NULL,
    updated_at = now()
  WHERE company_id = $1
`, [COMPANY_ID]);
console.log('✅ Updated tenant_registry to use correct secret refs');

// Ensure tenant_key_versions
await ctrl.query(`
  INSERT INTO tenant_key_versions (company_id, version, secret_ref, active, created_by)
  VALUES ($1, 1, 'local://company-demo-local-key', true, 'seed')
  ON CONFLICT (company_id, version) DO UPDATE SET
    secret_ref = 'local://company-demo-local-key',
    active = true,
    retired_at = NULL
`, [COMPANY_ID]);
console.log('✅ tenant_key_versions updated');

await ctrl.query("COMMIT");
await ctrl.end();

console.log('\n✅ Done! Tenant registry now points to correct secret refs');
console.log('   Restart the server to clear the route cache.');
