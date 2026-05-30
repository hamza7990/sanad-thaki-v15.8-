# النشر الاحترافي المعتمد لسند ذكي

القرار: لا تعديل يدوي على السيرفر، ولا تطوير على السيرفر، ولا رفع ZIP للإنتاج.

المسار المعتمد:
GitHub → GitHub Actions → فحص أمني ثابت → رفع إلى EC2 Staging → تشغيل Docker → Health Check → فحص خارجي.

أسرار GitHub المطلوبة:
`STAGING_HOST`: عنوان IP العام للسيرفر.
`STAGING_USER`: غالبًا ubuntu.
`STAGING_SSH_PRIVATE_KEY`: محتوى ملف .pem الخاص بالسيرفر.
`STAGING_ENV_FILE`: محتوى .env لبيئة Staging.

التشغيل:
GitHub → Actions → Deploy Staging to EC2 → Run workflow.

القبول:
لا يقفل Staging إلا بعد نجاح `/health`، فاتورة واحدة، عزل شركة واحدة، Backup/Restore، ثم الفحص الأمني الخارجي.
