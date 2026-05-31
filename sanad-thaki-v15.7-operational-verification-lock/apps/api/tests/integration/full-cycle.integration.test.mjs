import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, "../..");
const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
const TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 180_000);
const unique = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
const port = Number(process.env.TEST_API_PORT || 3901);
const baseUrl = `http://127.0.0.1:${port}`;

const testEnv = {
  ...process.env,
  NODE_ENV: "test",
  APP_PORT: String(port),
  JWT_SECRET: process.env.JWT_SECRET || "integration_test_jwt_secret_64_chars_minimum_for_sanad_thaki_regression_suite_2026",
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || "integration_test_refresh_secret_64_chars_minimum_for_sanad_thaki_regression_suite_2026",
  DEFAULT_TENANT_KMS_KEY: process.env.DEFAULT_TENANT_KMS_KEY || "integration_test_default_tenant_kms_key_64_chars_minimum_for_crypto_regression_suite",
  REQUIRE_DATABASE_PER_TENANT: "false",
  REQUIRE_TENANT_KMS: "false",
  ENFORCE_HTTPS: "false",
  CORS_ORIGIN: "http://127.0.0.1,http://localhost",
  DISABLE_INVOICE_QUEUE_WORKER: "true",
  RATE_LIMIT_GLOBAL_PER_MINUTE: "10000",
  RATE_LIMIT_LOGIN_PER_15_MIN: "10000",
  RATE_LIMIT_WEBHOOK_PER_MINUTE: "10000",
  RATE_LIMIT_BANK_UPLOAD_PER_MINUTE: "10000",
  PLATFORM_ADMIN_EMAIL: process.env.PLATFORM_ADMIN_EMAIL || `platform-${unique}@sanad.local`,
  PLATFORM_ADMIN_PASSWORD: process.env.PLATFORM_ADMIN_PASSWORD || "PlatformAdmin2026!Secure"
};

function requireDatabaseUrl() {
  const databaseUrl = testEnv.DATABASE_URL || process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL مطلوب لتشغيل Integration Tests على قاعدة اختبار نظيفة");
  testEnv.DATABASE_URL = databaseUrl;
  return databaseUrl;
}

