@echo off
cd /d "%~dp0\apps\api"
node scripts\live-production-acceptance.mjs
pause
