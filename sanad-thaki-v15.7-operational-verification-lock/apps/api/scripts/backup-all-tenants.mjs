#!/usr/bin/env node
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const require = createRequire(import.meta.url);
const { getSecret } = require('../src/secrets.js');
const { Pool } = pg;

const controlUrl = process.env.DATABASE_URL;
const backupDir = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
if (!controlUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
fs.mkdirSync(backupDir, { recursive: true });

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function runPgDump(label, url, out) {
  const r = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--no-acl', `--file=${out}`, url], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`pg_dump failed for ${label}`);
  fs.writeFileSync(`${out}.sha256`, `${sha256File(out)}  ${path.basename(out)}\n`);
}

const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const manifest = { createdAt: new Date().toISOString(), controlBackup: null, tenants: [] };

const controlOut = path.join(backupDir, `control-db-${ts}.dump`);
runPgDump('control', controlUrl, controlOut);
manifest.controlBackup = controlOut;

const pool = new Pool({ connectionString: controlUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.login_lookup','1',true)");
  const r = await client.query("SELECT company_id, db_secret_ref FROM tenant_registry WHERE provision_status='READY' ORDER BY company_id ASC");
  await client.query('COMMIT');
  for (const row of r.rows) {
    const tenantUrl = await getSecret(row.db_secret_ref);
    const safeTenant = String(row.company_id).replace(/[^A-Za-z0-9_.-]/g, '_');
    const out = path.join(backupDir, `tenant-${safeTenant}-${ts}.dump`);
    runPgDump(row.company_id, tenantUrl, out);
    manifest.tenants.push({ companyId: row.company_id, backup: out });
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  client.release();
  await pool.end();
}

const manifestFile = path.join(backupDir, `sanad-backup-manifest-${ts}.json`);
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ ok: true, manifestFile, tenants: manifest.tenants.length }, null, 2));
