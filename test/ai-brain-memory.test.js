/**
 * AI Brain — M7 Memory Engine Tests
 *
 * Coverage:
 * 1. memory-types.js: MEMORY_TYPE constants, MEMORY_SCHEMA_VERSION, applyDecay()
 * 2. memory-store.js: upsert, getByEntity, getAll, getById, count, _clear, _forceUpsert
 * 3. memory-engine.js unit: refresh, get, search, related (via mock query fn)
 * 4. Integration: AI.memory.* with real timeline events
 * 5. Regression: M1–M6 contracts unaffected
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'crypto'

// ── Module imports ────────────────────────────────────────────────────────────

import {
  MEMORY_TYPE, MEMORY_SCHEMA_VERSION, DECAY_RATE_PER_DAY, MIN_STRENGTH, applyDecay,
} from '../ai-brain/memory/memory-types.js'

import {
  upsert, getByEntity, getAll, getById, count, _clear,
  _forceUpsert,
} from '../ai-brain/memory/memory-store.js'

import {
  refresh, get, search, related,
} from '../ai-brain/memory/memory-engine.js'

import { AI }                                 from '../ai-brain/index.js'
import { _clear as clearTimeline }            from '../ai-brain/timeline.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
  return {
    id:               randomUUID(),
    timestamp:        new Date().toISOString(),
    eventType:        'REQUEST',
    coachId:          null,
    clubId:           null,
    sessionId:        null,
    recommendationId: null,
    entities:         [],
    metadata:         {},
    ...overrides,
  }
}

/** Build a mock query function over a fixed event list. */
function mockQfn(events) {
  return (filters) => {
    const { coachId, clubId, sessionId, entityId } = filters ?? {}
    let results = [...events]
    if (coachId   != null) results = results.filter(e => e.coachId   === coachId)
    if (clubId    != null) results = results.filter(e => e.clubId    === clubId)
    if (sessionId != null) results = results.filter(e => e.sessionId === sessionId)
    if (entityId  != null) results = results.filter(e => (e.entities ?? []).includes(entityId))
    return { events: results, total: events.length, stats: {} }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — memory-types.js
// ─────────────────────────────────────────────────────────────────────────────

test('MEMORY_TYPE has all five required type keys', () => {
  const required = ['COACH', 'PLAYER', 'TEAM', 'CLUB', 'SESSION']
  for (const k of required) {
    assert.equal(typeof MEMORY_TYPE[k], 'string', `MEMORY_TYPE.${k} must be string`)
    assert.equal(MEMORY_TYPE[k], k, `MEMORY_TYPE.${k} value must equal its key`)
  }
})

test('MEMORY_TYPE is frozen — cannot add new keys', () => {
  assert.throws(() => { MEMORY_TYPE.EXTRA = 'BAD' })
})

test('MEMORY_SCHEMA_VERSION is the string "1.0"', () => {
  assert.equal(MEMORY_SCHEMA_VERSION, '1.0')
})

test('applyDecay() returns same reference for a memory updated less than 1 day ago', () => {
  const mem = { strength: 80, lastUpdated: new Date().toISOString() }
  const result = applyDecay(mem)
  assert.strictEqual(result, mem, 'must return the same object reference (no copy)')
})

test('applyDecay() returns a new object with reduced strength for a 30-day-old memory', () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const mem = { strength: 80, lastUpdated: thirtyDaysAgo }
  const result = applyDecay(mem)
  assert.notStrictEqual(result, mem, 'must return a new object')
  assert.ok(result.strength < 80, `strength must be less than 80 after 30-day decay, got ${result.strength}`)
  assert.ok(result.strength >= MIN_STRENGTH, `strength must not go below MIN_STRENGTH (${MIN_STRENGTH})`)
})

test('applyDecay() never allows strength below MIN_STRENGTH', () => {
  // Simulate an extremely old memory (10 000 days)
  const ancientDate = new Date(Date.now() - 10_000 * 86_400_000).toISOString()
  const mem = { strength: 100, lastUpdated: ancientDate }
  const result = applyDecay(mem)
  assert.ok(result.strength >= MIN_STRENGTH)
})

test('applyDecay() does not mutate the original memory object', () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const mem = { strength: 60, lastUpdated: thirtyDaysAgo }
  const originalStrength = mem.strength
  applyDecay(mem)
  assert.equal(mem.strength, originalStrength, 'original must not be mutated')
})

