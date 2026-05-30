# تقرير سند ذكي v14.3.8 — إغلاق البنود المطلوبة

تمت مراجعة البنود التي سأل عنها المستخدم بعد v14.3.7، وتبيّن أن بعضها كان مطبقًا وبعضها كان جزئيًا. في هذه النسخة أُغلقت النواقص المتبقية.

## البنود المؤكدة

- محددات المعدل: يوجد مخزن Redis مشترك عبر `REDIS_URL`، والإنتاج يفشل عند غياب Redis بدل السقوط إلى MemoryStore.
- تنظيف `webhook_replay_nonces`: يتم عبر `cleanupWebhookReplayNonces` بعد حجز nonce.
- `loadConfig`: أصبح Singleton عبر `cachedConfig`.
- التبعيات: `sharp`, `opencv`, `DocumentAI`, `jsqr`, و Redis/Secrets Manager في `optionalDependencies`، و`package-lock.json` موجود، وDockerfile يستخدم `npm ci` عند وجوده.

## البنود التي أُصلحت في v14.3.8

- تقرير مالي أساسي: backend كان مفتوحًا، لكن الواجهة كانت لا تزال تقفل صفحة التقارير على `advancedReports`. أُزيل قفل الواجهة وأصبح المدير المالي يرى التقرير الأساسي في الأساسية/النمو، مع بقاء التحليلات المتقدمة حسب الباقة.
- انجراف الترحيلات: تمت مواءمة `infra/postgres` بإضافة 008 و009 و015 حتى لا ينكسر مسار التهيئة القديم إذا استُخدم.
- أخطاء رفع كشف البنك: أضيفت دالة `sendBankStatementUploadError` ووسيط `bankStatementUploadSingle` بحيث ترجع أخطاء الحجم 413 وأخطاء النوع/المحتوى 400 بدل 500 عام.

## التحقق المنفذ

- `node --check src/server.js`
- `node --check src/security-middleware.js`
- `node --check src/config.js`
- `node --check public/app.js`
- `npm ci --omit=optional --ignore-scripts`
- `npm test` — النتيجة 13/13
- `node scripts/tenant-isolation-production-gate.mjs`
- `node scripts/security-hardening-guard.mjs`
- `node scripts/authentication-gate-guard.mjs`

## ملاحظة تشغيلية

لا تزال هذه النسخة تحتاج اختبار Staging حي على RDS/Secrets Manager/Redis وBackup/Restore قبل أي بيانات عملاء حقيقية.
