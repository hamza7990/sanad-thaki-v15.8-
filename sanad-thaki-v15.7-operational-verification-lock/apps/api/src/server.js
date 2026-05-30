const express = require("express");
const cors = require("cors");
const path = require("path");
const { randomUUID, randomBytes, randomInt, createHash, timingSafeEqual } = require("crypto");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const nodemailer = require("nodemailer");
const multer = require("multer");
const XLSX = require("xlsx");
const { parse: parseCsvSync } = require("csv-parse/sync");

const { loadConfig } = require("./config");
const { pool, withTenant, withPlatformScope } = require("./db");
const { login, authRequired, tenantRequired, platformRequired, routeIsolationGuard, signAccessToken, registerAuthSession, authCookieOptions } = require("./auth");
const { Permissions, requirePermission } = require("./rbac");
const { blockClientCompanyId } = require("./guards");
const { writeAudit, writePlatformAudit, writeSecurityAuditTrail } = require("./audit");
const { encryptForTenant, decryptForTenant, getTenantEncryptionVersion } = require("./tenant-crypto");
const { withTenantAiSession, preprocessInvoiceImage, runGoogleDocumentAi, prepareOpenCvPreprocessPlan } = require("./ai-session-isolation");
const { parseZatcaQrFromImage } = require("./zatca-qr-parser");
const { createSallaRouter, notifySallaPaidForInvoice } = require("./integrations/salla");
const { installSecureConsoleRedaction, redactSecrets } = require("./secure-logger");
const { enforceHttps, productionSecurityHeaders, globalApiLimiter, loginLimiter, webhookLimiter, bankStatementLimiter, accountingImportLimiter } = require("./security-middleware");
const { parseMoney } = require("./money");
const { runReadinessChecks } = require("./production-readiness");
const { provisionTenant } = require("./provisioning");
const { rotateTenantKey } = require("./tenant-key-rotation");
const { acquireRedisLock, releaseRedisLock, incrementWindowCounter, getRedisClient } = require("./redis-client");
const { listReadyTenantIds } = require("./tenant-db-router");
const { installCommercialValueFeatures, runWhatsappQueueWorkerOnce } = require("./commercial-value-features");

installSecureConsoleRedaction();
const config = loadConfig();
const app = express();

async function createNotification(client, companyId, title, message, type = 'info', userId = null) {
  try {
    await client.query(
      `INSERT INTO notifications (company_id, user_id, title, message, type)
       VALUES ($1, $2, $3, $4, $5)`,
      [companyId, userId, title, message, type]
    );
  } catch (err) {
    console.error("Warning: Failed to create notification:", err.message);
  }
}

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(enforceHttps);
app.use(productionSecurityHeaders());

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (config.corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked"));
  },
  credentials: true
}));

app.use(express.json({
  limit: "12mb",
  verify: (req, _res, buf) => {
    // Keep original bytes for Salla webhook signature verification.
    if (req.originalUrl && (req.originalUrl.startsWith("/integrations/salla/webhook") || req.originalUrl.startsWith("/integrations/whatsapp/meta/webhook"))) {
      req.rawBody = Buffer.from(buf);
    }
  }
}));

app.use(globalApiLimiter);

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir, { maxAge: "1h", index: false }));

function normalizeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

const BANK_STATEMENT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const BANK_STATEMENT_MAX_ROWS = 5000;
const BANK_STATEMENT_MAX_COLUMNS = 30;
const BANK_STATEMENT_MAX_CELL_CHARS = 500;
const BANK_STATEMENT_DANGEROUS_PREFIX = /^[\s\uFEFF\u200B]*[=+\-@\t\r]/;

function sanitizeSpreadsheetText(value, max = BANK_STATEMENT_MAX_CELL_CHARS) {
  let text = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  while (BANK_STATEMENT_DANGEROUS_PREFIX.test(text)) {
    text = text.replace(BANK_STATEMENT_DANGEROUS_PREFIX, "").trimStart();
  }
  return text.slice(0, max);
}

function assertBankStatementMagic(file) {
  const buffer = file?.buffer || Buffer.alloc(0);
  if (buffer.length > BANK_STATEMENT_MAX_FILE_BYTES) {
    const err = new Error("BANK_STATEMENT_FILE_TOO_LARGE");
    err.statusCode = 413;
    throw err;
  }
  const name = String(file?.originalname || "").toLowerCase();
  const first4 = buffer.subarray(0, 4).toString("hex");
  const isZipXlsx = first4.startsWith("504b0304") || first4.startsWith("504b0506") || first4.startsWith("504b0708");
  const isOleXls = buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1";
  const isLikelyCsv = name.endsWith(".csv") && buffer.subarray(0, Math.min(buffer.length, 1024)).every(byte => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 128);
  if (name.endsWith(".xlsx") && !isZipXlsx) throw Object.assign(new Error("BANK_STATEMENT_MAGIC_BYTES_MISMATCH"), { statusCode: 400 });
  if (name.endsWith(".xls") && !isOleXls) throw Object.assign(new Error("BANK_STATEMENT_MAGIC_BYTES_MISMATCH"), { statusCode: 400 });
  if (name.endsWith(".csv") && !isLikelyCsv) throw Object.assign(new Error("BANK_STATEMENT_MAGIC_BYTES_MISMATCH"), { statusCode: 400 });
}

function sanitizeBankRow(row) {
  const entries = Object.entries(row || {}).slice(0, BANK_STATEMENT_MAX_COLUMNS);
  const clean = {};
  for (const [key, value] of entries) {
    const safeKey = sanitizeSpreadsheetText(key, 120);
    if (!safeKey) continue;
    clean[safeKey] = typeof value === "number" || value instanceof Date ? value : sanitizeSpreadsheetText(value);
  }
  return clean;
}

const bankStatementUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BANK_STATEMENT_MAX_FILE_BYTES, files: 1, fields: 5 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || "").toLowerCase();
    const ok = /\.(csv|xlsx|xls)$/.test(name) || [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ].includes(file.mimetype);
    if (!ok) return cb(new Error("BANK_STATEMENT_FILE_TYPE_NOT_ALLOWED"));
    cb(null, true);
  }
});

function sendBankStatementUploadError(err, res) {
  const code = err?.code || err?.message || "BANK_STATEMENT_UPLOAD_ERROR";
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ code: "BANK_STATEMENT_FILE_TOO_LARGE", error: "حجم كشف البنك أكبر من الحد المسموح 2MB." });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ code, error: "ملف كشف البنك غير صالح أو يتجاوز قيود الرفع." });
  }
  if (code === "BANK_STATEMENT_FILE_TOO_LARGE") {
    return res.status(413).json({ code, error: "حجم كشف البنك أكبر من الحد المسموح 2MB." });
  }
  if (code === "BANK_STATEMENT_FILE_TYPE_NOT_ALLOWED") {
    return res.status(400).json({ code, error: "نوع ملف كشف البنك غير مسموح. ارفع CSV أو XLSX أو XLS فقط." });
  }
  if (code === "BANK_STATEMENT_MAGIC_BYTES_MISMATCH") {
    return res.status(400).json({ code, error: "محتوى الملف لا يطابق امتداده. أعد تصدير كشف البنك بصيغة صحيحة." });
  }
  const status = Number(err?.statusCode || 500);
  return res.status(status >= 400 && status < 600 ? status : 500).json({
    code: status === 500 ? "BANK_STATEMENT_UPLOAD_FAILED" : code,
    error: status === 500 ? "تعذر رفع كشف البنك. تم تسجيل المشكلة." : "تعذر رفع كشف البنك بالصيغة الحالية."
  });
}

function bankStatementUploadSingle(req, res, next) {
  bankStatementUpload.single("file")(req, res, err => {
    if (err) return sendBankStatementUploadError(err, res);
    return next();
  });
}

function cleanBankText(value, max = 500) {
  return sanitizeSpreadsheetText(value, max);
}

function canonicalHeader(value) {
  return cleanBankText(value).toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function headerMatches(headers, candidates) {
  const normalized = headers.map(h => ({ raw: h, key: canonicalHeader(h) }));
  for (const candidate of candidates) {
    const c = canonicalHeader(candidate);
    const exact = normalized.find(h => h.key === c);
    if (exact) return exact.raw;
  }
  for (const candidate of candidates) {
    const c = canonicalHeader(candidate);
    const partial = normalized.find(h => h.key.includes(c) || c.includes(h.key));
    if (partial) return partial.raw;
  }
  return null;
}

// parseMoney moved to ./money.js (decimal-safe).
function parseBankDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (!text) return null;
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);
  const m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${y}-${mo}-${d}`;
    if (!Number.isNaN(new Date(iso).getTime())) return iso;
  }
  return null;
}

function readStatementRows(file) {
  assertBankStatementMagic(file);
  const name = String(file.originalname || "").toLowerCase();
  let rows = [];
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true, sheetRows: BANK_STATEMENT_MAX_ROWS + 1, WTF: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [] };
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false }).slice(0, BANK_STATEMENT_MAX_ROWS);
  } else {
    const text = file.buffer.toString("utf8").replace(/^\uFEFF/, "");
    rows = parseCsvSync(text, { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: true, to: BANK_STATEMENT_MAX_ROWS });
  }
  rows = rows.map(sanitizeBankRow);
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r || {}).slice(0, BANK_STATEMENT_MAX_COLUMNS)))).slice(0, BANK_STATEMENT_MAX_COLUMNS);
  return { headers, rows };
}

function detectBankStatementMapping(headers, supplied = {}) {
  const mapping = {
    date: supplied.date || supplied.transactionDate || headerMatches(headers, ["تاريخ العملية", "تاريخ", "التاريخ", "Transaction Date", "Date", "Posting Date", "Value Date"]),
    description: supplied.description || headerMatches(headers, ["الوصف", "البيان", "تفاصيل", "التفاصيل", "Description", "Details", "Narrative", "Memo"]),
    amount: supplied.amount || headerMatches(headers, ["المبلغ", "Amount", "Transaction Amount", "Net Amount"]),
    credit: supplied.credit || headerMatches(headers, ["دائن", "إيداع", "ايداع", "تحويل وارد", "Credit", "Deposit", "Paid In"]),
    debit: supplied.debit || headerMatches(headers, ["مدين", "سحب", "خصم", "Debit", "Withdrawal", "Paid Out"]),
    reference: supplied.reference || headerMatches(headers, ["المرجع", "رقم المرجع", "رقم العملية", "Reference", "Ref", "Transaction Reference", "ID"])
  };
  return mapping;
}

function normalizeBankStatementRow(row, mapping) {
  const transactionDate = parseBankDate(row[mapping.date]);
  const description = cleanBankText(row[mapping.description], 800);
  let amount = mapping.amount ? parseMoney(row[mapping.amount]) : null;
  const credit = mapping.credit ? parseMoney(row[mapping.credit]) : null;
  const debit = mapping.debit ? parseMoney(row[mapping.debit]) : null;

  if ((amount === null || amount === 0) && credit !== null && credit > 0) amount = credit;
  if ((amount === null || amount === 0) && debit !== null && debit > 0) amount = -Math.abs(debit);
  if (amount !== null) amount = Math.round(amount * 100) / 100;

  const reference = cleanBankText(mapping.reference ? row[mapping.reference] : "", 180);
  return { transactionDate, description, amount, reference };
}

function sourceHashForBankTransaction(companyId, tx) {
  return createHash("sha256").update(JSON.stringify({
    companyId,
    transactionDate: tx.transactionDate,
    description: tx.description,
    amount: tx.amount,
    reference: tx.reference
  })).digest("hex");
}

function validateNormalizedBankTx(tx) {
  if (!tx.transactionDate) return "MISSING_DATE";
  if (!tx.description || tx.description.length < 2) return "MISSING_DESCRIPTION";
  if (!Number.isFinite(Number(tx.amount)) || Number(tx.amount) <= 0) return "MISSING_OR_NON_COLLECTION_AMOUNT";
  return null;
}

async function runBankMatchingForCompany(client, req, companyId) {
  const candidates = await client.query(`
    SELECT i.id AS invoice_id, b.id AS bank_transaction_id,
           LEAST(100,
             50
             + CASE WHEN i.total_amount = b.amount THEN 30 WHEN abs(i.total_amount - b.amount) <= 1 THEN 20 ELSE 0 END
             + CASE WHEN lower(coalesce(b.description,'')) LIKE '%' || lower(i.invoice_number) || '%' THEN 20 ELSE 0 END
             + CASE WHEN lower(coalesce(b.reference,'')) LIKE '%' || lower(i.invoice_number) || '%' THEN 20 ELSE 0 END
           ) AS score
    FROM invoices i
    JOIN bank_transactions b ON b.company_id=i.company_id AND b.status='UNMATCHED'
    WHERE i.company_id=$1 AND i.status='APPROVED'
      AND abs(i.total_amount - b.amount) <= 1
      AND NOT EXISTS (
        SELECT 1 FROM reconciliation_matches m
        WHERE m.company_id=i.company_id AND m.invoice_id=i.id AND m.bank_transaction_id=b.id
      )
    ORDER BY score DESC, b.transaction_date DESC
    LIMIT 50
  `, [companyId]);
  let created = 0;
  for (const row of candidates.rows) {
    await client.query(
      `INSERT INTO reconciliation_matches (company_id, invoice_id, bank_transaction_id, score, status)
       VALUES ($1,$2,$3,$4,'PENDING')
       ON CONFLICT DO NOTHING`,
      [companyId, row.invoice_id, row.bank_transaction_id, row.score]
    );
    created += inserted.rowCount;
  }
  await writeAudit(client, req, "RUN_BANK_MATCHING", "reconciliation", null, { created });
  return { created };
}


function buildTenantEncryptedInvoicePayload(companyId, invoiceLike, extra = {}) {
  return encryptForTenant(companyId, JSON.stringify({
    invoiceNumber: invoiceLike.invoiceNumber || invoiceLike.invoice_number || null,
    customerName: invoiceLike.customerName || invoiceLike.customer_name || null,
    supplierTaxNumber: invoiceLike.supplierTaxNumber || invoiceLike.supplier_tax_number || null,
    totalAmount: invoiceLike.totalAmount || invoiceLike.total_amount || null,
    ...extra,
    encryptedAt: new Date().toISOString()
  }));
}

async function recordTenantUsage(client, companyId, metric, quantity = 1, metadata = {}) {
  const qty = Number(quantity) || 1;
  await client.query(
    `INSERT INTO tenant_usage_events (company_id, metric, quantity, metadata)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [companyId, metric, qty, JSON.stringify(metadata || {})]
  );
  const patch = rollupPatchForMetric(metric, qty);
  if (patch) await updateTenantRollup(companyId, patch).catch(err => console.error("Tenant rollup update warning:", err.message));
}

const PLAN_DEFINITIONS = Object.freeze({
  basic: {
    code: "basic",
    label: "الأساسية",
    priceSar: 99,
    marketing: "تنظيم فواتير العملاء ومراجعتها",
    invoiceMonthlyLimit: 100,
    whatsappMonthlyLimit: 0,
    userLimit: 3,
    roleSeatLimits: { ADMIN: 1, ACCOUNTANT: 1, FINANCE_MANAGER: 1 },
    features: {
      whatsapp: false,
      bankMatching: false,
      advancedReports: false,
      exports: false,
      prioritySupport: false
    }
  },
  growth: {
    code: "growth",
    label: "النمو",
    priceSar: 249,
    marketing: "تسريع التحصيل ومتابعة العملاء وإرسال واتساب ومطابقة بنك",
    invoiceMonthlyLimit: 400,
    whatsappMonthlyLimit: 400,
    userLimit: 5,
    roleSeatLimits: { ADMIN: 1, ACCOUNTANT: 2, FINANCE_MANAGER: 2 },
    features: {
      whatsapp: true,
      bankMatching: true,
      advancedReports: false,
      exports: true,
      prioritySupport: false
    }
  },
  professional: {
    code: "professional",
    label: "الاحترافية",
    priceSar: 499,
    marketing: "للفواتير الأعلى التي تحتاج تحكمًا ماليًا أوسع وتقارير متقدمة",
    invoiceMonthlyLimit: 1200,
    whatsappMonthlyLimit: 800,
    userLimit: 9,
    roleSeatLimits: { ADMIN: 1, ACCOUNTANT: 4, FINANCE_MANAGER: 4 },
    features: {
      whatsapp: true,
      bankMatching: true,
      advancedReports: true,
      exports: true,
      prioritySupport: true
    }
  }
});

function planFor(code) {
  return PLAN_DEFINITIONS[code] || PLAN_DEFINITIONS.basic;
}

function publicPlan(plan) {
  return {
    code: plan.code,
    label: plan.label,
    priceSar: plan.priceSar,
    marketing: plan.marketing,
    invoiceMonthlyLimit: plan.invoiceMonthlyLimit,
    whatsappMonthlyLimit: plan.whatsappMonthlyLimit,
    userLimit: plan.userLimit,
    roleSeatLimits: plan.roleSeatLimits,
    features: plan.features
  };
}

