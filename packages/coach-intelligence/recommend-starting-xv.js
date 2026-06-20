/**
 * @coach-intelligence — Starting XV Recommendation Engine (M123, DORMANT)
 *
 * The first complete deterministic Starting XV recommender. Given an M122 depth chart and a
 * formation (jersey → position), it fills each jersey with the first not-yet-selected eligible
 * player from the matching position, leaving a jersey "vacant" when no eligible player remains.
 * It is NOT an LLM and generates no language — the same inputs always produce the same output.
 *
 * Pure and side-effect free: no persistence, APIs, filesystem, network, randomness, clock or
 * AI calls. Inputs are never mutated; output is deeply frozen.
 */

export const DEFAULT_FORMATION = Object.freeze({
  1: 'LH', 2: 'Hooker', 3: 'TH', 4: 'Lock', 5: 'Lock', 6: 'Blindside', 7: 'Openside', 8: 'Number8',
  9: 'ScrumHalf', 10: 'FlyHalf', 11: 'LeftWing', 12: 'InsideCentre', 13: 'OutsideCentre', 14: 'RightWing', 15: 'Fullback',
})

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

/** Validate the M122 depth chart (shape + no duplicate positions or players). */
function assertDepthChart(dc) {
  if (!isObj(dc) || Array.isArray(dc) || !Array.isArray(dc.positions)) {
    throw new TypeError('recommendStartingXV requires an M122 depth chart { positions }')
  }
  const seenPositions = new Set()
  const seenPlayers = new Set()
  for (const p of dc.positions) {
    if (!isObj(p) || !isNonEmptyString(p.position) || !Array.isArray(p.depth) ||
        (p.starter !== null && !isObj(p.starter)) || !isFiniteNumber(p.eligibleCount) || !isFiniteNumber(p.ineligibleCount)) {
      throw new TypeError('recommendStartingXV: invalid depth chart position')
    }
    if (seenPositions.has(p.position)) throw new TypeError(`recommendStartingXV: duplicate position "${p.position}"`)
    seenPositions.add(p.position)
    const pool = p.starter ? [p.starter, ...p.depth] : [...p.depth]
    for (const player of pool) {
      if (!isObj(player) || !isNonEmptyString(player.playerId)) throw new TypeError('recommendStartingXV: invalid player item')
      if (seenPlayers.has(player.playerId)) throw new TypeError(`recommendStartingXV: duplicate player "${player.playerId}"`)
      seenPlayers.add(player.playerId)
    }
  }
}

/** Validate the formation and return the resolved formation (default when empty). */
function resolveFormation(formation) {
  if (!isObj(formation) || Array.isArray(formation)) throw new TypeError('recommendStartingXV: invalid formation')
  const resolved = Object.keys(formation).length === 0 ? DEFAULT_FORMATION : formation
  for (const jersey of Object.keys(resolved)) {
    if (!isNonEmptyString(jersey) || !isNonEmptyString(resolved[jersey])) {
      throw new TypeError('recommendStartingXV: malformed jersey (jersey and position must be non-empty strings)')
    }
  }
  return resolved
}

/**
 * Recommend a deterministic Starting XV from an M122 depth chart.
 *
 * @param {object} depthChart  the frozen result of `buildDepthChart` (M122)
 * @param {Record<string,string>} [formation]  jersey → position (defaults to DEFAULT_FORMATION)
 * @returns {Readonly<{
 *   startingXV: ReadonlyArray<Readonly<{ jersey:string, position:string, player:(object|null), status:string }>>,
 *   benchCandidates: ReadonlyArray<object>,
 *   unavailable: ReadonlyArray<Readonly<{ position:string, ineligibleCount:number }>>,
 *   metadata: object
 * }>}
 */
export function recommendStartingXV(depthChart, formation = {}) {
  assertDepthChart(depthChart)
  const resolvedFormation = resolveFormation(formation)

  // position -> ordered eligible pool (starter then depth, M122 ranking order)
  const poolByPosition = new Map()
  for (const p of depthChart.positions) {
    poolByPosition.set(p.position, p.starter ? [p.starter, ...p.depth] : [...p.depth])
  }

  const usedIds = new Set()
  const startingXV = []
  for (const jersey of Object.keys(resolvedFormation)) {
    const position = resolvedFormation[jersey]
    const pool = poolByPosition.get(position) || []
    let player = null
    for (const candidate of pool) {
      if (!usedIds.has(candidate.playerId)) { player = candidate; usedIds.add(candidate.playerId); break }
    }
    startingXV.push({ jersey, position, player, status: player ? 'filled' : 'vacant' })
  }

  // bench: every remaining eligible player not selected (depth-chart order: positions alphabetical, then pool order)
  const benchCandidates = []
  for (const p of depthChart.positions) {
    const pool = p.starter ? [p.starter, ...p.depth] : [...p.depth]
    for (const candidate of pool) if (!usedIds.has(candidate.playerId)) benchCandidates.push(candidate)
  }

  // unavailable carried through from M122 (only per-position counts exist there)
  const unavailable = depthChart.positions
    .filter((p) => p.ineligibleCount > 0)
    .map((p) => ({ position: p.position, ineligibleCount: p.ineligibleCount }))
  const unavailableCount = unavailable.reduce((sum, u) => sum + u.ineligibleCount, 0)

  const filled = startingXV.filter((s) => s.status === 'filled').length

  return deepFreeze({
    startingXV,
    benchCandidates,
    unavailable,
    metadata: {
      filled,
      vacant: startingXV.length - filled,
      benchCount: benchCandidates.length,
      unavailableCount,
      deterministic: true,
      explainable: true,
      llm: false,
    },
  })
}
