# سند ذكي v15.1 — Commercial Requirements Lock

هذه النسخة تغلق البنود التي كانت غير مثبتة فعليًا في نسخة v15.0، مع فصل واضح بين ما تم تنفيذه في الكود وما يحتاج اختبارًا حيًا على AWS/RDS/Secrets Manager/Redis/Meta.

## الإصلاحات المنفذة فعليًا في الملفات

1. **إعادة التزويد Re-Provision**
   - إضافة حالات `ROLLBACK_IN_PROGRESS` و`provision_audit` في قاعدة التحكم.
   - إضافة مسار منصة: `POST /platform/companies/:id/reprovision`.
   - توثيق خطوات التزويد والفشل والرجوع داخل `provision_audit`.

2. **تدوير مفاتيح المستأجرين**
   - إضافة جدول `tenant_key_versions` في قاعدة التحكم.
   - إضافة مسار منصة: `POST /platform/companies/:id/rotate-key`.
   - تحويل التشفير إلى صيغة `v2:<keyVersion>:...` مع دعم فك تشفير بيانات `v1` والنسخ القديمة قدر الإمكان.

3. **استعادة كلمة المرور ذاتيًا**
   - إضافة جدول `password_reset_codes` في قاعدة المستأجر.
   - إضافة `/auth/forgot` و`/auth/reset`.
   - إضافة UI لاستعادة كلمة المرور من شاشة الدخول.
   - حماية 3 طلبات/ساعة لكل بريد عبر Redis أو ذاكرة الاختبار.

4. **عامل الفواتير بقفل موزع**
   - إضافة `redis-client.js`.
   - `runInvoiceQueueWorkerOnce` يستخدم قفل Redis `invoice-queue-worker` لمنع تشغيل أكثر من عامل في أكثر من حاوية.

5. **Rollups والصيانة**
   - إضافة rebuild كامل للـ`tenant_rollups`.
   - إضافة مسارات منصة: `/platform/maintenance/rebuild-rollups` و`/platform/maintenance/run`.
   - إضافة job دوري `COMMERCIAL_MAINTENANCE_INTERVAL_MS`.

6. **مفاتيح التكامل**
   - إضافة `last_used_at` و`disabled_reason` في Control وTenant.
   - تحديث `last_used_at` عند استخدام مفتاح الربط المحاسبي.
   - تعطيل تلقائي للمفاتيح غير المستخدمة أكثر من 90 يومًا ضمن مهمة الصيانة.

7. **Bank Mapping UI/API**
   - إضافة `GET /bank/mapping` و`PUT /bank/mapping/:bankKey`.
   - إضافة واجهة حفظ خرائط أعمدة البنك في صفحة البنك.

8. **المراقبة**
   - إضافة `/metrics` بصيغة Prometheus.
   - في الإنتاج لا يظهر `/metrics` إلا مع `METRICS_BEARER_TOKEN`.

9. **Load Balancer/TLS**
   - إضافة `infra/caddy/Caddyfile.load-balancer` لاستخدامه خلف AWS ALB أو LB خارجي.
   - إضافة إعدادات `TRUST_X_FORWARDED_PROTO` و`CADDY_TLS_MODE` في التحقق.

10. **الترحيلات**
   - إضافة `migrations/control/002_v15_1_commercial_requirements_lock.sql`.
   - إضافة `migrations/018_v15_1_commercial_requirements_lock.sql`.
   - مزامنة 018 إلى `infra/postgres` لنجاح حارس الانجراف.

## التحقق المنفذ داخل هذه البيئة

- `node --check` لكل ملفات `src` و`scripts` و`public/app.js`: ناجح.
- `npm ci --omit=optional --ignore-scripts`: ناجح.
- `npm test`: ناجح — 15/15.
- `authentication-gate-guard`: ناجح.
- `security-hardening-guard`: ناجح.
- `tenant-isolation-production-gate`: ناجح.
- `migration-drift-guard`: ناجح.
- `npm audit --omit=dev`: صفر ثغرات.

## ما بقي غير مثبت داخل هذه البيئة

لم يتم تنفيذ اختبار حي على AWS/RDS/Secrets Manager/Redis/Meta WhatsApp. لذلك تبقى البنود التالية غير مثبتة تشغيلًا حتى تُختبر على Staging حقيقي:

- إنشاء قاعدة مستأجر فعلية على RDS.
- تخزين واسترجاع الأسرار من AWS Secrets Manager.
- تدوير مفتاح مستأجر فعليًا مع بيانات مشفرة قائمة.
- إرسال WhatsApp فعلي عبر Meta.
- اختبارات ضغط متعددة الحاويات.
- Backup/Restore حي لكل مستأجر.

## الحكم

هذه نسخة **Commercial Requirements Lock**: أغلقت المتطلبات الناقصة في الكود والواجهات والترحيلات، لكنها لا تصبح Production-Certified إلا بعد اختبار حي على بنية AWS الفعلية.
