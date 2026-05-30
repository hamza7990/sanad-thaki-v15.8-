import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

process.env.NODE_ENV ||= "test";
process.env.APP_PORT ||= "3999";
process.env.DATABASE_URL ||= "postgresql://sanad_test:sanad_test@127.0.0.1:5432/sanad_test";
process.env.JWT_SECRET ||= "unit_test_jwt_secret_64_chars_minimum_for_sanad_thaki_regression_suite_2026";
process.env.REFRESH_TOKEN_SECRET ||= "unit_test_refresh_secret_64_chars_minimum_for_sanad_thaki_regression_suite_2026";
process.env.DEFAULT_TENANT_KMS_KEY ||= "unit_test_default_tenant_kms_key_64_chars_minimum_for_crypto_regression_suite";
process.env.REQUIRE_DATABASE_PER_TENANT ||= "false";
process.env.REQUIRE_TENANT_KMS ||= "false";
process.env.ENFORCE_HTTPS ||= "false";
process.env.CORS_ORIGIN ||= "http://127.0.0.1,http://localhost";

const require = createRequire(import.meta.url);
const jwt = require("jsonwebtoken");
const {
  signAccessToken,
  assertStrictPayloadShape,
  hashJwtId
} = require("../../src/auth.js");
const { Permissions, rolePermissions, isPlatformPermission, requirePermission } = require("../../src/rbac.js");
const { blockClientCompanyId } = require("../../src/guards.js");
const { encryptForTenant, decryptForTenant } = require("../../src/tenant-crypto.js");

const CLIENT_COMPANY_ID = "company-UNITTEST0001";
const OTHER_COMPANY_ID = "company-UNITTEST0002";
const VALID_UUID_V4 = "550e8400-e29b-41d4-a716-446655440000";

function runMiddleware(middleware, req) {
  let statusCode = 200;
  let jsonBody = null;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    }
  };
  middleware(req, res, () => { nextCalled = true; });
  return { statusCode, jsonBody, nextCalled };
}

test("JWT strictness: يوقّع جلسة عميل بدون company_id القادم من العميل وبشكل قابل للتحقق", () => {
  const token = signAccessToken({
    id: "user-unit-1",
    email: "accountant.unit@sanad.local",
    role: "ACCOUNTANT",
    company_id: CLIENT_COMPANY_ID,
    user_type: "CLIENT",
    name: "محاسب اختبار",
    password_must_change: false
  });

  const payload = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: "sanad-thaki-api",
    audience: "sanad-thaki-client"
  });

  assert.equal(payload.companyId, CLIENT_COMPANY_ID);
  assert.equal(payload.company_id, undefined, "يجب منع company_id بصيغة snake_case داخل التوكن");
  assert.equal(payload.sub, payload.id);
  assert.match(payload.jti, /^[0-9a-f-]{36}$/i);
  assert.equal(assertStrictPayloadShape(payload), true);
});

test("JWT strictness: يمنع خلط أدمن سند مع شركة ويمنع عميل بلا شركة", () => {
  assert.throws(() => signAccessToken({
    id: "platform-admin-main",
    email: "platform@sanad.local",
    role: "SANAD_ADMIN",
    company_id: CLIENT_COMPANY_ID,
    user_type: "PLATFORM"
  }), /Platform admin token cannot include company tenant/);

  assert.throws(() => signAccessToken({
    id: "user-no-company",
    email: "admin@company.local",
    role: "ADMIN",
    company_id: null,
    user_type: "CLIENT"
  }), /Client token must include company tenant/);
});

test("JWT strictness: يرفض payload ملوث أو ناقص", () => {
  const cleanToken = signAccessToken({
    id: "user-unit-2",
    email: "finance.unit@sanad.local",
    role: "FINANCE_MANAGER",
    company_id: CLIENT_COMPANY_ID,
    user_type: "CLIENT"
  });
  const payload = jwt.decode(cleanToken);

  assert.equal(assertStrictPayloadShape({ ...payload, company_id: CLIENT_COMPANY_ID }), false);
  assert.equal(assertStrictPayloadShape({ ...payload, aud: "wrong-client" }), false);
  assert.equal(assertStrictPayloadShape({ ...payload, iss: "wrong-api" }), false);
  assert.equal(assertStrictPayloadShape({ ...payload, sub: "different-subject" }), false);
  assert.equal(assertStrictPayloadShape({ ...payload, jti: "not-a-uuid" }), false);
});

