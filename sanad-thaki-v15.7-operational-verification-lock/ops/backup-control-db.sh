#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/control-db-$TS.dump"
pg_dump --format=custom --no-owner --no-acl --file="$OUT" "$DATABASE_URL"
sha256sum "$OUT" > "$OUT.sha256"
echo "CONTROL_BACKUP_CREATED=$OUT"
