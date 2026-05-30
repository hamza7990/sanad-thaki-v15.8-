import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('public readiness never throws and never exposes internal check details when dependencies are unavailable', async () => {
  const oldEnv = { ...process.env };
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = 'postgres://invalid:invalid@127.0.0.1:1/invalid';
  process.env.JWT_SECRET = 'x'.repeat(80);
  process.env.REFRESH_TOKEN_SECRET = 'y'.repeat(80);
  delete process.env.REDIS_URL;
  delete process.env.PROVISIONER_DATABASE_URL;
  process.env.SECRETS_PROVIDER = 'local';

  const { runReadinessChecks } = require('../../src/production-readiness.js');
  const result = await runReadinessChecks({ timeoutMs: 100, publicOnly: true });
  assert.equal(result.ok, false);
  assert.equal(typeof result.checkedAt, 'string');
  assert.equal(typeof result.checks.controlDb.ok, 'boolean');
  assert.equal(result.checks.controlDb.database, undefined);
  assert.equal(result.checks.productionEnv.databaseUrl, undefined);
  process.env = oldEnv;
});
