const multer = require("multer");
const XLSX = require("xlsx");
const { parse: parseCsvSync } = require("csv-parse/sync");
const { createHash, createHmac, timingSafeEqual } = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const { z } = require("zod");
const { listReadyTenantIds } = require("./tenant-db-router");
const { redactSecrets } = require("./secure-logger");

const MAX_ACCOUNTING_IMPORT_BYTES = 4 * 1024 * 1024;
const MAX_ACCOUNTING_IMPORT_ROWS = 5000;
const ACCOUNTING_SYSTEMS = Object.freeze(["qoyod", "daftara", "odoo", "zoho", "generic"]);
const REMINDER_STAGES = Object.freeze(["FIRST", "SECOND", "FINAL"]);
const DELIVERY_STATUSES = Object.freeze(["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"]);

function safeText(value, max = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) return `966${digits.slice(1)}`;
  return digits;
}

function normalizeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function hmacBody(secret, rawBody) {
  return `sha256=${createHmac("sha256", String(secret || "")).update(rawBody || Buffer.alloc(0)).digest("hex")}`;
}

function safeCompare(a, b) {
  const ab = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function parseAllowedHosts(envValue) {
  return String(envValue || "")
    .split(",")
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

function hostnameMatchesAllowed(hostname, allowedHosts) {
  const h = String(hostname || "").toLowerCase();
  return allowedHosts.some(allowed => h === allowed || (allowed.startsWith("*.") && h.endsWith(allowed.slice(1))));
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const v4 = ip.includes(":") && ip.includes(".") ? ip.split(":").pop() : ip;
  if (!net.isIP(v4)) return true;
  if (net.isIP(v4) === 6) return false;
  const parts = v4.split(".").map(n => Number(n));
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a >= 224
  );
}

async function assertAllowedOutboundUrl(rawUrl, { allowedHostsEnv, purpose }) {
  let parsed;
  try { parsed = new URL(String(rawUrl || "")); }
  catch { throw Object.assign(new Error(`${purpose}_URL_INVALID`), { statusCode: 400 }); }
  if (parsed.protocol !== "https:") throw Object.assign(new Error(`${purpose}_HTTPS_REQUIRED`), { statusCode: 400 });
  if (parsed.username || parsed.password) throw Object.assign(new Error(`${purpose}_URL_CREDENTIALS_FORBIDDEN`), { statusCode: 400 });
  if (parsed.port && parsed.port !== "443") throw Object.assign(new Error(`${purpose}_PORT_FORBIDDEN`), { statusCode: 400 });
  const hostname = parsed.hostname.toLowerCase();
  if (["localhost", "metadata.google.internal"].includes(hostname) || hostname.endsWith(".local")) {
    throw Object.assign(new Error(`${purpose}_PRIVATE_HOST_FORBIDDEN`), { statusCode: 400 });
  }
  const allowedHosts = parseAllowedHosts(process.env[allowedHostsEnv]);
  if (process.env.NODE_ENV === "production" && allowedHosts.length === 0) {
    throw Object.assign(new Error(`${purpose}_ALLOWLIST_REQUIRED_IN_PRODUCTION`), { statusCode: 400 });
  }
  if (allowedHosts.length > 0 && !hostnameMatchesAllowed(hostname, allowedHosts)) {
    throw Object.assign(new Error(`${purpose}_HOST_NOT_ALLOWED`), { statusCode: 400 });
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(r => isPrivateIp(r.address))) {
    throw Object.assign(new Error(`${purpose}_PRIVATE_IP_FORBIDDEN`), { statusCode: 400 });
  }
  return parsed.toString();
}

function mapRow(row, mapping) {
  const get = key => row?.[mapping?.[key]] ?? row?.[key] ?? "";
  return {
    invoiceNumber: safeText(get("invoiceNumber"), 80),
    customerName: safeText(get("customerName"), 160),
    supplierTaxNumber: safeText(get("supplierTaxNumber"), 40).replace(/\D/g, ""),
    totalAmount: normalizeAmount(get("totalAmount")),
    customerPhone: normalizePhone(get("customerPhone")),
    invoiceDate: safeText(get("invoiceDate"), 20),
    dueDate: safeText(get("dueDate"), 20)
  };
}

function detectInvoiceHeaders(headers) {
  const canonical = h => safeText(h).toLowerCase().replace(/[إأآا]/g, "ا").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const find = candidates => {
    const normalized = headers.map(h => ({ raw: h, key: canonical(h) }));
    for (const c of candidates) {
      const ck = canonical(c);
      const exact = normalized.find(h => h.key === ck);
      if (exact) return exact.raw;
    }
    for (const c of candidates) {
      const ck = canonical(c);
      const partial = normalized.find(h => h.key.includes(ck) || ck.includes(h.key));
      if (partial) return partial.raw;
    }
    return "";
  };
  return {
    invoiceNumber: find(["رقم الفاتورة", "invoice number", "invoice no", "invoice", "number"]),
    customerName: find(["اسم العميل", "العميل", "customer", "customer name", "client"]),
    supplierTaxNumber: find(["الرقم الضريبي", "vat", "tax number", "supplier tax number"]),
    totalAmount: find(["المبلغ", "الاجمالي", "الإجمالي", "total", "total amount", "amount"]),
    customerPhone: find(["جوال العميل", "هاتف العميل", "واتساب", "whatsapp", "phone", "mobile"]),
    invoiceDate: find(["تاريخ الفاتورة", "invoice date", "date"]),
    dueDate: find(["تاريخ الاستحقاق", "due date", "payment due"])
  };
}

function assertAccountingImportMagic(file) {
  const buffer = file?.buffer || Buffer.alloc(0);
  if (buffer.length > MAX_ACCOUNTING_IMPORT_BYTES) {
    throw Object.assign(new Error("ACCOUNTING_IMPORT_FILE_TOO_LARGE"), { statusCode: 413 });
  }
  const name = String(file?.originalname || "").toLowerCase();
  const first4 = buffer.subarray(0, 4).toString("hex");
  const isZipXlsx = first4.startsWith("504b0304") || first4.startsWith("504b0506") || first4.startsWith("504b0708");
  const isOleXls = buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1";
  const isLikelyCsv = name.endsWith(".csv") && buffer.subarray(0, Math.min(buffer.length, 2048)).every(byte => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 128);
  if (name.endsWith(".xlsx") && !isZipXlsx) throw Object.assign(new Error("ACCOUNTING_IMPORT_MAGIC_BYTES_MISMATCH"), { statusCode: 415 });
  if (name.endsWith(".xls") && !isOleXls) throw Object.assign(new Error("ACCOUNTING_IMPORT_MAGIC_BYTES_MISMATCH"), { statusCode: 415 });
  if (name.endsWith(".csv") && !isLikelyCsv) throw Object.assign(new Error("ACCOUNTING_IMPORT_MAGIC_BYTES_MISMATCH"), { statusCode: 415 });
  if (!/\.(csv|xlsx|xls)$/i.test(name)) throw Object.assign(new Error("ACCOUNTING_IMPORT_FILE_TYPE_NOT_ALLOWED"), { statusCode: 415 });
}

function readAccountingRows(file) {
  assertAccountingImportMagic(file);
  const name = String(file.originalname || "").toLowerCase();
  let rows = [];
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true, sheetRows: MAX_ACCOUNTING_IMPORT_ROWS + 1, WTF: false });
    const sheetName = workbook.SheetNames[0];
    rows = sheetName ? XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false }).slice(0, MAX_ACCOUNTING_IMPORT_ROWS) : [];
  } else {
    const text = file.buffer.toString("utf8").replace(/^\uFEFF/, "");
    rows = parseCsvSync(text, { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: true, to: MAX_ACCOUNTING_IMPORT_ROWS });
  }
  rows = rows.map(row => Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [safeText(k, 120), typeof v === "number" || v instanceof Date ? v : safeText(v, 500)])));
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r || {})))).slice(0, 60);
  return { headers, rows };
}

