@echo off
setlocal
cd /d "%~dp0apps\api"
if "%DATABASE_URL%"=="" (
  echo DATABASE_URL مطلوب لتشغيل Integration Tests على قاعدة بيانات اختبار نظيفة
  exit /b 1
)
if "%NODE_ENV%"=="" set NODE_ENV=test
if "%JWT_SECRET%"=="" set JWT_SECRET=integration_test_jwt_secret_64_chars_minimum_for_sanad_thaki_regression_suite_2026
if "%REFRESH_TOKEN_SECRET%"=="" set REFRESH_TOKEN_SECRET=integration_test_refresh_secret_64_chars_minimum_for_sanad_thaki_regression_suite_2026
if "%DEFAULT_TENANT_KMS_KEY%"=="" set DEFAULT_TENANT_KMS_KEY=integration_test_default_tenant_kms_key_64_chars_minimum_for_crypto_regression_suite
set REQUIRE_DATABASE_PER_TENANT=false
set REQUIRE_TENANT_KMS=false
set ENFORCE_HTTPS=false
set DISABLE_INVOICE_QUEUE_WORKER=true
if not exist node_modules (
  npm install --no-audit --no-fund
)
npm run test:full
