/**
 * @coach-intelligence — Selection Explanation Engine (M184, DORMANT)
 *
 * Explains WHY an already-generated match-day squad (M130) looks the way it does — it NEVER chooses
 * players, alters recommendations, rescoring, re-ranks, or influences selection. "The coach makes the
 * decision. The Brain explains what it sees." It consumes existing deterministic pipeline outputs
 * only and emits structured EXPLANATION CODES (no AI prose, no NLP, no generated language).
 *
 * Pure and side-effect free: no persistence, network, store, LLM, Date.now, Math.random, clock or
 * randomness. Inputs are never mutated; output is deeply frozen. Reuses existing M124 risks and
 * existing confidence/score values verbatim; invents no risks, alternatives, or confidence.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strOrNull = (v) => (typeof v === 'string' ? v : null)

// canonical, fixed code order → deterministic output regardless of evaluation order
const CODE_ORDER = Object.freeze([
  'CAPTAIN_SELECTION',
  'FORMATION_REQUIREMENT',
  'BENCH_COVER',
  'POSITION_MATCH',
  'HIGH_ALIGNMENT',
  'CONSISTENT_SELECTION',
  'LOW_SELECTION_RISK',
])
const orderCodes = (set) => CODE_ORDER.filter((c) => set.has(c))
const HIGH_TIERS = Object.freeze(['excellent', 'good'])

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Plain-JSON deep clone (reused outputs are plain data) so the explanation never shares references. */
function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (isObj(value)) { const o = {}; for (const k of Object.keys(value)) o[k] = clone(value[k]); return o }
  return value
}

const tierOf = (player) => (isObj(player.evidence) ? player.evidence.alignmentTier : undefined)
const notChallenged = (player) => isObj(player.evidence) && player.evidence.challenged === false

/**
 * Explain an existing match-day squad recommendation as deterministic explanation codes.
 *
 * @param {object} squad  an M130 match-day squad (composeMatchDaySquad / runSelectionPipeline result)
 * @returns {Readonly<{
 *   summary: object, starters: object[], bench: object[], risks: object[],
 *   alternatives: object[], confidenceNotes: object[] }>}
 */
export function buildSelectionExplanation(squad) {
  if (!isObj(squad)) throw new TypeError('buildSelectionExplanation requires a match-day squad object')
  if (!Array.isArray(squad.startingXV)) throw new TypeError('buildSelectionExplanation: squad.startingXV must be an array')

  const bench = squad.bench === undefined ? [] : squad.bench
  if (!Array.isArray(bench)) throw new TypeError('buildSelectionExplanation: squad.bench must be an array')
  const reserves = squad.reserves === undefined ? [] : squad.reserves
  if (!Array.isArray(reserves)) throw new TypeError('buildSelectionExplanation: squad.reserves must be an array')

  const riskObj = isObj(squad.risk) ? squad.risk : null
  const riskList = riskObj && Array.isArray(riskObj.risks) ? riskObj.risks : []
  const overallRisk = riskObj && typeof riskObj.overallRisk === 'string' ? riskObj.overallRisk : null

  const captainId = isObj(squad.captain) && isNonEmptyString(squad.captain.playerId) ? squad.captain.playerId : null
  const viceId = isObj(squad.viceCaptain) && isNonEmptyString(squad.viceCaptain.playerId) ? squad.viceCaptain.playerId : null

  // players already flagged by an existing M124 risk entry (do NOT generate new risks)
  const flagged = new Set(riskList.filter((r) => isObj(r) && isNonEmptyString(r.playerId)).map((r) => r.playerId))

  // ── starters (filled jerseys only) ──
  const starters = []
  const formation = {}
  const confidenceNotes = []
  for (const s of squad.startingXV) {
    if (!isObj(s)) throw new TypeError('buildSelectionExplanation: malformed startingXV entry')
    if (isNonEmptyString(s.jersey) && isNonEmptyString(s.position)) formation[s.jersey] = s.position
    if (s.status !== 'filled') continue
    const p = s.player
    if (!isObj(p) || !isNonEmptyString(p.playerId)) throw new TypeError('buildSelectionExplanation: malformed starter player')

    const codes = new Set(['FORMATION_REQUIREMENT'])
    if (p.playerId === captainId || p.playerId === viceId) codes.add('CAPTAIN_SELECTION')
    if (isNonEmptyString(p.position) && isNonEmptyString(s.position) && p.position === s.position) codes.add('POSITION_MATCH')
    if (HIGH_TIERS.includes(tierOf(p))) codes.add('HIGH_ALIGNMENT')
    if (notChallenged(p)) codes.add('CONSISTENT_SELECTION')
    if (!flagged.has(p.playerId)) codes.add('LOW_SELECTION_RISK')

    starters.push({ playerId: p.playerId, jersey: strOrNull(s.jersey), explanationCodes: orderCodes(codes) })
    confidenceNotes.push({ playerId: p.playerId, score: numOrNull(p.score), alignmentTier: strOrNull(tierOf(p)) })
  }

  // ── bench (cover) ──
  const benchOut = []
  for (const p of bench) {
    if (!isObj(p) || !isNonEmptyString(p.playerId)) throw new TypeError('buildSelectionExplanation: malformed bench player')
    const codes = new Set(['BENCH_COVER'])
    if (HIGH_TIERS.includes(tierOf(p))) codes.add('HIGH_ALIGNMENT')
    if (notChallenged(p)) codes.add('CONSISTENT_SELECTION')
    if (!flagged.has(p.playerId)) codes.add('LOW_SELECTION_RISK')
    benchOut.push({ playerId: p.playerId, explanationCodes: orderCodes(codes) })
    confidenceNotes.push({ playerId: p.playerId, score: numOrNull(p.score), alignmentTier: strOrNull(tierOf(p)) })
  }

  // ── alternatives (existing reserves only) ──
  const alternatives = []
  for (const r of reserves) {
    if (!isObj(r) || !isNonEmptyString(r.playerId)) throw new TypeError('buildSelectionExplanation: malformed reserve')
    alternatives.push({ playerId: r.playerId, position: strOrNull(r.position) })
  }

  return deepFreeze({
    summary: {
      starterCount: starters.length,
      benchCount: benchOut.length,
      reserveCount: alternatives.length,
      formation,
      overallRisk,
    },
    starters,
    bench: benchOut,
    risks: clone(riskList),          // reuse M124 risks verbatim (deep-cloned, never shared/mutated)
    alternatives,
    confidenceNotes,                 // existing score / alignmentTier values only
  })
}
