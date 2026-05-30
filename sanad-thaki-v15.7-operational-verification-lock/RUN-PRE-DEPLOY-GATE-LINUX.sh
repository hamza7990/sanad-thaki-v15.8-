#!/usr/bin/env bash
set -euo pipefail

echo "Sanad Thaki pre-deploy security gate"
node --check apps/api/src/server.js
node scripts/security-check.mjs
node scripts/release-check.mjs
node scripts/core-regression-guard.mjs
node apps/api/scripts/security-hardening-guard.mjs
echo "PASS - pre-deploy gate passed. Production readiness security gates passed."
