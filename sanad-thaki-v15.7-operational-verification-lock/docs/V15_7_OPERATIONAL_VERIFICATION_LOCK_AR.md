# تقرير v15.7 — Operational Verification Lock

## سبب الإصدار
أثناء التحقق التشغيلي الفعلي من نسخة v15.6 ظهر أن تشغيل السيرفر محليًا مع `REDIS_URL` غير متاح قد يؤدي إلى سقوط العملية بسبب اتصال Redis في طبقة rate-limit/locks.

## الإصلاح
- جعل مخزن Redis لمحددات المعدل لا يُستخدم في بيئة development/test إلا عند تفعيل `USE_REDIS_RATE_LIMIT_IN_DEV=true`.
- إضافة `error` handler لعملاء Redis لمنع unhandled error events.
- تقليل retry/offline queue في Redis clients.
- جعل locks/counters تسقط إلى in-memory fallback في غير الإنتاج عند تعذر Redis، مع بقاء الإنتاج صارمًا.

## التحقق المنفذ
- `npm ci --omit=optional --ignore-scripts` نجح.
- `npm test` نجح: 16/16.
- `authentication-gate-guard` نجح.
- `security-hardening-guard` نجح.
- `tenant-isolation-production-gate` نجح.
- `migration-drift-guard` نجح.
- `npm audit --omit=dev` صفر ثغرات.
- تشغيل محلي فعلي: `/health/live` رجع 200.
- تشغيل محلي فعلي: `/health/ready` رجع 503 منضبط عند غياب PostgreSQL/Redis بدل سقوط السيرفر.

## حدود الإثبات
لم يتم إثبات RDS/Secrets Manager/Redis/Meta WhatsApp/Backup-Restore حيًا داخل هذه البيئة.
