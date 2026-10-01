/**
 * @coach-intelligence — canonical JSON stringifier (local copy, dependency-closure only)
 *
 * A verbatim copy of `canonicalStringify` (and its `quote` helper) from
 * packages/brain-evidence-gateway/snapshot.js. coach-intelligence's presenters use it for their
 * `format: 'json'` output; importing it from here instead of the `@brain/evidence-gateway`
 * workspace package keeps the coach-intelligence import closure self-contained (relative imports
 * only), so the package can be consumed outside this repository's npm workspace resolution.
 *
 * Behaviour is identical by construction — do NOT change the algorithm here. If the gateway's
 * implementation ever changes, copy it again so the two stay byte-identical.
 */

/** JSON string escaping for a primitive string (delegates to JSON.stringify). */
const quote = (s) => JSON.stringify(s)

/**
 * Canonical JSON serialisation: object keys sorted ascending; array order preserved;
 * non-finite numbers and undefined/function values normalised the way JSON would
 * (→ null / omitted). Pure; no clock/randomness.
 * @param {*} value
 * @returns {string}
 */
export function canonicalStringify(value) {
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (t === 'boolean') return value ? 'true' : 'false'
  if (t === 'string') return quote(value)
  if (t === 'bigint') return quote(value.toString())
  if (t === 'undefined' || t === 'function' || t === 'symbol') return 'null'
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalStringify(v === undefined ? null : v)).join(',') + ']'
  }
  // plain object — sort keys, skip undefined/function/symbol values (as JSON does)
  const keys = Object.keys(value).filter((k) => {
    const vt = typeof value[k]
    return vt !== 'undefined' && vt !== 'function' && vt !== 'symbol'
  }).sort()
  return '{' + keys.map((k) => quote(k) + ':' + canonicalStringify(value[k])).join(',') + '}'
}
