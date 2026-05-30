#!/usr/bin/env bash
set -euo pipefail

echo "====================================================="
echo "سند ذكي - فحص مختصر للنسخة التجارية ذات الواجهة"
echo "v14.4.0-production-runtime-lock"
echo "====================================================="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[FAIL] Node.js غير موجود."
  exit 1
fi

echo "[1/4] JavaScript Syntax Check..."
node --check apps/api/src/server.js
node --check apps/api/src/auth.js
node --check apps/api/src/config.js
node --check apps/api/src/rbac.js

echo
echo "[2/4] Security Check..."
node scripts/security-check.mjs

echo
echo "[3/4] Release Check..."
node scripts/release-check.mjs

echo
echo "[4/4] Core Regression Guard..."
node scripts/core-regression-guard.mjs

echo
echo "PASS - الفحص الآلي المختصر نجح."
echo
echo "بعد التشغيل على Staging افتح: http://SERVER-IP/login"
echo "إذا كانت قاعدة البيانات جديدة سيظهر إنشاء حساب الأدمن الأول."
echo "لا تستخدم بيانات عملاء حقيقية قبل الفحص الأمني الخارجي."
