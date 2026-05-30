@echo off
chcp 65001 >nul
setlocal

echo =====================================================
echo سند ذكي - فحص مختصر للنسخة التجارية ذات الواجهة
echo v14.4.0-production-runtime-lock
echo =====================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [FAIL] Node.js غير موجود.
  pause
  exit /b 1
)

echo [1/4] JavaScript Syntax Check...
node --check apps\api\src\server.js || goto fail
node --check apps\api\src\auth.js || goto fail
node --check apps\api\src\config.js || goto fail
node --check apps\api\src\rbac.js || goto fail

echo.
echo [2/4] Security Check...
node scripts\security-check.mjs || goto fail

echo.
echo [3/4] Release Check...
node scripts\release-check.mjs || goto fail

echo.
echo [4/4] Core Regression Guard...
node scripts\core-regression-guard.mjs || goto fail

echo.
echo PASS - الفحص الآلي المختصر نجح.
echo بعد التشغيل على Staging افتح: http://SERVER-IP/login
echo لا تستخدم بيانات عملاء حقيقية قبل الفحص الأمني الخارجي.
pause
exit /b 0

:fail
echo.
echo [FAIL] فشل الفحص.
pause
exit /b 1
