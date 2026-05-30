#!/usr/bin/env bash
set -euo pipefail
: "${TENANT_DATABASE_URL:?TENANT_DATABASE_URL is required for the specific tenant}"
: "${TENANT_ID:?TENANT_ID is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
SAFE_TENANT="$(echo "$TENANT_ID" | tr -cd 'A-Za-z0-9_.-')"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/tenant-$SAFE_TENANT-$TS.dump"
pg_dump --format=custom --no-owner --no-acl --file="$OUT" "$TENANT_DATABASE_URL"
sha256sum "$OUT" > "$OUT.sha256"
echo "TENANT_BACKUP_CREATED=$OUT"
