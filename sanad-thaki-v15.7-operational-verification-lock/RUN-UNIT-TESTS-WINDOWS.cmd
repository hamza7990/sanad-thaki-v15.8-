@echo off
setlocal
cd /d "%~dp0apps\api"
if not exist node_modules (
  npm install --no-audit --no-fund
)
npm run test:unit
