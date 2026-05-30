@echo off
chcp 65001 >nul
setlocal
echo سند ذكي - حارس قلب البرنامج
node --check apps\api\src\server.js || goto fail
node --check apps\api\public\app.js || goto fail
node scripts\core-regression-guard.mjs || goto fail
echo PASS - قلب البرنامج محفوظ.
pause
exit /b 0
:fail
echo [FAIL] حارس قلب البرنامج رفض النسخة.
pause
exit /b 1
