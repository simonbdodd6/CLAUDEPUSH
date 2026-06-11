/**
 * AI Brain — Observation Engine (M8)
 *
 * Reads Memory objects and produces typed Observations.
 * Deterministic and pure: the same memory state always yields the same observations.
 *
 * Rules (non-negotiable):
 *  - Reads from memory-store only. Never calls the Brain timeline directly.
 *  - Produces observations only. No recommendations. No predictions.
 *  - No LLM calls. No external modules. No I/O.
 *  - Pure deterministic pattern counting over memory metadata.
 *
 * Observation pipeline position:
 *   Memory (M7) → Observation (M8) → Reasoning → Recommendation
 *
 * Observers by memory type:
 *   COACH   → COACH_BEHAVIOUR, SESSION_FREQUENCY
 *   CLUB    → CLUB_ACTIVITY, SESSION_FREQUENCY
 *   SESSION → SESSION_LOAD, MATCH_PREPARATION
 *   PLAYER  → PLAYER_AVAILABILITY_TREND, ATTENDANCE_TREND,
 *              REPEATED_ABSENCE, PLAYER_IMPROVEMENT
 */

import { getByEntity, getAll }               from '../memory/memory-store.js'
import { MEMORY_TYPE }                       from '../memory/memory-types.js'
import { OBSERVATION_TYPE, makeObservation } from './observation-types.js'

// ── Tuning constants ──────────────────────────────────────────────────────────

const MIN_OUTCOME_SAMPLES  = 3   // minimum outcomes to derive coach behaviour
const HIGH_ACCEPT_RATE     = 0.6 // threshold: coach is receptive
const LOW_ACCEPT_RATE      = 0.4 // threshold: coach is dismissive
const HIGH_ACTIVITY_EVENTS = 20  // events above which club activity is "high"
const MOD_ACTIVITY_EVENTS  = 5   // events above which club activity is "moderate"
const REGULAR_SESSIONS     = 5   // sessions above which attendance is "regular"
const OCCASIONAL_SESSIONS  = 2   // sessions above which attendance is "occasional"
const HEAVY_SESSION_EVENTS = 10  // events above which session load is "heavy"
const MODERATE_SESSION_EVT = 5   // events above which session load is "moderate"

// ── Internal helper ───────────────────────────────────────────────────────────

function obs({ type, mem, confidence, explanation, metadata = {} }) {
  return makeObservation({
    observationType:  type,
    entity:           { id: mem.entityId, type: mem.type },
    confidence,
    explanation,
    supportingMemories: [mem.id],
    metadata,
  })
}

// ── Per-type observers ────────────────────────────────────────────────────────

function observeCoach(mem) {
  const result = []
  const {
    accepted = 0, dismissed = 0, snoozed = 0, actioned = 0,
    totalOutcomes = 0, categories = [],
  } = mem.metadata ?? {}

  // COACH_BEHAVIOUR: acceptance / dismissal pattern
  if (totalOutcomes >= MIN_OUTCOME_SAMPLES) {
    const positive     = accepted + actioned
    const positiveRate = positive / totalOutcomes
    const pct          = Math.round(positiveRate * 100)
    // Confidence grows with sample size, capped at 90
    const confidence   = Math.min(90, 50 + (totalOutcomes - MIN_OUTCOME_SAMPLES) * 3)

    if (positiveRate >= HIGH_ACCEPT_RATE) {
      result.push(obs({
        type: OBSERVATION_TYPE.COACH_BEHAVIOUR, mem, confidence,
        explanation: `Coach accepts ${pct}% of AI recommendations (${positive} of ${totalOutcomes} outcomes positive).`,
        metadata: { positiveRate, accepted, dismissed, actioned, snoozed, totalOutcomes, signal: 'receptive' },
      }))
    } else if (positiveRate < LOW_ACCEPT_RATE) {
      result.push(obs({
        type: OBSERVATION_TYPE.COACH_BEHAVIOUR, mem, confidence,
        explanation: `Coach dismisses ${100 - pct}% of AI recommendations (${dismissed} of ${totalOutcomes} outcomes negative).`,
        metadata: { positiveRate, accepted, dismissed, actioned, snoozed, totalOutcomes, signal: 'dismissive' },
      }))
    } else {
      result.push(obs({
        type: OBSERVATION_TYPE.COACH_BEHAVIOUR, mem, confidence: confidence - 10,
        explanation: `Coach shows mixed engagement: ${pct}% of ${totalOutcomes} outcomes are positive.`,
        metadata: { positiveRate, accepted, dismissed, actioned, snoozed, totalOutcomes, signal: 'mixed' },
      }))
    }
  }

  // SESSION_FREQUENCY: active recommendation categories
  if (categories.length > 0) {
    result.push(obs({
      type: OBSERVATION_TYPE.SESSION_FREQUENCY, mem,
      confidence: Math.min(80, 30 + categories.length * 10),
      explanation: `Coach is active across ${categories.length} recommendation category/categories: ${categories.join(', ')}.`,
      metadata: { categories, categoryCount: categories.length },
    }))
  }

  return result
}

