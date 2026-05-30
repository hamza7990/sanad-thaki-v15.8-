
## v14.4.0-production-runtime-lock — 2026-05-29

- Added production-only runtime profile with `docker-compose.production.yml` and Caddy HTTPS.
- Added `.env.production.example` and strict production config gates.
- Added `/health/live` and `/health/ready`; readiness checks Control DB registry tables and Redis.
- Added `production-preflight.mjs` and `START-PRODUCTION-UBUNTU.sh`.
- Dockerfile now requires `package-lock.json` and uses `npm ci --omit=dev`.
- Added migration drift guard.


## v14.3.9-complete-error-fix-lock — 2026-05-29

- أُزيلت event handlers المضمّنة من الواجهة نهائيًا واستبدلت بربط أحداث آمن.
- أضيف فحص يمنع عودة `unsafe-inline` أو `onclick/onsubmit/onchange`.
- تم تحديث core regression guard ليدعم التقرير المالي الأساسي للباقات الأقل.
- أضيفت الترحيلة 017 إلى `infra/postgres` لإغلاق انجراف منع ازدواج المطابقة.
- أعيد التحقق: unit tests 13/13، حراس العزل/الأمان/الدخول، smoke test، و npm audit بدون ثغرات.
## v14.3.4 - Full Regression Tests Lock
- Added Unit Tests for JWT strictness, RBAC/SOD, IDOR guard, and tenant crypto isolation.
- Added Integration Test for the full API cycle: setup/registration, login, billing plans/package gates, platform company creation, users, password change, invoice workflow, finance approval, WhatsApp after approval, bank transaction, matching, reporting, support tickets, audit logs, and tenant isolation.
- Added Linux/Windows runners and GitHub Actions regression workflow with PostgreSQL service.
- No core runtime product behavior changed; this release is a protection layer against regressions before future modifications.

## v14.3.3 - Strict Auth Session Lock
- Added server-side `auth_sessions` table storing hashed JWT `jti` values.
- Every request now validates issuer, audience, subject, jwtid, iat/exp and live session state.
- Added absolute route isolation middleware for `/platform/*` and `/company`.
- Platform Admin sessions are revalidated inside platform scope and cannot carry company tenant context.
- Company user sessions are revalidated inside `withTenant(companyId)` and cannot rely on client-supplied company IDs.
- Updated authentication guard to require `AUTHENTICATION_GATE_PASSED` with live-session checks.
- Preserved Sanad core workflow, tenant isolation, RBAC/SOD, Salla integration, bank statement upload, OCR, queue, reports and WhatsApp approval flow.

## v14.3.1 - Production Readiness Lock
- Added dedicated login, webhook, bank upload, and global API rate limiting.
- Added HTTPS enforcement and production security headers: HSTS, CSP, frame deny, no-sniff, no-referrer.
- Added immutable `security_audit_trail` with RLS and mutation-blocking triggers.
- Added security audit trail entries for invoice approval, WhatsApp send, bank statement upload, bank match approval, Salla webhook import, and Salla paid sync.
- Preserved Sanad core workflow, RBAC/SOD, tenant isolation, Salla integration, bank statement upload, queue, OCR, and reports.


## v14.2.14 - Bank Statement Upload Lock
- Added Finance Manager Excel/CSV bank statement upload.
- Added automatic bank row parsing, duplicate prevention, import audit, and auto matching run.
- No Open Banking added in this release.


## v14.2.13-salla-integration-lock
- Added secure Salla order.created webhook integration.
- Added tenant-scoped encrypted Salla integration settings.
- Added ecommerce_integrations and ecommerce_order_links tables with RLS.
- Added automatic Salla order status sync after bank match approval marks an invoice as PAID.
- Preserved Sanad core workflow, RBAC/SOD, tenant isolation, queue, OCR, reports, WhatsApp, and bank matching.


## v14.2.11 — Tenant Isolation Hard Enforcement Lock

- جعل Database-per-Tenant إلزاميًا في الإنتاج.
- منع fallback إلى قاعدة مشتركة عند NODE_ENV=production.
- جعل KMS per Tenant إلزاميًا ومنع DEFAULT_TENANT_KMS_KEY في الإنتاج.
- إضافة guard:tenant-production لفحص قفل العزل الإنتاجي.
- الحفاظ على قلب سند ومسار الفواتير/المحاسب/الاعتماد كما هو.


