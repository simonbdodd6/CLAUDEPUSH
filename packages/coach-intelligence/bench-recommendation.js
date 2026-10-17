/**
 * @coach-intelligence — Bench Recommendation Engine (M129, DORMANT)
 *
 * Deterministically recommends the match-day bench from the squad remaining after the Starting
 * XV (M123) has been selected, using the existing M121 squad ranking. It rescoring nothing,
 * invents no rankings, never duplicates a player already in the XV, runs no AI/LLM, and
 * produces no language. Same inputs, same bench.
 *
 * Pure and side-effect free: no persistence, APIs, filesystem, network, randomness or clock.
 * Inputs are never mutated; output is deeply frozen. Reuses only M121 + M123 outputs.
 */

const DEFAULT_BENCH_SIZE = 8

const isObj = (v) => v !== null && typeof v === 'object'
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate the M123 Starting XV and return the set of selected playerIds. */
function selectedPlayerIds(startingXV) {
  if (!isObj(startingXV) || Array.isArray(startingXV) || !Array.isArray(startingXV.startingXV) ||
      !Array.isArray(startingXV.benchCandidates) || !Array.isArray(startingXV.unavailable) || !isObj(startingXV.metadata)) {
    throw new TypeError('recommendBench requires a valid M123 Starting XV')
  }
  const ids = new Set()
  for (const s of startingXV.startingXV) {
    if (!isObj(s) || typeof s.status !== 'string' || (s.player !== null && !isObj(s.player))) {
      throw new TypeError('recommendBench: malformed Starting XV entry')
    }
    if (s.status === 'filled') {
      if (!isObj(s.player) || !isNonEmptyString(s.player.playerId)) throw new TypeError('recommendBench: malformed player record')
      if (ids.has(s.player.playerId)) throw new TypeError(`recommendBench: duplicate player "${s.player.playerId}"`)
      ids.add(s.player.playerId)
    }
  }
  return ids
}

/** Validate the M121 squad evaluation (ranked + ineligible, no duplicate players). */
function assertSquadEvaluation(se) {
  if (!isObj(se) || Array.isArray(se) || !Array.isArray(se.ranked) || !Array.isArray(se.ineligible) || !isObj(se.metadata)) {
    throw new TypeError('recommendBench requires a valid M121 squad evaluation')
  }
  const seen = new Set()
  for (const p of [...se.ranked, ...se.ineligible]) {
    if (!isObj(p) || !isNonEmptyString(p.playerId)) throw new TypeError('recommendBench: malformed squad player')
    if (seen.has(p.playerId)) throw new TypeError(`recommendBench: duplicate player "${p.playerId}"`)
    seen.add(p.playerId)
  }
}

/** Validate options and resolve the requested bench size (default 8, integer 1–15). */
function resolveBenchSize(options) {
  if (!isObj(options) || Array.isArray(options)) throw new TypeError('recommendBench: malformed options')
  const size = options.benchSize === undefined ? DEFAULT_BENCH_SIZE : options.benchSize
  if (!Number.isInteger(size) || size < 1 || size > 15) throw new TypeError('recommendBench: invalid bench size (must be an integer 1–15)')
  return size
}

/**
 * Recommend the match-day bench from the players not selected in the Starting XV.
 *
 * @param {object} startingXV       a result from `recommendStartingXV` (M123)
 * @param {object} squadEvaluation  a result from `evaluateSquad` (M121)
 * @param {{ benchSize?: number }} [options]  bench size (default 8)
 * @returns {Readonly<{ bench:ReadonlyArray<object>, reserves:ReadonlyArray<object>, metadata:object }>}
 */
export function recommendBench(startingXV, squadEvaluation, options = {}) {
  const selectedIds = selectedPlayerIds(startingXV)
  assertSquadEvaluation(squadEvaluation)
  const requestedBenchSize = resolveBenchSize(options)

  // eligible players not already in the XV, in M121 ranking order (no rescoring, no new ranking)
  const available = squadEvaluation.ranked.filter((p) => !selectedIds.has(p.playerId))
  const bench = available.slice(0, requestedBenchSize)
  const reserves = available.slice(requestedBenchSize)

  return deepFreeze({
    bench,
    reserves,
    metadata: {
      benchCount: bench.length,
      reserveCount: reserves.length,
      requestedBenchSize,
      deterministic: true,
      explainable: true,
      llm: false,
    },
  })
}
