# تقرير v14.2.11 — قفل العزل الصارم Database-per-Tenant

تم إكمال الخطوة الحساسة مع الحفاظ على قلب سند كما هو، وإضافة قفل تشغيل يمنع الاعتماد الإنتاجي إذا لم تكن قواعد بيانات الشركات ومفاتيح التشفير منفصلة.

## ما تم قفله

1. **Database-per-Tenant إلزامي في الإنتاج**
   - `REQUIRE_DATABASE_PER_TENANT=true` أصبح شرط تشغيل إنتاجي.
   - لا يوجد fallback إنتاجي إلى قاعدة مشتركة.
   - أي شركة لا يوجد لها Connection String مستقل يتم رفض تشغيل عمليتها.

2. **Dynamic DB Routing**
   - كل عملية شركة تمر عبر `withTenantDatabase(companyId)`.
   - يتم اختيار الاتصال من `TENANT_DATABASE_URLS_JSON` أو متغير شركة مستقل.
   - يتم ضبط سياق قاعدة البيانات `app.company_id` و `app.tenant_db_isolated` داخل المعاملة.

3. **Encryption Key per Tenant**
   - `REQUIRE_TENANT_KMS=true` شرط إنتاجي.
   - `DEFAULT_TENANT_KMS_KEY` ممنوع في الإنتاج.
   - كل شركة يجب أن تمتلك مفتاحًا مستقلًا داخل `TENANT_KMS_KEYS_JSON`.
   - المفتاح الضعيف أو المفقود يوقف العملية.

4. **AI Session Isolation**
   - كل معالجة AI/OpenCV تعمل داخل مجلد مؤقت باسم الشركة والجلسة.
   - يتم حذف الملفات المؤقتة عند نهاية الجلسة.
   - الطابور الخلفي يعالج داخل سياق الشركة نفسه.

5. **Tenant Usage Tracker**
   - تسجيل `invoice_queued` و `invoice_processed` ونتائج المعالجة لكل شركة.
   - الجداول تبقى company-scoped وقابلة للفوترة لاحقًا.

## أوامر الفحص

```bash
cd apps/api
npm run guard:isolation
npm run guard:tenant-production
```

النتيجة المطلوبة:

```text
COMPANY_ISOLATION_STATIC_GUARD_PASSED
TENANT_ISOLATION_PRODUCTION_GATE_PASSED
```

## تنبيه اعتماد

هذه النسخة تقفل الكود ضد fallback غير آمن، لكن الاعتماد النهائي على السيرفر يتطلب ضبط `.env` بقواعد ومفاتيح فعلية لكل شركة ثم اختبار شركة A ضد شركة B فعليًا قبل أي بيانات حقيقية.