test("JWT session id hashing: يقبل UUID v4 فقط ويعيد SHA-256 ثابت", () => {
  const expected = createHash("sha256").update(VALID_UUID_V4, "utf8").digest("hex");
  assert.equal(hashJwtId(VALID_UUID_V4), expected);
  assert.equal(hashJwtId(VALID_UUID_V4).length, 64);
  assert.throws(() => hashJwtId("550e8400-e29b-11d4-a716-446655440000"), /Invalid jwtid format/);
  assert.throws(() => hashJwtId("bad-jti"), /Invalid jwtid format/);
});

test("RBAC/SOD: أدمن سند لا يملك صلاحيات مالية داخل الشركات", () => {
  assert.deepEqual(rolePermissions.SANAD_ADMIN.sort(), [
    Permissions.PLATFORM_COMPANIES_MANAGE,
    Permissions.PLATFORM_DASHBOARD,
    Permissions.PLATFORM_SECURITY_READ,
    Permissions.PLATFORM_SECURITY_MANAGE,
    Permissions.PLATFORM_SUPPORT_MANAGE,
    Permissions.PLATFORM_TENANT_PROVISION_MANAGE
  ].sort());

  assert.equal(rolePermissions.SANAD_ADMIN.includes(Permissions.INVOICE_CREATE), false);
  assert.equal(rolePermissions.SANAD_ADMIN.includes(Permissions.INVOICE_APPROVE), false);
  assert.equal(rolePermissions.SANAD_ADMIN.includes(Permissions.BANK_MANAGE), false);
  assert.equal(rolePermissions.SANAD_ADMIN.includes(Permissions.WHATSAPP_SEND_APPROVED), false);
});

test("RBAC/SOD: محاسب، مدير مالي، وأدمن الشركة منفصلون وظيفيًا", () => {
  assert.equal(rolePermissions.ACCOUNTANT.includes(Permissions.INVOICE_CREATE), true);
  assert.equal(rolePermissions.ACCOUNTANT.includes(Permissions.INVOICE_SUBMIT_REVIEW), true);
  assert.equal(rolePermissions.ACCOUNTANT.includes(Permissions.INVOICE_APPROVE), false);
  assert.equal(rolePermissions.ACCOUNTANT.includes(Permissions.BANK_MANAGE), false);
  assert.equal(rolePermissions.ACCOUNTANT.includes(Permissions.USERS_MANAGE), false);

  assert.equal(rolePermissions.FINANCE_MANAGER.includes(Permissions.INVOICE_APPROVE), true);
  assert.equal(rolePermissions.FINANCE_MANAGER.includes(Permissions.BANK_MANAGE), true);
  assert.equal(rolePermissions.FINANCE_MANAGER.includes(Permissions.MATCH_APPROVE), true);
  assert.equal(rolePermissions.FINANCE_MANAGER.includes(Permissions.INVOICE_CREATE), false);
  assert.equal(rolePermissions.FINANCE_MANAGER.includes(Permissions.USERS_MANAGE), false);

  assert.equal(rolePermissions.ADMIN.includes(Permissions.USERS_MANAGE), true);
  assert.equal(rolePermissions.ADMIN.includes(Permissions.COMPANY_SETTINGS_MANAGE), true);
  assert.equal(rolePermissions.ADMIN.includes(Permissions.INVOICE_CREATE), false);
  assert.equal(rolePermissions.ADMIN.includes(Permissions.INVOICE_APPROVE), false);
  assert.equal(rolePermissions.ADMIN.includes(Permissions.BANK_MANAGE), false);
});

