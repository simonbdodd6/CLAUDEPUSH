/**
 * @brain/evidence-gateway — pipeline plan snapshot (M65, DORMANT, pure serializer)
 *
 * A pure deterministic serializer for the M64 PipelinePlan: it produces a canonical
 * (object-key-sorted) JSON string, a frozen canonical snapshot object, and a stable
 * fingerprint/digest. It only READS the plan it is given (reuse, no recomputation) —
 * no store, graph, runtime, browser, engine, clock or randomness.
 *
 * Canonicalisation makes the output insensitive to object KEY insertion order (keys are
 * sorted) while preserving ARRAY order (the pipeline's ordering is already meaningful &
 * deterministic). The digest is a deterministic non-crypto fold (two independent 32-bit
 * hashes → 16 hex chars) over the canonical JSON — no clock, no randomness.
 * Identical plans → identical snapshot+digest; differing plans → differing digests
 * (with very high probability). Output is deeply frozen; input is never mutated.
 */

const SNAPSHOT_VERSION = '1.0'

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

const fnv1a32 = (str) => {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}
const djb2 = (str) => {
  let h = 5381
  for (let i = 0; i < str.length; i++) { h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0 }
  return h >>> 0
}

/** Deterministic 16-hex-char fingerprint of a string (two independent 32-bit folds). */
export function pipelineDigest(canonicalJson) {
  return fnv1a32(canonicalJson).toString(16).padStart(8, '0') + djb2(canonicalJson).toString(16).padStart(8, '0')
}

/** Deep-freeze a plain JSON value (objects/arrays). */
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Snapshot a PipelinePlan (M64): canonical JSON + canonical object + digest.
 *
 * @param {object} plan  a PipelinePlan from `prepareFullPipelinePlan`
 * @returns {Readonly<{ version:string, json:string, digest:string, snapshot:object }>}
 */
export function snapshotPipelinePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    throw new TypeError('snapshotPipelinePlan requires a PipelinePlan object')
  }
  const json = canonicalStringify(plan)
  const digest = pipelineDigest(json)
  const snapshot = deepFreeze(JSON.parse(json))   // canonical plain object (keys already sorted in json)
  return Object.freeze({ version: SNAPSHOT_VERSION, json, digest, snapshot })
}
