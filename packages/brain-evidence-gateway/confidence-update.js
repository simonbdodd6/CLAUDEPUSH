/**
 * @brain/evidence-gateway — confidence-update plan (M60, DORMANT, data-only)
 *
 * Pure deterministic assembly of the gateway's prepareConfidenceUpdate stage output
 * (M42 §3.6): it turns the M59 confidence-REWEIGHT proposals into deferred
 * confidence-UPDATE instructions — the per-(subject, signal.key) "set confidence to X"
 * the store WOULD later apply. It applies NOTHING, reads/writes no Evidence Store,
 * activates no persistence.
 *
 * It REUSES the M59 reweight proposal data verbatim (current/proposed/delta/supporting
 * duplicate ids) — no confidence/weighting maths is recomputed here. The only extra
 * data it adds is the tenant + subjectId, resolved from the canonical EvidenceRecord
 * (the §4.6 tenant scope the update must carry). A proposed confidence is never emitted
 * out of [0,1] — an out-of-bounds value is reported as a problem and skipped, never
 * clamped/recomputed. Order is preserved; results are immutable; input is never mutated.
 *
 * No imports, no I/O, no clock, no randomness. unknown_source / invalid_signals never
 * reach here (the reweight proposals come from the accepted-only dedupe groups).
 */

const isStr = (v) => typeof v === 'string' && v.length > 0
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const inBounds = (v) => isNum(v) && v >= 0 && v <= 1

/**
 * Build the deferred ConfidenceUpdatePlan from M59 reweight proposals + the records
 * (for tenant/subjectId).
 *
 * @param {{ reweightProposals?: Array<{ key:string, recordId:string, signalKey:string, currentConfidence:number, proposedConfidence:number, delta:number, supportingDuplicates:string[] }>,
 *           records?: Array<{ id:string, tenant?:object, subjectId?:string }> }} [input]
 * @returns {Readonly<{
 *   updates: ReadonlyArray<Readonly<{
 *     tenant:object|null, subjectId:string|null, signalKey:string, evidenceId:string,
 *     currentConfidence:number, proposedConfidence:number, delta:number,
 *     supportingDuplicates:ReadonlyArray<string>
 *   }>>,
 *   count:number, problems:ReadonlyArray<object>
 * }>}
 */
export function deriveConfidenceUpdatePlan({ reweightProposals = [], records = [] } = {}) {
  if (!Array.isArray(reweightProposals) || !Array.isArray(records)) {
    throw new TypeError('deriveConfidenceUpdatePlan requires { reweightProposals: array, records: array }')
  }
  const byId = new Map()
  for (const r of records) {
    if (r && typeof r === 'object' && isStr(r.id)) byId.set(r.id, r)
  }

  const updates = []
  const problems = []

  for (const p of reweightProposals) {
    if (!p || typeof p !== 'object' || !isStr(p.recordId)) continue
    const record = byId.get(p.recordId)
    if (!record) {
      problems.push(Object.freeze({ key: p.key, recordId: p.recordId, problem: 'record not found for tenant/subject resolution' }))
      continue
    }
    if (!inBounds(p.proposedConfidence)) {
      problems.push(Object.freeze({ key: p.key, recordId: p.recordId, problem: 'proposed confidence out of bounds — instruction skipped' }))
      continue                                   // never emit an out-of-bounds confidence
    }

    updates.push(Object.freeze({
      tenant: record.tenant ?? null,             // §4.6 tenant scope the update is keyed by
      subjectId: isStr(record.subjectId) ? record.subjectId : null,
      signalKey: p.signalKey,
      evidenceId: p.recordId,                    // canonical occurrence / evidence id
      currentConfidence: p.currentConfidence,    // reused from M59 (preserved)
      proposedConfidence: p.proposedConfidence,  // reused from M59 (bounds-checked)
      delta: p.delta,                            // reused from M59
      supportingDuplicates: Object.freeze(Array.isArray(p.supportingDuplicates) ? [...p.supportingDuplicates] : []),
    }))
  }

  return Object.freeze({
    updates: Object.freeze(updates),
    count: updates.length,
    problems: Object.freeze(problems),
  })
}
