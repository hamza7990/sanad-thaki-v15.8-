const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { randomUUID, createHash } = require("crypto");
const { z } = require("zod");
const { pool, withTenant, withPlatformScope } = require("./db");
const { loadConfig } = require("./config");

const config = loadConfig();
const TOKEN_ISSUER = "sanad-thaki-api";
const TOKEN_AUDIENCE = "sanad-thaki-client";
const PLATFORM_ROLE = "SANAD_ADMIN";
const CLIENT_ROLES = new Set(["OWNER", "ADMIN", "MEMBER", "FINANCE_MANAGER", "ACCOUNTANT"]);
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashJwtId(jwtid) {
  if (typeof jwtid !== "string" || !UUID_V4_RE.test(jwtid)) {
    throw new Error("Invalid jwtid format");
  }
  return createHash("sha256").update(jwtid, "utf8").digest("hex");
}

function assertStrictPayloadShape(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.iss !== TOKEN_ISSUER) return false;
  if (payload.aud !== TOKEN_AUDIENCE) return false;
  if (typeof payload.id !== "string" || payload.id.length < 3) return false;
  if (payload.sub !== String(payload.id)) return false;
  if (!UUID_V4_RE.test(String(payload.jti || ""))) return false;
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number" || payload.exp <= payload.iat) return false;
  if (Object.prototype.hasOwnProperty.call(payload, "company_id")) return false;
  return true;
}

function signAccessToken(user) {
  const isPlatform = user.user_type === "PLATFORM" || user.role === PLATFORM_ROLE;
  if (isPlatform && user.company_id) throw new Error("Platform admin token cannot include company tenant");
  if (!isPlatform && !user.company_id) throw new Error("Client token must include company tenant");

  return jwt.sign({
    id: user.id,
    email: user.email,
    role: isPlatform ? PLATFORM_ROLE : user.role,
    companyId: isPlatform ? null : user.company_id,
    userType: isPlatform ? "PLATFORM" : "CLIENT",
    name: user.name || "",
    mustChangePassword: Boolean(user.password_must_change)
  }, config.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: config.ACCESS_TOKEN_EXPIRES_IN,
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    subject: String(user.id),
    jwtid: randomUUID()
  });
}

async function registerAuthSession(user, token) {
  const decoded = jwt.decode(token);
  if (!assertStrictPayloadShape(decoded)) throw new Error("Cannot register invalid token payload");
  const isPlatform = decoded.userType === "PLATFORM" && decoded.role === PLATFORM_ROLE;
  const jtiHash = hashJwtId(decoded.jti);
  const expiresAt = new Date(decoded.exp * 1000);

  const insertSql = `INSERT INTO auth_sessions
    (id, jti_hash, user_type, user_id, company_id, role, issuer, audience, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (jti_hash) DO NOTHING`;
  const values = [
    `session-${randomUUID()}`,
    jtiHash,
    isPlatform ? "PLATFORM" : "CLIENT",
    decoded.id,
    isPlatform ? null : decoded.companyId,
    decoded.role,
    TOKEN_ISSUER,
    TOKEN_AUDIENCE,
    expiresAt
  ];

  if (isPlatform) {
    await withPlatformScope(async client => {
      await client.query(insertSql, values);
    });
    return;
  }
  await withTenant(decoded.companyId, async client => {
    await client.query(insertSql, values);
  });
}

async function assertLiveAuthSession(client, payload, expectedUserType, expectedCompanyId = null) {
  const jtiHash = hashJwtId(payload.jti);
  const result = await client.query(
    `UPDATE auth_sessions
     SET last_seen_at=now()
     WHERE jti_hash=$1
       AND user_type=$2
       AND user_id=$3
       AND role=$4
       AND issuer=$5
       AND audience=$6
       AND revoked_at IS NULL
       AND expires_at > now()
       AND ((company_id IS NULL AND $7::text IS NULL) OR company_id=$7::text)
     RETURNING id`,
    [jtiHash, expectedUserType, payload.id, payload.role, TOKEN_ISSUER, TOKEN_AUDIENCE, expectedCompanyId]
  );
  return Boolean(result.rows[0]);
}

