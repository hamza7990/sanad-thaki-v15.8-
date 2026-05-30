const SECRET_KEY_PATTERN = /(access[_-]?token|refresh[_-]?token|webhook[_-]?secret|authorization|password|jwt[_-]?secret|api[_-]?key|client[_-]?secret|tenant[_-]?kms|salla[_-]?access|salla[_-]?webhook)/ig;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/=:-]+/g;
const TOKEN_ASSIGNMENT_PATTERN = /("?(?:access[_-]?token|refresh[_-]?token|webhook[_-]?secret|authorization|password|jwt[_-]?secret|api[_-]?key|client[_-]?secret|tenant[_-]?kms|salla[_-]?access|salla[_-]?webhook)"?\s*[:=]\s*)("?)[^,"'\s}]+\2/ig;
const URL_SECRET_PATTERN = /([?&](?:access_token|token|password|secret|api_key)=)[^&\s]+/ig;
const MAX_LOG_LENGTH = 8_000;

function redactString(value) {
  return String(value)
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(TOKEN_ASSIGNMENT_PATTERN, '$1$2[REDACTED]$2')
    .replace(URL_SECRET_PATTERN, '$1[REDACTED]');
}

function redactObject(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value).slice(0, MAX_LOG_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message || ''),
      code: value.code,
      statusCode: value.statusCode,
      stack: process.env.NODE_ENV === 'production' ? '[REDACTED_STACK]' : redactString(value.stack || '')
    };
  }
  if (Buffer.isBuffer(value)) return `[Buffer length=${value.length}]`;
  if (depth > 5) return '[MAX_DEPTH]';
  if (typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 50).map(item => redactObject(item, depth + 1, seen));
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactObject(val, depth + 1, seen);
      }
      SECRET_KEY_PATTERN.lastIndex = 0;
    }
    return out;
  }
  return String(value);
}

function redactSecrets(value) {
  return redactObject(value);
}

function safeLogArg(arg) {
  if (typeof arg === 'string') return redactString(arg).slice(0, MAX_LOG_LENGTH);
  return redactObject(arg);
}

function installSecureConsoleRedaction() {
  if (global.__SANAD_SECURE_LOGGER_INSTALLED__) return;
  global.__SANAD_SECURE_LOGGER_INSTALLED__ = true;
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level].bind(console);
    console[level] = (...args) => original(...args.map(safeLogArg));
  }
}

function logSecurityEvent(event, metadata = {}) {
  console.warn(`[SECURITY] ${event}`, redactObject(metadata));
}

module.exports = {
  redactSecrets,
  installSecureConsoleRedaction,
  logSecurityEvent
};