async function loadWhatsappSettings(client, companyId, decryptForTenant) {
  const r = await client.query("SELECT * FROM whatsapp_business_settings WHERE company_id=$1 AND is_active=true LIMIT 1", [companyId]);
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    accessToken: row.encrypted_access_token ? decryptForTenant(companyId, row.encrypted_access_token) : "",
    appSecret: row.encrypted_app_secret ? decryptForTenant(companyId, row.encrypted_app_secret) : "",
    bspConfig: row.encrypted_bsp_config ? JSON.parse(decryptForTenant(companyId, row.encrypted_bsp_config)) : {}
  };
}

async function dispatchMetaWhatsapp({ settings, template, toPhone, invoice, companyName }) {
  if (!settings?.accessToken || !settings?.phone_number_id) throw new Error("WHATSAPP_COMPANY_META_CONFIG_MISSING");
  if (!template?.meta_template_name) throw new Error("WHATSAPP_APPROVED_TEMPLATE_REQUIRED");
  const payload = {
    messaging_product: "whatsapp",
    to: normalizePhone(toPhone),
    type: "template",
    template: {
      name: template.meta_template_name,
      language: { code: template.language || "ar" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: String(invoice.customer_name || "العميل") },
            { type: "text", text: String(companyName || "الشركة") },
            { type: "text", text: String(invoice.invoice_number || "-") },
            { type: "text", text: String(invoice.total_amount || "0") }
          ]
        }
      ]
    }
  };
  const response = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(settings.phone_number_id)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`WHATSAPP_META_SEND_FAILED_${response.status}`), { providerResponse: body });
  return { providerResponse: body, providerMessageId: body.messages?.[0]?.id || null };
}

