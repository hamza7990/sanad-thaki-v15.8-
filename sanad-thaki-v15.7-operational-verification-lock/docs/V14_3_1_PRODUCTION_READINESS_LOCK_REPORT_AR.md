# سند ذكي v14.3.1 — قفل جاهزية الإنتاج الأمني

هذه نسخة قفل أمني نهائية فوق v14.3.0، بدون تغيير قلب سند أو دورة العمل المالية.

## ما تمت إضافته

1. **Rate Limiting مستقل**
   - حماية `/auth/login` من محاولات Brute Force.
   - حماية Webhook سلة من DoS.
   - حماية رفع كشف البنك من الإساءة.
   - حد عام للـ API.

2. **Audit Trail غير قابل للتعديل**
   - جدول `security_audit_trail` منفصل.
   - RLS مفعل ومجبَر.
   - Trigger يمنع UPDATE و DELETE.
   - يسجل: اعتماد الفاتورة، إرسال الواتساب، رفع كشف البنك، اعتماد المطابقة، Webhook سلة، تحديث سلة.

3. **HTTPS Enforcement & Secure Headers**
   - تحويل HTTP إلى HTTPS في الإنتاج.
   - HSTS لمدة سنة.
   - CSP متوافق مع الواجهة الحالية.
   - منع framing و object injection.
   - no-referrer و no-sniff.

## ملفات مهمة

- `apps/api/src/security-middleware.js`
- `apps/api/src/audit.js`
- `apps/api/migrations/014_v14_3_1_production_readiness_lock.sql`
- `.env.example`

## أوامر الفحص

```bash
cd apps/api
npm run guard:isolation
npm run guard:tenant-production
npm run guard:security-hardening
```

## ملاحظة إنتاجية

لا تستخدم بيانات عملاء حقيقية قبل ضبط HTTPS، قواعد بيانات الشركات، مفاتيح التشفير، النسخ الاحتياطي، وفحص أمني خارجي.
