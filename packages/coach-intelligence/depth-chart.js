/**
 * @coach-intelligence — Positional Depth Chart (M122, DORMANT)
 *
 * Turns an M121 squad evaluation into a coach-reviewable positional depth chart. It selects
 * no final team and generates no language — it organises the already-ranked players into
 * per-position starter + depth, optionally collapsing source positions into named groups.
 *
 * Pure and side-effect free: no LLM, AI calls, persistence, filesystem, APIs, network,
 * store, engine, clock or randomness. Inputs are never mutated; output is deeply frozen.
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

/** Validate the M121 squad evaluation (the fields this helper reads). */
function assertSquadEvaluation(se) {
  if (!isObj(se) || Array.isArray(se) || !Array.isArray(se.ranked) || !Array.isArray(se.ineligible)) {
    throw new TypeError('buildDepthChart requires an M121 squad evaluation { ranked, ineligible }')
  }
  const seen = new Set()
  for (const item of [...se.ranked, ...se.ineligible]) {
    if (!isObj(item) || !isNonEmptyString(item.playerId) || !isNonEmptyString(item.position)) {
      throw new TypeError('buildDepthChart: invalid player item (requires playerId + position)')
    }
    if (seen.has(item.playerId)) throw new TypeError(`buildDepthChart: duplicate playerId "${item.playerId}"`)
    seen.add(item.playerId)
  }
}

/** Build a source-position -> group-name map; rejects a position shared across groups. */
function buildPositionToGroup(positionGroups) {
  if (!isObj(positionGroups) || Array.isArray(positionGroups)) throw new TypeError('buildDepthChart: invalid positionGroups')
  const map = new Map()
  for (const groupName of Object.keys(positionGroups)) {
    if (!isNonEmptyString(groupName)) throw new TypeError('buildDepthChart: positionGroups names must be non-empty strings')
    const positions = positionGroups[groupName]
    if (!Array.isArray(positions)) throw new TypeError(`buildDepthChart: group "${groupName}" must be an array`)
    if (!positions.every((p) => typeof p === 'string')) throw new TypeError(`buildDepthChart: group "${groupName}" must contain only strings`)
    for (const p of positions) {
      if (map.has(p)) throw new TypeError(`buildDepthChart: duplicate source position "${p}" across groups`)
      map.set(p, groupName)
    }
  }
  return map
}

/**
 * Build a deterministic positional depth chart from an M121 squad evaluation.
 *
 * @param {object} squadEvaluation  the frozen result of `evaluateSquad` (M121)
 * @param {Record<string, string[]>} [positionGroups]  optional source-position → group mapping
 * @returns {Readonly<{ positions: ReadonlyArray<Readonly<{ position:string, starter:(object|null),
 *   depth:ReadonlyArray<object>, eligibleCount:number, ineligibleCount:number }>>, metadata:object }>}
 */
export function buildDepthChart(squadEvaluation, positionGroups = {}) {
  assertSquadEvaluation(squadEvaluation)
  const posToGroup = buildPositionToGroup(positionGroups)

  const chartPosOf = (item) => posToGroup.get(item.position) || item.position

  const groups = new Map()   // chartPosition -> { eligible: [], ineligibleCount }
  const groupFor = (pos) => {
    let g = groups.get(pos)
    if (!g) { g = { eligible: [], ineligibleCount: 0 }; groups.set(pos, g) }
    return g
  }

  for (const item of squadEvaluation.ranked) groupFor(chartPosOf(item)).eligible.push(item)   // M121 ranking order preserved
  for (const item of squadEvaluation.ineligible) groupFor(chartPosOf(item)).ineligibleCount++

  const positions = [...groups.entries()]
    .map(([position, g]) => ({
      position,
      starter: g.eligible.length ? g.eligible[0] : null,
      depth: g.eligible.slice(1),
      eligibleCount: g.eligible.length,
      ineligibleCount: g.ineligibleCount,
    }))
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))   // alphabetical

  const metadata = {
    positionCount: positions.length,
    candidateCount: squadEvaluation.ranked.length + squadEvaluation.ineligible.length,
    eligibleCount: squadEvaluation.ranked.length,
    ineligibleCount: squadEvaluation.ineligible.length,
    deterministic: true,
    explainable: true,
    llm: false,
  }

  return deepFreeze({ positions, metadata })
}
