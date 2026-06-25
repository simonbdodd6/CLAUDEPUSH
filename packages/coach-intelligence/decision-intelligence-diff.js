/**
 * @coach-intelligence — Decision Intelligence Diff Engine (M192, DORMANT)
 *
 * Compares TWO already-completed decision states and reports WHAT changed and WHY, as deterministic
 * codes only. It NEVER selects, scores, ranks, recommends, rebuilds squads, reruns selection,
 * recalculates explanations, touches memory, runs providers, generates prose, or gives coaching
 * advice. It reads only the two supplied states.
 *
 * A decision state is a plain object:
 *   {
 *     starters: [ { playerId, codes?|explanationCodes? } ],
 *     bench:    [ { playerId, codes?|explanationCodes? } ],
 *     captain?: (string | { playerId }) | null,
 *     viceCaptain?: (string | { playerId }) | null,
 *     riskCount?: number,   // or risks: array (length is used)
 *     coverage?: number | null,
 *   }
 * The `codes` of a player are explanation codes (e.g. an M184 explanation's starters/bench feed in
 * directly via `explanationCodes`). Pure, side-effect free, deeply-frozen output; inputs never mutated.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const codesOf = (v) => (Array.isArray(v) ? v.filter((c) => typeof c === 'string') : [])
const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

const playerIdOf = (v) => (isNonEmptyString(v) ? v : (isObj(v) && isNonEmptyString(v.playerId) ? v.playerId : null))

function riskCountOf(state) {
  if (typeof state.riskCount === 'number' && Number.isFinite(state.riskCount)) return state.riskCount
  if (Array.isArray(state.risks)) return state.risks.length
  return 0
}

/** Validate + normalise a decision state into role/codes maps and scalar facts. */
function normalizeState(state, label) {
  if (!isObj(state)) throw new TypeError(`diffDecisions: ${label} must be an object`)
  if (!Array.isArray(state.starters)) throw new TypeError(`diffDecisions: ${label}.starters must be an array`)
  if (!Array.isArray(state.bench)) throw new TypeError(`diffDecisions: ${label}.bench must be an array`)

  const starters = new Map()
  for (const s of state.starters) {
    if (!isObj(s) || !isNonEmptyString(s.playerId)) throw new TypeError(`diffDecisions: ${label}.starters has a malformed entry`)
    if (starters.has(s.playerId)) throw new TypeError(`diffDecisions: ${label}.starters has duplicate player "${s.playerId}"`)
    starters.set(s.playerId, codesOf(s.codes !== undefined ? s.codes : s.explanationCodes))
  }
  const bench = new Map()
  for (const b of state.bench) {
    if (!isObj(b) || !isNonEmptyString(b.playerId)) throw new TypeError(`diffDecisions: ${label}.bench has a malformed entry`)
    if (bench.has(b.playerId) || starters.has(b.playerId)) throw new TypeError(`diffDecisions: ${label} has duplicate player "${b.playerId}"`)
    bench.set(b.playerId, codesOf(b.codes !== undefined ? b.codes : b.explanationCodes))
  }
  return {
    starters,
    bench,
    captain: playerIdOf(state.captain),
    vice: playerIdOf(state.viceCaptain),
    riskCount: riskCountOf(state),
    coverage: numOrNull(state.coverage),
  }
}

const roleOf = (ns, pid) => (ns.starters.has(pid) ? 'starter' : ns.bench.has(pid) ? 'bench' : null)
const codesFor = (ns, pid) => (ns.starters.has(pid) ? ns.starters.get(pid) : ns.bench.has(pid) ? ns.bench.get(pid) : [])

/**
 * Diff two decision states.
 *
 * @param {object} beforeDecision
 * @param {object} afterDecision
 * @returns {Readonly<{ summary:object, playerChanges:object[], captainChanges:object[],
 *   benchChanges:object, riskChanges:object, explanationChanges:object[], coverageChanges:object }>}
 */
