const { randomBytes } = require("crypto");
function safeRequire(name) { try { return require(name); } catch { return null; } }

let redisClient = null;

function getRedisClient() {
  if (redisClient) return redisClient;
  const Redis = safeRequire("ioredis");
  if (!Redis) {
    if (process.env.NODE_ENV === "production") throw new Error("ioredis is required in production");
    return null;
  }
  if (!process.env.REDIS_URL) {
    if (process.env.NODE_ENV === "production") throw new Error("REDIS_URL is required in production");
    return null;
  }
  redisClient = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    retryStrategy(times) { return Math.min(times * 100, 1000); }
  });
  redisClient.on("error", () => {});
  return redisClient;
}

const inMemoryLocks = new Map();

async function acquireRedisLock(key, ttlMs = 300000) {
  const lockKey = `sanad:lock:${String(key || "default")}`;
  const token = `${process.pid}:${Date.now()}:${randomBytes(16).toString("hex")}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      const ok = await redis.set(lockKey, token, "PX", ttlMs, "NX");
      return ok === "OK" ? { acquired: true, token, key: lockKey, redis: true } : { acquired: false, key: lockKey, redis: true };
    } catch (err) {
      if (process.env.NODE_ENV === "production") throw err;
    }
  }
  const expiresAt = inMemoryLocks.get(lockKey) || 0;
  if (expiresAt > Date.now()) return { acquired: false, key: lockKey, redis: false };
  inMemoryLocks.set(lockKey, Date.now() + ttlMs);
  return { acquired: true, token, key: lockKey, redis: false };
}

async function releaseRedisLock(lock) {
  if (!lock?.acquired) return;
  if (lock.redis) {
    const redis = getRedisClient();
    if (!redis) return;
    const script = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    await redis.eval(script, 1, lock.key, lock.token).catch(() => {});
  } else {
    inMemoryLocks.delete(lock.key);
  }
}

async function incrementWindowCounter(key, windowSeconds) {
  const redis = getRedisClient();
  const safeKey = `sanad:counter:${String(key || "default")}`;
  if (redis) {
    try {
      const count = await redis.incr(safeKey);
      if (count === 1) await redis.expire(safeKey, windowSeconds);
      return Number(count);
    } catch (err) {
      if (process.env.NODE_ENV === "production") throw err;
    }
  }
  const now = Date.now();
  const current = inMemoryLocks.get(safeKey) || { count: 0, resetAt: now + windowSeconds * 1000 };
  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + windowSeconds * 1000;
  }
  current.count += 1;
  inMemoryLocks.set(safeKey, current);
  return current.count;
}

module.exports = { getRedisClient, acquireRedisLock, releaseRedisLock, incrementWindowCounter };
