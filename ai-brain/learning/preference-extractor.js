/**
 * AI Brain — Preference Extractor (M19)
 *
 * Deterministic derivation of learned preferences from an observation log.
 *
 * Design:
 *   1. Each observation is converted to a set of typed Signals via extractSignals().
 *   2. Signals are aggregated by preference key + value, accumulating weights.
 *   3. The highest-weighted value wins per preference key.
 *   4. Confidence = agreement_ratio × saturation_factor (both 0–1).
 *
 * Squad rotation is derived separately — it is structural (based on unique
 * player IDs seen) rather than signal-based.
 *
 * Replayability: given the same observations array, the output is identical.
 * No randomness, no timestamps read from Date.now().
 */

import {
  EVENT_TYPE, PREFERENCE_KEY,
  COACHING_STYLE, TRAINING_EMPHASIS, SQUAD_ROTATION,
  COMMUNICATION_STYLE, RISK_TOLERANCE, WORKLOAD_PREFERENCE,
  EXPLICIT_PREFERENCE_WEIGHT, PREFERENCE_SATURATION,
  MIN_OBSERVATIONS_FOR_SIGNAL, MAX_EVIDENCE_REFS,
  SQUAD_ROTATION as SQR,
} from './learning-types.js'
import { emptyPreference, emptyPreferences } from './coach-profile.js'

// ── Signal extraction ─────────────────────────────────────────────────────────

/**
 * A Signal is a (prefKey, value, weight, observationId) tuple.
 * Extracting signals from an observation is pure and deterministic.
 *
 * @param {object} obs  Observation record
 * @returns {Signal[]}
 */
export function extractSignals(obs) {
  if (!obs || !obs.eventType) return []
  const signals = []
  const { eventType, eventData = {}, observationId } = obs
  const cat     = String(eventData?.category     ?? '').toLowerCase()
  const urgency = String(eventData?.urgency      ?? '').toLowerCase()
  const action  = String(eventData?.action       ?? '').toLowerCase()
  const id      = observationId ?? null

  // Helper
  const add = (pref, value, weight = 1) => signals.push({ pref, value, weight, observationId: id })
  const catIncludes = (...kws) => kws.some(k => cat.includes(k))
  const actionIncludes = (...kws) => kws.some(k => action.includes(k))

  // ── RECOMMENDATION_ACCEPTED ────────────────────────────────────────────────
  if (eventType === EVENT_TYPE.RECOMMENDATION_ACCEPTED) {
    // coachingStyle signals
    if (catIncludes('welfare', 'medical', 'support', 'injury', 'wellbeing', 'health'))
      add(PREFERENCE_KEY.COACHING_STYLE, COACHING_STYLE.SUPPORTIVE)

    if (catIncludes('training', 'conditioning', 'discipline', 'performance', 'attendance', 'selection'))
      add(PREFERENCE_KEY.COACHING_STYLE, COACHING_STYLE.DIRECTIVE)

    if (catIncludes('communication', 'feedback', 'team', 'meeting', 'discussion'))
      add(PREFERENCE_KEY.COACHING_STYLE, COACHING_STYLE.COLLABORATIVE)

    // riskTolerance: accepting high-urgency recommendations = higher tolerance
    if (urgency === 'high')   add(PREFERENCE_KEY.RISK_TOLERANCE, RISK_TOLERANCE.HIGH)
    if (urgency === 'medium') add(PREFERENCE_KEY.RISK_TOLERANCE, RISK_TOLERANCE.MEDIUM)
    if (urgency === 'low')    add(PREFERENCE_KEY.RISK_TOLERANCE, RISK_TOLERANCE.LOW)

    // workloadPreference: accepting training/conditioning recs = intensive preference
    if (catIncludes('training', 'conditioning', 'fitness'))
      add(PREFERENCE_KEY.WORKLOAD_PREFERENCE, WORKLOAD_PREFERENCE.INTENSIVE)

    if (catIncludes('rest', 'recovery', 'rotation', 'welfare'))
      add(PREFERENCE_KEY.WORKLOAD_PREFERENCE, WORKLOAD_PREFERENCE.CONSERVATIVE)

    // communicationStyle
    if (catIncludes('welfare', 'medical', 'support') || actionIncludes('check', 'wellbeing', 'welfare'))
      add(PREFERENCE_KEY.COMMUNICATION_STYLE, COMMUNICATION_STYLE.NURTURING)

    if (catIncludes('analysis', 'data', 'performance', 'statistic') || actionIncludes('review', 'analyse', 'data'))
      add(PREFERENCE_KEY.COMMUNICATION_STYLE, COMMUNICATION_STYLE.ANALYTICAL)

    if (catIncludes('communication', 'announcement', 'inform') || actionIncludes('inform', 'announce', 'communicate'))
      add(PREFERENCE_KEY.COMMUNICATION_STYLE, COMMUNICATION_STYLE.DIRECT)
  }

  // ── RECOMMENDATION_REJECTED / IGNORED ────────────────────────────────────
  if (eventType === EVENT_TYPE.RECOMMENDATION_REJECTED ||
      eventType === EVENT_TYPE.RECOMMENDATION_IGNORED) {
    // Rejecting/ignoring high-urgency → risk averse
    if (urgency === 'high') add(PREFERENCE_KEY.RISK_TOLERANCE, RISK_TOLERANCE.LOW)

    // Rejecting training workload → conservative
    if (catIncludes('training', 'conditioning', 'fitness'))
      add(PREFERENCE_KEY.WORKLOAD_PREFERENCE, WORKLOAD_PREFERENCE.CONSERVATIVE)
  }

  // ── TRAINING_COMPLETED ────────────────────────────────────────────────────
  if (eventType === EVENT_TYPE.TRAINING_COMPLETED) {
    const ttype = String(eventData?.trainingType ?? eventData?.type ?? '').toLowerCase()

    if (['technical', 'skill', 'drill', 'ball-work', 'passing'].some(k => ttype.includes(k)))
      add(PREFERENCE_KEY.TRAINING_EMPHASIS, TRAINING_EMPHASIS.TECHNICAL)

    if (['tactical', 'formation', 'shape', 'strategy', 'set-piece', 'set piece'].some(k => ttype.includes(k)))
      add(PREFERENCE_KEY.TRAINING_EMPHASIS, TRAINING_EMPHASIS.TACTICAL)

    if (['physical', 'fitness', 'conditioning', 'running', 'stamina', 'strength'].some(k => ttype.includes(k)))
      add(PREFERENCE_KEY.TRAINING_EMPHASIS, TRAINING_EMPHASIS.PHYSICAL)
  }

  // ── COACH_PREFERENCE_SET ─────────────────────────────────────────────────
  // Direct override — highest weight (5×), immediately dominant
  if (eventType === EVENT_TYPE.COACH_PREFERENCE_SET) {
    const { preference, value } = eventData ?? {}
    if (preference && value && Object.values(PREFERENCE_KEY).includes(preference)) {
      add(preference, value, EXPLICIT_PREFERENCE_WEIGHT)
    }
  }

  // PLAYER_SELECTED is handled by extractSquadRotation — no signals here

  return signals
}

