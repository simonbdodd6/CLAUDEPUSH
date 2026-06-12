/**
 * AI Brain — Confidence Scorer (M19)
 *
 * Deterministic confidence scores for the CoachProfile.
 *
 * Two levels:
 *   1. Per-preference confidence — already computed by preference-extractor.
 *      Exposed here for uniform access and explanation.
 *
 *   2. Overall profile confidence — aggregate quality signal.
 *      Reflects how much signal the profile has accumulated.
 *
 * No randomness. No timestamps. Pure functions.
 */

import { CONFIDENCE_SATURATION, PREFERENCE_KEY } from './learning-types.js'

/**
 * Compute the overall CoachProfile confidence score.
 *
 * Formula:
 *   observationFactor  = min(1, observationCount / CONFIDENCE_SATURATION)
 *   preferenceFactor   = avg of per-preference confidences (0 if all empty)
 *   overallConfidence  = observationFactor * (0.5 + 0.5 * preferenceFactor)
 *
 * The observationFactor is primary — a profile with many observations but weak
 * signals scores moderate, not zero. A profile with zero observations scores 0.
 *
 * @param {object[]} observations
 * @param {object}   preferences   - the derived Preferences map
 * @returns {number}  0–1
 */
export function scoreOverall(observations, preferences) {
  if (!observations || !observations.length) return 0

  const observationFactor = Math.min(1, observations.length / CONFIDENCE_SATURATION)

  // Average confidence across all preference keys that have a non-null value
  const values = Object.values(preferences ?? {})
    .map(p => p?.confidence ?? 0)
  const preferenceFactor = values.length
    ? values.reduce((s, c) => s + c, 0) / values.length
    : 0

  return observationFactor * (0.5 + 0.5 * preferenceFactor)
}

/**
 * Return a human-readable confidence explanation for a single preference.
 *
 * @param {string} prefKey         - PREFERENCE_KEY.*
 * @param {object} preferenceEntry - { value, confidence, evidence }
 * @param {number} observationCount
 * @returns {string}
 */
export function explainConfidence(prefKey, preferenceEntry, observationCount) {
  const { value, confidence, evidence } = preferenceEntry ?? {}
  if (!value) {
    return `No signal yet for ${prefKey}. Add more events to build this preference.`
  }

  const evidenceCount = (evidence ?? []).length
  const pct = Math.round((confidence ?? 0) * 100)

  if (confidence < 0.2) {
    return `${prefKey}: early signal suggests "${value}" (${pct}% confidence, ${evidenceCount} observations). More data needed.`
  }
  if (confidence < 0.6) {
    return `${prefKey}: moderate signal for "${value}" (${pct}% confidence, ${evidenceCount} supporting observations).`
  }
  return `${prefKey}: strong signal for "${value}" (${pct}% confidence, backed by ${evidenceCount} observations).`
}

/**
 * Return a full confidence report for all preferences.
 *
 * @param {object} preferences
 * @param {number} observationCount
 * @returns {{ [prefKey]: string }}
 */
export function buildConfidenceReport(preferences, observationCount) {
  const report = {}
  for (const key of Object.values(PREFERENCE_KEY)) {
    report[key] = explainConfidence(key, preferences[key], observationCount)
  }
  return report
}
