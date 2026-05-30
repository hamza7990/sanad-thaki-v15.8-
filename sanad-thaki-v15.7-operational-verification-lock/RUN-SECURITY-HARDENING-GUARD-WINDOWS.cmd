@echo off
cd /d %~dp0\apps\api
npm run guard:security-hardening
