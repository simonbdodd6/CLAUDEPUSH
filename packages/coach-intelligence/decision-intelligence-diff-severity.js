/**
 * @coach-intelligence — Decision Diff Severity Classifier (M199, DORMANT)
 *
 * Classifies the IMPACT MAGNITUDE of an already-computed M192 decision diff as a deterministic
 * severity band. This is NOT coaching advice and recommends nothing — it only labels how big the
 * change between two decision states was, from evidence the diff already carries. It selects, scores,
 * and ranks no players, runs no pipeline, and reads only the supplied diff.
 *
 * Deterministic weighting (transparent, fixed):
 *   score = playerChanges.length
 *         + (captainChanged    ? 3 : 0)
 *         + (viceCaptainChanged ? 1 : 0)
 *         + (riskIncreased      ? 2 : 0)
 *         + (coverageDecreased  ? 1 : 0)
 * Improvements (RISK_DECREASED, COVERAGE_INCREASED) and explanation-only changes add 0.
 *
 * Bands:  not changed → NONE · score ≤ 1 → MINOR · 2–3 → MODERATE · 4–5 → MAJOR · ≥ 6 → CRITICAL
 *
 * Pure and side-effect free; input never mutated; output deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate the M192 diff shape this classifier reads. */
function assertDiff(diff) {
  if (!isObj(diff) || !isObj(diff.summary) || !Array.isArray(diff.playerChanges) || !Array.isArray(diff.captainChanges) ||
      !isObj(diff.riskChanges) || !isObj(diff.coverageChanges)) {
    throw new TypeError('classifyDecisionDiff requires an M192 decision diff')
  }
}

const hasCode = (changes, code) => Array.isArray(changes) && changes.some((c) => isObj(c) && c.code === code)

function bandOf(score, changed) {
  if (!changed) return 'NONE'
  if (score <= 1) return 'MINOR'
  if (score <= 3) return 'MODERATE'
  if (score <= 5) return 'MAJOR'
  return 'CRITICAL'
}

/**
 * Classify an M192 decision diff's impact magnitude.
 *
 * @param {object} diff  a diffDecisions (M192) result
 * @returns {Readonly<{ severity:string, score:number, changed:boolean, factors: Readonly<{
 *   playerChanges:number, captainChanged:boolean, viceCaptainChanged:boolean,
 *   riskIncreased:boolean, coverageDecreased:boolean }> }>}
 */
export function classifyDecisionDiff(diff) {
  assertDiff(diff)

  const changed = diff.summary.changed === true
  const playerChanges = diff.playerChanges.length
  const captainChanged = hasCode(diff.captainChanges, 'CAPTAIN_CHANGED')
  const viceCaptainChanged = hasCode(diff.captainChanges, 'VICE_CAPTAIN_CHANGED')
  const riskIncreased = diff.riskChanges.code === 'RISK_INCREASED'
  const coverageDecreased = diff.coverageChanges.code === 'COVERAGE_DECREASED'

  const score = playerChanges
    + (captainChanged ? 3 : 0)
    + (viceCaptainChanged ? 1 : 0)
    + (riskIncreased ? 2 : 0)
    + (coverageDecreased ? 1 : 0)

  return deepFreeze({
    severity: bandOf(score, changed),
    score,
    changed,
    factors: { playerChanges, captainChanged, viceCaptainChanged, riskIncreased, coverageDecreased },
  })
}