// ── Preference aggregation ────────────────────────────────────────────────────

/**
 * Derive a single preference from all observations.
 * Returns emptyPreference() when there is no signal.
 *
 * @param {object[]} observations
 * @param {string}   prefKey   - PREFERENCE_KEY.*
 * @param {string}   updatedAt
 * @returns {PreferenceEntry}
 */
export function derivePreference(observations, prefKey, updatedAt = null) {
  // Aggregate: { value → { totalWeight, observationIds } }
  const tally = {}

  for (const obs of observations) {
    const sigs = extractSignals(obs).filter(s => s.pref === prefKey)
    for (const { value, weight, observationId } of sigs) {
      if (!tally[value]) tally[value] = { totalWeight: 0, ids: [] }
      tally[value].totalWeight += weight
      if (observationId) tally[value].ids.push(observationId)
    }
  }

  const entries = Object.entries(tally)
  if (!entries.length) return emptyPreference(updatedAt)

  const totalWeight = entries.reduce((s, [, t]) => s + t.totalWeight, 0)
  const totalSignals = entries.reduce((s, [, t]) => s + t.ids.length, 0)

  // Minimum signal count guard
  if (totalSignals < MIN_OBSERVATIONS_FOR_SIGNAL) return emptyPreference(updatedAt)

  // Pick winner
  const [winnerValue, winnerTally] = entries.sort(([, a], [, b]) => b.totalWeight - a.totalWeight)[0]

  // Confidence = agreement_ratio × saturation_factor
  const agreementRatio   = winnerTally.totalWeight / totalWeight
  const saturationFactor = Math.min(1, totalSignals / PREFERENCE_SATURATION)
  const confidence       = agreementRatio * saturationFactor

  const evidence = winnerTally.ids.slice(-MAX_EVIDENCE_REFS)

  return { value: winnerValue, confidence, evidence, updatedAt }
}

// ── Squad rotation (structural, not signal-based) ─────────────────────────────

/**
 * Derive squad rotation preference from PLAYER_SELECTED events.
 *
 * ratio = uniquePlayers / totalSelections
 *   ≥ 0.70 → HIGH
 *   ≥ 0.40 → MODERATE
 *   <  0.40 → LOW
 *
 * @param {object[]} observations
 * @param {string}   updatedAt
 * @returns {PreferenceEntry}
 */
