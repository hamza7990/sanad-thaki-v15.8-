import fs from "node:fs";

let ok = true;
function pass(msg) { console.log(`[PASS] ${msg}`); }
function fail(msg) { console.error(`[FAIL] ${msg}`); ok = false; }
function read(file) {
  if (!fs.existsSync(file)) { fail(`Missing required file: ${file}`); return ""; }
  return fs.readFileSync(file, "utf8");
}
function mustContain(file, markers) {
  const text = read(file);
  for (const marker of markers) {
    if (text.includes(marker)) pass(`${file} contains: ${marker}`);
    else fail(`${file} missing: ${marker}`);
  }
  return text;
}
function mustNotContain(file, markers) {
  const text = read(file);
  for (const marker of markers) {
    if (text.includes(marker)) fail(`${file} must not contain: ${marker}`);
    else pass(`${file} does not contain forbidden marker: ${marker}`);
  }
  return text;
}
function segmentBetween(text, start, end) {
  const s = text.indexOf(start);
  if (s === -1) return "";
  const e = text.indexOf(end, s + start.length);
  return e === -1 ? text.slice(s) : text.slice(s, e);
}

const manifest = JSON.parse(read("CORE_PROTECTION_MANIFEST.json") || "{}");
if (manifest.lockName === "SANAD-THAKI-CORE-PROTECTION-LOCK") pass("Core protection manifest is present.");
else fail("Core protection manifest lock name is invalid.");

const server = mustContain("apps/api/src/server.js", [
  "/invoices/read-file",
  "allowedInvoiceUpload",
  "extractInvoiceWithOpenAI",
  "heuristicInvoiceExtract",
  "READ_INVOICE_FILE",
  "requirePermission(Permissions.INVOICE_CREATE)",
  "app.post(\n  \"/invoices\"",
  "invoiceQuotaGuard",
  "UPDATE_INVOICE_CORRECTION",
  "/invoices/:id/submit-review",
  "locked_for_review=true",
  "SUBMIT_INVOICE_REVIEW",
  "/invoices/:id/approve",
  "status='READY_FOR_REVIEW'",
  "APPROVE_INVOICE",
  "/bank/transactions",
  "planFeatureGuard(\"bankMatching\"",
  "/matches/run",
  "APPROVE_BANK_MATCH",
  "REJECT_BANK_MATCH",
  "/reports/finance",
  "REPORTS_READ",
  "/support/tickets",
  "SUPPORT_TICKET_CREATED",
  "writeAudit",
  "blockClientCompanyId",
  "withTenant",
  "WHERE company_id=$1"
]);

const commFeatures = mustContain("apps/api/src/commercial-value-features.js", [
  "/invoices/:id/whatsapp/send",
  "whatsappQuotaGuard",
  "status !== \"APPROVED\"",
  "WHATSAPP_REMINDER_QUEUED"
]);

const usersGet = segmentBetween(server, 'app.get(\n  "/users"', 'app.post(\n  "/users"');
if (usersGet.includes("userLimitGuard")) fail("userLimitGuard must not block GET /users.");
else pass("GET /users is not blocked by userLimitGuard.");
const usersPost = segmentBetween(server, 'app.post(\n  "/users"', 'app.patch(\n  "/users/:id/status"');
if (usersPost.includes("userLimitGuard")) pass("POST /users is protected by userLimitGuard.");
else fail("POST /users is missing userLimitGuard.");

const app = mustContain("apps/api/public/app.js", [
  "رفع/قراءة فاتورة",
  "function invoiceReaderHtml",
  "async function readInvoiceFile",
  "/invoices/read-file",
  "dataUrl",
  "تثبيت/إرسال للمراجعة",
  "async function submitReview",
  "async function approveInvoice",
  "async function sendWhatsapp",
  "planFeature(\"whatsapp\")",
  "واتساب غير متاح في الباقة الحالية",
  "async function renderBank",
  "async function runMatching",
  "async function renderReports",
  "لوحة CFO للتحصيل",
  "data-action",
  "data-submit",
  "async function renderSupport",
  "لوحة تشغيل المنصة"
]);
mustNotContain("apps/api/public/app.js", [
  "داشبورد أدمن سند ذكي",
  "{ id: \"legal\"",
  "renderLegal()",
  "onclick=",
  "onsubmit=",
  "onchange="
]);

const rbac = mustContain("apps/api/src/rbac.js", [
  "SANAD_ADMIN",
  "ADMIN",
  "FINANCE_MANAGER",
  "ACCOUNTANT",
  "Permissions.INVOICE_CREATE",
  "Permissions.INVOICE_SUBMIT_REVIEW",
  "Permissions.INVOICE_APPROVE",
  "Permissions.BANK_MANAGE",
  "Permissions.MATCH_APPROVE",
  "Permissions.PLATFORM_COMPANIES_MANAGE"
]);
const accountant = segmentBetween(rbac, "ACCOUNTANT: [", "]");
for (const forbidden of ["BANK_MANAGE", "MATCH_APPROVE", "USERS_MANAGE", "COMPANY_SETTINGS_MANAGE", "PLATFORM_COMPANIES_MANAGE", "INVOICE_APPROVE"]) {
  if (accountant.includes(forbidden)) fail(`ACCOUNTANT must not include ${forbidden}.`);
  else pass(`ACCOUNTANT does not include ${forbidden}.`);
}
const finance = segmentBetween(rbac, "FINANCE_MANAGER: [", "]");
for (const forbidden of ["INVOICE_CREATE", "USERS_MANAGE", "COMPANY_SETTINGS_MANAGE", "PLATFORM_COMPANIES_MANAGE"]) {
  if (finance.includes(forbidden)) fail(`FINANCE_MANAGER must not include ${forbidden}.`);
  else pass(`FINANCE_MANAGER does not include ${forbidden}.`);
}
const sanadAdmin = segmentBetween(rbac, "SANAD_ADMIN: [", "]");
for (const forbidden of ["INVOICE_READ", "INVOICE_APPROVE", "BANK_MANAGE", "MATCH_APPROVE", "WHATSAPP_SEND_APPROVED"]) {
  if (sanadAdmin.includes(forbidden)) fail(`SANAD_ADMIN must not include client financial permission ${forbidden}.`);
  else pass(`SANAD_ADMIN does not include client financial permission ${forbidden}.`);
}

mustContain("infra/postgres/001_schema_rls.sql", [
  "ENABLE ROW LEVEL SECURITY",
  "FORCE ROW LEVEL SECURITY",
  "current_setting('app.company_id'",
  "CREATE POLICY invoices_isolation",
  "CREATE POLICY bank_transactions_isolation",
  "CREATE POLICY reconciliation_matches_isolation",
  "CREATE POLICY audit_logs_isolation",
  "CREATE POLICY support_tickets_isolation"
]);

mustContain("scripts/backup-local.mjs", ["backup"]);
mustContain("scripts/restore-local.mjs", ["restore"]);

if (!ok) {
  console.error("Core regression guard failed. Reject this release: a protected workflow is missing, fake, or degraded.");
  process.exit(1);
}
console.log("Core regression guard passed: protected workflows are present and guarded structurally.");
