#!/usr/bin/env bash
set -euo pipefail

# تشغيل أولي اختياري فقط إذا لم يتم تفعيل GitHub Actions بعد.
# المطلوب:
#   REPO_URL=https://github.com/<owner>/<repo>.git
# الاختياري:
#   RELEASE_REF=v14.0.0-commercial-launch-candidate-v1
#   GITHUB_TOKEN=... للمستودعات الخاصة

REPO_URL="${REPO_URL:?Set REPO_URL}"
RELEASE_REF="${RELEASE_REF:-main}"
BASE_DIR="${BASE_DIR:-/opt/sanad-thaki}"
RELEASE_NAME="$(date -u +%Y%m%d%H%M%S)-${RELEASE_REF//\//-}"
RELEASE_DIR="$BASE_DIR/releases/$RELEASE_NAME"

sudo mkdir -p "$BASE_DIR/releases" "$BASE_DIR/shared"
sudo chown -R "$USER":"$USER" "$BASE_DIR"

AUTH_REPO_URL="$REPO_URL"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  AUTH_REPO_URL="$(echo "$REPO_URL" | sed "s#https://#https://${GITHUB_TOKEN}@#")"
fi

git clone "$AUTH_REPO_URL" "$RELEASE_DIR"
cd "$RELEASE_DIR"
git checkout "$RELEASE_REF"

if [ ! -f "$BASE_DIR/shared/.env" ]; then
  cp .env.example "$BASE_DIR/shared/.env"
  echo "تم إنشاء $BASE_DIR/shared/.env"
  echo "عدّل ملف البيئة أولًا ثم شغّل السكربت مرة أخرى."
  exit 1
fi

ln -sfn "$RELEASE_DIR" "$BASE_DIR/current"
APP_DIR="$BASE_DIR/current" SHARED_DIR="$BASE_DIR/shared" "$RELEASE_DIR/ops/ec2/install-docker.sh"
APP_DIR="$BASE_DIR/current" SHARED_DIR="$BASE_DIR/shared" "$RELEASE_DIR/ops/ec2/run-release.sh"
