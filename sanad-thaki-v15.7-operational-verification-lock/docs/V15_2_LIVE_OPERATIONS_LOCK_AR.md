# سند ذكي v15.2 — قفل التشغيل الحي والعمليات

هذه النسخة تكمل v15.1 بإضافة طبقة تشغيل حقيقية حول النظام: فصل خدمة API عن عامل الخلفية، فحص قبول حي بعد النشر، سكربتات نسخ احتياطي/استعادة، وتشغيل بوابات إنتاج قبل اعتماد أول عميل.

## ما أُضيف في v15.2

1. **فصل العامل عن API في الإنتاج**
   - `api` في `docker-compose.production.yml` يخدم HTTP فقط.
   - `worker` خدمة مستقلة تعمل بـ `WORKER_ONLY=true` وتعالج طابور الفواتير والصيانة التجارية.
   - العامل يعتمد Redis lock الموجود في v15.1، لذلك لا يعالج أكثر من عامل نفس الدورة حتى لو زادت النسخ.

2. **فحص قبول حي بعد النشر**
   - `apps/api/scripts/live-production-acceptance.mjs`
   - `RUN-LIVE-PRODUCTION-ACCEPTANCE-LINUX.sh`
   - `RUN-LIVE-PRODUCTION-ACCEPTANCE-WINDOWS.cmd`
   - يتحقق من `/health/live` و`/health/ready` وواجهة الدخول، ويمكنه التحقق من `/metrics` عند توفير `METRICS_BEARER_TOKEN`.

3. **نسخ احتياطي واستعادة إنتاجية**
   - `ops/backup-control-db.sh`
   - `ops/backup-tenant-db.sh`
   - `ops/restore-tenant-db-to-new-database.sh`
   - الاستعادة ترفض الكتابة على قاعدة غير فارغة إلا بإقرار صريح `ALLOW_RESTORE_TO_EXISTING=true`.

4. **Runbooks تشغيلية عربية**
   - `docs/STAGING_ACCEPTANCE_RUNBOOK_AR.md`
   - `docs/BACKUP_RESTORE_RUNBOOK_AR.md`
   - `docs/PRODUCTION_CUTOVER_RUNBOOK_AR.md`

## معيار الاعتماد بعد النشر

بعد تعبئة `.env.production` وتشغيل الحاويات، نفذ:

```bash
export SANAD_BASE_URL=https://your-domain.example
export METRICS_BEARER_TOKEN=ضع_توكن_الميتركس_إن_وجد
bash RUN-LIVE-PRODUCTION-ACCEPTANCE-LINUX.sh
```

يجب أن يظهر:

```json
{
  "ok": true,
  "code": "LIVE_ACCEPTANCE_PASSED"
}
```

## ملاحظات صدق مهمة

- هذه النسخة تضيف تشغيلًا وعمليات حول الكود، لكنها لا تثبت اتصال RDS/Secrets Manager/Meta WhatsApp إلا عند تشغيلها في بيئتك الفعلية.
- لا تستخدم بيانات عملاء حقيقية حتى يمر فحص القبول الحي، واختبار شركتين بعزل كامل، واختبار Backup/Restore على قاعدة مستعادة.
