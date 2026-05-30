#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
sudo docker compose -f docker-compose.staging.yml exec -T postgres psql -U sanad_app -d sanad_thaki < infra/postgres/002_v14_1_operator_dashboard.sql
sudo docker compose -f docker-compose.staging.yml exec api npm run seed:platform-admin
sudo docker compose -f docker-compose.staging.yml restart api nginx
echo "v14.1 migration applied and platform admin seeded."
