# دليل الانتقال للإنتاج — سند ذكي

## قبل الانتقال

- مرّت اختبارات Staging.
- مر اختبار عزل شركتين.
- مر اختبار Backup/Restore.
- تم تفعيل HTTPS والدومين.
- تم تفعيل Redis بكلمة مرور.
- تم تفعيل Secrets Manager بصلاحيات أقل امتياز.

## تشغيل الإنتاج

```bash
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d --build
```

## التحقق

```bash
export SANAD_BASE_URL=https://app.your-domain.example
export METRICS_BEARER_TOKEN=...
bash RUN-LIVE-PRODUCTION-ACCEPTANCE-LINUX.sh
```

## بعد التشغيل

- راقب `/health/ready` لمدة 30 دقيقة.
- راقب Redis وPostgreSQL و5xx.
- أنشئ شركة تجريبية داخل الإنتاج ببيانات غير حقيقية، ثم احذفها/عطلها حسب سياسة التشغيل.

## Rollback

- لا تستخدم `docker compose down -v` في الإنتاج.
- ارجع إلى آخر tag مستقر.
- لا تحذف volumes أو قواعد بيانات.
