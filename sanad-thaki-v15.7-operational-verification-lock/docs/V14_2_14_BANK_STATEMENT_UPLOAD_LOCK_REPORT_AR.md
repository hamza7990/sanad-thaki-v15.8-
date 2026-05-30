# تقرير v14.2.14 — قراءة كشف البنك Excel/CSV كرفع مباشر

## الهدف
إكمال دورة الربط والتحصيل بدون إضافة Open Banking حالياً:

سلة order.created → فاتورة في سند → اعتماد المدير المالي → رفع كشف بنك Excel/CSV → تحويل الصفوف إلى عمليات بنكية → تشغيل المطابقة → اعتماد المطابقة → تحديث سلة كمدفوع.

## ما تم تنفيذه
- إضافة رفع كشف البنك من صفحة المدير المالي فقط داخل قسم البنك والمطابقة.
- دعم ملفات: CSV و XLSX و XLS.
- قراءة الصفوف في Backend باستخدام:
  - `xlsx` لملفات Excel.
  - `csv-parse` لملفات CSV.
  - `multer` لرفع الملف في الذاكرة مع حد حجم 10MB.
- اكتشاف تلقائي لأعمدة الكشف الشائعة عربي/إنجليزي:
  - تاريخ العملية.
  - الوصف/البيان.
  - المبلغ أو الدائن.
  - المرجع.
- دعم خريطة أعمدة اختيارية عند اختلاف صيغة البنك.
- تحويل الصفوف المقبولة إلى جدول `bank_transactions`.
- تجاهل السحوبات أو المبالغ غير الصالحة لأن سند يطابق التحصيل الوارد فقط في هذه المرحلة.
- منع تكرار العمليات البنكية عبر `source_hash` لكل شركة.
- حفظ سجل الاستيراد في `bank_statement_imports`.
- حفظ خريطة الأعمدة لكل شركة وبنك في `bank_statement_column_mappings`.
- تشغيل محرك المطابقة تلقائياً بعد الاستيراد.
- الحفاظ على اعتماد المدير المالي للمطابقة قبل تحويل الفاتورة إلى `PAID`.
- عند اعتماد المطابقة، يستمر ربط سلة السابق بتحديث الطلب إلى `completed`.

## الملفات المعدلة
- `apps/api/src/server.js`
- `apps/api/public/app.js`
- `apps/api/package.json`
- `apps/api/migrations/012_v14_2_14_bank_statement_upload_lock.sql`
- `VERSION`

## مسارات API الجديدة
- `POST /bank/statement/upload`
  - صلاحية: Finance Manager فقط عبر `BANK_MANAGE`.
  - يحول الملف إلى عمليات بنكية ويشغل المطابقة.
- `GET /bank/statement/imports`
  - يعرض آخر ملفات كشوف البنك المستوردة.

## ما لم يتم إضافته عمداً
- لم يتم إضافة Open Banking.
- لم يتم إضافة اتصال مباشر مع البنوك.
- لم يتم تغيير قلب سند أو دورة الصلاحيات أو منطق اعتماد المدير المالي.

## الفحوصات
- Node syntax check passed.
- Security check passed.
- Core regression guard passed.
- Company isolation static guard passed.
- Tenant production gate passed.
- Release check passed.

## تنبيه تشغيل
قبل التشغيل يجب تنفيذ:

```bash
cd apps/api
npm install
npm run migrate
npm start
```

ثم اختبار ملف كشف بنك حقيقي بصيغة CSV/XLSX من المدير المالي.
