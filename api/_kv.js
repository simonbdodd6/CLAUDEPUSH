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

function urlValid(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

// ─── WHICH STORAGE THIS DEPLOYMENT MAY TOUCH (Build 135) ───────────────────
//
// Preview deployments used to read the same UPSTASH_REDIS_REST_* variables as
// production — and the project's Preview environment carries production's
// values — so unreleased branch code read and wrote live clubs' data. The
// environment now decides the storage target, here, at the one place every
// command passes through, and an unsafe combination FAILS CLOSED:
//
//   production  (VERCEL_ENV=production)  → UPSTASH_REDIS_REST_*, keys unchanged
//   preview     (VERCEL_ENV=preview)     → PREVIEW_UPSTASH_REDIS_REST_* ONLY,
//                                           every key under "preview:"
//   development (VERCEL_ENV=development) → UPSTASH_REDIS_REST_* (vercel dev)
//   local       (not on Vercel)          → UPSTASH_REDIS_REST_* (tests, dev)
//
// A Preview deployment is REFUSED storage — nothing is read or written — when
// its PREVIEW_* variables are missing, or name the same database (URL or
// token) as UPSTASH_REDIS_REST_*, which is production's. Running on Vercel
// with no recognisable VERCEL_ENV is ambiguous and refused too. The "preview:"
// key namespace is a second, independent wall: even a Preview pointed at a
// shared database by mistake could never address a production key.
// Read at call time, not module load, so a misconfiguration is re-checked on
// every request and tests can vary it.
export const PREVIEW_NAMESPACE = 'preview:';

export function storageEnvironment() {
  const env = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  if (env === 'production' || env === 'preview' || env === 'development') return env;
  if (env) return 'ambiguous';                                   // an unknown value is not production
  if (String(process.env.VERCEL || '').trim()) return 'ambiguous'; // on Vercel, VERCEL_ENV is always set
  return 'local';
}

/** Comparable identity of a storage URL: scheme + host + port + path, case-folded. */
function storageIdentity(url) {
  try {
    const u = new URL(String(url || '').trim());
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch { return ''; }
}

/**
 * The storage this process may use, or a refusal. Never throws; callers that
 * need storage turn a refusal into the fixed 503. `reason` is a fixed enum —
 * safe to log; no variable's VALUE ever appears in it.
 */
export function storageTarget() {
  const environment = storageEnvironment();
  const prodUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const prodToken = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (environment === 'ambiguous') return { ok: false, environment, reason: 'environment_ambiguous' };
  if (environment !== 'preview') {
    if (!prodToken) return { ok: false, environment, reason: 'token_missing' };
    if (!urlValid(prodUrl)) return { ok: false, environment, reason: 'url_invalid' };
    return { ok: true, environment, url: prodUrl, token: prodToken, namespace: '', reason: null };
  }
  const url = String(process.env.PREVIEW_UPSTASH_REDIS_REST_URL || '').trim();
  const token = String(process.env.PREVIEW_UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return { ok: false, environment, reason: 'preview_storage_unconfigured' };
  if (!urlValid(url)) return { ok: false, environment, reason: 'url_invalid' };
  const sameDatabase = (prodUrl && storageIdentity(url) === storageIdentity(prodUrl)) || (prodToken && token === prodToken);
  if (sameDatabase) return { ok: false, environment, reason: 'preview_targets_production' };
  return { ok: true, environment, url, token, namespace: PREVIEW_NAMESPACE, reason: null };
}

/** True only when this environment has storage it may safely use.
 *  A pasted token line in the URL field must read as NOT configured. */
export function kvConfigured() {
  return storageTarget().ok;
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
// Which arguments of each command are KEYS (namespaced in Preview). A command
// not listed here is refused in a namespaced environment rather than sent with
// an un-namespaced key.
const KEY_ARGS = {
  GET: [0], SET: [0], DEL: 'all', LPUSH: [0], LRANGE: [0], LTRIM: [0], EXPIRE: [0], RENAME: [0, 1],
};

function namespaced(target, command, args) {
  if (!target.namespace) return args;
  const cmd = command.toUpperCase();
  const ns = target.namespace;
  if (cmd === 'SCAN') {
    const out = [...args];
    const i = out.findIndex(a => String(a).toUpperCase() === 'MATCH');
    if (i < 0 || i + 1 >= out.length) throw storageError('SCAN without MATCH refused in a namespaced environment');
    out[i + 1] = ns + out[i + 1];
    return out;
  }
  const spec = KEY_ARGS[cmd];
  if (!spec) throw storageError(`${cmd} is not namespaced — refused`);
  return args.map((a, idx) => (spec === 'all' || spec.includes(idx)) ? ns + a : a);
}

async function redis(command, ...rawArgs) {
  const target = storageTarget();
  if (!target.ok) throw storageError(`storage refused (${target.environment}: ${target.reason})`);
  const { url, token } = target;
  const args = namespaced(target, command, rawArgs);
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
  // A namespaced SCAN answers with physical keys; callers only ever see logical ones.
  if (target.namespace && command.toUpperCase() === 'SCAN' && Array.isArray(result?.[1])) {
    return [result[0], result[1].filter(k => String(k).startsWith(target.namespace)).map(k => String(k).slice(target.namespace.length))];
  }
  return result;
}

/**
 * Read-only reachability probe: GETs a nonexistent key. Success proves URL and
 * token are both good. `code` is a fixed enum — safe for client display.
 */
export async function kvHealthCheck() {
  const target = storageTarget();
  if (!target.ok) {
    if (target.reason === 'preview_targets_production' || target.reason === 'environment_ambiguous') return { ok: false, code: 'refused' };
    return { ok: false, code: target.reason === 'url_invalid' ? 'bad-url' : 'unconfigured' };
  }
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${target.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', `${target.namespace}__healthcheck__`]),
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

/** Rename a key (atomic swap onto the destination). Build 135: routed here so
 *  the environment guard and namespace apply — it used to be a raw request. */
export async function kvRename(from, to) {
  return redis('RENAME', from, to);
}

/** Set a key's TTL in seconds. */
export async function kvExpire(key, seconds) {
  return redis('EXPIRE', key, String(seconds));
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