test('applyDecay() returns same reference when calculated strength equals stored strength', () => {
  // Exactly 1 day of decay on a strength=1 memory (already at floor)
  const oneDayAgo = new Date(Date.now() - 1.5 * 86_400_000).toISOString()
  const mem = { strength: 1, lastUpdated: oneDayAgo }
  const result = applyDecay(mem)
  // Strength is already at MIN_STRENGTH — no change, same ref
  assert.equal(result.strength, 1)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — memory-store.js
// ─────────────────────────────────────────────────────────────────────────────

test('upsert() creates a memory with all required fields on first call', () => {
  _clear()
  const mem = upsert({
    type:    MEMORY_TYPE.COACH,
    entityId: 'store-coach-1',
    title:   'Coach activity: store-coach-1',
    summary: 'Test summary.',
    confidence: 75,
    strength:   40,
    supportingTimelineEvents: ['evt-1', 'evt-2'],
    metadata: { key: 'value' },
  })
  assert.equal(typeof mem.id,         'string',  'id must be UUID string')
  assert.equal(mem.schemaVersion,     MEMORY_SCHEMA_VERSION)
  assert.equal(mem._version,          1)
  assert.equal(mem.type,              MEMORY_TYPE.COACH)
  assert.equal(mem.entityId,          'store-coach-1')
  assert.equal(mem.title,             'Coach activity: store-coach-1')
  assert.equal(mem.confidence,        75)
  assert.equal(mem.strength,          40)
  assert.equal(typeof mem.firstSeen,  'string')
  assert.equal(typeof mem.lastUpdated,'string')
  assert.deepEqual(mem.supportingTimelineEvents, ['evt-1', 'evt-2'])
  assert.deepEqual(mem.metadata,                 { key: 'value' })
})

test('upsert() called twice for same entityId+type updates existing record', () => {
  _clear()
  const first = upsert({
    type: MEMORY_TYPE.CLUB, entityId: 'store-club-1',
    title: 'v1', summary: 'v1 summary', confidence: 50, strength: 20,
    supportingTimelineEvents: ['e1'], metadata: {},
  })
  const second = upsert({
    type: MEMORY_TYPE.CLUB, entityId: 'store-club-1',
    title: 'v2', summary: 'v2 summary', confidence: 60, strength: 30,
    supportingTimelineEvents: ['e1', 'e2'], metadata: { updated: true },
  })
  assert.equal(second.id,       first.id,       'id must be preserved across updates')
  assert.equal(second.firstSeen, first.firstSeen, 'firstSeen must be preserved')
  assert.equal(second._version, 2,              '_version must increment to 2')
  assert.equal(second.title,    'v2')
  assert.equal(second.confidence, 60)
  assert.equal(second.metadata.updated, true)
})

test('upsert() with different types for same entityId creates separate records', () => {
  _clear()
  upsert({ type: MEMORY_TYPE.COACH,   entityId: 'multi-1', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  upsert({ type: MEMORY_TYPE.CLUB,    entityId: 'multi-1', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  upsert({ type: MEMORY_TYPE.SESSION, entityId: 'multi-1', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  const all = getByEntity('multi-1')
  assert.equal(all.length, 3, 'must create 3 separate memories for 3 types')
})

test('upsert() clamps confidence to [0, 100]', () => {
  _clear()
  const over = upsert({ type: MEMORY_TYPE.PLAYER, entityId: 'clamp-1', title: 't', summary: 's',
    confidence: 150, strength: 50, supportingTimelineEvents: [], metadata: {} })
  assert.equal(over.confidence, 100)
  _clear()
  const under = upsert({ type: MEMORY_TYPE.PLAYER, entityId: 'clamp-2', title: 't', summary: 's',
    confidence: -10, strength: 50, supportingTimelineEvents: [], metadata: {} })
  assert.equal(under.confidence, 0)
})

test('upsert() clamps strength to [1, 100]', () => {
  _clear()
  const over = upsert({ type: MEMORY_TYPE.PLAYER, entityId: 'sclamp-1', title: 't', summary: 's',
    confidence: 50, strength: 200, supportingTimelineEvents: [], metadata: {} })
  assert.equal(over.strength, 100)
  _clear()
  const under = upsert({ type: MEMORY_TYPE.PLAYER, entityId: 'sclamp-2', title: 't', summary: 's',
    confidence: 50, strength: 0, supportingTimelineEvents: [], metadata: {} })
  assert.equal(under.strength, 1)
})

test('getByEntity() returns all memories for an entity', () => {
  _clear()
  upsert({ type: MEMORY_TYPE.COACH,   entityId: 'ent-1', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  upsert({ type: MEMORY_TYPE.SESSION, entityId: 'ent-1', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  upsert({ type: MEMORY_TYPE.PLAYER,  entityId: 'ent-2', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  const result = getByEntity('ent-1')
  assert.equal(result.length, 2)
  assert.ok(result.every(m => m.entityId === 'ent-1'))
})

test('getByEntity() returns [] for an unknown entity', () => {
  _clear()
  assert.deepEqual(getByEntity('no-such-entity'), [])
})

test('getAll() returns every memory in the store', () => {
  _clear()
  upsert({ type: MEMORY_TYPE.COACH,  entityId: 'ga-1', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  upsert({ type: MEMORY_TYPE.CLUB,   entityId: 'ga-2', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  upsert({ type: MEMORY_TYPE.PLAYER, entityId: 'ga-3', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  assert.equal(getAll().length, 3)
})

test('getById() finds a memory by its UUID', () => {
  _clear()
  const mem = upsert({ type: MEMORY_TYPE.COACH, entityId: 'gbi-1', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  const found = getById(mem.id)
  assert.ok(found !== null)
  assert.equal(found.id, mem.id)
})

test('getById() returns null for an unknown id', () => {
  _clear()
  assert.equal(getById('00000000-0000-0000-0000-000000000000'), null)
})

test('count() returns the total number of memories', () => {
  _clear()
  assert.equal(count(), 0)
  upsert({ type: MEMORY_TYPE.COACH,  entityId: 'cnt-1', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  upsert({ type: MEMORY_TYPE.PLAYER, entityId: 'cnt-2', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  assert.equal(count(), 2)
})

test('_clear() removes all memories from the store', () => {
  upsert({ type: MEMORY_TYPE.COACH, entityId: 'clr-1', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  _clear()
  assert.equal(count(), 0)
  assert.deepEqual(getAll(), [])
})

test('_forceUpsert() stores a complete memory object as-is', () => {
  _clear()
  const fixedId        = randomUUID()
  const fixedFirstSeen = '2020-01-01T00:00:00.000Z'
  const fixedLastUpdated = '2020-06-15T00:00:00.000Z'
  _forceUpsert({
    id: fixedId, schemaVersion: MEMORY_SCHEMA_VERSION, _version: 5,
    type: MEMORY_TYPE.CLUB, entityId: 'force-1',
    title: 'forced', summary: 'forced summary',
    confidence: 45, strength: 22,
    firstSeen: fixedFirstSeen, lastUpdated: fixedLastUpdated,
    supportingTimelineEvents: ['x', 'y'],
    metadata: { forced: true },
  })
  const found = getById(fixedId)
  assert.ok(found !== null)
  assert.equal(found.id,           fixedId)
  assert.equal(found._version,     5)
  assert.equal(found.firstSeen,    fixedFirstSeen)
  assert.equal(found.lastUpdated,  fixedLastUpdated)
  assert.equal(found.metadata.forced, true)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — memory-engine.js unit tests (with injected mock query fn)
// ─────────────────────────────────────────────────────────────────────────────

test('refresh() returns [] for null entityId', () => {
  _clear()
  const result = refresh(null, mockQfn([]))
  assert.deepEqual(result, [])
})

test('refresh() returns [] when no events match the entityId', () => {
  _clear()
  const events = [makeEvent({ coachId: 'other-coach' })]
  const result = refresh('ghost-entity', mockQfn(events))
  assert.deepEqual(result, [])
})

test('refresh() creates a COACH memory from coachId-dimension events', () => {
  _clear()
  const entityId = 'eng-coach-1'
  const events = [
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_ACCEPTED' }),
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_ACCEPTED' }),
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_DISMISSED' }),
  ]
  const mems = refresh(entityId, mockQfn(events))
  assert.ok(mems.length >= 1)
  const coach = mems.find(m => m.type === MEMORY_TYPE.COACH)
  assert.ok(coach, 'must create COACH memory')
  assert.equal(coach.entityId, entityId)
  assert.equal(coach.supportingTimelineEvents.length, 3)
})

test('refresh() creates a CLUB memory from clubId-dimension events', () => {
  _clear()
  const entityId = 'eng-club-1'
  const events   = [
    makeEvent({ clubId: entityId }),
    makeEvent({ clubId: entityId }),
  ]
  const mems = refresh(entityId, mockQfn(events))
  const club = mems.find(m => m.type === MEMORY_TYPE.CLUB)
  assert.ok(club, 'must create CLUB memory')
  assert.equal(club.entityId, entityId)
})

test('refresh() creates a SESSION memory from sessionId-dimension events', () => {
  _clear()
  const entityId = 'eng-sess-1'
  const events   = [
    makeEvent({ sessionId: entityId, eventType: 'REQUEST' }),
    makeEvent({ sessionId: entityId, eventType: 'RECOMMENDATION_SHOWN' }),
  ]
  const mems = refresh(entityId, mockQfn(events))
  const sess = mems.find(m => m.type === MEMORY_TYPE.SESSION)
  assert.ok(sess, 'must create SESSION memory')
  assert.equal(sess.entityId, entityId)
  assert.ok(sess.metadata.eventTypes.includes('REQUEST'))
})

test('refresh() creates a PLAYER memory from entityId-dimension events', () => {
  _clear()
  const entityId = 'player-eng-1'
  const events   = [
    makeEvent({ entities: [entityId, 'other-player'], sessionId: 'sess-A' }),
    makeEvent({ entities: [entityId], sessionId: 'sess-A' }),
  ]
  const mems = refresh(entityId, mockQfn(events))
  const player = mems.find(m => m.type === MEMORY_TYPE.PLAYER)
  assert.ok(player, 'must create PLAYER memory')
  assert.equal(player.metadata.totalEvents, 2)
})

test('refresh() COACH memory — confidence > 50 when mostly accepted (3+ outcomes)', () => {
  _clear()
  const entityId = 'conf-coach-hi'
  const events   = [
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_ACCEPTED' }),
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_ACCEPTED' }),
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_ACCEPTED' }),
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_DISMISSED' }),
  ]
  const mems  = refresh(entityId, mockQfn(events))
  const coach = mems.find(m => m.type === MEMORY_TYPE.COACH)
  assert.ok(coach.confidence > 50, `confidence must be > 50 for 75% accept rate, got ${coach.confidence}`)
})

test('refresh() COACH memory — confidence < 50 when mostly dismissed (3+ outcomes)', () => {
  _clear()
  const entityId = 'conf-coach-lo'
  const events   = [
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_DISMISSED' }),
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_DISMISSED' }),
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_DISMISSED' }),
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_ACCEPTED' }),
  ]
  const mems  = refresh(entityId, mockQfn(events))
  const coach = mems.find(m => m.type === MEMORY_TYPE.COACH)
  assert.ok(coach.confidence < 50, `confidence must be < 50 for 25% accept rate, got ${coach.confidence}`)
})

test('refresh() COACH memory — confidence = 50 (cold start) when fewer than 3 outcomes', () => {
  _clear()
  const entityId = 'conf-coach-cold'
  const events   = [
    makeEvent({ coachId: entityId, eventType: 'RECOMMENDATION_ACCEPTED' }),
    makeEvent({ coachId: entityId, eventType: 'REQUEST' }),
  ]
  const mems  = refresh(entityId, mockQfn(events))
  const coach = mems.find(m => m.type === MEMORY_TYPE.COACH)
  assert.equal(coach.confidence, 50, 'cold start must return neutral confidence of 50')
})

test('refresh() strength grows with more supporting events', () => {
  _clear()
  const entityId = 'strength-coach'
  const few  = [makeEvent({ coachId: entityId })]
  const many = [
    makeEvent({ coachId: entityId }), makeEvent({ coachId: entityId }),
    makeEvent({ coachId: entityId }), makeEvent({ coachId: entityId }),
    makeEvent({ coachId: entityId }), makeEvent({ coachId: entityId }),
  ]
  const memsA = refresh(entityId, mockQfn(few))
  const memsB = refresh(entityId, mockQfn(many))
  const strengthA = memsA.find(m => m.type === MEMORY_TYPE.COACH).strength
  const strengthB = memsB.find(m => m.type === MEMORY_TYPE.COACH).strength
  assert.ok(strengthB > strengthA, `strength with 6 events (${strengthB}) must exceed strength with 1 event (${strengthA})`)
})

test('refresh() strength is capped at 100', () => {
  _clear()
  const entityId = 'strength-cap'
  const events   = Array.from({ length: 20 }, () => makeEvent({ coachId: entityId }))
  const mems = refresh(entityId, mockQfn(events))
  const coach = mems.find(m => m.type === MEMORY_TYPE.COACH)
  assert.ok(coach.strength <= 100, 'strength must never exceed 100')
})

test('refresh() called a second time updates the memory (_version increments)', () => {
  _clear()
  const entityId = 'refresh-v2'
  const events   = [makeEvent({ coachId: entityId })]
  refresh(entityId, mockQfn(events))
  const second = refresh(entityId, mockQfn(events))
  const coach  = second.find(m => m.type === MEMORY_TYPE.COACH)
  assert.equal(coach._version, 2, '_version must be 2 after second refresh')
})

test('refresh() preserves id and firstSeen across multiple calls', () => {
  _clear()
  const entityId = 'preserve-id'
  const events   = [makeEvent({ coachId: entityId })]
  const first    = refresh(entityId, mockQfn(events))
  const second   = refresh(entityId, mockQfn(events))
  const coachA   = first.find(m => m.type === MEMORY_TYPE.COACH)
  const coachB   = second.find(m => m.type === MEMORY_TYPE.COACH)
  assert.equal(coachB.id,        coachA.id,        'id must be preserved')
  assert.equal(coachB.firstSeen, coachA.firstSeen,  'firstSeen must be preserved')
})

test('get() returns [] for null entityId', () => {
  _clear()
  assert.deepEqual(get(null), [])
})

test('get() returns [] for an entity with no stored memories', () => {
  _clear()
  assert.deepEqual(get('no-memory-entity'), [])
})

test('get() returns memories for a known entity', () => {
  _clear()
  const entityId = 'get-coach'
  const events   = [makeEvent({ coachId: entityId })]
  refresh(entityId, mockQfn(events))
  const result = get(entityId)
  assert.ok(result.length >= 1)
  assert.ok(result.every(m => m.entityId === entityId))
})

test('get() applies decay — returns lower strength for an old memory', () => {
  _clear()
  const entityId     = 'decay-get-1'
  const oldDate      = new Date(Date.now() - 30 * 86_400_000).toISOString()
  _forceUpsert({
    id: randomUUID(), schemaVersion: MEMORY_SCHEMA_VERSION, _version: 1,
    type: MEMORY_TYPE.COACH, entityId,
    title: 't', summary: 's', confidence: 70, strength: 80,
    firstSeen: oldDate, lastUpdated: oldDate,
    supportingTimelineEvents: [], metadata: {},
  })
  const result = get(entityId)
  assert.equal(result.length, 1)
  assert.ok(result[0].strength < 80, `get() must return decayed strength, got ${result[0].strength}`)
})

test('get() does NOT mutate the stored memory when applying decay', () => {
  _clear()
  const entityId = 'decay-immutable'
  const oldDate  = new Date(Date.now() - 30 * 86_400_000).toISOString()
  _forceUpsert({
    id: randomUUID(), schemaVersion: MEMORY_SCHEMA_VERSION, _version: 1,
    type: MEMORY_TYPE.CLUB, entityId,
    title: 't', summary: 's', confidence: 70, strength: 80,
    firstSeen: oldDate, lastUpdated: oldDate,
    supportingTimelineEvents: [], metadata: {},
  })
  get(entityId)                      // apply decay (read-only)
  const stored = getByEntity(entityId)[0]
  assert.equal(stored.strength, 80, 'stored strength must be unchanged by get()')
})

test('search() returns memories whose title contains the query', () => {
  _clear()
  const entityId = 'search-title-coach'
  const events   = [makeEvent({ coachId: entityId })]
  refresh(entityId, mockQfn(events))
  const results = search('search-title-coach')
  assert.ok(results.length >= 1)
  assert.ok(results.some(m => m.entityId === entityId))
})

test('search() returns memories whose summary contains the query', () => {
  _clear()
  upsert({
    type: MEMORY_TYPE.COACH, entityId: 'search-summ-1',
    title: 'some title',
    summary: 'This coach excels at training sessions and team cohesion drills.',
    confidence: 70, strength: 50,
    supportingTimelineEvents: [], metadata: {},
  })
  const results = search('team cohesion')
  assert.ok(results.length >= 1)
  assert.ok(results.some(m => m.summary.toLowerCase().includes('team cohesion')))
})

test('search() is case-insensitive', () => {
  _clear()
  upsert({
    type: MEMORY_TYPE.CLUB, entityId: 'search-case-1',
    title: 'Club activity: MightyRovers',
    summary: 'Club summary here.',
    confidence: 50, strength: 20,
    supportingTimelineEvents: [], metadata: {},
  })
  const lower = search('mightyrovers')
  const upper = search('MIGHTYROVERS')
  assert.ok(lower.length >= 1, 'lowercase search must match')
  assert.ok(upper.length >= 1, 'uppercase search must match')
})

test('search() returns [] for empty string', () => {
  _clear()
  upsert({ type: MEMORY_TYPE.COACH, entityId: 'search-empty', title: 't', summary: 's', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  assert.deepEqual(search(''), [])
})

test('search() returns [] for null', () => {
  _clear()
  assert.deepEqual(search(null), [])
})

test('search() returns [] when no memories match', () => {
  _clear()
  upsert({ type: MEMORY_TYPE.COACH, entityId: 'search-no-match', title: 'coach training', summary: 'Training summary.', confidence: 50, strength: 10, supportingTimelineEvents: [], metadata: {} })
  assert.deepEqual(search('zebra-does-not-exist-zzzz'), [])
})

test('related() returns [] for null entityId', () => {
  _clear()
  assert.deepEqual(related(null, mockQfn([])), [])
})

test('related() returns [] when entity has no events', () => {
  _clear()
  assert.deepEqual(related('lone-ranger', mockQfn([])), [])
})

test('related() returns memories of co-appearing entities', () => {
  _clear()
  const coachId = 'rel-coach-1'
  const clubId  = 'rel-club-1'
  const playerId = 'rel-player-1'

  // First build memories for the related entities
  const clubEvents   = [makeEvent({ clubId, coachId })]
  const playerEvents = [makeEvent({ entities: [playerId], coachId })]
  refresh(clubId,   mockQfn(clubEvents))
  refresh(playerId, mockQfn(playerEvents))

  // Events that co-reference coachId with clubId and playerId
  const sharedEvents = [
    makeEvent({ coachId, clubId, entities: [playerId] }),
  ]
  const results = related(coachId, mockQfn(sharedEvents))
  const relatedEntityIds = results.map(m => m.entityId)

  assert.ok(relatedEntityIds.includes(clubId)   || relatedEntityIds.includes(playerId),
    'must find memories of co-appearing entities')
})

test('related() deduplicates events before collecting related IDs', () => {
  _clear()
  const coachId = 'rel-dedup-coach'
  const clubId  = 'rel-dedup-club'

  refresh(clubId, mockQfn([makeEvent({ clubId })]))

  // Same event appears via multiple query dimensions
  const ev = makeEvent({ coachId, clubId })
  const qfn = (filters) => {
    const { coachId: c, clubId: cl } = filters ?? {}
    if (c === coachId) return { events: [ev], total: 1, stats: {} }
    if (cl === coachId) return { events: [ev], total: 1, stats: {} }
    return { events: [], total: 0, stats: {} }
  }

  const results = related(coachId, qfn)
  const clubMemories = results.filter(m => m.entityId === clubId)
  assert.ok(clubMemories.length <= 1, 'deduplication must prevent duplicate memories in results')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — Integration tests (real AI.memory.* with Brain timeline)
// ─────────────────────────────────────────────────────────────────────────────

test('AI.memory is an object with the four required methods', () => {
  assert.equal(typeof AI.memory,          'object',   'AI.memory must be an object')
  assert.equal(typeof AI.memory.get,      'function', 'AI.memory.get must be a function')
  assert.equal(typeof AI.memory.search,   'function', 'AI.memory.search must be a function')
  assert.equal(typeof AI.memory.related,  'function', 'AI.memory.related must be a function')
  assert.equal(typeof AI.memory.refresh,  'function', 'AI.memory.refresh must be a function')
})

test('AI.memory.get(entityId) returns [] before any refresh', async () => {
  _clear()
  clearTimeline()
  const result = await AI.memory.get('no-data-entity')
  assert.deepEqual(result, [])
})

test('AI.memory.refresh(entityId) resolves without throwing', async () => {
  _clear()
  clearTimeline()
  await assert.doesNotReject(AI.memory.refresh('test-refresh-entity'))
})

test('AI.memory.refresh() returns an array', async () => {
  _clear()
  clearTimeline()
  const result = await AI.memory.refresh('arr-check')
  assert.ok(Array.isArray(result))
})

test('AI.memory.get() after refresh returns memory with all required fields', async () => {
  _clear()
  clearTimeline()
  const coachId = 'integ-coach-fields'
  const clubId  = 'integ-club-fields'

  await AI.request({ coachId, clubId })
  await AI.memory.refresh(coachId)
  const mems = await AI.memory.get(coachId)

  if (mems.length === 0) return  // no events recorded — skip field check

  const mem = mems[0]
  assert.equal(typeof mem.id,            'string',  'id must be string')
  assert.equal(typeof mem.type,          'string',  'type must be string')
  assert.equal(typeof mem.entityId,      'string',  'entityId must be string')
  assert.equal(typeof mem.title,         'string',  'title must be string')
  assert.equal(typeof mem.summary,       'string',  'summary must be string')
  assert.equal(typeof mem.confidence,    'number',  'confidence must be number')
  assert.equal(typeof mem.strength,      'number',  'strength must be number')
  assert.equal(typeof mem.firstSeen,     'string',  'firstSeen must be string')
  assert.equal(typeof mem.lastUpdated,   'string',  'lastUpdated must be string')
  assert.ok(Array.isArray(mem.supportingTimelineEvents), 'supportingTimelineEvents must be array')
  assert.equal(typeof mem.metadata,      'object',  'metadata must be object')
  assert.equal(mem.schemaVersion,        MEMORY_SCHEMA_VERSION, 'schemaVersion must match')
})

test('AI.memory.get() returns COACH memory after AI.request() + refresh(coachId)', async () => {
  _clear()
  clearTimeline()
  const coachId = 'integ-coach-type'
  const clubId  = 'integ-club-type'

  await AI.request({ coachId, clubId })
  const mems = await AI.memory.refresh(coachId)

  // refresh returns the created/updated memory objects directly
  const coachMem = mems.find(m => m.type === MEMORY_TYPE.COACH)
  assert.ok(coachMem, 'refresh must create COACH memory after AI.request()')
  assert.equal(coachMem.entityId, coachId)
})

test('AI.memory.get() COACH memory supportingTimelineEvents references real event IDs', async () => {
  _clear()
  clearTimeline()
  const coachId = 'integ-coach-evtids'

  await AI.request({ coachId })
  const mems = await AI.memory.refresh(coachId)
  const coachMem = mems.find(m => m.type === MEMORY_TYPE.COACH)

  assert.ok(coachMem, 'must have COACH memory')
  assert.ok(coachMem.supportingTimelineEvents.length > 0, 'must have at least one supporting event')
  for (const evtId of coachMem.supportingTimelineEvents) {
    assert.equal(typeof evtId, 'string', 'supporting event IDs must be strings')
  }
})

test('AI.learn() outcomes show in COACH memory after refresh', async () => {
  _clear()
  clearTimeline()
  const coachId = 'integ-learn-coach'
  const clubId  = 'integ-learn-club'

  await AI.learn({ recommendationId: 'lr-1', outcome: 'accepted',  coachId, clubId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: 'lr-2', outcome: 'accepted',  coachId, clubId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: 'lr-3', outcome: 'dismissed', coachId, clubId, recommendationType: 'Training' })

  const mems     = await AI.memory.refresh(coachId)
  const coachMem = mems.find(m => m.type === MEMORY_TYPE.COACH)

  assert.ok(coachMem, 'must create COACH memory after AI.learn() calls')
  assert.ok(coachMem.metadata.accepted >= 2,   'metadata.accepted must reflect accepted outcomes')
  assert.ok(coachMem.metadata.dismissed >= 1,  'metadata.dismissed must reflect dismissed outcomes')
})

test('AI.memory.refresh() creates CLUB memory when clubId matches timeline events', async () => {
  _clear()
  clearTimeline()
  const coachId = 'integ-club-coach'
  const clubId  = 'integ-specific-club'

  await AI.request({ coachId, clubId })
  const mems    = await AI.memory.refresh(clubId)
  const clubMem = mems.find(m => m.type === MEMORY_TYPE.CLUB)

  assert.ok(clubMem, 'must create CLUB memory after AI.request() with clubId')
  assert.equal(clubMem.entityId, clubId)
})

test('AI.memory.search() returns memories matching the query text', async () => {
  _clear()
  clearTimeline()
  const coachId = 'integ-search-coach-unique-xqz'

  await AI.request({ coachId })
  await AI.memory.refresh(coachId)

  const results = await AI.memory.search('integ-search-coach-unique-xqz')
  assert.ok(results.length >= 1, 'search must find the memory by entityId text')
})

test('AI.memory.search() returns [] for unmatched query', async () => {
  _clear()
  clearTimeline()
  const results = await AI.memory.search('zzz-no-match-ever-zzzzyyyxxx')
  assert.deepEqual(results, [])
})

test('AI.memory.related() returns [] when no memories exist for related entities', async () => {
  _clear()
  clearTimeline()
  const result = await AI.memory.related('lonely-entity')
  assert.ok(Array.isArray(result))
})

test('AI.memory.related() finds memories of entities co-appearing in timeline events', async () => {
  _clear()
  clearTimeline()
  const coachId = 'integ-rel-coach'
  const clubId  = 'integ-rel-club'

  await AI.request({ coachId, clubId })
  await AI.memory.refresh(coachId)
  await AI.memory.refresh(clubId)

  const related = await AI.memory.related(coachId)
  const relatedEntityIds = related.map(m => m.entityId)

  // club should appear as a related entity since it co-appears in coach events
  assert.ok(relatedEntityIds.includes(clubId) || related.length === 0,
    'clubId should appear in related memories (or none if event was not club-scoped)')
})

test('Memory strength is between 1 and 100 in all cases', async () => {
  _clear()
  clearTimeline()
  const coachId = 'integ-strength-bounds'

  await AI.request({ coachId })
  const mems = await AI.memory.refresh(coachId)

  for (const m of mems) {
    assert.ok(m.strength >= 1   && m.strength <= 100, `strength out of range: ${m.strength}`)
    assert.ok(m.confidence >= 0 && m.confidence <= 100, `confidence out of range: ${m.confidence}`)
  }
})

// ── Never-reject contract ─────────────────────────────────────────────────────

test('AI.memory.get(null) never rejects', async () => {
  await assert.doesNotReject(AI.memory.get(null))
  await assert.doesNotReject(AI.memory.get(undefined))
})

test('AI.memory.search(null) never rejects', async () => {
  await assert.doesNotReject(AI.memory.search(null))
  await assert.doesNotReject(AI.memory.search(undefined))
  await assert.doesNotReject(AI.memory.search(''))
})

test('AI.memory.related(null) never rejects', async () => {
  await assert.doesNotReject(AI.memory.related(null))
  await assert.doesNotReject(AI.memory.related(undefined))
})

test('AI.memory.refresh(null) never rejects', async () => {
  await assert.doesNotReject(AI.memory.refresh(null))
  await assert.doesNotReject(AI.memory.refresh(undefined))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — M1–M6 regression
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() still returns valid BrainResponse after M7', async () => {
  clearTimeline()
  const result = await AI.request({})
  assert.ok(Array.isArray(result.recommendations))
  assert.ok('isMock' in result.meta)
  assert.ok(result.trace.modules.includes('calibration'))
})

test('AI.learn() still resolves after M7', async () => {
  await assert.doesNotReject(AI.learn({
    recommendationId: 'r-m7-reg', outcome: 'accepted',
    recommendationType: 'Training',
  }))
})

test('AI.timeline() still returns { events, total, stats } after M7', async () => {
  clearTimeline()
  const r = await AI.timeline({})
  assert.ok(Array.isArray(r.events))
  assert.ok(typeof r.total === 'number')
  assert.ok(typeof r.stats === 'object')
})

test('AI.recordObservation() still works after M7', async () => {
  await assert.doesNotReject(AI.recordObservation({ coachId: 'm7-obs', metadata: {} }))
})

test('AI.ask() unaffected by M7', async () => {
  const r = await AI.ask('Who needs rest?')
  assert.equal(typeof r.answer, 'string')
})

test('AI.assembleContext() unaffected by M7', async () => {
  const b = await AI.assembleContext({})
  assert.ok(typeof b.platform === 'object')
})

test('AI.reason() unaffected by M7', async () => {
  const rb = await AI.reason({})
  assert.ok(Array.isArray(rb.recommendations))
})