function observeClub(mem) {
  const result = []
  const { totalEvents = 0, sessions = 0, coaches = 0, byType = {} } = mem.metadata ?? {}

  // CLUB_ACTIVITY: overall AI engagement level
  if (totalEvents > 0) {
    const level = totalEvents >= HIGH_ACTIVITY_EVENTS ? 'high'
                : totalEvents >= MOD_ACTIVITY_EVENTS  ? 'moderate'
                : 'low'
    result.push(obs({
      type: OBSERVATION_TYPE.CLUB_ACTIVITY, mem,
      confidence: Math.min(90, 30 + totalEvents * 3),
      explanation: `Club has ${level} AI activity: ${totalEvents} event(s) across ${sessions} session(s) with ${coaches} coach(es).`,
      metadata: { totalEvents, sessions, coaches, activityLevel: level, byType },
    }))
  }

  // SESSION_FREQUENCY: how many distinct AI sessions the club has had
  if (sessions > 0) {
    result.push(obs({
      type: OBSERVATION_TYPE.SESSION_FREQUENCY, mem,
      confidence: Math.min(85, 30 + sessions * 8),
      explanation: `Club has engaged with AI in ${sessions} distinct session(s).`,
      metadata: { sessions, coaches },
    }))
  }

  return result
}

function observeSession(mem) {
  const result = []
  const { eventCount = 0, eventTypes = [], firstAt = null, lastAt = null } = mem.metadata ?? {}

  // SESSION_LOAD: intensity of AI engagement within the session
  if (eventCount > 0) {
    const load = eventCount >= HEAVY_SESSION_EVENTS ? 'heavy'
               : eventCount >= MODERATE_SESSION_EVT  ? 'moderate'
               : 'light'
    result.push(obs({
      type: OBSERVATION_TYPE.SESSION_LOAD, mem,
      confidence: Math.min(90, 40 + eventCount * 4),
      explanation: `Session had ${load} AI engagement: ${eventCount} event(s) of type(s) ${eventTypes.join(', ')}.`,
      metadata: { eventCount, loadLevel: load, eventTypes, firstAt, lastAt },
    }))
  }

  // MATCH_PREPARATION: AI was consulted (REQUEST or RECOMMENDATION_SHOWN present)
  const hasConsultation = eventTypes.includes('REQUEST') || eventTypes.includes('RECOMMENDATION_SHOWN')
  if (hasConsultation) {
    const requestCount = eventTypes.filter(t => t === 'REQUEST').length
    result.push(obs({
      type: OBSERVATION_TYPE.MATCH_PREPARATION, mem,
      confidence: Math.min(85, 50 + eventCount * 2),
      explanation: `Session included ${requestCount > 0 ? requestCount + ' AI request(s)' : 'AI recommendation delivery'} — coach sought AI input before play.`,
      metadata: { requestCount, eventCount, eventTypes, firstAt },
    }))
  }

  return result
}

