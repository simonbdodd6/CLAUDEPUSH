/**
 * @brain/evidence-gateway — engine-exposure plan (M63, DORMANT, data-only)
 *
 * Pure deterministic assembly of the gateway's prepareEngineExposure stage output
 * (M42 §3.7): the read-only projection the reasoning engines WOULD later read — one
 * exposure entry per accepted (subject, signal.key). It CALLS no engine, exposes
 * nothing to runtime/browser, reads/writes no store or graph, activates no
 * persistence — it produces the exposure surface as data only.
 *
 * It REUSES the upstream plans verbatim (no recomputation): the accepted ApplicationPlan
 * entries (signal value + key + evidenceId), the M60 ConfidenceUpdatePlan (the proposed
 * aggregate confidence, falling back to the signal's own confidence when no reweight
 * applies), the M61 MemoryLinkPlan (the memory-link reference) and the M62 AuditPlan
 * (the audit-trail reference). tenant / subjectId / sourceType are resolved from the
 * canonical EvidenceRecord (§4.6 scope).
 *
 * Only accepted records contribute, so unknown_source / invalid_signals are never
 * exposed. Order is preserved (accepted order, then signal order); results are
 * immutable; input is never mutated. No imports, no I/O, no clock, no randomness.
 */

const SEP = '\u001f'
const isStr = (v) => typeof v === 'string' && v.length > 0
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * Build the deferred EngineExposurePlan from the accepted entries + records + the M60/
 * M61/M62 plans.
 *
 * @param {{
 *   accepted?: Array<{ recordId:string, signals:Array<{ key:string, value:any, confidence:number }> }>,
 *   records?: Array<{ id:string, tenant?:object, subjectId?:string, sourceType?:string }>,
 *   confidenceUpdatePlan?: { updates?:Array<{ evidenceId:string, signalKey:string, proposedConfidence:number }> }|null,
 *   memoryLinkPlan?: { evidence?:Array<{ evidenceId:string, subjectId:string }> }|null,
 *   auditPlan?: { entries?:Array<{ evidenceId:string }> }|null
 * }} [input]
 * @returns {Readonly<{
 *   exposed:boolean,
 *   entries: ReadonlyArray<Readonly<{
 *     tenant:object|null, subjectId:string|null, signalKey:string, value:any,
 *     proposedConfidence:number|null, evidenceId:string, sourceType:string|null,
 *     memoryLink:Readonly<{ evidenceId:string, subjectId:string|null }>|null,
 *     auditRef:Readonly<{ evidenceId:string, entries:number }>|null
 *   }>>,
 *   count:number, problems:ReadonlyArray<object>
 * }>}
 */
export function deriveEngineExposurePlan({ accepted = [], records = [], confidenceUpdatePlan = null, memoryLinkPlan = null, auditPlan = null } = {}) {
  if (!Array.isArray(accepted) || !Array.isArray(records)) {
    throw new TypeError('deriveEngineExposurePlan requires { accepted: array, records: array }')
  }
  const byId = new Map()
  for (const r of records) {
    if (r && typeof r === 'object' && isStr(r.id)) byId.set(r.id, r)
  }

  // proposed confidence by (evidenceId, signalKey) from the M60 plan
  const proposedBy = new Map()
  for (const u of (confidenceUpdatePlan && Array.isArray(confidenceUpdatePlan.updates) ? confidenceUpdatePlan.updates : [])) {
    if (u && isStr(u.evidenceId) && isStr(u.signalKey) && isNum(u.proposedConfidence)) {
      proposedBy.set(u.evidenceId + SEP + u.signalKey, u.proposedConfidence)
    }
  }
  // memory-link reference by evidenceId from the M61 plan
  const memoryBy = new Map()
  for (const e of (memoryLinkPlan && Array.isArray(memoryLinkPlan.evidence) ? memoryLinkPlan.evidence : [])) {
    if (e && isStr(e.evidenceId)) memoryBy.set(e.evidenceId, e)
  }
  // audit-entry count by evidenceId from the M62 plan
  const auditCount = new Map()
  for (const a of (auditPlan && Array.isArray(auditPlan.entries) ? auditPlan.entries : [])) {
    if (a && isStr(a.evidenceId)) auditCount.set(a.evidenceId, (auditCount.get(a.evidenceId) ?? 0) + 1)
  }

  const entries = []
  const problems = []

  for (const entry of accepted) {
    if (!entry || typeof entry !== 'object' || !isStr(entry.recordId)) continue
    const evidenceId = entry.recordId
    const record = byId.get(evidenceId)
    if (!record) {
      problems.push(Object.freeze({ recordId: evidenceId, problem: 'record not found for tenant/subject resolution' }))
      continue
    }
    const tenant = record.tenant != null ? record.tenant : null
    const subjectId = isStr(record.subjectId) ? record.subjectId : null
    const sourceType = isStr(record.sourceType) ? record.sourceType : null
    const memNode = memoryBy.get(evidenceId) || null
    const audits = auditCount.get(evidenceId) ?? 0
    const signals = Array.isArray(entry.signals) ? entry.signals : []

    for (const s of signals) {
      if (!s || typeof s !== 'object' || !isStr(s.key)) continue
      const proposed = proposedBy.has(evidenceId + SEP + s.key)
        ? proposedBy.get(evidenceId + SEP + s.key)        // reweighted aggregate (M60)
        : (isNum(s.confidence) ? s.confidence : null)     // else the signal's own confidence
      entries.push(Object.freeze({
        tenant,
        subjectId,
        signalKey: s.key,
        value: s.value === undefined ? null : s.value,    // normalized value
        proposedConfidence: proposed,
        evidenceId,
        sourceType,
        memoryLink: memNode ? Object.freeze({ evidenceId, subjectId: isStr(memNode.subjectId) ? memNode.subjectId : null }) : null,
        auditRef: audits > 0 ? Object.freeze({ evidenceId, entries: audits }) : null,
      }))
    }
  }

  return Object.freeze({
    exposed: entries.length > 0,
    entries: Object.freeze(entries),
    count: entries.length,
    problems: Object.freeze(problems),
  })
}
