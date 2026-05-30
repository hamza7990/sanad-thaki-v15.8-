# تقرير v14.2.5 Security Gate Lock

هذه نسخة إصلاح حماية فقط، وليست إضافة ميزة.

## ما تم

- مراجعة دالة `contains` في `scripts/release-check.mjs`.
- ثبت أن الدالة السابقة كانت تضع `ok=false` ثم تنهي العملية بـ `process.exit(1)` عند نقص العلامات، لكنها كانت غير واضحة بالاسم.
- تم تغييرها إلى `mustContain` لتكون إلزامية صريحة.
- تم جعل `rateLimit` و `helmet` مطلوبين بعلامات أدق: الاستيراد والتفعيل عبر `app.use`.
- تم تقوية `scripts/security-check.mjs` للتحقق من `helmet` و `rateLimit` و `cors` كاستيراد وتفعيل.
- تم إضافة `RUN-PRE-DEPLOY-GATE-LINUX.sh` و `RUN-PRE-DEPLOY-GATE-WINDOWS.cmd`.
- تم إضافة `core-regression-guard` إلى مسار رفع Staging في GitHub Actions قبل الاتصال بالسيرفر.

## أثر الأمان

إذا حُذف `helmet` أو `rateLimit` أو تعطّل تفعيلهما في `server.js`، تفشل فحوصات `security-check` و `release-check`، وبالتالي يتوقف الرفع الآلي على Staging.

## القرار

صالحة كـ Security Gate Lock قبل الرفع على Staging، مع استمرار منع بيانات العملاء الحقيقية قبل الفحص الأمني الخارجي واختبار العزل والنسخ الاحتياطي/الاستعادة.
