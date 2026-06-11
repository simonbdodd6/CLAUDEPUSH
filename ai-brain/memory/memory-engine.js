/**
 * AI Brain — Memory Engine (M7)
 *
 * Transforms repeated Timeline events into long-term Memory objects.
 *
 * Rules (non-negotiable):
 *  - No reasoning. Only statistical pattern counting over raw event data.
 *  - No LLM calls. No external modules.
 *  - refresh() reads the Brain timeline only — no other data source.
 *  - Memories are never automatically deleted.
 *  - get() applies time-based strength decay on read (read-only; does not modify the store).
 *
 * Query dimensions handled by refresh():
 *  - coachId    → MEMORY_TYPE.COACH
 *  - clubId     → MEMORY_TYPE.CLUB
 *  - sessionId  → MEMORY_TYPE.SESSION
 *  - entityId   (entities[]) → MEMORY_TYPE.PLAYER
 *
 * A single entityId can produce multiple Memory objects if it plays multiple
 * roles across those dimensions (e.g. an ID that is both a coachId and a clubId).
 */

import { query }                                                from '../timeline.js'
import { MEMORY_TYPE, applyDecay }                             from './memory-types.js'
import { upsert, getByEntity, getAll, _forceUpsert as _fu }   from './memory-store.js'

// ── Tuning constants ──────────────────────────────────────────────────────────

const STRENGTH_PER_EVENT    = 8    // base strength added per supporting event
const MAX_STRENGTH          = 100
const BASE_CONFIDENCE       = 30   // floor before evidence is accumulated
const MIN_OUTCOME_SAMPLES   = 3    // minimum outcomes before using acceptance rate for COACH confidence

// ── Memory builders ───────────────────────────────────────────────────────────

function calcStrength(eventCount) {
  return Math.min(MAX_STRENGTH, eventCount * STRENGTH_PER_EVENT)
}

function extractCategories(events) {
  return [...new Set(events.flatMap(e => {
    const cat = e.metadata?.category
    return cat ? [cat] : []
  }))]
}

function buildCoachMemory(entityId, events) {
  const accepted  = events.filter(e => e.eventType === 'RECOMMENDATION_ACCEPTED').length
  const dismissed = events.filter(e => e.eventType === 'RECOMMENDATION_DISMISSED').length
  const snoozed   = events.filter(e => e.eventType === 'RECOMMENDATION_SNOOZED').length
  const actioned  = events.filter(e => e.eventType === 'RECOMMENDATION_ACTIONED').length
  const outcomes  = accepted + dismissed + snoozed + actioned
  const positive  = accepted + actioned

  // Acceptance-rate confidence only kicks in once we have enough signal.
  const confidence = outcomes >= MIN_OUTCOME_SAMPLES
    ? Math.round((positive / outcomes) * 100)
    : 50

  const categories = extractCategories(events)
  const strength   = calcStrength(events.length)

  const parts = [`Coach ${entityId}: ${events.length} AI event(s).`]
  if (outcomes > 0) parts.push(`${positive}/${outcomes} outcomes positive.`)
  if (categories.length > 0) parts.push(`Active categories: ${categories.join(', ')}.`)

  return {
    type:                      MEMORY_TYPE.COACH,
    entityId,
    title:                     `Coach activity: ${entityId}`,
    summary:                   parts.join(' '),
    confidence,
    strength,
    supportingTimelineEvents:  events.map(e => e.id),
    metadata: { accepted, dismissed, snoozed, actioned, totalOutcomes: outcomes, categories },
  }
}

function buildClubMemory(entityId, events) {
  const sessions = new Set(events.map(e => e.sessionId).filter(Boolean))
  const coaches  = new Set(events.map(e => e.coachId).filter(Boolean))
  const byType   = {}
  for (const e of events) {
    byType[e.eventType] = (byType[e.eventType] ?? 0) + 1
  }

  return {
    type:                      MEMORY_TYPE.CLUB,
    entityId,
    title:                     `Club activity: ${entityId}`,
    summary:                   `Club ${entityId}: ${events.length} event(s), ${sessions.size} session(s), ${coaches.size} coach(es).`,
    confidence:                Math.min(90, BASE_CONFIDENCE + events.length * 4),
    strength:                  calcStrength(events.length),
    supportingTimelineEvents:  events.map(e => e.id),
    metadata: { totalEvents: events.length, sessions: sessions.size, coaches: coaches.size, byType },
  }
}

function buildSessionMemory(entityId, events) {
  const sorted  = [...events].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  const types   = [...new Set(events.map(e => e.eventType))]
  const firstAt = sorted[0]?.timestamp ?? null
  const lastAt  = sorted[sorted.length - 1]?.timestamp ?? null
  const dateLabel = firstAt ? ` Started: ${firstAt.slice(0, 10)}.` : ''

  return {
    type:                      MEMORY_TYPE.SESSION,
    entityId,
    title:                     `Session: ${entityId}`,
    summary:                   `Session ${entityId}: ${events.length} event(s). Types: ${types.join(', ')}.${dateLabel}`,
    confidence:                Math.min(95, 40 + events.length * 6),
    strength:                  calcStrength(events.length),
    supportingTimelineEvents:  events.map(e => e.id),
    metadata: { eventCount: events.length, eventTypes: types, firstAt, lastAt },
  }
}