async function processOneWhatsappMessage({ client, companyId, decryptForTenant, writeAudit }) {
  const locked = await client.query(
    `SELECT m.*, i.invoice_number, i.customer_name, i.total_amount, i.customer_phone, c.name AS company_name
     FROM whatsapp_messages m
     JOIN invoices i ON i.id=m.invoice_id AND i.company_id=m.company_id
     JOIN companies c ON c.id=m.company_id
     WHERE m.company_id=$1 AND m.status IN ('QUEUED','FAILED')
       AND m.attempts < 3 AND coalesce(m.next_attempt_at, now()) <= now()
     ORDER BY m.created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [companyId]
  );
  const msg = locked.rows[0];
  if (!msg) return null;
  const settings = await loadWhatsappSettings(client, companyId, decryptForTenant);
  if (!settings) throw new Error("WHATSAPP_BUSINESS_SETTINGS_MISSING");
  const template = await client.query(
    "SELECT * FROM whatsapp_templates WHERE company_id=$1 AND reminder_stage=$2 AND is_active=true LIMIT 1",
    [companyId, msg.reminder_stage || "FIRST"]
  );
  const tpl = template.rows[0];
  if (!tpl) throw new Error(`WHATSAPP_TEMPLATE_MISSING_${msg.reminder_stage || "FIRST"}`);
  try {
    let delivery;
    if (settings.provider === "meta") {
      delivery = await dispatchMetaWhatsapp({ settings, template: tpl, toPhone: msg.to_phone || msg.customer_phone, invoice: msg, companyName: msg.company_name });
    } else if (settings.provider === "bsp") {
      const endpoint = settings.bspConfig?.endpoint;
      const token = settings.bspConfig?.token;
      if (!endpoint || !token) throw new Error("WHATSAPP_BSP_CONFIG_MISSING");
      await assertAllowedOutboundUrl(endpoint, { allowedHostsEnv: "WHATSAPP_BSP_ALLOWED_HOSTS", purpose: "WHATSAPP_BSP_ENDPOINT" });
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: normalizePhone(msg.to_phone || msg.customer_phone), template: tpl.meta_template_name, language: tpl.language, variables: [msg.customer_name, msg.company_name, msg.invoice_number, msg.total_amount] })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(`WHATSAPP_BSP_SEND_FAILED_${response.status}`), { providerResponse: body });
      delivery = { providerResponse: body, providerMessageId: body.messageId || body.id || null };
    } else {
      throw new Error("WHATSAPP_PROVIDER_UNSUPPORTED");
    }
    const updated = await client.query(
      `UPDATE whatsapp_messages
       SET status='SENT', delivery_status='SENT', attempts=attempts+1, last_attempt_at=now(), sent_at=now(),
           provider_message_id=$3, provider_response=$4::jsonb, failed_reason=NULL
       WHERE id=$1 AND company_id=$2 RETURNING *`,
      [msg.id, companyId, delivery.providerMessageId, JSON.stringify(delivery.providerResponse || {})]
    );
    await client.query("UPDATE whatsapp_reminder_events SET status='SENT', sent_at=now() WHERE whatsapp_message_id=$1 AND company_id=$2", [msg.id, companyId]);
    await writeAudit(client, { companyId, user: { id: "whatsapp-worker" }, ip: "worker", headers: {} }, "WHATSAPP_WORKER_SENT", "whatsapp_message", msg.id, { stage: msg.reminder_stage, provider: settings.provider });
    return updated.rows[0];
  } catch (err) {
    const nextAttemptSql = "now() + ((attempts + 1) * interval '10 minutes')";
    await client.query(
      `UPDATE whatsapp_messages
       SET attempts=attempts+1, last_attempt_at=now(), next_attempt_at=${nextAttemptSql},
           status=CASE WHEN attempts + 1 >= 3 THEN 'FAILED' ELSE 'QUEUED' END,
           failed_reason=$3, provider_response=$4::jsonb
       WHERE id=$1 AND company_id=$2`,
      [msg.id, companyId, String(err.message || err).slice(0, 300), JSON.stringify(err.providerResponse || {})]
    );
    await client.query("UPDATE whatsapp_reminder_events SET status='FAILED' WHERE whatsapp_message_id=$1 AND company_id=$2", [msg.id, companyId]);
    throw err;
  }
}

function translateSummary(summary) {
  return {
    "إجمالي الفواتير": summary.total_invoices || 0,
    "الفواتير قيد المراجعة": summary.ready_for_review || 0,
    "الفواتير المعتمدة": summary.approved_invoices || 0,
    "الفواتير المدفوعة": summary.paid_invoices || 0,
    "الفواتير غير المدفوعة": summary.unpaid_approved_invoices || 0,
    "فواتير بوعد سداد": summary.promised_invoices || 0,
    "فواتير متنازع عليها": summary.disputed_invoices || 0,
    "إجمالي المبالغ (ر.س)": Number(summary.total_amount || 0),
    "المبالغ المعلقة (ر.س)": Number(summary.outstanding_amount || 0),
    "المبالغ المحصلة (ر.س)": Number(summary.paid_amount || 0),
    "معدل التحصيل (%)": Number(summary.collection_rate || 0),
    "تذكيرات واتساب": summary.sent_or_queued || 0,
    "تذاكر الدعم المفتوحة": summary.open_tickets || 0
  };
}

function translateAging(buckets) {
  return (buckets || []).map(b => ({
    "شريحة أعمار الذمم": b.bucket || "",
    "عدد الفواتير": b.count || 0,
    "المبلغ المستحق (ر.س)": Number(b.amount || 0)
  }));
}

function translateCustomers(customers) {
  return (customers || []).map(c => ({
    "اسم العميل": c.customer_name || "",
    "عدد الفواتير المعلقة": c.invoice_count || 0,
    "المبلغ الإجمالي المستحق (ر.س)": Number(c.amount || 0),
    "أقصى أيام تأخير": c.max_days_overdue || 0
  }));
}

function translateInvoices(invoices) {
  return (invoices || []).map(i => ({
    "رقم الفاتورة": i.invoice_number || "",
    "اسم العميل": i.customer_name || "",
    "المبلغ الإجمالي (ر.س)": Number(i.total_amount || 0),
    "حالة الفاتورة": i.status || "",
    "تاريخ الاستحقاق": i.due_date ? new Date(i.due_date).toISOString().split('T')[0] : "",
    "أيام التأخير": i.days_overdue || 0,
    "حالة التحصيل": i.collection_status || "",
    "تاريخ السداد الموعود": i.promised_payment_date ? new Date(i.promised_payment_date).toISOString().split('T')[0] : "",
    "سبب النزاع": i.dispute_reason || ""
  }));
}

function translateMonthly(comparison) {
  return (comparison || []).map(m => ({
    "الشهر": m.month || "",
    "عدد الفواتير": m.invoices || 0,
    "إجمالي المبالغ (ر.س)": Number(m.total_amount || 0),
    "المبالغ المحصلة (ر.س)": Number(m.paid_amount || 0)
  }));
}

function buildFinanceWorkbook(payload) {
  const wb = XLSX.utils.book_new();
  
  const summarySheet = XLSX.utils.json_to_sheet([translateSummary(payload.summary || {})]);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
  
  const agingSheet = XLSX.utils.json_to_sheet(translateAging(payload.agingBuckets || []));
  XLSX.utils.book_append_sheet(wb, agingSheet, "Aging");
  
  const customersSheet = XLSX.utils.json_to_sheet(translateCustomers(payload.topOverdueCustomers || []));
  XLSX.utils.book_append_sheet(wb, customersSheet, "Top Customers");
  
  const invoicesSheet = XLSX.utils.json_to_sheet(translateInvoices(payload.overdueInvoices || []));
  XLSX.utils.book_append_sheet(wb, invoicesSheet, "Overdue");
  
  const monthlySheet = XLSX.utils.json_to_sheet(translateMonthly(payload.monthlyComparison || []));
  XLSX.utils.book_append_sheet(wb, monthlySheet, "Monthly");
  
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function transliterateArabic(str) {
  if (!str) return "";
  const map = {
    "ال": "Al-",
    "رشيد": "Rasheed",
    "محمد": "Mohamed",
    "احمد": "Ahmed",
    "أحمد": "Ahmed",
    "علي": "Ali",
    "عبدالله": "Abdullah",
    "خالد": "Khaled",
    "سعد": "Saad",
    "سعود": "Saud",
    "سند": "Sanad",
    "ذكي": "Thaki",
    "شركة": "Co.",
    "مؤسسة": "Est.",
    "للتجارة": "Trading",
    "العامة": "General",
    "المحدودة": "Ltd."
  };
  let result = String(str);
  for (const [ar, en] of Object.entries(map)) {
    result = result.split(ar).join(en);
  }
  return result.replace(/[^\x00-\x7F]/g, "").trim() || "Client Row";
}

function generateProfessionalReportPdf(payload) {
  const cmds = [];
  
  const cTeal = "0.05 0.5 0.45"; 
  const cEmerald = "0.1 0.6 0.3"; 
  const cDark = "0.15 0.15 0.15"; 
  const cLight = "0.96 0.96 0.96"; 
  const cBorder = "0.85 0.85 0.85"; 
  const cWhite = "1 1 1";
  
  // 1. Header Banner
  cmds.push(`${cTeal} rg 40 730 515 80 re f`);
  cmds.push(`${cEmerald} rg 40 805 515 5 re f`);
  
  // Banner Text
  cmds.push(`BT /F2 16 Tf ${cWhite} rg 55 775 Td (SANAD THAKI - CFO FINANCIAL STRATEGIC REPORT) Tj ET`);
  cmds.push(`BT /F1 9 Tf ${cWhite} rg 55 750 Td (Smart Debt Collection & Customer Invoice Follow-up Executive Summary) Tj ET`);
  
  // Report Meta info
  const dateStr = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
  cmds.push(`BT /F1 8 Tf 0.5 0.5 0.5 rg 40 710 Td (Report generated on: ${dateStr} | Platform: Sanad Thaki Enterprise) Tj ET`);
  
  cmds.push(`0.8 RG 0.5 w 40 700 m 555 700 l S`);
  
  // 2. KPI Summary Section (4 Cards)
  const cardW = 118;
  const cardH = 55;
  const cardY = 630;
  const cardX = [40, 172, 304, 436];
  
  const summary = payload.summary || {};
  const cards = [
    { title: "TOTAL INVOICES", val: String(summary.totalInvoices || 0), desc: "Registered count", col: cDark },
    { title: "PAID AMOUNT", val: `${Number(summary.paidAmount || 0).toLocaleString()} SAR`, desc: "Collected funds", col: cEmerald },
    { title: "OUTSTANDING", val: `${Number(summary.outstandingAmount || 0).toLocaleString()} SAR`, desc: "Pending collections", col: "0.8 0.2 0.2" },
    { title: "COLLECTION RATE", val: `${summary.collectionRate || 0}%`, desc: "Strategic efficiency", col: cTeal }
  ];
  
  for (let i = 0; i < 4; i++) {
    const card = cards[i];
    const x = cardX[i];
    
    cmds.push(`${cLight} rg ${x} ${cardY} ${cardW} ${cardH} re f`);
    cmds.push(`${cBorder} RG 0.75 w ${x} ${cardY} ${cardW} ${cardH} re s`);
    
    cmds.push(`BT /F2 7 Tf 0.4 0.4 0.4 rg ${x+8} ${cardY+42} Td (${card.title}) Tj ET`);
    cmds.push(`BT /F2 11 Tf ${card.col} rg ${x+8} ${cardY+24} Td (${card.val}) Tj ET`);
    cmds.push(`BT /F1 6 Tf 0.5 0.5 0.5 rg ${x+8} ${cardY+10} Td (${card.desc}) Tj ET`);
  }
  
  // 3. Detailed Overdue Invoices Section
  cmds.push(`BT /F2 11 Tf ${cTeal} rg 40 595 Td (STRATEGIC RECEIVABLES & OVERDUE INVOICES) Tj ET`);
  cmds.push(`BT /F1 7.5 Tf 0.4 0.4 0.4 rg 40 580 Td (Listing of critical invoices requiring immediate CFO collection action and customer reminders) Tj ET`);
  
  // Table Header Row
  const tableY = 550;
  cmds.push(`${cTeal} rg 40 ${tableY} 515 20 re f`);
  cmds.push(`BT /F2 8 Tf ${cWhite} rg 50 ${tableY+6} Td (INVOICE #) Tj ET`);
  cmds.push(`BT /F2 8 Tf ${cWhite} rg 150 ${tableY+6} Td (CUSTOMER / CLIENT) Tj ET`);
  cmds.push(`BT /F2 8 Tf ${cWhite} rg 310 ${tableY+6} Td (AMOUNT (SAR)) Tj ET`);
  cmds.push(`BT /F2 8 Tf ${cWhite} rg 400 ${tableY+6} Td (DUE DATE) Tj ET`);
  cmds.push(`BT /F2 8 Tf ${cWhite} rg 480 ${tableY+6} Td (STATUS) Tj ET`);
  
  const invoices = payload.overdueInvoices || [];
  const maxRows = Math.min(invoices.length, 18);
  
  for (let idx = 0; idx < maxRows; idx++) {
    const inv = invoices[idx];
    const y = tableY - 20 - idx * 20;
    
    if (idx % 2 === 1) {
      cmds.push(`${cLight} rg 40 ${y} 515 20 re f`);
    }
    cmds.push(`${cBorder} RG 0.5 w 40 ${y} m 555 ${y} l S`);
    
    const invNum = String(inv.invoice_number || inv.invoiceNumber || "—");
    const clientName = transliterateArabic(inv.customer_name || inv.customerName || "—");
    const amount = Number(inv.total_amount || inv.totalAmount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
    const dueDate = inv.due_date || inv.dueDate || "—";
    
    const rawStatus = String(inv.status || "").toUpperCase();
    const statusText = rawStatus === "NEEDS_REVIEW" ? "Pending Review" 
                     : rawStatus === "DRAFT" ? "Draft" 
                     : rawStatus === "APPROVED" ? "Approved" 
                     : rawStatus === "PAID" ? "Paid" 
                     : rawStatus || "—";
                     
    const statusCol = rawStatus === "PAID" ? cEmerald 
                    : rawStatus === "APPROVED" ? cTeal 
                    : rawStatus === "NEEDS_REVIEW" ? "0.8 0.5 0.1" 
                    : "0.4 0.4 0.4";
    
    cmds.push(`BT /F1 8 Tf ${cDark} rg 50 ${y+6} Td (${invNum}) Tj ET`);
    cmds.push(`BT /F1 8 Tf ${cDark} rg 150 ${y+6} Td (${clientName}) Tj ET`);
    cmds.push(`BT /F2 8 Tf ${cDark} rg 310 ${y+6} Td (${amount}) Tj ET`);
    cmds.push(`BT /F1 8 Tf ${cDark} rg 400 ${y+6} Td (${dueDate}) Tj ET`);
    cmds.push(`BT /F2 8 Tf ${statusCol} rg 480 ${y+6} Td (${statusText}) Tj ET`);
  }
  
  if (invoices.length === 0) {
    cmds.push(`BT /F1 9 Tf 0.5 0.5 0.5 rg 200 ${tableY - 30} Td (No outstanding or overdue invoices recorded.) Tj ET`);
  }
  
  cmds.push(`0.8 RG 0.5 w 40 40 m 555 40 l S`);
  cmds.push(`BT /F1 7 Tf 0.5 0.5 0.5 rg 40 28 Td (Sanad Thaki AI Platform - Strategic Receivables Control | Page 1 of 1 | Confidential) Tj ET`);
  
  const content = cmds.join("\r\n");
  const stream = Buffer.from(content, "ascii");
  
  const objects = [
    Buffer.from("1 0 obj\r\n<< /Type /Catalog /Pages 2 0 R >>\r\nendobj\r\n", "ascii"),
    Buffer.from("2 0 obj\r\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\r\nendobj\r\n", "ascii"),
    Buffer.from("3 0 obj\r\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>\r\nendobj\r\n", "ascii"),
    Buffer.from("4 0 obj\r\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\r\nendobj\r\n", "ascii"),
    Buffer.concat([
      Buffer.from(`5 0 obj\r\n<< /Length ${stream.length} >>\r\nstream\r\n`, "ascii"),
      stream,
      Buffer.from("\r\nendstream\r\nendobj\r\n", "ascii")
    ]),
    Buffer.from("6 0 obj\r\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\r\nendobj\r\n", "ascii"),
  ];

  const chunks = [Buffer.from("%PDF-1.4\r\n", "ascii")];
  const offsets = [0];
  
  let currentOffset = chunks[0].length;
  for (const obj of objects) {
    offsets.push(currentOffset);
    chunks.push(obj);
    currentOffset += obj.length;
  }
  
  const xrefOffset = currentOffset;
  
  let xrefStr = `xref\r\n0 ${objects.length + 1}\r\n`;
  xrefStr += "0000000000 65535 f\r\n";
  for (let i = 1; i < offsets.length; i++) {
    xrefStr += String(offsets[i]).padStart(10, "0") + " 00000 n\r\n";
  }
  
  const trailerStr = `trailer\r\n<< /Size ${objects.length + 1} /Root 1 0 R >>\r\nstartxref\r\n${xrefOffset}\r\n%%EOF\r\n`;
  
  chunks.push(Buffer.from(xrefStr, "ascii"));
  chunks.push(Buffer.from(trailerStr, "ascii"));
  
  return Buffer.concat(chunks);
}

function minimalPdfBuffer(title, lines) {
  return generateProfessionalReportPdf({
    summary: {
      totalInvoices: lines.length > 0 ? parseInt(String(lines[0] || "").replace(/[^0-9]/g, '')) || 0 : 0,
      outstandingAmount: lines.length > 1 ? parseFloat(String(lines[1] || "").replace(/[^0-9.]/g, '')) || 0 : 0,
      paidAmount: lines.length > 2 ? parseFloat(String(lines[2] || "").replace(/[^0-9.]/g, '')) || 0 : 0,
      collectionRate: lines.length > 3 ? parseFloat(String(lines[3] || "").replace(/[^0-9.]/g, '')) || 0 : 0
    },
    overdueInvoices: []
  });
}

async function financeReportPayload(client, companyId, query = {}) {
  const where = ["company_id=$1"];
  const params = [companyId];
  const add = (sql, value) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };
  const dateFrom = query.dateFrom || query.startDate;
  const dateTo = query.dateTo || query.endDate;
  if (dateFrom) add("created_at >= ?::timestamptz", dateFrom);
  if (dateTo) add("created_at < (?::date + interval '1 day')", dateTo);
  if (query.customer) add("customer_name ILIKE '%' || ? || '%'", query.customer);
  if (query.minAmount) add("total_amount >= ?::numeric", query.minAmount);
  if (query.maxAmount) add("total_amount <= ?::numeric", query.maxAmount);
  const whereSql = where.join(" AND ");
  const summary = await client.query(`
    SELECT count(*)::int AS total_invoices,
      count(*) FILTER (WHERE status='READY_FOR_REVIEW')::int AS ready_for_review,
      count(*) FILTER (WHERE status IN ('APPROVED','PAID'))::int AS approved_invoices,
      count(*) FILTER (WHERE status='PAID')::int AS paid_invoices,
      count(*) FILTER (WHERE status='APPROVED')::int AS unpaid_approved_invoices,
      count(*) FILTER (WHERE collection_status='PROMISED')::int AS promised_invoices,
      count(*) FILTER (WHERE collection_status='DISPUTED')::int AS disputed_invoices,
      coalesce(sum(total_amount),0)::numeric AS total_amount,
      coalesce(sum(total_amount) FILTER (WHERE status='APPROVED'),0)::numeric AS outstanding_amount,
      coalesce(sum(total_amount) FILTER (WHERE status='PAID'),0)::numeric AS paid_amount,
      CASE WHEN coalesce(sum(total_amount) FILTER (WHERE status IN ('APPROVED','PAID')),0)=0 THEN 0
        ELSE round((coalesce(sum(total_amount) FILTER (WHERE status='PAID'),0) / coalesce(sum(total_amount) FILTER (WHERE status IN ('APPROVED','PAID')),0)) * 100, 2) END AS collection_rate
    FROM invoices WHERE ${whereSql}`, params);
  const aging = await client.query(`
    SELECT bucket, count(*)::int AS count, coalesce(sum(total_amount),0)::numeric AS amount FROM (
      SELECT total_amount,
        CASE WHEN now()::date - coalesce(due_date, approved_at::date, created_at::date) <= 30 THEN '0-30'
             WHEN now()::date - coalesce(due_date, approved_at::date, created_at::date) <= 60 THEN '31-60'
             WHEN now()::date - coalesce(due_date, approved_at::date, created_at::date) <= 90 THEN '61-90'
             ELSE '90+' END AS bucket
      FROM invoices WHERE ${whereSql} AND status='APPROVED'
    ) x GROUP BY bucket ORDER BY bucket`, params);
  const top = await client.query(`SELECT customer_name, count(*)::int AS invoice_count, coalesce(sum(total_amount),0)::numeric AS amount, max(now()::date - coalesce(due_date, approved_at::date, created_at::date))::int AS max_days_overdue FROM invoices WHERE ${whereSql} AND status='APPROVED' GROUP BY customer_name ORDER BY amount DESC LIMIT 10`, params);
  const overdue = await client.query(`SELECT id, invoice_number, customer_name, total_amount, status, due_date, collection_status, promised_payment_date, dispute_reason, (now()::date - coalesce(due_date, approved_at::date, created_at::date))::int AS days_overdue FROM invoices WHERE ${whereSql} AND status='APPROVED' ORDER BY days_overdue DESC NULLS LAST, total_amount DESC LIMIT 100`, params);
  const monthly = await client.query(`SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS month, count(*)::int AS invoices, coalesce(sum(total_amount),0)::numeric AS total_amount, coalesce(sum(total_amount) FILTER (WHERE status='PAID'),0)::numeric AS paid_amount FROM invoices WHERE ${whereSql} GROUP BY 1 ORDER BY 1 DESC LIMIT 12`, params);
  const whatsapp = await client.query("SELECT count(*)::int AS sent_or_queued FROM whatsapp_messages WHERE company_id=$1", [companyId]);
  const tickets = await client.query("SELECT count(*)::int AS open_tickets FROM support_tickets WHERE company_id=$1 AND status='OPEN'", [companyId]);
  
  const baseSummary = { ...summary.rows[0], ...whatsapp.rows[0], ...tickets.rows[0] };
  
  const summaryMapped = {
    ...baseSummary,
    totalInvoices: Number(baseSummary.total_invoices || 0),
    readyForReview: Number(baseSummary.ready_for_review || 0),
    approved: Number(baseSummary.approved_invoices || 0),
    paid: Number(baseSummary.paid_invoices || 0),
    outstandingAmount: Number(baseSummary.outstanding_amount || 0),
    paidAmount: Number(baseSummary.paid_amount || 0),
    collectionRate: Number(baseSummary.collection_rate || 0)
  };

  const agingData = {
    '0_30': { count: 0, amount: 0 },
    '31_60': { count: 0, amount: 0 },
    '61_90': { count: 0, amount: 0 },
    '90_plus': { count: 0, amount: 0 }
  };
  aging.rows.forEach(r => {
    const key = r.bucket === '90+' ? '90_plus' : r.bucket.replace('-', '_');
    if (agingData[key]) {
      agingData[key] = { count: Number(r.count), amount: Number(r.amount) };
    }
  });

  const topMapped = top.rows.map(c => ({
    customerName: c.customer_name || "",
    invoiceCount: Number(c.invoice_count || 0),
    totalAmount: Number(c.amount || 0),
    overdueAmount: Number(c.amount || 0),
    maxDaysOverdue: Number(c.max_days_overdue || 0)
  }));

  const monthlyMapped = monthly.rows.map(m => ({
    month: m.month || "",
    invoicesCreated: Number(m.invoices || 0),
    totalAmount: Number(m.total_amount || 0),
    paidAmount: Number(m.paid_amount || 0)
  }));

  return {
    summary: summaryMapped,
    aging: agingData,
    agingBuckets: aging.rows,
    topOverdueCustomers: topMapped,
    overdueInvoices: overdue.rows,
    monthlyComparison: monthlyMapped
  };
}

function installCommercialValueFeatures(app, deps) {
  const {
    authRequired, blockClientCompanyId, requirePermission, Permissions, withTenant, withPlatformScope,
    writeAudit, writeSecurityAuditTrail, recordTenantUsage, buildTenantEncryptedInvoicePayload,
    getTenantEncryptionVersion, encryptForTenant, decryptForTenant, acquireRedisLock, releaseRedisLock,
    accountingImportLimiter, whatsappQuotaGuard
  } = deps;

  const accountingUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ACCOUNTING_IMPORT_BYTES, files: 1, fields: 10 },
    fileFilter(_req, file, cb) {
      const name = String(file.originalname || "").toLowerCase();
      if (!/\.(csv|xlsx|xls)$/i.test(name)) return cb(Object.assign(new Error("ACCOUNTING_IMPORT_FILE_TYPE_NOT_ALLOWED"), { statusCode: 415 }));
      cb(null, true);
    }
  });

  app.get("/whatsapp/settings", authRequired, requirePermission(Permissions.COMPANY_SETTINGS_MANAGE), async (req, res) => {
    const data = await withTenant(req.companyId, async client => {
      const s = await client.query("SELECT provider, phone_number_id, business_account_id, display_name, bsp_name, is_active, updated_at FROM whatsapp_business_settings WHERE company_id=$1 LIMIT 1", [req.companyId]);
      const t = await client.query("SELECT id, reminder_stage, meta_template_name, language, category, body_preview, meta_status, is_active FROM whatsapp_templates WHERE company_id=$1 ORDER BY reminder_stage", [req.companyId]);
      return { settings: s.rows[0] || null, templates: t.rows };
    });
    res.json(data);
  });

  app.put("/whatsapp/settings", authRequired, blockClientCompanyId, requirePermission(Permissions.COMPANY_SETTINGS_MANAGE), async (req, res) => {
    const schema = z.object({ provider: z.enum(["meta", "bsp"]), phoneNumberId: z.string().min(3).max(120), businessAccountId: z.string().max(120).optional().default(""), displayName: z.string().min(2).max(120), accessToken: z.string().min(20).optional().or(z.literal("")), appSecret: z.string().min(10).optional().or(z.literal("")), bspName: z.string().max(80).optional().default(""), bspEndpoint: z.string().url().optional().or(z.literal("")), bspToken: z.string().min(10).optional().or(z.literal("")) });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "إعدادات واتساب غير صحيحة", details: parsed.error.issues });
    const d = parsed.data;
    if (d.provider === "bsp" && d.bspEndpoint) {
      try { await assertAllowedOutboundUrl(d.bspEndpoint, { allowedHostsEnv: "WHATSAPP_BSP_ALLOWED_HOSTS", purpose: "WHATSAPP_BSP_ENDPOINT" }); }
      catch (err) { return res.status(err.statusCode || 400).json({ error: err.message }); }
    }
    const result = await withTenant(req.companyId, async client => {
      const current = await client.query("SELECT encrypted_access_token, encrypted_app_secret, encrypted_bsp_config FROM whatsapp_business_settings WHERE company_id=$1", [req.companyId]);
      const currentRow = current.rows[0] || {};
      const hasExistingAccessToken = Boolean(currentRow.encrypted_access_token);
      const hasExistingAppSecret = Boolean(currentRow.encrypted_app_secret);
      const hasExistingBspConfig = Boolean(currentRow.encrypted_bsp_config);
      if (d.provider === "meta" && (!d.accessToken && !hasExistingAccessToken)) return { error: "WHATSAPP_META_ACCESS_TOKEN_REQUIRED" };
      if (d.provider === "meta" && process.env.NODE_ENV === "production" && (!d.appSecret && !hasExistingAppSecret)) return { error: "WHATSAPP_META_APP_SECRET_REQUIRED" };
      if (d.provider === "bsp" && ((!d.bspEndpoint || !d.bspToken) && !hasExistingBspConfig)) return { error: "WHATSAPP_BSP_CONFIG_REQUIRED" };
      const encryptedAccessToken = d.accessToken ? encryptForTenant(req.companyId, d.accessToken) : currentRow.encrypted_access_token || "";
      const encryptedAppSecret = d.appSecret ? encryptForTenant(req.companyId, d.appSecret) : currentRow.encrypted_app_secret || "";
      const encryptedBspConfig = (d.bspEndpoint || d.bspToken) ? encryptForTenant(req.companyId, JSON.stringify({ endpoint: d.bspEndpoint, token: d.bspToken })) : currentRow.encrypted_bsp_config || "";
      const row = await client.query(
        `INSERT INTO whatsapp_business_settings (company_id, provider, phone_number_id, business_account_id, display_name, encrypted_access_token, encrypted_app_secret, bsp_name, encrypted_bsp_config, is_active, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,now())
         ON CONFLICT (company_id) DO UPDATE SET provider=EXCLUDED.provider, phone_number_id=EXCLUDED.phone_number_id, business_account_id=EXCLUDED.business_account_id, display_name=EXCLUDED.display_name, encrypted_access_token=EXCLUDED.encrypted_access_token, encrypted_app_secret=EXCLUDED.encrypted_app_secret, bsp_name=EXCLUDED.bsp_name, encrypted_bsp_config=EXCLUDED.encrypted_bsp_config, is_active=true, updated_by=EXCLUDED.updated_by, updated_at=now()
         RETURNING provider, phone_number_id, business_account_id, display_name, bsp_name, is_active, updated_at`,
        [req.companyId, d.provider, d.phoneNumberId, d.businessAccountId || null, d.displayName, encryptedAccessToken, encryptedAppSecret, d.bspName || null, encryptedBspConfig, req.user.id]
      );
      await writeAudit(client, req, "UPDATE_WHATSAPP_BUSINESS_SETTINGS", "whatsapp_business_settings", req.companyId, { provider: d.provider, phoneNumberId: d.phoneNumberId });
      return row.rows[0];
    });
    if (result?.error === "WHATSAPP_META_ACCESS_TOKEN_REQUIRED") return res.status(400).json({ error: "توكن Meta مطلوب لإعداد واتساب للشركة." });
    if (result?.error === "WHATSAPP_META_APP_SECRET_REQUIRED") return res.status(400).json({ error: "App Secret إلزامي في الإنتاج للتحقق من Webhook واتساب." });
    if (result?.error === "WHATSAPP_BSP_CONFIG_REQUIRED") return res.status(400).json({ error: "إعدادات BSP endpoint/token مطلوبة لمزود BSP." });
    await withPlatformScope(client => client.query(`INSERT INTO whatsapp_phone_directory (phone_number_id, company_id, provider, is_active) VALUES ($1,$2,$3,true) ON CONFLICT (phone_number_id) DO UPDATE SET company_id=$2, provider=$3, is_active=true, updated_at=now()`, [d.phoneNumberId, req.companyId, d.provider])).catch(err => console.error("WhatsApp directory sync warning:", err.message));
    res.json({ settings: result, message: "تم حفظ إعدادات واتساب Business للشركة." });
  });

  app.put("/whatsapp/templates", authRequired, blockClientCompanyId, requirePermission(Permissions.COMPANY_SETTINGS_MANAGE), async (req, res) => {
    const schema = z.object({ templates: z.array(z.object({ reminderStage: z.enum(REMINDER_STAGES), metaTemplateName: z.string().min(2).max(120), language: z.string().min(2).max(12).default("ar"), category: z.string().max(60).default("UTILITY"), bodyPreview: z.string().min(5).max(1000), metaStatus: z.enum(["PENDING", "REJECTED"]).default("PENDING"), isActive: z.boolean().default(true) })).min(1).max(3) });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "قوالب واتساب غير صحيحة", details: parsed.error.issues });
    const rows = await withTenant(req.companyId, async client => {
      const out = [];
      for (const tpl of parsed.data.templates) {
        const row = await client.query(`INSERT INTO whatsapp_templates (company_id, reminder_stage, meta_template_name, language, category, body_preview, meta_status, is_active, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT (company_id, reminder_stage) DO UPDATE SET meta_template_name=EXCLUDED.meta_template_name, language=EXCLUDED.language, category=EXCLUDED.category, body_preview=EXCLUDED.body_preview, meta_status=EXCLUDED.meta_status, is_active=EXCLUDED.is_active, updated_by=EXCLUDED.updated_by, updated_at=now() RETURNING id, reminder_stage, meta_template_name, language, category, body_preview, meta_status, is_active`, [req.companyId, tpl.reminderStage, tpl.metaTemplateName, tpl.language, tpl.category, tpl.bodyPreview, "PENDING", tpl.isActive, req.user.id]);
        out.push(row.rows[0]);
      }
      await writeAudit(client, req, "UPSERT_WHATSAPP_TEMPLATES", "whatsapp_template", null, { count: out.length });
      return out;
    });
    res.json({ templates: rows });
  });

  app.patch("/platform/companies/:companyId/whatsapp/templates/:templateId/status", authRequired, requirePermission(Permissions.PLATFORM_SECURITY_MANAGE), async (req, res) => {
    const schema = z.object({ metaStatus: z.enum(["APPROVED", "REJECTED"]), reason: z.string().max(500).optional().default("") });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "حالة القالب غير صحيحة", details: parsed.error.issues });
    const row = await withTenant(req.params.companyId, async client => {
      const r = await client.query(
        `UPDATE whatsapp_templates
         SET meta_status=$4, approval_reviewed_by=$5, approval_reviewed_at=now(), approval_note=$6, updated_at=now()
         WHERE company_id=$1 AND id=$2 RETURNING id, reminder_stage, meta_template_name, language, meta_status, is_active`,
        [req.params.companyId, req.params.templateId, null, parsed.data.metaStatus, req.user.id, parsed.data.reason || ""]
      );
      if (!r.rowCount) return null;
      await writeAudit(client, req, "PLATFORM_REVIEW_WHATSAPP_TEMPLATE", "whatsapp_template", req.params.templateId, { companyId: req.params.companyId, metaStatus: parsed.data.metaStatus });
      return r.rows[0];
    });
    if (!row) return res.status(404).json({ error: "القالب غير موجود داخل الشركة" });
    res.json({ template: row });
  });

  app.post("/invoices/:id/whatsapp/send", authRequired, requirePermission(Permissions.WHATSAPP_SEND_APPROVED), whatsappQuotaGuard, async (req, res) => {
    const schema = z.object({ reminderStage: z.enum(REMINDER_STAGES).default("FIRST") });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "مرحلة التذكير غير صحيحة", details: parsed.error.issues });
    const result = await withTenant(req.companyId, async client => {
      const inv = await client.query("SELECT id, invoice_number, customer_name, customer_phone, total_amount, status, supplier_tax_number FROM invoices WHERE id=$1 AND company_id=$2", [req.params.id, req.companyId]);
      const invoice = inv.rows[0];
      if (!invoice) return { error: "NOT_FOUND" };
      if (invoice.status !== "APPROVED") return { error: "NOT_APPROVED" };
      
      // Enforce field completeness validations
      if (!invoice.invoice_number || invoice.invoice_number.trim() === "") return { error: "MISSING_INVOICE_NUMBER" };
      if (!invoice.customer_name || invoice.customer_name.trim() === "") return { error: "MISSING_CUSTOMER_NAME" };
      if (!invoice.supplier_tax_number || invoice.supplier_tax_number.trim() === "") return { error: "MISSING_SUPPLIER_TAX_NUMBER" };
      if (!invoice.total_amount || Number(invoice.total_amount) <= 0) return { error: "INVALID_TOTAL_AMOUNT" };
      if (!normalizePhone(invoice.customer_phone)) return { error: "MISSING_CUSTOMER_PHONE" };

      const s = await client.query("SELECT provider FROM whatsapp_business_settings WHERE company_id=$1 AND is_active=true", [req.companyId]);
      if (!s.rowCount) return { error: "MISSING_SETTINGS" };
      const provider = s.rows[0].provider || "meta";
      const t = await client.query("SELECT * FROM whatsapp_templates WHERE company_id=$1 AND reminder_stage=$2 AND meta_status='APPROVED' AND is_active=true", [req.companyId, parsed.data.reminderStage]);
      if (!t.rowCount) return { error: "MISSING_TEMPLATE" };
      const duplicate = await client.query("SELECT id FROM whatsapp_reminder_events WHERE company_id=$1 AND invoice_id=$2 AND reminder_stage=$3 AND status IN ('QUEUED','SENT','DELIVERED','READ') LIMIT 1", [req.companyId, req.params.id, parsed.data.reminderStage]);
      if (duplicate.rowCount) return { error: "DUPLICATE_STAGE" };
      
      const message = t.rows[0].body_preview;
      const customerId = invoice.customer_phone ? "cust_" + invoice.customer_phone.replace(/[^0-9]/g, "") : "cust_" + Buffer.from(invoice.customer_name).toString("hex").slice(0, 10);
      const reminderAttemptNumber = parsed.data.reminderStage === "FIRST" ? 1 : parsed.data.reminderStage === "SECOND" ? 2 : 3;

      // Insert with all required snapshot fields
      const wa = await client.query(`
        INSERT INTO whatsapp_messages (
          company_id, invoice_id, sent_by, message, status, mode, to_phone, reminder_stage, provider, delivery_status, next_attempt_at,
          invoice_number, customer_id, customer_name, customer_phone, total_amount, sender_user_id, reminder_attempt_number, message_content
        ) VALUES ($1,$2,$3,$4,'QUEUED','company-whatsapp',$5,$6,$7,'QUEUED',now(),$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING *
      `, [
        req.companyId, req.params.id, req.user.id, message, normalizePhone(invoice.customer_phone), parsed.data.reminderStage, provider,
        invoice.invoice_number, customerId, invoice.customer_name, normalizePhone(invoice.customer_phone), invoice.total_amount, req.user.id, reminderAttemptNumber, message
      ]);

      await client.query("INSERT INTO whatsapp_reminder_events (company_id, invoice_id, whatsapp_message_id, reminder_stage, status, requested_by) VALUES ($1,$2,$3,$4,'QUEUED',$5)", [req.companyId, req.params.id, wa.rows[0].id, parsed.data.reminderStage, req.user.id]);
      await recordTenantUsage(client, req.companyId, "whatsapp_message_queued", 1, { invoiceId: req.params.id, stage: parsed.data.reminderStage });
      await writeAudit(client, req, "QUEUE_WHATSAPP_REMINDER", "invoice", req.params.id, { stage: parsed.data.reminderStage });
      await writeSecurityAuditTrail(client, req, "WHATSAPP_REMINDER_QUEUED", "invoice", req.params.id, { whatsappMessageId: wa.rows[0].id, stage: parsed.data.reminderStage });
      return { ok: true, queued: wa.rows[0] };
    });
    if (result.error === "NOT_FOUND") return res.status(404).json({ error: "الفاتورة غير موجودة" });
    if (result.error === "NOT_APPROVED") return res.status(403).json({ error: "لا يمكن إرسال واتساب قبل اعتماد المدير المالي" });
    if (result.error === "MISSING_INVOICE_NUMBER") return res.status(400).json({ error: "رقم الفاتورة غير مكتمل. حدّث بيانات الفاتورة أولًا." });
    if (result.error === "MISSING_CUSTOMER_NAME") return res.status(400).json({ error: "اسم العميل غير مكتمل. حدّث بيانات الفاتورة أولًا." });
    if (result.error === "MISSING_SUPPLIER_TAX_NUMBER") return res.status(400).json({ error: "الرقم الضريبي للمورد غير مكتمل. حدّث بيانات الفاتورة أولًا." });
    if (result.error === "INVALID_TOTAL_AMOUNT") return res.status(400).json({ error: "مبلغ الفاتورة يجب أن يكون أكبر من الصفر." });
    if (result.error === "MISSING_CUSTOMER_PHONE") return res.status(400).json({ error: "لا يوجد رقم واتساب محفوظ للعميل في الفاتورة. حدّث بيانات الفاتورة أولًا." });
    if (result.error === "MISSING_SETTINGS") return res.status(400).json({ error: "إعدادات WhatsApp Business لهذه الشركة غير مكتملة." });
    if (result.error === "MISSING_TEMPLATE") return res.status(400).json({ error: "لا يوجد قالب Meta معتمد لهذه المرحلة." });
    if (result.error === "DUPLICATE_STAGE") return res.status(409).json({ error: "تمت جدولة أو إرسال هذه المرحلة سابقًا لهذه الفاتورة." });
    res.status(202).json(result);
  });

  app.get("/whatsapp/messages", authRequired, requirePermission(Permissions.WHATSAPP_SEND_APPROVED), async (req, res) => {
    const result = await withTenant(req.companyId, client => client.query("SELECT * FROM whatsapp_messages WHERE company_id=$1 ORDER BY created_at DESC LIMIT 150", [req.companyId]));
    res.json({ messages: result.rows });
  });

  app.get("/integrations/whatsapp/meta/webhook", (req, res) => {
    const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "";
    if (req.query["hub.mode"] === "subscribe" && token && req.query["hub.verify_token"] === token) return res.status(200).send(req.query["hub.challenge"] || "");
    return res.status(403).send("Forbidden");
  });

  app.post("/integrations/whatsapp/meta/webhook", async (req, res) => {
    try {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const directory = await withPlatformScope(client => client.query("SELECT company_id FROM whatsapp_phone_directory WHERE phone_number_id=$1 AND is_active=true", [phoneNumberId])).catch(() => ({ rows: [] }));
        const companyId = directory.rows[0]?.company_id;
        if (!companyId) continue;
        await withTenant(companyId, async client => {
          const settings = await loadWhatsappSettings(client, companyId, decryptForTenant);
          if (!settings || settings.provider !== "meta") throw Object.assign(new Error("WHATSAPP_WEBHOOK_META_SETTINGS_REQUIRED"), { statusCode: 401 });
          if (!settings.appSecret) throw Object.assign(new Error("WHATSAPP_WEBHOOK_APP_SECRET_REQUIRED"), { statusCode: 401 });
          if (!req.rawBody) throw Object.assign(new Error("WHATSAPP_WEBHOOK_RAW_BODY_REQUIRED"), { statusCode: 401 });
          const expected = hmacBody(settings.appSecret, req.rawBody);
          const actual = req.header("x-hub-signature-256") || "";
          if (!safeCompare(expected, actual)) throw Object.assign(new Error("WHATSAPP_WEBHOOK_SIGNATURE_INVALID"), { statusCode: 401 });
          for (const st of (change.value?.statuses || [])) {
            const mapped = String(st.status || "").toUpperCase();
            const deliveryStatus = mapped === "DELIVERED" ? "DELIVERED" : mapped === "READ" ? "READ" : mapped === "FAILED" ? "FAILED" : "SENT";
            await client.query(`UPDATE whatsapp_messages SET delivery_status=$3, status=CASE WHEN $3='FAILED' THEN 'FAILED' ELSE 'SENT' END, delivered_at=CASE WHEN $3='DELIVERED' THEN to_timestamp($4::bigint) ELSE delivered_at END, read_at=CASE WHEN $3='READ' THEN to_timestamp($4::bigint) ELSE read_at END, failed_reason=CASE WHEN $3='FAILED' THEN $5 ELSE failed_reason END, provider_response=coalesce(provider_response,'{}'::jsonb) || $6::jsonb WHERE company_id=$1 AND provider_message_id=$2`, [companyId, st.id, deliveryStatus, st.timestamp || Math.floor(Date.now() / 1000), st.errors?.[0]?.title || null, JSON.stringify({ webhookStatus: st })]);
            await client.query("UPDATE whatsapp_reminder_events SET status=$3 WHERE company_id=$1 AND whatsapp_message_id IN (SELECT id FROM whatsapp_messages WHERE company_id=$1 AND provider_message_id=$2)", [companyId, st.id, deliveryStatus]);
          }
        });
      }
    }
    res.json({ ok: true });
    } catch (err) {
      const status = Number(err.statusCode || 401);
      console.warn("WhatsApp webhook rejected:", redactSecrets(err.message));
      return res.status(status >= 400 && status < 500 ? status : 401).json({ error: "WHATSAPP_WEBHOOK_REJECTED" });
    }
  });

  app.get("/integrations/accounting/connectors", authRequired, requirePermission(Permissions.INTEGRATIONS_MANAGE), (req, res) => {
    res.json({ connectors: [
      { system: "qoyod", label: "قيود", status: "configured-via-api-csv", required: ["API key أو ملف Excel/CSV", "mapping"] },
      { system: "daftara", label: "دفترة", status: "configured-via-api-csv", required: ["API key أو ملف Excel/CSV", "mapping"] },
      { system: "odoo", label: "Odoo", status: "configured-via-api-csv", required: ["baseUrl", "API token أو CSV export", "mapping"] },
      { system: "zoho", label: "Zoho", status: "configured-via-api-csv", required: ["OAuth/API export أو CSV", "mapping"] },
      { system: "generic", label: "نظام آخر", status: "supported", required: ["Excel/CSV/API"] }
    ]});
  });

  app.get("/integrations/accounting/mapping", authRequired, requirePermission(Permissions.INTEGRATIONS_MANAGE), async (req, res) => {
    const systemName = ACCOUNTING_SYSTEMS.includes(req.query.system) ? req.query.system : "generic";
    const r = await withTenant(req.companyId, client => client.query("SELECT system_name, mapping, notes, updated_at FROM accounting_import_mappings WHERE company_id=$1 AND system_name=$2", [req.companyId, systemName]));
    res.json({ mapping: r.rows[0] || { system_name: systemName, mapping: {}, notes: "" } });
  });

  app.put("/integrations/accounting/mapping", authRequired, blockClientCompanyId, requirePermission(Permissions.INTEGRATIONS_MANAGE), async (req, res) => {
    const schema = z.object({ systemName: z.enum(ACCOUNTING_SYSTEMS).default("generic"), mapping: z.object({ invoiceNumber: z.string().min(1), customerName: z.string().min(1), supplierTaxNumber: z.string().min(1), totalAmount: z.string().min(1), customerPhone: z.string().optional().default(""), invoiceDate: z.string().optional().default(""), dueDate: z.string().optional().default("") }), notes: z.string().max(500).optional().default("") });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "خريطة استيراد الفواتير غير صحيحة", details: parsed.error.issues });
    const row = await withTenant(req.companyId, async client => {
      const r = await client.query(`INSERT INTO accounting_import_mappings (company_id, system_name, mapping, notes, updated_by, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,now()) ON CONFLICT (company_id, system_name) DO UPDATE SET mapping=EXCLUDED.mapping, notes=EXCLUDED.notes, updated_by=EXCLUDED.updated_by, updated_at=now() RETURNING *`, [req.companyId, parsed.data.systemName, JSON.stringify(parsed.data.mapping), parsed.data.notes, req.user.id]);
      await writeAudit(client, req, "UPSERT_ACCOUNTING_IMPORT_MAPPING", "accounting_import_mapping", parsed.data.systemName, { systemName: parsed.data.systemName });
      return r.rows[0];
    });
    res.json({ mapping: row });
  });

  app.post("/integrations/accounting/imports/upload", authRequired, blockClientCompanyId, requirePermission(Permissions.INTEGRATIONS_MANAGE), accountingImportLimiter || ((req, res, next) => next()), accountingUpload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "ارفع ملف Excel أو CSV للفواتير" });
    const systemName = ACCOUNTING_SYSTEMS.includes(req.body?.systemName) ? req.body.systemName : "generic";
    let suppliedMapping = null;
    if (req.body?.mapping) {
      try { suppliedMapping = typeof req.body.mapping === "string" ? JSON.parse(req.body.mapping) : req.body.mapping; }
      catch { return res.status(400).json({ error: "صيغة mapping غير صحيحة" }); }
    }
    const parsedFile = readAccountingRows(req.file);
    const savedMap = await withTenant(req.companyId, client => client.query("SELECT mapping FROM accounting_import_mappings WHERE company_id=$1 AND system_name=$2", [req.companyId, systemName]));
    const mapping = suppliedMapping || savedMap.rows[0]?.mapping || detectInvoiceHeaders(parsedFile.headers);
    const created = await withTenant(req.companyId, async client => {
      const batch = await client.query(`INSERT INTO accounting_import_batches (company_id, system_name, original_filename, total_rows, status, mapping, created_by) VALUES ($1,$2,$3,$4,'PROCESSING',$5::jsonb,$6) RETURNING id`, [req.companyId, systemName, req.file.originalname, parsedFile.rows.length, JSON.stringify(mapping), req.user.id]);
      const batchId = batch.rows[0].id;
      let insertedCount = 0; let skipped = 0; const errors = [];
      for (let i = 0; i < parsedFile.rows.length; i += 1) {
        const item = mapRow(parsedFile.rows[i], mapping);
        if (!item.invoiceNumber || !item.customerName || !item.supplierTaxNumber || !item.totalAmount) { skipped += 1; if (errors.length < 30) errors.push({ row: i + 2, reason: "MISSING_REQUIRED_FIELDS" }); continue; }
        const encryptedPayload = buildTenantEncryptedInvoicePayload(req.companyId, item, { source: "accounting_file_import", systemName, importBatchId: batchId });
        const inv = await client.query(`INSERT INTO invoices (company_id, invoice_number, customer_name, supplier_tax_number, total_amount, customer_phone, invoice_date, due_date, status, locked_for_review, encrypted_payload, tenant_crypto_version, tenant_key_version, source_system, external_source) VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,'')::date,NULLIF($8,'')::date,'DRAFT',false,$9,'tenant-aes-256-gcm-v2',$10,$11,'accounting_file_import') ON CONFLICT (company_id, invoice_number, supplier_tax_number) DO NOTHING RETURNING id`, [req.companyId, item.invoiceNumber, item.customerName, item.supplierTaxNumber, item.totalAmount, item.customerPhone || null, item.invoiceDate || "", item.dueDate || "", encryptedPayload, getTenantEncryptionVersion(req.companyId), systemName]);
        if (inv.rowCount) insertedCount += 1; else skipped += 1;
      }
      await client.query("UPDATE accounting_import_batches SET imported_rows=$3, skipped_rows=$4, status='IMPORTED', errors=$5::jsonb, completed_at=now() WHERE id=$1 AND company_id=$2", [batchId, req.companyId, insertedCount, skipped, JSON.stringify(errors)]);
      await client.query("INSERT INTO accounting_sync_logs (company_id, system_name, direction, event_type, status, details) VALUES ($1,$2,'INBOUND','FILE_IMPORT','SUCCESS',$3::jsonb)", [req.companyId, systemName, JSON.stringify({ batchId, imported: insertedCount, skipped })]);
      await recordTenantUsage(client, req.companyId, "invoice_imported_accounting_file", insertedCount, { systemName, batchId });
      await writeAudit(client, req, "IMPORT_ACCOUNTING_INVOICE_FILE", "accounting_import_batch", batchId, { systemName, imported: insertedCount, skipped });
      return { batchId, imported: insertedCount, skipped, errors, detectedMapping: mapping };
    });
    res.json({ ok: true, ...created });
  });

  app.get("/integrations/accounting/sync-logs", authRequired, requirePermission(Permissions.INTEGRATIONS_MANAGE), async (req, res) => {
    const r = await withTenant(req.companyId, client => client.query("SELECT * FROM accounting_sync_logs WHERE company_id=$1 ORDER BY created_at DESC LIMIT 150", [req.companyId]));
    res.json({ logs: r.rows });
  });

  app.get("/reports/finance", authRequired, requirePermission(Permissions.REPORTS_READ), async (req, res) => {
    const payload = await withTenant(req.companyId, client => financeReportPayload(client, req.companyId, req.query || {}));
    res.json(payload);
  });

  app.get("/reports/finance/export", authRequired, requirePermission(Permissions.REPORTS_EXPORT), async (req, res) => {
    const payload = await withTenant(req.companyId, client => financeReportPayload(client, req.companyId, req.query || {}));
    const format = String(req.query.format || "xlsx").toLowerCase();
    await withTenant(req.companyId, client => writeAudit(client, req, "EXPORT_CFO_FINANCE_REPORT", "finance_report", null, { format, filters: req.query || {} })).catch(err => console.error("Finance export audit warning:", err.message));
    
    if (format === "pdf") {
      const pdf = generateProfessionalReportPdf(payload);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=finance-report.pdf");
      return res.send(pdf);
    }
    
    if (format === "csv") {
      const ws = XLSX.utils.json_to_sheet(translateInvoices(payload.overdueInvoices || []));
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=finance-report.csv");
      return res.send(Buffer.from("\uFEFF" + csv, "utf8"));
    }
    
    const xlsx = buildFinanceWorkbook(payload);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=finance-report.xlsx");
    res.send(xlsx);
  });

  app.post("/invoices/:id/collection-status", authRequired, requirePermission(Permissions.INVOICE_APPROVE), async (req, res) => {
    const schema = z.object({ collectionStatus: z.enum(["NORMAL", "PROMISED", "DISPUTED"]).default("NORMAL"), promisedPaymentDate: z.string().optional().or(z.literal("")), disputeReason: z.string().max(500).optional().default("") });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "بيانات حالة التحصيل غير صحيحة", details: parsed.error.issues });
    const row = await withTenant(req.companyId, async client => {
      const r = await client.query("UPDATE invoices SET collection_status=$3, promised_payment_date=NULLIF($4,'')::date, dispute_reason=$5 WHERE id=$1 AND company_id=$2 RETURNING *", [req.params.id, req.companyId, parsed.data.collectionStatus, parsed.data.promisedPaymentDate || "", parsed.data.disputeReason || ""]);
      if (!r.rowCount) return null;
      await writeAudit(client, req, "UPDATE_COLLECTION_STATUS", "invoice", req.params.id, { collectionStatus: parsed.data.collectionStatus });
      return r.rows[0];
    });
    if (!row) return res.status(404).json({ error: "الفاتورة غير موجودة" });
    res.json({ invoice: row });
  });
}

async function runWhatsappQueueWorkerOnce(deps) {
  const { withTenant, decryptForTenant, writeAudit, acquireRedisLock, releaseRedisLock } = deps;
  const lock = await acquireRedisLock("whatsapp-queue-worker", Number(process.env.WHATSAPP_QUEUE_LOCK_MS || 120000));
  if (!lock.acquired) return { skipped: true };
  let processed = 0;
  try {
    const tenants = await listReadyTenantIds();
    for (const companyId of tenants) {
      for (let i = 0; i < Number(process.env.WHATSAPP_QUEUE_MAX_PER_TENANT || 5); i += 1) {
        try {
          const one = await withTenant(companyId, client => processOneWhatsappMessage({ client, companyId, decryptForTenant, writeAudit }));
          if (!one) break;
          processed += 1;
        } catch (err) {
          console.error("WhatsApp queue worker warning:", redactSecrets(err));
          break;
        }
      }
    }
    return { processed };
  } finally {
    await releaseRedisLock(lock).catch(() => {});
  }
}

module.exports = { installCommercialValueFeatures, runWhatsappQueueWorkerOnce, readAccountingRows, detectInvoiceHeaders, financeReportPayload, normalizePhone, REMINDER_STAGES, DELIVERY_STATUSES };
