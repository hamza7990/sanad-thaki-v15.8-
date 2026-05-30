const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(10),
  PROVISIONER_DATABASE_URL: z.string().optional(),
  TENANT_DATABASE_URL_TEMPLATE: z.string().optional(),
  SECRETS_PROVIDER: z.enum(["local", "env", "aws"]).default("local"),
  LOCAL_TENANT_SECRET_DIR: z.string().optional(),
  JWT_SECRET: z.string().min(64),
  REFRESH_TOKEN_SECRET: z.string().min(64),
  ALLOW_DEMO_LOGIN: z.enum(["true", "false"]).default("false"),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost"),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_DOCUMENT_AI_PROCESSOR_NAME: z.string().optional(),
  GOOGLE_DOCUMENT_AI_API_ENDPOINT: z.string().optional(),
  WHATSAPP_MODE: z.string().default("disabled"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  REQUIRE_DATABASE_PER_TENANT: z.enum(["true", "false"]).default("false"),
  TENANT_DATABASE_URLS_JSON: z.string().optional(),
  REQUIRE_TENANT_KMS: z.enum(["true", "false"]).default("false"),
  TENANT_KMS_KEYS_JSON: z.string().optional(),
  TENANT_KMS_SECRET_REFS_JSON: z.string().optional(),
  DEFAULT_TENANT_KMS_KEY: z.string().optional(),
  TENANT_ISOLATION_ENFORCEMENT: z.enum(["strict", "staging", "dev"]).default("strict"),
  PUBLIC_APP_URL: z.string().optional(),
  SALLA_WEBHOOK_SECRETS_JSON: z.string().optional(),
  SALLA_ACCESS_TOKENS_JSON: z.string().optional(),
  ENFORCE_HTTPS: z.enum(["true", "false"]).default("true"),
  WEBHOOK_REQUIRE_TIMESTAMP: z.enum(["true", "false"]).default("false"),
  TRUST_X_FORWARDED_PROTO: z.enum(["true", "false"]).default("true"),
  REDIS_URL: z.string().optional(),
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.string().optional(),
  RATE_LIMIT_LOGIN_PER_15_MIN: z.string().optional(),
  RATE_LIMIT_WEBHOOK_PER_MINUTE: z.string().optional(),
  RATE_LIMIT_BANK_UPLOAD_PER_MINUTE: z.string().optional(),
  SETUP_BOOTSTRAP_TOKEN: z.string().optional(),
  INTERNAL_HEALTH_BEARER_TOKEN: z.string().optional(),
  METRICS_BEARER_TOKEN: z.string().optional(),
  REQUIRE_SECRETS_MANAGER_SMOKE_TEST: z.enum(["true", "false"]).default("false"),
  SECRETS_MANAGER_SMOKE_TEST: z.enum(["true", "false"]).default("false"),
  RETURN_BEARER_TOKEN_IN_LOGIN: z.enum(["true", "false"]).default("false"),
  INTEGRATION_KEY_RATE_LIMIT_PER_MINUTE: z.string().optional()
});

let cachedConfig = null;

function parseJsonObjectEnv(name, value) {
  if (!value) return {};
  try {
    const parsedJson = JSON.parse(value);
    if (!parsedJson || typeof parsedJson !== "object" || Array.isArray(parsedJson)) {
      throw new Error(`${name} must be a JSON object`);
    }
    return parsedJson;
  } catch (err) {
    console.error(`${name} must be a valid JSON object.`);
    process.exit(1);
  }
}

