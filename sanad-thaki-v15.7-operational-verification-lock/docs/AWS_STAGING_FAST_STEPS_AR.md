# خطوات AWS Staging المختصرة

## على السيرفر
```bash
git clone https://github.com/sandthaky/sanad-thaki.git
cd sanad-thaki
git checkout v14.0.0-commercial-launch-candidate-v1
cp .env.example .env
nano .env
docker compose -f docker-compose.staging.yml up -d --build
curl http://127.0.0.1/health
```

## المنافذ
افتح:
- 22
- 80
- 443 لاحقًا مع HTTPS

لا تفتح:
- 5432

## بعد التشغيل
نفذ فقط:
- فاتورة واحدة.
- عزل شركة واحدة.
- Backup/Restore.
- تسليم الفحص الأمني الخارجي.
