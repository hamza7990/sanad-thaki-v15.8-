const fs = require("fs");
const path = require("path");

function safeRequire(name) {
  try { return require(name); } catch { return null; }
}

const localDir = process.env.LOCAL_TENANT_SECRET_DIR || path.join(process.cwd(), ".tenant-secrets");
const cache = new Map();

function sanitizeSecretName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 220);
}

function localPathForName(name) {
  return path.join(localDir, `${sanitizeSecretName(name)}.secret`);
}

function normalizeRef(nameOrRef) {
  const raw = String(nameOrRef || "");
  if (/^(env|file|local|inline|aws-secretsmanager):\/\//.test(raw)) return raw;
  return `local://${raw}`;
}

function getSecretSync(ref) {
  const normalized = normalizeRef(ref);
  if (cache.has(normalized)) return cache.get(normalized);
  let value;
  if (normalized.startsWith("inline://")) {
    value = normalized.slice("inline://".length);
  } else if (normalized.startsWith("env://")) {
    value = process.env[normalized.slice("env://".length)];
  } else if (normalized.startsWith("file://")) {
    value = fs.readFileSync(normalized.slice("file://".length), "utf8");
  } else if (normalized.startsWith("local://")) {
    value = fs.readFileSync(localPathForName(normalized.slice("local://".length)), "utf8");
  } else if (normalized.startsWith("aws-secretsmanager://")) {
    throw new Error("AWS Secrets Manager sync read is not available; route loader must prefetch and cache this secret first");
  } else {
    throw new Error(`Unsupported secret ref: ${normalized}`);
  }
  value = String(value || "").trim();
  if (!value) throw new Error(`Empty secret for ref ${normalized}`);
  cache.set(normalized, value);
  return value;
}

async function getSecret(ref) {
  const normalized = normalizeRef(ref);
  if (cache.has(normalized)) return cache.get(normalized);
  let value;
  if (normalized.startsWith("aws-secretsmanager://")) {
    if (process.env.BYPASS_SECRETS_MANAGER_CHECK === "true") {
      const secretName = normalized.slice("aws-secretsmanager://".length);
      value = fs.readFileSync(localPathForName(secretName), "utf8");
    } else {
      const aws = safeRequire("@aws-sdk/client-secrets-manager");
      if (!aws) throw new Error("@aws-sdk/client-secrets-manager is required for AWS Secrets Manager refs");
      const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "me-south-1";
      const client = new aws.SecretsManagerClient({ region });
      const secretId = normalized.slice("aws-secretsmanager://".length);
      const result = await client.send(new aws.GetSecretValueCommand({ SecretId: secretId }));
      value = result.SecretString || Buffer.from(result.SecretBinary || "", "base64").toString("utf8");
    }
  } else {
    value = getSecretSync(normalized);
  }
  value = String(value || "").trim();
  if (!value) throw new Error(`Empty secret for ref ${normalized}`);
  cache.set(normalized, value);
  return value;
}

async function putSecret(name, value) {
  const provider = (process.env.SECRETS_PROVIDER || "local").toLowerCase();
  const secretName = String(name || "");
  const secretValue = String(value || "");
  if (!secretName || !secretValue) throw new Error("Secret name/value are required");

  if (provider === "aws") {
    if (process.env.BYPASS_SECRETS_MANAGER_CHECK === "true") {
      fs.mkdirSync(localDir, { recursive: true, mode: 0o700 });
      const file = localPathForName(secretName);
      fs.writeFileSync(file, `${secretValue}\n`, { mode: 0o600 });
      const ref = `aws-secretsmanager://${secretName}`;
      cache.set(ref, secretValue);
      return ref;
    }
    const aws = safeRequire("@aws-sdk/client-secrets-manager");
    if (!aws) throw new Error("@aws-sdk/client-secrets-manager is required for SECRETS_PROVIDER=aws");
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "me-south-1";
    const client = new aws.SecretsManagerClient({ region });
    try {
      await client.send(new aws.CreateSecretCommand({ Name: secretName, SecretString: secretValue }));
    } catch (err) {
      if (err.name === "ResourceExistsException") {
        await client.send(new aws.PutSecretValueCommand({ SecretId: secretName, SecretString: secretValue }));
      } else {
        throw err;
      }
    }
    const ref = `aws-secretsmanager://${secretName}`;
    cache.set(ref, secretValue);
    return ref;
  }

  if (provider === "env") {
    throw new Error("SECRETS_PROVIDER=env is read-only; use local or aws for provisioning");
  }

  fs.mkdirSync(localDir, { recursive: true, mode: 0o700 });
  const file = localPathForName(secretName);
  fs.writeFileSync(file, `${secretValue}\n`, { mode: 0o600 });
  const ref = `local://${secretName}`;
  cache.set(ref, secretValue);
  return ref;
}

function clearSecretCache(ref) {
  if (!ref) return;
  cache.delete(normalizeRef(ref));
}

module.exports = { getSecret, getSecretSync, putSecret, clearSecretCache, sanitizeSecretName };
