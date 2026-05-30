import fs from "node:fs";

let ok = true;
function fail(msg) { console.error("[FAIL]", msg); ok = false; }
function pass(msg) { console.log("[PASS]", msg); }
function exists(file) { fs.existsSync(file) ? pass(`Found: ${file}`) : fail(`Missing: ${file}`); }
function mustContain(file, markers) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of markers) {
    if (text.includes(m)) pass(`${file} contains mandatory marker: ${m}`);
    else fail(`${file} missing mandatory marker: ${m}`);
  }
}

const required = [
  "VERSION",
  "README_AR.md",
  "CHANGELOG.md",
  "CORE_PROTECTION_MANIFEST.json",
  "scripts/core-regression-guard.mjs",
  "RUN-CORE-REGRESSION-GUARD-LINUX.sh",
  "RUN-CORE-REGRESSION-GUARD-WINDOWS.cmd",
  "docs/V14_2_4_CORE_GUARD_LOCK_REPORT_AR.md",
  "docs/V14_3_1_PRODUCTION_READINESS_LOCK_REPORT_AR.md",
  "docs/V14_2_6_ROLE_SEAT_USER_MANAGEMENT_LOCK_REPORT_AR.md",
  "SECURITY.md",
  ".gitignore",
  ".env.example",
  "docker-compose.yml",
  "docker-compose.staging.yml",
  "apps/api/package.json",
  "apps/api/Dockerfile",
  "apps/api/src/server.js",
  "apps/api/src/auth.js",
  "apps/api/src/rbac.js",
  "apps/api/public/index.html",
  "apps/api/public/app.js",
  "apps/api/public/styles.css",
  "infra/postgres/001_schema_rls.sql",
  "infra/postgres/004_v14_2_2_tenant_isolation_accountant_repair.sql",
  "infra/nginx/sanad.conf",
  "scripts/security-check.mjs",
  "scripts/tenant-isolation-test.mjs",
  "RUN-FINAL-SMOKE-TEST-WINDOWS.cmd",
  "RUN-FINAL-SMOKE-TEST-LINUX.sh",
  "docs/EXTERNAL_SECURITY_HANDOFF_AR.md",
  "docs/COMMERCIAL_FULL_UI_CANDIDATE_REPORT_AR.md",
  "docs/V14_1_OPERATOR_DASHBOARD_LOCK_REPORT_AR.md",
  "apps/api/scripts/seed-platform-admin.mjs",
  "infra/postgres/002_v14_1_operator_dashboard.sql",
  "docs/V14_1_MIGRATION_AR.md",
  "ops/ec2/apply-v14-1-migration.sh",
  "docs/TERMS_CONDITIONS_AR.md",
  "docs/PRIVACY_POLICY_AR.md",
  "docs/FAIR_USAGE_POLICY_AR.md",
  "docs/SUBSCRIPTION_BILLING_POLICY_AR.md",
  "docs/SUPPORT_SLA_POLICY_AR.md",
  "docs/WHATSAPP_MESSAGING_POLICY_AR.md",
  "docs/DATA_RETENTION_DELETION_POLICY_AR.md",
  "docs/V14_2_LEGAL_BILLING_LANDING_LOCK_REPORT_AR.md",
  "docs/V14_2_2_TENANT_ISOLATION_ACCOUNTANT_REPAIR_LOCK_REPORT_AR.md",
  "apps/api/public/landing.html",
  "apps/api/public/legal.html"
];

for (const f of required) exists(f);

mustContain(".gitignore", [".env", "*.pem", "node_modules/", "uploads/", "backups/"]);
mustContain("docker-compose.yml", ["POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}", "expose:", "3000"]);
mustContain("apps/api/src/server.js", ["express.static", "/setup/initial-admin", "blockClientCompanyId", "withTenant", "withPlatformScope", "globalApiLimiter", "productionSecurityHeaders", "/matches/run", "/platform/companies", "/platform/security/logs", "SELECT * FROM invoices WHERE company_id=$1", "SELECT id, name, email, role, is_active"]);
mustContain("apps/api/src/commercial-value-features.js", ["/invoices/:id/whatsapp/send", "whatsappQuotaGuard", "status !== \"APPROVED\"", "WHATSAPP_REMINDER_QUEUED"]);
mustContain("apps/api/package.json", ["\"express-rate-limit\"", "\"helmet\"", "\"cors\""]);
mustContain("apps/api/migrations/014_v14_3_1_production_readiness_lock.sql", ["security_audit_trail", "prevent_security_audit_trail_mutation", "FORCE ROW LEVEL SECURITY"]);
mustContain("apps/api/src/security-middleware.js", [
  "productionSecurityHeaders",
  "helmet({",
  "hsts:",
  "contentSecurityPolicy",
  "loginLimiter",
  "webhookLimiter"
]);
mustContain("apps/api/src/server.js", [
  "app.use(enforceHttps)",
  "app.use(productionSecurityHeaders())",
  "app.use(globalApiLimiter)",
  "app.post(\"/auth/login\", loginLimiter, login)"
]);
mustContain("apps/api/src/auth.js", ["platform_admins", "app.login_lookup", "bcrypt.compare", "jwt.sign", "SANAD_ADMIN"]);
mustContain("apps/api/public/app.js", ["رفع/قراءة فاتورة", "function invoiceReaderHtml", "/invoices/read-file", "planFeature(\"whatsapp\")", "واتساب غير متاح في الباقة الحالية", "تثبيت/إرسال للمراجعة", "واتساب العملاء", "مطابقة السداد", "المستخدمون", "شركات العملاء", "سجل عمليات المنصة"]);
mustContain("infra/postgres/001_schema_rls.sql", ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY", "app.login_lookup", "CREATE POLICY invoices_isolation", "CREATE POLICY audit_logs_isolation", "CREATE TABLE IF NOT EXISTS bank_transactions", "CREATE TABLE IF NOT EXISTS platform_admins", "CREATE POLICY companies_platform_operator"]);

const compose = fs.readFileSync("docker-compose.yml", "utf8");
if (compose.includes('"5432:5432"') || compose.includes("'5432:5432'") || compose.includes("5432:5432")) fail("PostgreSQL appears exposed to host port 5432.");
else pass("PostgreSQL is not exposed to host port 5432.");

if (fs.existsSync(".env")) fail("Forbidden file present in release root: .env");
else pass("Forbidden file absent: .env");

mustContain("docs/SUBSCRIPTION_BILLING_POLICY_AR.md", ["الأساسية", "النمو", "الاحترافية", "الفواتير غير المستهلكة تنتهي بنهاية الشهر ولا تدوّر"]);
mustContain("apps/api/public/landing.html", ["سند ذكي", "الباقات", "99 ريال", "صفحة الهبوط"]);


mustContain("CORE_PROTECTION_MANIFEST.json", ["SANAD-THAKI-CORE-PROTECTION-LOCK", "invoice_upload_and_reading", "whatsapp_after_approval_and_plan_eligibility_only", "tenant_company_isolation"]);
mustContain("scripts/core-regression-guard.mjs", ["/invoices/read-file", "GET /users is not blocked", "POST /users is protected", "Core regression guard passed"]);

if (!ok) process.exit(1);
console.log("Release check passed: Role Seat User Management Lock is structurally ready and mandatory security middleware is enforced.");
