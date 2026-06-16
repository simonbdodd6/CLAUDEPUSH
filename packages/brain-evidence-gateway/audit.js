/**
 * @brain/evidence-gateway — audit plan (M62, DORMANT, data-only)
 *
 * Pure deterministic assembly of the gateway's prepareAudit stage output (M42 §2/§3):
 * the append-only AuditEntry list that WOULD be recorded for one ingest run. It writes
 * NO audit entry, reads NO audit history, activates no persistence — it produces the
 * audit trail as data only.
 *
 * It REUSES the upstream plans verbatim (no recomputation): the ApplicationPlan
 * (accepted / unknownSource / invalidSignals partitions), the M58 provenance proposals
 * (which records were deduplicated), the M61 MemoryLinkPlan (which were linked) and the
 * M60 ConfidenceUpdatePlan (which had a confidence update prepared). The timestamp is
 * the caller-supplied `NormalizationContext.now` (no clock).
 *
 * Per record, in deterministic order (accepted, then unknown_source, then
 * invalid_signals; within a record, pipeline order), it emits stage-transition entries:
 *   accepted:        received → validated → normalized → [deduplicated] → [linked] → [reweighted] → accepted
 *   unknown_source:  received → validated → rejected
 *   invalid_signals: received → validated → normalized → rejected
 * Every entry carries { evidenceId, tenant, subjectId|null, stage, action, outcome, at }
 * and outcome is always 'deferred' (the gateway is dormant — nothing is applied).
 *
 * Results are immutable; input is never mutated. The only import is @brain/evidence-contracts
 * (the canonical AUDIT_ACTION vocabulary). No I/O, no clock, no randomness.
 */

import { AUDIT_ACTION } from '@brain/evidence-contracts'

const isStr = (v) => typeof v === 'string' && v.length > 0

/** Audit actions — the canonical contract set + the gateway's terminal `accepted`. */
export const AUDIT_PLAN_ACTION = Object.freeze({ ...AUDIT_ACTION, ACCEPTED: 'accepted' })

/** Every planned entry's outcome — the gateway applies nothing (dormant). */
export const AUDIT_OUTCOME_DEFERRED = 'deferred'

/**
 * Build the deferred AuditPlan from the upstream plans + records + NormalizationContext.
 *
 * @param {{
 *   applicationPlan: { accepted?:Array<{recordId:string}>, unknownSource?:Array<{recordId:string}>, invalidSignals?:Array<{recordId:string}> },
 *   confidenceUpdatePlan?: { updates?:Array<{evidenceId:string}> }|null,
 *   memoryLinkPlan?: { evidence?:Array<{evidenceId:string}> }|null,
 *   proposals?: Array<{ canonical:{recordId:string}, duplicates:Array<{recordId:string}> }>,
 *   records?: Array<{ id:string, tenant?:object, subjectId?:string }>,
 *   context?: { now?:string }|null
 * }} [input]
 * @returns {Readonly<{ entries:ReadonlyArray<object>, byAction:Readonly<object>, count:number, at:string|null }>}
 */
export function deriveAuditPlan({ applicationPlan = null, confidenceUpdatePlan = null, memoryLinkPlan = null, proposals = [], records = [], context = null } = {}) {
  if (!applicationPlan || typeof applicationPlan !== 'object') {
    throw new TypeError('deriveAuditPlan requires an applicationPlan object')
  }
  if (!Array.isArray(proposals) || !Array.isArray(records)) {
    throw new TypeError('deriveAuditPlan requires { proposals: array, records: array }')
  }

  const at = context && isStr(context.now) ? context.now : null
  const byId = new Map()
  for (const r of records) {
    if (r && typeof r === 'object' && isStr(r.id)) byId.set(r.id, r)
  }

  const accepted = Array.isArray(applicationPlan.accepted) ? applicationPlan.accepted : []
  const unknownSource = Array.isArray(applicationPlan.unknownSource) ? applicationPlan.unknownSource : []
  const invalidSignals = Array.isArray(applicationPlan.invalidSignals) ? applicationPlan.invalidSignals : []

  const dedupedIds = new Set()      // records that participate in a collapse (canonical or duplicate)
  for (const p of proposals) {
    if (p && p.canonical && isStr(p.canonical.recordId)) dedupedIds.add(p.canonical.recordId)
    for (const d of (p && Array.isArray(p.duplicates) ? p.duplicates : [])) if (isStr(d.recordId)) dedupedIds.add(d.recordId)
  }
  const linkedIds = new Set(
    (memoryLinkPlan && Array.isArray(memoryLinkPlan.evidence) ? memoryLinkPlan.evidence : [])
      .map((e) => e && e.evidenceId).filter(isStr),
  )
  const reweightedIds = new Set(
    (confidenceUpdatePlan && Array.isArray(confidenceUpdatePlan.updates) ? confidenceUpdatePlan.updates : [])
      .map((u) => u && u.evidenceId).filter(isStr),
  )

  const entries = []
  const entry = (evidenceId, stage, action) => {
    const rec = byId.get(evidenceId)
    entries.push(Object.freeze({
      evidenceId,
      tenant: rec && rec.tenant != null ? rec.tenant : null,
      subjectId: rec && isStr(rec.subjectId) ? rec.subjectId : null,
      stage,
      action,
      outcome: AUDIT_OUTCOME_DEFERRED,
      at,
    }))
  }

  for (const e of accepted) {
    if (!e || !isStr(e.recordId)) continue
    const id = e.recordId
    entry(id, 'receive', AUDIT_PLAN_ACTION.RECEIVED)
    entry(id, 'validate', AUDIT_PLAN_ACTION.VALIDATED)
    entry(id, 'normalize', AUDIT_PLAN_ACTION.NORMALIZED)
    if (dedupedIds.has(id)) entry(id, 'deduplicate', AUDIT_PLAN_ACTION.DEDUPLICATED)
    if (linkedIds.has(id)) entry(id, 'prepareMemoryLink', AUDIT_PLAN_ACTION.LINKED)
    if (reweightedIds.has(id)) entry(id, 'prepareConfidenceUpdate', AUDIT_PLAN_ACTION.REWEIGHTED)
    entry(id, 'normalize', AUDIT_PLAN_ACTION.ACCEPTED)
  }
  for (const e of unknownSource) {
    if (!e || !isStr(e.recordId)) continue
    const id = e.recordId
    entry(id, 'receive', AUDIT_PLAN_ACTION.RECEIVED)
    entry(id, 'validate', AUDIT_PLAN_ACTION.VALIDATED)
    entry(id, 'normalize', AUDIT_PLAN_ACTION.REJECTED)        // no registered normalizer
  }
  for (const e of invalidSignals) {
    if (!e || !isStr(e.recordId)) continue
    const id = e.recordId
    entry(id, 'receive', AUDIT_PLAN_ACTION.RECEIVED)
    entry(id, 'validate', AUDIT_PLAN_ACTION.VALIDATED)
    entry(id, 'normalize', AUDIT_PLAN_ACTION.NORMALIZED)      // ran, but emission failed validation
    entry(id, 'normalize', AUDIT_PLAN_ACTION.REJECTED)
  }

  const byAction = {}
  for (const e of entries) byAction[e.action] = (byAction[e.action] ?? 0) + 1

  return Object.freeze({
    entries: Object.freeze(entries),
    byAction: Object.freeze(byAction),
    count: entries.length,
    at,
  })
}
