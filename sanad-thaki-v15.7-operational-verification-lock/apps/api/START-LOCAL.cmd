@echo off
REM SANAD THAKI - Local Development Startup Script
REM Run this to start the backend with correct local database settings

set DATABASE_URL=postgres://postgres:123456@127.0.0.1:5432/postgres?sslmode=disable
set PROVISIONER_DATABASE_URL=postgres://postgres:123456@127.0.0.1:5432/postgres?sslmode=disable
set TENANT_DATABASE_URL_TEMPLATE=postgres://postgres:123456@127.0.0.1:5432/{DB}?sslmode=disable
set JWT_SECRET=abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz1234567890123456
set REFRESH_TOKEN_SECRET=1234567890123456abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz
set NODE_ENV=development
set APP_PORT=4000
set CORS_ORIGIN=http://localhost:3000,http://localhost:4000,http://127.0.0.1:3000
set PROVISIONING_MODE=shared-dev
set SECRETS_PROVIDER=local
set LOCAL_TENANT_SECRET_DIR=.tenant-secrets
set REDIS_URL=
set ENFORCE_HTTPS=false
set SETUP_BOOTSTRAP_TOKEN=dev-bootstrap-token-32chars-min-ok
set INTERNAL_HEALTH_BEARER_TOKEN=dev-health-token
set METRICS_BEARER_TOKEN=dev-metrics-token
set BYPASS_SECRETS_MANAGER_CHECK=true
set REQUIRE_TENANT_KMS=false
set REQUIRE_DATABASE_PER_TENANT=false

echo.
echo ==========================================
echo  SANAD THAKI Backend starting on port 4000
echo ==========================================
echo.
node src/server.js