async function loadCompanyPlan(client, companyId) {
  const result = await client.query(
    "SELECT package_code, invoice_monthly_limit, whatsapp_monthly_limit FROM companies WHERE id=$1",
    [companyId]
  );
  const base = planFor(result.rows[0]?.package_code);
  return {
    ...base,
    invoiceMonthlyLimit: Number(result.rows[0]?.invoice_monthly_limit || base.invoiceMonthlyLimit),
    whatsappMonthlyLimit: Number(result.rows[0]?.whatsapp_monthly_limit || base.whatsappMonthlyLimit)
  };
}

function planLimitsForCode(code) {
  const plan = planFor(code);
  return [plan.invoiceMonthlyLimit, plan.whatsappMonthlyLimit, plan.userLimit];
}

function planFeatureGuard(feature, requiredPlanLabel) {
  return async (req, res, next) => {
    try {
      const allowed = await withTenant(req.companyId, async client => {
        const plan = await loadCompanyPlan(client, req.companyId);
        return Boolean(plan.features[feature]);
      });
      if (!allowed) {
        return res.status(403).json({
          code: "FEATURE_NOT_AVAILABLE_ON_PLAN",
          error: `هذه الميزة غير متاحة في باقتك الحالية. متاحة في باقة ${requiredPlanLabel}.`
        });
      }
      next();
    } catch (err) { next(err); }
  };
}

async function invoiceQuotaGuard(req, res, next) {
  try {
    const ok = await withTenant(req.companyId, async client => {
      const plan = await loadCompanyPlan(client, req.companyId);
      const count = await client.query(
        "SELECT count(*)::int AS count FROM invoices WHERE company_id=$1 AND created_at >= date_trunc('month', now())",
        [req.companyId]
      );
      return { allowed: Number(count.rows[0].count) < plan.invoiceMonthlyLimit, limit: plan.invoiceMonthlyLimit };
    });
    if (!ok.allowed) {
      return res.status(403).json({
        code: "PLAN_INVOICE_LIMIT_REACHED",
        error: `تم الوصول إلى حد الفواتير الشهري في الباقة (${ok.limit} فاتورة).`
      });
    }
    next();
  } catch (err) { next(err); }
}

async function userLimitGuard(req, res, next) {
  try {
    const role = req.body?.role;
    if (!["ACCOUNTANT", "FINANCE_MANAGER"].includes(role)) {
      return res.status(400).json({ error: "الدور غير مسموح لأدمن الشركة. يمكن إضافة محاسب أو مدير مالي فقط." });
    }

    const ok = await withTenant(req.companyId, async client => {
      const plan = await loadCompanyPlan(client, req.companyId);
      const limit = Number(plan.roleSeatLimits?.[role] || 0);
      const count = await client.query(
        `SELECT count(*)::int AS count
         FROM app_users
         WHERE company_id=$1 AND role=$2 AND coalesce(user_status,'ACTIVE') <> 'ARCHIVED'`,
        [req.companyId, role]
      );
      return { allowed: Number(count.rows[0].count) < limit, limit, role };
    });

    if (!ok.allowed) {
      const label = ok.role === "ACCOUNTANT" ? "المحاسبين" : "المدراء الماليين";
      return res.status(403).json({
        code: "PLAN_ROLE_SEAT_LIMIT_REACHED",
        error: `وصلت إلى حد ${label} في الباقة الحالية (${ok.limit}).`
      });
    }
    next();
  } catch (err) { next(err); }
}

function generateTemporaryPassword() {
  return `Sanad@${randomBytes(6).toString("hex")}A1!`;
}

function invitationPayload(tempPassword) {
  if (config.NODE_ENV === "production") {
    return { deliveryMode: "email_only", temporaryPassword: null };
  }
  return { deliveryMode: "staging_display_once", temporaryPassword };
}

async function sendEmployeeInviteEmail(user, tempPassword) {
  if (!config.SMTP_HOST) return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: Number(config.SMTP_PORT || 587),
    secure: Number(config.SMTP_PORT || 587) === 465,
    auth: config.SMTP_USER && config.SMTP_PASS ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined
  });
  await transport.sendMail({
    from: config.SMTP_FROM || config.SMTP_USER || "no-reply@sanad-thaki.local",
    to: user.email,
    subject: "دعوة دخول سند ذكي",
    text: `مرحبًا ${user.name || ""}

تم إنشاء حسابك في سند ذكي.
البريد: ${user.email}
كلمة المرور المؤقتة: ${tempPassword}

هذه الكلمة مؤقتة وصالحة لمدة 24 ساعة، ويجب تغييرها عند أول دخول.
`
  });
  return { sent: true, reason: "SMTP_SENT" };
}

function hashPasswordResetCode(email, code) {
  return createHash("sha256").update(`${String(email || "").toLowerCase()}:${String(code || "")}:${config.JWT_SECRET}`).digest("hex");
}

function safeCompareHash(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function generateResetCode() {
  return String(randomInt(100000, 1000000));
}

async function sendPasswordResetEmail(email, code) {
  if (!config.SMTP_HOST) {
    const err = new Error("SMTP_NOT_CONFIGURED");
    err.statusCode = 500;
    throw err;
  }
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: Number(config.SMTP_PORT || 587),
    secure: Number(config.SMTP_PORT || 587) === 465,
    auth: config.SMTP_USER && config.SMTP_PASS ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined
  });
  await transport.sendMail({
    from: config.SMTP_FROM || config.SMTP_USER || "no-reply@sanad-thaki.local",
    to: email,
    subject: "رمز استعادة كلمة المرور - سند ذكي",
    text: `رمز استعادة كلمة المرور في سند ذكي: ${code}\n\nينتهي الرمز خلال 30 دقيقة. إذا لم تطلب الاستعادة فتجاهل الرسالة.`
  });
}

async function lookupUserDirectoryByEmail(email) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.login_lookup','1',true)");
    const r = await client.query("SELECT company_id, user_id, is_active FROM user_directory WHERE email_lower=lower($1) LIMIT 1", [email]);
    await client.query("COMMIT");
    const row = r.rows[0];
    return row?.is_active ? row : null;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function enforcePasswordResetThrottle(email) {
  const count = await incrementWindowCounter(`password-reset:${String(email || "").toLowerCase()}`, 3600);
  if (count > 3) {
    const err = new Error("PASSWORD_RESET_RATE_LIMITED");
    err.statusCode = 429;
    throw err;
  }
}

async function enforcePasswordResetAttemptThrottle(email) {
  const count = await incrementWindowCounter(`password-reset-attempt:${String(email || "").toLowerCase()}`, 900);
  if (count > Number(process.env.PASSWORD_RESET_MAX_ATTEMPTS_PER_15_MIN || 5)) {
    const err = new Error("PASSWORD_RESET_ATTEMPT_RATE_LIMITED");
    err.statusCode = 429;
    throw err;
  }
}


// Legacy direct WhatsApp sender removed in v15.8. All reminders must pass through company-scoped settings + queue worker.

async function whatsappQuotaGuard(req, res, next) {
  try {
    const ok = await withTenant(req.companyId, async client => {
      const plan = await loadCompanyPlan(client, req.companyId);
      const count = await client.query(
        "SELECT count(*)::int AS count FROM whatsapp_messages WHERE company_id=$1 AND created_at >= date_trunc('month', now())",
        [req.companyId]
      );
      return { allowed: Number(count.rows[0].count) < plan.whatsappMonthlyLimit, limit: plan.whatsappMonthlyLimit };
    });
    if (!ok.allowed) {
      return res.status(403).json({
        code: "PLAN_WHATSAPP_LIMIT_REACHED",
        error: `تم الوصول إلى حد رسائل واتساب الشهري في الباقة (${ok.limit} رسالة).`
      });
    }
    next();
  } catch (err) { next(err); }
}

async function countUsersForSetup() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.login_lookup', '1', true)");
    const result = await client.query("SELECT count(*)::int AS count FROM companies");
    await client.query("COMMIT");
    return result.rows[0].count;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function handleDbError(err, res) {
  if (err && err.code === "23505") {
    return res.status(409).json({ error: "يوجد سجل مكرر داخل نفس الشركة" });
  }
  console.error("Unhandled DB error:", err.message);
  return res.status(500).json({ error: "حدث خطأ داخلي. تم تسجيل المشكلة." });
}

async function upsertUserDirectory(email, companyId, userId, isActive = true) {
  if (!email || !companyId || !userId) return;
  await withPlatformScope(client => client.query(
    `INSERT INTO user_directory (email_lower, company_id, user_id, is_active)
     VALUES (lower($1),$2,$3,$4)
     ON CONFLICT (email_lower) DO UPDATE SET company_id=$2, user_id=$3, is_active=$4, updated_at=now()`,
    [email, companyId, userId, Boolean(isActive)]
  ));
}

async function setUserDirectoryActive(email, isActive) {
  if (!email) return;
  await withPlatformScope(client => client.query(
    `UPDATE user_directory SET is_active=$2, updated_at=now() WHERE email_lower=lower($1)`,
    [email, Boolean(isActive)]
  ));
}

async function updateTenantRollup(companyId, patch = {}) {
  if (!companyId) return;
  await withPlatformScope(client => client.query(
    `INSERT INTO tenant_rollups (company_id, invoice_count, whatsapp_count, open_tickets, user_count)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (company_id) DO UPDATE SET
       invoice_count=GREATEST(0, tenant_rollups.invoice_count + EXCLUDED.invoice_count),
       whatsapp_count=GREATEST(0, tenant_rollups.whatsapp_count + EXCLUDED.whatsapp_count),
       open_tickets=GREATEST(0, tenant_rollups.open_tickets + EXCLUDED.open_tickets),
       user_count=GREATEST(0, tenant_rollups.user_count + EXCLUDED.user_count),
       updated_at=now()`,
    [companyId, Number(patch.invoice_count || 0), Number(patch.whatsapp_count || 0), Number(patch.open_tickets || 0), Number(patch.user_count || 0)]
  ));
}

function rollupPatchForMetric(metric, quantity) {
  const q = Math.max(0, Number(quantity) || 0);
  if (!q) return null;
  if (String(metric).startsWith("invoice_created") || metric === "invoice_imported_integration") return { invoice_count: q };
  if (String(metric).startsWith("whatsapp")) return { whatsapp_count: q };
  return null;
}

async function fanoutReadyTenants(callback) {
  const out = [];
  for (const tenantId of await listReadyTenantIds()) {
    try {
      const value = await withTenant(tenantId, client => callback(client, tenantId));
      if (Array.isArray(value)) out.push(...value);
      else if (value) out.push(value);
    } catch (err) {
      console.error("Tenant fan-out warning:", tenantId, err.message);
    }
  }
  return out;
}

async function rebuildTenantRollup(companyId) {
  const stats = await withTenant(companyId, async client => {
    const r = await client.query(`
      SELECT
        (SELECT count(*)::int FROM invoices WHERE company_id=$1) AS invoice_count,
        (SELECT count(*)::int FROM whatsapp_messages WHERE company_id=$1) AS whatsapp_count,
        (SELECT count(*)::int FROM support_tickets WHERE company_id=$1 AND status <> 'CLOSED') AS open_tickets,
        (SELECT count(*)::int FROM app_users WHERE company_id=$1 AND coalesce(user_status,'ACTIVE') <> 'ARCHIVED') AS user_count
    `, [companyId]);
    return r.rows[0];
  });
  await withPlatformScope(client => client.query(
    `INSERT INTO tenant_rollups (company_id, invoice_count, whatsapp_count, open_tickets, user_count)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (company_id) DO UPDATE SET
       invoice_count=EXCLUDED.invoice_count,
       whatsapp_count=EXCLUDED.whatsapp_count,
       open_tickets=EXCLUDED.open_tickets,
       user_count=EXCLUDED.user_count,
       updated_at=now()`,
    [companyId, stats.invoice_count || 0, stats.whatsapp_count || 0, stats.open_tickets || 0, stats.user_count || 0]
  ));
  return { companyId, ...stats };
}

async function rebuildAllTenantRollups() {
  const rows = [];
  for (const tenantId of await listReadyTenantIds()) rows.push(await rebuildTenantRollup(tenantId));
  return rows;
}

async function expireOldIntegrationKeys() {
  const expired = await withPlatformScope(client => client.query(
    `UPDATE integration_key_directory
     SET is_active=false, disabled_reason='AUTO_DISABLED_UNUSED_90_DAYS', updated_at=now()
     WHERE is_active=true AND last_used_at IS NOT NULL AND last_used_at < now() - interval '90 days'
     RETURNING company_id, integration_key_id`
  ));
  for (const row of expired.rows) {
    await withTenant(row.company_id, client => client.query(
      `UPDATE integration_api_keys SET is_active=false, disabled_reason='AUTO_DISABLED_UNUSED_90_DAYS'
       WHERE id=$1 AND company_id=$2`,
      [row.integration_key_id, row.company_id]
    )).catch(err => console.error("Integration key tenant disable warning:", err.message));
  }
  return expired.rowCount;
}

async function runCommercialMaintenanceOnce() {
  const lock = await acquireRedisLock("commercial-maintenance", Number(process.env.MAINTENANCE_LOCK_TTL_MS || 30 * 60 * 1000));
  if (!lock.acquired) return { skipped: true, reason: "LOCKED" };
  try {
    const rollups = await rebuildAllTenantRollups();
    const expiredIntegrationKeys = await expireOldIntegrationKeys();
    return { ok: true, rollups: rollups.length, expiredIntegrationKeys };
  } finally {
    await releaseRedisLock(lock);
  }
}

async function collectPrometheusMetrics() {
  const ready = await runReadinessChecks({ timeoutMs: 3000 }).catch(err => ({ ok: false, error: err.message }));
  const stats = await withPlatformScope(async client => {
    const r = await client.query(`
      SELECT
        (SELECT count(*)::int FROM tenant_registry WHERE provision_status='READY') AS ready_tenants,
        (SELECT count(*)::int FROM tenant_registry WHERE provision_status='FAILED') AS failed_tenants,
        (SELECT count(*)::int FROM provision_audit WHERE status='FAILED' AND created_at >= now() - interval '24 hours') AS provisioning_failures_24h,
        (SELECT coalesce(sum(invoice_count),0)::int FROM tenant_rollups) AS rollup_invoice_count,
        (SELECT coalesce(sum(open_tickets),0)::int FROM tenant_rollups) AS rollup_open_tickets
    `);
    return r.rows[0];
  }).catch(() => ({ ready_tenants: 0, failed_tenants: 0, provisioning_failures_24h: 0, rollup_invoice_count: 0, rollup_open_tickets: 0 }));
  const queueStats = await fanoutReadyTenants(async (client, tenantId) => {
    const r = await client.query(`
      SELECT
        count(*) FILTER (WHERE status='QUEUED')::int AS queued_jobs,
        count(*) FILTER (WHERE status='FAILED')::int AS failed_jobs
      FROM invoice_processing_jobs WHERE company_id=$1
    `, [tenantId]);
    return r.rows[0];
  }).catch(() => []);
  const queuedJobs = queueStats.reduce((sum, row) => sum + Number(row.queued_jobs || 0), 0);
  const failedJobs = queueStats.reduce((sum, row) => sum + Number(row.failed_jobs || 0), 0);
  let redisOk = 0;
  try {
    const redis = getRedisClient();
    if (redis && await redis.ping() === 'PONG') redisOk = 1;
  } catch { redisOk = 0; }
  return [
    "# HELP sanad_ready Application readiness status (1 ready, 0 not ready)",
    "# TYPE sanad_ready gauge",
    `sanad_ready ${ready.ok ? 1 : 0}`,
    "# HELP sanad_ready_tenants Ready tenant count",
    "# TYPE sanad_ready_tenants gauge",
    `sanad_ready_tenants ${Number(stats.ready_tenants || 0)}`,
    "# HELP sanad_failed_tenants Failed tenant count",
    "# TYPE sanad_failed_tenants gauge",
    `sanad_failed_tenants ${Number(stats.failed_tenants || 0)}`,
    "# HELP sanad_provisioning_failures_24h Provisioning failures in the last 24 hours",
    "# TYPE sanad_provisioning_failures_24h gauge",
    `sanad_provisioning_failures_24h ${Number(stats.provisioning_failures_24h || 0)}`,
    "# HELP sanad_invoice_queue_queued_jobs Tenant invoice jobs queued",
    "# TYPE sanad_invoice_queue_queued_jobs gauge",
    `sanad_invoice_queue_queued_jobs ${queuedJobs}`,
    "# HELP sanad_invoice_queue_failed_jobs Tenant invoice jobs failed",
    "# TYPE sanad_invoice_queue_failed_jobs gauge",
    `sanad_invoice_queue_failed_jobs ${failedJobs}`,
    "# HELP sanad_redis_up Redis ping status",
    "# TYPE sanad_redis_up gauge",
    `sanad_redis_up ${redisOk}`,
    "# HELP sanad_rollup_invoice_count Rollup invoice count",
    "# TYPE sanad_rollup_invoice_count gauge",
    `sanad_rollup_invoice_count ${Number(stats.rollup_invoice_count || 0)}`,
    "# HELP sanad_rollup_open_tickets Rollup open tickets",
    "# TYPE sanad_rollup_open_tickets gauge",
    `sanad_rollup_open_tickets ${Number(stats.rollup_open_tickets || 0)}`
  ].join("\n") + "\n";
}

