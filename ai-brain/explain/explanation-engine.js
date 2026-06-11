/**
 * AI Brain — Explanation Engine (M10)
 *
 * Stores ExplanationRecords keyed by recommendationId.
 * Each record is an immutable snapshot captured at the moment the
 * recommendation was generated (post-calibration).
 *
 * Design goal: explain(id) must be callable months after generation
 * without access to the live memory/observation/timeline stores.
 * The full context is embedded in the snapshot at record() time.
 */

import { buildExplanation } from './explanation-builder.js'

const _store = new Map()   // recommendationId → frozen ExplanationRecord

/**
 * Record an explanation snapshot for a recommendation.
 * Must be called once per recommendation, immediately after calibration.
 *
 * @param {object}      rec     — the final calibrated recommendation
 * @param {object}      context — { observations, calibrationAdjustment, coachId, clubId }
 * @returns {object|null}       — the stored ExplanationRecord (frozen)
 */
export function record(rec, context = {}) {
  if (rec == null || rec.id == null) return null
  const explanation = buildExplanation(rec, context)
  if (explanation == null) return null
  const entry = Object.freeze({
    ...explanation,
    storedAt:       new Date().toISOString(),
    recommendation: Object.freeze({ ...rec }),
  })
  _store.set(rec.id, entry)
  return entry
}

/**
 * Retrieve the stored explanation for a recommendation.
 * Returns null when no explanation has been recorded for this id.
 *
 * @param {string} recommendationId
 * @returns {object|null}
 */
export function explain(recommendationId) {
  if (recommendationId == null) return null
  return _store.get(String(recommendationId)) ?? null
}

/**
 * Return all stored ExplanationRecords.
 * @returns {object[]}
 */
export function listAll() {
  return Array.from(_store.values())
}

/**
 * Return the count of stored records.
 * @returns {number}
 */
export function count() {
  return _store.size
}

/** Test helper — reset the store */
export function _clear() {
  _store.clear()
}
