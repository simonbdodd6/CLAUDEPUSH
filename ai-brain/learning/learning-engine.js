/**
 * AI Brain — Coach Learning Engine (M19)
 *
 * The only module authorised to update CoachProfiles.
 * Products and the Integration Layer may READ — never WRITE.
 *
 * Core API:
 *   recordEvent(profile, event, opts)   — returns new profile (immutable)
 *   replayProfile(coachId, observations) — rebuild profile from stored observations
 *   isFlagEnabled(flagName, flags)      — local flag check (no external import)
 *
 * In-memory store (separate from the pure functions):
 *   getProfile(coachId)
 *   saveProfile(profile)
 *   _clear()
 *
 * The pure functions (recordEvent, replayProfile) never touch the store.
 * The store functions call the pure functions. This separation makes everything
 * independently testable.
 *
 * Replayability guarantee:
 *   replayProfile(coachId, profile.observations) ≡ profile
 *   (given the same observation records, the same profile is produced every time)
 */

import { randomUUID } from 'node:crypto'
import {
  LEARNING_FLAG, PREFERENCE_KEY, EVENT_TYPE,
} from './learning-types.js'
import {
  createProfile, trimObservations,
} from './coach-profile.js'
import {
  extractPreferences, extractRecommendationHistory, extractPlayerSelections,
} from './preference-extractor.js'
import { scoreOverall } from './confidence-scorer.js'

// ── Flag check ────────────────────────────────────────────────────────────────

/**
 * Return true when a flag is enabled (or absent — default ON).
 */
export function isFlagEnabled(flagName, flags = {}) {
  if (!flags || !(flagName in flags)) return true
  return Boolean(flags[flagName])
}

// ── Observation factory ───────────────────────────────────────────────────────

/**
 * Create an immutable observation record from a raw event.
 * An observation is what gets stored — events are ephemeral inputs.
 *
 * @param {object} event   { eventType, eventData? }
 * @param {object} opts    { recordedAt?, observationId? }
 * @returns {Observation}
 */
export function createObservation(event, opts = {}) {
  const { eventType, eventData = {} } = event ?? {}
  return {
    observationId: opts.observationId ?? randomUUID(),
    eventType:     eventType ?? EVENT_TYPE.RECOMMENDATION_ACCEPTED,
    eventData:     { ...eventData },    // defensive copy
    recordedAt:    opts.recordedAt ?? null,
    confidence:    opts.confidence ?? 1.0,   // confidence this event is a reliable signal
  }
}

// ── Pure update functions ─────────────────────────────────────────────────────

/**
 * Record a single event against a profile.
 * IMMUTABLE — returns a new profile, never mutates the input.
 *
 * @param {CoachProfile} profile
 * @param {object}       event    { eventType, eventData? }
 * @param {object}       opts     { flags?, recordedAt?, observationId?, confidence? }
 * @returns {CoachProfile}  new profile with updated observations + derived state
 */
export function recordEvent(profile, event, opts = {}) {
  if (!profile) return null
  if (!isFlagEnabled(LEARNING_FLAG, opts.flags)) return profile
  if (!event?.eventType) return profile

  const obs        = createObservation(event, opts)
  const updatedAt  = opts.recordedAt ?? null

  const observations = trimObservations([...profile.observations, obs])
  const preferences  = extractPreferences(observations, updatedAt)
  const recommendationHistory = extractRecommendationHistory(observations)
  const playerSelections      = extractPlayerSelections(observations)
  const overallConfidence     = scoreOverall(observations, preferences)

  return {
    ...profile,
    updatedAt,
    observations,
    preferences,
    recommendationHistory,
    playerSelections,
    overallConfidence,
    observationCount: observations.length,
  }
}

/**
 * Record multiple events in sequence against a profile.
 * Each event produces a new profile; the final result is returned.
 *
 * @param {CoachProfile} profile
 * @param {object[]}     events
 * @param {object}       opts
 * @returns {CoachProfile}
 */
export function recordEvents(profile, events, opts = {}) {
  if (!profile || !events?.length) return profile ?? null
  return events.reduce((p, event) => recordEvent(p, event, opts), profile)
}

/**
 * Rebuild a CoachProfile from scratch by replaying stored observations.
 *
 * This is the replayability guarantee: given the same observations array,
 * the output is always identical regardless of when it is run.
 *
 * @param {string}   coachId
 * @param {object[]} observations  Pre-existing observation records (not events)
 * @param {object}   opts          { createdAt? }
 * @returns {CoachProfile}
 */
export function replayProfile(coachId, observations = [], opts = {}) {
  if (!coachId) return null
  if (!observations.length) return createProfile(coachId, opts.createdAt ?? null)

  // Sort oldest-first so derivation is stable regardless of insertion order
  const sorted = [...observations].sort((a, b) => {
    const ta = a.recordedAt ?? ''
    const tb = b.recordedAt ?? ''
    return ta < tb ? -1 : ta > tb ? 1 : 0
  })

  const createdAt = opts.createdAt ?? sorted[0].recordedAt ?? null
  const updatedAt = sorted[sorted.length - 1].recordedAt ?? null

  const trimmed   = trimObservations(sorted)
  const preferences   = extractPreferences(trimmed, updatedAt)
  const recHistory    = extractRecommendationHistory(trimmed)
  const playerSels    = extractPlayerSelections(trimmed)
  const confidence    = scoreOverall(trimmed, preferences)

  return {
    coachId,
    profileVersion:       '1.0',
    createdAt,
    updatedAt,
    observations:         trimmed,
    preferences,
    recommendationHistory:recHistory,
    playerSelections:     playerSels,
    overallConfidence:    confidence,
    observationCount:     trimmed.length,
  }
}

// ── In-memory store ───────────────────────────────────────────────────────────
// Keyed by coachId. Holds current (latest) CoachProfile per coach.
// Tests that need isolation should call _clear() between cases.

const profileStore = new Map()

export function getProfile(coachId) {
  if (!coachId) return null
  if (!profileStore.has(coachId)) {
    return createProfile(coachId, null)
  }
  return profileStore.get(coachId)
}

export function saveProfile(profile) {
  if (!profile?.coachId) return
  profileStore.set(profile.coachId, profile)
}

/**
 * Record an event into the persistent store for a coach.
 * Returns the updated profile.
 *
 * @param {string} coachId
 * @param {object} event
 * @param {object} opts    { flags?, recordedAt?, observationId? }
 * @returns {CoachProfile}
 */
export function recordAndSave(coachId, event, opts = {}) {
  if (!coachId) return null
  const current = getProfile(coachId)
  const updated = recordEvent(current, event, opts)
  if (updated !== current) saveProfile(updated)
  return updated
}

/**
 * Replay stored observations into the store for a coach.
 * Replaces any existing profile.
 *
 * @param {string}   coachId
 * @param {object[]} observations
 * @returns {CoachProfile}
 */
export function replayAndSave(coachId, observations, opts = {}) {
  const profile = replayProfile(coachId, observations, opts)
  if (profile) saveProfile(profile)
  return profile
}

/** Clear all stored profiles. Intended for tests. */
export function _clear() {
  profileStore.clear()
}
