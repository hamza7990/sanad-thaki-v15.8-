# تقرير v15.6 Commercial Value Features Lock — قلب سند

## نطاق التنفيذ
هذه النسخة أضافت ثلاث حزم قيمة تجارية مطلوبة دون تغيير قلب العزل والصلاحيات:

1. واتساب تحصيل فعلي لكل شركة.
2. ربط محاسبي / استيراد فواتير Excel/CSV مع mapping وسجل مزامنة.
3. لوحة CFO للتحصيل والتحليل المالي.

## 1) واتساب Business لكل شركة
تم تنفيذ الآتي:

- جدول `whatsapp_business_settings` لكل شركة مع مزود `meta` أو `bsp`.
- حفظ Access Token / App Secret / BSP config مشفرًا بمفتاح المستأجر، وليس كنص صريح.
- جدول `whatsapp_templates` لقوالب Meta المعتمدة لكل مرحلة: `FIRST`, `SECOND`, `FINAL`.
- جدول `whatsapp_reminder_events` لمنع تكرار نفس مرحلة التذكير لنفس الفاتورة.
- رقم العميل لم يعد يُدخل عبر prompt؛ أصبح يُحفظ في الفاتورة `customer_phone`.
- الإرسال لم يعد يتم داخل الطلب المباشر، بل يُدرج في طابور `whatsapp_messages`.
- Worker مستقل `runWhatsappQueueWorkerOnce` بقفل Redis موزع.
- دعم `delivery_status`: `QUEUED`, `SENT`, `DELIVERED`, `READ`, `FAILED`.
- Webhook من Meta: `/integrations/whatsapp/meta/webhook` لتحديث delivered/read/failed.
- دليل مركزي `whatsapp_phone_directory` في Control DB لتوجيه Webhook إلى قاعدة الشركة الصحيحة.

## 2) الربط المحاسبي / استيراد الفواتير
تم تنفيذ الآتي:

- دعم أنظمة: `qoyod`, `daftara`, `odoo`, `zoho`, `generic` عبر صفحة/واجهة استيراد موحدة.
- رفع Excel/CSV مباشر للفواتير المحاسبية: `/integrations/accounting/imports/upload`.
- شاشة mapping لأعمدة الفواتير: رقم الفاتورة، العميل، الرقم الضريبي، المبلغ، الجوال، تاريخ الفاتورة، تاريخ الاستحقاق.
- جدول `accounting_import_mappings` لحفظ mapping لكل نظام.
- جدول `accounting_import_batches` لتوثيق كل عملية استيراد.
- جدول `accounting_sync_logs` لسجل مزامنة مفصل باسم النظام والحالة والاتجاه.
- الحفاظ على منع التكرار باستخدام `(company_id, invoice_number, supplier_tax_number)`.
- دعم الحقول الجديدة في الفواتير: `customer_phone`, `invoice_date`, `due_date`, `source_system`, `external_source`.
- بنية `accounting_outbound_webhooks` أضيفت للتكامل الخارجي اللاحق بشكل مراقب.

## 3) لوحة CFO للتحصيل
تم توسيع `/reports/finance` ليشمل:

- معدل التحصيل `collection_rate`.
- أعمار الذمم: `0-30`, `31-60`, `61-90`, `90+`.
- العملاء الأعلى تأخرًا.
- الفواتير المتأخرة حسب الأيام.
- وعود السداد `PROMISED`.
- الفواتير المتنازع عليها `DISPUTED`.
- مقارنة شهرية للتحصيل.
- فلاتر API: `dateFrom`, `dateTo`, `customer`, `minAmount`, `maxAmount`.
- تصدير Excel: `/reports/finance/export?format=xlsx`.
- تصدير PDF بسيط: `/reports/finance/export?format=pdf`.

## الأمان
- توكنات واتساب وBSP مشفرة بمفتاح المستأجر.
- Webhook Meta يوجه حسب `phone_number_id` في Control DB ثم يكتب داخل قاعدة المستأجر فقط.
- عند وجود App Secret يتم التحقق من `x-hub-signature-256`.
- الإرسال يمر عبر Worker وقفل Redis وليس داخل طلب المستخدم.
- لا يتم قبول companyId من العميل.
- RLS مفعلة على الجداول الجديدة.
- لا يوجد inline JavaScript في الواجهة.

## ملفات جديدة/معدلة رئيسية
- `apps/api/src/commercial-value-features.js`
- `apps/api/migrations/021_v15_6_commercial_value_features_lock.sql`
- `apps/api/migrations/control/005_v15_6_commercial_value_features_lock.sql`
- `apps/api/public/app.js`
- `apps/api/src/server.js`
- `infra/postgres/021_v15_6_commercial_value_features_lock.sql`

## التحقق المنفذ داخل هذه البيئة
- `npm ci --omit=optional --ignore-scripts`: نجح.
- `npm test`: نجح 16/16.
- `node --check` لكل ملفات `src`, `scripts`, و`public/app.js`: نجح.
- `authentication-gate-guard`: نجح.
- `security-hardening-guard`: نجح.
- `tenant-isolation-production-gate`: نجح.
- `migration-drift-guard`: نجح.
- `npm audit --omit=dev`: صفر ثغرات.
- `RUN-SECURITY-CHECK.sh`: نجح.

## غير مثبت داخل هذه البيئة
- لم يتم إرسال رسالة Meta فعلية بمفاتيح Meta حقيقية.
- لم يتم استقبال Webhook Meta حي من Meta.
- لم يتم اختبار ربط مباشر مع Qoyod/Daftara/Odoo/Zoho APIs الرسمية؛ المتاح الآن استيراد Excel/CSV وAPI موحد وسجل مزامنة.
- لم يتم تشغيل RDS/Secrets Manager/Redis حيًا في هذه البيئة.

## الحكم
هذه النسخة تنفذ حزم رفع القيمة التجارية في الكود والواجهة والترحيلات مع ضوابط أمان. لا تعتمد بيانات عملاء مالية حقيقية إلا بعد Staging حي يختبر Meta WhatsApp، DB-per-Tenant، Backup/Restore، وRedis worker.
