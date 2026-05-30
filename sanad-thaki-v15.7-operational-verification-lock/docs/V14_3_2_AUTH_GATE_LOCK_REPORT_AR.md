# تقرير v14.3.2 — Authentication Gate Lock

تم تقوية منطق تسجيل الدخول والفصل بين أدمن سند العام وأدمن الشركة بدون تغيير قلب النظام.

## ما تم قفله

- فصل صارم بين `SANAD_ADMIN` و أدوار الشركات `ADMIN / FINANCE_MANAGER / ACCOUNTANT`.
- منع أي توكن Platform Admin من حمل `companyId`.
- إلزام توكنات مستخدمي الشركات بوجود `companyId` صحيح وموقّع من السيرفر فقط.
- التحقق من كل جلسة Platform Admin من جدول `platform_admins` مع كل طلب.
- التحقق من كل جلسة مستخدم شركة داخل `withTenant(companyId)` مع كل طلب.
- منع Company Admin من دخول `/platform/*` حتى لو غيّر الرابط يدويًا.
- منع Platform Admin من دخول مسارات الشركة مثل `/company` أو عمليات tenant التشغيلية.
- تقوية JWT بـ issuer/audience/jti/subject وخوارزمية HS256 محددة.
- جعل RBAC يفحص نوع النطاق `PLATFORM` أو `TENANT` قبل السماح بأي Permission.
- إصلاح سياق RLS الإضافي عبر `app.current_company_id` مع `app.company_id`.
- إضافة سياسة `companies_login_lookup` حتى يستطيع Backend أثناء تسجيل الدخول التحقق من أن الشركة نشطة دون كشف بيانات الشركات للواجهة.

## فحص الأمان

تمت إضافة أمر:

```bash
cd apps/api
npm run guard:auth
```

والنتيجة المتوقعة:

```text
AUTHENTICATION_GATE_PASSED
```

## حدود الاعتماد

هذا فحص كود وبنية. قبل العملاء الحقيقيين يجب اختبار حي:

- أدمن سند يدخل `/platform/overview` وينجح.
- أدمن شركة يحاول دخول `/platform/overview` ويحصل على `403`.
- أدمن سند يحاول دخول `/company` ويحصل على `403`.
- مستخدم شركة A يحاول قراءة/تعديل فاتورة شركة B ويحصل على `403/404`.
