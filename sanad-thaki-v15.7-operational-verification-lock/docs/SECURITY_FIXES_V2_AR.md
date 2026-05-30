# تقرير إصلاحات الأمان — سند ذكي Security Fixes v2

## الإصلاحات المعتمدة

### 1. أسرار التشغيل
تم منع التشغيل الإنتاجي إذا بقيت أسرار JWT الافتراضية أو كانت أقل من 64 حرفًا.

### 2. إلغاء تسجيل الدخول التجريبي
لم يعد يوجد تسجيل دخول بالبريد فقط.
تسجيل الدخول يتطلب email + password، وكلمة المرور مخزنة bcrypt.

### 3. منع companyId من العميل
أي companyId يرسل من body أو query أو params يتم رفضه.
العزل يتم من JWT فقط.

### 4. RLS
تم تجهيز RLS على:
- companies
- app_users
- invoices
- support_tickets
- audit_logs

### 5. RBAC/SOD
الصلاحيات مفصولة:
- ADMIN: إدارة/إعدادات/دعم/سجلات.
- FINANCE_MANAGER: اعتماد/تقارير/دعم.
- ACCOUNTANT: فواتير/واتساب بعد الاعتماد/دعم.

### 6. واتساب بعد الاعتماد
API يرفض إرسال واتساب إذا لم تكن الفاتورة APPROVED.

### 7. Rate Limit + Helmet + CORS
تمت إضافة حماية API الأساسية.

### 8. Docker non-root
تم تشغيل API داخل الحاوية كمستخدم node وليس root.

### 9. PostgreSQL غير مكشوف
docker-compose لا يفتح منفذ 5432 للعامة.

### 10. اختبارات
تمت إضافة:
- security-check
- tenant-isolation-test
- backup-local
- restore-local

## ما يزال مطلوبًا قبل العملاء
- تشغيل على AWS Staging.
- اختبار العزل Runtime بين شركتين.
- اختبار Backup/Restore فعلي.
- نقل PostgreSQL إلى RDS private.
- تخزين الملفات على S3.
- تفعيل HTTPS للدومين.
- فحص أمن سيبراني خارجي.
