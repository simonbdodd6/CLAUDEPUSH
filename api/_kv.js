// api/_kv.js — Upstash Redis REST client
// Zero extra dependencies — uses native fetch (Node 18+ / Vercel edge runtime).
// Docs: https://upstash.com/docs/redis/overall/restapi
//
// Failure policy (launch blocker, 2026-08-05): storage errors thrown from here
// carry status 503 and a FIXED, client-safe message. Handlers echo error
// messages to browsers, and the raw upstream text once carried a mispasted env
// value — a token — to every unauthenticated caller. No env value, upstream
// response body or URL may ever appear in a thrown message. Sanitised detail
// goes to the server log only.

// Read at call time, not module load, so tests can vary configuration and a
// misconfigured value is re-checked on every request.
function redisUrl()   { return String(process.env.UPSTASH_REDIS_REST_URL || '').trim(); }
function redisToken() { return String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(); }

function urlValid(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

/** True only when the URL parses as a real http(s) URL AND a token is present.
 *  A pasted token line in the URL field must read as NOT configured. */
export function kvConfigured() {
  return Boolean(redisToken()) && urlValid(redisUrl());
}

/** The one storage error clients may ever see. */
function storageError(logDetail) {
  if (logDetail) console.error(`[kv] storage unavailable: ${logDetail}`);
  const error = new Error('Storage temporarily unavailable');
  error.status = 503;
  error.code = 'STORAGE_UNAVAILABLE';
  return error;
}

/**
 * Execute a single Redis command via Upstash REST.
 * Uses POST / with JSON body — handles complex values safely.
 */
async function redis(command, ...args) {
  const url = redisUrl();
  const token = redisToken();
  if (!token) throw storageError('UPSTASH_REDIS_REST_TOKEN is not set');
  if (!urlValid(url)) throw storageError('UPSTASH_REDIS_REST_URL is not a valid http(s) URL');
  let res;
  try {
    res = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify([command.toUpperCase(), ...args]),
    });
  } catch (cause) {
    // Network/DNS/parse failure — the cause can embed the URL; log the class only.
    throw storageError(`request failed (${cause?.name || 'FetchError'})`);
  }
  if (!res.ok) {
    // 401/403 = bad token; anything else = Upstash-side trouble. Status only —
    // never the response body, which is upstream-controlled text.
    throw storageError(`Upstash responded HTTP ${res.status}`);
  }
  const { result, error } = await res.json();
  if (error) throw storageError(`Redis command error (${String(command).toUpperCase()})`);
  return result;
}

/**
 * Read-only reachability probe: GETs a nonexistent key. Success proves URL and
 * token are both good. `code` is a fixed enum — safe for client display.
 */
export async function kvHealthCheck() {
  if (!redisToken() || !urlValid(redisUrl())) {
    return { ok: false, code: !redisToken() ? 'unconfigured' : 'bad-url' };
  }
  try {
    const res = await fetch(redisUrl(), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${redisToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', '__healthcheck__']),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, code: 'unauthorized' };
    if (!res.ok) return { ok: false, code: 'error' };
    return { ok: true, code: 'ok' };
  } catch {
    return { ok: false, code: 'unreachable' };
  }
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

/**
 * Atomic single-flight lock: SET key only if it does NOT already exist (NX), with a
 * TTL (EX, seconds) so a crashed holder can never wedge it forever. Returns true if
 * this caller acquired the lock, false if another holder already has it.
 */
export async function kvSetNX(key, value, ttlSeconds) {
  return (await redis('SET', key, JSON.stringify(value), 'NX', 'EX', String(ttlSeconds))) === 'OK';
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

/** Find Redis keys matching a prefix pattern, used for recent availability responses. */
export async function kvScanKeys(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const page = await redis('SCAN', cursor, 'MATCH', pattern, 'COUNT', '250');
    cursor = String(page?.[0] ?? '0');
    if (Array.isArray(page?.[1])) keys.push(...page[1]);
  } while (cursor !== '0');
  return [...new Set(keys)];
}

export default redis;