async function tryPlatformLogin(client, email, password) {
  let result;
  await client.query("SAVEPOINT platform_login_lookup");
  try {
    result = await client.query(
      "SELECT id, email, password_hash, role, is_active, '' AS name, false AS password_must_change FROM platform_admins WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    );
    await client.query("RELEASE SAVEPOINT platform_login_lookup");
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT platform_login_lookup").catch(() => {});
    if (err.code === "42P01") return null;
    throw err;
  }
  const admin = result.rows[0];
  if (!admin || !admin.is_active || admin.role !== PLATFORM_ROLE) return null;
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return null;
  return { ...admin, role: PLATFORM_ROLE, company_id: null, user_type: "PLATFORM" };
}

async function lookupClientDirectory(client, email) {
  await client.query("SELECT set_config('app.login_lookup', '1', true)");
  const result = await client.query(
    "SELECT email_lower, company_id, user_id, is_active FROM user_directory WHERE email_lower=lower($1) LIMIT 1",
    [email]
  );
  const row = result.rows[0];
  return row && row.is_active ? row : null;
}

async function tryClientLoginInTenant(client, email, password) {
  await client.query("SELECT set_config('app.login_lookup', '1', true)");
  const result = await client.query(
    "SELECT id, name, email, password_hash, role, company_id, is_active, coalesce(user_status,'ACTIVE') AS user_status, coalesce(password_must_change,false) AS password_must_change, invite_expires_at FROM app_users WHERE lower(email)=lower($1) LIMIT 1",
    [email]
  );
  const user = result.rows[0];
  if (!user || !user.is_active || user.user_status === "ARCHIVED") return null;
  if (!CLIENT_ROLES.has(user.role) || !user.company_id) return null;
  const company = await client.query("SELECT is_active FROM companies WHERE id=$1", [user.company_id]);
  if (!company.rows[0]?.is_active) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return { ...user, user_type: "CLIENT" };
}

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Number(process.env.AUTH_COOKIE_MAX_AGE_MS || 8 * 60 * 60 * 1000)
  };
}

function parseCookieHeader(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function tokenFromRequest(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return parseCookieHeader(req.headers.cookie || "").sanad_auth || null;
}

async function login(req, res) {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(12)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات الدخول غير صحيحة" });

  const { email, password } = parsed.data;
  let user = null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    user = await tryPlatformLogin(client, email, password);
    let dir = null;
    if (!user) dir = await lookupClientDirectory(client, email);
    await client.query("COMMIT");

    if (!user && dir?.company_id) {
      user = await withTenant(dir.company_id, tenantClient => tryClientLoginInTenant(tenantClient, email, password));
    }

    if (!user) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });

    const token = signAccessToken(user);
    await registerAuthSession(user, token);
    res.cookie("sanad_auth", token, authCookieOptions());
    return res.json({
      token: (config.NODE_ENV !== "production" || process.env.RETURN_BEARER_TOKEN_IN_LOGIN === "true") ? token : undefined,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id || null,
        userType: user.user_type || "CLIENT",
        name: user.name || "",
        mustChangePassword: Boolean(user.password_must_change)
      }
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Login error:", err.message);
    return res.status(500).json({ error: "تعذر تسجيل الدخول مؤقتًا" });
  } finally {
    client.release();
  }
}

function isValidTenantId(companyId) {
  return typeof companyId === "string" && /^company-[a-zA-Z0-9_-]{8,80}$/.test(companyId);
}

function rejectAuth(res, status = 401, code = "INVALID_SESSION") {
  return res.status(status).json({ code, error: "جلسة غير صالحة أو منتهية" });
}

async function validatePlatformSession(payload) {
  if (!assertStrictPayloadShape(payload)) return null;
  if (payload.role !== PLATFORM_ROLE || payload.userType !== "PLATFORM" || payload.companyId !== null) {
    return null;
  }

  return withPlatformScope(async client => {
    const result = await client.query(
      `SELECT id, email, role, is_active
       FROM platform_admins
       WHERE id=$1 AND lower(email)=lower($2) LIMIT 1`,
      [payload.id, payload.email]
    );
    const admin = result.rows[0];
    if (!admin || !admin.is_active || admin.role !== PLATFORM_ROLE) return null;

    const liveSession = await assertLiveAuthSession(client, payload, "PLATFORM", null);
    if (!liveSession) return null;

    return {
      id: admin.id,
      email: admin.email,
      role: PLATFORM_ROLE,
      companyId: null,
      userType: "PLATFORM",
      name: "",
      mustChangePassword: false
    };
  });
}

async function validateClientSession(payload) {
  if (!assertStrictPayloadShape(payload)) return null;
  if (payload.userType !== "CLIENT" || payload.role === PLATFORM_ROLE || !CLIENT_ROLES.has(payload.role)) {
    return null;
  }
  if (!isValidTenantId(payload.companyId)) return null;

  return withTenant(payload.companyId, async client => {
    const result = await client.query(
      `SELECT u.id, u.name, u.email, u.role, u.company_id, u.is_active,
              coalesce(u.user_status,'ACTIVE') AS user_status,
              coalesce(u.password_must_change,false) AS password_must_change,
              c.is_active AS company_active
       FROM app_users u
       JOIN companies c ON c.id=u.company_id
       WHERE u.id=$1 AND lower(u.email)=lower($2) AND u.company_id=$3
       LIMIT 1`,
      [payload.id, payload.email, payload.companyId]
    );
    const user = result.rows[0];
    if (!user || !user.is_active || user.user_status === "ARCHIVED" || !user.company_active) return null;
    if (user.role !== payload.role || !CLIENT_ROLES.has(user.role)) return null;
    const liveSession = await assertLiveAuthSession(client, payload, "CLIENT", payload.companyId);
    if (!liveSession) return null;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.company_id,
      userType: "CLIENT",
      name: user.name || "",
      mustChangePassword: Boolean(user.password_must_change)
    };
  });
}