test("RBAC middleware: يفرض تغيير كلمة المرور قبل أي صلاحية ويمنع خلط Platform/Tenant", () => {
  const passwordBlocked = runMiddleware(requirePermission(Permissions.INVOICE_READ), {
    user: { role: "ACCOUNTANT", mustChangePassword: true },
    authScope: "TENANT",
    companyId: CLIENT_COMPANY_ID,
    isPlatformAdmin: false
  });
  assert.equal(passwordBlocked.statusCode, 403);
  assert.equal(passwordBlocked.jsonBody.code, "PASSWORD_CHANGE_REQUIRED");
  assert.equal(passwordBlocked.nextCalled, false);

  const platformIntoTenant = runMiddleware(requirePermission(Permissions.INVOICE_READ), {
    user: { role: "SANAD_ADMIN", mustChangePassword: false },
    authScope: "PLATFORM",
    companyId: null,
    isPlatformAdmin: true
  });
  assert.equal(platformIntoTenant.statusCode, 403);
  assert.equal(platformIntoTenant.jsonBody.code, "TENANT_SCOPE_REQUIRED");

  const tenantIntoPlatform = runMiddleware(requirePermission(Permissions.PLATFORM_DASHBOARD), {
    user: { role: "ADMIN", mustChangePassword: false },
    authScope: "TENANT",
    companyId: CLIENT_COMPANY_ID,
    isPlatformAdmin: false
  });
  assert.equal(tenantIntoPlatform.statusCode, 403);
  assert.equal(tenantIntoPlatform.jsonBody.code, "PLATFORM_SCOPE_REQUIRED");

  const allowed = runMiddleware(requirePermission(Permissions.INVOICE_CREATE), {
    user: { role: "ACCOUNTANT", mustChangePassword: false },
    authScope: "TENANT",
    companyId: CLIENT_COMPANY_ID,
    isPlatformAdmin: false
  });
  assert.equal(allowed.nextCalled, true);
});

test("Permission classifier: يميز صلاحيات المنصة عن صلاحيات الشركات", () => {
  assert.equal(isPlatformPermission(Permissions.PLATFORM_DASHBOARD), true);
  assert.equal(isPlatformPermission(Permissions.PLATFORM_COMPANIES_MANAGE), true);
  assert.equal(isPlatformPermission(Permissions.INVOICE_READ), false);
  assert.equal(isPlatformPermission(Permissions.SUPPORT_SUBMIT), false);
});

test("IDOR guard: يرفض companyId/company_id من body/query/params", () => {
  for (const req of [
    { body: { companyId: OTHER_COMPANY_ID }, query: {}, params: {} },
    { body: { company_id: OTHER_COMPANY_ID }, query: {}, params: {} },
    { body: {}, query: { companyId: OTHER_COMPANY_ID }, params: {} },
    { body: {}, query: { company_id: OTHER_COMPANY_ID }, params: {} },
    { body: {}, query: {}, params: { companyId: OTHER_COMPANY_ID } },
    { body: {}, query: {}, params: { company_id: OTHER_COMPANY_ID } }
  ]) {
    const result = runMiddleware(blockClientCompanyId, req);
    assert.equal(result.statusCode, 400);
    assert.equal(result.nextCalled, false);
    assert.match(result.jsonBody.error, /companyId/);
  }

  const clean = runMiddleware(blockClientCompanyId, { body: { name: "شركة" }, query: {}, params: {} });
  assert.equal(clean.nextCalled, true);
});

test("Tenant crypto: يشفر ويفك داخل نفس الشركة ويرفض فك شركة أخرى", () => {
  const payload = JSON.stringify({ invoiceNumber: "INV-UNIT-1", totalAmount: 539.86 });
  const encrypted = encryptForTenant(CLIENT_COMPANY_ID, payload);
  assert.match(encrypted, /^v[12]:/);
  assert.equal(decryptForTenant(CLIENT_COMPANY_ID, encrypted), payload);
  assert.throws(() => decryptForTenant(OTHER_COMPANY_ID, encrypted));
});
