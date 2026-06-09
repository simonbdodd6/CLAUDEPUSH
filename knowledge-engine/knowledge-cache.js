// TTL cache for Knowledge Engine query results.
// Keyed by query text + options hash. Supports domain-level invalidation.

const _store   = new Map();  // key → { value, expiresAt, domain, hitCount }
const TTL_MS   = { default: 5 * 60 * 1000, fresh: 30 * 1000, long: 30 * 60 * 1000 };

function _key(query, options = {}) {
  return `${query.toLowerCase().trim()}|${JSON.stringify(options)}`;
}

export function get(query, options = {}) {
  const entry = _store.get(_key(query, options));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _store.delete(_key(query, options)); return null; }
  entry.hitCount++;
  return entry.value;
}

export function set(query, value, options = {}, ttl = TTL_MS.default) {
  const domain = value?.domain ?? options?.domain ?? 'general';
  _store.set(_key(query, options), {
    value,
    expiresAt: Date.now() + ttl,
    domain,
    hitCount:  0,
    storedAt:  new Date().toISOString(),
  });
}

export function has(query, options = {}) {
  return get(query, options) !== null;
}

export function invalidate(domain = null) {
  let count = 0;
  for (const [k, v] of _store.entries()) {
    if (!domain || v.domain === domain || Date.now() > v.expiresAt) {
      _store.delete(k);
      count++;
    }
  }
  return count;
}

export function clear() {
  const count = _store.size;
  _store.clear();
  return count;
}

export function stats() {
  const now = Date.now();
  let live = 0, expired = 0, totalHits = 0;
  for (const v of _store.values()) {
    if (now > v.expiresAt) expired++;
    else { live++; totalHits += v.hitCount; }
  }
  return { total: _store.size, live, expired, totalHits };
}

export const TTL = TTL_MS;