## v14.2.5-security-gate-lock

- Security gate clarification only; no new product features.
- Renamed release-check marker function from `contains` to `mustContain` so mandatory markers clearly fail the release gate.
- Added explicit mandatory checks for `express-rate-limit` and `helmet` imports and middleware activation.
- Added pre-deploy gate scripts for Linux/Windows.
- Added core-regression-guard to the staging deployment workflow before any EC2 upload/deploy step.

# v14.2.4-core-guard-lock

- أضيف `CORE_PROTECTION_MANIFEST.json` لتثبيت قلب البرنامج غير القابل للكسر.
- أضيف `scripts/core-regression-guard.mjs` كحارس Regression إلزامي قبل أي اعتماد.
- رُبط حارس القلب مع GitHub Actions وSmoke Test على ويندوز/لينكس.
- حُسنت واجهة المحاسب بحيث لا يظهر زر واتساب عند عدم أهلية الباقة، حتى لو كانت الفاتورة معتمدة.
- أزيلت بقايا دالة الشروط والسياسات من داخل التطبيق بعد تسجيل الدخول، مع بقاء الصفحات العامة خارج النظام.
- لا ميزات جديدة؛ هذا إصدار حماية وإتقان للقلب فقط.

# v14.2.3-staging-repair-lock

- أصلح ترتيب SQL الخاص بجدول الدعم حتى لا تفشل قاعدة بيانات جديدة.
- أضاف مشغل مايغريشن تلقائي داخل حاوية API لتطبيق 001-005 على قواعد البيانات الموجودة.
- عدّل Docker Compose ليحمّل مجلد المايغريشن كاملًا بدل ملف واحد فقط.
- أعاد ربط زر رفع/قراءة الفاتورة بواجهة API حقيقية مع استخراج بيانات، نسبة ثقة، ومسار مراجعة يدوية.
- نقل userLimitGuard من GET /users إلى POST /users.
- قفل التقارير المتقدمة على باقة الاحترافية.
- حذف عبارة داشبورد أدمن سند ذكي من الواجهة واستبدالها بلوحة تشغيل المنصة.
- حدّث حد واتساب الاحترافية إلى 800 شهريًا.

# سند ذكي v14.2.1 — Tenant Isolation Accountant Repair Lock

هذه النسخة تعتمد v14.2.0 وتضيف قفل الباقات من الخلفية مع الصياغة التسويقية النهائية للباقات.

- الأساسية 99: تنظيم فواتير العملاء ومراجعتها.
- النمو 249: تسريع التحصيل ومتابعة العملاء وإرسال واتساب ومطابقة بنك.
- الاحترافية 499: للفواتير الأعلى التي تحتاج تحكمًا ماليًا أوسع وتقارير متقدمة.

باقة الأساسية لا تشمل واتساب أو مطابقة البنك أو التقارير المتقدمة أو التصدير المتقدم أو دعم الأولوية. يتم فرض ذلك من Backend/API وقاعدة البيانات وليس من الواجهة فقط.

# Changelog

## v14.3.2-auth-gate-lock
- Hardened authentication middleware to revalidate every Platform Admin and client tenant session against the database.
- Added strict JWT issuer/audience/subject/jti and HS256 algorithm enforcement.
- Added explicit `platformRequired` and `tenantRequired` scope gates.
- Updated RBAC to reject platform permissions outside Platform scope and tenant permissions outside Tenant scope.
- Added Authentication Gate static guard: `npm run guard:auth`.
- Preserved Sanad core workflow, RBAC/SOD, tenant isolation, Salla integration, bank statement upload and security hardening.


## v14.2.0-commercial-legal-billing-landing-lock
- Added customer-facing Terms & Conditions, Privacy Policy, Fair Usage, Subscription/Billing, Support SLA, WhatsApp Messaging, and Data Retention policies.
- Added in-app legal/policies view for all roles.
- Added lightweight public landing page `/landing.html`.
- Added public legal page `/legal.html`.
- Preserved lightweight UI, backend permissions, company isolation, and operator dashboard boundaries.
- Confirmed monthly unused invoice credits do not roll over.

# سجل التغييرات — سند ذكي

