# سند ذكي v15.3-production-hardening-lock

هذه نسخة إصلاح هندسي فوق v15.2 لإغلاق العيوب الجوهرية التي ظهرت في التدقيق الصارم. لا تدّعي هذه الوثيقة أن النشر تم على AWS؛ هي تثبت ما أُضيف في الكود والحزمة، وتحدد بوابات القبول الحي المطلوبة قبل بيانات العملاء.

## ما أُصلح فعليًا في الملفات

1. **اختبار قبول DB-per-Tenant حقيقي**: أُضيف `apps/api/scripts/production-db-per-tenant-acceptance.mjs` ليُنشئ شركتين، يزوّد قاعدتين مستقلتين، يتحقق من `tenant_registry`, ويثبت أن B لا يرى فاتورة A. هذا الاختبار يُشغّل على Staging حقيقي، وليس داخل الاختبارات الخفيفة.
2. **فحص الجاهزية للتزويد**: `production-readiness.js` صار يفحص صلاحيات `PROVISIONER_DATABASE_URL` من ناحية `CREATEDB/CREATEROLE`، ويدعم smoke test اختياري لإنشاء/حذف role/database.
3. **فحص Secrets Manager**: readiness صار يتحقق من AWS Secrets Manager، ويدعم smoke test اختياري create/get/delete.
4. **إصلاح schema_version**: عدّاء الترحيل يرفع المستأجرين إلى `schema_version=19` بدل 17، والتزويد الجديد يستخدم 19.
5. **تقوية استعادة كلمة المرور**: `generateResetCode` يستخدم `crypto.randomInt` بدل `Math.random`، وأضيف عداد محاولات لكل رمز وحد محاولات على البريد.
6. **تتبع إصدار مفتاح التشفير**: إدخالات الفواتير ومهام القراءة تحفظ `tenant_key_version` وتستخدم صيغة `tenant-aes-256-gcm-v2`.
7. **تحسين provisioning/reprovision**: أضيف قفل PostgreSQL advisory لكل شركة، وفحص مسبق للـrole/database، ومسار إصلاح يتطلب `PROVISIONING_CLEAN_ORPHANS=true` لتنظيف البقايا بشكل واعٍ.
8. **Metrics أقوى**: `/metrics` يعرض الجاهزية، Redis، عدد المستأجرين الجاهزين/الفاشلين، فشل التزويد آخر 24 ساعة، وطابور الفواتير.
9. **Load Balancer override**: أُضيف `docker-compose.production.load-balancer.yml` لاستخدام `Caddyfile.load-balancer` فعليًا.
10. **نسخ احتياطي لكل المستأجرين**: أُضيف `apps/api/scripts/backup-all-tenants.mjs` و`ops/backup-all-tenants.sh` لقراءة `tenant_registry` ونسخ Control DB وكل Tenant DB.
11. **ترحيلات v15.3**: أضيفت `019_v15_3_production_hardening_lock.sql` و`control/003_v15_3_production_hardening_lock.sql`.
12. **توحيد الإصدار**: `VERSION`, `package.json`, `package-lock.json`, `/health/live`, و`RELEASE_MANIFEST.json` تم توحيدها على v15.3.

## بوابات القبول الحي قبل بيانات العملاء

على Staging حقيقي:

```bash
cd apps/api
npm run preflight:production
npm run acceptance:db-per-tenant
npm run acceptance:live
```

للاختبار العميق المؤقت فقط على Staging:

```bash
PROVISIONER_SMOKE_TEST=true SECRETS_MANAGER_SMOKE_TEST=true npm run preflight:production
```

## غير مثبت داخل هذه البيئة

- لم يتم تشغيل RDS/Secrets Manager/Redis الحقيقي هنا.
- لم يتم تشغيل Meta WhatsApp الحقيقي هنا.
- لم يتم تنفيذ Backup/Restore فعلي على RDS.
- لم يتم فحص خارجي من جهة أمنية مستقلة.

الحكم: هذه نسخة كود وتشغيل أكثر صرامة من v15.2، لكنها لا تُعد إنتاجًا حيًا حتى تمر بوابات القبول على Staging فعلي.
