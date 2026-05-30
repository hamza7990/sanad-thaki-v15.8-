# تقرير v14.2.12 — Production OCR / ZATCA QR / Google Document AI

## النطاق
تم تحويل جزء القراءة من Hook/Plan إلى تنفيذ Backend فعلي قابل للتشغيل بعد تثبيت dependencies وضبط مفاتيح Google Document AI.

## ما أضيف
- OpenCV فعلي عبر `@techstark/opencv-js` داخل `apps/api/src/ai-session-isolation.js`.
- معالجة صورة فعلية: grayscale, GaussianBlur, Adaptive Thresholding, Deskewing.
- فك QR فعلي عبر `jsqr` و`sharp`.
- ZATCA Base64 TLV Parser حقيقي داخل `apps/api/src/zatca-qr-parser.js`.
- Google Document AI SDK فعلي داخل `runGoogleDocumentAi`.
- Worker أصبح يستدعي المسار الحقيقي: preprocessing → QR → Document AI → OpenAI fallback → Math Cross-check.
- إضافة dependencies المطلوبة في `apps/api/package.json`.

## متطلبات التشغيل
- تثبيت dependencies داخل `apps/api`.
- ضبط `GOOGLE_DOCUMENT_AI_PROCESSOR_NAME`.
- ضبط `GOOGLE_APPLICATION_CREDENTIALS` أو صلاحيات Google ADC على السيرفر.
- إبقاء إعدادات العزل `REQUIRE_DATABASE_PER_TENANT=true` و`REQUIRE_TENANT_KMS=true` في الإنتاج.

## نتيجة الفحص الثابت
- COMPANY_ISOLATION_STATIC_GUARD_PASSED
- TENANT_ISOLATION_PRODUCTION_GATE_PASSED

## تنبيه أمان
لا تزال النسخة لا تستخدم بيانات عملاء حقيقية قبل الاختبار التشغيلي على Staging وفحص أمني خارجي.