function constantTimeEqualString(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && aa.length > 0 && timingSafeEqual(aa, bb);
}

function bearerOrHeaderToken(req, headerName) {
  const explicit = req.header(headerName || "x-internal-health-token") || "";
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return explicit || bearer;
}

function requireInternalHealthAccess(req, res, next) {
  if (process.env.NODE_ENV !== "production") return next();
  const expected = process.env.INTERNAL_HEALTH_BEARER_TOKEN || process.env.METRICS_BEARER_TOKEN || "";
  const provided = bearerOrHeaderToken(req, "x-internal-health-token");
  if (!expected || !constantTimeEqualString(provided, expected)) return res.status(404).send("not found");
  next();
}

function publicHealthPayload(result) {
  return { ok: Boolean(result?.ok), service: "sanad-thaki", version: "v15.8-bank-grade-security-lock", checkedAt: result?.checkedAt || new Date().toISOString() };
}

function requireSetupBootstrapToken(req, res) {
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.SETUP_BOOTSTRAP_TOKEN || "";
  const provided = bearerOrHeaderToken(req, "x-setup-token");
  if (!expected) {
    res.status(500).json({ error: "SETUP_BOOTSTRAP_TOKEN مطلوب في الإنتاج قبل إنشاء أول حساب." });
    return false;
  }
  if (!constantTimeEqualString(provided, expected)) {
    res.status(403).json({ error: "رمز تهيئة النظام غير صحيح أو مفقود." });
    return false;
  }
  return true;
}

function requireDangerousConfirmation(req, res, expectedValue, operation) {
  if (process.env.NODE_ENV !== "production") return true;
  const confirmation = String(req.body?.confirmation || req.header("x-dangerous-operation-confirm") || "");
  if (!constantTimeEqualString(confirmation, expectedValue)) {
    res.status(400).json({
      error: `عملية ${operation} خطرة وتتطلب تأكيدًا صريحًا باسم/معرّف الشركة في حقل confirmation أو ترويسة x-dangerous-operation-confirm.`
    });
    return false;
  }
  return true;
}

app.get("/health/live", (_req, res) => {
  res.json({ ok: true, service: "sanad-thaki", version: "v15.8-bank-grade-security-lock" });
});

async function safeReadinessResponse(res, options = {}) {
  try {
    const result = await runReadinessChecks(options);
    return res.status(result.ok ? 200 : 503).json(options.publicOnly ? publicHealthPayload(result) : result);
  } catch (err) {
    console.error("Readiness check crashed:", err.message);
    const fallback = { ok: false, checkedAt: new Date().toISOString() };
    return res.status(503).json(options.publicOnly ? publicHealthPayload(fallback) : { ...fallback, error: "READINESS_CHECK_FAILED" });
  }
}

app.get("/health/ready", async (_req, res) => {
  return safeReadinessResponse(res, { timeoutMs: 8000, publicOnly: true });
});

app.get("/health", async (_req, res) => {
  return safeReadinessResponse(res, { timeoutMs: 8000, publicOnly: true });
});

app.get("/internal/health/ready-details", requireInternalHealthAccess, async (_req, res) => {
  return safeReadinessResponse(res, { timeoutMs: 12000, internal: true });
});

app.get("/metrics", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    const expected = process.env.METRICS_BEARER_TOKEN || "";
    const provided = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!expected || !constantTimeEqualString(provided, expected)) return res.status(404).send("not found");
  }
  const body = await collectPrometheusMetrics();
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(body);
});

app.get("/setup/status", async (req, res) => {
  const count = await countUsersForSetup();
  res.json({ setupRequired: count === 0 });
});

app.post("/setup/initial-admin", async (req, res) => {
  const schema = z.object({
    companyName: z.string().min(2).max(120),
    email: z.string().email(),
    password: z.string().min(12),
    taxNumber: z.string().min(3).max(40).optional().default(""),
    city: z.string().max(80).optional().default("الرياض")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات التهيئة غير صحيحة", details: parsed.error.issues });

  const userCount = await countUsersForSetup();
  if (userCount > 0) return res.status(403).json({ error: "تمت التهيئة مسبقًا" });
  if (!requireSetupBootstrapToken(req, res)) return;

  const companyId = `company-${randomUUID()}`;
  const userId = `user-${randomUUID()}`;
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const pkg = "professional";
  const limits = planLimitsForCode(pkg);

  try {
    await withPlatformScope(async client => {
      await client.query(
        `INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
         VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8,true)`,
        [companyId, parsed.data.companyName, parsed.data.taxNumber, parsed.data.email, parsed.data.city, pkg, limits[0], limits[1]]
      );
      await writePlatformAudit(client, req, "SETUP_INITIAL_COMPANY", "company", companyId, { email: parsed.data.email });
    });
    await provisionTenant({
      companyId,
      seed: {
        company: {
          id: companyId,
          name: parsed.data.companyName,
          tax_number: parsed.data.taxNumber,
          email: parsed.data.email,
          city: parsed.data.city,
          status: "ACTIVE",
          package_code: pkg,
          invoice_monthly_limit: limits[0],
          whatsapp_monthly_limit: limits[1],
          is_active: true
        },
        adminUser: {
          id: userId,
          email: parsed.data.email,
          name: "مدير النظام",
          password_hash: passwordHash,
          role: "ADMIN",
          password_must_change: false
        }
      }
    });
    res.json({ ok: true, message: "تم إنشاء حساب الأدمن الأول وتزويد قاعدة الشركة", companyId });
  } catch (err) {
    return handleDbError(err, res);
  }
});

app.post("/auth/signup", loginLimiter, async (req, res) => {
  const schema = z.object({
    companyName: z.string().min(2).max(120),
    name: z.string().min(2).max(120),
    email: z.string().email(),
    password: z.string().min(12)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "بيانات التسجيل غير صحيحة", details: parsed.error.issues });
  }

  const { companyName, name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  try {
    const existing = await lookupUserDirectoryByEmail(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: "البريد الإلكتروني مسجل بالفعل" });
    }

    const companyId = `company-${randomUUID()}`;
    const userId = `user-${randomUUID()}`;
    const passwordHash = await bcrypt.hash(password, 12);
    const pkg = "basic";
    const limits = planLimitsForCode(pkg);

    await withPlatformScope(async client => {
      await client.query(
        `INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
         VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8,true)`,
        [companyId, companyName, "", normalizedEmail, "الرياض", pkg, limits[0], limits[1]]
      );
      await writePlatformAudit(client, req, "SIGNUP_COMPANY", "company", companyId, { email: normalizedEmail });
    });

    await provisionTenant({
      companyId,
      seed: {
        company: {
          id: companyId,
          name: companyName,
          tax_number: "",
          email: normalizedEmail,
          city: "الرياض",
          status: "ACTIVE",
          package_code: pkg,
          invoice_monthly_limit: limits[0],
          whatsapp_monthly_limit: limits[1],
          is_active: true
        },
        adminUser: {
          id: userId,
          email: normalizedEmail,
          name: name,
          password_hash: passwordHash,
          role: "OWNER",
          password_must_change: false
        }
      }
    });

    const user = {
      id: userId,
      email: normalizedEmail,
      role: "OWNER",
      company_id: companyId,
      user_type: "CLIENT",
      name: name,
      password_must_change: false
    };

    const token = signAccessToken(user);
    await registerAuthSession(user, token);
    res.cookie("sanad_auth", token, authCookieOptions());

    return res.json({
      token: (config.NODE_ENV !== "production" || process.env.RETURN_BEARER_TOKEN_IN_LOGIN === "true") ? token : undefined,
      user: {
        id: userId,
        email: normalizedEmail,
        role: "OWNER",
        companyId,
        userType: "CLIENT",
        name,
        mustChangePassword: false
      }
    });

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "فشل إنشاء الحساب، يرجى المحاولة لاحقاً" });
  }
});

app.post("/auth/login", loginLimiter, login);

app.post("/auth/logout", (_req, res) => {
  res.clearCookie("sanad_auth", { path: "/" });
  res.json({ ok: true });
});

app.post("/auth/forgot", loginLimiter, async (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "بيانات البريد غير صحيحة" });
  const email = parsed.data.email.toLowerCase();
  try {
    await enforcePasswordResetThrottle(email);
    const dir = await lookupUserDirectoryByEmail(email);
    if (dir?.company_id && dir?.user_id) {
      const code = generateResetCode();
      const codeHash = hashPasswordResetCode(email, code);
      await withTenant(dir.company_id, async client => {
        await client.query("SELECT set_config('app.login_lookup','1',true)");
        const user = await client.query(
          "SELECT id, email, is_active, coalesce(user_status,'ACTIVE') AS user_status FROM app_users WHERE id=$1 AND lower(email)=lower($2) AND company_id=$3 LIMIT 1",
          [dir.user_id, email, dir.company_id]
        );
        if (!user.rows[0] || !user.rows[0].is_active || user.rows[0].user_status === "ARCHIVED") return;
        await client.query(
          `INSERT INTO password_reset_codes (company_id, user_id, code_hash, expires_at, requested_ip)
           VALUES ($1,$2,$3,now()+interval '30 minutes',$4)`,
          [dir.company_id, dir.user_id, codeHash, req.ip || ""]
        );
      });
      await sendPasswordResetEmail(email, code);
    } else if (!config.SMTP_HOST && config.NODE_ENV === "production") {
      const err = new Error("SMTP_NOT_CONFIGURED");
      err.statusCode = 500;
      throw err;
    }
    return res.json({ ok: true, message: "إذا كان البريد مسجلاً ستصلك رسالة استعادة خلال دقائق." });
  } catch (err) {
    if (err.statusCode === 429) return res.status(429).json({ error: "تم تجاوز حد طلبات الاستعادة. حاول لاحقًا." });
    if (err.statusCode === 500 && err.message === "SMTP_NOT_CONFIGURED") return res.status(500).json({ error: "إعداد SMTP مطلوب في الإنتاج لاستعادة كلمة المرور." });
    console.error("Password forgot error:", err.message);
    return res.status(500).json({ error: "تعذرت معالجة طلب الاستعادة مؤقتًا." });
  }
});

app.post("/auth/reset", loginLimiter, async (req, res) => {
  const schema = z.object({ email: z.string().email(), code: z.string().min(4).max(12), newPassword: z.string().min(12) });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "بيانات الاستعادة غير صحيحة", details: parsed.error.issues });
  const email = parsed.data.email.toLowerCase();
  const codeHash = hashPasswordResetCode(email, parsed.data.code);
  try {
    await enforcePasswordResetAttemptThrottle(email);
    const dir = await lookupUserDirectoryByEmail(email);
    if (!dir?.company_id || !dir?.user_id) return res.status(400).json({ error: "رمز الاستعادة غير صحيح أو منتهي." });
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    const ok = await withTenant(dir.company_id, async client => {
      await client.query("SELECT set_config('app.login_lookup','1',true)");
      const codes = await client.query(
        `SELECT id, code_hash, attempt_count, max_attempts FROM password_reset_codes
         WHERE company_id=$1 AND user_id=$2 AND used_at IS NULL AND expires_at > now()
           AND attempt_count < max_attempts
         ORDER BY created_at DESC LIMIT 5`,
        [dir.company_id, dir.user_id]
      );
      const match = codes.rows.find(row => safeCompareHash(row.code_hash, codeHash));
      if (!match) {
        await client.query(
          `UPDATE password_reset_codes
           SET attempt_count=LEAST(max_attempts, attempt_count + 1)
           WHERE company_id=$1 AND user_id=$2 AND used_at IS NULL AND expires_at > now()`,
          [dir.company_id, dir.user_id]
        );
        return false;
      }
      await client.query("UPDATE password_reset_codes SET used_at=now(), attempt_count=attempt_count+1 WHERE id=$1 AND company_id=$2", [match.id, dir.company_id]);
      await client.query(
        `UPDATE app_users SET password_hash=$3, password_must_change=false, invite_expires_at=NULL
         WHERE id=$1 AND company_id=$2 AND is_active=true AND coalesce(user_status,'ACTIVE') <> 'ARCHIVED'`,
        [dir.user_id, dir.company_id, passwordHash]
      );
      await client.query("UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND company_id=$2 AND revoked_at IS NULL", [dir.user_id, dir.company_id]).catch(() => {});
      await writeAudit(client, { user: { id: dir.user_id }, ip: req.ip, headers: req.headers, companyId: dir.company_id }, "RESET_PASSWORD_SELF_SERVICE", "app_user", dir.user_id);
      return true;
    });
    if (!ok) return res.status(400).json({ error: "رمز الاستعادة غير صحيح أو منتهي." });
    res.json({ ok: true, message: "تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن." });
  } catch (err) {
    if (err.statusCode === 429) return res.status(429).json({ error: "تم تجاوز حد محاولات الاستعادة. حاول لاحقًا." });
    console.error("Password reset error:", err.message);
    res.status(500).json({ error: "تعذر تغيير كلمة المرور مؤقتًا." });
  }
});

// v14.3.3: absolute route isolation guard. Even if a user guesses URLs manually,
// Platform-only routes reject tenant sessions and tenant routes reject platform sessions before handlers run.
app.use("/platform", authRequired, routeIsolationGuard, platformRequired);
app.use("/company", authRequired, routeIsolationGuard, tenantRequired);

app.get("/billing/plans", (req, res) => {
  res.json({ plans: Object.values(PLAN_DEFINITIONS).map(publicPlan) });
});

app.get(
  "/billing/history",
  authRequired,
  tenantRequired,
  async (req, res) => {
    try {
      const result = await withTenant(req.companyId, client =>
        client.query(
          `SELECT id, plan_code, plan_label, amount_sar, status, invoice_number, notes, created_at
           FROM billing_transactions
           WHERE company_id=$1
           ORDER BY created_at DESC
           LIMIT 50`,
          [req.companyId]
        )
      );
      res.json({ history: result.rows });
    } catch (err) {
      // If table doesn't exist yet, return empty history gracefully
      if (err.code === '42P01') {
        return res.json({ history: [] });
      }
      return handleDbError(err, res);
    }
  }
);

app.get(
  "/platform/overview",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_DASHBOARD),
  async (req, res) => {
    const data = await withPlatformScope(async client => {
      const summary = await client.query(`
        SELECT
          count(*)::int AS total_companies,
          count(*) FILTER (WHERE is_active=true)::int AS active_companies,
          count(*) FILTER (WHERE status='TRIAL')::int AS trial_companies,
          count(*) FILTER (WHERE status='SUSPENDED')::int AS suspended_companies
        FROM companies
      `);
      const usage = await client.query(`
        SELECT
          coalesce(sum(invoice_count),0)::int AS invoice_count,
          coalesce(sum(whatsapp_count),0)::int AS whatsapp_count,
          coalesce(sum(open_tickets),0)::int AS open_tickets
        FROM tenant_rollups
      `);
      const recent = await client.query(`
        SELECT c.id, c.name, c.status, c.package_code, c.is_active, c.created_at,
          coalesce(r.invoice_count,0)::int AS invoice_count,
          coalesce(r.whatsapp_count,0)::int AS whatsapp_count,
          coalesce(r.open_tickets,0)::int AS open_tickets
        FROM companies c
        LEFT JOIN tenant_rollups r ON r.company_id=c.id
        ORDER BY c.created_at DESC
        LIMIT 8
      `);
      return { ...summary.rows[0], ...usage.rows[0], recentCompanies: recent.rows };
    });
    res.json({ overview: data });
  }
);

app.get(
  "/platform/companies",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_COMPANIES_MANAGE),
  async (req, res) => {
    const result = await withPlatformScope(client => client.query(`
      SELECT c.id, c.name, c.status, c.package_code, c.invoice_monthly_limit, c.whatsapp_monthly_limit, c.is_active, c.created_at,
        coalesce(r.invoice_count,0)::int AS invoice_count,
        coalesce(r.whatsapp_count,0)::int AS whatsapp_count,
        coalesce(r.open_tickets,0)::int AS open_tickets,
        coalesce(r.user_count,0)::int AS user_count,
        coalesce(tr.provision_status,'UNPROVISIONED') AS provision_status
      FROM companies c
      LEFT JOIN tenant_rollups r ON r.company_id=c.id
      LEFT JOIN tenant_registry tr ON tr.company_id=c.id
      ORDER BY c.created_at DESC
      LIMIT 300
    `));
    res.json({ companies: result.rows });
  }
);

