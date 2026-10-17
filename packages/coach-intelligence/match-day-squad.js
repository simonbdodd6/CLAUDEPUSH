/**
 * @coach-intelligence — Match-Day Squad Composer (M130, DORMANT)
 *
 * Pure deterministic composer that assembles the complete match-day squad from the existing
 * Coach Intelligence engine outputs: M123 Starting XV, M124 selection risk, M126 sign-off,
 * M128 captain recommendation, M129 bench recommendation. It is COMPOSITION ONLY — it creates
 * no logic, rescoring nothing, generates no risks, and changes no captain / bench / sign-off
 * decision. It merely maps the outputs into one canonical, deeply-frozen structure.
 *
 * Reads only — no mutation, persistence, filesystem, APIs, network, randomness or clock.
 */

const isObj = (v) => v !== null && typeof v === 'object'
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function assertStartingXV(r) {
  if (!isObj(r) || Array.isArray(r) || !Array.isArray(r.startingXV) || !Array.isArray(r.benchCandidates) ||
      !Array.isArray(r.unavailable) || !isObj(r.metadata)) {
    throw new TypeError('composeMatchDaySquad: invalid startingXV (M123)')
  }
}
function assertSelectionRisk(r) {
  if (!isObj(r) || Array.isArray(r) || typeof r.overallRisk !== 'string' || !Array.isArray(r.risks) || !isObj(r.metadata)) {
    throw new TypeError('composeMatchDaySquad: invalid selectionRisk (M124)')
  }
}
function assertSignOff(r) {
  if (!isObj(r) || Array.isArray(r) || typeof r.approved !== 'boolean' || !Array.isArray(r.blockers) ||
      typeof r.requiresReview !== 'boolean' || !isObj(r.metadata)) {
    throw new TypeError('composeMatchDaySquad: invalid signOff (M126)')
  }
}
function assertCaptainRecommendation(r) {
  if (!isObj(r) || Array.isArray(r) || (r.captain !== null && !isObj(r.captain)) ||
      (r.viceCaptain !== null && !isObj(r.viceCaptain)) || !Array.isArray(r.ranked) || !isObj(r.metadata)) {
    throw new TypeError('composeMatchDaySquad: invalid captainRecommendation (M128)')
  }
}
function assertBenchRecommendation(r) {
  if (!isObj(r) || Array.isArray(r) || !Array.isArray(r.bench) || !Array.isArray(r.reserves) || !isObj(r.metadata)) {
    throw new TypeError('composeMatchDaySquad: invalid benchRecommendation (M129)')
  }
}

/**
 * Assemble the complete match-day squad from the existing engine outputs.
 *
 * @param {{ startingXV:object, captainRecommendation:object, benchRecommendation:object,
 *   selectionRisk:object, signOff:object }} parts  M123 + M128 + M129 + M124 + M126 outputs
 * @returns {Readonly<{ startingXV:ReadonlyArray<object>, captain:(object|null), viceCaptain:(object|null),
 *   bench:ReadonlyArray<object>, reserves:ReadonlyArray<object>, risk:object, signOff:object, metadata:object }>}
 */
export function composeMatchDaySquad(parts) {
  if (!isObj(parts) || Array.isArray(parts)) throw new TypeError('composeMatchDaySquad requires { startingXV, captainRecommendation, benchRecommendation, selectionRisk, signOff }')
  const { startingXV, captainRecommendation, benchRecommendation, selectionRisk, signOff } = parts

  assertStartingXV(startingXV)
  assertSelectionRisk(selectionRisk)
  assertSignOff(signOff)
  assertCaptainRecommendation(captainRecommendation)
  assertBenchRecommendation(benchRecommendation)

  // complete-squad members = starting (filled) + bench + reserves; captain/vice are roles, not extra members
  const startingPlayerIds = startingXV.startingXV
    .filter((s) => s.status === 'filled' && isObj(s.player))
    .map((s) => s.player.playerId)
  const benchIds = benchRecommendation.bench.map((p) => p.playerId)
  const reserveIds = benchRecommendation.reserves.map((p) => p.playerId)

  const seen = new Set()
  for (const id of [...startingPlayerIds, ...benchIds, ...reserveIds]) {
    if (!isNonEmptyString(id)) throw new TypeError('composeMatchDaySquad: malformed squad player')
    if (seen.has(id)) throw new TypeError(`composeMatchDaySquad: duplicate player "${id}"`)
    seen.add(id)
  }

  return deepFreeze({
    startingXV: startingXV.startingXV,        // M123.startingXV
    captain: captainRecommendation.captain,   // M128.captain
    viceCaptain: captainRecommendation.viceCaptain,   // M128.viceCaptain
    bench: benchRecommendation.bench,         // M129.bench
    reserves: benchRecommendation.reserves,   // M129.reserves
    risk: selectionRisk,                      // M124
    signOff,                                  // M126
    metadata: {
      startingPlayers: startingPlayerIds.length,
      benchPlayers: benchIds.length,
      reservePlayers: reserveIds.length,
      approved: signOff.approved,
      deterministic: true,
      explainable: true,
      llm: false,
    },
  })
}