function loadConfig() {
  if (cachedConfig) return cachedConfig;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Environment validation failed:", parsed.error.issues);
    process.exit(1);
  }

  const cfg = parsed.data;
  const tenantDbMap = parseJsonObjectEnv("TENANT_DATABASE_URLS_JSON", cfg.TENANT_DATABASE_URLS_JSON || "{}");
  const tenantKmsMap = parseJsonObjectEnv("TENANT_KMS_KEYS_JSON", cfg.TENANT_KMS_KEYS_JSON || "{}");
  const tenantKmsSecretRefsMap = parseJsonObjectEnv("TENANT_KMS_SECRET_REFS_JSON", cfg.TENANT_KMS_SECRET_REFS_JSON || "{}");
  const sallaWebhookSecretsMap = parseJsonObjectEnv("SALLA_WEBHOOK_SECRETS_JSON", cfg.SALLA_WEBHOOK_SECRETS_JSON || "{}");
  const sallaAccessTokensMap = parseJsonObjectEnv("SALLA_ACCESS_TOKENS_JSON", cfg.SALLA_ACCESS_TOKENS_JSON || "{}");

  const forbidden = [
    "CHANGE_ME_64_CHARS_MINIMUM_RANDOM_VALUE_CHANGE_ME_64_CHARS",
    "CHANGE_ME_64_CHARS_MINIMUM_RANDOM_VALUE_REFRESH_CHANGE_ME"
  ];

  if (cfg.NODE_ENV === "production") {
    if (forbidden.includes(cfg.JWT_SECRET) || forbidden.includes(cfg.REFRESH_TOKEN_SECRET)) {
      console.error("Production secrets must be changed before startup.");
      process.exit(1);
    }
    if (cfg.ALLOW_DEMO_LOGIN === "true") {
      console.error("ALLOW_DEMO_LOGIN=true is blocked in production.");
      process.exit(1);
    }
    if (!cfg.REDIS_URL) {
      console.error("Production startup blocked: REDIS_URL is mandatory for shared rate limiting across instances.");
      process.exit(1);
    }
    if (cfg.REQUIRE_DATABASE_PER_TENANT !== "true") {
      console.error("Production startup blocked: REQUIRE_DATABASE_PER_TENANT=true is mandatory.");
      process.exit(1);
    }
    if (!cfg.PROVISIONER_DATABASE_URL) {
      console.error("Production startup blocked: PROVISIONER_DATABASE_URL is mandatory for real Database-per-Tenant provisioning.");
      process.exit(1);
    }
    if (cfg.SECRETS_PROVIDER !== "aws") {
      console.error("Production startup blocked: SECRETS_PROVIDER=aws is mandatory for production tenant routing and KMS/data-key storage.");
      process.exit(1);
    }
    if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
      console.error("Production startup blocked: AWS_REGION or AWS_DEFAULT_REGION is required for AWS Secrets Manager.");
      process.exit(1);
    }
    if (!cfg.PUBLIC_APP_URL || !cfg.PUBLIC_APP_URL.startsWith("https://")) {
      console.error("Production startup blocked: PUBLIC_APP_URL must be https://...");
      process.exit(1);
    }
    if (cfg.ENFORCE_HTTPS !== "false" && !cfg.CORS_ORIGIN.split(",").every(v => !v.trim() || v.trim().startsWith("https://"))) {
      console.error("Production startup blocked: CORS_ORIGIN must contain only https:// origins.");
      process.exit(1);
    }
    if (cfg.REQUIRE_TENANT_KMS !== "true") {
      console.error("Production startup blocked: REQUIRE_TENANT_KMS=true is mandatory.");
      process.exit(1);
    }
    if (cfg.DEFAULT_TENANT_KMS_KEY) {
      console.error("Production startup blocked: DEFAULT_TENANT_KMS_KEY is forbidden.");
      process.exit(1);
    }
    if (!cfg.SETUP_BOOTSTRAP_TOKEN || cfg.SETUP_BOOTSTRAP_TOKEN.length < 32) {
      console.error("Production startup blocked: SETUP_BOOTSTRAP_TOKEN must be at least 32 chars for first-admin bootstrap.");
      process.exit(1);
    }
    if (!cfg.INTERNAL_HEALTH_BEARER_TOKEN && !cfg.METRICS_BEARER_TOKEN) {
      console.error("Production startup blocked: INTERNAL_HEALTH_BEARER_TOKEN or METRICS_BEARER_TOKEN is required for internal readiness details.");
      process.exit(1);
    }
    if (cfg.SECRETS_PROVIDER === "env" && Object.keys(tenantKmsMap).length === 0 && Object.keys(tenantKmsSecretRefsMap).length === 0) {
      console.error("Production startup blocked: env secret provider requires tenant key maps or secret refs.");
      process.exit(1);
    }
  }

  cachedConfig = {
    ...cfg,
    tenantDbMap,
    tenantKmsMap,
    tenantKmsSecretRefsMap,
    sallaWebhookSecretsMap,
    sallaAccessTokensMap,
    corsOrigins: cfg.CORS_ORIGIN.split(",").map(v => v.trim()).filter(Boolean)
  };
  return cachedConfig;
}

module.exports = { loadConfig };