app.post(
  "/platform/companies",
  authRequired,
  platformRequired,
  blockClientCompanyId,
  requirePermission(Permissions.PLATFORM_COMPANIES_MANAGE),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(120),
      taxNumber: z.string().max(40).optional().default(""),
      email: z.string().email().optional().or(z.literal("")),
      city: z.string().max(80).optional().default(""),
      packageCode: z.enum(["basic","growth","professional"]).default("basic"),
      status: z.enum(["TRIAL","ACTIVE","SUSPENDED"]).default("TRIAL"),
      primaryUserEmail: z.string().email().optional().or(z.literal("")),
      primaryUserPassword: z.string().min(12).optional().or(z.literal("")),
      primaryUserRole: z.enum(["OWNER","ADMIN","MEMBER","FINANCE_MANAGER","ACCOUNTANT"]).default("OWNER")
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات الشركة غير صحيحة", details: parsed.error.issues });

    const companyId = `company-${randomUUID()}`;
    const pkg = parsed.data.packageCode;
    const limits = planLimitsForCode(pkg);
    const adminUserId = parsed.data.primaryUserEmail && parsed.data.primaryUserPassword ? `user-${randomUUID()}` : null;
    const adminPasswordHash = adminUserId ? await bcrypt.hash(parsed.data.primaryUserPassword, 12) : null;

    try {
      const company = await withPlatformScope(async client => {
        const inserted = await client.query(
          `INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active, created_at`,
          [companyId, parsed.data.name, parsed.data.taxNumber, parsed.data.email || null, parsed.data.city, parsed.data.status, pkg, limits[0], limits[1], parsed.data.status !== "SUSPENDED"]
        );
        await writePlatformAudit(client, req, "PLATFORM_CREATE_COMPANY", "company", companyId, { packageCode: pkg, status: parsed.data.status, initialUser: Boolean(adminUserId) });
        return inserted.rows[0];
      });

      const provisioning = await provisionTenant({
        companyId,
        seed: {
          company: {
            id: companyId,
            name: parsed.data.name,
            tax_number: parsed.data.taxNumber,
            email: parsed.data.email || null,
            city: parsed.data.city,
            status: parsed.data.status,
            package_code: pkg,
            invoice_monthly_limit: limits[0],
            whatsapp_monthly_limit: limits[1],
            is_active: parsed.data.status !== "SUSPENDED"
          },
          adminUser: adminUserId ? {
            id: adminUserId,
            name: "مدير النظام",
            email: parsed.data.primaryUserEmail,
            password_hash: adminPasswordHash,
            role: parsed.data.primaryUserRole,
            password_must_change: false
          } : null
        }
      });

      res.json({
        company,
        primaryUser: adminUserId ? { id: adminUserId, name: "مدير النظام", email: parsed.data.primaryUserEmail, role: parsed.data.primaryUserRole, is_active: true, user_status: "ACTIVE" } : null,
        provisioning
      });
    } catch (err) {
      return handleDbError(err, res);
    }
  }
);

app.patch(
  "/platform/companies/:id/status",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_COMPANIES_MANAGE),
  async (req, res) => {
    const schema = z.object({ status: z.enum(["TRIAL","ACTIVE","SUSPENDED","CANCELLED"]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "حالة الشركة غير صحيحة" });
    const result = await withPlatformScope(async client => {
      const company = await client.query(
        `UPDATE companies SET status=$2, is_active=CASE WHEN $2 IN ('SUSPENDED','CANCELLED') THEN false ELSE true END, updated_at=now()
         WHERE id=$1 RETURNING id, name, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active`,
        [req.params.id, parsed.data.status]
      );
      if (!company.rows[0]) return null;
      await writePlatformAudit(client, req, "PLATFORM_UPDATE_COMPANY_STATUS", "company", req.params.id, { status: parsed.data.status });
      return company.rows[0];
    });
    if (!result) return res.status(404).json({ error: "الشركة غير موجودة" });

    try {
      await withTenant(req.params.id, client => client.query(
        `UPDATE companies SET status=$2, is_active=CASE WHEN $2 IN ('SUSPENDED','CANCELLED') THEN false ELSE true END
         WHERE id=$1`,
        [req.params.id, parsed.data.status]
      ));
      await withPlatformScope(client => client.query(
        `UPDATE tenant_registry SET provision_status=CASE WHEN $2 IN ('SUSPENDED','CANCELLED') THEN 'DISABLED' ELSE 'READY' END, updated_at=now() WHERE company_id=$1`,
        [req.params.id, parsed.data.status]
      ));
    } catch (err) {
      console.error("Tenant shadow company status sync warning:", err.message);
    }
    res.json({ company: result });
  }
);

app.post(
  "/platform/companies/:id/reprovision",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_TENANT_PROVISION_MANAGE),
  async (req, res) => {
    const schema = z.object({
      confirmation: z.string().max(120).optional().default(""),
      adminEmail: z.string().email().optional().or(z.literal("")),
      adminPassword: z.string().min(12).optional().or(z.literal(""))
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "بيانات إعادة التزويد غير صحيحة", details: parsed.error.issues });
    if (!requireDangerousConfirmation(req, res, req.params.id, "إعادة التزويد")) return;
    try {
      const company = await withPlatformScope(async client => {
        const status = await client.query("SELECT provision_status FROM tenant_registry WHERE company_id=$1", [req.params.id]);
        if (status.rows[0] && !["FAILED", "ROLLBACK_IN_PROGRESS", "DISABLED"].includes(status.rows[0].provision_status)) {
          const err = new Error(`REPROVISION_NOT_ALLOWED_${status.rows[0].provision_status}`);
          err.statusCode = 409;
          throw err;
        }
        const r = await client.query(
          `SELECT id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active
           FROM companies WHERE id=$1`,
          [req.params.id]
        );
        return r.rows[0] || null;
      });
      if (!company) return res.status(404).json({ error: "الشركة غير موجودة" });
      const adminUser = parsed.data.adminEmail && parsed.data.adminPassword ? {
        id: `user-${randomUUID()}`,
        name: "مدير النظام",
        email: parsed.data.adminEmail,
        password_hash: await bcrypt.hash(parsed.data.adminPassword, 12),
        role: "ADMIN",
        password_must_change: true
      } : null;
      const provisioning = await provisionTenant({ companyId: req.params.id, seed: { company, adminUser } });
      await withPlatformScope(client => writePlatformAudit(client, req, "PLATFORM_REPROVISION_COMPANY", "company", req.params.id, { adminUser: Boolean(adminUser) })).catch(() => {});
      res.json({ ok: true, companyId: req.params.id, provisioning, adminUser: adminUser ? { id: adminUser.id, email: adminUser.email } : null });
    } catch (err) {
      if (err.statusCode === 409) return res.status(409).json({ error: "لا يمكن إعادة التزويد إلا للحالات FAILED أو ROLLBACK_IN_PROGRESS أو DISABLED." });
      return handleDbError(err, res);
    }
  }
);

app.post(
  "/platform/companies/:id/rotate-key",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_SECURITY_MANAGE),
  async (req, res) => {
    if (!requireDangerousConfirmation(req, res, req.params.id, "تدوير مفتاح التشفير")) return;
    try {
      const result = await rotateTenantKey(req.params.id, req.user?.id || "platform", { reencrypt: true });
      res.json({ ok: true, rotation: result });
    } catch (err) {
      return handleDbError(err, res);
    }
  }
);

app.post(
  "/platform/maintenance/rebuild-rollups",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_DASHBOARD),
  async (req, res) => {
    const rows = await rebuildAllTenantRollups();
    res.json({ ok: true, rebuilt: rows.length, rollups: rows });
  }
);

app.post(
  "/platform/maintenance/run",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_DASHBOARD),
  async (req, res) => {
    const result = await runCommercialMaintenanceOnce();
    res.json(result);
  }
);

app.get(
  "/platform/support/tickets",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_SUPPORT_MANAGE),
  async (req, res) => {
    const tickets = await fanoutReadyTenants(async (client, tenantId) => {
      const r = await client.query(`
        SELECT t.id, t.category, t.priority, t.status, t.created_at, left(t.description, 220) AS description_preview,
               c.id AS company_id, c.name AS company_name
        FROM support_tickets t
        JOIN companies c ON c.id=t.company_id
        WHERE t.company_id=$1
        ORDER BY t.created_at DESC
        LIMIT 50
      `, [tenantId]);
      return r.rows;
    });
    tickets.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ tickets: tickets.slice(0, 200) });
  }
);

app.patch(
  "/platform/support/tickets/:id/status",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_SUPPORT_MANAGE),
  async (req, res) => {
    const schema = z.object({ status: z.enum(["OPEN","IN_PROGRESS","CLOSED"]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "حالة التذكرة غير صحيحة" });
    let result = null;
    for (const tenantId of await listReadyTenantIds()) {
      result = await withTenant(tenantId, async client => {
        const ticket = await client.query("UPDATE support_tickets SET status=$2, closed_at=CASE WHEN $2='CLOSED' THEN now() ELSE closed_at END WHERE id=$1 RETURNING id, status, company_id", [req.params.id, parsed.data.status]);
        return ticket.rows[0] || null;
      }).catch(() => null);
      if (result) break;
    }
    if (!result) return res.status(404).json({ error: "التذكرة غير موجودة" });
    if (parsed.data.status === "CLOSED") await updateTenantRollup(result.company_id, { open_tickets: -1 }).catch(() => {});
    await withPlatformScope(client => writePlatformAudit(client, req, "PLATFORM_UPDATE_SUPPORT_TICKET", "support_ticket", req.params.id, { status: parsed.data.status, companyId: result.company_id }));
    res.json({ ticket: result });
  }
);

app.get(
  "/platform/support/tickets/:id",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_SUPPORT_MANAGE),
  async (req, res) => {
    let found = null;
    for (const tenantId of await listReadyTenantIds()) {
      found = await withTenant(tenantId, async client => {
        const result = await client.query(`
          SELECT t.*, c.name AS company_name
          FROM support_tickets t
          JOIN companies c ON c.id=t.company_id
          WHERE t.id=$1
          LIMIT 1
        `, [req.params.id]);
        return result.rows[0] || null;
      }).catch(() => null);
      if (found) break;
    }
    if (!found) return res.status(404).json({ error: "التذكرة غير موجودة" });
    res.json({ ticket: found });
  }
);

app.patch(
  "/platform/support/tickets/:id/response",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_SUPPORT_MANAGE),
  async (req, res) => {
    const schema = z.object({
      status: z.enum(["OPEN","IN_PROGRESS","CLOSED"]).default("IN_PROGRESS"),
      response: z.string().min(2).max(2000),
      internalNote: z.string().max(2000).optional().default("")
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات الرد غير صحيحة", details: parsed.error.issues });
    let result = null;
    for (const tenantId of await listReadyTenantIds()) {
      result = await withTenant(tenantId, async client => {
        const ticket = await client.query(`
          UPDATE support_tickets
          SET status=$2, support_response=$3, internal_note=$4, handled_by=$5,
              responded_at=now(), closed_at=CASE WHEN $2='CLOSED' THEN now() ELSE closed_at END
          WHERE id=$1
          RETURNING *
        `, [req.params.id, parsed.data.status, parsed.data.response, parsed.data.internalNote, req.user.id]);
        return ticket.rows[0] || null;
      }).catch(() => null);
      if (result) break;
    }
    if (!result) return res.status(404).json({ error: "التذكرة غير موجودة" });
    if (parsed.data.status === "CLOSED") await updateTenantRollup(result.company_id, { open_tickets: -1 }).catch(() => {});
    await withPlatformScope(client => writePlatformAudit(client, req, "PLATFORM_RESPOND_SUPPORT_TICKET", "support_ticket", req.params.id, { status: parsed.data.status, companyId: result.company_id }));
    res.json({ ticket: result });
  }
);

app.get(
  "/platform/security/logs",
  authRequired,
  platformRequired,
  requirePermission(Permissions.PLATFORM_SECURITY_READ),
  async (req, res) => {
    const platform = await withPlatformScope(client => client.query("SELECT id, user_id, action, entity_type, entity_id, created_at FROM platform_audit_logs ORDER BY created_at DESC LIMIT 100"));
    const clientLogs = await fanoutReadyTenants(async (client, tenantId) => {
      const r = await client.query("SELECT id, company_id, user_id, action, entity_type, created_at FROM audit_logs WHERE company_id=$1 ORDER BY created_at DESC LIMIT 50", [tenantId]);
      return r.rows;
    });
    clientLogs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ platformLogs: platform.rows, clientAuditSummary: clientLogs.slice(0, 100) });
  }
);

app.get("/me", authRequired, async (req, res) => {
  if (req.isPlatformAdmin) {
    return res.json({
      user: req.user,
      company: null,
      platform: { name: "سند ذكي", role: "مشغل المنصة" }
    });
  }
  const result = await withTenant(req.companyId, client =>
    client.query("SELECT id, name, tax_number, email, phone, city, address, default_currency, package_code, invoice_monthly_limit, whatsapp_monthly_limit FROM companies WHERE id=$1", [req.companyId])
  );
  const company = result.rows[0] || null;
  res.json({ user: req.user, company, entitlements: company ? publicPlan({ ...planFor(company.package_code), invoiceMonthlyLimit: Number(company.invoice_monthly_limit), whatsappMonthlyLimit: Number(company.whatsapp_monthly_limit) }) : null });
});

app.get("/company", authRequired, tenantRequired, async (req, res) => {
  const result = await withTenant(req.companyId, client =>
    client.query("SELECT id, name, tax_number, email, phone, city, address, default_currency, package_code, invoice_monthly_limit, whatsapp_monthly_limit FROM companies WHERE id=$1", [req.companyId])
  );
  const company = result.rows[0] || null;
  res.json({ company, entitlements: company ? publicPlan({ ...planFor(company.package_code), invoiceMonthlyLimit: Number(company.invoice_monthly_limit), whatsappMonthlyLimit: Number(company.whatsapp_monthly_limit) }) : null });
});

app.put(
  "/company",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.COMPANY_SETTINGS_MANAGE),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(120),
      taxNumber: z.string().max(40).optional().default(""),
      email: z.string().email().optional().or(z.literal("")),
      phone: z.string().max(40).optional().default(""),
      city: z.string().max(80).optional().default(""),
      address: z.string().max(250).optional().default("")
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات الشركة غير صحيحة", details: parsed.error.issues });

    try {
      const result = await withTenant(req.companyId, async client => {
        const company = await client.query(
          `UPDATE companies
           SET name=$2, tax_number=$3, email=$4, phone=$5, city=$6, address=$7
           WHERE id=$1 RETURNING id, name, tax_number, email, phone, city, address, default_currency`,
          [req.companyId, parsed.data.name, parsed.data.taxNumber, parsed.data.email || null, parsed.data.phone, parsed.data.city, parsed.data.address]
        );
        await writeAudit(client, req, "UPDATE_COMPANY_SETTINGS", "company", req.companyId);
        return company.rows[0];
      });
      res.json({ company: result });
    } catch (err) {
      return handleDbError(err, res);
    }
  }
);

app.post(
  "/company/billing/upgrade",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.COMPANY_SETTINGS_MANAGE),
  async (req, res) => {
    const schema = z.object({
      planCode: z.enum(["basic", "growth", "professional"])
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "خطة الاشتراك المحددة غير صالحة" });

    const planCode = parsed.data.planCode;
    const plan = PLAN_DEFINITIONS[planCode];

    try {
      const result = await withTenant(req.companyId, async client => {
        const companyRes = await client.query(
          `UPDATE companies
           SET package_code=$2, invoice_monthly_limit=$3, whatsapp_monthly_limit=$4, status='ACTIVE', is_active=true, updated_at=now()
           WHERE id=$1 RETURNING id, name, tax_number, email, phone, city, address, default_currency, package_code, invoice_monthly_limit, whatsapp_monthly_limit`,
          [req.companyId, planCode, plan.invoiceMonthlyLimit, plan.whatsappMonthlyLimit]
        );
        await writeAudit(client, req, "UPGRADE_PLAN", "company", req.companyId);

        // Record billing transaction history
        try {
          const invoiceNum = `SUB-${planCode.toUpperCase()}-${new Date().toISOString().slice(0,7).replace('-','')}`;
          await client.query(
            `INSERT INTO billing_transactions (company_id, plan_code, plan_label, amount_sar, status, invoice_number, notes)
             VALUES ($1, $2, $3, $4, 'PAID', $5, $6)`,
            [req.companyId, planCode, plan.label || planCode, plan.priceSar || 0, invoiceNum, `ترقية الاشتراك إلى ${plan.label || planCode}`]
          );
        } catch (_) { /* billing_transactions table may not exist in all tenants yet */ }

        return companyRes.rows[0];
      });

      const entitlements = publicPlan({
        ...planFor(result.package_code),
        invoiceMonthlyLimit: Number(result.invoice_monthly_limit),
        whatsappMonthlyLimit: Number(result.whatsapp_monthly_limit)
      });

      res.json({ company: result, entitlements });
    } catch (err) {
      return handleDbError(err, res);
    }
  }
);

