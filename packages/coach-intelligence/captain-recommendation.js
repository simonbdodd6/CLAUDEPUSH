/**
 * @coach-intelligence — Captain Recommendation Engine (M128, DORMANT)
 *
 * Deterministically recommends a captain and vice-captain from the selected Starting XV (M123).
 * It evaluates only players actually selected, using existing structured fields only — it
 * invents no scores (missing scores are treated as zero), runs no AI/LLM, and produces no
 * language. Same input, same recommendation.
 *
 * Pure and side-effect free: no persistence, APIs, filesystem, network, randomness or clock.
 * Inputs are never mutated; output is deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object'
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)   // missing/invalid score → 0

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate the M123 Starting XV result and reject duplicate / malformed selected players. */
function assertStartingXV(r) {
  if (!isObj(r) || Array.isArray(r) || !Array.isArray(r.startingXV) || !Array.isArray(r.benchCandidates) ||
      !Array.isArray(r.unavailable) || !isObj(r.metadata)) {
    throw new TypeError('recommendCaptain requires a valid M123 Starting XV')
  }
  const seen = new Set()
  for (const s of r.startingXV) {
    if (!isObj(s) || !isNonEmptyString(s.jersey) || !isNonEmptyString(s.position) || typeof s.status !== 'string' ||
        (s.player !== null && !isObj(s.player))) {
      throw new TypeError('recommendCaptain: malformed Starting XV entry')
    }
    if (s.status === 'filled') {
      if (!isObj(s.player) || !isNonEmptyString(s.player.playerId)) throw new TypeError('recommendCaptain: malformed player record')
      if (seen.has(s.player.playerId)) throw new TypeError(`recommendCaptain: duplicate player "${s.player.playerId}"`)
      seen.add(s.player.playerId)
    }
  }
}

/**
 * Recommend captain and vice-captain from a Starting XV.
 *
 * @param {object} startingXV  a result from `recommendStartingXV` (M123)
 * @param {object} [options]   reserved (no options currently)
 * @returns {Readonly<{ captain:(object|null), viceCaptain:(object|null),
 *   ranked: ReadonlyArray<Readonly<{ playerId:string, jersey:string, position:string,
 *     requiresCoachReview:boolean, leadershipScore:number, experienceScore:number, consistencyScore:number }>>,
 *   metadata: object }>}
 */
export function recommendCaptain(startingXV, options = {}) {
  assertStartingXV(startingXV)
  if (!isObj(options) || Array.isArray(options)) throw new TypeError('recommendCaptain: options must be an object')

  // candidates = the selected (filled) players only; build an explainable view from existing fields
  const candidates = startingXV.startingXV
    .filter((s) => s.status === 'filled' && s.player)
    .map((s) => ({
      playerId: s.player.playerId,
      jersey: s.jersey,
      position: s.position,
      requiresCoachReview: s.player.requiresCoachReview === true,
      leadershipScore: num(s.player.leadershipScore),
      experienceScore: num(s.player.experienceScore),
      consistencyScore: num(s.player.consistencyScore),
    }))

  // deterministic ranking: review penalty, then leadership, experience, consistency, then playerId
  const ranked = candidates.slice().sort((a, b) =>
    ((a.requiresCoachReview ? 1 : 0) - (b.requiresCoachReview ? 1 : 0))   // non-flagged before flagged (penalty)
    || (b.leadershipScore - a.leadershipScore)
    || (b.experienceScore - a.experienceScore)
    || (b.consistencyScore - a.consistencyScore)
    || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0))

  const captain = ranked.length > 0 ? ranked[0] : null
  const viceCaptain = ranked.length > 1 ? ranked[1] : null

  return deepFreeze({
    captain,
    viceCaptain,
    ranked,
    metadata: {
      captainSelected: captain !== null,
      viceCaptainSelected: viceCaptain !== null,
      candidateCount: ranked.length,
      deterministic: true,
      explainable: true,
      llm: false,
    },
  })
}
