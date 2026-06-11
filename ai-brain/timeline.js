/**
 * AI Brain — Intelligence Timeline (M6)
 *
 * The Brain's episodic memory. Records significant AI events in chronological
 * order as an append-only, immutable log.
 *
 * Rules:
 *  - Append only. Historical events are never modified or deleted.
 *  - Every event is Object.frozen on creation.
 *  - No reasoning occurs here.
 *  - No learning occurs here.
 *  - It is purely a timestamped event history.
 *
 * Query dimensions:
 *  dateFrom / dateTo, entityId, recommendationId, sessionId,
 *  coachId, clubId, eventType, eventTypes, limit.
 */

import { randomUUID } from 'crypto'

// ── Event type constants ──────────────────────────────────────────────────────

export const EVENT_TYPE = Object.freeze({
  REQUEST:                  'REQUEST',
  LEARN:                    'LEARN',
  RECOMMENDATION_SHOWN:     'RECOMMENDATION_SHOWN',
  RECOMMENDATION_ACCEPTED:  'RECOMMENDATION_ACCEPTED',
  RECOMMENDATION_DISMISSED: 'RECOMMENDATION_DISMISSED',
  RECOMMENDATION_SNOOZED:   'RECOMMENDATION_SNOOZED',
  RECOMMENDATION_ACTIONED:  'RECOMMENDATION_ACTIONED',
  DETECTOR_EVENT:           'DETECTOR_EVENT',
  COACH_OBSERVATION:        'COACH_OBSERVATION',
})

// ── Append-only in-memory store ───────────────────────────────────────────────

const _events = []   // module-private; never exposed directly

/**
 * Append one event to the timeline.
 * The returned event object is frozen — it cannot be modified.
 *
 * @param {string} eventType      - one of EVENT_TYPE.*
 * @param {object} opts
 * @param {string|null}   opts.clubId
 * @param {string|null}   opts.coachId
 * @param {string|null}   opts.sessionId
 * @param {string|null}   opts.recommendationId
 * @param {string[]}      opts.entities          - player/team/entity IDs
 * @param {object}        opts.metadata          - event-specific payload
 * @returns {TimelineEvent}
 */
export function append(eventType, {
  clubId           = null,
  coachId          = null,
  sessionId        = null,
  recommendationId = null,
  entities         = [],
  metadata         = {},
} = {}) {
  const event = Object.freeze({
    id:               randomUUID(),
    timestamp:        new Date().toISOString(),
    eventType:        eventType ?? EVENT_TYPE.DETECTOR_EVENT,
    clubId:           clubId           ?? null,
    coachId:          coachId          ?? null,
    sessionId:        sessionId        ?? null,
    recommendationId: recommendationId ?? null,
    entities:         Array.isArray(entities) ? Object.freeze([...entities]) : Object.freeze([]),
    metadata:         Object.freeze(typeof metadata === 'object' && metadata !== null ? { ...metadata } : {}),
  })
  _events.push(event)
  return event
}

/**
 * Query timeline events with optional filters.
 * Returns events in reverse-chronological order (most recent first).
 *
 * @param {object} filters
 * @param {string}    [filters.dateFrom]         - ISO date string, inclusive lower bound
 * @param {string}    [filters.dateTo]           - ISO date string, inclusive upper bound
 * @param {string}    [filters.entityId]         - match events containing this entity
 * @param {string}    [filters.recommendationId] - match by recommendation
 * @param {string}    [filters.sessionId]        - match by session
 * @param {string}    [filters.coachId]          - match by coach
 * @param {string}    [filters.clubId]           - match by club
 * @param {string}    [filters.eventType]        - single event type
 * @param {string[]}  [filters.eventTypes]       - multiple event types (OR)
 * @param {number}    [filters.limit]            - max events to return
 * @returns {{ events: TimelineEvent[], total: number, stats: object }}
 */
export function query(filters = {}) {
  if (filters == null) filters = {}

  const {
    dateFrom, dateTo,
    entityId, recommendationId, sessionId,
    coachId, clubId,
    eventType, eventTypes,
    limit,
  } = filters

  let results = _events.slice()   // shallow copy — originals stay frozen

  // ── Date range ──────────────────────────────────────────────────────────────
  if (dateFrom != null) {
    const from = new Date(dateFrom).getTime()
    results = results.filter(e => new Date(e.timestamp).getTime() >= from)
  }
  if (dateTo != null) {
    const to = new Date(dateTo).getTime()
    results = results.filter(e => new Date(e.timestamp).getTime() <= to)
  }

  // ── Entity membership ───────────────────────────────────────────────────────
  if (entityId != null) {
    results = results.filter(e => e.entities.includes(entityId))
  }

  // ── Exact field matches ────────────────────────────────────────────────────
  if (recommendationId != null) results = results.filter(e => e.recommendationId === recommendationId)
  if (sessionId        != null) results = results.filter(e => e.sessionId        === sessionId)
  if (coachId          != null) results = results.filter(e => e.coachId          === coachId)
  if (clubId           != null) results = results.filter(e => e.clubId           === clubId)

  // ── Event type filter (single or multiple) ─────────────────────────────────
  if (eventType != null) {
    results = results.filter(e => e.eventType === eventType)
  } else if (Array.isArray(eventTypes) && eventTypes.length > 0) {
    const typeSet = new Set(eventTypes)
    results = results.filter(e => typeSet.has(e.eventType))
  }

  // ── Reverse-chronological order ────────────────────────────────────────────
  results = results.reverse()

  // ── Limit ──────────────────────────────────────────────────────────────────
  if (typeof limit === 'number' && limit > 0) {
    results = results.slice(0, limit)
  }

  return {
    events: results,
    total:  _events.length,     // total events ever recorded (unfiltered)
    stats:  buildStats(_events),
  }
}

function buildStats(allEvents) {
  const byType = {}
  for (const e of allEvents) {
    byType[e.eventType] = (byType[e.eventType] ?? 0) + 1
  }
  return { total: allEvents.length, byType }
}

/** Total number of events in the store (for monitoring). */
export function count() {
  return _events.length
}

/**
 * Clear all stored events.
 * For use in tests only — production code never calls this.
 */
export function _clear() {
  _events.length = 0
}
