# تقرير سند ذكي v14.4.0 — Production Runtime Lock

## الهدف
تحويل النسخة من كود مصحح فقط إلى حزمة تشغيل إنتاجية تفشل بوضوح عند نقص البنية، ولا تعتبر نفسها جاهزة إلا بعد فحص قاعدة التحكم، Redis، وسياسات بيئة الإنتاج.

## ما تم تغييره

1. **فصل تشغيل الإنتاج عن التشغيل المحلي**
   - إضافة `docker-compose.production.yml` بدون PostgreSQL محلي للأعمال.
   - قاعدة التحكم وقواعد المستأجرين يجب أن تكون PostgreSQL/RDS خارجية.
   - Redis مشترك داخل compose كحد أدنى لمحددات المعدل، ويمكن استبداله بRedis مُدار بتغيير `REDIS_URL`.

2. **بوابة إنتاج إلزامية قبل التشغيل**
   - إضافة `apps/api/scripts/production-preflight.mjs`.
   - يتحقق من:
     - `NODE_ENV=production`.
     - `REQUIRE_DATABASE_PER_TENANT=true`.
     - `REQUIRE_TENANT_KMS=true`.
     - `SECRETS_PROVIDER=aws`.
     - وجود `PROVISIONER_DATABASE_URL`.
     - أن `PUBLIC_APP_URL` و `CORS_ORIGIN` تستخدم HTTPS.
     - اتصال Control DB ووجود `tenant_registry`, `user_directory`, `integration_key_directory`, `tenant_rollups`.
     - اتصال Redis ونجاح `PING`.

3. **Health Checks إنتاجية**
   - `/health/live`: فحص حياة بسيط.
   - `/health/ready`: فحص جاهزية حقيقي يعتمد Control DB + Redis + إعدادات الإنتاج.
   - `/health`: صار متوافقًا مع الجاهزية وليس فحصًا شكليًا.

4. **تشغيل HTTPS إنتاجي**
   - إضافة `infra/caddy/Caddyfile`.
   - Caddy يفعّل HTTPS تلقائيًا للدومين في `APP_DOMAIN` ويضبط `X-Forwarded-Proto=https`.

5. **أمر تشغيل إنتاج واضح**
   - إضافة `START-PRODUCTION-UBUNTU.sh`.
   - السكربت:
     - يرفض التشغيل إذا بقيت قيم `.env.production` الافتراضية.
     - يبني الحاويات.
     - يشغل Redis.
     - يشغل ترحيلات قاعدة التحكم والمستأجرين.
     - ينفذ preflight.
     - يشغل API وCaddy.
     - ينتظر `/health/ready` ثم يطبع `PRODUCTION_READY`.

6. **إقفال بناء Docker**
   - `Dockerfile` يستخدم `npm ci --omit=dev` فقط، ولا يعود إلى `npm install`.
   - عند إقلاع الحاوية: `migrate-db` ثم `production-preflight` ثم `npm start`.

7. **حارس انجراف الترحيلات**
   - إضافة `apps/api/scripts/migration-drift-guard.mjs`.
   - يفشل إذا لم تكن ترحيلات `apps/api/migrations/*.sql` موجودة أيضًا في `infra/postgres`.

## ملفات جديدة/معدلة مهمة

- `.env.production.example`
- `docker-compose.production.yml`
- `infra/caddy/Caddyfile`
- `START-PRODUCTION-UBUNTU.sh`
- `RUN-PRODUCTION-PREFLIGHT-LINUX.sh`
- `apps/api/src/production-readiness.js`
- `apps/api/scripts/production-preflight.mjs`
- `apps/api/scripts/migration-drift-guard.mjs`
- `apps/api/src/config.js`
- `apps/api/src/server.js`
- `apps/api/Dockerfile`

## حدود التحقق داخل بيئة المساعد
تم التحقق ساكنًا وباختبارات Node داخل بيئة المساعد. لم يتم الاتصال فعليًا بـRDS/Secrets Manager/Redis حقيقي لأن بيانات البنية والأسرار غير متاحة. لذلك تعد هذه نسخة تشغيل إنتاجية جاهزة للتسليم الفني، وليست تأكيدًا أن سيرفرك الفعلي أُعد بنجاح.

## شرط أول عميل حقيقي
لا تدخل بيانات عميل حقيقي إلا بعد أن يطبع السيرفر:

```text
PRODUCTION_READY
```

ثم يتم اختبار عمليًا:

1. إنشاء شركتين.
2. التأكد من وجود قاعدتين فيزيائيتين منفصلتين.
3. دخول أدمن كل شركة بالبريد فقط.
4. منع توكن شركة A من قراءة B.
5. رفع فاتورة وكشف بنك ومطابقة واعتماد.
6. اختبار Backup/Restore لمستأجر واحد.
