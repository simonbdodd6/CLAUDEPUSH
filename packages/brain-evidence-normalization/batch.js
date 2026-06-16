/**
 * @brain/evidence-normalization — batch normalization plan (M53, DORMANT)
 *
 * A deterministic helper that runs the M52 invocation contract across MANY evidence
 * records, in stable input order, and assembles ONE immutable batch plan/report:
 * per-record invocation envelopes + aggregate counts + every problem collected as
 * data. Architecture only — it owns no normalizers, providers, storage, gateway
 * execution or runtime wiring; it simply composes safe single-record invocations.
 *
 * Outcomes are REPORTED as data (statuses + problems), never thrown — an unknown
 * sourceType or a bad emission on any record does not crash the batch. The only
 * throws are the existing assertions for programmer errors (malformed input via
 * `invalid_input`, a structurally broken resolved normalizer via `invalid_contract`),
 * surfaced unchanged from M52.
 *
 * No clock, no randomness, no I/O. Imports only sibling modules (transitively only
 * @brain/evidence-contracts). Imported by nobody yet.
 */

import { assertNormalizationContext } from './contracts.js'
import { invokeNormalizer, INVOCATION_STATUS } from './invocation.js'
import { NormalizationError, NORMALIZATION_ERROR } from './errors.js'

function assertRegistry(registry) {
  if (!registry || typeof registry.resolve !== 'function') {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'a registry with resolve(sourceType) is required')
  }
  return registry
}

/**
 * Plan the normalization of a batch of records. Each record is run through
 * {@link invokeNormalizer} in input order (no reordering — order is the stable rule),
 * and the results are folded into a single frozen report.
 *
 * @param {{ resolve: Function }} registry  an M51 normalizer registry
 * @param {Array<{ id:string, sourceType:string, confidence?:number }>} records
 * @param {{ now:string, ingestRunId:string }} ctx  caller-supplied NormalizationContext
 * @returns {Readonly<{
 *   total:number,
 *   allOk:boolean,
 *   counts: Readonly<{ total:number, ok:number, unknown_source:number, invalid_signals:number }>,
 *   results: ReadonlyArray<Readonly<{ index:number, recordId:string, invocation:object }>>,
 *   problems: ReadonlyArray<Readonly<{ index:number, recordId:string, problems:ReadonlyArray<string> }>>,
 * }>}
 */
export function planBatchNormalization(registry, records, ctx) {
  assertRegistry(registry)
  if (!Array.isArray(records)) {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'records must be an array')
  }
  const context = assertNormalizationContext(ctx)        // asserted once, up front (even for an empty batch)

  const counts = { ok: 0, unknown_source: 0, invalid_signals: 0 }
  const results = []
  const problems = []

  records.forEach((record, index) => {
    const invocation = invokeNormalizer(registry, record, context)   // re-asserts record/ctx (invalid_input)
    counts[invocation.status] = (counts[invocation.status] ?? 0) + 1
    results.push(Object.freeze({ index, recordId: record.id, invocation }))
    if (invocation.problems.length > 0) {
      problems.push(Object.freeze({ index, recordId: record.id, problems: invocation.problems }))
    }
  })

  const total = records.length
  return Object.freeze({
    total,
    allOk: counts.unknown_source === 0 && counts.invalid_signals === 0,
    counts: Object.freeze({
      total,
      ok: counts.ok,
      [INVOCATION_STATUS.UNKNOWN_SOURCE]: counts.unknown_source,
      [INVOCATION_STATUS.INVALID_SIGNALS]: counts.invalid_signals,
    }),
    results: Object.freeze(results),
    problems: Object.freeze(problems),
  })
}
