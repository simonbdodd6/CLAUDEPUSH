/**
 * AI Brain — Learning Store (M5)
 *
 * In-memory outcome store, keyed by coachId + clubId + category.
 * Isolation guarantee: outcomes for one coach/club pair can never affect
 * calibration for a different coach/club pair — the key structure makes
 * cross-contamination structurally impossible.
 *
 * Outcome weights:
 *   accepted / actioned → 1.0  (coach approved the recommendation)
 *   dismissed / rejected → 0.0  (coach rejected it)
 *   snoozed              → 0.5  (acknowledged, deferred — neutral signal)
 *   unknown              → 0.5  (default safe neutral)
 *
 * Persisted to memory only in M5. File-backed persistence arrives in M8.
 */

const OUTCOME_WEIGHTS = {
  accepted:  1.0,
  actioned:  1.0,
  dismissed: 0.0,
  rejected:  0.0,
  snoozed:   0.5,
}

// Singleton store — one Map for the process lifetime.
// Tests that need isolation should use unique coachId/clubId values or call _clear().
const store = new Map()

/**
 * Build the compound isolation key.
 * null coachId → '_' (anonymous / global coach)
 * null clubId  → '_' (anonymous / global club)
 */
export function storeKey(coachId, clubId, category) {
  return `${coachId ?? '_'}:${clubId ?? '_'}:${category ?? '_'}`
}

/**
 * Record one coaching outcome.
 *
 * @param {string|null} coachId
 * @param {string|null} clubId
 * @param {string}      category  — recommendation category (e.g. 'Training')
 * @param {string}      outcome   — 'accepted' | 'dismissed' | 'snoozed' | 'actioned'
 */
export function record(coachId, clubId, category, outcome) {
  const k        = storeKey(coachId, clubId, category)
  const existing = store.get(k) ?? { acceptWeight: 0, totalSeen: 0 }
  const weight   = OUTCOME_WEIGHTS[String(outcome ?? '').toLowerCase()] ?? 0.5
  store.set(k, {
    acceptWeight: existing.acceptWeight + weight,
    totalSeen:    existing.totalSeen + 1,
  })
}

/**
 * Retrieve outcome history for a specific coach + club + category key.
 * Returns null when no history exists (cold start).
 *
 * @param {string|null} coachId
 * @param {string|null} clubId
 * @param {string}      category
 * @returns {{ acceptWeight: number, totalSeen: number } | null}
 */
export function getHistory(coachId, clubId, category) {
  return store.get(storeKey(coachId, clubId, category)) ?? null
}

/**
 * Return a snapshot of all stored histories (for diagnostics / testing).
 * Keys are in the `coachId:clubId:category` format.
 */
export function getAll() {
  return Object.fromEntries(store)
}

/**
 * Clear all stored histories.
 * Exported for use in tests that require a clean slate.
 */
export function _clear() {
  store.clear()
}
