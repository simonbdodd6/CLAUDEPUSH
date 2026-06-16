/**
 * @brain/evidence-normalization — normalizer + signal contracts (M50, DORMANT)
 *
 * The single common language for the `normalize` stage (M42 §3): the deterministic
 * interface every future source normalizer (Frame Sports, GPS, coach observations,
 * video tags, …) must satisfy, and pure validators proving the `NormalizedSignal[]`
 * it emits conform — BEFORE anything enters the Brain.
 *
 * Defines NOTHING that does work: no normalizers, no registry, no providers, no
 * storage, no network, no clock, no randomness. Every input — including timestamps —
 * is caller-supplied; results are immutable; caller input is never mutated. Imports
 * only @brain/evidence-contracts (its enums) + sibling modules. Imported by nobody yet.
 */

import { SOURCE_TYPE, SOURCE_FAMILY, SIGNAL_POLARITY } from '@brain/evidence-contracts'
import { NormalizationError, NORMALIZATION_ERROR } from './errors.js'
import { isValidSignalKey } from './keys.js'

/** Normalization contract version (the shape of a normalizer + its context). */
export const NORMALIZATION_CONTRACT_VERSION = '1.0'

const SOURCE_TYPE_VALUES = Object.freeze(new Set(Object.values(SOURCE_TYPE)))
const SOURCE_FAMILY_VALUES = Object.freeze(new Set(Object.values(SOURCE_FAMILY)))
const POLARITY_VALUES = Object.freeze(new Set(Object.values(SIGNAL_POLARITY)))

/** ISO-8601 instant, e.g. `2026-06-16T09:30:00.000Z` — validated WITHOUT `Date`. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

const isStr = (v) => typeof v === 'string' && v.length > 0
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isScalarValue = (v) =>
  v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'

/** True iff `s` is a syntactically valid ISO timestamp string. Pure; no `Date`. */
export function isIsoTimestamp(s) {
  return isStr(s) && ISO_TIMESTAMP.test(s)
}

// ── normalizer contract ─────────────────────────────────────────────────────────

/**
 * True iff `n` satisfies the NormalizerContract: an object exposing a known
 * `sourceType`, a non-empty `version` string, and a `normalize` function. Pure.
 * @param {unknown} n @returns {boolean}
 */
export function isNormalizerContract(n) {
  return (
    !!n && typeof n === 'object' &&
    isStr(n.sourceType) && SOURCE_TYPE_VALUES.has(n.sourceType) &&
    isStr(n.version) &&
    typeof n.normalize === 'function'
  )
}

/**
 * Assert `n` is a valid normalizer, returning a frozen descriptor
 * `{ sourceType, sourceFamily, version, key }` (`key` = `sourceType@version`). A
 * malformed normalizer throws `invalid_contract`. The derived `sourceFamily` is the
 * `<family>.` prefix of `sourceType` and is itself asserted to be a SOURCE_FAMILY.
 * @param {unknown} n
 * @returns {Readonly<{ sourceType:string, sourceFamily:string, version:string, key:string }>}
 */
export function assertNormalizerContract(n) {
  if (!isNormalizerContract(n)) {
    throw new NormalizationError(
      NORMALIZATION_ERROR.INVALID_CONTRACT,
      'normalizer must be { sourceType: <SOURCE_TYPE>, version: string, normalize: function }',
    )
  }
  const sourceFamily = n.sourceType.split('.', 1)[0]
  if (!SOURCE_FAMILY_VALUES.has(sourceFamily)) {
    throw new NormalizationError(
      NORMALIZATION_ERROR.INVALID_CONTRACT,
      `sourceType '${n.sourceType}' has no known source family`,
    )
  }
  return Object.freeze({
    sourceType: n.sourceType,
    sourceFamily,
    version: n.version,
    key: `${n.sourceType}@${n.version}`,
  })
}

/** Stable identity of a normalizer: `sourceType@version`. @param {unknown} n */
export function normalizerKey(n) {
  return assertNormalizerContract(n).key
}

