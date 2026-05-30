#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sanad-thaki/current}"
SHARED_DIR="${SHARED_DIR:-/opt/sanad-thaki/shared}"
ENV_FILE="${ENV_FILE:-$SHARED_DIR/.env}"

echo "== Sanad Thaki: run release =="
echo "APP_DIR=$APP_DIR"

if [ ! -d "$APP_DIR" ]; then
  echo "APP_DIR not found: $APP_DIR"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create it from .env.example and place secrets outside GitHub."
  exit 1
fi

cd "$APP_DIR"
cp "$ENV_FILE" .env

docker compose -f docker-compose.staging.yml up -d --build

echo "Waiting for health..."
for i in {1..30}; do
  if curl -fsS http://127.0.0.1/health >/tmp/sanad-health.json 2>/dev/null; then
    cat /tmp/sanad-health.json
    echo
    echo "Sanad Thaki health check passed."
    exit 0
  fi
  sleep 5
done

echo "Health check failed. Recent logs:"
docker ps
docker compose -f docker-compose.staging.yml logs --tail=120
exit 1
