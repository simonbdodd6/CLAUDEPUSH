/**
 * @brain/evidence-gateway — dedupe provenance-link proposals (M58, DORMANT, data-only)
 *
 * Pure deterministic derivation of how the M57 dedupe groups WOULD be represented as
 * provenance links (M42 §3.4: "duplicates become derivedFrom/supersedes links, not new
 * truth — counts are not inflated"). It proposes only — it collapses NOTHING, deletes
 * NOTHING, writes no derivedFrom/supersedes link, reads/writes no Evidence Store, and
 * activates no persistence.
 *
 * For every group where `wouldCollapse` is true it chooses ONE canonical occurrence
 * deterministically:
 *   1) lowest batch index (if available)
 *   2) else earliest observedAt
 *   3) else stable input order (first encountered)
 * and describes, for each non-canonical occurrence, the provenance patch it WOULD
 * receive, using the existing contract fields (M43 Provenance):
 *   - derivedFrom: [canonicalRecordId]   (the duplicate collapses into a link → no count inflation)
 *   - supersedes:  null                  (pure duplication is not a correction; contract field stays null)
 *   - supersededBy: canonicalRecordId    (directional note — the canonical is authoritative)
 *
 * Single-entry groups produce no proposal. unknown_source / invalid_signals never reach
 * here (they are absent from the accepted-only dedupe groups). Results are immutable;
 * input is never mutated. No imports, no I/O, no clock, no randomness.
 */

const MAX_INDEX = Number.POSITIVE_INFINITY
const LATEST = '\uffff'   // sentinel: a missing observedAt sorts after any real ISO timestamp

const isStr = (v) => typeof v === 'string' && v.length > 0

/** Resolve an occurrence's observedAt via its record (null when unknown). */
function observedAtOf(entry, byId) {
  const r = byId.get(entry.recordId)
  return r && isStr(r.observedAt) ? r.observedAt : null
}

/**
 * Strict ordering for canonical selection: lower index, then earlier observedAt, then
 * 0 (caller keeps the first-encountered on a tie → stable input order).
 * @returns {number} <0 if a ranks before b
 */
function compareOccurrence(a, b, byId) {
  const ia = Number.isFinite(a.index) ? a.index : MAX_INDEX
  const ib = Number.isFinite(b.index) ? b.index : MAX_INDEX
  if (ia !== ib) return ia < ib ? -1 : 1
  const oa = observedAtOf(a, byId) ?? LATEST
  const ob = observedAtOf(b, byId) ?? LATEST
  if (oa !== ob) return oa < ob ? -1 : 1
  return 0
}

/** The frozen occurrence view used in a proposal. */
function occurrence(entry, byId) {
  return Object.freeze({
    index: entry.index,
    recordId: entry.recordId,
    signalKey: entry.signalKey,
    observedAt: observedAtOf(entry, byId),
  })
}

/**
 * Derive provenance-link proposals from M57 dedupe groups.
 *
 * @param {{ groups?: Array<{ key:string, entries:Array<{ index:number, recordId:string, signalKey:string }>, count:number, wouldCollapse:boolean }>,
 *           records?: Array<{ id:string, observedAt?:string }> }} [input]
 * @returns {Readonly<{
 *   proposals: ReadonlyArray<Readonly<{
 *     key:string,
 *     canonical: Readonly<{ index:number, recordId:string, signalKey:string, observedAt:string|null }>,
 *     duplicates: ReadonlyArray<Readonly<{ index:number, recordId:string, signalKey:string, observedAt:string|null, derivedFrom:ReadonlyArray<string>, supersedes:null, supersededBy:string }>>,
 *     count:number
 *   }>>,
 *   collapses:number, linkedRecords:number, problems:ReadonlyArray<object>
 * }>}
 */
export function deriveProvenanceProposals({ groups = [], records = [] } = {}) {
  if (!Array.isArray(groups) || !Array.isArray(records)) {
    throw new TypeError('deriveProvenanceProposals requires { groups: array, records: array }')
  }
  const byId = new Map()
  for (const r of records) {
    if (r && typeof r === 'object' && isStr(r.id)) byId.set(r.id, r)
  }

  const proposals = []
  const problems = []

  for (const group of groups) {
    if (!group || typeof group !== 'object' || !Array.isArray(group.entries)) continue
    if (!group.wouldCollapse) continue                 // single-entry groups: no collapse proposal
    const entries = group.entries
    if (entries.length < 2) continue                   // defensive: wouldCollapse implies ≥2

    // canonical = the strictly-best occurrence; ties keep the first encountered (stable)
    let canonical = entries[0]
    for (let i = 1; i < entries.length; i++) {
      if (compareOccurrence(entries[i], canonical, byId) < 0) canonical = entries[i]
    }
    const canonicalId = canonical.recordId

    const duplicates = entries
      .filter((e) => e !== canonical)                  // non-canonical, original order preserved
      .map((e) => {
        if (!byId.has(e.recordId)) {
          problems.push(Object.freeze({ key: group.key, recordId: e.recordId, problem: 'record not found for observedAt resolution' }))
        }
        return Object.freeze({
          index: e.index,
          recordId: e.recordId,
          signalKey: e.signalKey,
          observedAt: observedAtOf(e, byId),
          derivedFrom: Object.freeze([canonicalId]),   // duplicate collapses into a link to the canonical
          supersedes: null,                            // pure duplication ≠ correction (contract field stays null)
          supersededBy: canonicalId,                   // directional note: canonical is authoritative
        })
      })

    proposals.push(Object.freeze({
      key: group.key,
      canonical: occurrence(canonical, byId),
      duplicates: Object.freeze(duplicates),
      count: group.count,                              // == entries.length — NOT inflated
    }))
  }

  return Object.freeze({
    proposals: Object.freeze(proposals),
    collapses: proposals.length,
    linkedRecords: proposals.reduce((n, p) => n + p.duplicates.length, 0),
    problems: Object.freeze(problems),
  })
}
