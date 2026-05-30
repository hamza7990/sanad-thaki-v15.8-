import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const appMigrations = path.join(root, 'apps', 'api', 'migrations');
const infraMigrations = path.join(root, 'infra', 'postgres');

const api = fs.readdirSync(appMigrations).filter(f => f.endsWith('.sql')).sort();
const infra = fs.existsSync(infraMigrations) ? fs.readdirSync(infraMigrations).filter(f => f.endsWith('.sql')).sort() : [];
const missing = api.filter(f => !infra.includes(f));
const extra = infra.filter(f => !api.includes(f));
if (missing.length || extra.length) {
  console.error('MIGRATION_DRIFT_GUARD_FAILED');
  console.error(JSON.stringify({ missingInInfra: missing, extraInInfra: extra }, null, 2));
  process.exit(1);
}
console.log('MIGRATION_DRIFT_GUARD_PASSED');
