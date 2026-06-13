/**
 * AI Brain — Opponent Weakness Engine (M24)
 *
 * Scans the derived dimensions and surfaces exploitable weaknesses:
 * non-descriptive dimensions scoring ≤ WEAK_THRESHOLD with sufficient
 * confidence. Each weakness carries its evidence chain. Pure + deterministic.
 */

import { DIMENSION_KEYS, WEAK_THRESHOLD, MIN_CONFIDENCE } from './opponent-types.js'

export function deriveWeaknesses(dimensions) {
  const out = []
  for (const key of DIMENSION_KEYS) {
    const e = dimensions[key]
    if (!e || e.descriptive || e.score == null) continue
    if (e.confidence < MIN_CONFIDENCE) continue
    if (e.score <= WEAK_THRESHOLD) {
      out.push({
        key, label: e.label, score: e.score, confidence: e.confidence,
        summary: e.summary, trend: e.trend.direction,
        evidence: e.evidence, observationCount: e.observationCount,
        // How exploitable: lower score + higher confidence ⇒ more actionable.
        exploitability: Math.round((WEAK_THRESHOLD - e.score) * e.confidence),
      })
    }
  }
  return out.sort((a, b) => (b.exploitability - a.exploitability) || (a.key < b.key ? -1 : 1))
}
