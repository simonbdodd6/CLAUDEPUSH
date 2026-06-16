/**
 * @brain/evidence-gateway — dedupe confidence-reweight proposals (M59, DORMANT, data-only)
 *
 * Pure deterministic derivation of how a canonical signal's confidence WOULD change
 * once its duplicates (M58 provenance proposals) are folded in as corroboration
 * (M42 §3.6). It proposes only — it applies NO confidence change, merges NOTHING,
 * reads/writes no Evidence Store, activates no persistence.
 *
 * The aggregate confidence is NOT computed here: it REUSES the deterministic
 * @brain/evidence-weighting `combineEvidenceConfidence` (no duplicated confidence
 * logic), feeding the canonical signal plus each resolved duplicate signal as
 * supporting items. The library already clamps to [0,1], so the proposed confidence
 * can never exceed bounds. Counts are not inflated (count is taken from the proposal),
 * no occurrence is deleted or merged, and unknown_source / invalid_signals never reach
 * here (the proposals come from the accepted-only dedupe groups).
 *
 * Confidence values come only from the ACCEPTED ApplicationPlan entries, resolved by
 * (recordId, signalKey). Results are immutable; input is never mutated. The only
 * external import is @brain/evidence-weighting. No I/O, no clock, no randomness.
 */

import { combineEvidenceConfidence } from '@brain/evidence-weighting'

const SEP = '\u001f'
const isStr = (v) => typeof v === 'string' && v.length > 0
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** Index signal confidence by `${recordId}${signalKey}` over the accepted entries. */
function buildConfidenceIndex(accepted) {
  const map = new Map()
  for (const entry of accepted) {
    if (!entry || typeof entry !== 'object' || !isStr(entry.recordId)) continue
    const signals = Array.isArray(entry.signals) ? entry.signals : []
    for (const s of signals) {
      if (s && typeof s === 'object' && isStr(s.key) && isNum(s.confidence)) {
        map.set(entry.recordId + SEP + s.key, s.confidence)
      }
    }
  }
  return map
}

/**
 * Derive confidence-reweight proposals from M58 provenance proposals + the accepted
 * ApplicationPlan entries (for signal confidences).
 *
 * @param {{ proposals?: Array<{ key:string, canonical:{ recordId:string, signalKey:string }, duplicates:Array<{ recordId:string, signalKey:string }>, count:number }>,
 *           accepted?: Array<{ recordId:string, signals:Array<{ key:string, confidence:number }> }> }} [input]
 * @returns {Readonly<{
 *   proposals: ReadonlyArray<Readonly<{
 *     key:string, recordId:string, signalKey:string,
 *     currentConfidence:number, proposedConfidence:number, delta:number,
 *     supportingDuplicates:ReadonlyArray<string>, disputed:boolean, count:number
 *   }>>,
 *   reweighted:number, problems:ReadonlyArray<object>
 * }>}
 */
export function deriveConfidenceReweightProposals({ proposals = [], accepted = [] } = {}) {
  if (!Array.isArray(proposals) || !Array.isArray(accepted)) {
    throw new TypeError('deriveConfidenceReweightProposals requires { proposals: array, accepted: array }')
  }
  const confOf = buildConfidenceIndex(accepted)

  const out = []
  const problems = []

  for (const p of proposals) {
    if (!p || typeof p !== 'object' || !p.canonical || typeof p.canonical !== 'object') continue
    const canonical = p.canonical
    const canonicalConf = confOf.get(canonical.recordId + SEP + canonical.signalKey)
    if (!isNum(canonicalConf)) {
      problems.push(Object.freeze({ key: p.key, recordId: canonical.recordId, problem: 'canonical signal confidence not resolved' }))
      continue
    }

    const items = [{ confidence: canonicalConf }]          // canonical signal as the base supporter
    const supportingDuplicates = []
    const duplicates = Array.isArray(p.duplicates) ? p.duplicates : []
    for (const d of duplicates) {
      const c = confOf.get(d.recordId + SEP + d.signalKey)
      if (isNum(c)) { items.push({ confidence: c }); supportingDuplicates.push(d.recordId) }   // corroborating duplicate
      else problems.push(Object.freeze({ key: p.key, recordId: d.recordId, problem: 'duplicate signal confidence not resolved' }))
    }

    const combined = combineEvidenceConfidence(items)       // REUSE weighting; already clamped to [0,1]

    out.push(Object.freeze({
      key: p.key,
      recordId: canonical.recordId,
      signalKey: canonical.signalKey,
      currentConfidence: canonicalConf,                     // preserved
      proposedConfidence: combined.confidence,              // proposed (bounds-respected)
      delta: combined.confidence - canonicalConf,
      supportingDuplicates: Object.freeze(supportingDuplicates),
      disputed: combined.disputed,
      count: p.count,                                       // == group occurrences — NOT inflated
    }))
  }

  return Object.freeze({
    proposals: Object.freeze(out),
    reweighted: out.length,
    problems: Object.freeze(problems),
  })
}
