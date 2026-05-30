# تقرير v14.3.4 — Full Regression Tests Lock

هذه النسخة لا تغيّر قلب سند ذكي ولا تضيف ميزة تشغيلية جديدة للمستخدم النهائي. التغيير مخصص لإضافة طبقة اختبارات آلية تمنع التعديلات الجديدة من كسر الميزات القديمة.

## ما أُضيف

1. Unit Tests داخل `apps/api/tests/unit/auth-rbac-security.test.mjs` تغطي:
   - صرامة JWT ومنع `company_id` القادم من العميل.
   - منع خلط أدمن سند ذكي مع نطاق شركة.
   - فحص `jti` وتجزئة معرف الجلسة.
   - فصل الصلاحيات بين أدمن سند، أدمن الشركة، المدير المالي، والمحاسب.
   - إجبار تغيير كلمة المرور قبل استخدام الصلاحيات.
   - منع IDOR عبر رفض `companyId/company_id` في body/query/params.
   - تشفير بيانات المستأجر وفشل فكها من شركة أخرى.

2. Integration Tests داخل `apps/api/tests/integration/full-cycle.integration.test.mjs` تغطي دورة كاملة على API حقيقي وقاعدة بيانات اختبار:
   - التهيئة الأولى والتسجيل `/setup/initial-admin`.
   - تسجيل الدخول والجلسات الحية `/auth/login`.
   - الباقات والأسعار `/billing/plans`.
   - إنشاء شركة من أدمن سند بباقات مختلفة.
   - التحقق من عزل مسارات المنصة عن مسارات الشركات.
   - منع مزايا الباقة الأساسية غير المتاحة مثل مطابقة البنك.
   - تحديث بيانات الشركة مع منع تمرير `companyId` من العميل.
   - إنشاء محاسب ومدير مالي، وإجبار تغيير كلمة المرور لأول دخول.
   - إنشاء فاتورة، إرسالها للمراجعة، قفلها، منع تعديلها بعد القفل.
   - منع اعتماد المحاسب، واعتماد المدير المالي فقط.
   - منع واتساب قبل الاعتماد، والسماح به بعد الاعتماد وفي باقة مؤهلة.
   - إنشاء عملية بنكية، تشغيل المطابقة، اعتماد المطابقة، وتحويل الفاتورة إلى مدفوعة.
   - قراءة التقارير، الاستخدام، تذاكر الدعم، والسجلات مع التحقق من عدم تسريب سجلات شركة أخرى.

3. أوامر تشغيل الاختبارات:
   - Linux/macOS: `RUN-UNIT-TESTS-LINUX.sh`
   - Linux/macOS full cycle: `RUN-FULL-REGRESSION-TESTS-LINUX.sh`
   - Windows unit: `RUN-UNIT-TESTS-WINDOWS.cmd`
   - Windows full cycle: `RUN-FULL-REGRESSION-TESTS-WINDOWS.cmd`

4. GitHub Actions workflow جديد:
   - `.github/workflows/regression-tests.yml`
   - يشغّل Unit Tests و Integration Tests مع PostgreSQL service قبل الدمج أو النشر.

## طريقة التشغيل المختصرة

داخل `apps/api`:

```bash
npm install --no-audit --no-fund
npm run test:unit
```

للاختبار الكامل يجب توفير قاعدة بيانات اختبار فارغة أو قابلة للمسح:

```bash
export DATABASE_URL="postgresql://sanad_app:password@127.0.0.1:5432/sanad_test"
./RUN-FULL-REGRESSION-TESTS-LINUX.sh
```

## ملاحظات مهمة

- اختبارات Integration تمسح جداول قاعدة الاختبار باستخدام `TRUNCATE ... CASCADE`، لذلك يجب عدم تشغيلها على قاعدة إنتاج أو قاعدة تحتوي بيانات حقيقية.
- لا توجد في هذه النسخة بوابة دفع تنفيذية فعلية مثل Moyasar/Tap checkout؛ لذلك تم تغطية جزء الدفع المتاح حاليًا كـ `billing/plans` والباقات والحدود وميزة الاشتراك. عند إضافة بوابة الدفع لاحقًا يجب إضافة اختبارات مخصصة لـ checkout، webhook، تفعيل الاشتراك، وفشل الدفع.
- هذه الحزمة مخصصة للحماية من Regression قبل كل تعديل جديد، ولا تغني عن فحص أمني خارجي قبل بيانات العملاء الحقيقية.

## معيار قبول النسخة

تُقبل النسخة إذا نجح الآتي:

```bash
npm run test:unit
npm run test:integration
```

أو عبر GitHub Actions بنجاح job: `sanad-regression-tests`.
