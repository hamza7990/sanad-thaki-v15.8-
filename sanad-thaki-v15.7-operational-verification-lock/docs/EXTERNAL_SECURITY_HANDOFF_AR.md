# ملف تسليم الفحص الأمني الخارجي — سند ذكي

## النسخة
`v14.0.0-commercial-launch-candidate-v1`

## نطاق الفحص المطلوب
يرجى فحص المنصة باعتبارها SaaS متعدد الشركات، مع التركيز على:

1. Authentication / JWT
2. Authorization / RBAC / Segregation of Duties
3. Tenant Isolation / Company Isolation
4. IDOR prevention
5. منع قبول companyId من العميل
6. PostgreSQL RLS
7. API input validation
8. Rate limiting
9. CORS
10. Security headers
11. Secrets handling
12. Backup/Restore process
13. Audit logs
14. Docker/Nginx/AWS Staging exposure
15. عدم فتح PostgreSQL للعامة
16. فحص مسار الفاتورة والواتساب بعد الاعتماد فقط
17. فحص الدعم الفني وعزل التذاكر حسب الشركة

## مخرجات الفحص المطلوبة
- Critical findings
- High findings
- Medium findings
- Low findings
- Evidence/screenshots
- Remediation recommendation
- Retest result

## شرط الإطلاق
ممنوع الإطلاق التجاري ببيانات عملاء قبل:
- معالجة Critical بالكامل.
- معالجة High أو قبولها رسميًا بخطة زمنية واضحة.
- نجاح Retest.
- نجاح Backup/Restore.
- نجاح Tenant Isolation.
