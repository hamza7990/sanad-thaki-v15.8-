# سند ذكي v15.4 — Security Closure Lock

هذه النسخة تغلق الثغرات الجوهرية التي ظهرت في فحص v15.3 ككود فعلي داخل الحزمة، مع بقاء شرط الاختبار الحي على Staging قبل استخدام بيانات عملاء مالية حقيقية.

## الإصلاحات الأمنية المنفذة

1. **عدم كشف تفاصيل الجاهزية للعامة**
   - `/health` و`/health/ready` يعيدان ملخصًا فقط: `ok/service/version/checkedAt`.
   - التفاصيل الكاملة انتقلت إلى `/internal/health/ready-details` ومحميّة بتوكن `INTERNAL_HEALTH_BEARER_TOKEN` أو `METRICS_BEARER_TOKEN` في الإنتاج.

2. **Secrets Manager smoke test أقوى**
   - فحص Secrets Manager صار يدعم `create/get/put/get/delete` بدل credentials فقط عند تفعيل `SECRETS_MANAGER_SMOKE_TEST=true`.
   - يمكن إجباره عبر `REQUIRE_SECRETS_MANAGER_SMOKE_TEST=true` في نافذة قبول Staging.

3. **تدوير مفاتيح المستأجر مع إعادة تشفير البيانات**
   - `rotateTenantKey()` صار يستدعي `reencryptTenantData()` افتراضيًا.
   - إعادة التشفير تشمل `invoices.encrypted_payload` و`invoice_processing_jobs.encrypted_upload` على دفعات.
   - يتم تحديث `tenant_crypto_version='tenant-aes-256-gcm-v2'` و`tenant_key_version`.

4. **صلاحيات منفصلة للعمليات الخطرة**
   - أضيفت `PLATFORM_SECURITY_MANAGE` لتدوير مفاتيح التشفير.
   - أضيفت `PLATFORM_TENANT_PROVISION_MANAGE` لإعادة تزويد المستأجرين.
   - لم تعد العمليات الخطرة مربوطة بصلاحية قراءة أمنية فقط.

5. **تأكيد صريح للعمليات الخطرة في الإنتاج**
   - `rotate-key` و`reprovision` يتطلبان `confirmation=<companyId>` أو الترويسة `x-dangerous-operation-confirm=<companyId>` في الإنتاج.

6. **حماية تنظيف قواعد/أدوار يتيمة**
   - `PROVISIONING_CLEAN_ORPHANS=true` لا يعمل في الإنتاج إلا مع:
     - `PROVISIONING_CLEAN_ORPHANS_CONFIRM=<companyId>`
     - `PROVISIONING_ORPHAN_BACKUP_CONFIRMED=true`

7. **بناء Docker أكثر صرامة**
   - `Dockerfile` يستخدم:
     `npm ci --omit=dev --omit=optional --ignore-scripts`

8. **Salla encryption metadata**
   - Webhook سلة صار يحفظ الفواتير بـ `tenant-aes-256-gcm-v2` ويعبئ `tenant_key_version`.

9. **Setup Bootstrap Token**
   - `/setup/initial-admin` في الإنتاج يتطلب `SETUP_BOOTSTRAP_TOKEN` عبر `x-setup-token` أو Bearer token.

10. **Rate limit لمفاتيح التكامل**
    - `/integrations/accounting/invoices` صار يطبق حدًا لكل مفتاح عبر Redis counter.
    - أضيف `last_used_ip` و`failure_count` في التحكم والمستأجر.

11. **تقليل خطر XSS token theft**
    - الواجهة لم تعد تحفظ التوكن في `localStorage`.
    - تسجيل الدخول يضع `sanad_auth` كـ HttpOnly/Secure/SameSite cookie في الإنتاج.
    - `authRequired` يدعم Bearer API clients والكوكي للواجهة.

12. **صلاحيات تشغيل السكربتات**
    - `RUN-SECURITY-CHECK.sh` أصبح executable.

## الترحيلات الجديدة

- `apps/api/migrations/control/004_v15_4_security_closure_lock.sql`
- `apps/api/migrations/020_v15_4_security_closure_lock.sql`
- تمت مزامنة `020` مع `infra/postgres`.

## التحقق المنفذ داخل البيئة

- `node --check` لجميع ملفات `src`, `scripts`, `public`.
- `npm ci --omit=optional --ignore-scripts`.
- `npm test` — 15/15 ناجحة.
- `authentication-gate-guard` ناجح.
- `security-hardening-guard` ناجح.
- `tenant-isolation-production-gate` ناجح.
- `migration-drift-guard` ناجح.
- `npm audit --omit=dev` — صفر ثغرات.
- `RUN-SECURITY-CHECK.sh` ناجح.

## غير مثبت داخل هذه البيئة

- لم يتم تشغيل RDS حي.
- لم يتم تشغيل AWS Secrets Manager فعليًا.
- لم يتم اختبار Meta WhatsApp بمفاتيح حقيقية.
- لم يتم تنفيذ Backup/Restore حي.
- لم يتم تشغيل `acceptance:db-per-tenant` على Staging فعلي.

## الحكم

هذه النسخة تغلق الثغرات السابقة ككود وتسليم، وتصلح لاختبار Staging صارم. لا تدخل بيانات عملاء مالية حقيقية إلا بعد نجاح الاختبارات الحية المذكورة أعلاه.
