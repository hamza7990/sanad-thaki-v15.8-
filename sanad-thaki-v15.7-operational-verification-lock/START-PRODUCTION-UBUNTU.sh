#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "تثبيت Docker..."
  sudo apt update -y
  sudo apt install -y docker.io docker-compose-plugin
  sudo systemctl enable docker
  sudo systemctl start docker
fi

if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  echo "تم إنشاء .env.production من المثال. عدّل القيم الحقيقية ثم أعد تشغيل هذا السكربت."
  echo "الأهم: DATABASE_URL / PROVISIONER_DATABASE_URL / APP_DOMAIN / AWS_REGION / JWT secrets / REDIS_PASSWORD."
  exit 2
fi

echo "فحص ملف البيئة قبل التشغيل..."
if grep -Eq 'REPLACE_WITH|example.com|RDS-ENDPOINT|TENANT-RDS-ENDPOINT|CONTROL_APP_USER|CONTROL_PASSWORD|PROVISIONER_USER|PROVISIONER_PASSWORD' .env.production; then
  echo "فشل: .env.production ما زال يحتوي قيماً افتراضية. عدّلها أولاً."
  exit 2
fi

echo "بناء الحاويات..."
docker compose -f docker-compose.production.yml build

echo "تشغيل Redis المشترك..."
docker compose -f docker-compose.production.yml up -d redis

echo "تشغيل ترحيلات قاعدة التحكم والمستأجرين..."
docker compose -f docker-compose.production.yml run --rm api node scripts/migrate-db.mjs

echo "تشغيل فحص الإنتاج قبل الإقلاع..."
docker compose -f docker-compose.production.yml run --rm api node scripts/production-preflight.mjs

echo "تشغيل التطبيق و HTTPS..."
docker compose -f docker-compose.production.yml up -d api caddy

echo "انتظار جاهزية التطبيق..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.production.yml exec -T api wget -qO- --header='X-Forwarded-Proto: https' http://127.0.0.1:3000/health/ready >/tmp/sanad-ready.json 2>/dev/null; then
    echo "PRODUCTION_READY"
    cat /tmp/sanad-ready.json
    echo ""
    echo "افتح: $(grep '^PUBLIC_APP_URL=' .env.production | cut -d= -f2-)"
    exit 0
  fi
  sleep 3
done

echo "فشل: التطبيق لم يصل إلى ready. آخر السجلات:"
docker compose -f docker-compose.production.yml logs --tail=120 api
exit 1
