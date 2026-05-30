# تقرير سند ذكي v14.3.9 — إغلاق جميع الأخطاء السابقة بدقة

الإصدار: `v14.3.9-complete-error-fix-lock`
الأساس: `v14.3.8-requested-items-complete-lock`
التاريخ: 2026-05-29

## ما تم قفله في هذه النسخة

تمت مراجعة البنود السابقة بندًا بندًا، ثم إغلاق النواقص التي ظهرت بعد الفحص، خصوصًا أن الواجهة كانت لا تزال تحتوي `onclick/onsubmit/onchange` رغم تشديد CSP. في هذه النسخة لم يعد المصدر يولد أي inline event attributes، وتم تحويل الربط إلى delegated `addEventListener` باستخدام `data-action` و`data-submit` و`data-batch-*`.

## البنود المغلقة

1. محددات المعدل تدعم Redis عبر `REDIS_URL`، وتشغيل الإنتاج يرفض الإقلاع بدون Redis.
2. تنظيف `webhook_replay_nonces` مفعّل بعد حجز nonce، مع حذف الصفوف الأقدم من نافذة السماح.
3. تقرير مالي أساسي متاح لباقتي الأساسية/النمو، والتحليلات المتقدمة تبقى حسب الباقة.
4. `loadConfig()` أصبح Singleton ولا يعيد التحقق من البيئة عند كل استدعاء.
5. مواءمة انجراف الترحيلات: تم نسخ 008 و009 و015 إلى `infra/postgres`، وأضيف 017 أيضًا حتى لا تضيع قيود منع ازدواج المطابقة إذا استُخدم مسار `infra/postgres`.
6. التبعيات: Redis بقيت ضمن dependencies لأنها مطلوبة للإنتاج، والتبعيات الأصلية الثقيلة/OCR بقيت ضمن optionalDependencies. يوجد `package-lock.json` و Dockerfile يستخدم `npm ci`.
7. معالجة أخطاء رفع كشف البنك: أخطاء الحجم ترجع 413، والنوع/المحتوى يرجعان 400 بدل 500 عام.
8. تشديد CSP فعليًا: لا يوجد `unsafe-inline` ولا توجد `onclick/onsubmit/onchange` في `public/app.js`.
9. حارس الأمان أصبح يفشل إذا عادت inline handlers أو `unsafe-inline`.
10. حارس core regression تم تحديثه حتى لا يطالب بقفل `/reports/finance` على `advancedReports` بعد أن صار التقرير الأساسي مطلوبًا للباقات الأقل.

## التحقق المنفذ داخل البيئة

- `node --check` لملفات الخادم والواجهة والحراس: نجح.
- `npm ci --omit=optional --ignore-scripts`: نجح، ووجد 0 ثغرات.
- `npm test`: نجح، 13/13.
- `node scripts/tenant-isolation-production-gate.mjs`: نجح.
- `node scripts/security-hardening-guard.mjs`: نجح، ويشمل فحص منع inline handlers.
- `node scripts/authentication-gate-guard.mjs`: نجح.
- `npm audit --omit=dev`: وجد 0 ثغرات.
- `bash RUN-FINAL-SMOKE-TEST-LINUX.sh`: نجح.

## ما لم يُنفذ داخل هذه البيئة

لم يتم تشغيل اختبار حي على RDS/Secrets Manager/Redis/Meta WhatsApp لأن هذه البيئة لا تحتوي بنية AWS/Meta حقيقية. لذلك لا تزال بوابة ما قبل العميل الحقيقي كما هي: Staging فعلي، شركتان فعليتان، عزل متبادل، Redis rate-limit test، Backup/Restore، ثم فحص أمني خارجي وإعادة اختبار.