function buildEntityMemory(entityId, events) {
  const sessions   = new Set(events.map(e => e.sessionId).filter(Boolean))
  const categories = extractCategories(events)
  const catPart    = categories.length > 0 ? ` Categories: ${categories.join(', ')}.` : ''

  return {
    type:                      MEMORY_TYPE.PLAYER,
    entityId,
    title:                     `Entity memory: ${entityId}`,
    summary:                   `Entity ${entityId}: appeared in ${events.length} event(s) across ${sessions.size} session(s).${catPart}`,
    confidence:                Math.min(90, BASE_CONFIDENCE + events.length * 5),
    strength:                  calcStrength(events.length),
    supportingTimelineEvents:  events.map(e => e.id),
    metadata: { totalEvents: events.length, sessions: sessions.size, categories },
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Rebuild memory objects for an entity from Brain timeline events.
 * Queries four dimensions; creates/updates one Memory per dimension with data.
 * No reasoning — only event counting and rate calculation.
 *
 * @param {string|null} entityId
 * @param {Function}    [_queryFn]  — injected in unit tests; defaults to Brain timeline query
 * @returns {Memory[]}
 */
export function refresh(entityId, _queryFn = null) {
  if (entityId == null) return []
  const qfn = typeof _queryFn === 'function' ? _queryFn : query

  const coachEvents   = qfn({ coachId:   entityId }).events
  const clubEvents    = qfn({ clubId:    entityId }).events
  const sessionEvents = qfn({ sessionId: entityId }).events
  const entityEvents  = qfn({ entityId  }).events

  const updated = []
  if (coachEvents.length   > 0) updated.push(upsert(buildCoachMemory(entityId,   coachEvents)))
  if (clubEvents.length    > 0) updated.push(upsert(buildClubMemory(entityId,    clubEvents)))
  if (sessionEvents.length > 0) updated.push(upsert(buildSessionMemory(entityId, sessionEvents)))
  if (entityEvents.length  > 0) updated.push(upsert(buildEntityMemory(entityId,  entityEvents)))

  return updated
}

/**
 * Return all stored memories for an entity, with time-based strength decay applied.
 * Does NOT auto-refresh; call refresh() first to get current data.
 *
 * @param {string|null} entityId
 * @returns {Memory[]}
 */
export function get(entityId) {
  if (entityId == null) return []
  return getByEntity(entityId).map(applyDecay)
}

/**
 * Case-insensitive full-text search over title, summary, and entityId fields.
 * Returns matching memories with decay applied.
 * Returns [] for null or empty query.
 *
 * @param {string|null} queryText
 * @returns {Memory[]}
 */
export function search(queryText) {
  if (queryText == null || queryText === '') return []
  const q = String(queryText).toLowerCase()
  return getAll()
    .filter(m =>
      m.title.toLowerCase().includes(q)   ||
      m.summary.toLowerCase().includes(q) ||
      m.entityId.toLowerCase().includes(q)
    )
    .map(applyDecay)
}

/**
 * Return memories of entities that co-appeared in timeline events with entityId.
 * Only returns memories that have already been refreshed into the store.
 *
 * @param {string|null} entityId
 * @param {Function}    [_queryFn]  — injected in unit tests
 * @returns {Memory[]}
 */
export function related(entityId, _queryFn = null) {
  if (entityId == null) return []
  const qfn = typeof _queryFn === 'function' ? _queryFn : query

  // Gather all events mentioning this entity across all query dimensions
  const rawEvents = [
    ...qfn({ coachId:   entityId }).events,
    ...qfn({ clubId:    entityId }).events,
    ...qfn({ sessionId: entityId }).events,
    ...qfn({ entityId  }).events,
  ]

  // Deduplicate events by id
  const seenEvt = new Set()
  const events  = rawEvents.filter(ev => {
    if (seenEvt.has(ev.id)) return false
    seenEvt.add(ev.id)
    return true
  })

  // Collect unique entity IDs that co-appear in these events
  const relatedIds = new Set()
  for (const ev of events) {
    if (ev.coachId   && ev.coachId   !== entityId) relatedIds.add(ev.coachId)
    if (ev.clubId    && ev.clubId    !== entityId) relatedIds.add(ev.clubId)
    if (ev.sessionId && ev.sessionId !== entityId) relatedIds.add(ev.sessionId)
    for (const e of (ev.entities ?? [])) {
      if (e !== entityId) relatedIds.add(e)
    }
  }

  return [...relatedIds]
    .flatMap(id => getByEntity(id))
    .map(applyDecay)
}
