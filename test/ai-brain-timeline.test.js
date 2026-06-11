/**
 * AI Brain — M6 Intelligence Timeline Tests
 *
 * Verifies:
 * 1. Timeline store: append, immutability, append-only contract
 * 2. Query by all supported dimensions: date, entity, recommendationId,
 *    sessionId, coachId, clubId, eventType, eventTypes, limit
 * 3. Event shape: all required fields present and typed correctly
 * 4. Stats: byType counts correct, total reflects store size
 * 5. AI.request() records REQUEST + RECOMMENDATION_SHOWN events
 * 6. AI.learn() records the correct outcome event type
 * 7. AI.recordObservation() records COACH_OBSERVATION events
 * 8. AI.timeline() returns Brain timeline events (M6 behaviour)
 * 9. AI.timeline() backward-compat shape (M2 regression)
 * 10. All M1–M5 contracts unaffected
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AI } from '../ai-brain/index.js'
import {
  append, query, count, _clear, EVENT_TYPE,
} from '../ai-brain/timeline.js'

// ── EVENT_TYPE constants ──────────────────────────────────────────────────────

test('EVENT_TYPE has all required event type keys', () => {
  const required = [
    'REQUEST', 'LEARN',
    'RECOMMENDATION_SHOWN',
    'RECOMMENDATION_ACCEPTED',
    'RECOMMENDATION_DISMISSED',
    'RECOMMENDATION_SNOOZED',
    'RECOMMENDATION_ACTIONED',
    'DETECTOR_EVENT',
    'COACH_OBSERVATION',
  ]
  for (const k of required) {
    assert.equal(typeof EVENT_TYPE[k], 'string', `EVENT_TYPE.${k} must be string`)
    assert.equal(EVENT_TYPE[k], k, `EVENT_TYPE.${k} must equal its key name`)
  }
})

test('EVENT_TYPE is frozen (immutable)', () => {
  assert.throws(
    () => { EVENT_TYPE.NEW_TYPE = 'test' },
    'Adding to EVENT_TYPE must throw in strict mode'
  )
})

// ── append() — event creation and immutability ────────────────────────────────

test('append() creates an event with all required fields', () => {
  _clear()
  const ev = append(EVENT_TYPE.DETECTOR_EVENT, {
    clubId: 'c1', coachId: 'coach1', sessionId: 'sess1',
    recommendationId: 'rec1', entities: ['player1'], metadata: { reason: 'test' },
  })
  assert.equal(typeof ev.id,        'string',  'id must be UUID string')
  assert.equal(typeof ev.timestamp, 'string',  'timestamp must be ISO string')
  assert.equal(ev.eventType,        EVENT_TYPE.DETECTOR_EVENT)
  assert.equal(ev.clubId,           'c1')
  assert.equal(ev.coachId,          'coach1')
  assert.equal(ev.sessionId,        'sess1')
  assert.equal(ev.recommendationId, 'rec1')
  assert.deepEqual(ev.entities,     ['player1'])
  assert.deepEqual(ev.metadata,     { reason: 'test' })
})

test('append() returns a frozen event — cannot be modified', () => {
  _clear()
  const ev = append(EVENT_TYPE.REQUEST)
  assert.ok(Object.isFrozen(ev), 'event must be frozen')
  assert.throws(() => { ev.coachId = 'new-value' }, 'mutating a frozen event must throw')
})

test('append() freezes entities array', () => {
  _clear()
  const ev = append(EVENT_TYPE.REQUEST, { entities: ['p1', 'p2'] })
  assert.ok(Object.isFrozen(ev.entities), 'entities array must be frozen')
})

test('append() freezes metadata object', () => {
  _clear()
  const ev = append(EVENT_TYPE.REQUEST, { metadata: { key: 'value' } })
  assert.ok(Object.isFrozen(ev.metadata), 'metadata must be frozen')
})

test('append() timestamp is a valid ISO 8601 string', () => {
  _clear()
  const ev = append(EVENT_TYPE.REQUEST)
  assert.doesNotThrow(() => new Date(ev.timestamp))
  assert.ok(!isNaN(new Date(ev.timestamp).getTime()))
})

test('append() uses safe defaults for omitted fields', () => {
  _clear()
  const ev = append(EVENT_TYPE.LEARN)
  assert.equal(ev.clubId,           null, 'clubId defaults to null')
  assert.equal(ev.coachId,          null, 'coachId defaults to null')
  assert.equal(ev.sessionId,        null, 'sessionId defaults to null')
  assert.equal(ev.recommendationId, null, 'recommendationId defaults to null')
  assert.deepEqual(Array.from(ev.entities), [])
  assert.deepEqual({ ...ev.metadata }, {})
})

test('append() increments count', () => {
  _clear()
  assert.equal(count(), 0)
  append(EVENT_TYPE.REQUEST)
  append(EVENT_TYPE.LEARN)
  assert.equal(count(), 2)
})

// ── Append-only contract ───────────────────────────────────────────────────────

test('query() returns immutable copies — modifying the result cannot affect the store', () => {
  _clear()
  append(EVENT_TYPE.REQUEST, { coachId: 'original-coach' })
  const { events } = query({})
  // Attempting to modify the returned event should not affect the store
  assert.throws(() => { events[0].coachId = 'modified' }, 'frozen event must throw on mutation')
  // Re-query to confirm store is unchanged
  const { events: events2 } = query({})
  assert.equal(events2[0].coachId, 'original-coach', 'store event must be unchanged')
})

test('historical events remain after more events are appended', () => {
  _clear()
  const e1 = append(EVENT_TYPE.REQUEST, { sessionId: 'first' })
  append(EVENT_TYPE.LEARN,  { sessionId: 'second' })
  append(EVENT_TYPE.COACH_OBSERVATION, { sessionId: 'third' })
  // First event must still exist and be unchanged
  const { events } = query({ sessionId: 'first' })
  assert.equal(events.length, 1)
  assert.equal(events[0].id, e1.id, 'first event id must be preserved')
})

// ── query() — result shape ─────────────────────────────────────────────────────

test('query() returns { events, total, stats } shape', () => {
  _clear()
  const result = query({})
  assert.ok(Array.isArray(result.events))
  assert.ok(typeof result.total === 'number')
  assert.ok(typeof result.stats === 'object')
  assert.ok(typeof result.stats.total === 'number')
  assert.ok(typeof result.stats.byType === 'object')
})

test('query() returns events in reverse-chronological order (most recent first)', () => {
  _clear()
  append(EVENT_TYPE.REQUEST)          // oldest
  append(EVENT_TYPE.LEARN)
  append(EVENT_TYPE.COACH_OBSERVATION) // newest
  const { events } = query({})
  assert.equal(events[0].eventType, EVENT_TYPE.COACH_OBSERVATION, 'most recent must be first')
  assert.equal(events[2].eventType, EVENT_TYPE.REQUEST,           'oldest must be last')
})

test('query() total reflects total store size, not filtered count', () => {
  _clear()
  append(EVENT_TYPE.REQUEST,  { coachId: 'c-a' })
  append(EVENT_TYPE.LEARN,    { coachId: 'c-a' })
  append(EVENT_TYPE.DETECTOR_EVENT, { coachId: 'c-b' })
  const { events, total } = query({ coachId: 'c-a' })
  assert.equal(events.length, 2, 'filtered: 2 events for c-a')
  assert.equal(total, 3,        'total: all 3 events in store')
})

test('query() stats.byType counts correct per event type', () => {
  _clear()
  append(EVENT_TYPE.REQUEST)
  append(EVENT_TYPE.REQUEST)
  append(EVENT_TYPE.LEARN)
  const { stats } = query({})
  assert.equal(stats.byType[EVENT_TYPE.REQUEST], 2)
  assert.equal(stats.byType[EVENT_TYPE.LEARN],   1)
})

// ── query() — by date range ───────────────────────────────────────────────────

test('query() by dateFrom filters out events before that date', () => {
  _clear()
  const past   = new Date(Date.now() - 3_600_000).toISOString()  // 1h ago
  const future = new Date(Date.now() + 3_600_000).toISOString()  // 1h from now
  append(EVENT_TYPE.REQUEST, { metadata: { label: 'old' } })
  // Filter to future: no events should match
  const { events } = query({ dateFrom: future })
  assert.equal(events.length, 0, 'no events should be after future date')
})

test('query() by dateTo filters out events after that date', () => {
  _clear()
  const veryOldDate = '2000-01-01T00:00:00.000Z'
  append(EVENT_TYPE.REQUEST)
  const { events } = query({ dateTo: veryOldDate })
  assert.equal(events.length, 0, 'no events should be before year 2000')
})

// ── query() — by entity ───────────────────────────────────────────────────────

test('query() by entityId returns only events that contain that entity', () => {
  _clear()
  append(EVENT_TYPE.REQUEST,       { entities: ['player-A', 'player-B'] })
  append(EVENT_TYPE.LEARN,         { entities: ['player-C'] })
  append(EVENT_TYPE.COACH_OBSERVATION, { entities: ['player-A'] })
  const { events } = query({ entityId: 'player-A' })
  assert.equal(events.length, 2, 'must return both events containing player-A')
  assert.ok(events.every(e => e.entities.includes('player-A')))
})

test('query() by entityId returns empty when entity not in any event', () => {
  _clear()
  append(EVENT_TYPE.REQUEST, { entities: ['player-X'] })
  const { events } = query({ entityId: 'no-such-entity' })
  assert.equal(events.length, 0)
})

// ── query() — by recommendationId ─────────────────────────────────────────────

test('query() by recommendationId returns matching events only', () => {
  _clear()
  append(EVENT_TYPE.RECOMMENDATION_SHOWN,     { recommendationId: 'rec-AAA' })
  append(EVENT_TYPE.RECOMMENDATION_ACCEPTED,  { recommendationId: 'rec-AAA' })
  append(EVENT_TYPE.RECOMMENDATION_DISMISSED, { recommendationId: 'rec-BBB' })
  const { events } = query({ recommendationId: 'rec-AAA' })
  assert.equal(events.length, 2)
  assert.ok(events.every(e => e.recommendationId === 'rec-AAA'))
})

// ── query() — by sessionId ────────────────────────────────────────────────────

test('query() by sessionId returns events for that session only', () => {
  _clear()
  append(EVENT_TYPE.REQUEST, { sessionId: 'sess-X' })
  append(EVENT_TYPE.LEARN,   { sessionId: 'sess-X' })
  append(EVENT_TYPE.REQUEST, { sessionId: 'sess-Y' })
  const { events } = query({ sessionId: 'sess-X' })
  assert.equal(events.length, 2)
  assert.ok(events.every(e => e.sessionId === 'sess-X'))
})

// ── query() — by coachId ──────────────────────────────────────────────────────

test('query() by coachId returns events for that coach only', () => {
  _clear()
  append(EVENT_TYPE.REQUEST, { coachId: 'coach-Q' })
  append(EVENT_TYPE.LEARN,   { coachId: 'coach-Q' })
  append(EVENT_TYPE.REQUEST, { coachId: 'coach-R' })
  const { events } = query({ coachId: 'coach-Q' })
  assert.equal(events.length, 2)
  assert.ok(events.every(e => e.coachId === 'coach-Q'))
})

// ── query() — by clubId ───────────────────────────────────────────────────────

test('query() by clubId returns events for that club only', () => {
  _clear()
  append(EVENT_TYPE.REQUEST, { clubId: 'club-ALPHA' })
  append(EVENT_TYPE.LEARN,   { clubId: 'club-ALPHA' })
  append(EVENT_TYPE.REQUEST, { clubId: 'club-BETA' })
  const { events } = query({ clubId: 'club-ALPHA' })
  assert.equal(events.length, 2)
  assert.ok(events.every(e => e.clubId === 'club-ALPHA'))
})

// ── query() — by eventType ────────────────────────────────────────────────────

test('query() by single eventType returns only matching events', () => {
  _clear()
  append(EVENT_TYPE.REQUEST)
  append(EVENT_TYPE.LEARN)
  append(EVENT_TYPE.REQUEST)
  const { events } = query({ eventType: EVENT_TYPE.REQUEST })
  assert.equal(events.length, 2)
  assert.ok(events.every(e => e.eventType === EVENT_TYPE.REQUEST))
})

test('query() by eventTypes array returns events matching any of the types (OR)', () => {
  _clear()
  append(EVENT_TYPE.RECOMMENDATION_ACCEPTED)
  append(EVENT_TYPE.RECOMMENDATION_DISMISSED)
  append(EVENT_TYPE.RECOMMENDATION_SHOWN)
  append(EVENT_TYPE.REQUEST)
  const { events } = query({
    eventTypes: [EVENT_TYPE.RECOMMENDATION_ACCEPTED, EVENT_TYPE.RECOMMENDATION_DISMISSED],
  })
  assert.equal(events.length, 2)
  const types = new Set(events.map(e => e.eventType))
  assert.ok(types.has(EVENT_TYPE.RECOMMENDATION_ACCEPTED))
  assert.ok(types.has(EVENT_TYPE.RECOMMENDATION_DISMISSED))
})

// ── query() — limit ───────────────────────────────────────────────────────────

test('query() limit restricts the number of returned events', () => {
  _clear()
  for (let i = 0; i < 10; i++) append(EVENT_TYPE.REQUEST)
  const { events } = query({ limit: 3 })
  assert.equal(events.length, 3)
})

test('query() limit returns the most recent events', () => {
  _clear()
  for (let i = 0; i < 5; i++) {
    append(EVENT_TYPE.REQUEST, { metadata: { i } })
  }
  const { events } = query({ limit: 2 })
  // Most recent two — metadata.i = 4 and 3
  assert.equal(events[0].metadata.i, 4, 'first result must be the newest')
  assert.equal(events[1].metadata.i, 3)
})

test('query() with no filters returns all events (most recent first)', () => {
  _clear()
  append(EVENT_TYPE.REQUEST)
  append(EVENT_TYPE.LEARN)
  append(EVENT_TYPE.COACH_OBSERVATION)
  const { events, total } = query({})
  assert.equal(events.length, 3)
  assert.equal(total, 3)
})

test('query() combined filters work together (AND logic)', () => {
  _clear()
  append(EVENT_TYPE.RECOMMENDATION_ACCEPTED, { coachId: 'coach-Z', clubId: 'club-Z' })
  append(EVENT_TYPE.RECOMMENDATION_ACCEPTED, { coachId: 'coach-Z', clubId: 'club-W' })
  append(EVENT_TYPE.LEARN, { coachId: 'coach-Z', clubId: 'club-Z' })
  const { events } = query({
    coachId:   'coach-Z',
    clubId:    'club-Z',
    eventType: EVENT_TYPE.RECOMMENDATION_ACCEPTED,
  })
  assert.equal(events.length, 1)
  assert.equal(events[0].eventType, EVENT_TYPE.RECOMMENDATION_ACCEPTED)
  assert.equal(events[0].clubId,    'club-Z')
})

test('query(null) and query(undefined) never throw', () => {
  _clear()
  assert.doesNotThrow(() => query(null))
  assert.doesNotThrow(() => query(undefined))
  assert.doesNotThrow(() => query({}))
})

// ── _clear() ──────────────────────────────────────────────────────────────────

test('_clear() removes all events from the store', () => {
  _clear()
  append(EVENT_TYPE.REQUEST)
  append(EVENT_TYPE.LEARN)
  assert.equal(count(), 2)
  _clear()
  assert.equal(count(), 0)
  const { events, total } = query({})
  assert.equal(events.length, 0)
  assert.equal(total, 0)
})

// ── AI.request() → Brain timeline events ─────────────────────────────────────

test('AI.request() appends a REQUEST event to the Brain timeline', async () => {
  _clear()
  const sessionId = 'tl-req-sess-1'
  await AI.request({ coachId: 'tl-coach-1', clubId: 'tl-club-1', sessionId })
  const { events } = query({ eventType: EVENT_TYPE.REQUEST, sessionId })
  assert.equal(events.length, 1, 'one REQUEST event must be recorded')
  assert.equal(events[0].coachId, 'tl-coach-1')
  assert.equal(events[0].clubId,  'tl-club-1')
  assert.equal(events[0].sessionId, sessionId)
})

test('AI.request() REQUEST event metadata has recommendationCount', async () => {
  _clear()
  const sessionId = 'tl-req-sess-2'
  await AI.request({ sessionId })
  const { events } = query({ eventType: EVENT_TYPE.REQUEST, sessionId })
  assert.equal(events.length, 1)
  assert.ok(typeof events[0].metadata.recommendationCount === 'number',
    'metadata.recommendationCount must be a number')
})

test('AI.request() appends RECOMMENDATION_SHOWN for each recommendation', async () => {
  _clear()
  const sessionId = 'tl-req-sess-3'
  const response  = await AI.request({ sessionId })
  const recCount  = response.recommendations.length
  const { events } = query({ eventType: EVENT_TYPE.RECOMMENDATION_SHOWN, sessionId })
  assert.equal(events.length, recCount,
    `must record one RECOMMENDATION_SHOWN per recommendation (expected ${recCount})`)
})

test('AI.request() RECOMMENDATION_SHOWN events carry recommendationId', async () => {
  _clear()
  const sessionId  = 'tl-req-sess-4'
  const response   = await AI.request({ sessionId })
  const shownIds   = response.recommendations.map(r => r.id)
  const { events } = query({ eventType: EVENT_TYPE.RECOMMENDATION_SHOWN, sessionId })
  for (const ev of events) {
    assert.ok(typeof ev.recommendationId === 'string', 'recommendationId must be string')
    assert.ok(shownIds.includes(ev.recommendationId),  'id must match a recommendation in the response')
  }
})

test('AI.request() RECOMMENDATION_SHOWN metadata has category, priority, confidence', async () => {
  _clear()
  const sessionId = 'tl-req-sess-5'
  await AI.request({ sessionId })
  const { events } = query({ eventType: EVENT_TYPE.RECOMMENDATION_SHOWN, sessionId })
  assert.ok(events.length > 0, 'must have at least one RECOMMENDATION_SHOWN event')
  for (const ev of events) {
    assert.ok(typeof ev.metadata.category   === 'string', 'metadata.category must be string')
    assert.ok(typeof ev.metadata.priority   === 'string', 'metadata.priority must be string')
    assert.ok(typeof ev.metadata.confidence === 'number', 'metadata.confidence must be number')
  }
})

// ── AI.learn() → Brain timeline events ───────────────────────────────────────

test('AI.learn() with accepted records RECOMMENDATION_ACCEPTED event', async () => {
  _clear()
  const recId   = 'tl-rec-accept-1'
  const coachId = 'tl-learn-coach-1'
  await AI.learn({ recommendationId: recId, outcome: 'accepted', coachId,
    recommendationType: 'Training' })
  const { events } = query({ eventType: EVENT_TYPE.RECOMMENDATION_ACCEPTED, coachId })
  assert.equal(events.length, 1)
  assert.equal(events[0].recommendationId, recId)
})

test('AI.learn() with dismissed records RECOMMENDATION_DISMISSED event', async () => {
  _clear()
  const recId   = 'tl-rec-dismiss-1'
  const coachId = 'tl-learn-coach-2'
  await AI.learn({ recommendationId: recId, outcome: 'dismissed', coachId,
    recommendationType: 'Medical' })
  const { events } = query({ eventType: EVENT_TYPE.RECOMMENDATION_DISMISSED, coachId })
  assert.equal(events.length, 1)
  assert.equal(events[0].recommendationId, recId)
})

test('AI.learn() with snoozed records RECOMMENDATION_SNOOZED event', async () => {
  _clear()
  const recId   = 'tl-rec-snooze-1'
  const coachId = 'tl-learn-coach-3'
  await AI.learn({ recommendationId: recId, outcome: 'snoozed', coachId,
    recommendationType: 'Club' })
  const { events } = query({ eventType: EVENT_TYPE.RECOMMENDATION_SNOOZED, coachId })
  assert.equal(events.length, 1)
})

test('AI.learn() with actioned records RECOMMENDATION_ACTIONED event', async () => {
  _clear()
  const recId   = 'tl-rec-action-1'
  const coachId = 'tl-learn-coach-4'
  await AI.learn({ recommendationId: recId, outcome: 'actioned', coachId,
    recommendationType: 'Selection' })
  const { events } = query({ eventType: EVENT_TYPE.RECOMMENDATION_ACTIONED, coachId })
  assert.equal(events.length, 1)
})

test('AI.learn() with rejected maps to RECOMMENDATION_DISMISSED', async () => {
  _clear()
  const coachId = 'tl-learn-coach-5'
  await AI.learn({ recommendationId: 'tl-rej-1', outcome: 'rejected', coachId,
    recommendationType: 'Training' })
  const { events } = query({ eventType: EVENT_TYPE.RECOMMENDATION_DISMISSED, coachId })
  assert.equal(events.length, 1)
})

test('AI.learn() LEARN event carries outcome in metadata', async () => {
  _clear()
  const coachId = 'tl-learn-coach-6'
  await AI.learn({ recommendationId: 'tl-meta-1', outcome: 'accepted', coachId,
    recommendationType: 'Training' })
  const { events } = query({ coachId, eventType: EVENT_TYPE.RECOMMENDATION_ACCEPTED })
  assert.equal(events.length, 1)
  assert.ok(typeof events[0].metadata.outcome === 'string', 'metadata.outcome must be string')
})

test('AI.learn() event carries clubId when provided', async () => {
  _clear()
  const coachId = 'tl-coach-club-1'
  const clubId  = 'tl-club-learn-1'
  await AI.learn({ recommendationId: 'tl-club-rec', outcome: 'accepted',
    coachId, clubId, recommendationType: 'Training' })
  const { events } = query({ coachId })
  assert.equal(events.length, 1)
  assert.equal(events[0].clubId, clubId)
})

// ── AI.recordObservation() ────────────────────────────────────────────────────

test('AI.recordObservation() is a function on the AI namespace', () => {
  assert.equal(typeof AI.recordObservation, 'function')
})

test('AI.recordObservation() appends a COACH_OBSERVATION event', async () => {
  _clear()
  const coachId = 'obs-coach-1'
  const clubId  = 'obs-club-1'
  await AI.recordObservation({
    coachId, clubId,
    entities: ['player-P', 'player-Q'],
    metadata: { note: 'Good footwork drill today', severity: 'low' },
  })
  const { events } = query({ eventType: EVENT_TYPE.COACH_OBSERVATION, coachId })
  assert.equal(events.length, 1)
  assert.equal(events[0].clubId, clubId)
  assert.ok(events[0].entities.includes('player-P'))
  assert.ok(events[0].entities.includes('player-Q'))
  assert.equal(events[0].metadata.note, 'Good footwork drill today')
})

test('AI.recordObservation() returns the created event', async () => {
  _clear()
  const ev = await AI.recordObservation({ coachId: 'obs-ret-coach', metadata: { x: 1 } })
  assert.ok(ev !== null, 'must return event')
  assert.equal(ev.eventType, EVENT_TYPE.COACH_OBSERVATION)
  assert.equal(typeof ev.id, 'string')
})

test('AI.recordObservation() never rejects', async () => {
  await assert.doesNotReject(AI.recordObservation({}))
  await assert.doesNotReject(AI.recordObservation(null))
  await assert.doesNotReject(AI.recordObservation())
})

test('AI.recordObservation() with sessionId records it correctly', async () => {
  _clear()
  const sessionId = 'obs-sess-1'
  await AI.recordObservation({ sessionId, coachId: 'obs-sess-coach', metadata: {} })
  const { events } = query({ sessionId })
  assert.equal(events.length, 1)
  assert.equal(events[0].eventType, EVENT_TYPE.COACH_OBSERVATION)
})

// ── AI.timeline() — Brain timeline integration ────────────────────────────────

test('AI.timeline() returns Brain timeline events with { events, total, stats }', async () => {
  _clear()
  append(EVENT_TYPE.REQUEST, { coachId: 'tl-api-coach' })
  const result = await AI.timeline({})
  assert.ok(Array.isArray(result.events),       'events must be array')
  assert.ok(typeof result.total === 'number',   'total must be number')
  assert.ok(typeof result.stats === 'object',   'stats must be object')
  assert.ok(result.events.length > 0, 'must return the appended event')
})

test('AI.timeline() events are typed TimelineEvents from the Brain store', async () => {
  _clear()
  const coachId = 'tl-typed-coach'
  append(EVENT_TYPE.REQUEST, { coachId })
  const { events } = await AI.timeline({ coachId })
  assert.equal(events.length, 1)
  assert.equal(events[0].coachId, coachId)
  assert.equal(events[0].eventType, EVENT_TYPE.REQUEST)
  assert.ok(typeof events[0].timestamp === 'string')
})

test('AI.timeline() filter by coachId returns only that coach events', async () => {
  _clear()
  append(EVENT_TYPE.REQUEST, { coachId: 'tl-filter-A' })
  append(EVENT_TYPE.REQUEST, { coachId: 'tl-filter-B' })
  const { events } = await AI.timeline({ coachId: 'tl-filter-A' })
  assert.equal(events.length, 1)
  assert.equal(events[0].coachId, 'tl-filter-A')
})

test('AI.timeline() filter by clubId returns only that club events', async () => {
  _clear()
  append(EVENT_TYPE.REQUEST, { clubId: 'tl-club-filter-1' })
  append(EVENT_TYPE.LEARN,   { clubId: 'tl-club-filter-2' })
  const { events } = await AI.timeline({ clubId: 'tl-club-filter-1' })
  assert.equal(events.length, 1)
  assert.equal(events[0].clubId, 'tl-club-filter-1')
})

test('AI.timeline({ limit: 5 }) returns at most 5 events', async () => {
  _clear()
  for (let i = 0; i < 10; i++) append(EVENT_TYPE.REQUEST)
  const { events } = await AI.timeline({ limit: 5 })
  assert.ok(events.length <= 5)
})

test('AI.timeline() never rejects', async () => {
  await assert.doesNotReject(AI.timeline({}))
  await assert.doesNotReject(AI.timeline(null))
  await assert.doesNotReject(AI.timeline(undefined))
})

test('AI.timeline() stats.byType counts event types correctly', async () => {
  _clear()
  append(EVENT_TYPE.REQUEST)
  append(EVENT_TYPE.REQUEST)
  append(EVENT_TYPE.LEARN)
  const { stats } = await AI.timeline({})
  assert.equal(stats.byType[EVENT_TYPE.REQUEST], 2)
  assert.equal(stats.byType[EVENT_TYPE.LEARN],   1)
})

// ── Full end-to-end: request → learn → query ──────────────────────────────────

test('End-to-end: AI.request() + AI.learn() events visible via AI.timeline()', async () => {
  _clear()
  const sessionId = 'e2e-sess-tl'
  const coachId   = 'e2e-coach-tl'
  const clubId    = 'e2e-club-tl'

  // Step 1: make a request
  const response = await AI.request({ coachId, clubId, sessionId })
  const recId    = response.recommendations[0]?.id

  // Step 2: record an outcome
  if (recId) {
    await AI.learn({
      recommendationId:   recId,
      outcome:            'accepted',
      recommendationType: response.recommendations[0]?.category,
      coachId,
      clubId,
      sessionId,
    })
  }

  // Step 3: query by session
  const { events } = await AI.timeline({ sessionId })
  const types = events.map(e => e.eventType)

  assert.ok(types.includes(EVENT_TYPE.REQUEST), 'REQUEST event must be in timeline')
  assert.ok(types.includes(EVENT_TYPE.RECOMMENDATION_SHOWN), 'RECOMMENDATION_SHOWN must be in timeline')
  if (recId) {
    assert.ok(types.includes(EVENT_TYPE.RECOMMENDATION_ACCEPTED), 'RECOMMENDATION_ACCEPTED must be in timeline')
  }
})

test('End-to-end: query by recommendationId traces a recommendation lifecycle', async () => {
  _clear()
  const coachId = 'lifecycle-coach'
  const clubId  = 'lifecycle-club'

  const response = await AI.request({ coachId, clubId })
  const recId    = response.recommendations[0]?.id
  if (!recId) return  // skip if no recs (edge case)

  await AI.learn({
    recommendationId:   recId,
    outcome:            'dismissed',
    recommendationType: response.recommendations[0]?.category ?? 'Training',
    coachId,
    clubId,
  })

  const { events } = await AI.timeline({ recommendationId: recId })
  const types = events.map(e => e.eventType)
  assert.ok(types.includes(EVENT_TYPE.RECOMMENDATION_SHOWN),     'must show SHOWN event')
  assert.ok(types.includes(EVENT_TYPE.RECOMMENDATION_DISMISSED), 'must show DISMISSED event')
})

// ── Regression: M1–M5 contracts ───────────────────────────────────────────────

test('AI.request() still returns valid BrainResponse after M6', async () => {
  const result = await AI.request({})
  assert.ok(Array.isArray(result.recommendations))
  assert.ok('isMock' in result.meta)
  assert.ok(result.trace.modules.includes('calibration'))
})

test('AI.learn() still resolves after M6', async () => {
  await assert.doesNotReject(AI.learn({
    recommendationId: 'r-m6-reg', outcome: 'accepted',
    recommendationType: 'Training',
  }))
})

test('AI.ask() unaffected by M6', async () => {
  const r = await AI.ask({ question: 'Who needs recovery time?' })
  assert.equal(typeof r.answer, 'string')
})

test('AI.assembleContext() unaffected by M6', async () => {
  const b = await AI.assembleContext({})
  assert.ok(typeof b.platform === 'object')
})

test('AI.reason() unaffected by M6', async () => {
  const rb = await AI.reason({})
  assert.ok(Array.isArray(rb.recommendations))
})

test('AI.getCalibrationHistory() unaffected by M6', async () => {
  const h = await AI.getCalibrationHistory('ghost', 'ghost', 'Training')
  assert.ok(h === null || typeof h === 'object')
})

test('AI.updateTimeline() still delegates to intelligence-timeline — unaffected', async () => {
  await assert.doesNotReject(AI.updateTimeline('non-existent-id', 'completed', null))
})

test('AI.appendTimeline() still delegates to intelligence-timeline — unaffected', async () => {
  await assert.doesNotReject(AI.appendTimeline([], {}, 'test-engine'))
})
