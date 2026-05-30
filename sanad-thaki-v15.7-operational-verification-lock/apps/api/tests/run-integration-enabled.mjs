import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--test", "tests/integration/full-cycle.integration.test.mjs"], {
  stdio: "inherit",
  env: { ...process.env, RUN_INTEGRATION_TESTS: "true" }
});

process.exit(result.status ?? 1);