app.get(
  "/users",
  authRequired,
  requirePermission(Permissions.USERS_MANAGE),
  async (req, res) => {
    const result = await withTenant(req.companyId, client =>
      client.query(
        `SELECT id, name, email, role, is_active, coalesce(user_status,'ACTIVE') AS user_status,
                password_must_change, invite_expires_at, archived_at, created_at
         FROM app_users WHERE company_id=$1 ORDER BY created_at DESC`,
        [req.companyId]
      )
    );
    res.json({ users: result.rows });
  }
);

app.post(
  "/users",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.USERS_MANAGE),
  userLimitGuard,
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(120),
      email: z.string().email(),
      role: z.enum(["OWNER", "ADMIN", "MEMBER", "FINANCE_MANAGER", "ACCOUNTANT"])
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات المستخدم غير صحيحة", details: parsed.error.issues });
    if (config.NODE_ENV === "production" && !config.SMTP_HOST) {
      return res.status(500).json({ error: "إعداد SMTP مطلوب في الإنتاج لإرسال دعوات الموظفين." });
    }

    try {
      const tempPassword = generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      const result = await withTenant(req.companyId, async client => {
        const user = await client.query(
          `INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change, invite_expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,true,'ACTIVE',true,now() + interval '24 hours')
           RETURNING id, name, email, role, is_active, user_status, password_must_change, invite_expires_at, created_at`,
          [`user-${randomUUID()}`, req.companyId, parsed.data.name, parsed.data.email, passwordHash, parsed.data.role]
        );
        await writeAudit(client, req, "CREATE_USER_INVITE", "app_user", user.rows[0].id, { role: parsed.data.role, deliveryMode: invitationPayload(tempPassword).deliveryMode });
        return user.rows[0];
      });
      await upsertUserDirectory(result.email, req.companyId, result.id, true);
      await updateTenantRollup(req.companyId, { user_count: 1 }).catch(err => console.error("Tenant user rollup warning:", err.message));
      const delivery = await sendEmployeeInviteEmail(result, tempPassword);
      res.json({ user: result, invite: invitationPayload(tempPassword), delivery, message: delivery.sent ? "تم إنشاء المستخدم وإرسال الدعوة على البريد." : "تم إنشاء المستخدم وتجهيز دعوة الدخول للاختبار." });
    } catch (err) {
      return handleDbError(err, res);
    }
  }
);

app.post(
  "/users/:id/reset-invite",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.USERS_MANAGE),
  async (req, res) => {
    if (config.NODE_ENV === "production" && !config.SMTP_HOST) {
      return res.status(500).json({ error: "إعداد SMTP مطلوب في الإنتاج لإرسال دعوات الموظفين." });
    }
    try {
      const tempPassword = generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      const result = await withTenant(req.companyId, async client => {
        const user = await client.query(
          `UPDATE app_users
           SET password_hash=$3, password_must_change=true, invite_expires_at=now() + interval '24 hours', is_active=true, user_status='ACTIVE'
           WHERE id=$1 AND company_id=$2 AND coalesce(user_status,'ACTIVE') <> 'ARCHIVED'
           RETURNING id, name, email, role, is_active, user_status, password_must_change, invite_expires_at`,
          [req.params.id, req.companyId, passwordHash]
        );
        if (!user.rows[0]) return null;
        await writeAudit(client, req, "RESET_USER_INVITE", "app_user", req.params.id, { deliveryMode: invitationPayload(tempPassword).deliveryMode });
        return user.rows[0];
      });
      if (!result) return res.status(404).json({ error: "المستخدم غير موجود أو مؤرشف" });
      await upsertUserDirectory(result.email, req.companyId, result.id, true);
      const delivery = await sendEmployeeInviteEmail(result, tempPassword);
      res.json({ user: result, invite: invitationPayload(tempPassword), delivery, message: delivery.sent ? "تم إرسال الدعوة الجديدة على البريد." : "تم تجهيز دعوة/كلمة مرور مؤقتة جديدة للاختبار." });
    } catch (err) { return handleDbError(err, res); }
  }
);

