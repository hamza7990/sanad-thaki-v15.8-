@echo off
cd /d "%~dp0apps\api"
npm run guard:auth
pause
