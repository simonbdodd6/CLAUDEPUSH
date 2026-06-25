/**
 * @coach-intelligence — Selection Explanation Presenter (M185, DORMANT)
 *
 * A pure, deterministic presenter for an M184 Selection Explanation. It turns the explanation codes
 * into readable engineering/debug output ONLY — it is not user-facing coaching advice, not live AI,
 * and it never selects, ranks, recommends, or generates coaching prose. It reads only the passed
 * explanation object: it calls no providers, runs no pipeline, never invokes buildSelectionExplanation,
 * and derives no new conclusions. No timestamps, randomness, network, persistence, or Core changes.
 * Object output is deeply frozen.
 *
 * Formats: 'object' (default), 'text', 'json'. JSON uses the shared canonical key-sorted serializer
 * (already permitted for coach-intelligence by dependency-cruiser, as in M125/M127).
 */

import { canonicalStringify } from '@brain/evidence-gateway'

const SUPPORTED_FORMATS = Object.freeze(['object', 'text', 'json'])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const strOrNull = (v) => (typeof v === 'string' ? v : null)
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const codesOf = (v) => arr(v).filter((c) => typeof c === 'string')

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function cloneSummary(s) {
  if (!isObj(s)) return {}
  return {
    starterCount: numOrNull(s.starterCount),
    benchCount: numOrNull(s.benchCount),
    reserveCount: numOrNull(s.reserveCount),
    formation: isObj(s.formation) ? { ...s.formation } : {},
    overallRisk: strOrNull(s.overallRisk),
  }
}

/** Normalize the M184 explanation into a stable, presenter-friendly object (missing sections → []). */
function normalize(explanation) {
  const starters = arr(explanation.starters).map((s) => ({
    jersey: isObj(s) ? strOrNull(s.jersey) : null,
    playerId: isObj(s) ? strOrNull(s.playerId) : null,
    codes: isObj(s) ? codesOf(s.explanationCodes) : [],
  }))
  const bench = arr(explanation.bench).map((b) => ({
    playerId: isObj(b) ? strOrNull(b.playerId) : null,
    codes: isObj(b) ? codesOf(b.explanationCodes) : [],
  }))
  const risks = arr(explanation.risks).map((r) => ({
    code: isObj(r) ? strOrNull(r.type) : null,
    severity: isObj(r) ? strOrNull(r.severity) : null,
    jersey: isObj(r) ? strOrNull(r.jersey) : null,
    position: isObj(r) ? strOrNull(r.position) : null,
    playerId: isObj(r) ? strOrNull(r.playerId) : null,
    reason: isObj(r) ? strOrNull(r.reason) : null,
  }))
  const alternatives = arr(explanation.alternatives).map((a) => ({
    playerId: isObj(a) ? strOrNull(a.playerId) : null,
    position: isObj(a) ? strOrNull(a.position) : null,
  }))
  const confidenceNotes = arr(explanation.confidenceNotes).map((c) => ({
    playerId: isObj(c) ? strOrNull(c.playerId) : null,
    score: isObj(c) ? numOrNull(c.score) : null,
    alignmentTier: isObj(c) ? strOrNull(c.alignmentTier) : null,
  }))

  return {
    summary: cloneSummary(explanation.summary),
    starters,
    bench,
    risks,
    alternatives,
    confidenceNotes,
    counts: {
      starters: starters.length,
      bench: bench.length,
      risks: risks.length,
      alternatives: alternatives.length,
      confidenceNotes: confidenceNotes.length,
    },
  }
}

/** Render the normalized explanation as a deterministic multi-line debug string. */
function renderText(n) {
  const lines = [`SelectionExplanation starters=${n.counts.starters} bench=${n.counts.bench} risks=${n.counts.risks} alternatives=${n.counts.alternatives}`]
  for (const s of n.starters) lines.push(`starter jersey=${s.jersey} player=${s.playerId} codes=${s.codes.join(',')}`)
  for (const b of n.bench) lines.push(`bench player=${b.playerId} codes=${b.codes.join(',')}`)
  for (const r of n.risks) lines.push(`risk code=${r.code} severity=${r.severity}`)
  for (const a of n.alternatives) lines.push(`alternative player=${a.playerId} position=${a.position}`)
  return lines.join('\n')
}

/**
 * Present an M184 selection explanation for engineering/debug review.
 *
 * @param {object} explanation  an M184 buildSelectionExplanation result
 * @param {('object'|'text'|'json')} [format='object']
 * @returns {(Readonly<object>|string)}  frozen normalized object ('object'), or a string ('text'/'json')
 */
export function summarizeSelectionExplanation(explanation, format = 'object') {
  if (typeof format !== 'string' || !SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeSelectionExplanation: unsupported format "${format}" (expected object | text | json)`)
  }
  if (!isObj(explanation)) throw new TypeError('summarizeSelectionExplanation requires an M184 explanation object')

  const n = normalize(explanation)
  if (format === 'text') return renderText(n)
  if (format === 'json') return canonicalStringify(n)
  return deepFreeze(n)
}