app.patch(
  "/users/:id/status",
  authRequired,
  requirePermission(Permissions.USERS_MANAGE),
  async (req, res) => {
    const schema = z.object({ isActive: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات حالة المستخدم غير صحيحة" });
    const result = await withTenant(req.companyId, async client => {
      const user = await client.query(
        "UPDATE app_users SET is_active=$3, user_status=CASE WHEN $3 THEN 'ACTIVE' ELSE 'SUSPENDED' END WHERE id=$1 AND company_id=$2 AND coalesce(user_status,'ACTIVE') <> 'ARCHIVED' RETURNING id, name, email, role, is_active, user_status",
        [req.params.id, req.companyId, parsed.data.isActive]
      );
      if (!user.rows[0]) return null;
      await writeAudit(client, req, "UPDATE_USER_STATUS", "app_user", req.params.id, { isActive: parsed.data.isActive });
      return user.rows[0];
    });
    if (!result) return res.status(404).json({ error: "المستخدم غير موجود أو مؤرشف" });
    await setUserDirectoryActive(result.email, parsed.data.isActive);
    res.json({ user: result });
  }
);

app.patch(
  "/users/:id/archive",
  authRequired,
  requirePermission(Permissions.USERS_MANAGE),
  async (req, res) => {
    const result = await withTenant(req.companyId, async client => {
      const user = await client.query(
        `UPDATE app_users
         SET is_active=false, user_status='ARCHIVED', archived_at=now()
         WHERE id=$1 AND company_id=$2 AND role <> 'ADMIN'
         RETURNING id, name, email, role, is_active, user_status, archived_at`,
        [req.params.id, req.companyId]
      );
      if (!user.rows[0]) return null;
      await writeAudit(client, req, "ARCHIVE_USER", "app_user", req.params.id, { role: user.rows[0].role });
      return user.rows[0];
    });
    if (!result) return res.status(404).json({ error: "المستخدم غير موجود أو لا يمكن أرشفته" });
    await setUserDirectoryActive(result.email, false);
    await updateTenantRollup(req.companyId, { user_count: -1 }).catch(err => console.error("Tenant user rollup warning:", err.message));
    res.json({ user: result });
  }
);

app.post("/auth/change-password", authRequired, tenantRequired, async (req, res) => {
  const schema = z.object({ currentPassword: z.string().min(8), newPassword: z.string().min(12) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات كلمة المرور غير صحيحة", details: parsed.error.issues });
  if (!req.companyId) return res.status(403).json({ error: "تغيير كلمة المرور من هذه الصفحة لمستخدمي الشركات فقط" });

  try {
    const result = await withTenant(req.companyId, async client => {
      const existing = await client.query(
        "SELECT id, password_hash, password_must_change, invite_expires_at FROM app_users WHERE id=$1 AND company_id=$2 AND is_active=true AND coalesce(user_status,'ACTIVE') <> 'ARCHIVED'",
        [req.user.id, req.companyId]
      );
      const user = existing.rows[0];
      if (!user) return { error: "NOT_FOUND" };
      if (user.password_must_change && user.invite_expires_at && new Date(user.invite_expires_at).getTime() < Date.now()) return { error: "EXPIRED" };
      const ok = await bcrypt.compare(parsed.data.currentPassword, user.password_hash);
      if (!ok) return { error: "BAD_PASSWORD" };
      const hash = await bcrypt.hash(parsed.data.newPassword, 12);
      await client.query(
        "UPDATE app_users SET password_hash=$3, password_must_change=false, invite_expires_at=NULL WHERE id=$1 AND company_id=$2",
        [req.user.id, req.companyId, hash]
      );
      await writeAudit(client, req, "CHANGE_FIRST_LOGIN_PASSWORD", "app_user", req.user.id);
      return { ok: true };
    });
    if (result.error === "EXPIRED") return res.status(403).json({ error: "انتهت صلاحية كلمة المرور المؤقتة. اطلب إعادة إرسال الدعوة من أدمن الشركة." });
    if (result.error === "BAD_PASSWORD") return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
    if (result.error === "NOT_FOUND") return res.status(404).json({ error: "المستخدم غير موجود" });
    res.json({ ok: true, message: "تم تغيير كلمة المرور. يمكنك استخدام النظام الآن." });
  } catch (err) { return handleDbError(err, res); }
});


function allowedInvoiceUpload(fileName, mimeType, dataUrl) {
  const safeName = String(fileName || "").slice(0, 180);
  const safeType = String(mimeType || "").toLowerCase();
  const allowedExt = /\.(pdf|png|jpg|jpeg)$/i.test(safeName);
  const allowedMime = ["application/pdf", "image/png", "image/jpeg", "image/jpg"].includes(safeType);
  const raw = String(dataUrl || "");
  if (!allowedExt || !allowedMime || !raw.startsWith("data:")) return { ok: false, error: "نوع الملف غير مسموح. ارفع PDF أو PNG أو JPG فقط." };
  const base64 = raw.split(",")[1] || "";
  const bytes = Math.floor(base64.length * 0.75);
  if (!base64 || bytes <= 0 || bytes > 8 * 1024 * 1024) return { ok: false, error: "حجم الملف غير مسموح. الحد الأقصى 8MB." };
  return { ok: true, safeName, safeType, base64, bytes };
}

function loosePdfText(buffer) {
  const latin = buffer.toString("latin1");
  const chunks = [];
  for (const m of latin.matchAll(/\(([^()]{2,120})\)\s*T[Jj]/g)) chunks.push(m[1]);
  for (const m of latin.matchAll(/\[([^\]]{2,500})\]\s*TJ/g)) chunks.push(m[1]);
  const raw = chunks.join(" ") || latin.slice(0, 30000);
  return raw
    .replace(/\\\(/g, "(").replace(/\\\)/g, ")")
    .replace(/\\n/g, " ").replace(/\\r/g, " ")
    .replace(/[^\u0600-\u06FF\w\s.,:\-/٠-٩٫٬]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 12000);
}

function arabicDigitsToLatin(value) {
  const map = {"٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9","٫":".","٬":""};
  return String(value || "").replace(/[٠-٩٫٬]/g, ch => map[ch] ?? ch);
}

function parseAmount(value) {
  const cleaned = arabicDigitsToLatin(value).replace(/,/g, "");
  const n = Number(cleaned.match(/\d+(?:\.\d{1,2})?/)?.[0]);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}


const OCR_ACCEPTANCE_TARGET = 0.95;
const OCR_MIN_REQUIRED_FIELDS = Object.freeze(["invoiceNumber", "customerName", "supplierTaxNumber", "totalAmount"]);

function normalizeInvoiceExtraction(raw, source = "unknown") {
  const extracted = {
    invoiceNumber: String(raw?.invoiceNumber || "").trim(),
    customerName: String(raw?.customerName || "").trim(),
    supplierName: String(raw?.supplierName || raw?.vendorName || "").trim(),
    supplierTaxNumber: String(raw?.supplierTaxNumber || "").replace(/\D/g, "").slice(0, 20),
    invoiceDateTime: String(raw?.invoiceDateTime || raw?.invoiceDate || "").trim(),
    totalAmount: parseAmount(raw?.totalAmount),
    vatAmount: parseAmount(raw?.vatAmount),
    lineItems: Array.isArray(raw?.lineItems) ? raw.lineItems : [],
    mathCheck: raw?.mathCheck || null,
    confidence: Math.max(0, Math.min(0.99, Number(raw?.confidence || 0))),
    source: raw?.source || source
  };
  const completed = OCR_MIN_REQUIRED_FIELDS.filter(k => Boolean(extracted[k])).length;
  const completenessScore = completed / OCR_MIN_REQUIRED_FIELDS.length;
  if (completed < OCR_MIN_REQUIRED_FIELDS.length) {
    extracted.confidence = Math.min(extracted.confidence, 0.74);
  } else {
    extracted.confidence = Math.min(0.99, Math.max(extracted.confidence, completenessScore));
  }
  if (extracted.mathCheck && extracted.mathCheck.ok === false) extracted.confidence = Math.min(extracted.confidence, 0.74);
  return extracted;
}

function mergeInvoiceExtraction(...parts) {
  const merged = { lineItems: [] };
  for (const part of parts.filter(Boolean)) {
    for (const [key, value] of Object.entries(part)) {
      if (value === undefined || value === null || value === "") continue;
      if (key === "lineItems" && Array.isArray(value) && value.length) merged.lineItems = value;
      else if (key === "confidence") merged.confidence = Math.max(Number(merged.confidence || 0), Number(value || 0));
      else if (!merged[key]) merged[key] = value;
    }
  }
  return merged;
}

function parseLineItemNumber(value) {
  return parseAmount(value);
}

function mathematicalCrossCheck(extracted) {
  const items = Array.isArray(extracted?.lineItems) ? extracted.lineItems : [];
  const checked = [];
  let subtotal = 0;
  for (const item of items) {
    const quantity = parseLineItemNumber(item.quantity);
    const unitPrice = parseLineItemNumber(item.unitPrice || item.price);
    const lineTotal = parseLineItemNumber(item.total || item.amount);
    if (!quantity || unitPrice === null) continue;
    const calculated = Math.round(quantity * unitPrice * 100) / 100;
    subtotal += calculated;
    checked.push({ name: item.name || item.description || "", quantity, unitPrice, lineTotal, calculated, ok: lineTotal === null || Math.abs(calculated - lineTotal) <= 0.01 });
  }
  subtotal = Math.round(subtotal * 100) / 100;
  const expectedVat = Math.round(subtotal * 0.15 * 100) / 100;
  const expectedTotal = Math.round((subtotal + expectedVat) * 100) / 100;
  const invoiceTotal = parseAmount(extracted?.totalAmount);
  const invoiceVat = parseAmount(extracted?.vatAmount);
  const totalOk = invoiceTotal === null || checked.length === 0 ? null : Math.abs(expectedTotal - invoiceTotal) <= 0.01;
  const vatOk = invoiceVat === null || checked.length === 0 ? null : Math.abs(expectedVat - invoiceVat) <= 0.01;
  return {
    ok: checked.length === 0 ? null : checked.every(i => i.ok) && totalOk !== false && vatOk !== false,
    subtotal,
    expectedVat,
    expectedTotal,
    invoiceVat,
    invoiceTotal,
    checkedItems: checked
  };
}

function invoiceNeedsManualReview(extracted) {
  const missing = OCR_MIN_REQUIRED_FIELDS.filter(k => !extracted[k]);
  return { needsManualReview: missing.length > 0 || Number(extracted.confidence || 0) < OCR_ACCEPTANCE_TARGET, missing };
}


const INVOICE_JOB_STATUS = Object.freeze({
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  PASSED: "PASSED",
  PENDING_REVIEW: "PENDING_REVIEW",
  FAILED: "FAILED"
});

async function createInvoiceProcessingJob(req, upload) {
  return withTenant(req.companyId, async client => {
    const encryptedUpload = encryptForTenant(req.companyId, JSON.stringify({
      fileName: upload.safeName,
      mimeType: upload.safeType,
      dataUrl: upload.dataUrl,
      bytes: upload.bytes,
      queuedAt: new Date().toISOString()
    }));
    const result = await client.query(
      `INSERT INTO invoice_processing_jobs
       (company_id, created_by, file_name, mime_type, file_bytes, status, encrypted_upload, tenant_crypto_version, tenant_key_version)
       VALUES ($1,$2,$3,$4,$5,'QUEUED',$6,'tenant-aes-256-gcm-v2',$7)
       RETURNING id, status, file_name, created_at`,
      [req.companyId, req.user?.id || null, upload.safeName, upload.safeType, upload.bytes, encryptedUpload, getTenantEncryptionVersion(req.companyId)]
    );
    await recordTenantUsage(client, req.companyId, "invoice_queued", 1, { fileName: upload.safeName, mimeType: upload.safeType });
    await writeAudit(client, req, "QUEUE_INVOICE_FILE", "invoice_processing_job", result.rows[0].id, {
      fileName: upload.safeName,
      mimeType: upload.safeType,
      bytes: upload.bytes,
      queue: "postgres-tenant-scoped-worker",
      response: "instant"
    });
    return result.rows[0];
  });
}

async function processInvoiceJob(job) {
  const pseudoReq = { companyId: job.company_id, user: { id: job.created_by || null }, ip: "background-worker", headers: {} };
  return withTenant(job.company_id, async client => {
    const locked = await client.query(
      `UPDATE invoice_processing_jobs
       SET status='PROCESSING', processing_started_at=now(), attempts=attempts+1, updated_at=now()
       WHERE id=$1 AND company_id=$2 AND status IN ('QUEUED','FAILED') AND attempts < 3
       RETURNING *`,
      [job.id, job.company_id]
    );
    if (!locked.rowCount) return null;
    const row = locked.rows[0];
    let extracted = null;
    let extractionError = null;
    let allowed = null;
    let preprocessPlan = prepareOpenCvPreprocessPlan();
    try {
      const upload = JSON.parse(decryptForTenant(row.company_id, row.encrypted_upload));
      allowed = allowedInvoiceUpload(upload.fileName, upload.mimeType, upload.dataUrl);
      if (!allowed.ok) throw new Error(allowed.error);
      const buffer = Buffer.from(allowed.base64, "base64");
      const pdfText = allowed.safeType === "application/pdf" ? loosePdfText(buffer) : "";
      await withTenantAiSession(row.company_id, async aiSession => {
        try {
          const preprocessed = await preprocessInvoiceImage({ buffer, mimeType: allowed.safeType, session: aiSession });
          let zatcaQr = null;
          try {
            zatcaQr = await parseZatcaQrFromImage({ buffer: preprocessed.buffer, mimeType: preprocessed.mimeType });
          } catch (qrErr) {
            console.error("ZATCA QR parser warning:", qrErr.message);
          }
          const documentAi = await runGoogleDocumentAi({ buffer: preprocessed.buffer, mimeType: preprocessed.mimeType, session: aiSession });
          const documentAiExtraction = documentAi?.enabled ? heuristicInvoiceExtract(documentAi.text || "") : null;
          if (documentAiExtraction && Array.isArray(documentAi.lineItems)) documentAiExtraction.lineItems = documentAi.lineItems;
          const openAiExtraction = await extractInvoiceWithOpenAI({ dataUrl: upload.dataUrl, mimeType: allowed.safeType, pdfText: documentAi?.text || pdfText });
          extracted = mergeInvoiceExtraction(openAiExtraction, documentAiExtraction, zatcaQr ? {
            supplierName: zatcaQr.supplierName,
            supplierTaxNumber: zatcaQr.supplierTaxNumber,
            invoiceDateTime: zatcaQr.invoiceDateTime,
            totalAmount: zatcaQr.totalAmount,
            vatAmount: zatcaQr.vatAmount,
            confidence: zatcaQr.confidence,
            source: "zatca_qr_tlv+document_ai+openai"
          } : null);
          extracted.mathCheck = mathematicalCrossCheck(extracted);
          extracted.preprocessing = { skipped: preprocessed.skipped, steps: preprocessed.steps || [], deskewAngle: preprocessed.deskewAngle || 0 };
        } catch (err) {
          extractionError = err.message;
          console.error("Background invoice extraction warning:", err.message);
        }
      });
      if (!extracted) extracted = heuristicInvoiceExtract(pdfText || upload.fileName);
      if (!extracted.mathCheck) extracted.mathCheck = mathematicalCrossCheck(extracted);
      extracted = normalizeInvoiceExtraction(extracted, extracted?.source);
      const review = invoiceNeedsManualReview(extracted);
      const finalStatus = review.needsManualReview ? "PENDING_REVIEW" : "PASSED";
      await client.query(
        `UPDATE invoice_processing_jobs
         SET status=$1, extracted_json=$2::jsonb, confidence=$3, review_reasons=$4::jsonb,
             processing_finished_at=now(), updated_at=now(), error_message=NULL
         WHERE id=$5 AND company_id=$6`,
        [finalStatus, JSON.stringify(extracted), extracted.confidence, JSON.stringify({ missingFields: review.missing, extractionError: extractionError ? "yes" : "no" }), row.id, row.company_id]
      );
      await recordTenantUsage(client, row.company_id, "invoice_processed_background", 1, {
        jobId: row.id,
        status: finalStatus,
        confidence: extracted.confidence,
        source: extracted.source
      });
      await writeAudit(client, pseudoReq, "PROCESS_INVOICE_BACKGROUND", "invoice_processing_job", row.id, {
        status: finalStatus,
        confidence: extracted.confidence,
        source: extracted.source,
        targetConfidence: OCR_ACCEPTANCE_TARGET,
        aiSessionIsolation: "tenant-scoped-temp-session-cleaned",
        preprocessing: preprocessPlan.steps
      });
      return { jobId: row.id, status: finalStatus };
    } catch (err) {
      await client.query(
        `UPDATE invoice_processing_jobs
         SET status = CASE WHEN attempts >= 3 THEN 'FAILED' ELSE 'QUEUED' END,
             error_message=$1, updated_at=now()
         WHERE id=$2 AND company_id=$3`,
        [String(err.message || err).slice(0, 500), row.id, row.company_id]
      );
      await writeAudit(client, pseudoReq, "PROCESS_INVOICE_BACKGROUND_FAILED", "invoice_processing_job", row.id, { error: String(err.message || err).slice(0, 500) });
      throw err;
    }
  });
}

let invoiceWorkerRunning = false;
async function runInvoiceQueueWorkerOnce() {
  if (invoiceWorkerRunning || process.env.DISABLE_INVOICE_QUEUE_WORKER === "true") return;
  const distributedLock = await acquireRedisLock("invoice-queue-worker", Number(process.env.INVOICE_QUEUE_LOCK_TTL_MS || 120000));
  if (!distributedLock.acquired) return;
  invoiceWorkerRunning = true;
  try {
    const tenantIds = await listReadyTenantIds();
    // In Database-per-Tenant mode the worker must poll each tenant database, not the shared platform pool.
    if (tenantIds.length > 0) {
      for (const tenantId of tenantIds) {
        await withTenant(tenantId, async tenantClient => {
          const candidates = await tenantClient.query(
            `SELECT id, company_id, created_by
             FROM invoice_processing_jobs
             WHERE company_id=$1 AND status='QUEUED' AND attempts < 3
             ORDER BY created_at ASC
             LIMIT 5`,
            [tenantId]
          );
          for (const job of candidates.rows) {
            try { await processInvoiceJob(job); }
            catch (err) { console.error("Invoice background job failed:", job.id, err.message); }
          }
        });
      }
      return;
    }

    // Development/staging fallback only when DB-per-tenant is not enforced.
    const candidates = await pool.query(
      `SELECT id, company_id, created_by
       FROM invoice_processing_jobs
       WHERE status='QUEUED' AND attempts < 3
       ORDER BY created_at ASC
       LIMIT 5`
    );
    for (const job of candidates.rows) {
      try { await processInvoiceJob(job); }
      catch (err) { console.error("Invoice background job failed:", job.id, err.message); }
    }
  } finally {
    invoiceWorkerRunning = false;
    await releaseRedisLock(distributedLock);
  }
}

function hashIntegrationKey(key) {
  return createHash("sha256").update(String(key || "")).digest("hex");
}

function heuristicInvoiceExtract(text) {
  const normalized = arabicDigitsToLatin(String(text || "")).replace(/\s+/g, " ").trim();
  const findAfter = patterns => {
    for (const p of patterns) {
      const m = normalized.match(p);
      if (m?.[1]) return m[1].trim().replace(/[#:：\-]+$/, "");
    }
    return "";
  };
  const invoiceNumber = findAfter([
    /(?:رقم\s*(?:الفاتورة|فاتورة)|فاتورة\s*رقم|Invoice\s*(?:No\.?|Number|#)?)[^A-Za-z0-9\u0600-\u06FF]{0,12}([A-Za-z0-9\-/]{3,40})/i,
    /(?:INV|Bill)\s*[-#: ]\s*([A-Za-z0-9\-/]{3,40})/i
  ]);
  const tax = findAfter([
    /(?:الرقم\s*الضريبي|الرقم\s*الضريبي\s*للمورد|VAT|Tax\s*(?:No\.?|Number)?)[^0-9]{0,20}(\d{10,15})/i,
    /\b(3\d{14})\b/
  ]);
  let customerName = findAfter([
    /(?:العميل|اسم\s*العميل|Customer|Bill\s*To)\s*[:\-]?\s*([\u0600-\u06FFA-Za-z0-9 ._\-]{2,80})/i,
    /(?:السادة|إلى)\s*[:\-]?\s*([\u0600-\u06FFA-Za-z0-9 ._\-]{2,80})/i
  ]).replace(/\s*(?:رقم|Invoice|VAT|Tax).*$/i, "").trim();
  const totalLine = findAfter([
    /(?:الإجمالي\s*شامل\s*الضريبة|إجمالي\s*المبلغ|المبلغ\s*الإجمالي|Total\s*(?:Amount)?|Grand\s*Total)[^0-9٠-٩]{0,25}([0-9٠-٩,.٫٬]+(?:\.\d{1,2})?)/i
  ]);
  let totalAmount = parseAmount(totalLine);
  if (!totalAmount) {
    const amounts = [...normalized.matchAll(/\b\d{1,3}(?:,?\d{3})*(?:\.\d{1,2})\b/g)].map(m => parseAmount(m[0])).filter(n => n && n > 0);
    totalAmount = amounts.length ? Math.max(...amounts) : null;
  }
  const filled = [invoiceNumber, tax, customerName, totalAmount].filter(Boolean).length;
  return normalizeInvoiceExtraction({
    invoiceNumber,
    customerName,
    supplierTaxNumber: tax,
    totalAmount,
    confidence: filled >= 4 ? 0.82 : filled >= 3 ? 0.58 : filled >= 2 ? 0.35 : 0.18,
    source: "heuristic"
  }, "heuristic");
}

async function extractInvoiceWithOpenAI({ dataUrl, mimeType, pdfText }) {
  if (!config.OPENAI_API_KEY) return null;
  const system = "أنت محرك استخراج فواتير لمنصة سعودية. الهدف التشغيلي 95% عند وضوح الفاتورة. أعد JSON فقط بالمفاتيح: invoiceNumber, customerName, supplierTaxNumber, totalAmount, confidence. لا تخترع بيانات إطلاقًا. confidence يجب أن يكون عاليًا فقط عند اكتمال الحقول الأربعة ووضوحها، وإلا اجعله أقل من 0.95. totalAmount رقم فقط.";
  const content = mimeType === "application/pdf"
    ? [{ type: "text", text: `استخرج بيانات الفاتورة من النص التالي:\n${pdfText || ""}` }]
    : [
        { type: "text", text: "استخرج رقم الفاتورة، اسم العميل، الرقم الضريبي للمورد، والمبلغ الإجمالي من صورة الفاتورة." },
        { type: "image_url", image_url: { url: dataUrl } }
      ];
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${config.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_INVOICE_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content }
      ]
    })
  });
  if (!response.ok) throw new Error(`OpenAI invoice extraction failed: ${response.status}`);
  const body = await response.json();
  const raw = body.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  return normalizeInvoiceExtraction(parsed, "openai");
}

app.post(
  "/invoices/read-file",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.INVOICE_CREATE),
  async (req, res) => {
    const schema = z.object({
      fileName: z.string().min(3).max(180),
      mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/jpg"]),
      dataUrl: z.string().min(20)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "ملف الفاتورة غير صحيح", details: parsed.error.issues });
    const allowed = allowedInvoiceUpload(parsed.data.fileName, parsed.data.mimeType, parsed.data.dataUrl);
    if (!allowed.ok) return res.status(400).json({ error: allowed.error });

    const job = await createInvoiceProcessingJob(req, {
      ...allowed,
      dataUrl: parsed.data.dataUrl
    });

    await withTenant(req.companyId, client =>
      writeAudit(client, req, "READ_INVOICE_FILE", "invoice_processing_job", job.id, {
        fileName: job.file_name,
        mimeType: job.mime_type,
        status: job.status
      })
    );

    // Fire-and-forget local worker tick for staging/dev. In production this can run as a separate worker process.
    setImmediate(() => runInvoiceQueueWorkerOnce().catch(err => console.error("Invoice queue worker tick failed:", err.message)));

    res.status(202).json({
      status: "queued",
      message: "Invoice is processing in the background",
      jobId: job.id,
      jobStatus: job.status,
      fileName: job.file_name,
      pollingUrl: `/invoices/jobs/${job.id}`
    });
  }
);

app.get(
  "/invoices/jobs/:jobId",
  authRequired,
  requirePermission(Permissions.INVOICE_CREATE),
  async (req, res) => {
    const result = await withTenant(req.companyId, client =>
      client.query(
        `SELECT id, file_name, mime_type, file_bytes, status, confidence, extracted_json,
                review_reasons, error_message, attempts, created_at, processing_started_at, processing_finished_at, updated_at
         FROM invoice_processing_jobs
         WHERE id=$1 AND company_id=$2`,
        [req.params.jobId, req.companyId]
      )
    );
    if (!result.rowCount) return res.status(404).json({ error: "مهمة المعالجة غير موجودة داخل شركتك" });
    const job = result.rows[0];
    res.json({
      job: {
        id: job.id,
        fileName: job.file_name,
        mimeType: job.mime_type,
        fileBytes: job.file_bytes,
        status: job.status,
        confidence: job.confidence,
        extracted: job.extracted_json,
        reviewReasons: job.review_reasons,
        errorMessage: job.error_message,
        attempts: job.attempts,
        createdAt: job.created_at,
        processingStartedAt: job.processing_started_at,
        processingFinishedAt: job.processing_finished_at,
        updatedAt: job.updated_at
      }
    });
  }
);



app.post(
  "/invoices/batch",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.INVOICE_CREATE),
  async (req, res) => {
    const schema = z.object({
      invoices: z.array(z.object({
        invoiceNumber: z.string().min(1),
        customerName: z.string().min(1),
        supplierTaxNumber: z.string().min(3),
        totalAmount: z.number().positive(),
        customerPhone: z.string().max(30).optional().default(""),
        invoiceDate: z.string().max(20).optional().default(""),
        dueDate: z.string().max(20).optional().default("")
      })).min(1).max(25)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات مجموعة الفواتير غير صحيحة", details: parsed.error.issues });
    try {
      const created = await withTenant(req.companyId, async client => {
        const plan = await loadCompanyPlan(client, req.companyId);
        const count = await client.query(
          "SELECT count(*)::int AS count FROM invoices WHERE company_id=$1 AND created_at >= date_trunc('month', now())",
          [req.companyId]
        );
        if (Number(count.rows[0].count) + parsed.data.invoices.length > plan.invoiceMonthlyLimit) {
          const err = new Error(`تتجاوز المجموعة حد الفواتير الشهري في الباقة (${plan.invoiceMonthlyLimit}).`);
          err.statusCode = 403;
          throw err;
        }
        const rows = [];
        for (const item of parsed.data.invoices) {
          const encryptedPayload = buildTenantEncryptedInvoicePayload(req.companyId, item, { source: "batch" });
          const inv = await client.query(
            `INSERT INTO invoices
             (company_id, invoice_number, customer_name, supplier_tax_number, total_amount, customer_phone, invoice_date, due_date, status, locked_for_review, encrypted_payload, tenant_crypto_version, tenant_key_version)
             VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,'')::date,NULLIF($8,'')::date,'DRAFT',false,$9,'tenant-aes-256-gcm-v2',$10)
             RETURNING *`,
            [req.companyId, item.invoiceNumber.trim(), item.customerName.trim(), item.supplierTaxNumber.trim(), normalizeAmount(item.totalAmount), String(item.customerPhone || '').replace(/[^0-9]/g, ''), item.invoiceDate || '', item.dueDate || '', encryptedPayload, getTenantEncryptionVersion(req.companyId)]
          );
          rows.push(inv.rows[0]);
        }
        await recordTenantUsage(client, req.companyId, "invoice_created_batch", rows.length, { source: "accountant_batch" });
        await writeAudit(client, req, "CREATE_INVOICE_BATCH", "invoice", null, { count: rows.length });
        return rows;
      });
      res.json({ invoices: created, message: `تم حفظ ${created.length} فاتورة من المجموعة.` });
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
      return handleDbError(err, res);
    }
  }
);


app.use("/integrations/salla/webhook", webhookLimiter);
app.use("/integrations/whatsapp/meta/webhook", webhookLimiter);
app.use("/integrations/salla", createSallaRouter({
  express,
  authRequired,
  requirePermission,
  Permissions,
  blockClientCompanyId,
  withTenant,
  encryptForTenant,
  decryptForTenant,
  buildTenantEncryptedInvoicePayload,
  getTenantEncryptionVersion,
  writeAudit,
  writeSecurityAuditTrail,
  recordTenantUsage,
  normalizeAmount,
  config
}));

installCommercialValueFeatures(app, {
  authRequired,
  blockClientCompanyId,
  requirePermission,
  Permissions,
  withTenant,
  withPlatformScope,
  writeAudit,
  writeSecurityAuditTrail,
  recordTenantUsage,
  buildTenantEncryptedInvoicePayload,
  getTenantEncryptionVersion,
  encryptForTenant,
  decryptForTenant,
  acquireRedisLock,
  releaseRedisLock,
  accountingImportLimiter,
  whatsappQuotaGuard
});

app.post(
  "/integrations/api-keys",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.INTEGRATIONS_MANAGE),
  async (req, res) => {
    const schema = z.object({ name: z.string().min(2).max(80).default("Accounting System") });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "اسم الربط غير صحيح" });
    const rawKey = `snd_${randomBytes(24).toString("hex")}`;
    const keyHash = hashIntegrationKey(rawKey);
    const result = await withTenant(req.companyId, async client => {
      const r = await client.query(
        `INSERT INTO integration_api_keys (company_id, name, key_hash, scopes, created_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, name, scopes, is_active, created_at`,
        [req.companyId, parsed.data.name, keyHash, ["invoices:write"], req.user.id]
      );
      await writeAudit(client, req, "CREATE_INTEGRATION_API_KEY", "integration_api_key", r.rows[0].id, { name: parsed.data.name });
      return r.rows[0];
    });
    await withPlatformScope(client => client.query(
      `INSERT INTO integration_key_directory (key_hash, company_id, integration_key_id, scopes, is_active)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (key_hash) DO UPDATE SET company_id=$2, integration_key_id=$3, scopes=$4, is_active=true, updated_at=now()`,
      [keyHash, req.companyId, String(result.id), result.scopes]
    ));
    res.json({ apiKey: rawKey, key: result, warning: "يظهر المفتاح مرة واحدة فقط. احفظه في النظام المحاسبي ولا ترسله في المتصفح." });
  }
);

