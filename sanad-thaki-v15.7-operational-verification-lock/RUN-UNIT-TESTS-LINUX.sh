#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/apps/api"
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi
npm run test:unit