export function extractSquadRotation(observations, updatedAt = null) {
  const selObs = observations.filter(o => o.eventType === EVENT_TYPE.PLAYER_SELECTED)
  if (!selObs.length || selObs.length < MIN_OBSERVATIONS_FOR_SIGNAL) {
    return emptyPreference(updatedAt)
  }

  const totalSelections = selObs.length
  const uniquePlayers   = new Set(
    selObs.map(o => o.eventData?.playerId).filter(Boolean),
  ).size

  if (!uniquePlayers) return emptyPreference(updatedAt)

  const ratio = uniquePlayers / totalSelections
  const value = ratio >= 0.70 ? SQR.HIGH
    : ratio >= 0.40 ? SQR.MODERATE
    : SQR.LOW

  const confidence     = Math.min(1, totalSelections / PREFERENCE_SATURATION)
  const evidence       = selObs.slice(-MAX_EVIDENCE_REFS).map(o => o.observationId).filter(Boolean)

  return { value, confidence, evidence, updatedAt }
}

// ── Full preferences extraction ───────────────────────────────────────────────

/**
 * Derive all six preferences from the observation log.
 * Pure and deterministic — same input always produces the same output.
 *
 * @param {object[]} observations
 * @param {string}   updatedAt
 * @returns {Preferences}
 */
export function extractPreferences(observations, updatedAt = null) {
  if (!observations || !observations.length) return emptyPreferences(updatedAt)

  return {
    [PREFERENCE_KEY.COACHING_STYLE]:      derivePreference(observations, PREFERENCE_KEY.COACHING_STYLE, updatedAt),
    [PREFERENCE_KEY.TRAINING_EMPHASIS]:   derivePreference(observations, PREFERENCE_KEY.TRAINING_EMPHASIS, updatedAt),
    [PREFERENCE_KEY.SQUAD_ROTATION]:      extractSquadRotation(observations, updatedAt),
    [PREFERENCE_KEY.COMMUNICATION_STYLE]: derivePreference(observations, PREFERENCE_KEY.COMMUNICATION_STYLE, updatedAt),
    [PREFERENCE_KEY.RISK_TOLERANCE]:      derivePreference(observations, PREFERENCE_KEY.RISK_TOLERANCE, updatedAt),
    [PREFERENCE_KEY.WORKLOAD_PREFERENCE]: derivePreference(observations, PREFERENCE_KEY.WORKLOAD_PREFERENCE, updatedAt),
  }
}

// ── Recommendation history ────────────────────────────────────────────────────

/**
 * Build the recommendation history summary from observations.
 *
 * @param {object[]} observations
 * @returns {RecommendationHistory}
 */
export function extractRecommendationHistory(observations) {
  let accepted = 0, ignored = 0, rejected = 0, edited = 0
  const byCategory = {}
  const allActions = []

  for (const obs of observations) {
    const cat = obs.eventData?.category ?? 'uncategorised'

    if (!byCategory[cat]) byCategory[cat] = { accepted: 0, rejected: 0, ignored: 0, edited: 0 }

    if (obs.eventType === EVENT_TYPE.RECOMMENDATION_ACCEPTED) {
      accepted++
      byCategory[cat].accepted++
    } else if (obs.eventType === EVENT_TYPE.RECOMMENDATION_IGNORED) {
      ignored++
      byCategory[cat].ignored++
    } else if (obs.eventType === EVENT_TYPE.RECOMMENDATION_REJECTED) {
      rejected++
      byCategory[cat].rejected++
    } else if (obs.eventType === EVENT_TYPE.RECOMMENDATION_EDITED) {
      edited++
      byCategory[cat].edited = (byCategory[cat].edited ?? 0) + 1
    } else {
      continue
    }

    allActions.push({
      observationId:    obs.observationId ?? null,
      recommendationId: obs.eventData?.recommendationId ?? null,
      action:           obs.eventType,
      category:         cat,
      recordedAt:       obs.recordedAt ?? null,
    })
  }

  // Newest first
  const recentActions = allActions.reverse().slice(0, 25)

  return { accepted, ignored, rejected, edited, byCategory, recentActions }
}

// ── Player selections ─────────────────────────────────────────────────────────

/**
 * Build the player-selection map from observations.
 * Keys are playerIds; values track selection count, lastSelected timestamp,
 * and a confidence score based on recency-weighted frequency.
 *
 * @param {object[]} observations
 * @returns {{ [playerId]: { selectionCount, lastSelected, confidence } }}
 */
export function extractPlayerSelections(observations) {
  const selMap = {}

  for (const obs of observations) {
    if (obs.eventType !== EVENT_TYPE.PLAYER_SELECTED) continue
    const pid = obs.eventData?.playerId ?? null
    if (!pid) continue

    if (!selMap[pid]) {
      selMap[pid] = { selectionCount: 0, lastSelected: null, confidence: 0 }
    }
    selMap[pid].selectionCount++
    selMap[pid].lastSelected = obs.recordedAt ?? selMap[pid].lastSelected
  }

  // Compute confidence per player: selections / total player selection observations
  const totalSelections = observations.filter(o => o.eventType === EVENT_TYPE.PLAYER_SELECTED).length
  for (const pid of Object.keys(selMap)) {
    selMap[pid].confidence = totalSelections > 0
      ? Math.min(1, selMap[pid].selectionCount / (totalSelections * 0.5))
      : 0
  }

  return selMap
}
