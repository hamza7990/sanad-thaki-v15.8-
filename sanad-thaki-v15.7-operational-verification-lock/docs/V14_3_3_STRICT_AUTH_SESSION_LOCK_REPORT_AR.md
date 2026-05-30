# سند ذكي v14.3.3 — Strict Auth Session Lock

## الهدف
إقفال نهائي لمنطق تسجيل الدخول والجلسات والفصل بين أدمن سند العام ومستخدمي الشركات، بدون تغيير قلب سند أو دورة الفاتورة.

## ما تم تنفيذه
- إضافة جدول `auth_sessions` لتسجيل الجلسات الحية باستخدام بصمة SHA-256 لـ `jwtid` بدل تخزينه كنص مباشر.
- إلزام كل JWT بالتحقق من:
  - `issuer`
  - `audience`
  - `subject`
  - `jwtid`
  - `iat/exp`
  - خوارزمية `HS256` فقط.
- منع أي Token خاص بأدمن سند من حمل `companyId` أو `company_id`.
- إلزام مستخدم الشركة بـ `companyId` صحيح يتم التحقق منه Server-side داخل `withTenant(companyId)`.
- إعادة التحقق مع كل طلب من:
  - جدول `platform_admins` لأدمن سند العام.
  - جدول `app_users` وحالة الشركة لمستخدمي الشركات.
  - جدول `auth_sessions` للتأكد أن الجلسة غير منتهية وغير ملغاة.
- إضافة `routeIsolationGuard` لعزل مسارات:
  - `/platform/*` لأدمن سند فقط.
  - `/company` لمستخدمي الشركة فقط.

## الملفات المتأثرة
- `apps/api/src/auth.js`
- `apps/api/src/server.js`
- `apps/api/scripts/authentication-gate-guard.mjs`
- `apps/api/migrations/016_v14_3_3_strict_auth_session_lock.sql`
- `infra/postgres/016_v14_3_3_strict_auth_session_lock.sql`

## الفحوصات
- `AUTHENTICATION_GATE_PASSED`
- `COMPANY_ISOLATION_STATIC_GUARD_PASSED`
- `TENANT_ISOLATION_PRODUCTION_GATE_PASSED`
- `SECURITY_HARDENING_GUARD_PASSED`
- `Core regression guard passed`
- `Security check passed`
- `Release check passed`

## ملاحظات إنتاجية
قبل فتح بيانات عملاء حقيقية يجب تشغيل اختبار حي:
1. Company Admin يحاول فتح `/platform/overview` ويجب أن يحصل على 403.
2. Platform Admin يحاول فتح `/company` ويجب أن يحصل على 403.
3. إلغاء جلسة من `auth_sessions.revoked_at` ثم تجربة نفس التوكن ويجب أن يرفض.
4. اختبار Tenant_A ضد Tenant_B للتأكد من عدم وجود IDOR.
