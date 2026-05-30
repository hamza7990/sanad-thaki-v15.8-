#!/usr/bin/env bash
set -euo pipefail
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required. Use a NEW empty database; never point this at production without change approval.}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
if [[ ! -f "$BACKUP_FILE" ]]; then echo "Backup file not found: $BACKUP_FILE" >&2; exit 1; fi
if [[ -f "$BACKUP_FILE.sha256" ]]; then sha256sum -c "$BACKUP_FILE.sha256"; fi
if [[ "${ALLOW_RESTORE_TO_EXISTING:-false}" != "true" ]]; then
  TABLE_COUNT=$(psql "$TARGET_DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'" || echo "999")
  if [[ "$TABLE_COUNT" != "0" ]]; then
    echo "Refusing restore: target database is not empty. Set ALLOW_RESTORE_TO_EXISTING=true only after formal approval." >&2
    exit 1
  fi
fi
pg_restore --no-owner --no-acl --dbname="$TARGET_DATABASE_URL" "$BACKUP_FILE"
echo "TENANT_RESTORE_COMPLETED"
