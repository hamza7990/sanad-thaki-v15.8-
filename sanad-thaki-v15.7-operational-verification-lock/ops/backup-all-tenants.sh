#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
node scripts/backup-all-tenants.mjs
