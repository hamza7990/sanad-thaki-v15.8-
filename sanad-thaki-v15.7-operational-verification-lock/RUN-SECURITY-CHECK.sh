#!/usr/bin/env bash
set -euo pipefail
node scripts/security-check.mjs
echo "Static security check completed."