function runNodeScript(script, label) {
  const result = spawnSync(process.execPath, [script], {
    cwd: apiDir,
    env: testEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, `${label} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

async function resetDatabase(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT quote_ident(tablename) AS table_name
      FROM pg_tables
      WHERE schemaname='public'
        AND tablename NOT LIKE 'pg_%'
        AND tablename NOT LIKE 'sql_%'
    `);
    const tables = result.rows.map(r => r.table_name);
    if (tables.length > 0) {
      await client.query("SELECT set_config('app.platform_admin', '1', true)");
      await client.query(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function waitForServer(child) {
  let lastError = null;
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API process exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`API did not become healthy: ${lastError?.message || "timeout"}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
  try { await once(child, "exit"); } catch { /* noop */ }
  clearTimeout(timeout);
}

async function api(method, route, { token, body, expectedStatus, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (expectedStatus !== undefined) {
    assert.equal(response.status, expectedStatus, `${method} ${route} expected ${expectedStatus}, got ${response.status}: ${text}`);
  }
  return { status: response.status, body: json, text };
}

async function login(email, password) {
  const response = await api("POST", "/auth/login", {
    expectedStatus: 200,
    body: { email, password }
  });
  assert.ok(response.body.token, `login token missing for ${email}`);
  return { token: response.body.token, user: response.body.user };
}

async function createPlatformCompany(platformToken, { packageCode, primaryUserRole, emailPrefix }) {
  const email = `${emailPrefix}-${unique}@sanad.local`;
  const password = `${primaryUserRole}Pass2026!Secure`;
  const response = await api("POST", "/platform/companies", {
    token: platformToken,
    expectedStatus: 200,
    body: {
      name: `شركة ${emailPrefix} ${unique}`,
      taxNumber: `3${unique}`.slice(0, 15).padEnd(15, "0"),
      email,
      city: "الرياض",
      packageCode,
      status: "ACTIVE",
      primaryUserEmail: email,
      primaryUserPassword: password,
      primaryUserRole
    }
  });
  assert.equal(response.body.company.package_code, packageCode);
  assert.ok(response.body.company.id?.startsWith("company-"));
  return { company: response.body.company, email, password };
}

test("Full regression cycle: التسجيل + الدفع/الباقات + العمليات الأساسية + العزل والصلاحيات", {
  skip: enabled ? false : "Set RUN_INTEGRATION_TESTS=true with DATABASE_URL to run the full API regression suite",
  timeout: TEST_TIMEOUT_MS
}, async () => {
  const databaseUrl = requireDatabaseUrl();
  runNodeScript("scripts/migrate-db.mjs", "database migrations");
  await resetDatabase(databaseUrl);
  runNodeScript("scripts/seed-platform-admin.mjs", "platform admin seed");

  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: apiDir,
    env: testEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs = [];
  child.stdout.on("data", chunk => logs.push(chunk.toString()));
  child.stderr.on("data", chunk => logs.push(chunk.toString()));

  try {
    await waitForServer(child);

    const plansResponse = await api("GET", "/billing/plans", { expectedStatus: 200 });
    const plans = plansResponse.body.plans;
    assert.equal(plans.find(p => p.code === "basic")?.priceSar, 99);
    assert.equal(plans.find(p => p.code === "growth")?.features.whatsapp, true);
    assert.equal(plans.find(p => p.code === "professional")?.features.advancedReports, true);

    const setupStatusBefore = await api("GET", "/setup/status", { expectedStatus: 200 });
    assert.equal(setupStatusBefore.body.setupRequired, true);

    const setupEmail = `setup-admin-${unique}@sanad.local`;
    const setupPassword = "SetupAdmin2026!Secure";
    await api("POST", "/setup/initial-admin", {
      expectedStatus: 200,
      body: {
        companyName: `شركة التسجيل ${unique}`,
        email: setupEmail,
        password: setupPassword,
        taxNumber: "300000000000003",
        city: "الرياض"
      }
    });
    const setupLogin = await login(setupEmail, setupPassword);
    assert.equal(setupLogin.user.role, "ADMIN");
    const setupMe = await api("GET", "/me", { token: setupLogin.token, expectedStatus: 200 });
    assert.equal(setupMe.body.user.userType, "CLIENT");
    assert.ok(setupMe.body.company.id.startsWith("company-"));

    const platformLogin = await login(testEnv.PLATFORM_ADMIN_EMAIL, testEnv.PLATFORM_ADMIN_PASSWORD);
    assert.equal(platformLogin.user.userType, "PLATFORM");
    await api("GET", "/platform/overview", { token: platformLogin.token, expectedStatus: 200 });
    const platformIntoTenant = await api("GET", "/company", { token: platformLogin.token });
    assert.equal(platformIntoTenant.status, 403);
    assert.equal(platformIntoTenant.body.code, "TENANT_SCOPE_REQUIRED");
    const tenantIntoPlatform = await api("GET", "/platform/overview", { token: setupLogin.token });
    assert.equal(tenantIntoPlatform.status, 403);
    assert.equal(tenantIntoPlatform.body.code, "PLATFORM_SCOPE_REQUIRED");

    const pro = await createPlatformCompany(platformLogin.token, {
      packageCode: "professional",
      primaryUserRole: "ADMIN",
      emailPrefix: "pro-admin"
    });

    // Seed WhatsApp Settings and Templates for this company so testing can proceed successfully
    const pgClient = new pg.Client({ connectionString: databaseUrl });
    await pgClient.connect();
    try {
      await pgClient.query(`
        INSERT INTO whatsapp_business_settings (company_id, provider, phone_number_id, business_account_id, display_name, is_active)
        VALUES ($1, 'meta', '1234567890', '1234567890', 'Sanad Test', true)
      `, [pro.company.id]);
      await pgClient.query(`
        INSERT INTO whatsapp_templates (company_id, reminder_stage, meta_template_name, language, category, body_preview, meta_status, is_active)
        VALUES ($1, 'FIRST', 'test_first_reminder', 'ar', 'UTILITY', 'عزيزنا العميل، نود تذكيركم بسداد الفاتورة رقم {{1}} بقيمة {{2}}.', 'APPROVED', true)
      `, [pro.company.id]);
    } finally {
      await pgClient.end();
    }
    const basicFinance = await createPlatformCompany(platformLogin.token, {
      packageCode: "basic",
      primaryUserRole: "FINANCE_MANAGER",
      emailPrefix: "basic-finance"
    });

    const basicFinanceLogin = await login(basicFinance.email, basicFinance.password);
    const basicBankGate = await api("GET", "/bank/transactions", { token: basicFinanceLogin.token });
    assert.equal(basicBankGate.status, 403);
    assert.equal(basicBankGate.body.code, "FEATURE_NOT_AVAILABLE_ON_PLAN");

    const adminLogin = await login(pro.email, pro.password);
    const proMe = await api("GET", "/me", { token: adminLogin.token, expectedStatus: 200 });
    assert.equal(proMe.body.company.package_code, "professional");
    assert.equal(proMe.body.entitlements.features.whatsapp, true);
    assert.equal(proMe.body.entitlements.features.bankMatching, true);
    assert.equal(proMe.body.entitlements.features.advancedReports, true);

    const blockedCompanyUpdate = await api("PUT", "/company", {
      token: adminLogin.token,
      body: {
        companyId: basicFinance.company.id,
        name: "محاولة خلط شركة",
        taxNumber: "300000000000003",
        email: "bad@sanad.local",
        phone: "",
        city: "الرياض",
        address: ""
      }
    });
    assert.equal(blockedCompanyUpdate.status, 400);

    await api("PUT", "/company", {
      token: adminLogin.token,
      expectedStatus: 200,
      body: {
        name: `شركة احترافية محدثة ${unique}`,
        taxNumber: "300000000000003",
        email: pro.email,
        phone: "0500000000",
        city: "الرياض",
        address: "طريق الملك فهد"
      }
    });

    const accountantEmail = `accountant-${unique}@sanad.local`;
    const financeEmail = `finance-${unique}@sanad.local`;
    const accountantInvite = await api("POST", "/users", {
      token: adminLogin.token,
      expectedStatus: 200,
      body: { name: "محاسب اختبار", email: accountantEmail, role: "ACCOUNTANT" }
    });
    const financeInvite = await api("POST", "/users", {
      token: adminLogin.token,
      expectedStatus: 200,
      body: { name: "مدير مالي اختبار", email: financeEmail, role: "FINANCE_MANAGER" }
    });
    const accountantTempPassword = accountantInvite.body.invite.temporaryPassword;
    const financeTempPassword = financeInvite.body.invite.temporaryPassword;
    assert.ok(accountantTempPassword, "temporary accountant password must be visible in test/staging mode");
    assert.ok(financeTempPassword, "temporary finance password must be visible in test/staging mode");

    const accountantFirstLogin = await login(accountantEmail, accountantTempPassword);
    const blockedBeforePasswordChange = await api("POST", "/invoices", {
      token: accountantFirstLogin.token,
      body: {
        invoiceNumber: `PRE-${unique}`,
        customerName: "عميل قبل تغيير كلمة المرور",
        supplierTaxNumber: "300000000000003",
        totalAmount: 100
      }
    });
    assert.equal(blockedBeforePasswordChange.status, 403);
    assert.equal(blockedBeforePasswordChange.body.code, "PASSWORD_CHANGE_REQUIRED");

    await api("POST", "/auth/change-password", {
      token: accountantFirstLogin.token,
      expectedStatus: 200,
      body: { currentPassword: accountantTempPassword, newPassword: "AccountantFinal2026!Secure" }
    });
    const accountantLogin = await login(accountantEmail, "AccountantFinal2026!Secure");

    const financeFirstLogin = await login(financeEmail, financeTempPassword);
    await api("POST", "/auth/change-password", {
      token: financeFirstLogin.token,
      expectedStatus: 200,
      body: { currentPassword: financeTempPassword, newPassword: "FinanceFinal2026!Secure" }
    });
    const financeLogin = await login(financeEmail, "FinanceFinal2026!Secure");

    const invoiceNumber = `INV-${unique}`;
    const createInvoice = await api("POST", "/invoices", {
      token: accountantLogin.token,
      expectedStatus: 200,
      body: {
        invoiceNumber,
        customerName: "الرشيد",
        supplierTaxNumber: "300000000000003",
        totalAmount: 539.86,
        customerPhone: "966500000000"
      }
    });
    const invoiceId = createInvoice.body.invoice.id;
    assert.equal(createInvoice.body.invoice.status, "DRAFT");
    assert.equal(createInvoice.body.invoice.company_id, pro.company.id);

    const financeCannotCreate = await api("POST", "/invoices", {
      token: financeLogin.token,
      body: {
        invoiceNumber: `BAD-${unique}`,
        customerName: "محاولة مدير مالي",
        supplierTaxNumber: "300000000000003",
        totalAmount: 10
      }
    });
    assert.equal(financeCannotCreate.status, 403);

    const accountantCannotApprove = await api("POST", `/invoices/${invoiceId}/approve`, { token: accountantLogin.token });
    assert.equal(accountantCannotApprove.status, 403);

    await api("POST", `/invoices/${invoiceId}/submit-review`, {
      token: accountantLogin.token,
      expectedStatus: 200
    });

    const editLockedInvoice = await api("PUT", `/invoices/${invoiceId}`, {
      token: accountantLogin.token,
      body: {
        invoiceNumber: `${invoiceNumber}-CHANGED`,
        customerName: "تغيير بعد القفل",
        supplierTaxNumber: "300000000000003",
        totalAmount: 1
      }
    });
    assert.equal(editLockedInvoice.status, 403);

    const whatsappBeforeApproval = await api("POST", `/invoices/${invoiceId}/whatsapp/send`, { token: accountantLogin.token });
    assert.equal(whatsappBeforeApproval.status, 403);

    const approveInvoice = await api("POST", `/invoices/${invoiceId}/approve`, {
      token: financeLogin.token,
      expectedStatus: 200
    });
    assert.equal(approveInvoice.body.invoice.status, "APPROVED");

    const whatsappAfterApproval = await api("POST", `/invoices/${invoiceId}/whatsapp/send`, {
      token: accountantLogin.token,
      expectedStatus: 202
    });
    assert.match(whatsappAfterApproval.body.queued.message, /عزيزنا العميل/);
    assert.equal(whatsappAfterApproval.body.queued.status, "QUEUED");

    await api("POST", "/bank/transactions", {
      token: financeLogin.token,
      expectedStatus: 200,
      body: {
        transactionDate: "2026-05-26",
        description: `سداد فاتورة ${invoiceNumber}`,
        amount: 539.86,
        reference: invoiceNumber
      }
    });
    const runMatches = await api("POST", "/matches/run", {
      token: financeLogin.token,
      expectedStatus: 200
    });
    assert.equal(runMatches.body.created, 1);

    const matches = await api("GET", "/matches", {
      token: financeLogin.token,
      expectedStatus: 200
    });
    const pendingMatch = matches.body.matches.find(m => m.invoice_id === invoiceId && m.status === "PENDING");
    assert.ok(pendingMatch, "pending reconciliation match was not created");

    await api("POST", `/matches/${pendingMatch.id}/approve`, {
      token: financeLogin.token,
      expectedStatus: 200
    });

    const reports = await api("GET", "/reports/finance", {
      token: financeLogin.token,
      expectedStatus: 200
    });
    assert.equal(Number(reports.body.summary.paid_invoices), 1);
    assert.equal(Number(reports.body.summary.sent_or_queued), 1);

    const usage = await api("GET", "/tenant/usage", {
      token: financeLogin.token,
      expectedStatus: 200
    });
    assert.equal(usage.body.companyId, pro.company.id);
    assert.ok(Array.isArray(usage.body.usage));

    const support = await api("POST", "/support/tickets", {
      token: accountantLogin.token,
      expectedStatus: 200,
      body: {
        category: "invoice",
        priority: "normal",
        description: "اختبار تذكرة دعم بعد دورة الفاتورة والمطابقة"
      }
    });
    assert.equal(support.body.ticket.company_id, pro.company.id);
    assert.equal(support.body.ticket.status, "OPEN");

    const audit = await api("GET", "/audit-logs", {
      token: adminLogin.token,
      expectedStatus: 200
    });
    assert.ok(audit.body.auditLogs.some(row => row.company_id === pro.company.id));
    assert.equal(audit.body.auditLogs.some(row => row.company_id === basicFinance.company.id), false, "tenant audit logs leaked from another company");

    const companyInvoices = await api("GET", "/invoices", {
      token: accountantLogin.token,
      expectedStatus: 200
    });
    assert.equal(companyInvoices.body.invoices.length, 1);
    assert.equal(companyInvoices.body.invoices[0].company_id, pro.company.id);
  } catch (err) {
    err.message = `${err.message}\n--- API logs ---\n${logs.join("").slice(-6000)}`;
    throw err;
  } finally {
    await stopServer(child);
  }
});
