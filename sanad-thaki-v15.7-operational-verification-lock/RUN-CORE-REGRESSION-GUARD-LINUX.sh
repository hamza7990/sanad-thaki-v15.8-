#!/usr/bin/env bash
set -euo pipefail

echo "سند ذكي - حارس قلب البرنامج"
node --check apps/api/src/server.js
node --check apps/api/public/app.js
node scripts/core-regression-guard.mjs
echo "PASS - قلب البرنامج محفوظ."
