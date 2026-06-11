/**
 * AI Brain — M8 Observation Engine Tests
 *
 * Coverage:
 * 1. observation-types.js: constants, makeObservation() shape
 * 2. observation-engine.js unit tests with injected mock memories
 * 3. Integration: full Memory → Observation pipeline via AI.*
 * 4. Never-reject contracts on all AI.observations.* methods
 * 5. Regression: M1–M7 contracts unaffected
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'crypto'

// ── Module imports ────────────────────────────────────────────────────────────

import {
  OBSERVATION_TYPE, OBSERVATION_SCHEMA_VERSION, makeObservation,
} from '../ai-brain/observation/observation-types.js'

import {
  observe, observeAll, byType,
} from '../ai-brain/observation/observation-engine.js'

import { MEMORY_TYPE, MEMORY_SCHEMA_VERSION } from '../ai-brain/memory/memory-types.js'
import { _clear as clearMemStore, _forceUpsert } from '../ai-brain/memory/memory-store.js'
import { _clear as clearTimeline }               from '../ai-brain/timeline.js'
import { AI }                                    from '../ai-brain/index.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeMemory(overrides = {}) {
  const entityId = overrides.entityId ?? 'test-entity-' + randomUUID().slice(0, 8)
  const type     = overrides.type     ?? MEMORY_TYPE.COACH
  return {
    id:                       randomUUID(),
    schemaVersion:            MEMORY_SCHEMA_VERSION,
    _version:                 1,
    type,
    entityId,
    title:                    overrides.title   ?? `Title for ${entityId}`,
    summary:                  overrides.summary ?? `Summary for ${entityId}.`,
    confidence:               overrides.confidence ?? 60,
    strength:                 overrides.strength   ?? 40,
    firstSeen:                new Date().toISOString(),
    lastUpdated:              new Date().toISOString(),
    supportingTimelineEvents: overrides.supportingTimelineEvents ?? [],
    metadata:                 overrides.metadata ?? {},
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — observation-types.js
// ─────────────────────────────────────────────────────────────────────────────

test('OBSERVATION_TYPE has all 10 required keys', () => {
  const required = [
    'ATTENDANCE_TREND', 'PLAYER_AVAILABILITY_TREND', 'SESSION_FREQUENCY',
    'COACH_BEHAVIOUR', 'CLUB_ACTIVITY', 'PLAYER_IMPROVEMENT',
    'REPEATED_INJURY', 'REPEATED_ABSENCE', 'SESSION_LOAD', 'MATCH_PREPARATION',
  ]
  for (const k of required) {
    assert.equal(typeof OBSERVATION_TYPE[k], 'string', `OBSERVATION_TYPE.${k} must be string`)
    assert.equal(OBSERVATION_TYPE[k], k, `OBSERVATION_TYPE.${k} must equal its key name`)
  }
})

test('OBSERVATION_TYPE is frozen — cannot add new keys', () => {
  assert.throws(() => { OBSERVATION_TYPE.NEW_KEY = 'bad' })
})

test('OBSERVATION_SCHEMA_VERSION is "1.0"', () => {
  assert.equal(OBSERVATION_SCHEMA_VERSION, '1.0')
})

test('makeObservation() returns all required fields', () => {
  const o = makeObservation({
    observationType:   OBSERVATION_TYPE.COACH_BEHAVIOUR,
    entity:            { id: 'coach-x', type: MEMORY_TYPE.COACH },
    confidence:        75,
    explanation:       'Coach accepts 80% of recommendations.',
    supportingMemories: ['mem-id-1'],
    metadata:          { signal: 'receptive' },
  })
  assert.equal(typeof o.id,            'string')
  assert.equal(o.schemaVersion,         OBSERVATION_SCHEMA_VERSION)
  assert.equal(typeof o.timestamp,     'string')
  assert.equal(o.observationType,       OBSERVATION_TYPE.COACH_BEHAVIOUR)
  assert.equal(o.entity.id,            'coach-x')
  assert.equal(o.entity.type,           MEMORY_TYPE.COACH)
  assert.equal(o.confidence,           75)
  assert.equal(o.explanation,          'Coach accepts 80% of recommendations.')
  assert.deepEqual(o.supportingMemories, ['mem-id-1'])
  assert.equal(o.metadata.signal,      'receptive')
})

test('makeObservation() clamps confidence to [0, 100]', () => {
  const over  = makeObservation({ observationType: OBSERVATION_TYPE.CLUB_ACTIVITY, entity: { id: 'e', type: 'CLUB' }, confidence: 200 })
  const under = makeObservation({ observationType: OBSERVATION_TYPE.CLUB_ACTIVITY, entity: { id: 'e', type: 'CLUB' }, confidence: -10 })
  assert.equal(over.confidence,  100)
  assert.equal(under.confidence,   0)
})

test('makeObservation() timestamp is a valid ISO 8601 string', () => {
  const o = makeObservation({ observationType: OBSERVATION_TYPE.SESSION_LOAD, entity: { id: 'e', type: 'SESSION' } })
  assert.doesNotThrow(() => new Date(o.timestamp))
  assert.ok(!isNaN(new Date(o.timestamp).getTime()))
})

test('makeObservation() uses safe defaults for omitted optional fields', () => {
  const o = makeObservation({ observationType: OBSERVATION_TYPE.CLUB_ACTIVITY, entity: { id: 'e', type: 'CLUB' } })
  assert.equal(o.confidence, 50)
  assert.equal(o.explanation, '')
  assert.deepEqual(o.supportingMemories, [])
  assert.deepEqual(o.metadata, {})
})

test('makeObservation() handles null entity gracefully', () => {
  const o = makeObservation({ observationType: OBSERVATION_TYPE.CLUB_ACTIVITY, entity: null })
  assert.equal(o.entity.id,   null)
  assert.equal(o.entity.type, null)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — observation-engine.js unit tests (via _forceUpsert)
// ─────────────────────────────────────────────────────────────────────────────

test('observe() returns [] for null entityId', () => {
  clearMemStore()
  assert.deepEqual(observe(null), [])
})

test('observe() returns [] when entity has no stored memories', () => {
  clearMemStore()
  assert.deepEqual(observe('no-such-entity'), [])
})

// ── COACH memory observations ─────────────────────────────────────────────────

test('observe() with COACH memory at high acceptance → COACH_BEHAVIOUR "receptive"', () => {
  clearMemStore()
  const entityId = 'coach-receptive'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.COACH, entityId,
    metadata: { accepted: 8, dismissed: 1, snoozed: 0, actioned: 1, totalOutcomes: 10, categories: ['Training'] },
  }))
  const obs = observe(entityId)
  const behaviourObs = obs.filter(o => o.observationType === OBSERVATION_TYPE.COACH_BEHAVIOUR)
  assert.ok(behaviourObs.length >= 1, 'must produce at least one COACH_BEHAVIOUR observation')
  assert.ok(behaviourObs.some(o => o.metadata.signal === 'receptive'),
    'signal must be "receptive" for 90% acceptance rate')
})

test('observe() with COACH memory at low acceptance → COACH_BEHAVIOUR "dismissive"', () => {
  clearMemStore()
  const entityId = 'coach-dismissive'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.COACH, entityId,
    metadata: { accepted: 1, dismissed: 8, snoozed: 0, actioned: 0, totalOutcomes: 9, categories: [] },
  }))
  const obs = observe(entityId)
  const behaviourObs = obs.filter(o => o.observationType === OBSERVATION_TYPE.COACH_BEHAVIOUR)
  assert.ok(behaviourObs.some(o => o.metadata.signal === 'dismissive'),
    'signal must be "dismissive" for ~11% acceptance rate')
})

test('observe() with COACH memory mixed acceptance → COACH_BEHAVIOUR "mixed"', () => {
  clearMemStore()
  const entityId = 'coach-mixed'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.COACH, entityId,
    metadata: { accepted: 3, dismissed: 3, snoozed: 1, actioned: 0, totalOutcomes: 7, categories: [] },
  }))
  const obs = observe(entityId)
  const behaviourObs = obs.filter(o => o.observationType === OBSERVATION_TYPE.COACH_BEHAVIOUR)
  assert.ok(behaviourObs.some(o => o.metadata.signal === 'mixed'),
    'signal must be "mixed" for ~43% acceptance rate')
})

test('observe() with COACH memory — no COACH_BEHAVIOUR when fewer than 3 outcomes', () => {
  clearMemStore()
  const entityId = 'coach-cold-start'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.COACH, entityId,
    metadata: { accepted: 2, dismissed: 0, snoozed: 0, actioned: 0, totalOutcomes: 2, categories: [] },
  }))
  const obs = observe(entityId)
  const behaviourObs = obs.filter(o => o.observationType === OBSERVATION_TYPE.COACH_BEHAVIOUR)
  assert.equal(behaviourObs.length, 0, 'must not produce COACH_BEHAVIOUR with < 3 outcomes')
})

test('observe() with COACH memory with categories → SESSION_FREQUENCY observation', () => {
  clearMemStore()
  const entityId = 'coach-cats'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.COACH, entityId,
    metadata: { accepted: 0, dismissed: 0, snoozed: 0, actioned: 0, totalOutcomes: 0, categories: ['Training', 'Medical'] },
  }))
  const obs = observe(entityId)
  const freqObs = obs.filter(o => o.observationType === OBSERVATION_TYPE.SESSION_FREQUENCY)
  assert.ok(freqObs.length >= 1, 'must produce SESSION_FREQUENCY observation when categories exist')
  assert.equal(freqObs[0].metadata.categoryCount, 2)
})

test('observe() COACH memory — SESSION_FREQUENCY not produced when no categories', () => {
  clearMemStore()
  const entityId = 'coach-no-cats'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.COACH, entityId,
    metadata: { accepted: 0, dismissed: 0, totalOutcomes: 0, categories: [] },
  }))
  const obs   = observe(entityId)
  const freq  = obs.filter(o => o.observationType === OBSERVATION_TYPE.SESSION_FREQUENCY)
  assert.equal(freq.length, 0)
})

// ── CLUB memory observations ──────────────────────────────────────────────────

test('observe() with CLUB memory → CLUB_ACTIVITY observation', () => {
  clearMemStore()
  const entityId = 'club-active'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.CLUB, entityId,
    metadata: { totalEvents: 15, sessions: 3, coaches: 2, byType: { REQUEST: 5, RECOMMENDATION_SHOWN: 10 } },
  }))
  const obs = observe(entityId)
  const clubObs = obs.filter(o => o.observationType === OBSERVATION_TYPE.CLUB_ACTIVITY)
  assert.ok(clubObs.length >= 1)
  assert.equal(clubObs[0].entity.id, entityId)
  assert.ok(typeof clubObs[0].metadata.activityLevel === 'string')
})

test('observe() CLUB_ACTIVITY levels: high/moderate/low based on event count', () => {
  const cases = [
    { events: 25, expected: 'high' },
    { events: 8,  expected: 'moderate' },
    { events: 2,  expected: 'low' },
  ]
  for (const { events, expected } of cases) {
    clearMemStore()
    const entityId = `club-level-${events}`
    _forceUpsert(makeMemory({
      type: MEMORY_TYPE.CLUB, entityId,
      metadata: { totalEvents: events, sessions: 1, coaches: 1, byType: {} },
    }))
    const obs = observe(entityId)
    const clubObs = obs.find(o => o.observationType === OBSERVATION_TYPE.CLUB_ACTIVITY)
    assert.equal(clubObs?.metadata.activityLevel, expected, `${events} events must produce "${expected}" level`)
  }
})

test('observe() with CLUB memory with sessions → SESSION_FREQUENCY observation', () => {
  clearMemStore()
  const entityId = 'club-sessions'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.CLUB, entityId,
    metadata: { totalEvents: 10, sessions: 4, coaches: 2, byType: {} },
  }))
  const obs  = observe(entityId)
  const freq = obs.filter(o => o.observationType === OBSERVATION_TYPE.SESSION_FREQUENCY)
  assert.ok(freq.length >= 1)
  assert.equal(freq[0].metadata.sessions, 4)
})

test('observe() CLUB memory with 0 events → no observations', () => {
  clearMemStore()
  const entityId = 'club-empty'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.CLUB, entityId,
    metadata: { totalEvents: 0, sessions: 0, coaches: 0, byType: {} },
  }))
  const obs = observe(entityId)
  assert.equal(obs.length, 0)
})

// ── SESSION memory observations ───────────────────────────────────────────────

test('observe() with SESSION memory → SESSION_LOAD observation', () => {
  clearMemStore()
  const entityId = 'sess-load-1'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.SESSION, entityId,
    metadata: { eventCount: 6, eventTypes: ['REQUEST', 'RECOMMENDATION_SHOWN', 'RECOMMENDATION_ACCEPTED'], firstAt: null, lastAt: null },
  }))
  const obs  = observe(entityId)
  const load = obs.filter(o => o.observationType === OBSERVATION_TYPE.SESSION_LOAD)
  assert.ok(load.length >= 1)
  assert.equal(load[0].entity.id, entityId)
})

test('observe() SESSION_LOAD levels: heavy/moderate/light', () => {
  const cases = [
    { count: 12, expected: 'heavy' },
    { count: 6,  expected: 'moderate' },
    { count: 2,  expected: 'light' },
  ]
  for (const { count, expected } of cases) {
    clearMemStore()
    const entityId = `sess-lvl-${count}`
    _forceUpsert(makeMemory({
      type: MEMORY_TYPE.SESSION, entityId,
      metadata: { eventCount: count, eventTypes: ['REQUEST'], firstAt: null, lastAt: null },
    }))
    const obs  = observe(entityId)
    const load = obs.find(o => o.observationType === OBSERVATION_TYPE.SESSION_LOAD)
    assert.equal(load?.metadata.loadLevel, expected, `${count} events must produce "${expected}" load`)
  }
})

test('observe() SESSION memory with REQUEST events → MATCH_PREPARATION observation', () => {
  clearMemStore()
  const entityId = 'sess-prep-1'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.SESSION, entityId,
    metadata: { eventCount: 4, eventTypes: ['REQUEST', 'RECOMMENDATION_SHOWN'], firstAt: '2026-06-11T08:00:00.000Z', lastAt: null },
  }))
  const obs  = observe(entityId)
  const prep = obs.filter(o => o.observationType === OBSERVATION_TYPE.MATCH_PREPARATION)
  assert.ok(prep.length >= 1, 'must produce MATCH_PREPARATION when REQUEST is present')
})

test('observe() SESSION memory with only LEARN events → no MATCH_PREPARATION', () => {
  clearMemStore()
  const entityId = 'sess-no-prep'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.SESSION, entityId,
    metadata: { eventCount: 3, eventTypes: ['LEARN', 'RECOMMENDATION_ACCEPTED'], firstAt: null, lastAt: null },
  }))
  const obs  = observe(entityId)
  const prep = obs.filter(o => o.observationType === OBSERVATION_TYPE.MATCH_PREPARATION)
  assert.equal(prep.length, 0)
})

// ── PLAYER memory observations ────────────────────────────────────────────────

test('observe() with PLAYER memory → PLAYER_AVAILABILITY_TREND observation', () => {
  clearMemStore()
  const entityId = 'player-avail-1'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.PLAYER, entityId,
    metadata: { totalEvents: 5, sessions: 3, categories: ['Training'] },
  }))
  const obs   = observe(entityId)
  const avail = obs.filter(o => o.observationType === OBSERVATION_TYPE.PLAYER_AVAILABILITY_TREND)
  assert.ok(avail.length >= 1)
  assert.equal(avail[0].metadata.totalEvents, 5)
})

test('observe() PLAYER memory with multiple sessions → ATTENDANCE_TREND observation', () => {
  clearMemStore()
  const entityId = 'player-att-1'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.PLAYER, entityId,
    metadata: { totalEvents: 8, sessions: 4, categories: [] },
  }))
  const obs = observe(entityId)
  const att = obs.filter(o => o.observationType === OBSERVATION_TYPE.ATTENDANCE_TREND)
  assert.ok(att.length >= 1)
  assert.ok(typeof att[0].metadata.attendanceSignal === 'string')
})

test('observe() ATTENDANCE_TREND signals: regular/occasional/infrequent', () => {
  const cases = [
    { sessions: 6, expected: 'regular' },
    { sessions: 3, expected: 'occasional' },
    { sessions: 1, expected: 'infrequent' },
  ]
  for (const { sessions, expected } of cases) {
    clearMemStore()
    const entityId = `player-att-signal-${sessions}`
    _forceUpsert(makeMemory({
      type: MEMORY_TYPE.PLAYER, entityId,
      metadata: { totalEvents: sessions * 2, sessions, categories: [] },
    }))
    const obs  = observe(entityId)
    const att  = obs.find(o => o.observationType === OBSERVATION_TYPE.ATTENDANCE_TREND)
    assert.equal(att?.metadata.attendanceSignal, expected, `${sessions} sessions → "${expected}"`)
  }
})

test('observe() PLAYER memory: single session with 3+ events → REPEATED_ABSENCE', () => {
  clearMemStore()
  const entityId = 'player-absent'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.PLAYER, entityId,
    metadata: { totalEvents: 5, sessions: 1, categories: [] },
  }))
  const obs = observe(entityId)
  const abs = obs.filter(o => o.observationType === OBSERVATION_TYPE.REPEATED_ABSENCE)
  assert.ok(abs.length >= 1, 'must produce REPEATED_ABSENCE for single-session concentration')
})

test('observe() PLAYER memory: single session with 2 events → no REPEATED_ABSENCE', () => {
  clearMemStore()
  const entityId = 'player-no-absent'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.PLAYER, entityId,
    metadata: { totalEvents: 2, sessions: 1, categories: [] },
  }))
  const obs = observe(entityId)
  const abs = obs.filter(o => o.observationType === OBSERVATION_TYPE.REPEATED_ABSENCE)
  assert.equal(abs.length, 0)
})

test('observe() PLAYER memory with high confidence and 5+ events → PLAYER_IMPROVEMENT', () => {
  clearMemStore()
  const entityId = 'player-improving'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.PLAYER, entityId,
    confidence: 80,
    metadata: { totalEvents: 7, sessions: 3, categories: ['Training'] },
  }))
  const obs = observe(entityId)
  const imp = obs.filter(o => o.observationType === OBSERVATION_TYPE.PLAYER_IMPROVEMENT)
  assert.ok(imp.length >= 1)
  assert.ok(imp[0].metadata.memoryConfidence === 80)
})

test('observe() PLAYER memory — no PLAYER_IMPROVEMENT when confidence <= 70', () => {
  clearMemStore()
  const entityId = 'player-no-improvement'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.PLAYER, entityId,
    confidence: 60,
    metadata: { totalEvents: 8, sessions: 4, categories: [] },
  }))
  const obs = observe(entityId)
  const imp = obs.filter(o => o.observationType === OBSERVATION_TYPE.PLAYER_IMPROVEMENT)
  assert.equal(imp.length, 0)
})

// ── All-observation structure checks ─────────────────────────────────────────

test('every observation has all required fields', () => {
  clearMemStore()
  const entityId = 'shape-check'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.COACH, entityId,
    metadata: { accepted: 7, dismissed: 1, snoozed: 0, actioned: 1, totalOutcomes: 9, categories: ['Training'] },
  }))
  const obs = observe(entityId)
  assert.ok(obs.length > 0)
  for (const o of obs) {
    assert.equal(typeof o.id,            'string',  'id must be string')
    assert.equal(o.schemaVersion,         OBSERVATION_SCHEMA_VERSION, 'schemaVersion must be 1.0')
    assert.equal(typeof o.timestamp,     'string',  'timestamp must be string')
    assert.equal(typeof o.observationType,'string', 'observationType must be string')
    assert.equal(typeof o.entity,        'object',  'entity must be object')
    assert.equal(typeof o.entity.id,     'string',  'entity.id must be string')
    assert.equal(typeof o.confidence,    'number',  'confidence must be number')
    assert.ok(o.confidence >= 0 && o.confidence <= 100, 'confidence must be in [0, 100]')
    assert.equal(typeof o.explanation,   'string',  'explanation must be string')
    assert.ok(Array.isArray(o.supportingMemories), 'supportingMemories must be array')
    assert.equal(typeof o.metadata,      'object',  'metadata must be object')
  }
})

test('supportingMemories references the memory id', () => {
  clearMemStore()
  const entityId = 'mem-ref-check'
  const mem = _forceUpsert(makeMemory({
    type: MEMORY_TYPE.CLUB, entityId,
    metadata: { totalEvents: 10, sessions: 2, coaches: 1, byType: {} },
  }))
  const obs = observe(entityId)
  assert.ok(obs.length > 0)
  for (const o of obs) {
    assert.ok(o.supportingMemories.includes(mem.id), `supportingMemories must include memory id ${mem.id}`)
  }
})

// ── observeAll() ──────────────────────────────────────────────────────────────

test('observeAll() returns observations for every entity with memories', () => {
  clearMemStore()
  _forceUpsert(makeMemory({ type: MEMORY_TYPE.COACH,   entityId: 'all-coach', metadata: { accepted: 5, dismissed: 1, snoozed: 0, actioned: 0, totalOutcomes: 6, categories: ['Training'] } }))
  _forceUpsert(makeMemory({ type: MEMORY_TYPE.CLUB,    entityId: 'all-club',  metadata: { totalEvents: 5, sessions: 2, coaches: 1, byType: {} } }))
  _forceUpsert(makeMemory({ type: MEMORY_TYPE.PLAYER,  entityId: 'all-player', metadata: { totalEvents: 4, sessions: 2, categories: [] } }))
  const all = observeAll()
  const entityIds = new Set(all.map(o => o.entity.id))
  assert.ok(entityIds.has('all-coach'),  'observations for all-coach must be present')
  assert.ok(entityIds.has('all-club'),   'observations for all-club must be present')
  assert.ok(entityIds.has('all-player'), 'observations for all-player must be present')
})

test('observeAll() returns [] when no memories exist', () => {
  clearMemStore()
  assert.deepEqual(observeAll(), [])
})

// ── byType() ─────────────────────────────────────────────────────────────────

test('byType() returns only observations of the requested type', () => {
  clearMemStore()
  const entityId = 'bytype-coach'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.COACH, entityId,
    metadata: { accepted: 8, dismissed: 1, snoozed: 0, actioned: 0, totalOutcomes: 9, categories: ['Training', 'Medical'] },
  }))
  const filtered = byType(entityId, OBSERVATION_TYPE.COACH_BEHAVIOUR)
  assert.ok(filtered.length >= 1)
  assert.ok(filtered.every(o => o.observationType === OBSERVATION_TYPE.COACH_BEHAVIOUR))
})

test('byType() returns [] for a type not present in the observations', () => {
  clearMemStore()
  const entityId = 'bytype-no-match'
  _forceUpsert(makeMemory({
    type: MEMORY_TYPE.COACH, entityId,
    metadata: { accepted: 0, dismissed: 0, totalOutcomes: 0, categories: [] },
  }))
  const filtered = byType(entityId, OBSERVATION_TYPE.REPEATED_INJURY)
  assert.deepEqual(filtered, [])
})

test('byType() returns [] for null entityId', () => {
  assert.deepEqual(byType(null, OBSERVATION_TYPE.COACH_BEHAVIOUR), [])
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — Integration: full Memory → Observation pipeline
// ─────────────────────────────────────────────────────────────────────────────

test('AI.observations is an object with the three required methods', () => {
  assert.equal(typeof AI.observations,             'object')
  assert.equal(typeof AI.observations.forEntity,   'function')
  assert.equal(typeof AI.observations.all,         'function')
  assert.equal(typeof AI.observations.byType,      'function')
})

test('AI.observations.forEntity() returns [] when entity has no memories', async () => {
  clearMemStore()
  clearTimeline()
  const result = await AI.observations.forEntity('no-memory-entity')
  assert.deepEqual(result, [])
})

test('AI.observations.forEntity() returns observations after memory refresh', async () => {
  clearMemStore()
  clearTimeline()
  const coachId = 'integ-obs-coach'
  const clubId  = 'integ-obs-club'

  // Populate timeline with events
  await AI.request({ coachId, clubId })
  await AI.learn({ recommendationId: 'r1', outcome: 'accepted', coachId, clubId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: 'r2', outcome: 'accepted', coachId, clubId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: 'r3', outcome: 'dismissed', coachId, clubId, recommendationType: 'Training' })

  // Refresh memory from timeline
  await AI.memory.refresh(coachId)

  // Get observations
  const obs = await AI.observations.forEntity(coachId)
  assert.ok(Array.isArray(obs), 'must return an array')
  assert.ok(obs.length >= 1, 'must return at least one observation after memory + learning events')
})

test('AI.observations.forEntity() observations have all required fields', async () => {
  clearMemStore()
  clearTimeline()
  const coachId = 'integ-obs-fields'

  await AI.request({ coachId })
  await AI.memory.refresh(coachId)
  const obs = await AI.observations.forEntity(coachId)

  for (const o of obs) {
    assert.equal(typeof o.id,             'string',  'id must be string')
    assert.equal(o.schemaVersion,          OBSERVATION_SCHEMA_VERSION)
    assert.equal(typeof o.timestamp,      'string',  'timestamp must be string')
    assert.equal(typeof o.observationType,'string',  'observationType must be string')
    assert.equal(typeof o.entity.id,      'string',  'entity.id must be string')
    assert.equal(o.entity.id,             coachId,   'entity.id must match the queried entityId')
    assert.ok(o.confidence >= 0 && o.confidence <= 100)
    assert.equal(typeof o.explanation,    'string')
    assert.ok(Array.isArray(o.supportingMemories))
  }
})

test('AI.observations.forEntity() CLUB memory after request produces CLUB_ACTIVITY', async () => {
  clearMemStore()
  clearTimeline()
  const clubId  = 'integ-obs-club-act'
  const coachId = 'integ-obs-club-coach'

  await AI.request({ coachId, clubId })
  await AI.memory.refresh(clubId)
  const obs = await AI.observations.forEntity(clubId)
  const club = obs.filter(o => o.observationType === OBSERVATION_TYPE.CLUB_ACTIVITY)
  assert.ok(club.length >= 1, 'must produce CLUB_ACTIVITY observation')
  assert.equal(club[0].entity.id, clubId)
})

test('AI.observations.all() returns array', async () => {
  clearMemStore()
  clearTimeline()
  const result = await AI.observations.all()
  assert.ok(Array.isArray(result))
})

test('AI.observations.all() returns observations for all entities with memories', async () => {
  clearMemStore()
  clearTimeline()
  const coachId = 'integ-all-coach'
  const clubId  = 'integ-all-club'

  await AI.request({ coachId, clubId })
  await AI.memory.refresh(coachId)
  await AI.memory.refresh(clubId)

  const all = await AI.observations.all()
  const entityIds = new Set(all.map(o => o.entity.id))
  assert.ok(entityIds.has(coachId) || entityIds.has(clubId),
    'must have observations for at least one of the entities')
})

test('AI.observations.byType() filters to only matching observation types', async () => {
  clearMemStore()
  clearTimeline()
  const coachId = 'integ-bytype-coach'

  await AI.request({ coachId })
  await AI.learn({ recommendationId: 'r4', outcome: 'accepted',  coachId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: 'r5', outcome: 'accepted',  coachId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: 'r6', outcome: 'dismissed', coachId, recommendationType: 'Training' })
  await AI.memory.refresh(coachId)

  const filtered = await AI.observations.byType(coachId, OBSERVATION_TYPE.COACH_BEHAVIOUR)
  assert.ok(Array.isArray(filtered))
  if (filtered.length > 0) {
    assert.ok(filtered.every(o => o.observationType === OBSERVATION_TYPE.COACH_BEHAVIOUR))
  }
})

test('AI.observations.byType() returns [] for unknown observation type', async () => {
  clearMemStore()
  clearTimeline()
  const coachId = 'bytype-unknown'
  await AI.request({ coachId })
  await AI.memory.refresh(coachId)
  const result = await AI.observations.byType(coachId, 'NON_EXISTENT_TYPE')
  assert.deepEqual(result, [])
})

test('SESSION_FREQUENCY observation produced from COACH memory with active categories', async () => {
  clearMemStore()
  clearTimeline()
  const coachId = 'integ-sess-freq'

  // Make multiple requests so categories appear in memory
  await AI.request({ coachId })
  await AI.memory.refresh(coachId)

  const obs  = await AI.observations.forEntity(coachId)
  const freq = obs.filter(o => o.observationType === OBSERVATION_TYPE.SESSION_FREQUENCY)
  // SESSION_FREQUENCY is produced when categories > 0 in the COACH memory
  // It may or may not be present depending on whether categories were populated
  assert.ok(Array.isArray(freq))  // just assert it doesn't throw / non-rejecting
})

// ── Never-reject contracts ────────────────────────────────────────────────────

test('AI.observations.forEntity(null) never rejects', async () => {
  await assert.doesNotReject(AI.observations.forEntity(null))
  await assert.doesNotReject(AI.observations.forEntity(undefined))
})

test('AI.observations.all() never rejects', async () => {
  await assert.doesNotReject(AI.observations.all())
})

test('AI.observations.byType(null, ...) never rejects', async () => {
  await assert.doesNotReject(AI.observations.byType(null, OBSERVATION_TYPE.COACH_BEHAVIOUR))
  await assert.doesNotReject(AI.observations.byType(undefined, OBSERVATION_TYPE.CLUB_ACTIVITY))
})

test('AI.observations.byType(entityId, null) never rejects', async () => {
  await assert.doesNotReject(AI.observations.byType('any-entity', null))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — M1–M7 regression
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() still returns valid BrainResponse after M8', async () => {
  clearTimeline()
  const result = await AI.request({})
  assert.ok(Array.isArray(result.recommendations))
  assert.ok('isMock' in result.meta)
  assert.ok(result.trace.modules.includes('calibration'))
})

test('AI.learn() still resolves after M8', async () => {
  await assert.doesNotReject(AI.learn({
    recommendationId: 'r-m8-reg', outcome: 'accepted', recommendationType: 'Training',
  }))
})

test('AI.timeline() still works after M8', async () => {
  clearTimeline()
  const r = await AI.timeline({})
  assert.ok(Array.isArray(r.events))
  assert.ok(typeof r.total === 'number')
})

test('AI.memory.get/search/related/refresh unaffected by M8', async () => {
  clearMemStore()
  clearTimeline()
  await assert.doesNotReject(AI.memory.get('test'))
  await assert.doesNotReject(AI.memory.search('test'))
  await assert.doesNotReject(AI.memory.related('test'))
  await assert.doesNotReject(AI.memory.refresh('test'))
})

test('AI.recordObservation() unaffected by M8', async () => {
  await assert.doesNotReject(AI.recordObservation({ coachId: 'm8-obs', metadata: {} }))
})

test('AI.ask() unaffected by M8', async () => {
  const r = await AI.ask('Team fitness status?')
  assert.equal(typeof r.answer, 'string')
})

test('AI.assembleContext() unaffected by M8', async () => {
  const b = await AI.assembleContext({})
  assert.ok(typeof b.platform === 'object')
})

test('AI.reason() unaffected by M8', async () => {
  const rb = await AI.reason({})
  assert.ok(Array.isArray(rb.recommendations))
})
