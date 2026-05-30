#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR/apps/api"
: "${DATABASE_URL:?DATABASE_URL مطلوب لتشغيل Integration Tests على قاعدة بيانات اختبار نظيفة}"
export NODE_ENV="test"
export JWT_SECRET="${JWT_SECRET:-integration_test_jwt_secret_64_chars_minimum_for_sanad_thaki_regression_suite_2026}"
export REFRESH_TOKEN_SECRET="${REFRESH_TOKEN_SECRET:-integration_test_refresh_secret_64_chars_minimum_for_sanad_thaki_regression_suite_2026}"
export DEFAULT_TENANT_KMS_KEY="${DEFAULT_TENANT_KMS_KEY:-integration_test_default_tenant_kms_key_64_chars_minimum_for_crypto_regression_suite}"
export REQUIRE_DATABASE_PER_TENANT="false"
export REQUIRE_TENANT_KMS="false"
export ENFORCE_HTTPS="false"
export DISABLE_INVOICE_QUEUE_WORKER="true"
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi
npm run test:full
