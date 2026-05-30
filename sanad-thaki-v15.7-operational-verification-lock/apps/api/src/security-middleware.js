const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { logSecurityEvent } = require("./secure-logger");

function safeRequire(name) { try { return require(name); } catch { return null; } }

function createSharedRateLimitStore(prefix) {
  const production = process.env.NODE_ENV === "production";
  if (!process.env.REDIS_URL) {
    if (production) throw new Error("REDIS_URL is required in production for shared rate limiting");
    return undefined;
  }

  // In development/test we intentionally fall back to the in-memory store unless
  // explicitly requested. This keeps local health checks and smoke tests from
  // crashing when Redis is not running, while production remains strict.
  if (!production && process.env.USE_REDIS_RATE_LIMIT_IN_DEV !== "true") {
    return undefined;
  }

  const Redis = safeRequire("ioredis");
  const RateLimitRedis = safeRequire("rate-limit-redis");
  if (!Redis || !RateLimitRedis) {
    if (production) throw new Error("ioredis and rate-limit-redis are required in production for shared rate limiting");
    logSecurityEvent("REDIS_RATE_LIMIT_STORE_UNAVAILABLE_FALLING_BACK_TO_MEMORY", { prefix });
    return undefined;
  }
  const client = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    retryStrategy(times) { return Math.min(times * 100, 1000); }
  });
  client.on("error", err => logSecurityEvent("REDIS_RATE_LIMIT_CLIENT_ERROR", { error: err.message, prefix }));
  client.connect().catch(err => logSecurityEvent("REDIS_RATE_LIMIT_CONNECT_WARNING", { error: err.message, prefix }));
  const RedisStore = RateLimitRedis.RedisStore || RateLimitRedis.default || RateLimitRedis;
  return new RedisStore({
    sendCommand: (...args) => client.call(...args),
    prefix: `sanad:${prefix}:`
  });
}

function enforceHttps(req, res, next) {
  const enabled = process.env.ENFORCE_HTTPS === "true" || (process.env.NODE_ENV === "production" && process.env.ENFORCE_HTTPS !== "false");
  if (!enabled) return next();

  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "").split(",")[0].trim().toLowerCase();
  const isHttps = req.secure || proto === "https";
  if (isHttps) return next();

  const host = req.headers.host;
  if (!host) return res.status(400).json({ error: "HOST_HEADER_REQUIRED" });
  const target = `https://${host}${req.originalUrl || req.url || ""}`;
  logSecurityEvent("HTTP_REQUEST_BLOCKED_REDIRECT_TO_HTTPS", { ip: req.ip, path: req.originalUrl });
  return res.redirect(308, target);
}

function productionSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        // v14.3.7: UI handlers are bound through addEventListener; inline scripts/styles are blocked.
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: false
    },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-site" },
    noSniff: true,
    dnsPrefetchControl: { allow: false },
    permittedCrossDomainPolicies: { permittedPolicies: "none" }
  });
}

const globalApiLimiter = rateLimit({
  store: createSharedRateLimitStore("global"),
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_GLOBAL_PER_MINUTE || 180),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "تم تجاوز حد الطلبات مؤقتًا" }
});

const loginLimiter = rateLimit({
  store: createSharedRateLimitStore("login"),
  windowMs: 15 * 60 * 1000,
  // In development/test, allow many more attempts to avoid blocking during testing
  limit: process.env.NODE_ENV === "production"
    ? Number(process.env.RATE_LIMIT_LOGIN_PER_15_MIN || 10)
    : Number(process.env.RATE_LIMIT_LOGIN_PER_15_MIN || 200),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { error: "تم تجاوز محاولات الدخول. حاول لاحقًا." },
  handler(req, res, _next, options) {
    logSecurityEvent("LOGIN_RATE_LIMIT_TRIGGERED", {
      ip: req.ip,
      emailHint: typeof req.body?.email === "string" ? req.body.email.slice(0, 3) + "***" : undefined
    });
    return res.status(options.statusCode).json(options.message);
  }
});

const webhookLimiter = rateLimit({
  store: createSharedRateLimitStore("webhook"),
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_WEBHOOK_PER_MINUTE || 30),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "تم تجاوز حد طلبات Webhook مؤقتًا" },
  handler(req, res, _next, options) {
    logSecurityEvent("WEBHOOK_RATE_LIMIT_TRIGGERED", { ip: req.ip, path: req.originalUrl });
    return res.status(options.statusCode).json(options.message);
  }
});

const bankStatementLimiter = rateLimit({
  store: createSharedRateLimitStore("bank-upload"),
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_BANK_UPLOAD_PER_MINUTE || 5),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "تم تجاوز حد رفع كشوف البنك مؤقتًا" },
  handler(req, res, _next, options) {
    logSecurityEvent("BANK_STATEMENT_RATE_LIMIT_TRIGGERED", { companyId: req.companyId, userId: req.user?.id, ip: req.ip });
    return res.status(options.statusCode).json(options.message);
  }
});

const accountingImportLimiter = rateLimit({
  store: createSharedRateLimitStore("accounting-import"),
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_ACCOUNTING_IMPORT_PER_MINUTE || 4),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "تم تجاوز حد استيراد الفواتير المحاسبية مؤقتًا" },
  handler(req, res, _next, options) {
    logSecurityEvent("ACCOUNTING_IMPORT_RATE_LIMIT_TRIGGERED", { companyId: req.companyId, userId: req.user?.id, ip: req.ip });
    return res.status(options.statusCode).json(options.message);
  }
});

module.exports = {
  enforceHttps,
  productionSecurityHeaders,
  globalApiLimiter,
  loginLimiter,
  webhookLimiter,
  bankStatementLimiter,
  accountingImportLimiter
};
