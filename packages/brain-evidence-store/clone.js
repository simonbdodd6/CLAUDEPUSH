/**
 * @brain/evidence-store — pure deep clone + deep freeze (M46)
 *
 * Deterministic structural helpers for the in-memory test driver. They operate on
 * plain JSON-like evidence data (objects / arrays / strings / numbers / booleans /
 * null). No Date, no Math.random, no I/O, no functions. Key order is preserved
 * (insertion order), so clones are deterministic.
 */

/** Structural deep clone of plain data. Never returns the same reference for objects/arrays. */
export function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone)
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) out[k] = deepClone(value[k])
    return out
  }
  return value
}

/** Recursively freeze an object/array in place. Returns the same (now frozen) value. */
export function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Clone then deep-freeze — the canonical "store/return a safe copy" operation. */
export function frozenClone(value) {
  return deepFreeze(deepClone(value))
}