## v14.1.0-commercial-operator-dashboard-lock
- إضافة داشبورد خفيف لأدمن سند ذكي لإدارة شركات العملاء والباقات والحالة والاستخدام والدعم والسجلات.
- فصل أدمن سند ذكي عن أدوار شركات العملاء: لا فواتير تفصيلية، لا اعتماد مالي، لا مطابقة بنك، لا إرسال واتساب مالي، ولا حذف فواتير عملاء.
- فرض صلاحيات أدمن سند ذكي من الخلفية Backend عبر صلاحيات تشغيلية مستقلة.
- إضافة جدول مستقل `platform_admins` وجدول `platform_audit_logs` لتدقيق عمليات مشغل المنصة.
- إضافة سياسات RLS تدعم تشغيل لوحة المنصة دون كسر عزل شركات العملاء.
- الحفاظ على الواجهة العربية المعتمدة والألوان التجارية وخفة المنتج.
- تحديث فحوصات الإصدار لتتأكد من وجود حماية مشغل المنصة وعدم كشف قاعدة البيانات.

## v14.0.0-commercial-full-ui-candidate
- واجهات تجارية كاملة: الدخول، الشركة، المستخدمون، الفواتير، الاعتماد، واتساب العملاء، البنك والمطابقة، التقارير، الدعم، وسجل التدقيق.


## v14.2.2 — Tenant Isolation Accountant Repair Lock

- CRITICAL: Added explicit backend company_id filtering to tenant API reads for users, invoices, WhatsApp messages, bank transactions, matches, reports, support tickets, and audit logs.
- Fixed Accountant workflow UI: restored “رفع/قراءة فاتورة” alongside manual invoice entry/correction.
- Kept “تثبيت/إرسال للمراجعة” as a required accountant action before Finance Manager review.
- Removed internal terms/policies navigation from authenticated dashboards; legal/policies remain public on landing/legal pages only.
- Removed dashboard navigation for Accountant and Finance Manager by directing them to operational views only.
- Renamed operator audit page to “سجل عمليات المنصة”.
- Updated plan WhatsApp quotas: Growth 400, Professional 1200, Basic 0.
- Added support ticket response workflow so platform support can respond and clients can see the response.

## v14.2.6-role-seat-user-management-lock

- إصلاح إدارة المستخدمين قبل العملاء.
- حدود الباقات أصبحت حسب الدور: محاسب/مدير مالي/أدمن شركة.
- إضافة الاسم للمستخدم.
- توليد كلمة مرور مؤقتة بدل كلمة مرور دائمة يضعها أدمن الشركة.
- إجبار الموظف على تغيير كلمة المرور عند أول دخول.
- إضافة إعادة إرسال دعوة/إعادة تعيين كلمة مرور.
- إضافة أرشفة مستخدم بدل الحذف النهائي.
- المؤرشف لا يُحسب ضمن حدود الباقة ولا يستطيع الدخول.
- لا تغيير في قلب الفواتير أو العزل أو الواتساب أو البنك.

## v14.3.0-security-hardening-lock
- Added Salla webhook replay protection using timestamp freshness and tenant-scoped replay nonce storage.
- Hardened Salla HMAC verification with constant-time comparison.
- Added secure redaction logger for tokens, webhook secrets, authorization headers, passwords and API keys.
- Hardened bank statement upload: 2MB cap, magic-byte checks, CSV injection sanitization, row/column/cell limits, and no raw row samples in import errors.
- Added automated security hardening guard and optional live Tenant_A/Tenant_B IDOR probe.
- Preserved Sanad core workflow, RBAC/SOD, Database-per-Tenant, tenant KMS and Salla collection cycle.


## v15.0-commercial-production-launch-candidate
- Repackaged the production runtime lock as a commercial production launch candidate.
- Preserves DB-per-tenant control registry, readiness gates, production compose, and deployment docs.
- Intended for real production deployment only after filling secrets and validating staging on real infrastructure.


## v15.2-live-operations-lock

- فصل خدمة API عن عامل الخلفية في `docker-compose.production.yml`.
- إضافة فحص قبول حي بعد النشر: `apps/api/scripts/live-production-acceptance.mjs`.
- إضافة سكربتات نسخ احتياطي واستعادة إنتاجية في `ops/`.
- إضافة Runbooks تشغيلية عربية للـStaging والنسخ الاحتياطي والانتقال للإنتاج.
- إضافة GitHub Actions production gates.
