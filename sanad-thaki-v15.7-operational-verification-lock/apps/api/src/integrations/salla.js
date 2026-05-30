const crypto = require("crypto");
const { z } = require("zod");
const { assertFreshWebhook, reserveWebhookReplayNonce, sha256Hex } = require("../webhook-security");
const { logSecurityEvent, redactSecrets } = require("../secure-logger");

const PROVIDER = "SALLA";
const DEFAULT_PAID_STATUS_SLUG = "completed";
const SALLA_ADMIN_API_BASE = "https://api.salla.dev/admin/v2";

function normalizeAmount(value) {
  if (value && typeof value === "object") {
    if (value.amount !== undefined) return normalizeAmount(value.amount);
    if (value.value !== undefined) return normalizeAmount(value.value);
  }
  if (typeof value === "string") value = value.replace(/,/g, "").trim();
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function normalizeMobile(value) {
  return String(value || "").replace(/[^0-9+]/g, "").slice(0, 30);
}

function normalizeSignatureHex(value) {
  const raw = Array.isArray(value) ? value[0] : String(value || "");
  const trimmed = raw.trim();
  const withoutPrefix = trimmed.startsWith("sha256=") ? trimmed.slice("sha256=".length) : trimmed;
  return /^[a-f0-9]{64}$/i.test(withoutPrefix) ? withoutPrefix.toLowerCase() : null;
}

function constantTimeHexEqual(expectedHex, providedHex) {
  const expected = Buffer.from(String(expectedHex || "").padEnd(64, "0").slice(0, 64), "hex");
  const providedNormalized = normalizeSignatureHex(providedHex);
  const provided = Buffer.from((providedNormalized || "0".repeat(64)).slice(0, 64), "hex");
  const equal = crypto.timingSafeEqual(expected, provided);
  return Boolean(providedNormalized && equal);
}

function calculateSallaSignature(rawBody, secret) {
  return crypto.createHmac("sha256", String(secret)).update(rawBody).digest("hex");
}

function verifySallaSignature(rawBody, signature, secret) {
  const expectedHex = rawBody && secret ? calculateSallaSignature(rawBody, secret) : "0".repeat(64);
  return constantTimeHexEqual(expectedHex, signature);
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function extractSallaOrder(payload) {
  const event = pickFirst(payload?.event, payload?.event_name, payload?.type);
  const data = payload?.data || payload?.order || payload;
  const amounts = data?.amounts || data?.amount || {};
  const total = pickFirst(
    amounts?.total?.amount,
    amounts?.total,
    data?.total?.amount,
    data?.total,
    data?.grand_total?.amount,
    data?.grand_total,
    data?.price?.amount,
    data?.price
  );
  const currency = pickFirst(
    amounts?.total?.currency,
    data?.total?.currency,
    data?.currency,
    data?.currency_code,
    "SAR"
  );
  const customer = data?.customer || data?.receiver || data?.shipping?.receiver || {};
  const customerName = String(pickFirst(
    customer?.name,
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" "),
    data?.customer_name,
    data?.receiver_name,
    "عميل سلة"
  )).trim();
  const customerMobile = normalizeMobile(pickFirst(
    customer?.mobile,
    customer?.phone,
    customer?.mobile_code && customer?.mobile ? `${customer.mobile_code}${customer.mobile}` : undefined,
    data?.customer_mobile,
    data?.phone,
    data?.mobile
  ));
  const orderId = String(pickFirst(data?.id, data?.order_id, data?.orderId, payload?.order_id, "")).trim();
  const orderNumber = String(pickFirst(data?.reference_id, data?.reference, data?.number, data?.order_number, orderId)).trim();
  const storeId = String(pickFirst(payload?.merchant, payload?.merchant_id, payload?.store_id, data?.store_id, data?.store?.id, "")).trim();
  const totalAmount = normalizeAmount(total);
  if (!orderId) {
    const err = new Error("Salla order payload is missing order id");
    err.statusCode = 400;
    throw err;
  }
  if (!totalAmount || totalAmount <= 0) {
    const err = new Error("Salla order payload is missing positive total amount");
    err.statusCode = 400;
    throw err;
  }
  return {
    event,
    orderId,
    orderNumber: orderNumber || orderId,
    storeId,
    customerName: customerName || "عميل سلة",
    customerMobile,
    totalAmount,
    currency: String(currency || "SAR").toUpperCase().slice(0, 8),
    raw: payload
  };
}

async function loadSallaIntegration(client, companyId, decryptForTenant) {
  const result = await client.query(
    `SELECT * FROM ecommerce_integrations
     WHERE company_id=$1 AND provider=$2 AND is_active=true
     LIMIT 1`,
    [companyId, PROVIDER]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    webhookSecret: decryptForTenant(companyId, row.webhook_secret_encrypted),
    accessToken: decryptForTenant(companyId, row.access_token_encrypted),
    paidStatusSlug: row.paid_status_slug || DEFAULT_PAID_STATUS_SLUG
  };
}

function createSallaRouter(deps) {
  const {
    express,
    authRequired,
    requirePermission,
    Permissions,
    blockClientCompanyId,
    withTenant,
    encryptForTenant,
    decryptForTenant,
    buildTenantEncryptedInvoicePayload,
    getTenantEncryptionVersion = () => 1,
    writeAudit,
    writeSecurityAuditTrail,
    recordTenantUsage,
    normalizeAmount: normalizeInvoiceAmount,
    config
  } = deps;

  const router = express.Router();

  router.post(
    "/config",
    authRequired,
    blockClientCompanyId,
    requirePermission(Permissions.INTEGRATIONS_MANAGE),
    async (req, res, next) => {
      try {
        const schema = z.object({
          webhookSecret: z.string().min(16).max(500),
          accessToken: z.string().min(16).max(4000),
          paidStatusSlug: z.string().min(2).max(80).default(DEFAULT_PAID_STATUS_SLUG),
          isActive: z.boolean().default(true)
        });
        const parsed = schema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: "إعدادات سلة غير صحيحة", details: parsed.error.issues });
        const saved = await withTenant(req.companyId, async client => {
          const encryptedSecret = encryptForTenant(req.companyId, parsed.data.webhookSecret);
          const encryptedToken = encryptForTenant(req.companyId, parsed.data.accessToken);
          const result = await client.query(
            `INSERT INTO ecommerce_integrations
              (company_id, provider, webhook_secret_encrypted, access_token_encrypted, paid_status_slug, is_active, created_by, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,now())
             ON CONFLICT (company_id, provider)
             DO UPDATE SET webhook_secret_encrypted=EXCLUDED.webhook_secret_encrypted,
                           access_token_encrypted=EXCLUDED.access_token_encrypted,
                           paid_status_slug=EXCLUDED.paid_status_slug,
                           is_active=EXCLUDED.is_active,
                           updated_at=now()
             RETURNING id, provider, paid_status_slug, is_active, updated_at`,
            [req.companyId, PROVIDER, encryptedSecret, encryptedToken, parsed.data.paidStatusSlug, parsed.data.isActive, req.user.id]
          );
          await writeAudit(client, req, "UPSERT_SALLA_INTEGRATION", "ecommerce_integration", result.rows[0].id, { provider: PROVIDER, paidStatusSlug: parsed.data.paidStatusSlug });
          if (writeSecurityAuditTrail) await writeSecurityAuditTrail(client, req, "SALLA_INTEGRATION_CONFIG_UPDATED", "ecommerce_integration", result.rows[0].id, { provider: PROVIDER, paidStatusSlug: parsed.data.paidStatusSlug });
          return result.rows[0];
        });
        const baseUrl = (process.env.PUBLIC_APP_URL || process.env.APP_PUBLIC_URL || "").replace(/\/$/, "");
        res.json({
          integration: saved,
          webhookUrl: `${baseUrl || "https://YOUR-DOMAIN"}/integrations/salla/webhook/${req.companyId}/order-created`,
          requiredSallaEvent: "order.created",
          securityHeader: "X-Salla-Signature"
        });
      } catch (err) { next(err); }
    }
  );

  router.post("/webhook/:companyId/order-created", async (req, res, next) => {
    try {
      const companyId = String(req.params.companyId || "").trim();
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
      const signature = req.header("x-salla-signature") || req.header("X-Salla-Signature");
      const strategy = req.header("x-salla-security-strategy") || req.header("X-Salla-Security-Strategy") || "Signature";
      const freshness = assertFreshWebhook(req, rawBody, PROVIDER);
      const result = await withTenant(companyId, async client => {
        const integration = await loadSallaIntegration(client, companyId, decryptForTenant);
        if (!integration?.webhookSecret) {
          const err = new Error("Salla integration is not configured for this tenant");
          err.statusCode = 404;
          throw err;
        }
        const signatureOk = verifySallaSignature(rawBody, signature, integration.webhookSecret);
        const signatureHash = sha256Hex(Buffer.from(String(signature || "")));
        const rawBodyHash = sha256Hex(rawBody);
        if (!signatureOk) {
          logSecurityEvent("SALLA_WEBHOOK_INVALID_SIGNATURE", { companyId, webhookId: freshness.webhookId, signatureHash, ip: req.ip });
          const err = new Error("Invalid Salla webhook signature");
          err.statusCode = 401;
          throw err;
        }
        await reserveWebhookReplayNonce(client, {
          companyId,
          provider: PROVIDER,
          webhookId: freshness.webhookId,
          signatureHash,
          rawBodyHash,
          timestamp: freshness.timestamp,
          ip: req.ip
        });
        const payload = req.body && Object.keys(req.body).length ? req.body : JSON.parse(rawBody.toString("utf8"));
        const order = extractSallaOrder(payload);
        if (order.event && order.event !== "order.created") {
          await writeAudit(client, { companyId, user: { id: "salla-webhook" }, ip: req.ip }, "IGNORE_SALLA_WEBHOOK", "ecommerce_order", order.orderId, { event: order.event });
          return { ignored: true, event: order.event };
        }
        const supplierTaxNumber = `SALLA-${order.storeId || companyId}`.slice(0, 64);
        const invoiceNumber = `SALLA-${order.orderNumber || order.orderId}`.slice(0, 80);
        const encryptedPayload = buildTenantEncryptedInvoicePayload(companyId, {
          invoiceNumber,
          customerName: order.customerName,
          supplierTaxNumber,
          totalAmount: order.totalAmount
        }, { source: "salla_order_created", externalOrderId: order.orderId, customerMobile: order.customerMobile, currency: order.currency });
        const invoice = await client.query(
          `INSERT INTO invoices
             (company_id, invoice_number, customer_name, supplier_tax_number, total_amount, status, locked_for_review, locked_at, locked_by, encrypted_payload, tenant_crypto_version, tenant_key_version)
           VALUES ($1,$2,$3,$4,$5,'READY_FOR_REVIEW',true,now(),'integration:salla',$6,'tenant-aes-256-gcm-v2',$7)
           ON CONFLICT (company_id, invoice_number, supplier_tax_number)
           DO UPDATE SET customer_name=EXCLUDED.customer_name,
                         total_amount=EXCLUDED.total_amount,
                         encrypted_payload=EXCLUDED.encrypted_payload,
                         tenant_crypto_version='tenant-aes-256-gcm-v2',
                         tenant_key_version=EXCLUDED.tenant_key_version
           RETURNING id, invoice_number, status`,
          [companyId, invoiceNumber, order.customerName, supplierTaxNumber, normalizeInvoiceAmount(order.totalAmount), encryptedPayload, getTenantEncryptionVersion(companyId)]
        );
        const invoiceId = invoice.rows[0].id;
        await client.query(
          `INSERT INTO ecommerce_order_links
             (company_id, provider, external_order_id, external_order_number, invoice_id, customer_name, customer_mobile, total_amount, currency, external_status, provider_payload, last_webhook_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ORDER_CREATED',$10::jsonb,now())
           ON CONFLICT (company_id, provider, external_order_id)
           DO UPDATE SET external_order_number=EXCLUDED.external_order_number,
                         invoice_id=EXCLUDED.invoice_id,
                         customer_name=EXCLUDED.customer_name,
                         customer_mobile=EXCLUDED.customer_mobile,
                         total_amount=EXCLUDED.total_amount,
                         currency=EXCLUDED.currency,
                         provider_payload=EXCLUDED.provider_payload,
                         last_webhook_at=now()
           RETURNING id`,
          [companyId, PROVIDER, order.orderId, order.orderNumber, invoiceId, order.customerName, order.customerMobile, order.totalAmount, order.currency, JSON.stringify(order.raw)]
        );
        await recordTenantUsage(client, companyId, "salla_order_imported", 1, { orderId: order.orderId, invoiceId });
        await writeAudit(client, { companyId, user: { id: "salla-webhook" }, ip: req.ip, headers: req.headers }, "IMPORT_SALLA_ORDER_CREATED", "invoice", invoiceId, {
          provider: PROVIDER,
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          securityStrategy: strategy,
          webhookId: freshness.webhookId,
          webhookAgeSeconds: Math.round(freshness.ageSeconds)
        });
        if (writeSecurityAuditTrail) {
          await writeSecurityAuditTrail(client, { companyId, user: { id: "salla-webhook", role: "INTEGRATION" }, ip: req.ip, headers: req.headers }, "SALLA_WEBHOOK_ORDER_CREATED_ACCEPTED", "invoice", invoiceId, {
            provider: PROVIDER,
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            webhookId: freshness.webhookId,
            webhookAgeSeconds: Math.round(freshness.ageSeconds)
          });
        }
        return { received: true, invoiceId, orderId: order.orderId, invoiceNumber };
      });
      res.status(200).json({ status: result.ignored ? "ignored" : "received", ...result });
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
      next(err);
    }
  });

  return router;
}

