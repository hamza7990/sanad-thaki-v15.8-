# تقرير تسليم سند ذكي v14.3.7 — إقفال إصلاح الأخطاء السابقة

## الهدف

هذه النسخة مبنية على `v14.3.6-db-per-tenant-production-fix` وتغلق الأخطاء السابقة المذكورة في مراجعة `v14.3.4/v14.3.5` قدر الإمكان داخل الكود، مع الحفاظ على مسار العزل الحقيقي: قاعدة تحكم مركزية + سجل مستأجرين + قاعدة مستقلة لكل عميل.

## الإصلاحات المطبقة

1. إصلاح `parseMoney` محفوظ ومختبر: مبالغ كشف البنك العشرية لا تتضخم ×100.
2. اعتماد المطابقة البنكية أصبح آمنًا ماليًا: يستخدم قفل صفوف `FOR UPDATE` ويتأكد أن الفاتورة `APPROVED` والحركة `UNMATCHED` قبل أي تحديث، ولا يترك تحديثًا جزئيًا عند التعارض.
3. تمت إضافة قيدين على مستوى قاعدة البيانات لمنع اعتماد أكثر من مطابقة لنفس الفاتورة أو نفس الحركة البنكية.
4. عدّاد المطابقة يعتمد `rowCount` ولا يحسب الصفوف التي تجاهلها `ON CONFLICT`.
5. الربط المحاسبي يستخدم دليل مفاتيح مركزي `integration_key_directory` بدل البحث الخاطئ في قاعدة واحدة.
6. Webhook سلة لا يرفض الطلب فقط بسبب غياب timestamp إلا إذا كان `WEBHOOK_REQUIRE_TIMESTAMP=true`، مع بقاء التوقيع ومانع التكرار.
7. تنظيف nonces القديمة مضاف داخل مسار Webhook.
8. CSP صار يحظر inline scripts/styles: `scriptSrc: ['self']` و `styleSrc: ['self']`، وتمت إضافة جسر واجهة يربط أحداث الواجهة عبر `addEventListener` بدل الاعتماد الفعلي على inline event execution.
9. محددات المعدّل أصبحت تفشل مغلقة في الإنتاج إن لم يكن `REDIS_URL` موجودًا أو إن لم تعمل مكتبات Redis.
10. إرسال واتساب عبر Meta أصبح يحاول حتى 3 مرات، ويسجل المحاولة والرد والحالة، مع حقول حالة جديدة في `whatsapp_messages`.
11. تقرير المالية لم يعد يحتوي تعبيرين متطابقين بلا معنى: `approved_invoices` يحسب `APPROVED + PAID`، و`unpaid_approved_invoices` يحسب المعتمد غير المدفوع فقط.
12. طبقة DB-per-Tenant من v14.3.6 محفوظة: `tenant_registry`, `user_directory`, `provisioning`, `tenant-db-router`, وترحيل المستأجرين.

## ملفات مهمة تغيرت

- `apps/api/src/server.js`
- `apps/api/src/security-middleware.js`
- `apps/api/src/config.js`
- `apps/api/public/app.js`
- `apps/api/public/styles.css`
- `apps/api/migrations/017_v14_3_7_previous_errors_hardening_lock.sql`
- `apps/api/package.json`
- `RELEASE_MANIFEST.json`
- `VERSION`

## التحقق المنفذ داخل البيئة

نجح التالي:

```bash
node --check src/*.js src/integrations/*.js
node --check scripts/*.mjs
node --check public/app.js
npm test
node scripts/tenant-isolation-production-gate.mjs
node scripts/security-hardening-guard.mjs
node scripts/authentication-gate-guard.mjs
npm audit --omit=dev
```

## ما لم أستطع تنفيذه داخل هذه البيئة

لم يتم تنفيذ اختبار حي على RDS/Secrets Manager/Redis/Meta WhatsApp لأن هذه البيئة لا تملك بنية إنتاج فعلية. تم توليد `package-lock.json` وتشغيل `npm ci --omit=optional --ignore-scripts` ثم `npm test` بنجاح، كما أن `npm audit --omit=dev` أصبح صفر ثغرات.

## شرط عدم استخدام بيانات عملاء حقيقية

لا تستخدم بيانات عملاء حقيقية حتى تمر هذه الاختبارات على Staging:

1. إنشاء شركتين فعليًا والتأكد من وجود قاعدتين مستقلتين.
2. دخول أدمن كل شركة بالبريد فقط دون 500/401.
3. محاولة توكن شركة A قراءة بيانات شركة B ويجب أن تفشل.
4. اختبار Redis rate limits.
5. اختبار Backup/Restore لمستأجر واحد.
6. إعادة فحص أمني خارجي بعد تطبيق v14.3.7.
