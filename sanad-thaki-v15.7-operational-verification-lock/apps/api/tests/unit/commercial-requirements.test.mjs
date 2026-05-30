import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.NODE_ENV ||= 'test';
process.env.APP_PORT ||= '3999';
process.env.DATABASE_URL ||= 'postgresql://sanad_test:sanad_test@127.0.0.1:5432/sanad_test';
process.env.JWT_SECRET ||= 'unit_test_jwt_secret_64_chars_minimum_for_sanad_thaki_regression_suite_2026';
process.env.REFRESH_TOKEN_SECRET ||= 'unit_test_refresh_secret_64_chars_minimum_for_sanad_thaki_regression_suite_2026';
process.env.DEFAULT_TENANT_KMS_KEY ||= 'unit_test_default_tenant_kms_key_64_chars_minimum_for_crypto_regression_suite';
process.env.REQUIRE_DATABASE_PER_TENANT ||= 'false';
process.env.REQUIRE_TENANT_KMS ||= 'false';
process.env.ENFORCE_HTTPS ||= 'false';
process.env.CORS_ORIGIN ||= 'http://127.0.0.1,http://localhost';

const require = createRequire(import.meta.url);
const { loadConfig } = require('../../src/config.js');
const { setTenantDataKey, clearTenantDataKey } = require('../../src/tenant-secret-cache.js');
const { encryptForTenant, decryptForTenant } = require('../../src/tenant-crypto.js');

test('loadConfig is a singleton reference', () => {
  assert.equal(loadConfig(), loadConfig());
});

test('tenant crypto supports key-versioned encryption after rotation', () => {
  const tenant = 'company-UNITROTATE0001';
  clearTenantDataKey(tenant);
  setTenantDataKey(tenant, 'first-key-material-that-is-long-enough-000000000000', 1, true);
  const oldPayload = encryptForTenant(tenant, 'old-secret');
  assert.match(oldPayload, /^v2:1:/);
  setTenantDataKey(tenant, 'second-key-material-that-is-long-enough-1111111111', 2, true);
  const newPayload = encryptForTenant(tenant, 'new-secret');
  assert.match(newPayload, /^v2:2:/);
  assert.equal(decryptForTenant(tenant, oldPayload), 'old-secret');
  assert.equal(decryptForTenant(tenant, newPayload), 'new-secret');
});