// ── normalization context (caller-supplied; NO clock) ─────────────────────────────

/**
 * Assert a NormalizationContext, returning a frozen `{ now, ingestRunId }`. The
 * context carries the deterministic inputs a normalizer may read — there is no clock
 * inside the Brain, so `now` is an ISO timestamp PASSED IN (M42 §3). Malformed →
 * `invalid_input`.
 * @param {unknown} ctx
 * @returns {Readonly<{ now:string, ingestRunId:string }>}
 */
export function assertNormalizationContext(ctx) {
  if (!ctx || typeof ctx !== 'object') {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'context must be an object')
  }
  if (!isIsoTimestamp(ctx.now)) {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'context.now must be an ISO timestamp')
  }
  if (!isStr(ctx.ingestRunId)) {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'context.ingestRunId must be a non-empty string')
  }
  return Object.freeze({ now: ctx.now, ingestRunId: ctx.ingestRunId })
}

// ── signal validation (REPORTS problems as data) ──────────────────────────────────

/**
 * Validate one NormalizedSignal against the common language. Pure — never throws on
 * a bad signal; it REPORTS the problems (so a caller can surface them). When the
 * owning `record` is supplied, also checks the back-reference (`evidenceId === record.id`)
 * and that the signal's confidence does not exceed the record's (M42 §2).
 * @param {unknown} signal
 * @param {{ record?: { id?:string, confidence?:number } }} [opts]
 * @returns {Readonly<{ valid:boolean, problems:string[] }>}
 */
export function validateSignal(signal, { record } = {}) {
  const problems = []
  if (!signal || typeof signal !== 'object') {
    return Object.freeze({ valid: false, problems: Object.freeze(['signal must be an object']) })
  }
  if (!isValidSignalKey(signal.key)) problems.push(`invalid key: ${String(signal.key)}`)
  if (!isScalarValue(signal.value)) problems.push('value must be number | string | boolean | null')
  if (!(signal.unit === null || isStr(signal.unit))) problems.push('unit must be a non-empty string or null')
  if (!(signal.polarity === null || POLARITY_VALUES.has(signal.polarity))) problems.push('polarity must be a SIGNAL_POLARITY value or null')
  if (!isFiniteNum(signal.confidence) || signal.confidence < 0 || signal.confidence > 1) problems.push('confidence must be a number in 0..1')
  if (!isStr(signal.evidenceId)) problems.push('evidenceId must be a non-empty string')

  if (record && typeof record === 'object') {
    if (isStr(record.id) && isStr(signal.evidenceId) && signal.evidenceId !== record.id) {
      problems.push(`evidenceId '${signal.evidenceId}' does not back-reference record '${record.id}'`)
    }
    if (isFiniteNum(record.confidence) && isFiniteNum(signal.confidence) && signal.confidence > record.confidence) {
      problems.push('confidence may not exceed the record confidence')
    }
  }
  return Object.freeze({ valid: problems.length === 0, problems: Object.freeze(problems) })
}

/**
 * Validate a normalizer's whole output (`NormalizedSignal[]`). A non-array throws
 * `invalid_input`; per-signal problems are REPORTED, in array order. An empty array
 * is valid (a normalizer may legitimately derive no signals).
 * @param {unknown} signals
 * @param {{ record?: { id?:string, confidence?:number } }} [opts]
 * @returns {Readonly<{ valid:boolean, count:number, problems:ReadonlyArray<{ index:number, problems:string[] }> }>}
 */
export function validateSignals(signals, { record } = {}) {
  if (!Array.isArray(signals)) {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'signals must be an array')
  }
  const problems = []
  signals.forEach((s, index) => {
    const r = validateSignal(s, { record })
    if (!r.valid) problems.push(Object.freeze({ index, problems: r.problems }))
  })
  return Object.freeze({
    valid: problems.length === 0,
    count: signals.length,
    problems: Object.freeze(problems),
  })
}
