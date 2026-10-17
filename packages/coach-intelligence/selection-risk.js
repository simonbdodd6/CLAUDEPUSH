/**
 * @coach-intelligence — Selection Risk Engine (M124, DORMANT)
 *
 * Analyses an M123 Starting XV recommendation and identifies coaching risks deterministically,
 * before any explanation or LLM layer exists. It is NOT an LLM — same input, same output. It
 * reuses the deterministic flags already produced upstream (vacancies, requiresCoachReview,
 * per-position eligible/unavailable signals) and adds no new AI logic. `reason` strings are
 * fixed templates, not generated language.
 *
 * Pure and side-effect free: no persistence, APIs, filesystem, network, randomness or clock.
 * Inputs are never mutated; output is deeply frozen.
 */

const SEVERITY_RANK = Object.freeze({ NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 })

const isObj = (v) => v !== null && typeof v === 'object'
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate the M123 Starting XV result. */
function assertStartingXV(r) {
  if (!isObj(r) || Array.isArray(r) || !Array.isArray(r.startingXV) || !Array.isArray(r.benchCandidates) ||
      !Array.isArray(r.unavailable) || !isObj(r.metadata)) {
    throw new TypeError('evaluateSelectionRisk requires an M123 Starting XV result')
  }
  const m = r.metadata
  if (!isFiniteNumber(m.filled) || !isFiniteNumber(m.vacant) || !isFiniteNumber(m.benchCount) || !isFiniteNumber(m.unavailableCount)) {
    throw new TypeError('evaluateSelectionRisk: invalid metadata')
  }

  const seenJerseys = new Set()
  const seenPlayers = new Set()
  for (const s of r.startingXV) {
    if (!isObj(s) || !isNonEmptyString(s.jersey) || !isNonEmptyString(s.position) || typeof s.status !== 'string' ||
        (s.player !== null && !isObj(s.player))) {
      throw new TypeError('evaluateSelectionRisk: malformed Starting XV entry')
    }
    if (seenJerseys.has(s.jersey)) throw new TypeError(`evaluateSelectionRisk: duplicate jersey "${s.jersey}"`)
    seenJerseys.add(s.jersey)
    if (s.player) {
      if (!isNonEmptyString(s.player.playerId)) throw new TypeError('evaluateSelectionRisk: malformed Starting XV player')
      if (seenPlayers.has(s.player.playerId)) throw new TypeError(`evaluateSelectionRisk: duplicate player "${s.player.playerId}"`)
      seenPlayers.add(s.player.playerId)
    }
  }
  for (const b of r.benchCandidates) {
    if (!isObj(b) || !isNonEmptyString(b.playerId) || !isNonEmptyString(b.position)) throw new TypeError('evaluateSelectionRisk: malformed bench candidate')
    if (seenPlayers.has(b.playerId)) throw new TypeError(`evaluateSelectionRisk: duplicate player "${b.playerId}"`)
    seenPlayers.add(b.playerId)
  }
  for (const u of r.unavailable) {
    if (!isObj(u) || !isNonEmptyString(u.position) || !isFiniteNumber(u.ineligibleCount)) throw new TypeError('evaluateSelectionRisk: malformed unavailable entry')
  }
}

const inc = (map, key) => map.set(key, (map.get(key) || 0) + 1)

/**
 * Evaluate coaching risks in an M123 Starting XV recommendation.
 *
 * @param {object} startingXV  the frozen result of `recommendStartingXV` (M123)
 * @returns {Readonly<{ overallRisk:string,
 *   risks: ReadonlyArray<Readonly<{ type:string, severity:string, jersey:(string|null), position:string, playerId:(string|null), reason:string }>>,
 *   metadata: object }>}
 */
export function evaluateSelectionRisk(startingXV) {
  assertStartingXV(startingXV)
  const { startingXV: xv, benchCandidates, unavailable } = startingXV

  // per-chart-position tallies derived from the XV + bench
  const filledByPosition = new Map()       // position -> # filled jerseys
  const firstFilledAt = new Map()          // position -> { jersey, playerId } (first filled)
  const eligibleByPosition = new Map()     // position -> # eligible players (XV + bench)
  for (const s of xv) {
    if (s.status === 'filled' && s.player) {
      inc(filledByPosition, s.position)
      inc(eligibleByPosition, s.position)
      if (!firstFilledAt.has(s.position)) firstFilledAt.set(s.position, { jersey: s.jersey, playerId: s.player.playerId })
    }
  }
  for (const b of benchCandidates) inc(eligibleByPosition, b.position)
  const eligiblePositions = new Set(eligibleByPosition.keys())

  const risks = []

  // vacant-position (CRITICAL) — per vacant jersey
  for (const s of xv) {
    if (s.status === 'vacant') {
      risks.push({ type: 'vacant-position', severity: 'CRITICAL', jersey: s.jersey, position: s.position, playerId: null, reason: `No eligible player for jersey ${s.jersey} (${s.position}).` })
    }
  }

  // review-required (MEDIUM) — selected player flagged requiresCoachReview
  for (const s of xv) {
    if (s.status === 'filled' && s.player && s.player.requiresCoachReview === true) {
      risks.push({ type: 'review-required', severity: 'MEDIUM', jersey: s.jersey, position: s.position, playerId: s.player.playerId, reason: `Selected player ${s.player.playerId} requires coach review.` })
    }
  }

  // unavailable-position (CRITICAL) — a position with only unavailable players (no eligible)
  for (const u of unavailable) {
    if (!eligiblePositions.has(u.position)) {
      risks.push({ type: 'unavailable-position', severity: 'CRITICAL', jersey: null, position: u.position, playerId: null, reason: `Only unavailable players for position ${u.position}.` })
    }
  }

  // thin-depth (HIGH) — exactly one eligible player for a position
  for (const [position, count] of eligibleByPosition) {
    if (count === 1) {
      const at = firstFilledAt.get(position)
      risks.push({ type: 'thin-depth', severity: 'HIGH', jersey: at ? at.jersey : null, position, playerId: at ? at.playerId : null, reason: `Only one eligible player for position ${position}.` })
    }
  }

  // duplicate-position-strength (LOW) — a position relied on for two or more jerseys
  for (const [position, count] of filledByPosition) {
    if (count >= 2) {
      risks.push({ type: 'duplicate-position-strength', severity: 'LOW', jersey: null, position, playerId: null, reason: `Position ${position} fills multiple jerseys.` })
    }
  }

  // deterministic ordering: severity desc, then type, jersey, playerId
  risks.sort((a, b) =>
    (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0)
    || ((a.jersey ?? '') < (b.jersey ?? '') ? -1 : (a.jersey ?? '') > (b.jersey ?? '') ? 1 : 0)
    || ((a.playerId ?? '') < (b.playerId ?? '') ? -1 : (a.playerId ?? '') > (b.playerId ?? '') ? 1 : 0))

  const highestSeverity = risks.reduce((hi, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[hi] ? r.severity : hi), 'NONE')

  return deepFreeze({
    overallRisk: highestSeverity,
    risks,
    metadata: {
      totalRisks: risks.length,
      highestSeverity,
      deterministic: true,
      explainable: true,
      llm: false,
    },
  })
}