function observePlayer(mem) {
  const result = []
  const { totalEvents = 0, sessions = 0, categories = [] } = mem.metadata ?? {}

  // PLAYER_AVAILABILITY_TREND: how often they appear in AI events
  if (totalEvents > 0) {
    result.push(obs({
      type: OBSERVATION_TYPE.PLAYER_AVAILABILITY_TREND, mem,
      confidence: Math.min(85, 30 + totalEvents * 5),
      explanation: `Entity appeared in ${totalEvents} AI event(s) across ${sessions} session(s).` +
                   (categories.length > 0 ? ` Relevant categories: ${categories.join(', ')}.` : ''),
      metadata: { totalEvents, sessions, categories },
    }))
  }

  // ATTENDANCE_TREND: session-level frequency
  if (sessions > 0) {
    const signal = sessions >= REGULAR_SESSIONS    ? 'regular'
                 : sessions >= OCCASIONAL_SESSIONS ? 'occasional'
                 : 'infrequent'
    result.push(obs({
      type: OBSERVATION_TYPE.ATTENDANCE_TREND, mem,
      confidence: Math.min(80, 30 + sessions * 7),
      explanation: `Entity has ${signal} AI session presence: ${sessions} session(s) with ${totalEvents} event(s) total.`,
      metadata: { sessions, totalEvents, attendanceSignal: signal },
    }))
  }

  // REPEATED_ABSENCE: concentrated events in a single session despite multiple events
  if (totalEvents >= 3 && sessions === 1) {
    result.push(obs({
      type: OBSERVATION_TYPE.REPEATED_ABSENCE, mem,
      confidence: Math.min(65, 30 + totalEvents * 4),
      explanation: `Entity has ${totalEvents} events all within a single session — limited multi-session AI presence.`,
      metadata: { sessions, totalEvents, note: 'single-session concentration' },
    }))
  }

  // PLAYER_IMPROVEMENT: strong consistent memory signal
  if (mem.confidence > 70 && totalEvents >= 5) {
    result.push(obs({
      type: OBSERVATION_TYPE.PLAYER_IMPROVEMENT, mem,
      confidence: Math.min(75, mem.confidence - 10),
      explanation: `Entity shows consistent AI engagement (memory confidence: ${mem.confidence}, ${totalEvents} event(s)).`,
      metadata: { memoryConfidence: mem.confidence, totalEvents, sessions },
    }))
  }

  return result
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

function deriveObservations(memories) {
  const result = []
  for (const mem of memories) {
    switch (mem.type) {
      case MEMORY_TYPE.COACH:   result.push(...observeCoach(mem));   break
      case MEMORY_TYPE.CLUB:    result.push(...observeClub(mem));    break
      case MEMORY_TYPE.SESSION: result.push(...observeSession(mem)); break
      case MEMORY_TYPE.PLAYER:
      case MEMORY_TYPE.TEAM:    result.push(...observePlayer(mem));  break
    }
  }
  return result
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derive all observations for a single entity from its stored memories.
 * Returns [] if the entity has no memories (call AI.memory.refresh() first).
 *
 * @param {string|null} entityId
 * @returns {Observation[]}
 */
export function observe(entityId) {
  if (entityId == null) return []
  return deriveObservations(getByEntity(entityId))
}

/**
 * Derive observations for every entity that has stored memories.
 *
 * @returns {Observation[]}
 */
export function observeAll() {
  return deriveObservations(getAll())
}

/**
 * Derive observations of a specific type for a given entity.
 *
 * @param {string|null} entityId
 * @param {string}      observationType  - one of OBSERVATION_TYPE.*
 * @returns {Observation[]}
 */
export function byType(entityId, observationType) {
  return observe(entityId).filter(o => o.observationType === observationType)
}
