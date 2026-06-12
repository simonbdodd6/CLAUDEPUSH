/**
 * AI Brain — Coach Profile Schema (M19)
 *
 * Creates and validates CoachProfile objects.
 * These are the data structures the Learning Engine produces and products read.
 *
 * Invariants:
 *   - observations is always sorted oldest-first and never mutated
 *   - preferences are derived values — only the Learning Engine updates them
 *   - historical observations are never removed (ring-buffer at MAX_OBSERVATIONS_STORED)
 */

import {
  LEARNING_VERSION, PREFERENCE_KEY, MAX_OBSERVATIONS_STORED,
} from './learning-types.js'

// ── Preference entry ──────────────────────────────────────────────────────────

/**
 * An empty (no signal yet) preference entry.
 *
 * @param {string|null} updatedAt
 * @returns {PreferenceEntry}
 */
export function emptyPreference(updatedAt = null) {
  return {
    value:      null,
    confidence: 0,
    evidence:   [],   // observationId[] that support this value (most recent first)
    updatedAt,
  }
}

/**
 * A full preferences map with all keys initialised to empty.
 *
 * @param {string|null} updatedAt
 * @returns {Preferences}
 */
export function emptyPreferences(updatedAt = null) {
  return Object.fromEntries(
    Object.values(PREFERENCE_KEY).map(k => [k, emptyPreference(updatedAt)]),
  )
}

// ── Recommendation history ────────────────────────────────────────────────────

/**
 * An empty recommendation-history block.
 * byCategory is a sparse map — only categories seen so far have entries.
 */
export function emptyRecommendationHistory() {
  return {
    accepted:      0,
    ignored:       0,
    rejected:      0,
    edited:        0,
    byCategory:    {},
    recentActions: [],   // last RECENT_ACTIONS_LIMIT actions, newest first
  }
}

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * Create a new empty CoachProfile for the given coachId.
 *
 * @param {string}      coachId
 * @param {string|null} createdAt  ISO timestamp (passed by caller for determinism)
 * @returns {CoachProfile}
 */
export function createProfile(coachId, createdAt = null) {
  return {
    coachId,
    profileVersion:       LEARNING_VERSION,
    createdAt,
    updatedAt:            createdAt,

    // Append-only log — single source of truth for deriving everything below
    observations:         [],

    // Derived state (rebuilt by Learning Engine on every update)
    preferences:          emptyPreferences(createdAt),
    recommendationHistory:emptyRecommendationHistory(),
    playerSelections:     {},   // { [playerId]: { selectionCount, lastSelected, confidence } }

    overallConfidence: 0,     // 0–1 representing profile quality
    observationCount:  0,     // === observations.length
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  'coachId', 'profileVersion', 'createdAt', 'updatedAt',
  'observations', 'preferences', 'recommendationHistory',
  'playerSelections', 'overallConfidence', 'observationCount',
]

/**
 * Return true when a profile has all required top-level fields.
 *
 * @param {object} profile
 * @returns {boolean}
 */
export function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') return false
  return REQUIRED_FIELDS.every(f => f in profile)
}

// ── Ring-buffer cap ───────────────────────────────────────────────────────────

/**
 * Trim observations array to MAX_OBSERVATIONS_STORED.
 * Drops the OLDEST observations first (they have least predictive power).
 *
 * @param {object[]} observations
 * @returns {object[]}
 */
export function trimObservations(observations) {
  if (observations.length <= MAX_OBSERVATIONS_STORED) return observations
  return observations.slice(observations.length - MAX_OBSERVATIONS_STORED)
}
