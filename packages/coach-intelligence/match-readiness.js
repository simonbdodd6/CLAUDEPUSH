/**
 * @coach-intelligence — Match Readiness Intelligence (M206, DORMANT, read-only)
 *
 * Observes an already-produced match-day squad (M130) + its explanation (M184) + the current Core
 * availability, and reports a deterministic READINESS picture for the coach to review before they
 * publish a team. It does NOT select the team, recommend players, rank, score, or advise — it only
 * highlights what it sees, as structured deterministic codes. The coach remains fully responsible for
 * every selection.
 *
 * Pure and side-effect free: no providers, network, persistence, randomness, timestamps, or clock.
 * Inputs are never mutated; output is deeply frozen. Reuses existing outputs only (no duplicated logic).
 *
 * Input: { squad, explanation?, availability? }
 *   - squad        : an M130 match-day squad (or null/absent ⇒ NO_SELECTION)
 *   - explanation  : an M184 selection explanation (for coverage; optional)
 *   - availability : { [playerId]: ('available'|'unavailable'|'maybe') | { response } }  (optional)
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const isFrontRow = (position) => /prop|hooker/i.test(String(position || ''))

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Normalise an availability value (string or { response }) to a response string. */
const responseOf = (v) => (typeof v === 'string' ? v : (isObj(v) && typeof v.response === 'string' ? v.response : ''))

const playerIdOf = (v) => (isObj(v) && typeof v.playerId === 'string' && v.playerId.trim() ? v.playerId : null)

/**
 * Assess match readiness for an existing squad.
 *
 * @param {{ squad: (object|null), explanation?: object, availability?: object }} input
 * @returns {Readonly<{ status:string, codes:string[], metrics:object }>}
 */
export function assessMatchReadiness(input) {
  if (!isObj(input)) throw new TypeError('assessMatchReadiness requires an input object { squad, explanation?, availability? }')

  const squad = isObj(input.squad) ? input.squad : null
  const explanation = isObj(input.explanation) ? input.explanation : null

  // ── availability tallies (optional) ──
  const availability = isObj(input.availability) ? input.availability : null
  const unavailableSet = new Set()
  let totalAvailable = null
  let totalUnavailable = null
  let totalMaybe = null
  if (availability) {
    totalAvailable = 0; totalUnavailable = 0; totalMaybe = 0
    for (const [pid, raw] of Object.entries(availability)) {
      const r = responseOf(raw)
      if (r === 'available') totalAvailable += 1
      else if (r === 'unavailable') { totalUnavailable += 1; unavailableSet.add(pid) }
      else if (r === 'maybe') totalMaybe += 1
    }
  }

  // ── no squad / nothing selected ──
  const startingXV = squad && Array.isArray(squad.startingXV) ? squad.startingXV : []
  const filled = startingXV.filter((s) => isObj(s) && s.status === 'filled' && isObj(s.player) && typeof s.player.playerId === 'string')
  if (!squad || filled.length === 0) {
    return deepFreeze({
      status: 'NO_SELECTION',
      codes: [],
      metrics: {
        startersFilled: 0, startersVacant: startingXV.length, squadComplete: false,
        benchSize: 0, reserveSize: 0, totalSelected: 0,
        frontRowFilled: 0, frontRowRequired: 0, frontRowComplete: false,
        totalAvailable, totalUnavailable, totalMaybe,
        captainAvailable: false, viceCaptainAvailable: false,
        explanationCoverage: null, vacantPositions: [], unavailableStarters: [],
      },
    })
  }

  // ── squad metrics ──
  const vacant = startingXV.filter((s) => isObj(s) && s.status !== 'filled')
  const startersFilled = filled.length
  const startersVacant = vacant.length
  const squadComplete = startersVacant === 0
  const bench = Array.isArray(squad.bench) ? squad.bench : []
  const reserves = Array.isArray(squad.reserves) ? squad.reserves : []
  const benchSize = bench.length
  const reserveSize = reserves.length
  const totalSelected = startersFilled + benchSize + reserveSize

  const frontRowJerseys = startingXV.filter((s) => isObj(s) && isFrontRow(s.position))
  const frontRowRequired = frontRowJerseys.length
  const frontRowFilled = frontRowJerseys.filter((s) => s.status === 'filled').length
  const frontRowComplete = frontRowFilled >= 3

  const vacantPositions = vacant
    .map((s) => ({ jersey: typeof s.jersey === 'string' ? s.jersey : null, position: typeof s.position === 'string' ? s.position : null }))
    .sort((a, b) => sortStr(String(a.jersey), String(b.jersey)))

  const unavailableStarters = filled
    .map((s) => s.player.playerId)
    .filter((pid) => unavailableSet.has(pid))
    .sort(sortStr)

  const captainId = playerIdOf(squad.captain)
  const viceId = playerIdOf(squad.viceCaptain)
  const captainAvailable = captainId !== null && !unavailableSet.has(captainId)
  const viceCaptainAvailable = viceId !== null && !unavailableSet.has(viceId)

  const explanationCoverage = explanation && Array.isArray(explanation.starters)
    ? Math.round((explanation.starters.length / startersFilled) * 100) / 100
    : null

  // ── deterministic warning codes ──
  const codes = new Set()
  if (startersVacant > 0) codes.add('VACANT_POSITIONS')
  if (frontRowFilled < 3) codes.add('INSUFFICIENT_FRONT_ROW')
  if (benchSize === 0) codes.add('NO_BENCH')
  if (!captainAvailable) codes.add('CAPTAIN_UNAVAILABLE')
  if (!viceCaptainAvailable) codes.add('VICE_CAPTAIN_UNAVAILABLE')
  if (unavailableStarters.length > 0) codes.add('UNAVAILABLE_STARTERS')
  if (availability && totalAvailable < 15) codes.add('LOW_PLAYER_NUMBERS')

  const sortedCodes = [...codes].sort(sortStr)
  const status = sortedCodes.length > 0 ? 'READY_WITH_WARNINGS' : 'READY'

  return deepFreeze({
    status,
    codes: sortedCodes,
    metrics: {
      startersFilled, startersVacant, squadComplete,
      benchSize, reserveSize, totalSelected,
      frontRowFilled, frontRowRequired, frontRowComplete,
      totalAvailable, totalUnavailable, totalMaybe,
      captainAvailable, viceCaptainAvailable,
      explanationCoverage,
      vacantPositions,
      unavailableStarters,
    },
  })
}