app.post("/integrations/accounting/invoices", blockClientCompanyId, async (req, res) => {
  const rawKey = req.header("x-sanad-integration-key") || "";
  if (!rawKey) return res.status(401).json({ error: "مفتاح الربط مفقود" });
  const keyHash = hashIntegrationKey(rawKey);
  const schema = z.object({
    invoices: z.array(z.object({
      invoiceNumber: z.string().min(1),
      customerName: z.string().min(1),
      supplierTaxNumber: z.string().min(3),
      totalAmount: z.number().positive(),
      customerPhone: z.string().max(30).optional().default(""),
      invoiceDate: z.string().max(20).optional().default(""),
      dueDate: z.string().max(20).optional().default("")
    })).min(1).max(100)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات الفواتير غير صحيحة", details: parsed.error.issues });
  const lookupClient = await pool.connect();
  let key;
  try {
    await lookupClient.query("BEGIN");
    await lookupClient.query("SELECT set_config('app.integration_lookup', '1', true)");
    const lookup = await lookupClient.query("SELECT company_id, integration_key_id AS id, scopes FROM integration_key_directory WHERE key_hash=$1 AND is_active=true", [keyHash]);
    key = lookup.rows[0];
    await lookupClient.query("COMMIT");
  } catch (err) {
    await lookupClient.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    lookupClient.release();
  }
  if (!key || !Array.isArray(key.scopes) || !key.scopes.includes("invoices:write")) return res.status(403).json({ error: "مفتاح الربط غير صالح أو لا يملك صلاحية الفواتير" });
  const integrationLimit = Number(process.env.INTEGRATION_KEY_RATE_LIMIT_PER_MINUTE || 60);
  const integrationCount = await incrementWindowCounter(`integration:${key.id}`, 60);
  if (integrationCount > integrationLimit) {
    await withPlatformScope(client => client.query(
      "UPDATE integration_key_directory SET failure_count=coalesce(failure_count,0)+1, last_used_ip=$2, updated_at=now() WHERE integration_key_id=$1",
      [key.id, req.ip || ""]
    )).catch(() => {});
    return res.status(429).json({ error: "تم تجاوز حد طلبات مفتاح الربط مؤقتًا." });
  }
  const created = await withTenant(key.company_id, async client => {
    await client.query("UPDATE integration_api_keys SET last_used_at=now(), last_used_ip=$3 WHERE id=$1 AND company_id=$2", [key.id, key.company_id, req.ip || ""]).catch(() => {});
    const rows = [];
    for (const item of parsed.data.invoices) {
      const encryptedPayload = buildTenantEncryptedInvoicePayload(key.company_id, item, { source: "integration_accounting_api" });
      const inv = await client.query(
        `INSERT INTO invoices (company_id, invoice_number, customer_name, supplier_tax_number, total_amount, customer_phone, invoice_date, due_date, status, locked_for_review, encrypted_payload, tenant_crypto_version, tenant_key_version, source_system, external_source)
         VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,'')::date,NULLIF($8,'')::date,'DRAFT',false,$9,'tenant-aes-256-gcm-v2',$10,'generic','accounting_api')
         ON CONFLICT (company_id, invoice_number, supplier_tax_number) DO NOTHING
         RETURNING *`,
        [key.company_id, item.invoiceNumber.trim(), item.customerName.trim(), item.supplierTaxNumber.trim(), normalizeAmount(item.totalAmount), String(item.customerPhone || '').replace(/[^0-9]/g, ''), item.invoiceDate || '', item.dueDate || '', encryptedPayload, getTenantEncryptionVersion(key.company_id)]
      );
      if (inv.rows[0]) rows.push(inv.rows[0]);
    }
    await recordTenantUsage(client, key.company_id, "invoice_imported_integration", rows.length, { received: parsed.data.invoices.length, integrationKeyId: key.id });
    await writeAudit(client, { user: { id: "integration" }, ip: req.ip }, "IMPORT_ACCOUNTING_INVOICES", "integration", key.id, { received: parsed.data.invoices.length, created: rows.length });
    return rows;
  });
  await withPlatformScope(client => client.query(
    "UPDATE integration_key_directory SET last_used_at=now(), last_used_ip=$2, failure_count=0, updated_at=now() WHERE integration_key_id=$1",
    [key.id, req.ip || ""]
  )).catch(() => {});
  res.json({ created: created.length, skippedDuplicates: parsed.data.invoices.length - created.length });
});

app.get("/invoices", authRequired, requirePermission(Permissions.INVOICE_READ), async (req, res) => {
  const result = await withTenant(req.companyId, client =>
    client.query("SELECT * FROM invoices WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200", [req.companyId])
  );
  res.json({ invoices: result.rows });
});


app.get("/tenant/usage", authRequired, requirePermission(Permissions.REPORTS_READ), async (req, res) => {
  const result = await withTenant(req.companyId, client =>
    client.query(`
      SELECT metric, COALESCE(sum(quantity),0)::int AS quantity
      FROM tenant_usage_events
      WHERE company_id=$1 AND created_at >= date_trunc('month', now())
      GROUP BY metric
      ORDER BY metric
    `, [req.companyId])
  );
  res.json({ companyId: req.companyId, period: "current_month", usage: result.rows });
});

app.post(
  "/invoices",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.INVOICE_CREATE),
  invoiceQuotaGuard,
  async (req, res) => {
    const schema = z.object({
      invoiceNumber: z.string().min(1),
      customerName: z.string().min(1),
      supplierTaxNumber: z.string().min(1),
      totalAmount: z.coerce.number().positive(),
      customerPhone: z.string().max(30).optional().default(""),
      invoiceDate: z.string().max(20).optional().default(""),
      dueDate: z.string().max(20).optional().default("")
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات الفاتورة غير مكتملة", details: parsed.error.issues });

    try {
      const result = await withTenant(req.companyId, async client => {
        const encryptedPayload = buildTenantEncryptedInvoicePayload(req.companyId, parsed.data, { source: "manual_entry" });
        const inv = await client.query(
          `INSERT INTO invoices
           (company_id, invoice_number, customer_name, supplier_tax_number, total_amount, customer_phone, invoice_date, due_date, status, locked_for_review, encrypted_payload, tenant_crypto_version, tenant_key_version)
           VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,'')::date,NULLIF($8,'')::date,'DRAFT',false,$9,'tenant-aes-256-gcm-v2',$10)
           RETURNING *`,
          [req.companyId, parsed.data.invoiceNumber, parsed.data.customerName, parsed.data.supplierTaxNumber, normalizeAmount(parsed.data.totalAmount), String(parsed.data.customerPhone || '').replace(/[^0-9]/g, ''), parsed.data.invoiceDate || '', parsed.data.dueDate || '', encryptedPayload, getTenantEncryptionVersion(req.companyId)]
        );
        await recordTenantUsage(client, req.companyId, "invoice_created_manual", 1, { invoiceNumber: parsed.data.invoiceNumber });
        await writeAudit(client, req, "CREATE_INVOICE", "invoice", inv.rows[0].id, { invoiceNumber: parsed.data.invoiceNumber });
        return inv.rows[0];
      });
      res.json({ invoice: result });
    } catch (err) {
      return handleDbError(err, res);
    }
  }
);

app.put(
  "/invoices/:id",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.INVOICE_CREATE),
  async (req, res) => {
    const schema = z.object({
      invoiceNumber: z.string().min(1),
      customerName: z.string().min(1),
      supplierTaxNumber: z.string().min(1),
      totalAmount: z.coerce.number().positive(),
      customerPhone: z.string().max(30).optional().default(""),
      invoiceDate: z.string().max(20).optional().default(""),
      dueDate: z.string().max(20).optional().default("")
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات التصحيح غير مكتملة", details: parsed.error.issues });

    try {
      const result = await withTenant(req.companyId, async client => {
        const inv = await client.query(
          `UPDATE invoices
           SET invoice_number=$3, customer_name=$4, supplier_tax_number=$5, total_amount=$6, customer_phone=$7, invoice_date=NULLIF($8,'')::date, due_date=NULLIF($9,'')::date
           WHERE id=$1 AND company_id=$2 AND locked_for_review=false AND status IN ('DRAFT','NEEDS_REVIEW')
           RETURNING *`,
          [req.params.id, req.companyId, parsed.data.invoiceNumber, parsed.data.customerName, parsed.data.supplierTaxNumber, normalizeAmount(parsed.data.totalAmount), String(parsed.data.customerPhone || '').replace(/[^0-9]/g, ''), parsed.data.invoiceDate || '', parsed.data.dueDate || '']
        );
        if (!inv.rows[0]) return null;
        await writeAudit(client, req, "UPDATE_INVOICE_CORRECTION", "invoice", req.params.id);
        return inv.rows[0];
      });
      if (!result) return res.status(403).json({ error: "لا يمكن تعديل الفاتورة بعد تثبيتها للمراجعة" });
      res.json({ invoice: result });
    } catch (err) {
      return handleDbError(err, res);
    }
  }
);

app.post(
  "/invoices/:id/submit-review",
  authRequired,
  requirePermission(Permissions.INVOICE_SUBMIT_REVIEW),
  async (req, res) => {
    const result = await withTenant(req.companyId, async client => {
      const inv = await client.query(
        `UPDATE invoices
         SET status='READY_FOR_REVIEW', locked_for_review=true, locked_at=now(), locked_by=$3
         WHERE id=$1 AND company_id=$2 AND status IN ('DRAFT','NEEDS_REVIEW')
         AND invoice_number <> '' AND customer_name <> '' AND supplier_tax_number <> '' AND total_amount > 0
         RETURNING *`,
        [req.params.id, req.companyId, req.user.id]
      );
      if (!inv.rows[0]) return null;
      await writeAudit(client, req, "SUBMIT_INVOICE_REVIEW", "invoice", req.params.id);
      await createNotification(client, req.companyId, "فاتورة قيد المراجعة", `تم إرسال الفاتورة رقم ${inv.rows[0].invoice_number} للمراجعة والاعتماد.`, "warning", req.user.id);
      return inv.rows[0];
    });
    if (!result) return res.status(400).json({ error: "الفاتورة غير مكتملة أو غير قابلة للإرسال" });
    res.json({ invoice: result });
  }
);

app.post(
  "/invoices/:id/approve",
  authRequired,
  requirePermission(Permissions.INVOICE_APPROVE),
  async (req, res) => {
    const result = await withTenant(req.companyId, async client => {
      const inv = await client.query(
        `UPDATE invoices
         SET status='APPROVED', approved_at=now(), approved_by=$3
         WHERE id=$1 AND company_id=$2 AND status='READY_FOR_REVIEW' AND locked_for_review=true
         RETURNING *`,
        [req.params.id, req.companyId, req.user.id]
      );
      if (!inv.rows[0]) return null;
      await writeAudit(client, req, "APPROVE_INVOICE", "invoice", req.params.id);
      await writeSecurityAuditTrail(client, req, "INVOICE_APPROVED_WHATSAPP_UNLOCKED", "invoice", req.params.id, { invoiceNumber: inv.rows[0].invoice_number, status: inv.rows[0].status });
      await createNotification(client, req.companyId, "تم اعتماد فاتورة", `تم اعتماد الفاتورة رقم ${inv.rows[0].invoice_number} بنجاح.`, "success", req.user.id);
      return inv.rows[0];
    });
    if (!result) return res.status(400).json({ error: "لا يمكن اعتماد الفاتورة قبل قفلها وإرسالها للمراجعة" });
    res.json({ invoice: result });
  }
);

// Legacy direct WhatsApp endpoints removed in v15.8. Commercial WhatsApp routes are installed from commercial-value-features.js.

app.get(
  "/bank/transactions",
  authRequired,
  requirePermission(Permissions.BANK_MANAGE),
  planFeatureGuard("bankMatching", "النمو"),
  async (req, res) => {
    const result = await withTenant(req.companyId, client =>
      client.query("SELECT * FROM bank_transactions WHERE company_id=$1 ORDER BY transaction_date DESC, created_at DESC LIMIT 200", [req.companyId])
    );
    res.json({ transactions: result.rows });
  }
);

app.post(
  "/bank/transactions",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.BANK_MANAGE),
  planFeatureGuard("bankMatching", "النمو"),
  async (req, res) => {
    const schema = z.object({
      transactionDate: z.string().min(8),
      description: z.string().min(2),
      amount: z.coerce.number().positive(),
      reference: z.string().max(120).optional().default("")
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات العملية البنكية غير صحيحة", details: parsed.error.issues });
    const result = await withTenant(req.companyId, async client => {
      const tx = await client.query(
        `INSERT INTO bank_transactions (company_id, transaction_date, description, amount, reference, status)
         VALUES ($1,$2,$3,$4,$5,'UNMATCHED') RETURNING *`,
        [req.companyId, parsed.data.transactionDate, parsed.data.description, normalizeAmount(parsed.data.amount), parsed.data.reference]
      );
      await writeAudit(client, req, "CREATE_BANK_TRANSACTION", "bank_transaction", tx.rows[0].id);
      return tx.rows[0];
    });
    res.json({ transaction: result });
  }
);


app.post(
  "/bank/statement/upload",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.BANK_MANAGE),
  planFeatureGuard("bankMatching", "النمو"),
  bankStatementLimiter,
  bankStatementUploadSingle,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "ارفع ملف كشف البنك بصيغة Excel أو CSV" });

    let suppliedMapping = {};
    if (req.body?.mapping) {
      try { suppliedMapping = typeof req.body.mapping === "string" ? JSON.parse(req.body.mapping) : req.body.mapping; }
      catch { return res.status(400).json({ error: "صيغة خريطة الأعمدة غير صحيحة" }); }
    }
    const bankKey = cleanBankText(req.body?.bankKey || req.body?.bankName || "default", 80) || "default";

    const parsed = readStatementRows(req.file);
    const mapping = detectBankStatementMapping(parsed.headers, suppliedMapping || {});
    if (!mapping.date || !mapping.description || (!mapping.amount && !mapping.credit)) {
      return res.status(400).json({
        code: "BANK_STATEMENT_MAPPING_REQUIRED",
        error: "لم أستطع تحديد أعمدة كشف البنك تلقائيًا. أرسل mapping يحدد date و description و amount أو credit.",
        headers: parsed.headers,
        detectedMapping: mapping
      });
    }

    const result = await withTenant(req.companyId, async client => {
      const importRow = await client.query(
        `INSERT INTO bank_statement_imports
          (company_id, bank_key, original_filename, file_type, total_rows, imported_rows, skipped_rows, status, mapping, created_by)
         VALUES ($1,$2,$3,$4,$5,0,0,'PROCESSING',$6::jsonb,$7)
         RETURNING *`,
        [req.companyId, bankKey, req.file.originalname, req.file.mimetype || "application/octet-stream", parsed.rows.length, JSON.stringify(mapping), req.user.id]
      );
      const importId = importRow.rows[0].id;
      await client.query(
        `INSERT INTO bank_statement_column_mappings (company_id, bank_key, mapping, updated_by, updated_at)
         VALUES ($1,$2,$3::jsonb,$4,now())
         ON CONFLICT (company_id, bank_key)
         DO UPDATE SET mapping=EXCLUDED.mapping, updated_by=EXCLUDED.updated_by, updated_at=now()`,
        [req.companyId, bankKey, JSON.stringify(mapping), req.user.id]
      );

      let imported = 0;
      let skipped = 0;
      const errors = [];
      for (let i = 0; i < parsed.rows.length; i += 1) {
        const tx = normalizeBankStatementRow(parsed.rows[i], mapping);
        const reason = validateNormalizedBankTx(tx);
        if (reason) {
          skipped += 1;
          if (errors.length < 20) errors.push({ row: i + 2, reason });
          continue;
        }
        const sourceHash = sourceHashForBankTransaction(req.companyId, tx);
        const inserted = await client.query(
          `INSERT INTO bank_transactions
             (company_id, transaction_date, description, amount, reference, status, import_batch_id, source_hash)
           VALUES ($1,$2,$3,$4,$5,'UNMATCHED',$6,$7)
           ON CONFLICT (company_id, source_hash) DO NOTHING
           RETURNING id`,
          [req.companyId, tx.transactionDate, tx.description, normalizeAmount(tx.amount), tx.reference, importId, sourceHash]
        );
        if (inserted.rows[0]) imported += 1;
        else skipped += 1;
      }
      await client.query(
        `UPDATE bank_statement_imports
         SET imported_rows=$3, skipped_rows=$4, status='IMPORTED', errors=$5::jsonb, completed_at=now()
         WHERE id=$1 AND company_id=$2`,
        [importId, req.companyId, imported, skipped, JSON.stringify(errors)]
      );
      await recordTenantUsage(client, req.companyId, "bank_statement_rows_imported", imported, { importId, bankKey, originalFilename: req.file.originalname });
      await writeAudit(client, req, "IMPORT_BANK_STATEMENT_FILE", "bank_statement_import", importId, { imported, skipped, bankKey });
      await writeSecurityAuditTrail(client, req, "BANK_STATEMENT_FILE_UPLOADED", "bank_statement_import", importId, { imported, skipped, bankKey, originalFilename: req.file.originalname, totalRows: parsed.rows.length });
      const matching = await runBankMatchingForCompany(client, req, req.companyId);
      return { importId, totalRows: parsed.rows.length, imported, skipped, mapping, errors, matching };
    });

      res.json({ ok: true, ...result });
    } catch (err) {
      return sendBankStatementUploadError(err, res);
    }
  }
);

