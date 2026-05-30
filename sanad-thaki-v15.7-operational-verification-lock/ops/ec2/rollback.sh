#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${BASE_DIR:-/opt/sanad-thaki}"
RELEASES_DIR="$BASE_DIR/releases"
PREVIOUS="${1:-}"

if [ -z "$PREVIOUS" ]; then
  echo "Usage: ./rollback.sh <release-directory-name>"
  echo "Available releases:"
  ls -1 "$RELEASES_DIR" || true
  exit 1
fi

TARGET="$RELEASES_DIR/$PREVIOUS"

if [ ! -d "$TARGET" ]; then
  echo "Release not found: $TARGET"
  exit 1
fi

ln -sfn "$TARGET" "$BASE_DIR/current"
APP_DIR="$BASE_DIR/current" SHARED_DIR="$BASE_DIR/shared" "$TARGET/ops/ec2/run-release.sh"

echo "Rollback completed to: $PREVIOUS"
