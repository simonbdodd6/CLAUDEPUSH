/**
 * @coach-intelligence — Team Sign-off Gate (M126, DORMANT)
 *
 * Deterministic approval gate: decides whether a generated Starting XV (M123) is ready for
 * coach sign-off, given its selection-risk report (M124). It rescoring nothing, generates no
 * new risks, and produces no language — it reuses ONLY the M123 + M124 output. Same inputs,
 * same decision.
 *
 * Pure and side-effect free: no persistence, APIs, filesystem, network, randomness or clock.
 * Inputs are never mutated; output is deeply frozen.
 */

const SEVERITIES = Object.freeze(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])

const isObj = (v) => v !== null && typeof v === 'object'
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate the M123 Starting XV result (the fields this gate reads). */
function assertStartingXV(r) {
  if (!isObj(r) || Array.isArray(r) || !Array.isArray(r.startingXV) || !Array.isArray(r.benchCandidates) ||
      !Array.isArray(r.unavailable) || !isObj(r.metadata)) {
    throw new TypeError('evaluateTeamSignOff requires a valid M123 Starting XV')
  }
  for (const s of r.startingXV) {
    if (!isObj(s) || !isNonEmptyString(s.jersey) || !isNonEmptyString(s.position) || typeof s.status !== 'string' ||
        (s.player !== null && !isObj(s.player))) {
      throw new TypeError('evaluateTeamSignOff: malformed Starting XV entry')
    }
  }
}

/** Validate the M124 selection-risk report (the fields this gate reads). */
function assertSelectionRisk(r) {
  if (!isObj(r) || Array.isArray(r) || typeof r.overallRisk !== 'string' || !Array.isArray(r.risks) || !isObj(r.metadata)) {
    throw new TypeError('evaluateTeamSignOff requires a valid M124 selection-risk report')
  }
  for (const risk of r.risks) {
    if (!isObj(risk) || !SEVERITIES.includes(risk.severity)) throw new TypeError('evaluateTeamSignOff: malformed risk entry')
  }
}

/**
 * Decide whether a Starting XV is ready for coach sign-off.
 *
 * @param {object} startingXV     a result from `recommendStartingXV` (M123)
 * @param {object} selectionRisk  a result from `evaluateSelectionRisk` (M124)
 * @returns {Readonly<{ approved:boolean, blockers:ReadonlyArray<object>, requiresReview:boolean, metadata:object }>}
 */
export function evaluateTeamSignOff(startingXV, selectionRisk) {
  assertStartingXV(startingXV)
  assertSelectionRisk(selectionRisk)

  const xv = startingXV.startingXV
  const risks = selectionRisk.risks

  // blocking conditions (reuse M124 risks — no new risks generated)
  const blockers = risks.filter((r) => r.severity === 'CRITICAL')
  const hasVacant = xv.some((s) => s.status === 'vacant')
  const approved = blockers.length === 0 && !hasVacant

  // review conditions
  const hasHigh = risks.some((r) => r.severity === 'HIGH')
  const hasMedium = risks.some((r) => r.severity === 'MEDIUM')
  const hasFlaggedPlayer = xv.some((s) => s.status === 'filled' && s.player && s.player.requiresCoachReview === true)
  const requiresReview = hasHigh || hasMedium || hasFlaggedPlayer

  const reviewCount = risks.filter((r) => r.severity === 'HIGH' || r.severity === 'MEDIUM').length

  return deepFreeze({
    approved,
    blockers,
    requiresReview,
    metadata: {
      approved,
      blockerCount: blockers.length,
      reviewCount,
      highestSeverity: selectionRisk.overallRisk,   // reuse M124's overall severity
      deterministic: true,
      explainable: true,
      llm: false,
    },
  })
}
