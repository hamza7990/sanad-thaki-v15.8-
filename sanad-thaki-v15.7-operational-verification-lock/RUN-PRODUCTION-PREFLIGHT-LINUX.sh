#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker compose -f docker-compose.production.yml up -d redis
docker compose -f docker-compose.production.yml run --rm api node scripts/migrate-db.mjs
docker compose -f docker-compose.production.yml run --rm api node scripts/production-preflight.mjs
