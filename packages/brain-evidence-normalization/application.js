/**
 * @brain/evidence-normalization — normalization plan application contract (M54, DORMANT)
 *
 * The final dormant bridge between the normalization planning layer (M50–M53) and the
 * future Evidence Gateway. Given a {@link BatchNormalizationPlan} (M53), it produces a
 * deterministic, immutable ApplicationPlan describing EXACTLY what WOULD happen if the
 * gateway later executed it — it writes NOTHING.
 *
 * It partitions the batch's per-record outcomes into:
 *   - accepted        — records whose normalizer ran and emitted only valid signals;
 *                       each carries the validated NormalizedSignals that WOULD be
 *                       forwarded to the Evidence Store;
 *   - unknown_source  — records with no registered normalizer;
 *   - invalid_signals — records whose emission failed validation.
 *
 * Pure transform of already-computed data — no registry, no invocation, no storage,
 * no gateway execution, no runtime, no normalizers, no providers, no Core. No clock,
 * no randomness, no I/O. Imports only sibling modules (transitively only
 * @brain/evidence-contracts). Imported by nobody yet.
 */

import { INVOCATION_STATUS } from './invocation.js'
import { NormalizationError, NORMALIZATION_ERROR } from './errors.js'

/** Minimal shape check — the input must be an M53 batch plan (has a `results` array). */
function assertBatchPlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.results)) {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, 'a BatchNormalizationPlan (with a results array) is required')
  }
  return plan
}

/** Each result must carry an invocation with a known status (defence-in-depth). */
function assertResult(result, i) {
  const inv = result && typeof result === 'object' ? result.invocation : null
  if (!inv || typeof inv !== 'object' || typeof inv.status !== 'string') {
    throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, `results[${i}] must carry an invocation with a status`)
  }
  return inv
}

/**
 * Build the immutable ApplicationPlan from a batch normalization plan. Ordering of the
 * batch's results is preserved within every partition.
 *
 * @param {import('./types.js').BatchNormalizationPlan} batchPlan
 * @returns {Readonly<{
 *   total:number,
 *   willApply:boolean,
 *   counts: Readonly<{ total:number, accepted:number, unknown_source:number, invalid_signals:number, signals:number }>,
 *   accepted: ReadonlyArray<Readonly<{ index:number, recordId:string, normalizerKey:string|null, signals:ReadonlyArray<object> }>>,
 *   unknownSource: ReadonlyArray<Readonly<{ index:number, recordId:string, sourceType:string }>>,
 *   invalidSignals: ReadonlyArray<Readonly<{ index:number, recordId:string, problems:ReadonlyArray<string> }>>,
 * }>}
 */
export function planNormalizationApplication(batchPlan) {
  assertBatchPlan(batchPlan)

  const accepted = []
  const unknownSource = []
  const invalidSignals = []
  let signalCount = 0

  batchPlan.results.forEach((result, i) => {
    const inv = assertResult(result, i)
    const entry = { index: result.index, recordId: result.recordId }
    switch (inv.status) {
      case INVOCATION_STATUS.OK:
        signalCount += inv.signals.length
        accepted.push(Object.freeze({
          ...entry,
          normalizerKey: inv.normalizerKey,
          signals: Object.freeze([...inv.signals]),   // the validated signals that WOULD be forwarded
        }))
        break
      case INVOCATION_STATUS.UNKNOWN_SOURCE:
        unknownSource.push(Object.freeze({ ...entry, sourceType: inv.sourceType }))
        break
      case INVOCATION_STATUS.INVALID_SIGNALS:
        invalidSignals.push(Object.freeze({ ...entry, problems: Object.freeze([...inv.problems]) }))
        break
      default:
        throw new NormalizationError(NORMALIZATION_ERROR.INVALID_INPUT, `results[${i}] has an unknown status: ${inv.status}`)
    }
  })

  const total = batchPlan.results.length
  return Object.freeze({
    total,
    willApply: accepted.length > 0,
    counts: Object.freeze({
      total,
      accepted: accepted.length,
      [INVOCATION_STATUS.UNKNOWN_SOURCE]: unknownSource.length,
      [INVOCATION_STATUS.INVALID_SIGNALS]: invalidSignals.length,
      signals: signalCount,
    }),
    accepted: Object.freeze(accepted),
    unknownSource: Object.freeze(unknownSource),
    invalidSignals: Object.freeze(invalidSignals),
  })
}