async function updateSallaOrderStatus({ orderId, accessToken, statusSlug = DEFAULT_PAID_STATUS_SLUG, note = "تم تحصيل الفاتورة عبر سند ذكي" }) {
  if (!orderId) throw new Error("Missing Salla order id");
  if (!accessToken) throw new Error("Missing Salla access token");
  const response = await fetch(`${SALLA_ADMIN_API_BASE}/orders/${encodeURIComponent(orderId)}/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ slug: statusSlug, note })
  });
  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }
  if (!response.ok) {
    const err = new Error(`Salla status update failed: ${response.status}`);
    err.statusCode = response.status;
    err.response = redactSecrets(body);
    throw err;
  }
  return body;
}

async function notifySallaPaidForInvoice({ companyId, invoiceId, withTenant, decryptForTenant, writeAudit, writeSecurityAuditTrail }) {
  if (!companyId || !invoiceId) return { skipped: true, reason: "missing_context" };
  return withTenant(companyId, async client => {
    const linkResult = await client.query(
      `SELECT l.*, i.access_token_encrypted, i.paid_status_slug
       FROM ecommerce_order_links l
       JOIN ecommerce_integrations i ON i.company_id=l.company_id AND i.provider=l.provider AND i.is_active=true
       WHERE l.company_id=$1 AND l.invoice_id=$2 AND l.provider=$3
       LIMIT 1`,
      [companyId, invoiceId, PROVIDER]
    );
    const link = linkResult.rows[0];
    if (!link) return { skipped: true, reason: "not_salla_invoice" };
    if (link.external_status === "PAID_SYNCED") return { skipped: true, reason: "already_synced" };
    let accessToken = decryptForTenant(companyId, link.access_token_encrypted);
    let apiResult;
    try {
      apiResult = await updateSallaOrderStatus({
        orderId: link.external_order_id,
        accessToken,
        statusSlug: link.paid_status_slug || DEFAULT_PAID_STATUS_SLUG
      });
    } finally {
      accessToken = null;
    }
    await client.query(
      `UPDATE ecommerce_order_links
       SET external_status='PAID_SYNCED', paid_synced_at=now(), last_sync_response=$4::jsonb, updated_at=now()
       WHERE company_id=$1 AND provider=$2 AND external_order_id=$3`,
      [companyId, PROVIDER, link.external_order_id, JSON.stringify(apiResult || {})]
    );
    await writeAudit(client, { companyId, user: { id: "system:salla-sync" } }, "SYNC_SALLA_ORDER_PAID", "ecommerce_order", link.external_order_id, { invoiceId, provider: PROVIDER });
    if (writeSecurityAuditTrail) await writeSecurityAuditTrail(client, { companyId, user: { id: "system:salla-sync", role: "SYSTEM" } }, "SALLA_ORDER_STATUS_SYNCED_PAID", "ecommerce_order", link.external_order_id, { invoiceId, provider: PROVIDER });
    return { synced: true, orderId: link.external_order_id };
  });
}

module.exports = {
  createSallaRouter,
  verifySallaSignature,
  constantTimeHexEqual,
  extractSallaOrder,
  updateSallaOrderStatus,
  notifySallaPaidForInvoice
};
