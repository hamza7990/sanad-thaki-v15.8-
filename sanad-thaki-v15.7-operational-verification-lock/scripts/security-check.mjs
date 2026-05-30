import fs from "node:fs";

const requiredFiles = [
  ".env.example",
  "docker-compose.yml",
  "apps/api/Dockerfile",
  "apps/api/src/server.js",
  "apps/api/src/config.js",
  "apps/api/src/auth.js",
  "apps/api/src/rbac.js",
  "apps/api/src/guards.js",
  "apps/api/src/security-middleware.js",
  "apps/api/public/index.html",
  "apps/api/public/app.js",
  "apps/api/public/landing.html",
  "apps/api/public/legal.html",
  "infra/postgres/001_schema_rls.sql",
  "infra/nginx/sanad.conf",
  "scripts/core-regression-guard.mjs",
  "CORE_PROTECTION_MANIFEST.json"
];

let ok = true;
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) { console.error("Missing file:", file); ok = false; }
}

function mustContain(file, markers) {
  const text = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!text.includes(marker)) { console.error(`Missing marker in ${file}: ${marker}`); ok = false; }
  }
}

mustContain("apps/api/Dockerfile", ["USER node", "COPY public ./public"]);
mustContain("apps/api/src/config.js", ["JWT_SECRET", "min(64)", "ALLOW_DEMO_LOGIN=true is blocked in production"]);
mustContain("apps/api/src/server.js", ["const cors = require(\"cors\");", "app.use(enforceHttps)", "app.use(productionSecurityHeaders())", "app.use(globalApiLimiter)", "app.use(cors({", "blockClientCompanyId", "withTenant", "withPlatformScope", "express.static", "/platform/companies", "WHERE company_id=$1", "SELECT * FROM invoices WHERE company_id=$1", "SELECT id, name, email, role, is_active"]);
mustContain("apps/api/src/security-middleware.js", ["const helmet = require(\"helmet\");", "const rateLimit = require(\"express-rate-limit\");", "productionSecurityHeaders", "loginLimiter", "webhookLimiter", "hsts:", "contentSecurityPolicy"]);
mustContain("apps/api/src/auth.js", ["app.login_lookup", "platform_admins", "bcrypt.compare", "SANAD_ADMIN"]);
mustContain("apps/api/src/guards.js", ["companyId لا يُقبل من العميل"]);
mustContain("infra/postgres/001_schema_rls.sql", [
  "ENABLE ROW LEVEL SECURITY",
  "FORCE ROW LEVEL SECURITY",
  "current_setting('app.company_id'",
  "current_setting('app.login_lookup'",
  "CREATE POLICY invoices_isolation",
  "CREATE POLICY audit_logs_isolation",
  "CREATE TABLE IF NOT EXISTS platform_admins",
  "CREATE POLICY companies_platform_operator"
]);

const compose = fs.readFileSync("docker-compose.yml", "utf8");
if (compose.includes('"5432:5432"') || compose.includes("'5432:5432'") || compose.includes("5432:5432")) {
  console.error("PostgreSQL must not be exposed to public host port.");
  ok = false;
}

mustContain("apps/api/public/app.js", ["رفع/قراءة فاتورة", "تثبيت/إرسال للمراجعة", "واتساب العملاء", "سجل عمليات المنصة"]);
mustContain("apps/api/public/legal.html", ["سياسة الخصوصية", "الشروط", "الفواتير غير المستهلكة"]);
mustContain("CORE_PROTECTION_MANIFEST.json", ["SANAD-THAKI-CORE-PROTECTION-LOCK", "protectedWorkflows"]);

if (!ok) process.exit(1);
console.log("Security check passed: Sanad Thaki Security Gate Lock.");
