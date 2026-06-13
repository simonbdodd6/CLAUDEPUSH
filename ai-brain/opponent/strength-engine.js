/**
 * AI Brain — Opponent Strength Engine (M24)
 *
 * Scans the derived dimensions and surfaces the opponent's genuine strengths:
 * non-descriptive dimensions scoring ≥ STRONG_THRESHOLD with sufficient
 * confidence. Each strength carries its evidence chain. Pure + deterministic.
 */

import { DIMENSION_KEYS, STRONG_THRESHOLD, MIN_CONFIDENCE } from './opponent-types.js'

export function deriveStrengths(dimensions) {
  const out = []
  for (const key of DIMENSION_KEYS) {
    const e = dimensions[key]
    if (!e || e.descriptive || e.score == null) continue
    if (e.confidence < MIN_CONFIDENCE) continue
    if (e.score >= STRONG_THRESHOLD) {
      out.push({
        key, label: e.label, score: e.score, confidence: e.confidence,
        summary: e.summary, trend: e.trend.direction,
        evidence: e.evidence, observationCount: e.observationCount,
      })
    }
  }
  return out.sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence) || (a.key < b.key ? -1 : 1))
}
