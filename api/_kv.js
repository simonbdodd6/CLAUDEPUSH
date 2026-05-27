// api/_kv.js — Upstash Redis REST client
// Zero extra dependencies — uses native fetch (Node 18+ / Vercel edge runtime).
// Docs: https://upstash.com/docs/redis/overall/restapi

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Execute a single Redis command via Upstash REST.
 * Uses POST / with JSON body — handles complex values safely.
 */
async function redis(command, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Upstash Redis not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
  }
  const res = await fetch(REDIS_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${REDIS_TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify([command.toUpperCase(), ...args]),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash HTTP ${res.status}: ${text}`);
  }
  const { result, error } = await res.json();
  if (error) throw new Error(`Redis error: ${error}`);
  return result;
}

/** Get a JSON value, or null if missing */
export async function kvGet(key) {
  const raw = await redis('GET', key);
  if (raw == null) return null;
  try { return JSON.parse(raw); }
  catch { return raw; }
}

/** Set a JSON value, optionally with TTL in seconds */
export async function kvSet(key, value, ttlSeconds) {
  const serialised = JSON.stringify(value);
  if (ttlSeconds) return redis('SET', key, serialised, 'EX', String(ttlSeconds));
  return redis('SET', key, serialised);
}

/** Delete a key */
export async function kvDel(key) {
  return redis('DEL', key);
}

/** Prepend an item to a Redis list (newest first) */
export async function kvLpush(key, value) {
  return redis('LPUSH', key, JSON.stringify(value));
}

/** Read a range from a Redis list */
export async function kvLrange(key, start = 0, end = 99) {
  const items = await redis('LRANGE', key, String(start), String(end));
  if (!Array.isArray(items)) return [];
  return items.map(i => {
    try { return JSON.parse(i); } catch { return i; }
  });
}

/** Trim a list to at most `maxLen` items (keep newest) */
export async function kvLtrim(key, maxLen = 200) {
  return redis('LTRIM', key, '0', String(maxLen - 1));
}

export default redis;
