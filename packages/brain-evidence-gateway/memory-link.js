/**
 * @brain/evidence-gateway — memory-link plan (M61, DORMANT, data-only)
 *
 * Pure deterministic assembly of the gateway's prepareMemoryLink stage output
 * (M42 §3.5): it describes the Knowledge-Graph upserts that WOULD attach the accepted
 * evidence to its subjects, plus the dedupe provenance edges from the M58 proposals.
 * It reads/writes NO graph, creates no node/edge/relationship, activates no
 * persistence — it produces graph INSTRUCTIONS as data only.
 *
 * Nodes/edges (evidence attaches to entities; it never overwrites engine-derived nodes):
 *   - subject node   { subjectType, subjectId }        — unique, first-seen order
 *   - evidence node  { evidenceId, subjectType, subjectId, sourceType, signalKeys }
 *   - edge `about`        evidence  → subject           (the evidence is ABOUT the subject)
 *   - edge `derivedFrom`  duplicate → canonical         (from M58 derivedFrom — duplicate collapses to a link)
 *   - edge `supersedes`   canonical → duplicate         (from M58 supersededBy — canonical is authoritative)
 *
 * Relationship direction is encoded by from→to. The derivedFrom/supersedes facts are
 * REUSED verbatim from the M58 provenance proposals (no duplicated provenance logic).
 * Order is preserved; results are immutable; input is never mutated; unknown_source /
 * invalid_signals never reach here (accepted-only). No imports, no I/O, no clock, no
 * randomness.
 */

const SEP = '\u001f'
const isStr = (v) => typeof v === 'string' && v.length > 0

/**
 * Build the deferred MemoryLinkPlan from the accepted entries, their records (for the
 * subject node) and the M58 provenance proposals (for the dedupe edges).
 *
 * @param {{ accepted?: Array<{ recordId:string, signals:Array<{ key:string }> }>,
 *           records?: Array<{ id:string, subjectType?:string, subjectId?:string, sourceType?:string }>,
 *           proposals?: Array<{ canonical:{ recordId:string }, duplicates:Array<{ recordId:string, derivedFrom:string[], supersededBy:string }> }> }} [input]
 * @returns {Readonly<{
 *   subjects: ReadonlyArray<Readonly<{ subjectType:string|null, subjectId:string }>>,
 *   evidence: ReadonlyArray<Readonly<{ evidenceId:string, subjectType:string|null, subjectId:string, sourceType:string|null, signalKeys:ReadonlyArray<string> }>>,
 *   edges: ReadonlyArray<Readonly<{ type:'about'|'derivedFrom'|'supersedes', from:string, to:string }>>,
 *   counts: Readonly<{ subjects:number, evidence:number, edges:number }>,
 *   problems: ReadonlyArray<object>
 * }>}
 */
export function deriveMemoryLinkPlan({ accepted = [], records = [], proposals = [] } = {}) {
  if (!Array.isArray(accepted) || !Array.isArray(records) || !Array.isArray(proposals)) {
    throw new TypeError('deriveMemoryLinkPlan requires { accepted: array, records: array, proposals: array }')
  }
  const byId = new Map()
  for (const r of records) {
    if (r && typeof r === 'object' && isStr(r.id)) byId.set(r.id, r)
  }

  const subjects = []
  const subjectSeen = new Set()
  const evidence = []
  const edges = []
  const problems = []

  // subject + evidence nodes + `about` edges, in accepted order
  for (const entry of accepted) {
    if (!entry || typeof entry !== 'object' || !isStr(entry.recordId)) continue
    const record = byId.get(entry.recordId)
    if (!record) {
      problems.push(Object.freeze({ recordId: entry.recordId, problem: 'record not found for subject resolution' }))
      continue
    }
    const subjectId = isStr(record.subjectId) ? record.subjectId : null
    if (!subjectId) {
      problems.push(Object.freeze({ recordId: entry.recordId, problem: 'record has no subjectId' }))
      continue
    }
    const subjectType = isStr(record.subjectType) ? record.subjectType : null

    const sKey = (subjectType ?? '') + SEP + subjectId
    if (!subjectSeen.has(sKey)) {
      subjectSeen.add(sKey)
      subjects.push(Object.freeze({ subjectType, subjectId }))     // unique subject node
    }

    const signalKeys = Array.isArray(entry.signals)
      ? entry.signals.filter((s) => s && isStr(s.key)).map((s) => s.key)
      : []
    evidence.push(Object.freeze({
      evidenceId: entry.recordId,
      subjectType, subjectId,
      sourceType: isStr(record.sourceType) ? record.sourceType : null,
      signalKeys: Object.freeze(signalKeys),
    }))
    edges.push(Object.freeze({ type: 'about', from: entry.recordId, to: subjectId }))   // evidence → subject
  }

  // dedupe provenance edges — reuse M58 derivedFrom / supersededBy verbatim
  for (const p of proposals) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.duplicates)) continue
    for (const d of p.duplicates) {
      if (!d || typeof d !== 'object' || !isStr(d.recordId)) continue
      const canonical = (Array.isArray(d.derivedFrom) && isStr(d.derivedFrom[0]))
        ? d.derivedFrom[0]
        : (p.canonical && isStr(p.canonical.recordId) ? p.canonical.recordId : null)
      if (isStr(canonical)) {
        edges.push(Object.freeze({ type: 'derivedFrom', from: d.recordId, to: canonical }))   // duplicate → canonical
      }
      if (isStr(d.supersededBy)) {
        edges.push(Object.freeze({ type: 'supersedes', from: d.supersededBy, to: d.recordId }))  // canonical → duplicate
      }
    }
  }

  return Object.freeze({
    subjects: Object.freeze(subjects),
    evidence: Object.freeze(evidence),
    edges: Object.freeze(edges),
    counts: Object.freeze({ subjects: subjects.length, evidence: evidence.length, edges: edges.length }),
    problems: Object.freeze(problems),
  })
}