function routeIsolationGuard(req, res, next) {
  const path = req.path || req.originalUrl || "";
  if (path.startsWith("/platform")) {
    if (!req.isPlatformAdmin || req.authScope !== "PLATFORM" || req.companyId !== null) {
      return res.status(403).json({ code: "PLATFORM_SCOPE_REQUIRED", error: "هذا المسار مخصص لأدمن سند فقط" });
    }
  }
  if (path === "/company" || path.startsWith("/company/")) {
    if (req.isPlatformAdmin || req.authScope !== "TENANT" || !req.companyId) {
      return res.status(403).json({ code: "TENANT_SCOPE_REQUIRED", error: "هذا المسار مخصص لمستخدمي الشركة فقط" });
    }
  }
  next();
}

async function authRequired(req, res, next) {
  const token = tokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "غير مصرح: سجل الدخول أولاً" });

  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      complete: false
    });

    if (!assertStrictPayloadShape(payload)) {
      return rejectAuth(res, 401, "STRICT_JWT_VALIDATION_FAILED");
    }

    const session = payload.userType === "PLATFORM"
      ? await validatePlatformSession(payload)
      : await validateClientSession(payload);

    if (!session) return rejectAuth(res, 401, "AUTH_CONTEXT_VALIDATION_FAILED");

    req.user = session;
    req.companyId = session.companyId;
    req.isPlatformAdmin = session.userType === "PLATFORM" && session.role === PLATFORM_ROLE && session.companyId === null;
    req.authScope = req.isPlatformAdmin ? "PLATFORM" : "TENANT";
    return next();
  } catch (err) {
    console.error("Auth verification blocked:", err.message);
    return rejectAuth(res);
  }
}

function tenantRequired(req, res, next) {
  if (req.isPlatformAdmin || req.authScope !== "TENANT" || !req.companyId) {
    return res.status(403).json({ code: "TENANT_SCOPE_REQUIRED", error: "هذا المسار مخصص لمستخدمي الشركة فقط" });
  }
  next();
}

function platformRequired(req, res, next) {
  if (!req.isPlatformAdmin || req.authScope !== "PLATFORM" || req.companyId !== null) {
    return res.status(403).json({ code: "PLATFORM_SCOPE_REQUIRED", error: "هذا المسار مخصص لأدمن سند فقط" });
  }
  next();
}

async function tryPlatformLoginWithoutPassword(client, email) {
  let result;
  await client.query("SAVEPOINT platform_login_lookup_nopass");
  try {
    result = await client.query(
      "SELECT id, email, role, is_active, '' AS name, false AS password_must_change FROM platform_admins WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    );
    await client.query("RELEASE SAVEPOINT platform_login_lookup_nopass");
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT platform_login_lookup_nopass").catch(() => {});
    if (err.code === "42P01") return null;
    throw err;
  }
  const admin = result.rows[0];
  if (!admin || !admin.is_active || admin.role !== PLATFORM_ROLE) return null;
  return { ...admin, role: PLATFORM_ROLE, company_id: null, user_type: "PLATFORM" };
}

async function tryClientLoginWithoutPassword(client, email) {
  await client.query("SELECT set_config('app.login_lookup', '1', true)");
  const result = await client.query(
    "SELECT id, name, email, role, company_id, is_active, coalesce(user_status,'ACTIVE') AS user_status, coalesce(password_must_change,false) AS password_must_change FROM app_users WHERE lower(email)=lower($1) LIMIT 1",
    [email]
  );
  const user = result.rows[0];
  if (!user || !user.is_active || user.user_status === "ARCHIVED") return null;
  if (!CLIENT_ROLES.has(user.role) || !user.company_id) return null;
  const company = await client.query("SELECT is_active FROM companies WHERE id=$1", [user.company_id]);
  if (!company.rows[0]?.is_active) return null;
  return { ...user, user_type: "CLIENT" };
}

module.exports = {
  login,
  authRequired,
  tenantRequired,
  platformRequired,
  routeIsolationGuard,
  signAccessToken,
  assertStrictPayloadShape,
  hashJwtId,
  registerAuthSession,
  authCookieOptions,
  lookupClientDirectory,
  tryPlatformLoginWithoutPassword,
  tryClientLoginWithoutPassword
};

