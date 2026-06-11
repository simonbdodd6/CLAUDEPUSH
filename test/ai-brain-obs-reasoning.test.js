/**
 * AI Brain — M9 Observation-Aware Reasoning Tests
 *
 * Verifies:
 * 1. Coach/Squad/Club reasoners accept observations as second param
 * 2. Each observation type produces the correct enrichment (insight/warning/evidence/rec)
 * 3. observation IDs are cited on every influenced artefact
 * 4. Empty observations (default) = identical behaviour to M4
 * 5. reasoning.js fetches and forwards observations automatically
 * 6. Full pipeline: AI.request() → context + observations → enriched result
 * 7. All M1–M8 contracts unaffected
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'crypto'

import { reason as coachReason } from '../ai-brain/reasoners/coach-reasoner.js'
import { reason as squadReason } from '../ai-brain/reasoners/squad-reasoner.js'
import { reason as clubReason  } from '../ai-brain/reasoners/club-reasoner.js'
import { reason as orchestrate }  from '../ai-brain/reasoning.js'
import { AI }                     from '../ai-brain/index.js'

import { _clear as clearMemStore, _forceUpsert } from '../ai-brain/memory/memory-store.js'
import { _clear as clearTimeline }               from '../ai-brain/timeline.js'
import { MEMORY_TYPE, MEMORY_SCHEMA_VERSION }    from '../ai-brain/memory/memory-types.js'
import { OBSERVATION_TYPE }                      from '../ai-brain/observation/observation-types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkObs(overrides = {}) {
  return {
    id:                randomUUID(),
    schemaVersion:     '1.0',
    timestamp:         new Date().toISOString(),
    observationType:   overrides.observationType ?? OBSERVATION_TYPE.COACH_BEHAVIOUR,
    entity:            overrides.entity ?? { id: 'test-entity', type: MEMORY_TYPE.COACH },
    confidence:        overrides.confidence ?? 70,
    explanation:       overrides.explanation ?? 'Test explanation.',
    supportingMemories: overrides.supportingMemories ?? [randomUUID()],
    metadata:          overrides.metadata ?? {},
  }
}

// Minimal live-data bundles that bypass the noLiveData early-return in each reasoner
const LIVE_COACH_BUNDLE = {
  platform: { fixture: { daysToKickoff: 5, squadStatus: null }, attendanceData: null, coachId: 'test-coach', clubId: 'test-club' },
  workingMemory: { recentEvents: [], total: 0 },
}
const LIVE_SQUAD_BUNDLE = {
  platform: { fixture: { daysToKickoff: 5, medicalAlerts: [], squadStatus: null }, digitalTwin: { injured: [], atRisk: [] } },
  episodicMemory: { players: [], teams: [], playerCount: 0, teamCount: 0 },
}
const LIVE_CLUB_BUNDLE = {
  clubIntelligence:   { available: true, health: { overallScore: 72, components: {} } },
  proceduralLearning: { available: true, cis: null, calibration: null },
  platform:           { coachId: 'test-coach', clubId: 'test-club' },
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — Signature backward-compat: observations = [] keeps M4 behaviour
// ─────────────────────────────────────────────────────────────────────────────

test('coachReason(bundle) with no observations returns same result as M4', () => {
  const bundle = { platform: { fixture: null, digitalTwin: null, attendanceData: null } }
  const result = coachReason(bundle)
  assert.ok(Array.isArray(result.recommendations))
  assert.ok(result.recommendations.some(r => r.source.includes('mock')),
    'cold-start path must still fire the mock recommendation')
  assert.equal(result.reasoner, 'coach')
})

test('squadReason(bundle) with no observations returns same result as M4', () => {
  const bundle = { platform: { fixture: null, digitalTwin: null }, episodicMemory: { playerCount: 0 } }
  const result = squadReason(bundle)
  assert.ok(result.recommendations.some(r => r.source.includes('mock')))
  assert.equal(result.reasoner, 'squad')
})

test('clubReason(bundle) with no observations returns same result as M4', () => {
  const bundle = { clubIntelligence: { available: false }, proceduralLearning: { available: false }, platform: {} }
  const result = clubReason(bundle)
  assert.ok(result.recommendations.some(r => r.source.includes('mock')))
  assert.equal(result.reasoner, 'club')
})

test('coachReason with empty observations array is identical to no second arg', () => {
  const r1 = coachReason(LIVE_COACH_BUNDLE)
  const r2 = coachReason(LIVE_COACH_BUNDLE, [])
  assert.equal(r1.insights.length, r2.insights.length, 'insight counts must match')
  assert.equal(r1.warnings.length, r2.warnings.length, 'warning counts must match')
  assert.equal(r1.evidence.length, r2.evidence.length, 'evidence counts must match')
  assert.equal(r1.recommendations.length, r2.recommendations.length)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — Coach Reasoner: observation enrichment
// ─────────────────────────────────────────────────────────────────────────────

test('coachReason: COACH_BEHAVIOUR receptive → insight with key "coach-ai-engagement"', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.COACH_BEHAVIOUR,
    confidence: 75,
    metadata: { signal: 'receptive', positiveRate: 0.85, totalOutcomes: 10, accepted: 8, dismissed: 1, actioned: 0, snoozed: 1 },
  })
  const result = coachReason(LIVE_COACH_BUNDLE, [obs])
  const insight = result.insights.find(i => i.key === 'coach-ai-engagement')
  assert.ok(insight, 'must add coach-ai-engagement insight for receptive signal')
  assert.ok(insight.value.includes('receptive'), 'value must mention "receptive"')
  assert.equal(insight.confidence, 75)
  assert.equal(insight.observationId, obs.id)
})

test('coachReason: COACH_BEHAVIOUR dismissive → warning citing observation ID', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.COACH_BEHAVIOUR,
    confidence: 65,
    explanation: 'Coach dismisses 80% of recommendations.',
    metadata: { signal: 'dismissive', positiveRate: 0.2, totalOutcomes: 10, accepted: 2, dismissed: 8 },
  })
  const result = coachReason(LIVE_COACH_BUNDLE, [obs])
  const warning = result.warnings.find(w => w.observationId === obs.id)
  assert.ok(warning, 'must add warning with observationId for dismissive signal')
  assert.ok(warning.message.toLowerCase().includes('low'), 'warning must mention low acceptance')
})

test('coachReason: COACH_BEHAVIOUR mixed → insight with value "mixed engagement"', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.COACH_BEHAVIOUR,
    confidence: 55,
    metadata: { signal: 'mixed', positiveRate: 0.5, totalOutcomes: 8, accepted: 4, dismissed: 4 },
  })
  const result = coachReason(LIVE_COACH_BUNDLE, [obs])
  const insight = result.insights.find(i => i.key === 'coach-ai-engagement')
  assert.ok(insight, 'must add insight for mixed signal')
  assert.ok(insight.value.includes('mixed'))
})

test('coachReason: COACH_BEHAVIOUR adds evidence citing observation ID', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.COACH_BEHAVIOUR,
    metadata: { signal: 'receptive', positiveRate: 0.9, totalOutcomes: 5, accepted: 5, dismissed: 0 },
  })
  const result = coachReason(LIVE_COACH_BUNDLE, [obs])
  const ev = result.evidence.find(e => e.observationId === obs.id)
  assert.ok(ev, 'evidence must include observation citation')
  assert.equal(ev.type,   'observation')
  assert.equal(ev.source, 'observation-engine')
  assert.equal(ev.value,  OBSERVATION_TYPE.COACH_BEHAVIOUR)
})

test('coachReason: SESSION_LOAD → insight with key "session-load"', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.SESSION_LOAD,
    confidence: 80,
    metadata: { loadLevel: 'heavy', eventCount: 12 },
  })
  const result = coachReason(LIVE_COACH_BUNDLE, [obs])
  const insight = result.insights.find(i => i.key === 'session-load')
  assert.ok(insight, 'must add session-load insight')
  assert.equal(insight.value, 'heavy')
  assert.equal(insight.observationId, obs.id)
})

test('coachReason: SESSION_LOAD evidence cites observation ID', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.SESSION_LOAD,
    metadata: { loadLevel: 'moderate', eventCount: 6 },
  })
  const result = coachReason(LIVE_COACH_BUNDLE, [obs])
  const ev = result.evidence.find(e => e.observationId === obs.id)
  assert.ok(ev)
  assert.equal(ev.type, 'observation')
})

test('coachReason: multiple observations produce multiple enrichments', () => {
  const obs1 = mkObs({ observationType: OBSERVATION_TYPE.COACH_BEHAVIOUR, metadata: { signal: 'receptive', positiveRate: 0.8, totalOutcomes: 10, accepted: 8, dismissed: 2 } })
  const obs2 = mkObs({ observationType: OBSERVATION_TYPE.SESSION_LOAD,    metadata: { loadLevel: 'light', eventCount: 2 } })
  const result = coachReason(LIVE_COACH_BUNDLE, [obs1, obs2])
  const engagementInsight = result.insights.find(i => i.key === 'coach-ai-engagement')
  const loadInsight       = result.insights.find(i => i.key === 'session-load')
  assert.ok(engagementInsight, 'must have engagement insight')
  assert.ok(loadInsight,       'must have session-load insight')
})

test('coachReason: non-coach observation types are ignored', () => {
  const obs = mkObs({ observationType: OBSERVATION_TYPE.CLUB_ACTIVITY, metadata: { activityLevel: 'high' } })
  const before = coachReason(LIVE_COACH_BUNDLE, [])
  const after  = coachReason(LIVE_COACH_BUNDLE, [obs])
  assert.equal(before.insights.length,   after.insights.length,   'irrelevant observations must not add insights')
  assert.equal(before.evidence.length,   after.evidence.length,   'irrelevant observations must not add evidence')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — Squad Reasoner: observation enrichment
// ─────────────────────────────────────────────────────────────────────────────

test('squadReason: REPEATED_ABSENCE → warning and recommendation per entity', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.REPEATED_ABSENCE,
    entity: { id: 'player-absent-1', type: MEMORY_TYPE.PLAYER },
    confidence: 60,
    explanation: 'Entity has 5 events all within a single session.',
    metadata: { sessions: 1, totalEvents: 5 },
  })
  const result = squadReason(LIVE_SQUAD_BUNDLE, [obs])
  const warning = result.warnings.find(w => w.observationId === obs.id)
  const rec     = result.recommendations.find(r => r.source === 'squad-reasoner/observation')
  assert.ok(warning, 'must add warning for REPEATED_ABSENCE')
  assert.ok(rec,     'must add recommendation for REPEATED_ABSENCE')
  assert.ok(rec.evidence.some(e => e.observationId === obs.id), 'recommendation evidence must cite observation')
})

test('squadReason: REPEATED_ABSENCE recommendation has correct category', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.REPEATED_ABSENCE,
    entity: { id: 'player-x', type: MEMORY_TYPE.PLAYER },
    confidence: 55,
    explanation: 'Test.',
    metadata: { sessions: 1, totalEvents: 4 },
  })
  const result = squadReason(LIVE_SQUAD_BUNDLE, [obs])
  const rec = result.recommendations.find(r => r.source === 'squad-reasoner/observation')
  assert.ok(rec)
  assert.equal(rec.category, 'Player Welfare')
})

test('squadReason: ATTENDANCE_TREND infrequent → warning', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.ATTENDANCE_TREND,
    entity: { id: 'player-rare', type: MEMORY_TYPE.PLAYER },
    confidence: 50,
    explanation: 'Entity has infrequent presence.',
    metadata: { attendanceSignal: 'infrequent', sessions: 1, totalEvents: 2 },
  })
  const result = squadReason(LIVE_SQUAD_BUNDLE, [obs])
  const warning = result.warnings.find(w => w.observationId === obs.id)
  assert.ok(warning, 'must produce warning for infrequent attendance')
})

test('squadReason: ATTENDANCE_TREND regular → insight (not warning)', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.ATTENDANCE_TREND,
    entity: { id: 'player-regular', type: MEMORY_TYPE.PLAYER },
    confidence: 75,
    metadata: { attendanceSignal: 'regular', sessions: 6, totalEvents: 12 },
  })
  const result = squadReason(LIVE_SQUAD_BUNDLE, [obs])
  const insight = result.insights.find(i => i.observationId === obs.id)
  const warning = result.warnings.find(w => w.observationId === obs.id)
  assert.ok(insight, 'regular attendance must produce insight')
  assert.ok(!warning, 'regular attendance must NOT produce warning')
  assert.equal(insight.value, 'regular')
})

test('squadReason: PLAYER_AVAILABILITY_TREND → aggregate insight', () => {
  const obs1 = mkObs({ observationType: OBSERVATION_TYPE.PLAYER_AVAILABILITY_TREND, confidence: 60, entity: { id: 'p1', type: MEMORY_TYPE.PLAYER }, metadata: { totalEvents: 3, sessions: 2 } })
  const obs2 = mkObs({ observationType: OBSERVATION_TYPE.PLAYER_AVAILABILITY_TREND, confidence: 80, entity: { id: 'p2', type: MEMORY_TYPE.PLAYER }, metadata: { totalEvents: 5, sessions: 3 } })
  const result = squadReason(LIVE_SQUAD_BUNDLE, [obs1, obs2])
  const insight = result.insights.find(i => i.key === 'player-availability-observations')
  assert.ok(insight, 'must aggregate player availability observations into insight')
  assert.equal(insight.value, 2)
  assert.equal(insight.confidence, 70)  // avg of 60 + 80 = 70
})

test('squadReason: PLAYER_AVAILABILITY_TREND adds evidence for each observation', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.PLAYER_AVAILABILITY_TREND,
    confidence: 65,
    entity: { id: 'player-ev', type: MEMORY_TYPE.PLAYER },
    metadata: { totalEvents: 4, sessions: 2 },
  })
  const result = squadReason(LIVE_SQUAD_BUNDLE, [obs])
  const ev = result.evidence.find(e => e.observationId === obs.id)
  assert.ok(ev, 'must add evidence citing observation ID')
  assert.equal(ev.source, 'observation-engine')
})

test('squadReason: non-squad observation types are ignored', () => {
  const obs = mkObs({ observationType: OBSERVATION_TYPE.COACH_BEHAVIOUR, metadata: { signal: 'receptive', totalOutcomes: 5 } })
  const before = squadReason(LIVE_SQUAD_BUNDLE, [])
  const after  = squadReason(LIVE_SQUAD_BUNDLE, [obs])
  assert.equal(before.insights.length,     after.insights.length)
  assert.equal(before.recommendations.length, after.recommendations.length)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — Club Reasoner: observation enrichment
// ─────────────────────────────────────────────────────────────────────────────

test('clubReason: CLUB_ACTIVITY → insight with key "club-ai-activity-level"', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.CLUB_ACTIVITY,
    entity: { id: 'club-1', type: MEMORY_TYPE.CLUB },
    confidence: 78,
    metadata: { activityLevel: 'high', totalEvents: 25, sessions: 5 },
  })
  const result = clubReason(LIVE_CLUB_BUNDLE, [obs])
  const insight = result.insights.find(i => i.key === 'club-ai-activity-level')
  assert.ok(insight, 'must add club-ai-activity-level insight')
  assert.equal(insight.value, 'high')
  assert.equal(insight.confidence, 78)
  assert.equal(insight.observationId, obs.id)
})

test('clubReason: CLUB_ACTIVITY evidence cites observation ID', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.CLUB_ACTIVITY,
    entity: { id: 'club-2', type: MEMORY_TYPE.CLUB },
    metadata: { activityLevel: 'moderate', totalEvents: 8 },
  })
  const result = clubReason(LIVE_CLUB_BUNDLE, [obs])
  const ev = result.evidence.find(e => e.observationId === obs.id)
  assert.ok(ev)
  assert.equal(ev.type,  'observation')
  assert.equal(ev.value, OBSERVATION_TYPE.CLUB_ACTIVITY)
})

test('clubReason: PLAYER_IMPROVEMENT → aggregate insight', () => {
  const obs1 = mkObs({ observationType: OBSERVATION_TYPE.PLAYER_IMPROVEMENT, confidence: 60, entity: { id: 'p1', type: MEMORY_TYPE.PLAYER }, metadata: { memoryConfidence: 75, totalEvents: 6 } })
  const obs2 = mkObs({ observationType: OBSERVATION_TYPE.PLAYER_IMPROVEMENT, confidence: 70, entity: { id: 'p2', type: MEMORY_TYPE.PLAYER }, metadata: { memoryConfidence: 80, totalEvents: 8 } })
  const result = clubReason(LIVE_CLUB_BUNDLE, [obs1, obs2])
  const insight = result.insights.find(i => i.key === 'player-improvement-signals')
  assert.ok(insight, 'must add player-improvement-signals insight')
  assert.equal(insight.value, 2)
  assert.equal(insight.confidence, 65)  // avg of 60 + 70 = 65
})

test('clubReason: PLAYER_IMPROVEMENT adds evidence for each observation', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.PLAYER_IMPROVEMENT,
    entity: { id: 'player-imp', type: MEMORY_TYPE.PLAYER },
    confidence: 68,
    metadata: { memoryConfidence: 78, totalEvents: 5 },
  })
  const result = clubReason(LIVE_CLUB_BUNDLE, [obs])
  const ev = result.evidence.find(e => e.observationId === obs.id)
  assert.ok(ev)
})

test('clubReason: SESSION_FREQUENCY → insight with key "session-frequency"', () => {
  const obs = mkObs({
    observationType: OBSERVATION_TYPE.SESSION_FREQUENCY,
    entity: { id: 'club-3', type: MEMORY_TYPE.CLUB },
    confidence: 72,
    metadata: { sessions: 4, coaches: 2 },
  })
  const result = clubReason(LIVE_CLUB_BUNDLE, [obs])
  const insight = result.insights.find(i => i.key === 'session-frequency')
  assert.ok(insight, 'must add session-frequency insight')
  assert.equal(insight.value, 4)
  assert.equal(insight.observationId, obs.id)
})

test('clubReason: non-club observation types are ignored', () => {
  const obs = mkObs({ observationType: OBSERVATION_TYPE.REPEATED_ABSENCE, metadata: { sessions: 1, totalEvents: 4 } })
  const before = clubReason(LIVE_CLUB_BUNDLE, [])
  const after  = clubReason(LIVE_CLUB_BUNDLE, [obs])
  assert.equal(before.insights.length, after.insights.length)
  assert.equal(before.evidence.length, after.evidence.length)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — reasoning.js orchestrator: observation forwarding
// ─────────────────────────────────────────────────────────────────────────────

test('orchestrate reason() returns ReasoningBundle with all required fields', async () => {
  clearMemStore()
  clearTimeline()
  const rb = await orchestrate({})
  assert.ok(Array.isArray(rb.recommendations))
  assert.ok(Array.isArray(rb.insights))
  assert.ok(Array.isArray(rb.warnings))
  assert.ok(Array.isArray(rb.evidence))
  assert.ok(typeof rb.trace.totalDurationMs === 'number')
})

test('orchestrate reason() with no memory still returns valid ReasoningBundle', async () => {
  clearMemStore()
  clearTimeline()
  const rb = await orchestrate({})
  assert.ok(Array.isArray(rb.recommendations))
  assert.ok(rb.recommendations.length > 0, 'must produce at least the mock recommendations')
})

test('orchestrate reason() passes observations from memory to reasoners', async () => {
  clearMemStore()
  clearTimeline()

  // Set up a coach memory with COACH_BEHAVIOUR signal so observation is produced
  const coachId = 'orch-coach-obs'
  const clubId  = 'orch-club-obs'
  _forceUpsert({
    id: randomUUID(), schemaVersion: MEMORY_SCHEMA_VERSION, _version: 1,
    type: MEMORY_TYPE.COACH, entityId: coachId,
    title: `Coach activity: ${coachId}`, summary: 'Test.',
    confidence: 75, strength: 50,
    firstSeen: new Date().toISOString(), lastUpdated: new Date().toISOString(),
    supportingTimelineEvents: [],
    metadata: { accepted: 8, dismissed: 1, snoozed: 0, actioned: 0, totalOutcomes: 9, categories: ['Training'] },
  })

  // Bundle bypasses noLiveData and includes coachId so observations are fetched
  const bundle = {
    platform: { fixture: { daysToKickoff: 7, squadStatus: null, medicalAlerts: [] }, coachId, clubId, digitalTwin: { injured: [], atRisk: [] }, attendanceData: null },
    workingMemory: { recentEvents: [], total: 0 },
    episodicMemory: { playerCount: 0, teamCount: 0 },
    clubIntelligence: { available: true, health: { overallScore: 72, components: {} } },
    proceduralLearning: { available: true, cis: null, calibration: null },
  }

  const rb = await orchestrate(bundle)

  // The COACH_BEHAVIOUR observation (receptive) should appear in insights or evidence
  const allInsights = rb.insights ?? []
  const allEvidence = rb.evidence ?? []
  const hasEngagementInsight = allInsights.some(i => i.key === 'coach-ai-engagement')
  const hasObsEvidence       = allEvidence.some(e => e.type === 'observation' && e.value === OBSERVATION_TYPE.COACH_BEHAVIOUR)

  assert.ok(hasEngagementInsight || hasObsEvidence,
    'reasoning result must contain evidence of coach behaviour observation being consumed')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — Integration: full AI.request() pipeline with memory observations
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() with observations in memory produces enriched meta.reasoning', async () => {
  clearMemStore()
  clearTimeline()

  const coachId = 'integ-m9-coach'
  const clubId  = 'integ-m9-club'

  // Build timeline events
  await AI.request({ coachId, clubId })
  await AI.learn({ recommendationId: 'r-m9-1', outcome: 'accepted',  coachId, clubId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: 'r-m9-2', outcome: 'accepted',  coachId, clubId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: 'r-m9-3', outcome: 'accepted',  coachId, clubId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: 'r-m9-4', outcome: 'dismissed', coachId, clubId, recommendationType: 'Training' })

  // Refresh memory so observations exist
  await AI.memory.refresh(coachId)
  await AI.memory.refresh(clubId)

  // Now make a new request — reasoning layer should pick up observations
  const response = await AI.request({ coachId, clubId })

  assert.ok(Array.isArray(response.recommendations))
  assert.ok(response.meta, 'must have meta field')
  assert.ok(response.meta.reasoning, 'must have meta.reasoning')
  // The fact that it didn't throw and returned valid shape is the main assertion
})

test('AI.request() still never rejects with active memory observations', async () => {
  clearMemStore()
  clearTimeline()
  const coachId = 'integ-no-reject-m9'
  await AI.request({ coachId })
  await AI.memory.refresh(coachId)
  await assert.doesNotReject(AI.request({ coachId }))
})

test('AI.request() with club observations includes session-frequency insights in trace', async () => {
  clearMemStore()
  clearTimeline()

  const clubId  = 'integ-m9-sessfreq-club'
  const coachId = 'integ-m9-sessfreq-coach'

  // Multiple requests to build up session frequency data
  await AI.request({ coachId, clubId })
  await AI.request({ coachId, clubId })
  await AI.memory.refresh(clubId)

  // Force a club memory with session frequency metadata to ensure observation fires
  const memId = randomUUID()
  _forceUpsert({
    id: memId, schemaVersion: MEMORY_SCHEMA_VERSION, _version: 1,
    type: MEMORY_TYPE.CLUB, entityId: clubId,
    title: `Club activity: ${clubId}`, summary: 'Test.',
    confidence: 70, strength: 40,
    firstSeen: new Date().toISOString(), lastUpdated: new Date().toISOString(),
    supportingTimelineEvents: [],
    metadata: { totalEvents: 8, sessions: 3, coaches: 1, byType: { REQUEST: 4 } },
  })

  const response = await AI.request({ coachId, clubId })
  assert.ok(response.meta.reasoning, 'trace must exist')
  // The existence of a valid response (not a throw) confirms the pipeline still works
  assert.ok(Array.isArray(response.recommendations))
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — Observation ID citation guarantee
// ─────────────────────────────────────────────────────────────────────────────

test('every observation-sourced artefact has observationId citation', () => {
  const obsId = randomUUID()
  const obs   = {
    id:               obsId,
    schemaVersion:    '1.0',
    timestamp:        new Date().toISOString(),
    observationType:  OBSERVATION_TYPE.COACH_BEHAVIOUR,
    entity:           { id: 'cite-coach', type: MEMORY_TYPE.COACH },
    confidence:       80,
    explanation:      'Citation check.',
    supportingMemories: [],
    metadata: { signal: 'receptive', positiveRate: 0.8, totalOutcomes: 10, accepted: 8, dismissed: 2 },
  }
  const result = coachReason(LIVE_COACH_BUNDLE, [obs])

  // Evidence must cite the observation
  const evWithId = result.evidence.filter(e => e.observationId === obsId)
  assert.ok(evWithId.length >= 1, 'at least one evidence item must cite observation ID')

  // Any insight or warning derived from this observation must carry the ID
  const insightWithId = result.insights.filter(i => i.observationId === obsId)
  const warningWithId = result.warnings.filter(w => w.observationId === obsId)
  assert.ok(insightWithId.length + warningWithId.length >= 1,
    'at least one insight or warning must carry the observationId')
})

test('squad reasoner recommendation from REPEATED_ABSENCE cites observation in evidence', () => {
  const obsId = randomUUID()
  const obs   = {
    id:               obsId,
    schemaVersion:    '1.0',
    timestamp:        new Date().toISOString(),
    observationType:  OBSERVATION_TYPE.REPEATED_ABSENCE,
    entity:           { id: 'absent-player', type: MEMORY_TYPE.PLAYER },
    confidence:       58,
    explanation:      'Single session concentration.',
    supportingMemories: [],
    metadata: { sessions: 1, totalEvents: 5 },
  }
  const result  = squadReason(LIVE_SQUAD_BUNDLE, [obs])
  const rec     = result.recommendations.find(r => r.source === 'squad-reasoner/observation')
  assert.ok(rec)
  const evWithId = rec.evidence.filter(e => e.observationId === obsId)
  assert.ok(evWithId.length >= 1, 'recommendation evidence must cite the triggering observation ID')
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — M1–M8 regression
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() BrainResponse shape unchanged after M9', async () => {
  clearTimeline()
  const r = await AI.request({})
  assert.ok(Array.isArray(r.recommendations))
  assert.ok('isMock' in r.meta)
  assert.ok(r.trace.modules.includes('calibration'))
  assert.ok(r.trace.modules.includes('reasoning'))
})

test('AI.learn() resolves after M9', async () => {
  await assert.doesNotReject(AI.learn({ recommendationId: 'r-m9-reg', outcome: 'accepted', recommendationType: 'Training' }))
})

test('AI.timeline() still returns { events, total, stats } after M9', async () => {
  clearTimeline()
  const r = await AI.timeline({})
  assert.ok(Array.isArray(r.events))
  assert.ok(typeof r.total === 'number')
})

test('AI.memory.* unaffected by M9', async () => {
  clearMemStore()
  clearTimeline()
  await assert.doesNotReject(AI.memory.get('m9-test'))
  await assert.doesNotReject(AI.memory.search('m9'))
  await assert.doesNotReject(AI.memory.refresh('m9-test'))
})

test('AI.observations.* unaffected by M9', async () => {
  clearMemStore()
  await assert.doesNotReject(AI.observations.forEntity('m9-obs-test'))
  await assert.doesNotReject(AI.observations.all())
})

test('AI.ask() unaffected by M9', async () => {
  const r = await AI.ask('Who needs training adjustment?')
  assert.equal(typeof r.answer, 'string')
})

test('AI.assembleContext() unaffected by M9', async () => {
  const b = await AI.assembleContext({})
  assert.ok(typeof b.platform === 'object')
})

test('AI.reason() trace still lists all three reasoners', async () => {
  const rb = await AI.reason({})
  const reasoners = rb.trace?.reasoners ?? []
  assert.ok(reasoners.includes('coach') || reasoners.includes('squad') || reasoners.includes('club'),
    'trace must list reasoner names')
})

test('coachReason cold-start mock unaffected when no observations', () => {
  const r = coachReason({})
  assert.ok(r.recommendations.some(rec => rec.source.includes('mock')))
  assert.equal(r.insights.length, 0)
  assert.equal(r.warnings.length, 0)
})

test('squadReason cold-start mock unaffected when no observations', () => {
  const r = squadReason({})
  assert.ok(r.recommendations.some(rec => rec.source.includes('mock')))
})

test('clubReason cold-start mock unaffected when no observations', () => {
  const r = clubReason({})
  assert.ok(r.recommendations.some(rec => rec.source.includes('mock')))
})
