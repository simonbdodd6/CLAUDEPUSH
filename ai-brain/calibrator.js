/**
 * AI Brain — Calibrator (M5)
 *
 * Pure function: takes a list of synthesised recommendations and a calibration
 * context, returns new recommendation objects with adjusted confidence and
 * a stable re-ranking by score.
 *
 * Rules (non-negotiable):
 *  - Recommendations are NEVER mutated — only new objects are returned.
 *  - Only confidence is adjusted. Title, description, action, source,
 *    explainability, evidence, category, id, and priority are untouched.
 *  - Cold start: fewer than MIN_SAMPLES outcomes → no adjustment, pass through.
 *  - Maximum adjustment in either direction is MAX_DELTA points.
 *  - Re-ranking occurs AFTER all confidence adjustments are applied.
 *
 * Calibration formula:
 *   acceptRate  = acceptWeight / totalSeen
 *   delta       = (acceptRate − 0.5) × 2 × MAX_DELTA
 *
 * Interpretation:
 *   100 % accepted → delta = +MAX_DELTA  (confidence rises toward endorsement)
 *    50 % accepted → delta =  0           (no signal — neutral)
 *     0 % accepted → delta = −MAX_DELTA  (confidence falls toward suppression)
 *   Snoozed outcomes count as 0.5 (half weight), neither accepting nor rejecting.
 */

const MIN_SAMPLES = 3    // outcomes needed before calibration kicks in
const MAX_DELTA   = 20   // maximum ± confidence shift

function priorityScore(p) {
  return p === 'HIGH' ? 100 : p === 'MEDIUM' ? 60 : 25
}

function rankScore(rec) {
  return priorityScore(rec.priority) + (rec.confidence ?? 50) * 0.3
}

/**
 * Calibrate a list of recommendations against the coach/club learning history.
 *
 * @param {object[]} recommendations  — synthesised, never mutated
 * @param {object}   opts
 * @param {string|null} opts.coachId
 * @param {string|null} opts.clubId
 * @param {Function}    opts.getHistory — (coachId, clubId, category) → {acceptWeight, totalSeen}|null
 * @returns {{ recommendations, adjustments, applied, coachId, clubId }}
 */
export function calibrate(recommendations, { coachId = null, clubId = null, getHistory } = {}) {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return { recommendations: [], adjustments: [], applied: false, coachId, clubId }
  }

  const adjustments = []

  const adjusted = recommendations.map(rec => {
    const history = typeof getHistory === 'function'
      ? getHistory(coachId, clubId, rec.category)
      : null

    if (!history || history.totalSeen < MIN_SAMPLES) {
      // Cold start: return the recommendation completely unchanged
      return rec
    }

    const acceptRate          = history.acceptWeight / history.totalSeen
    const delta               = (acceptRate - 0.5) * 2 * MAX_DELTA
    const originalConfidence  = rec.confidence ?? 50
    const adjustedConfidence  = Math.round(
      Math.min(100, Math.max(0, originalConfidence + delta))
    )

    adjustments.push({
      recommendationId:   rec.id,
      category:           rec.category,
      originalConfidence,
      adjustedConfidence,
      delta:              Math.round(delta * 100) / 100,
      sampleSize:         history.totalSeen,
    })

    // Return a NEW object — evidence, title, source, etc. preserved verbatim
    return { ...rec, confidence: adjustedConfidence }
  })

  // Re-rank: sort by rankScore descending after all confidence adjustments
  const reranked = [...adjusted].sort((a, b) => rankScore(b) - rankScore(a))

  return {
    recommendations: reranked,
    adjustments,
    applied: adjustments.length > 0,
    coachId,
    clubId,
  }
}
