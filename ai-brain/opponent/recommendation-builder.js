/**
 * AI Brain — Opponent Recommendation Builder (M24)
 *
 * Turns strengths into THREATS (and how to nullify them) and weaknesses into
 * OPPORTUNITIES (and how to exploit them). Every recommendation references the
 * supporting evidence chain from its source dimension. Pure + deterministic.
 */

import { DIMENSION_META, SEVERITY } from './opponent-types.js'

function severityFromScore(score, weakness = false) {
  const s = weakness ? 100 - score : score
  if (s >= 80) return SEVERITY.HIGH
  if (s >= 60) return SEVERITY.MEDIUM
  return SEVERITY.LOW
}

/** Threats: derived from the opponent's strengths. */
export function buildThreats(strengths) {
  return strengths.map((s, i) => ({
    id: `threat-${s.key}`,
    rank: i + 1,
    basis: s.key,
    label: s.label,
    threat: s.summary || s.label,
    severity: severityFromScore(s.score, false),
    recommendation: DIMENSION_META[s.key]?.counter ?? 'Plan to neutralise this strength',
    confidence: s.confidence,
    trend: s.trend,
    evidence: s.evidence,          // evidence chain back to the underlying observations
    observationCount: s.observationCount,
  }))
}

/** Opportunities: derived from the opponent's weaknesses. */
export function buildOpportunities(weaknesses) {
  return weaknesses.map((w, i) => ({
    id: `opportunity-${w.key}`,
    rank: i + 1,
    basis: w.key,
    label: w.label,
    opportunity: w.summary || w.label,
    value: severityFromScore(w.score, true),
    recommendation: DIMENSION_META[w.key]?.exploit || 'Target this weakness',
    confidence: w.confidence,
    trend: w.trend,
    evidence: w.evidence,          // evidence chain back to the underlying observations
    observationCount: w.observationCount,
  }))
}
