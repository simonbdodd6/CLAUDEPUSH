// ─────────────────────────────────────────────────────────────────────────────
// Shape guards (Experience Adapter, M33)
//
// Tiny PURE coercion helpers that protect the view layer from malformed or
// partial façade output. They reshape/validate only — no business logic, no
// scoring, no derivation, no recommendations, no predictions. Every helper
// returns a safe fallback rather than throwing, so a bad envelope can never crash
// a render component.
// ─────────────────────────────────────────────────────────────────────────────

export const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

/** A finite number, else fallback. Optionally clamped to [min,max]. */
export function num(v, fallback = 0, min = -Infinity, max = Infinity) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(max, Math.max(min, n))
}

/** A non-empty string, else fallback. */
export function str(v, fallback = '') {
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

/** An array, else []. */
export function arr(v) {
  return Array.isArray(v) ? v : []
}

/** One of `allowed`, else fallback. */
export function oneOf(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback
}