export function diffDecisions(beforeDecision, afterDecision) {
  const before = normalizeState(beforeDecision, 'beforeDecision')
  const after = normalizeState(afterDecision, 'afterDecision')

  const allPlayers = Array.from(new Set([
    ...before.starters.keys(), ...before.bench.keys(),
    ...after.starters.keys(), ...after.bench.keys(),
  ])).sort(sortStr)

  // ── player role changes ──
  const playerChanges = []
  for (const pid of allPlayers) {
    const b = roleOf(before, pid)
    const a = roleOf(after, pid)
    let code = null
    if (b === null && a !== null) code = 'PLAYER_ADDED'
    else if (b !== null && a === null) code = 'PLAYER_REMOVED'
    else if (b === 'starter' && a === 'bench') code = 'PLAYER_DEMOTED'
    else if (b === 'bench' && a === 'starter') code = 'PLAYER_PROMOTED'
    if (code) playerChanges.push({ playerId: pid, code })
  }

  // ── captain / vice changes ──
  const captainChanges = []
  if (before.captain !== after.captain) captainChanges.push({ code: 'CAPTAIN_CHANGED', from: before.captain, to: after.captain })
  if (before.vice !== after.vice) captainChanges.push({ code: 'VICE_CAPTAIN_CHANGED', from: before.vice, to: after.vice })

  // ── bench composition change ──
  const beforeBench = new Set(before.bench.keys())
  const afterBench = new Set(after.bench.keys())
  const entered = [...afterBench].filter((p) => !beforeBench.has(p)).sort(sortStr)
  const left = [...beforeBench].filter((p) => !afterBench.has(p)).sort(sortStr)
  const benchChanges = { beforeCount: beforeBench.size, afterCount: afterBench.size, delta: afterBench.size - beforeBench.size, entered, left }

  // ── risk change ──
  const riskDelta = after.riskCount - before.riskCount
  const riskChanges = { before: before.riskCount, after: after.riskCount, delta: riskDelta, code: riskDelta > 0 ? 'RISK_INCREASED' : riskDelta < 0 ? 'RISK_DECREASED' : null }

  // ── explanation code changes (players whose ROLE is unchanged — role changes are already
  //    captured by playerChanges; this isolates a genuine shift in the explanation) ──
  const explanationChanges = []
  for (const pid of allPlayers) {
    const br = roleOf(before, pid)
    const ar = roleOf(after, pid)
    if (br === null || ar === null || br !== ar) continue
    const bSet = new Set(codesFor(before, pid))
    const aSet = new Set(codesFor(after, pid))
    const gained = [...aSet].filter((c) => !bSet.has(c)).sort(sortStr)
    const lost = [...bSet].filter((c) => !aSet.has(c)).sort(sortStr)
    if (gained.length || lost.length) explanationChanges.push({ playerId: pid, gained, lost })
  }

  // ── coverage change (only when both states supply a numeric coverage) ──
  let coverageChanges
  if (before.coverage === null || after.coverage === null) {
    coverageChanges = { before: before.coverage, after: after.coverage, delta: null, code: null }
  } else {
    const d = Math.round((after.coverage - before.coverage) * 100) / 100
    coverageChanges = { before: before.coverage, after: after.coverage, delta: d, code: d > 0 ? 'COVERAGE_INCREASED' : d < 0 ? 'COVERAGE_DECREASED' : null }
  }

  // ── summary rollup (all fired codes, sorted + unique) ──
  const codeSet = new Set()
  for (const c of playerChanges) codeSet.add(c.code)
  for (const c of captainChanges) codeSet.add(c.code)
  if (riskChanges.code) codeSet.add(riskChanges.code)
  if (coverageChanges.code) codeSet.add(coverageChanges.code)
  for (const c of explanationChanges) {
    if (c.gained.length) codeSet.add('EXPLANATION_GAINED')
    if (c.lost.length) codeSet.add('EXPLANATION_LOST')
  }

  return deepFreeze({
    summary: {
      changed: codeSet.size > 0,
      codes: [...codeSet].sort(sortStr),
      playerChangeCount: playerChanges.length,
      captainChangeCount: captainChanges.length,
      explanationChangeCount: explanationChanges.length,
      benchDelta: benchChanges.delta,
      riskDelta: riskChanges.delta,
      coverageDelta: coverageChanges.delta,
    },
    playerChanges,
    captainChanges,
    benchChanges,
    riskChanges,
    explanationChanges,
    coverageChanges,
  })
}
