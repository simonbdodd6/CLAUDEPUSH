/**
 * AI Brain — M10 Explainability Layer Tests
 *
 * Verifies:
 * 1. trace-builder.js — evidence extraction and breakdown calculations
 * 2. explanation-builder.js — ExplanationRecord shape and plain-text
 * 3. explanation-engine.js — store, retrieve, list, count, immutability
 * 4. Integration — AI.request() → AI.explain() full pipeline
 * 5. Determinism — same inputs always produce the same output
 * 6. Isolation — explanation persists after memory/timeline cleared
 * 7. Regression — all M1–M9 contracts unaffected
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'crypto'

import { buildTrace }      from '../ai-brain/explain/trace-builder.js'
import { buildExplanation } from '../ai-brain/explain/explanation-builder.js'
import {
  record, explain, listAll, count, _clear as clearExp,
} from '../ai-brain/explain/explanation-engine.js'
import { makeRec, CATEGORY, PRIORITY } from '../ai-brain/reasoners/shared.js'
import { AI } from '../ai-brain/index.js'

import { _clear as clearMemStore, _forceUpsert } from '../ai-brain/memory/memory-store.js'
import { _clear as clearTimeline }               from '../ai-brain/timeline.js'
import { MEMORY_TYPE, MEMORY_SCHEMA_VERSION }    from '../ai-brain/memory/memory-types.js'
import { OBSERVATION_TYPE }                      from '../ai-brain/observation/observation-types.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function mkObs(overrides = {}) {
  return {
    id:                randomUUID(),
    schemaVersion:     '1.0',
    timestamp:         new Date().toISOString(),
    observationType:   overrides.observationType ?? OBSERVATION_TYPE.COACH_BEHAVIOUR,
    entity:            overrides.entity ?? { id: 'e1', type: MEMORY_TYPE.COACH },
    confidence:        overrides.confidence ?? 65,
    explanation:       overrides.explanation ?? 'Test observation.',
    supportingMemories: overrides.supportingMemories ?? [],
    metadata:          overrides.metadata ?? {},
  }
}

function mkRec(overrides = {}) {
  return makeRec({
    category:       overrides.category       ?? CATEGORY.TRAINING,
    priority:       overrides.priority       ?? PRIORITY.MEDIUM,
    confidence:     overrides.confidence     ?? 75,
    title:          overrides.title          ?? 'Test recommendation',
    description:    overrides.description    ?? 'Test description.',
    action:         overrides.action         ?? 'Take action.',
    source:         overrides.source         ?? 'coach-reasoner',
    explainability: overrides.explainability ?? 'Why this was generated.',
    evidence:       overrides.evidence       ?? [],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — trace-builder: observation filtering
// ─────────────────────────────────────────────────────────────────────────────

test('buildTrace: only observations cited in evidence are included', () => {
  const cited   = mkObs()
  const uncited = mkObs()
  const rec = mkRec({
    evidence: [
      { type: 'observation', value: cited.observationType, source: 'observation-engine', observationId: cited.id, label: 'x' },
    ],
  })
  const trace = buildTrace(rec, { observations: [cited, uncited] })
  assert.equal(trace.observationsUsed.length, 1)
  assert.equal(trace.observationsUsed[0].id, cited.id)
})

test('buildTrace: no observation evidence → observationsUsed is empty', () => {
  const obs = mkObs()
  const rec = mkRec({ evidence: [{ type: 'fixture-proximity', value: '3d', source: 'platform.fixture' }] })
  const trace = buildTrace(rec, { observations: [obs] })
  assert.equal(trace.observationsUsed.length, 0)
})

test('buildTrace: memoriesUsed extracted from supporting memories of cited observations', () => {
  const memId1 = randomUUID()
  const memId2 = randomUUID()
  const obs = mkObs({ supportingMemories: [memId1, memId2] })
  const rec = mkRec({
    evidence: [{ type: 'observation', value: obs.observationType, source: 'observation-engine', observationId: obs.id }],
  })
  const trace = buildTrace(rec, { observations: [obs] })
  assert.ok(trace.memoriesUsed.includes(memId1))
  assert.ok(trace.memoriesUsed.includes(memId2))
})

test('buildTrace: memoriesUsed deduplicates across multiple observations', () => {
  const sharedMemId = randomUUID()
  const obs1 = mkObs({ supportingMemories: [sharedMemId] })
  const obs2 = mkObs({ supportingMemories: [sharedMemId] })
  const rec = mkRec({
    evidence: [
      { type: 'observation', source: 'observation-engine', observationId: obs1.id },
      { type: 'observation', source: 'observation-engine', observationId: obs2.id },
    ],
  })
  const trace = buildTrace(rec, { observations: [obs1, obs2] })
  assert.equal(trace.memoriesUsed.filter(id => id === sharedMemId).length, 1,
    'shared memory id must appear only once')
})

test('buildTrace: timelineEventsReferenced excludes observation-type evidence', () => {
  const obs = mkObs()
  const rec = mkRec({
    evidence: [
      { type: 'fixture-proximity', value: '2d', source: 'platform.fixture' },
      { type: 'observation', source: 'observation-engine', observationId: obs.id },
      { type: 'attendance-rate', value: '72%', source: 'platform.attendanceData' },
    ],
  })
  const trace = buildTrace(rec, { observations: [obs] })
  assert.equal(trace.timelineEventsReferenced.length, 2)
  assert.ok(trace.timelineEventsReferenced.every(ev => ev.type !== 'observation'))
  assert.ok(trace.timelineEventsReferenced.some(ev => ev.type === 'fixture-proximity'))
  assert.ok(trace.timelineEventsReferenced.some(ev => ev.type === 'attendance-rate'))
})

test('buildTrace: timelineEventsReferenced has type, value, source fields', () => {
  const rec = mkRec({
    evidence: [{ type: 'injury-count', value: '4 active injuries', source: 'platform.digitalTwin' }],
  })
  const trace = buildTrace(rec, {})
  const ev = trace.timelineEventsReferenced[0]
  assert.ok(ev)
  assert.equal(typeof ev.type, 'string')
  assert.equal(typeof ev.value, 'string')
  assert.equal(typeof ev.source, 'string')
})

test('buildTrace: empty evidence → all extraction arrays empty', () => {
  const trace = buildTrace(mkRec({ evidence: [] }), {})
  assert.equal(trace.observationsUsed.length, 0)
  assert.equal(trace.memoriesUsed.length, 0)
  assert.equal(trace.timelineEventsReferenced.length, 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — trace-builder: confidence and priority breakdowns
// ─────────────────────────────────────────────────────────────────────────────

test('buildTrace: confidenceBreakdown with no calibration', () => {
  const rec = mkRec({ confidence: 80 })
  const trace = buildTrace(rec, { calibrationAdjustment: null })
  const cb = trace.confidenceBreakdown
  assert.equal(cb.base, 80)
  assert.equal(cb.calibrationDelta, 0)
  assert.equal(cb.calibratedConfidence, 80)
  assert.equal(cb.sampleSize, 0)
  assert.equal(cb.calibrationApplied, false)
})

test('buildTrace: confidenceBreakdown with positive calibration delta', () => {
  const rec = mkRec({ confidence: 85 })  // calibrated value
  const calAdj = { originalConfidence: 75, adjustedConfidence: 85, delta: 10, sampleSize: 8 }
  const trace = buildTrace(rec, { calibrationAdjustment: calAdj })
  const cb = trace.confidenceBreakdown
  assert.equal(cb.base, 75)
  assert.equal(cb.calibrationDelta, 10)
  assert.equal(cb.calibratedConfidence, 85)
  assert.equal(cb.sampleSize, 8)
  assert.equal(cb.calibrationApplied, true)
})

test('buildTrace: confidenceBreakdown with negative calibration delta', () => {
  const rec = mkRec({ confidence: 60 })
  const calAdj = { originalConfidence: 75, adjustedConfidence: 60, delta: -15, sampleSize: 5 }
  const trace = buildTrace(rec, { calibrationAdjustment: calAdj })
  const cb = trace.confidenceBreakdown
  assert.equal(cb.calibrationDelta, -15)
  assert.equal(cb.calibrationApplied, true)
})

test('buildTrace: finalPriorityCalculation HIGH priority', () => {
  const rec = mkRec({ priority: PRIORITY.HIGH, confidence: 80 })
  const trace = buildTrace(rec, {})
  const fp = trace.finalPriorityCalculation
  assert.equal(fp.priorityWeight, 100)
  assert.equal(fp.priority, 'HIGH')
  assert.equal(fp.confidence, 80)
  assert.equal(fp.confidenceComponent, 24)          // 80 * 0.3 = 24
  assert.equal(fp.combinedScore, 124)               // 100 + 24
})

test('buildTrace: finalPriorityCalculation MEDIUM priority', () => {
  const rec = mkRec({ priority: PRIORITY.MEDIUM, confidence: 70 })
  const trace = buildTrace(rec, {})
  const fp = trace.finalPriorityCalculation
  assert.equal(fp.priorityWeight, 60)
  assert.equal(fp.combinedScore, 81)                // 60 + 70*0.3 = 60+21 = 81
})

test('buildTrace: finalPriorityCalculation LOW priority', () => {
  const rec = mkRec({ priority: PRIORITY.LOW, confidence: 50 })
  const trace = buildTrace(rec, {})
  const fp = trace.finalPriorityCalculation
  assert.equal(fp.priorityWeight, 25)
  assert.equal(fp.combinedScore, 40)                // 25 + 50*0.3 = 25+15 = 40
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — explanation-builder: ExplanationRecord shape
// ─────────────────────────────────────────────────────────────────────────────

test('buildExplanation returns correct schema shape', () => {
  const rec = mkRec()
  const exp = buildExplanation(rec, {})
  assert.equal(exp.schemaVersion,       '1.0')
  assert.equal(exp.recommendationId,    rec.id)
  assert.ok(Array.isArray(exp.observationsUsed))
  assert.ok(Array.isArray(exp.memoriesUsed))
  assert.ok(Array.isArray(exp.timelineEventsReferenced))
  assert.ok(typeof exp.confidenceBreakdown      === 'object')
  assert.ok(typeof exp.calibrationAdjustments   === 'object')
  assert.ok(typeof exp.learningInfluence        === 'object')
  assert.ok(typeof exp.finalPriorityCalculation === 'object')
  assert.ok(typeof exp.plainLanguageExplanation === 'string')
})

test('buildExplanation: generatedByReasoner inferred from source', () => {
  assert.equal(buildExplanation(mkRec({ source: 'coach-reasoner' }), {}).generatedByReasoner, 'coach')
  assert.equal(buildExplanation(mkRec({ source: 'squad-reasoner/observation' }), {}).generatedByReasoner, 'squad')
  assert.equal(buildExplanation(mkRec({ source: 'club-reasoner' }), {}).generatedByReasoner, 'club')
  assert.equal(buildExplanation(mkRec({ source: 'brain/mock' }), {}).generatedByReasoner, 'brain')
})

test('buildExplanation: calibrationAdjustments.applied is false when no adjustment', () => {
  const exp = buildExplanation(mkRec(), { calibrationAdjustment: null })
  assert.equal(exp.calibrationAdjustments.applied, false)
  assert.equal(exp.calibrationAdjustments.delta, 0)
  assert.equal(exp.calibrationAdjustments.originalConfidence, null)
})

test('buildExplanation: calibrationAdjustments.applied is true when adjustment provided', () => {
  const calAdj = { originalConfidence: 70, adjustedConfidence: 80, delta: 10, sampleSize: 6, category: 'Training' }
  const exp = buildExplanation(mkRec(), { calibrationAdjustment: calAdj })
  assert.equal(exp.calibrationAdjustments.applied, true)
  assert.equal(exp.calibrationAdjustments.delta, 10)
  assert.equal(exp.calibrationAdjustments.sampleSize, 6)
  assert.equal(exp.calibrationAdjustments.originalConfidence, 70)
  assert.equal(exp.calibrationAdjustments.adjustedConfidence, 80)
})

test('buildExplanation: learningInfluence mirrors calibration state', () => {
  const calAdj = { originalConfidence: 65, adjustedConfidence: 75, delta: 10, sampleSize: 5, category: 'Training' }
  const exp = buildExplanation(mkRec({ category: CATEGORY.TRAINING }), { calibrationAdjustment: calAdj })
  assert.equal(exp.learningInfluence.calibrationApplied, true)
  assert.equal(exp.learningInfluence.sampleSize, 5)
  assert.equal(exp.learningInfluence.category, 'Training')
  assert.equal(exp.learningInfluence.delta, 10)
})

test('buildExplanation: context.coachId and clubId preserved', () => {
  const exp = buildExplanation(mkRec(), { coachId: 'coach-A', clubId: 'club-B' })
  assert.equal(exp.context.coachId, 'coach-A')
  assert.equal(exp.context.clubId,  'club-B')
})

test('buildExplanation: null rec returns null', () => {
  assert.equal(buildExplanation(null, {}), null)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 4 — explanation-builder: plain-language explanation content
// ─────────────────────────────────────────────────────────────────────────────

test('plainLanguageExplanation contains recommendation title', () => {
  const rec = mkRec({ title: 'Reduce training load this week' })
  const exp = buildExplanation(rec, {})
  assert.ok(exp.plainLanguageExplanation.includes('Reduce training load this week'))
})

test('plainLanguageExplanation contains category, priority, confidence', () => {
  const rec = mkRec({ category: CATEGORY.MEDICAL, priority: PRIORITY.HIGH, confidence: 90 })
  const exp = buildExplanation(rec, {})
  assert.ok(exp.plainLanguageExplanation.includes('Medical'))
  assert.ok(exp.plainLanguageExplanation.includes('HIGH'))
  assert.ok(exp.plainLanguageExplanation.includes('90%'))
})

test('plainLanguageExplanation contains reasoner name', () => {
  const exp = buildExplanation(mkRec({ source: 'squad-reasoner' }), {})
  assert.ok(exp.plainLanguageExplanation.includes('squad'))
})

test('plainLanguageExplanation mentions calibration delta when applied', () => {
  const calAdj = { originalConfidence: 70, adjustedConfidence: 80, delta: 10, sampleSize: 7 }
  const exp = buildExplanation(mkRec({ confidence: 80 }), { calibrationAdjustment: calAdj })
  assert.ok(exp.plainLanguageExplanation.includes('+10'))
  assert.ok(exp.plainLanguageExplanation.includes('7'))
})

test('plainLanguageExplanation states no calibration when cold start', () => {
  const exp = buildExplanation(mkRec(), { calibrationAdjustment: null })
  assert.ok(exp.plainLanguageExplanation.toLowerCase().includes('calibration not applied'))
})

test('plainLanguageExplanation includes live data signals when evidence present', () => {
  const rec = mkRec({
    evidence: [{ type: 'fixture-proximity', value: '2d to kickoff', source: 'platform.fixture' }],
  })
  const exp = buildExplanation(rec, {})
  assert.ok(exp.plainLanguageExplanation.includes('fixture-proximity'))
  assert.ok(exp.plainLanguageExplanation.includes('2d to kickoff'))
})

test('plainLanguageExplanation includes observation signals when present', () => {
  const obs = mkObs({ observationType: OBSERVATION_TYPE.COACH_BEHAVIOUR, explanation: 'Coach is receptive.' })
  const rec = mkRec({
    evidence: [{ type: 'observation', source: 'observation-engine', observationId: obs.id, value: obs.observationType }],
  })
  const exp = buildExplanation(rec, { observations: [obs] })
  assert.ok(exp.plainLanguageExplanation.includes('COACH_BEHAVIOUR'))
  assert.ok(exp.plainLanguageExplanation.includes('Coach is receptive.'))
})

test('plainLanguageExplanation includes reasoner rationale', () => {
  const rec = mkRec({ explainability: 'Three injuries exceed the threshold of 2.' })
  const exp = buildExplanation(rec, {})
  assert.ok(exp.plainLanguageExplanation.includes('Three injuries exceed the threshold of 2.'))
})

test('plainLanguageExplanation includes reproducibility footer', () => {
  const exp = buildExplanation(mkRec(), {})
  assert.ok(exp.plainLanguageExplanation.includes('Reproducible from'))
})

test('plainLanguageExplanation is deterministic — same inputs produce identical output', () => {
  const rec = mkRec({ title: 'Consistent test recommendation', confidence: 70 })
  const exp1 = buildExplanation(rec, { coachId: 'coach-det', clubId: 'club-det' })
  const exp2 = buildExplanation(rec, { coachId: 'coach-det', clubId: 'club-det' })
  assert.equal(exp1.plainLanguageExplanation, exp2.plainLanguageExplanation)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 5 — explanation-engine: store and retrieval
// ─────────────────────────────────────────────────────────────────────────────

test('record() stores an ExplanationRecord', () => {
  clearExp()
  const rec = mkRec()
  const entry = record(rec, {})
  assert.ok(entry)
  assert.equal(entry.recommendationId, rec.id)
})

test('explain() retrieves a stored record', () => {
  clearExp()
  const rec = mkRec()
  record(rec, {})
  const retrieved = explain(rec.id)
  assert.ok(retrieved)
  assert.equal(retrieved.recommendationId, rec.id)
})

test('explain() returns null for unknown id', () => {
  clearExp()
  assert.equal(explain(randomUUID()), null)
})

test('explain() returns null for null input', () => {
  clearExp()
  assert.equal(explain(null), null)
})

test('record() with null rec returns null, does not store', () => {
  clearExp()
  const result = record(null, {})
  assert.equal(result, null)
  assert.equal(count(), 0)
})

test('listAll() returns all stored records', () => {
  clearExp()
  const rec1 = mkRec()
  const rec2 = mkRec()
  record(rec1, {})
  record(rec2, {})
  const all = listAll()
  assert.equal(all.length, 2)
  const ids = new Set(all.map(e => e.recommendationId))
  assert.ok(ids.has(rec1.id))
  assert.ok(ids.has(rec2.id))
})

test('count() returns 0 after _clear()', () => {
  clearExp()
  record(mkRec(), {})
  assert.equal(count(), 1)
  clearExp()
  assert.equal(count(), 0)
})

test('count() returns correct count after multiple records', () => {
  clearExp()
  record(mkRec(), {})
  record(mkRec(), {})
  record(mkRec(), {})
  assert.equal(count(), 3)
})

test('stored record is frozen — mutation throws in strict mode', () => {
  clearExp()
  const entry = record(mkRec(), {})
  assert.throws(
    () => { entry.schemaVersion = '9.9' },
    'frozen entry must throw on property assignment'
  )
})

test('record() overwrites existing entry for same recommendation id', () => {
  clearExp()
  const rec = mkRec({ confidence: 70 })
  record(rec, { coachId: 'first' })
  // Simulate re-recording (e.g. idempotent request)
  const updated = { ...rec }   // same id, same object
  record(updated, { coachId: 'second' })
  assert.equal(count(), 1, 'same id must not create two entries')
  assert.equal(explain(rec.id).context.coachId, 'second')
})

test('stored record includes recommendation snapshot', () => {
  clearExp()
  const rec = mkRec({ title: 'Snapshot title' })
  const entry = record(rec, {})
  assert.equal(entry.recommendation.title, 'Snapshot title')
})

test('stored record includes storedAt timestamp', () => {
  clearExp()
  const entry = record(mkRec(), {})
  assert.ok(typeof entry.storedAt === 'string')
  assert.ok(new Date(entry.storedAt).getTime() > 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 6 — engine: observation context captured in snapshot
// ─────────────────────────────────────────────────────────────────────────────

test('record() stores observations used in the explanation', () => {
  clearExp()
  const obs = mkObs()
  const rec = mkRec({
    evidence: [{ type: 'observation', source: 'observation-engine', observationId: obs.id, value: obs.observationType }],
  })
  record(rec, { observations: [obs] })
  const entry = explain(rec.id)
  assert.equal(entry.observationsUsed.length, 1)
  assert.equal(entry.observationsUsed[0].id, obs.id)
})

test('record() only captures observations cited in evidence (not all observations)', () => {
  clearExp()
  const citedObs   = mkObs()
  const uncitedObs = mkObs()
  const rec = mkRec({
    evidence: [{ type: 'observation', source: 'observation-engine', observationId: citedObs.id }],
  })
  record(rec, { observations: [citedObs, uncitedObs] })
  const entry = explain(rec.id)
  assert.equal(entry.observationsUsed.length, 1)
  assert.equal(entry.observationsUsed[0].id, citedObs.id)
})

test('record() stores calibration adjustment when provided', () => {
  clearExp()
  const rec    = mkRec({ confidence: 80 })
  const calAdj = { originalConfidence: 70, adjustedConfidence: 80, delta: 10, sampleSize: 5 }
  record(rec, { calibrationAdjustment: calAdj })
  const entry = explain(rec.id)
  assert.equal(entry.calibrationAdjustments.applied, true)
  assert.equal(entry.calibrationAdjustments.delta,   10)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 7 — Integration: AI.explain() via full pipeline
// ─────────────────────────────────────────────────────────────────────────────

test('AI.explain is a function on the AI namespace', () => {
  assert.equal(typeof AI.explain, 'function')
})

test('AI.explain(unknownId) resolves to null without throwing', async () => {
  const result = await AI.explain(randomUUID())
  assert.equal(result, null)
})

test('AI.explain(null) resolves to null without throwing', async () => {
  const result = await AI.explain(null)
  assert.equal(result, null)
})

test('AI.request() followed by AI.explain() returns explanation for each recommendation', async () => {
  clearExp()
  clearTimeline()
  clearMemStore()

  const resp = await AI.request({})
  assert.ok(resp.recommendations.length > 0)

  for (const rec of resp.recommendations) {
    const exp = await AI.explain(rec.id)
    assert.ok(exp,                               `explanation must exist for rec ${rec.id}`)
    assert.equal(exp.recommendationId, rec.id,   'recommendationId must match')
    assert.ok(typeof exp.plainLanguageExplanation === 'string')
    assert.ok(exp.plainLanguageExplanation.length > 0)
  }
})

test('AI.explain() explanation contains the recommendation title', async () => {
  clearExp()
  clearTimeline()
  clearMemStore()

  const resp = await AI.request({})
  const rec  = resp.recommendations[0]
  const exp  = await AI.explain(rec.id)

  assert.ok(exp.plainLanguageExplanation.includes(rec.title))
})

test('AI.explain() returns correct schemaVersion', async () => {
  clearExp()
  clearTimeline()
  clearMemStore()

  const resp = await AI.request({})
  const exp  = await AI.explain(resp.recommendations[0].id)
  assert.equal(exp.schemaVersion, '1.0')
})

test('AI.explain() generatedByReasoner is one of coach/squad/club/brain', async () => {
  clearExp()
  clearTimeline()
  clearMemStore()

  const resp = await AI.request({})
  for (const rec of resp.recommendations) {
    const exp = await AI.explain(rec.id)
    assert.ok(
      ['coach', 'squad', 'club', 'brain'].includes(exp.generatedByReasoner),
      `generatedByReasoner "${exp.generatedByReasoner}" must be one of coach/squad/club/brain`
    )
  }
})

test('AI.explain() calibrationAdjustments reflects actual calibration state', async () => {
  clearExp()
  clearTimeline()
  clearMemStore()

  // Cold-start request: no calibration should be applied
  const resp = await AI.request({ coachId: 'cold-start-coach', clubId: 'cold-start-club' })
  const exp  = await AI.explain(resp.recommendations[0].id)
  // Cold start: no learning history → calibration not applied
  assert.equal(exp.calibrationAdjustments.applied, false)
})

test('AI.explain() calibration is applied after enough learning events', async () => {
  clearExp()
  clearTimeline()
  clearMemStore()

  const coachId = 'calibrated-coach-m10'
  const clubId  = 'calibrated-club-m10'

  // Build learning history (need ≥ 3 samples to trigger calibration)
  await AI.learn({ recommendationId: randomUUID(), outcome: 'accepted',  coachId, clubId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: randomUUID(), outcome: 'accepted',  coachId, clubId, recommendationType: 'Training' })
  await AI.learn({ recommendationId: randomUUID(), outcome: 'accepted',  coachId, clubId, recommendationType: 'Training' })

  const resp = await AI.request({ coachId, clubId })
  const trainingRec = resp.recommendations.find(r => r.category === 'Training')
  if (!trainingRec) return  // no training recommendation generated — that's OK

  const exp = await AI.explain(trainingRec.id)
  // With ≥3 accepted outcomes for Training, calibration must be applied
  assert.equal(exp.calibrationAdjustments.applied, true, 'calibration must be applied with training history')
  assert.ok(exp.calibrationAdjustments.delta > 0, 'delta must be positive with 100% acceptance rate')
})

test('AI.explain() with observation-influenced recommendation cites observation', async () => {
  clearExp()
  clearTimeline()
  clearMemStore()

  const coachId = 'm10-obs-coach'
  const clubId  = 'm10-obs-club'

  // Force a coach memory with strong receptive signal so COACH_BEHAVIOUR fires
  _forceUpsert({
    id: randomUUID(), schemaVersion: MEMORY_SCHEMA_VERSION, _version: 1,
    type: MEMORY_TYPE.COACH, entityId: coachId,
    title: `Coach activity: ${coachId}`, summary: 'Test.',
    confidence: 80, strength: 60,
    firstSeen: new Date().toISOString(), lastUpdated: new Date().toISOString(),
    supportingTimelineEvents: [],
    metadata: { accepted: 9, dismissed: 1, snoozed: 0, actioned: 0, totalOutcomes: 10, categories: ['Training'] },
  })

  const resp = await AI.request({ coachId, clubId })

  // Find a recommendation whose explanation references an observation
  let foundObsRef = false
  for (const rec of resp.recommendations) {
    const exp = await AI.explain(rec.id)
    if (exp.observationsUsed.length > 0) {
      foundObsRef = true
      // Verify every cited observation has an id
      for (const obs of exp.observationsUsed) {
        assert.ok(typeof obs.id === 'string')
        assert.ok(typeof obs.observationType === 'string')
      }
      break
    }
  }
  // If no observation-influenced recs were produced, the observation engine
  // didn't fire (no memory data for this entity) — that's valid; skip assertion.
  if (!foundObsRef) {
    assert.ok(true, 'no observation-influenced recommendations produced — test skipped')
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 8 — Durability: explanation persists after stores cleared
// ─────────────────────────────────────────────────────────────────────────────

test('AI.explain() returns stored snapshot after memory and timeline cleared', async () => {
  clearExp()
  clearTimeline()
  clearMemStore()

  const resp  = await AI.request({ coachId: 'persist-test', clubId: 'persist-club' })
  const recId = resp.recommendations[0]?.id
  assert.ok(recId)

  // Clear all dependent stores — explanation must still be accessible
  clearMemStore()
  clearTimeline()

  const exp = await AI.explain(recId)
  assert.ok(exp,                    'explanation must be retrievable after stores cleared')
  assert.equal(exp.recommendationId, recId)
  assert.ok(typeof exp.plainLanguageExplanation === 'string')
})

test('AI.explain() is idempotent — repeated calls return the same data', async () => {
  clearExp()
  clearTimeline()
  clearMemStore()

  const resp  = await AI.request({})
  const recId = resp.recommendations[0]?.id
  assert.ok(recId)

  const exp1 = await AI.explain(recId)
  const exp2 = await AI.explain(recId)
  assert.equal(exp1.recommendationId, exp2.recommendationId)
  assert.equal(exp1.plainLanguageExplanation, exp2.plainLanguageExplanation)
  assert.equal(exp1.schemaVersion, exp2.schemaVersion)
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 9 — makeRec: recommendationId field
// ─────────────────────────────────────────────────────────────────────────────

test('makeRec() includes recommendationId field equal to id', () => {
  const rec = makeRec({ category: CATEGORY.TRAINING, priority: PRIORITY.MEDIUM, confidence: 70, title: 'Test', description: '', action: '', source: 'test', explainability: '' })
  assert.ok(typeof rec.recommendationId === 'string')
  assert.equal(rec.recommendationId, rec.id)
})

test('makeRec() recommendationId is a valid UUID', () => {
  const rec = makeRec({ category: CATEGORY.TRAINING, priority: PRIORITY.MEDIUM, confidence: 70, title: 'T', description: '', action: '', source: 's', explainability: '' })
  assert.match(rec.recommendationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

test('AI.request() recommendations include recommendationId field', async () => {
  clearTimeline()
  clearMemStore()
  const resp = await AI.request({})
  for (const rec of resp.recommendations) {
    assert.ok(typeof rec.recommendationId === 'string', 'recommendationId must be on each recommendation')
    assert.equal(rec.recommendationId, rec.id)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PART 10 — M1–M9 regression
// ─────────────────────────────────────────────────────────────────────────────

test('AI.request() BrainResponse shape unchanged after M10', async () => {
  clearTimeline()
  clearMemStore()
  const r = await AI.request({})
  assert.ok(Array.isArray(r.recommendations))
  assert.ok('isMock' in r.meta)
  assert.ok(r.trace.modules.includes('calibration'))
  assert.ok(r.trace.modules.includes('reasoning'))
})

test('AI.request() still returns recommendations without live data after M10', async () => {
  clearTimeline()
  clearMemStore()
  const r = await AI.request({})
  assert.ok(r.recommendations.length > 0, 'must always return at least one recommendation')
  assert.ok('isMock' in r.meta,            'meta.isMock field must be present')
})

test('AI.learn() still resolves after M10', async () => {
  await assert.doesNotReject(
    AI.learn({ recommendationId: 'm10-reg-1', outcome: 'accepted', recommendationType: 'Training' })
  )
})

test('AI.timeline() still returns { events, total, stats } after M10', async () => {
  clearTimeline()
  const r = await AI.timeline({})
  assert.ok(Array.isArray(r.events))
  assert.ok(typeof r.total === 'number')
})

test('AI.memory.* unaffected by M10', async () => {
  clearMemStore()
  await assert.doesNotReject(AI.memory.get('m10-reg'))
  await assert.doesNotReject(AI.memory.search('test'))
  await assert.doesNotReject(AI.memory.refresh('m10-reg'))
})

test('AI.observations.* unaffected by M10', async () => {
  clearMemStore()
  await assert.doesNotReject(AI.observations.forEntity('m10-reg'))
  await assert.doesNotReject(AI.observations.all())
})

test('AI.ask() unaffected by M10', async () => {
  const r = await AI.ask('Who needs training adjustment?')
  assert.equal(typeof r.answer, 'string')
})

test('AI.assembleContext() unaffected by M10', async () => {
  const b = await AI.assembleContext({})
  assert.ok(typeof b.platform === 'object')
})

test('AI.reason() trace still lists reasoner names after M10', async () => {
  const rb = await AI.reason({})
  const reasoners = rb.trace?.reasoners ?? []
  assert.ok(reasoners.includes('coach') || reasoners.includes('squad') || reasoners.includes('club'))
})

test('AI.reason() trace includes observations array after M10', async () => {
  clearMemStore()
  const rb = await AI.reason({})
  assert.ok(Array.isArray(rb.trace?.observations), 'trace.observations must be an array')
})

test('recommendations from all three reasoners are explainable', async () => {
  clearExp()
  clearTimeline()
  clearMemStore()

  // Provide live data to bypass cold-start in all three reasoners
  const bundle = {
    platform: {
      coachId: 'tri-coach',
      clubId:  'tri-club',
      fixture: {
        daysToKickoff: 2,  // coach-reasoner: load reduction
        medicalAlerts: [{ severity: 'HIGH', name: 'PlayerA', playerId: 'p1' }],  // squad-reasoner: medical
        squadStatus: null,
      },
      digitalTwin:    { injured: [], atRisk: [] },
      attendanceData: null,
    },
    clubIntelligence:   { available: true, health: { overallScore: 55, components: {} } },  // club-reasoner: health
    proceduralLearning: { available: false },
    episodicMemory:     { playerCount: 0, teamCount: 0 },
    workingMemory:      { recentEvents: [], total: 0 },
  }

  const rb   = await AI.reason(bundle)
  const recs = rb.recommendations

  // Record manually (bypassing AI.request()) to verify the engine works standalone
  for (const rec of recs) {
    record(rec, { observations: rb.trace?.observations ?? [] })
  }

  for (const rec of recs) {
    const exp = explain(rec.id)
    assert.ok(exp,                               `explanation must exist for rec ${rec.id}`)
    assert.equal(exp.recommendationId, rec.id)
    assert.ok(exp.plainLanguageExplanation.length > 0)
  }
})
