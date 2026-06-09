/**
 * Data Cache
 *
 * In-memory TTL cache for query results.
 * Mock data: TTL 60s (short — data doesn't change but keeps memory fresh)
 * Live data: TTL 30s (respect upstream rate limits)
 */

const _cache  = new Map();   // key → { value, expiresAt }
const _stats  = { hits: 0, misses: 0, sets: 0, evictions: 0 };

const DEFAULT_TTL_MOCK = 60_000;   // 60 seconds
const DEFAULT_TTL_LIVE = 30_000;   // 30 seconds

export function get(key) {
  const entry = _cache.get(key);
  if (!entry) { _stats.misses++; return null; }
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    _stats.evictions++;
    _stats.misses++;
    return null;
  }
  _stats.hits++;
  return entry.value;
}

export function set(key, value, ttlMs = DEFAULT_TTL_MOCK) {
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs, setAt: Date.now() });
  _stats.sets++;
}

export function has(key) {
  return get(key) !== null;
}

export function invalidate(key) {
  return _cache.delete(key);
}

export function invalidatePattern(pattern) {
  let count = 0;
  for (const k of _cache.keys()) {
    if (k.includes(pattern)) { _cache.delete(k); count++; }
  }
  return count;
}

export function clear() {
  const size = _cache.size;
  _cache.clear();
  return size;
}

export function stats() {
  const total = _stats.hits + _stats.misses;
  return {
    size:     _cache.size,
    hits:     _stats.hits,
    misses:   _stats.misses,
    sets:     _stats.sets,
    evictions: _stats.evictions,
    hitRate:  total > 0 ? Math.round((_stats.hits / total) * 100) : 0,
  };
}

/**
 * Cache key builder for consistent naming.
 */
export function cacheKey(sourceName, params = {}) {
  const paramsStr = Object.entries(params)
    .filter(([, v]) => v != null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join('&');
  return paramsStr ? `${sourceName}:${paramsStr}` : sourceName;
}

export const TTL = {
  MOCK: DEFAULT_TTL_MOCK,
  LIVE: DEFAULT_TTL_LIVE,
  LONG: 300_000,   // 5 minutes — for slowly-changing data like membership lists
};
