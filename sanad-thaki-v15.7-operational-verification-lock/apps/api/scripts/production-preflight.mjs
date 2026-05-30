import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { loadConfig } = require('../src/config.js');
const { runReadinessChecks } = require('../src/production-readiness.js');

loadConfig();
const result = await runReadinessChecks({ timeoutMs: Number(process.env.PREFLIGHT_TIMEOUT_MS || 10000) });
console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  console.error('PRODUCTION_PREFLIGHT_FAILED');
  process.exit(1);
}
console.log('PRODUCTION_PREFLIGHT_PASSED');
