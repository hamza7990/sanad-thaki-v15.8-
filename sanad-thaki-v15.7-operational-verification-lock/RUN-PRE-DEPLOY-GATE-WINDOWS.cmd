@echo off
setlocal
echo Sanad Thaki pre-deploy security gate
node --check apps/api/src/server.js || exit /b 1
node scripts/security-check.mjs || exit /b 1
node scripts/release-check.mjs || exit /b 1
node scripts/core-regression-guard.mjs || exit /b 1
echo PASS - pre-deploy gate passed. Production readiness security gates passed.
