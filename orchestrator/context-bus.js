/**
 * Orchestrator Context Bus
 *
 * A shared key-value store passed between engines during an orchestration run.
 * Engines read from it and write to it via contextWrites in their EngineResult.
 * The executor handles all writes — engines never mutate the bus directly.
 *
 * Features:
 * - Provenance tracking: every value records which engine wrote it
 * - Read tracking: know which engines read which keys (for deduplication)
 * - Snapshot: produce a frozen plain-object view for passing to engines
 * - Age: track when each key was written (for cache freshness if needed)
 */

export function createContextBus(initialData = {}) {
  const _store = new Map();  // key → { value, source, writtenAt }
  const _reads = new Map();  // key → Set<engineName>

  // Inject initial data (request metadata, entities, etc.)
  for (const [k, v] of Object.entries(initialData)) {
    _store.set(k, { value: v, source: '_init', writtenAt: Date.now() });
  }

  return {
    // ── Write ───────────────────────────────────────────────────────────────
    set(key, value, source = 'unknown') {
      _store.set(key, { value, source, writtenAt: Date.now() });
    },

    setMany(entries, source) {
      for (const [k, v] of Object.entries(entries ?? {})) {
        this.set(k, v, source);
      }
    },

    // ── Read ────────────────────────────────────────────────────────────────
    get(key, defaultValue = undefined) {
      return _store.get(key)?.value ?? defaultValue;
    },

    has(key) {
      return _store.has(key) && _store.get(key).value != null;
    },

    trackRead(key, engineName) {
      if (!_reads.has(key)) _reads.set(key, new Set());
      _reads.get(key).add(engineName);
    },

    // ── Snapshot (plain object — safe to pass to adapters) ─────────────────
    snapshot() {
      const out = {};
      for (const [k, entry] of _store) {
        out[k] = entry.value;
      }
      return out;
    },

    // ── Introspection ────────────────────────────────────────────────────────
    provenance(key) {
      return _store.get(key)?.source ?? null;
    },

    age(key) {
      const entry = _store.get(key);
      return entry ? Date.now() - entry.writtenAt : null;
    },

    keys() {
      return [..._store.keys()];
    },

    dataKeys() {
      return [..._store.keys()].filter(k => !k.startsWith('_'));
    },

    size() {
      return _store.size;
    },

    // ── Report ───────────────────────────────────────────────────────────────
    toReport() {
      const rows = [];
      for (const [key, entry] of _store) {
        if (key.startsWith('_')) continue;
        const v = entry.value;
        let desc;
        if (Array.isArray(v))       desc = `${v.length} items`;
        else if (v && typeof v === 'object') desc = `object (${Object.keys(v).length} keys)`;
        else                        desc = String(v).slice(0, 80);
        rows.push({ key, source: entry.source, description: desc });
      }
      return rows;
    },

    readSummary() {
      const out = {};
      for (const [key, readers] of _reads) {
        out[key] = [...readers];
      }
      return out;
    },
  };
}
