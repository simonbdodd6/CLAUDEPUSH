/**
 * AI Brain — Training Workload Engine (M25)
 *
 * Computes per-activity workload and the session total, and classifies it
 * against a grade/season-aware cap. Pure + deterministic.
 *
 * workload(activity) = intensity × duration / 5   (an arbitrary but stable unit)
 */

import { clamp, round } from './training-types.js'

export function activityWorkload(intensity, durationMin) {
  return round((clamp(intensity, 1, 5) * Math.max(0, durationMin)) / 5)
}

/** Target workload cap for the whole session. */
export function workloadCap(constraints) {
  const base = (constraints.durationMin * constraints.intensityCap) / 5
  // Taper for welfare pressure and late season.
  const mul = constraints.welfarePressure >= 6 ? 0.8 : 0.92
  return round(base * mul)
}

export function classifyWorkload(total, cap) {
  if (cap <= 0) return 'unknown'
  const ratio = total / cap
  if (ratio > 1.05) return 'over'
  if (ratio < 0.7) return 'light'
  return 'on_target'
}