app.get(
  "/bank/statement/imports",
  authRequired,
  requirePermission(Permissions.BANK_MANAGE),
  planFeatureGuard("bankMatching", "النمو"),
  async (req, res) => {
    const result = await withTenant(req.companyId, client => client.query(
      `SELECT id, bank_key, original_filename, total_rows, imported_rows, skipped_rows, status, errors, created_at, completed_at
       FROM bank_statement_imports
       WHERE company_id=$1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.companyId]
    ));
    res.json({ imports: result.rows });
  }
);

app.get(
  "/bank/mapping",
  authRequired,
  requirePermission(Permissions.BANK_MANAGE),
  planFeatureGuard("bankMatching", "النمو"),
  async (req, res) => {
    const result = await withTenant(req.companyId, client => client.query(
      `SELECT bank_key, mapping, notes, updated_at FROM bank_statement_column_mappings
       WHERE company_id=$1 ORDER BY updated_at DESC`,
      [req.companyId]
    ));
    res.json({ mappings: result.rows });
  }
);

app.put(
  "/bank/mapping/:bankKey",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.BANK_MANAGE),
  planFeatureGuard("bankMatching", "النمو"),
  async (req, res) => {
    const schema = z.object({
      mapping: z.object({
        date: z.string().min(1),
        description: z.string().min(1),
        amount: z.string().optional().default(""),
        credit: z.string().optional().default(""),
        debit: z.string().optional().default(""),
        reference: z.string().optional().default("")
      }).refine(v => Boolean(v.amount || v.credit), { message: "amount أو credit مطلوب" }),
      notes: z.string().max(500).optional().default("")
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "خريطة البنك غير صحيحة", details: parsed.error.issues });
    const bankKey = cleanBankText(req.params.bankKey || "default", 80) || "default";
    const result = await withTenant(req.companyId, async client => {
      const r = await client.query(
        `INSERT INTO bank_statement_column_mappings (company_id, bank_key, mapping, notes, updated_by, updated_at)
         VALUES ($1,$2,$3::jsonb,$4,$5,now())
         ON CONFLICT (company_id, bank_key) DO UPDATE SET
           mapping=EXCLUDED.mapping, notes=EXCLUDED.notes, updated_by=EXCLUDED.updated_by, updated_at=now()
         RETURNING bank_key, mapping, notes, updated_at`,
        [req.companyId, bankKey, JSON.stringify(parsed.data.mapping), parsed.data.notes, req.user.id]
      );
      await writeAudit(client, req, "UPDATE_BANK_MAPPING", "bank_mapping", bankKey);
      return r.rows[0];
    });
    res.json({ mapping: result });
  }
);

app.get(
  "/matches",
  authRequired,
  requirePermission(Permissions.MATCH_READ),
  planFeatureGuard("bankMatching", "النمو"),
  async (req, res) => {
    const result = await withTenant(req.companyId, client => client.query(`
      SELECT m.*, i.invoice_number, i.customer_name, i.total_amount, b.transaction_date, b.description AS bank_description, b.amount AS bank_amount
      FROM reconciliation_matches m
      JOIN invoices i ON i.id=m.invoice_id AND i.company_id=$1
      JOIN bank_transactions b ON b.id=m.bank_transaction_id AND b.company_id=$1
      WHERE m.company_id=$1
      ORDER BY m.created_at DESC LIMIT 200
    `, [req.companyId]));
    res.json({ matches: result.rows });
  }
);

app.post(
  "/matches/run",
  authRequired,
  requirePermission(Permissions.MATCH_APPROVE),
  planFeatureGuard("bankMatching", "النمو"),
  async (req, res) => {
    const result = await withTenant(req.companyId, async client => {
      return runBankMatchingForCompany(client, req, req.companyId);
    });
    res.json(result);
  }
);

app.post(
  "/matches/:id/approve",
  authRequired,
  requirePermission(Permissions.MATCH_APPROVE),
  planFeatureGuard("bankMatching", "النمو"),
  async (req, res) => {
    let result;
    try {
      result = await withTenant(req.companyId, async client => {
      const match = await client.query(
        `SELECT m.*, i.status AS invoice_status, b.status AS bank_status
         FROM reconciliation_matches m
         JOIN invoices i ON i.id=m.invoice_id AND i.company_id=m.company_id
         JOIN bank_transactions b ON b.id=m.bank_transaction_id AND b.company_id=m.company_id
         WHERE m.id=$1 AND m.company_id=$2 AND m.status='PENDING'
         FOR UPDATE OF m, i, b`,
        [req.params.id, req.companyId]
      );
      if (!match.rows[0]) return null;
      const invoiceId = match.rows[0].invoice_id;
      const bankTxId = match.rows[0].bank_transaction_id;
      if (match.rows[0].invoice_status !== 'APPROVED' || match.rows[0].bank_status !== 'UNMATCHED') return { conflict: true };
      const invUpd = await client.query("UPDATE invoices SET status='PAID' WHERE id=$1 AND company_id=$2 AND status='APPROVED' RETURNING id", [invoiceId, req.companyId]);
      const txUpd = await client.query("UPDATE bank_transactions SET status='MATCHED' WHERE id=$1 AND company_id=$2 AND status='UNMATCHED' RETURNING id", [bankTxId, req.companyId]);
      if (txUpd.rowCount !== 1 || invUpd.rowCount !== 1) throw Object.assign(new Error('MATCH_APPROVAL_CONFLICT_ROLLBACK'), { statusCode: 409 });
      await client.query("UPDATE reconciliation_matches SET status='APPROVED', approved_at=now(), approved_by=$3 WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId, req.user.id]);
      await client.query("UPDATE reconciliation_matches SET status='REJECTED' WHERE company_id=$1 AND id<>$2 AND status='PENDING' AND (invoice_id=$3 OR bank_transaction_id=$4)", [req.companyId, req.params.id, invoiceId, bankTxId]);
      await writeAudit(client, req, "APPROVE_BANK_MATCH", "reconciliation_match", req.params.id);
      await writeSecurityAuditTrail(client, req, "BANK_MATCH_APPROVED_INVOICE_PAID", "reconciliation_match", req.params.id, { invoiceId, bankTransactionId: bankTxId });
      await createNotification(client, req.companyId, "تمت المطابقة البنكية", `تم مطابقة الحركة البنكية واعتماد سداد الفاتورة بنجاح.`, "success", req.user.id);
      return { ok: true, paidInvoiceId: invoiceId };
      });
    } catch (err) {
      if (err.statusCode === 409) return res.status(409).json({ error: "تعذّر الاعتماد: الحركة مطابقة مسبقًا أو الفاتورة ليست معتمدة." });
      throw err;
    }
    if (!result) return res.status(404).json({ error: "المطابقة غير موجودة أو غير قابلة للاعتماد" });
    if (result.conflict) return res.status(409).json({ error: "تعذّر الاعتماد: الحركة مطابقة مسبقًا أو الفاتورة ليست معتمدة." });
    let sallaSync = { skipped: true };
    try {
      sallaSync = await notifySallaPaidForInvoice({
        companyId: req.companyId,
        invoiceId: result.paidInvoiceId,
        withTenant,
        decryptForTenant,
        writeAudit,
        writeSecurityAuditTrail
      });
    } catch (err) {
      console.error("Salla paid sync warning:", redactSecrets(err));
      sallaSync = { failed: true, message: redactSecrets(err.message) };
    }
    res.json({ ...result, sallaSync });
  }
);

app.post(
  "/matches/:id/reject",
  authRequired,
  requirePermission(Permissions.MATCH_APPROVE),
  planFeatureGuard("bankMatching", "النمو"),
  async (req, res) => {
    const result = await withTenant(req.companyId, async client => {
      const match = await client.query("UPDATE reconciliation_matches SET status='REJECTED' WHERE id=$1 AND company_id=$2 AND status='PENDING' RETURNING *", [req.params.id, req.companyId]);
      if (!match.rows[0]) return null;
      await writeAudit(client, req, "REJECT_BANK_MATCH", "reconciliation_match", req.params.id);
      return match.rows[0];
    });
    if (!result) return res.status(404).json({ error: "المطابقة غير موجودة أو غير قابلة للرفض" });
    res.json({ match: result });
  }
);

app.get(
  "/reports/finance",
  authRequired,
  requirePermission(Permissions.REPORTS_READ),
  async (req, res) => {
    const result = await withTenant(req.companyId, async client => {
      const summary = await client.query(`
        SELECT
          count(*)::int AS total_invoices,
          count(*) FILTER (WHERE status='READY_FOR_REVIEW')::int AS ready_for_review,
          count(*) FILTER (WHERE status IN ('APPROVED','PAID'))::int AS approved_invoices,
          count(*) FILTER (WHERE status='PAID')::int AS paid_invoices,
          count(*) FILTER (WHERE status='APPROVED')::int AS unpaid_approved_invoices,
          coalesce(sum(total_amount),0)::numeric AS total_amount,
          coalesce(sum(total_amount) FILTER (WHERE status='APPROVED'),0)::numeric AS outstanding_amount,
          coalesce(sum(total_amount) FILTER (WHERE status='PAID'),0)::numeric AS paid_amount
        FROM invoices
        WHERE company_id=$1
      `, [req.companyId]);
      const whatsapp = await client.query("SELECT count(*)::int AS sent_or_queued FROM whatsapp_messages WHERE company_id=$1", [req.companyId]);
      const tickets = await client.query("SELECT count(*)::int AS open_tickets FROM support_tickets WHERE company_id=$1 AND status='OPEN'", [req.companyId]);
      return { ...summary.rows[0], ...whatsapp.rows[0], ...tickets.rows[0] };
    });
    res.json({ summary: result });
  }
);

app.get("/support/tickets", authRequired, requirePermission(Permissions.SUPPORT_SUBMIT), async (req, res) => {
  const canManage = req.user.role === "ADMIN";
  const result = await withTenant(req.companyId, client =>
    client.query("SELECT * FROM support_tickets WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100", [req.companyId])
  );
  res.json({ canManage, tickets: result.rows });
});

app.post(
  "/support/tickets",
  authRequired,
  blockClientCompanyId,
  requirePermission(Permissions.SUPPORT_SUBMIT),
  async (req, res) => {
    const schema = z.object({
      category: z.enum(["login", "invoice", "whatsapp", "bank", "reports", "backup", "permissions", "other"]),
      priority: z.enum(["low", "normal", "high"]),
      description: z.string().min(5).max(2000)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات التذكرة غير صحيحة", details: parsed.error.issues });

    const result = await withTenant(req.companyId, async client => {
      const ticket = await client.query(
        `INSERT INTO support_tickets (company_id, created_by, category, priority, description, status)
         VALUES ($1,$2,$3,$4,$5,'OPEN') RETURNING *`,
        [req.companyId, req.user.id, parsed.data.category, parsed.data.priority, parsed.data.description]
      );
      await recordTenantUsage(client, req.companyId, "support_ticket_opened", 1, { ticketId: ticket.rows[0].id });
      await updateTenantRollup(req.companyId, { open_tickets: 1 }).catch(err => console.error("Tenant support rollup warning:", err.message));
      await writeAudit(client, req, "SUPPORT_TICKET_CREATED", "support_ticket", ticket.rows[0].id);
      return ticket.rows[0];
    });
    res.json({ ticket: result });
  }
);

app.get(
  "/audit-logs",
  authRequired,
  requirePermission(Permissions.AUDIT_READ),
  async (req, res) => {
    const result = await withTenant(req.companyId, client =>
      client.query("SELECT * FROM audit_logs WHERE company_id=$1 ORDER BY created_at DESC LIMIT 150", [req.companyId])
    );
    res.json({ auditLogs: result.rows });
  }
);

app.get(
  "/notifications",
  authRequired,
  tenantRequired,
  async (req, res) => {
    try {
      const result = await withTenant(req.companyId, client =>
        client.query("SELECT * FROM notifications WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100", [req.companyId])
      );
      res.json({ notifications: result.rows });
    } catch (err) {
      return handleDbError(err, res);
    }
  }
);

app.post(
  "/notifications/:id/read",
  authRequired,
  tenantRequired,
  async (req, res) => {
    const { id } = req.params;
    try {
      await withTenant(req.companyId, client =>
        client.query("UPDATE notifications SET is_read=true WHERE id=$1 AND company_id=$2", [id, req.companyId])
      );
      res.json({ ok: true });
    } catch (err) {
      return handleDbError(err, res);
    }
  }
);

app.get(
  "/security-audit-trail",
  authRequired,
  requirePermission(Permissions.AUDIT_READ),
  async (req, res) => {
    const result = await withTenant(req.companyId, client =>
      client.query("SELECT * FROM security_audit_trail WHERE company_id=$1 ORDER BY created_at DESC LIMIT 150", [req.companyId])
    );
    res.json({ securityAuditTrail: result.rows });
  }
);

app.get(["/", "/login", "/dashboard", "/app", "/setup", "/terms", "/privacy", "/legal"], (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((err, req, res, next) => {
  if (req.originalUrl && req.originalUrl.startsWith("/bank/statement/upload")) {
    return sendBankStatementUploadError(err, res);
  }
  next(err);
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "حدث خطأ داخلي. تم تسجيل المشكلة." });
});

const workerOnlyMode = process.env.WORKER_ONLY === "true";

if (process.env.DISABLE_INVOICE_QUEUE_WORKER !== "true") {
  setInterval(() => runInvoiceQueueWorkerOnce().catch(err => console.error("Invoice queue worker interval failed:", err.message)), Number(process.env.INVOICE_QUEUE_POLL_MS || 3000));
}

if (process.env.DISABLE_WHATSAPP_QUEUE_WORKER !== "true") {
  setInterval(() => runWhatsappQueueWorkerOnce({ withTenant, decryptForTenant, writeAudit, acquireRedisLock, releaseRedisLock }).catch(err => console.error("WhatsApp queue worker interval failed:", err.message)), Number(process.env.WHATSAPP_QUEUE_POLL_MS || 10000));
}

if (process.env.DISABLE_COMMERCIAL_MAINTENANCE !== "true") {
  setInterval(() => runCommercialMaintenanceOnce().catch(err => console.error("Commercial maintenance failed:", err.message)), Number(process.env.COMMERCIAL_MAINTENANCE_INTERVAL_MS || 6 * 60 * 60 * 1000));
}

if (workerOnlyMode) {
  console.log("Sanad Thaki background worker mode is running; HTTP listener is disabled.");
} else {
  app.listen(config.APP_PORT, () => {
    console.log(`Sanad Thaki Commercial Value Features Lock running on ${config.APP_PORT}`);
  });
}

module.exports = { app, runInvoiceQueueWorkerOnce, runWhatsappQueueWorkerOnce, runCommercialMaintenanceOnce };
