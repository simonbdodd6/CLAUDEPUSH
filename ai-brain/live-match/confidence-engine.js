/**
 * AI Brain — Live Confidence Engine (M27)
 *
 * Scores overall intelligence confidence from data sufficiency and recency, and
 * provides the helper that attaches a fallback when an output has no data.
 * Deterministic.
 */

import { round2, clamp } from './match-state.js'

/** Overall confidence from event volume + how recent the latest event is. */
export function scoreOverallConfidence(state) {
  const volume = clamp(state.eventCount / 30, 0, 1)         // ~30 events ⇒ saturated
  const liveness = state.clock > 0 ? 1 : 0.5
  return round2(clamp(0.3 + volume * 0.6 * liveness, 0.3, 0.95))
}

/** Ensure an output block always exposes a usable value, falling back if empty. */
export function withFallback(block, fallbackValue) {
  if (!block || block.confidence === 0 || block.confidence == null) {
    return { ...(block ?? {}), degraded: true, value: block?.value ?? fallbackValue }
  }
  return { ...block, degraded: false }
}
