# تقرير v14.2.13 — ربط سلة الآمن

## ما تم
- إضافة مسار حفظ إعدادات ربط سلة لكل شركة: `POST /integrations/salla/config`.
- إضافة Webhook آمن لاستقبال `order.created`: `POST /integrations/salla/webhook/:companyId/order-created`.
- التحقق من `X-Salla-Signature` باستخدام HMAC-SHA256 و timing-safe comparison.
- إنشاء فاتورة داخل سند من طلب سلة مع ربط خارجي في `ecommerce_order_links`.
- تحديث حالة طلب سلة بعد اعتماد المطابقة البنكية وتحويل الفاتورة إلى PAID عبر `POST /admin/v2/orders/{order_id}/status`.
- حفظ أسرار سلة وتوكناتها مشفرة بمفتاح الشركة Tenant KMS.
- تفعيل RLS على جداول التكاملات الجديدة.

## ما لم يتغير
- لم يتم تغيير قلب سند.
- لم يتم تغيير RBAC/SOD.
- لم يتم تغيير مسار اعتماد الفاتورة أو الواتساب أو المطابقة البنكية.

## متطلبات التشغيل
- ضبط `PUBLIC_APP_URL`.
- حفظ Webhook Secret و Access Token لكل شركة من مسار الإعداد.
- تفعيل حدث `order.created` في لوحة سلة على رابط الشركة.
