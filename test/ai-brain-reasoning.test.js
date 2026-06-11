/**
 * AI Brain — M4 Parallel Reasoning Tests
 *
 * Verifies:
 * 1. Shared utilities (makeRec, CATEGORY, PRIORITY shapes)
 * 2. Each reasoner: correct typed output, mock-mode fallback, live-data triggers
 * 3. Synthesis: deduplication, conflict resolution, sorting, evidence merging
 * 4. reason() orchestrator: parallel execution, ReasoningBundle shape, safety
 * 5. Integration: AI.request() uses reasoning layer (trace modules, meta shape)
 * 6. Regression: all M1–M3 contracts unaffected
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AI }        from '../ai-brain/index.js'
import { reason }    from '../ai-brain/reasoning.js'
import { synthesise } from '../ai-brain/synthesis.js'

import { makeRec, CATEGORY, PRIORITY, priorityScore } from '../ai-brain/reasoners/shared.js'
import { reason as coachReason, name as coachName } from '../ai-brain/reasoners/coach-reasoner.js'
import { reason as squadReason, name as squadName } from '../ai-brain/reasoners/squad-reasoner.js'
import { reason as clubReason,  name as clubName  } from '../ai-brain/reasoners/club-reasoner.js'

// ── Shared utilities ──────────────────────────────────────────────────────────

test('CATEGORY has all required keys', () => {
  for (const k of ['SELECTION', 'TRAINING', 'MEDICAL', 'LOGISTICS', 'PLAYER_WELFARE', 'CLUB', 'PERFORMANCE']) {
    assert.equal(typeof CATEGORY[k], 'string', `CATEGORY.${k} must be string`)
  }
})

test('PRIORITY has HIGH, MEDIUM, LOW', () => {
  assert.equal(PRIORITY.HIGH,   'HIGH')
  assert.equal(PRIORITY.MEDIUM, 'MEDIUM')
  assert.equal(PRIORITY.LOW,    'LOW')
})

test('makeRec() returns all required recommendation fields', () => {
  const r = makeRec({ category: CATEGORY.TRAINING, priority: PRIORITY.HIGH, confidence: 80, title: 'Test', source: 'test' })
  assert.equal(typeof r.id,             'string')
  assert.equal(typeof r.category,       'string')
  assert.equal(typeof r.priority,       'string')
  assert.equal(typeof r.confidence,     'number')
  assert.equal(typeof r.title,          'string')
  assert.equal(typeof r.description,    'string')
  assert.equal(typeof r.action,         'string')
  assert.equal(typeof r.source,         'string')
  assert.equal(typeof r.explainability, 'string')
  assert.ok(Array.isArray(r.evidence),  'evidence must be array')
  assert.ok(typeof r._score === 'number', '_score must be number for ranking')
})

test('makeRec() clamps confidence to [0, 100]', () => {
  assert.equal(makeRec({ confidence: 150 }).confidence, 100)
  assert.equal(makeRec({ confidence: -10  }).confidence, 0)
  assert.equal(makeRec({ confidence: 75   }).confidence, 75)
})

test('makeRec() applies safe defaults for missing fields', () => {
  const r = makeRec({})
  assert.equal(typeof r.id,    'string')
  assert.equal(r.title,        '')
  assert.equal(r.description,  '')
  assert.equal(r.action,       '')
  assert.equal(r.source,       'brain')
  assert.equal(r.confidence,   50)
})

test('priorityScore returns higher score for higher priority', () => {
  assert.ok(priorityScore('HIGH') > priorityScore('MEDIUM'))
  assert.ok(priorityScore('MEDIUM') > priorityScore('LOW'))
})

// ── Reasoner names ────────────────────────────────────────────────────────────

test('reasoner names are correct strings', () => {
  assert.equal(coachName, 'coach')
  assert.equal(squadName, 'squad')
  assert.equal(clubName,  'club')
})

// ── ReasoningResult shape contract ────────────────────────────────────────────

function assertReasoningResultShape(result, label) {
  assert.equal(typeof result.reasoner, 'string',               `${label}.reasoner must be string`)
  assert.ok(Array.isArray(result.recommendations),             `${label}.recommendations must be array`)
  assert.ok(Array.isArray(result.insights),                    `${label}.insights must be array`)
  assert.ok(Array.isArray(result.warnings),                    `${label}.warnings must be array`)
  assert.ok(Array.isArray(result.evidence),                    `${label}.evidence must be array`)
  assert.equal(typeof result.durationMs, 'number',             `${label}.durationMs must be number`)
  assert.ok(result.durationMs >= 0,                            `${label}.durationMs must be non-negative`)
}

// ── Coach Reasoner ────────────────────────────────────────────────────────────

test('coachReason() returns correct ReasoningResult shape', () => {
  const result = coachReason({})
  assertReasoningResultShape(result, 'coachReason')
  assert.equal(result.reasoner, 'coach')
})

test('coachReason() returns mock fallback when no live data', () => {
  const result = coachReason({ platform: { fixture: null, digitalTwin: null, attendanceData: null }, workingMemory: {} })
  assert.ok(result.recommendations.length > 0, 'must have at least one mock rec')
  assert.ok(result.recommendations[0].source.includes('/mock'), 'mock rec source must include /mock')
})

test('coachReason() fires training load rec when daysToKickoff <= 3', () => {
  const bundle = {
    platform: {
      fixture:        { daysToKickoff: 2, squadStatus: { unavailable: [], available: [] } },
      digitalTwin:    null,
      attendanceData: null,
    },
    workingMemory: {},
  }
  const result = coachReason(bundle)
  const trainingRec = result.recommendations.find(r => r.category === CATEGORY.TRAINING && r.source === 'coach-reasoner')
  assert.ok(trainingRec, 'should fire training load rec for 2d to kickoff')
  assert.equal(trainingRec.confidence, 80)
})

test('coachReason() does NOT fire training load rec when daysToKickoff > 3', () => {
  const bundle = {
    platform: { fixture: { daysToKickoff: 10 }, digitalTwin: null, attendanceData: null },
    workingMemory: {},
  }
  const result = coachReason(bundle)
  const loadRec = result.recommendations.find(r => r.title?.includes('Match week: reduce'))
  assert.equal(loadRec, undefined, 'should not fire training load rec at 10d out')
})

test('coachReason() fires position shortage rec when 2+ same position unavailable', () => {
  const bundle = {
    platform: {
      fixture: {
        daysToKickoff: 5,
        squadStatus: {
          unavailable: [
            { name: 'Player A', position: 'Prop' },
            { name: 'Player B', position: 'Prop' },
          ],
          available: [],
        },
      },
      digitalTwin: null, attendanceData: null,
    },
    workingMemory: {},
  }
  const result = coachReason(bundle)
  const selRec = result.recommendations.find(r => r.category === CATEGORY.SELECTION)
  assert.ok(selRec, 'should fire position shortage rec')
})

test('coachReason() fires attendance rec when rate < 80', () => {
  const bundle = {
    platform: {
      fixture:        null,
      digitalTwin:    null,
      attendanceData: { averageRate: 71 },
    },
    workingMemory: {},
  }
  const result = coachReason(bundle)
  const attRec = result.recommendations.find(r => r.source === 'coach-reasoner' && r.category === CATEGORY.TRAINING)
  assert.ok(attRec, 'should fire attendance rec')
  assert.ok(attRec.title.includes('71%'), 'title should include the rate')
})

test('coachReason() fires HIGH priority attendance rec when rate < 65', () => {
  const bundle = {
    platform: { fixture: null, digitalTwin: null, attendanceData: { averageRate: 60 } },
    workingMemory: {},
  }
  const result = coachReason(bundle)
  const attRec = result.recommendations.find(r => r.source === 'coach-reasoner' && r.category === CATEGORY.TRAINING)
  assert.equal(attRec?.priority, PRIORITY.HIGH)
})

test('coachReason() never throws on null bundle', () => {
  assert.doesNotThrow(() => coachReason(null))
  assert.doesNotThrow(() => coachReason(undefined))
  assert.doesNotThrow(() => coachReason({}))
})

test('coachReason() evidence items include type and source fields', () => {
  const bundle = {
    platform: { fixture: { daysToKickoff: 1 }, digitalTwin: null, attendanceData: null },
    workingMemory: {},
  }
  const result = coachReason(bundle)
  for (const ev of result.evidence) {
    assert.equal(typeof ev.type,   'string', 'evidence.type must be string')
    assert.equal(typeof ev.source, 'string', 'evidence.source must be string')
  }
})

// ── Squad Reasoner ────────────────────────────────────────────────────────────

test('squadReason() returns correct ReasoningResult shape', () => {
  const result = squadReason({})
  assertReasoningResultShape(result, 'squadReason')
  assert.equal(result.reasoner, 'squad')
})

test('squadReason() returns mock fallback when no live data', () => {
  const result = squadReason({
    platform: { fixture: null, digitalTwin: null },
    episodicMemory: { playerCount: 0, teamCount: 0, available: false },
  })
  assert.ok(result.recommendations.length > 0)
  assert.ok(result.recommendations[0].source.includes('/mock'))
})

test('squadReason() fires injury rec when >= 3 concurrent injuries', () => {
  const bundle = {
    platform: {
      fixture:     { squadStatus: { available: [], unavailable: [] }, medicalAlerts: [] },
      digitalTwin: { injured: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], atRisk: [] },
      attendanceData: null,
    },
    episodicMemory: { playerCount: 20, available: true },
  }
  const result = squadReason(bundle)
  const injuryRec = result.recommendations.find(r => r.category === CATEGORY.MEDICAL && r.source === 'squad-reasoner' && r.title.includes('active injuries'))
  assert.ok(injuryRec, 'should fire injury rec')
})

test('squadReason() fires HIGH injury rec when >= 5 concurrent injuries', () => {
  const bundle = {
    platform: {
      fixture:     { medicalAlerts: [], squadStatus: {} },
      digitalTwin: { injured: [1,2,3,4,5].map(i => ({ id: `p${i}` })), atRisk: [] },
      attendanceData: null,
    },
    episodicMemory: { playerCount: 20, available: true },
  }
  const result = squadReason(bundle)
  const rec = result.recommendations.find(r => r.title?.includes('active injuries'))
  assert.equal(rec?.priority, PRIORITY.HIGH)
})

test('squadReason() fires HIGH medical alert rec for HIGH severity alerts', () => {
  const bundle = {
    platform: {
      fixture: {
        medicalAlerts: [{ playerId: 'p1', name: 'Ross Dunne', severity: 'HIGH' }],
        squadStatus:   { available: [], uncertain: [] },
      },
      digitalTwin:    { injured: [], atRisk: [] },
      attendanceData: null,
    },
    episodicMemory: { playerCount: 10, available: true },
  }
  const result = squadReason(bundle)
  const rec = result.recommendations.find(r => r.priority === PRIORITY.HIGH && r.category === CATEGORY.MEDICAL)
  assert.ok(rec, 'should fire high-severity alert rec')
})

test('squadReason() fires squad depth rec when total < 20', () => {
  const bundle = {
    platform: {
      fixture: {
        squadStatus:   { available: new Array(10).fill({ name: 'P', position: 'X' }), uncertain: [] },
        medicalAlerts: [],
      },
      digitalTwin:    { injured: [], atRisk: [] },
      attendanceData: null,
    },
    episodicMemory: { playerCount: 10, available: true },
  }
  const result = squadReason(bundle)
  const rec = result.recommendations.find(r => r.source === 'squad-reasoner' && r.category === CATEGORY.SELECTION)
  assert.ok(rec, 'should fire squad depth rec')
})

test('squadReason() adds tracked-players insight when playerCount > 0', () => {
  const bundle = {
    platform: { fixture: { medicalAlerts: [], squadStatus: {} }, digitalTwin: { injured: [], atRisk: [] }, attendanceData: null },
    episodicMemory: { playerCount: 15, teamCount: 2, available: true },
  }
  const result = squadReason(bundle)
  const ins = result.insights.find(i => i.key === 'tracked-players')
  assert.ok(ins, 'should add tracked-players insight')
  assert.equal(ins.value, 15)
})

test('squadReason() never throws on null bundle', () => {
  assert.doesNotThrow(() => squadReason(null))
  assert.doesNotThrow(() => squadReason(undefined))
})

// ── Club Reasoner ─────────────────────────────────────────────────────────────

test('clubReason() returns correct ReasoningResult shape', () => {
  const result = clubReason({})
  assertReasoningResultShape(result, 'clubReason')
  assert.equal(result.reasoner, 'club')
})

test('clubReason() returns mock fallback when no live data', () => {
  const result = clubReason({
    clubIntelligence: { available: false },
    proceduralLearning: { available: false },
    platform: { seasonData: null },
  })
  assert.ok(result.recommendations.length > 0)
  assert.ok(result.recommendations[0].source.includes('/mock'))
})

test('clubReason() fires club health rec when overall score < 65', () => {
  const bundle = {
    clubIntelligence:   { available: true, health: { overallScore: 55, components: { engagement: 48, attendance: 70 } } },
    proceduralLearning: { available: false },
    platform:           { seasonData: null },
  }
  const result = clubReason(bundle)
  const rec = result.recommendations.find(r => r.source === 'club-reasoner' && r.category === CATEGORY.CLUB)
  assert.ok(rec, 'should fire club health rec')
  assert.ok(rec.title.includes('55/100'), 'title should include score')
})

test('clubReason() fires HIGH priority club rec when score < 50', () => {
  const bundle = {
    clubIntelligence:   { available: true, health: { overallScore: 45 } },
    proceduralLearning: { available: false },
    platform:           { seasonData: null },
  }
  const result = clubReason(bundle)
  const rec = result.recommendations.find(r => r.source === 'club-reasoner')
  assert.equal(rec?.priority, PRIORITY.HIGH)
})

test('clubReason() does NOT fire club health rec when score >= 65', () => {
  const bundle = {
    clubIntelligence:   { available: true, health: { overallScore: 72 } },
    proceduralLearning: { available: false },
    platform:           { seasonData: null },
  }
  const result = clubReason(bundle)
  const rec = result.recommendations.find(r => r.source === 'club-reasoner' && r.category === CATEGORY.CLUB)
  assert.equal(rec, undefined)
})

test('clubReason() fires engagement rec when engagement < 60', () => {
  const bundle = {
    clubIntelligence:   { available: true, health: { overallScore: 70, components: { engagement: 45 } } },
    proceduralLearning: { available: false },
    platform:           { seasonData: null },
  }
  const result = clubReason(bundle)
  const rec = result.recommendations.find(r => r.source === 'club-reasoner' && r.title?.includes('engagement'))
  assert.ok(rec, 'should fire engagement rec')
})

test('clubReason() adds CIS grade insight when available', () => {
  const bundle = {
    clubIntelligence:   { available: true, health: { overallScore: 75 } },
    proceduralLearning: { available: true, cis: { grade: 'B+', stage: 'CALIBRATING' } },
    platform:           { seasonData: null },
  }
  const result = clubReason(bundle)
  const ins = result.insights.find(i => i.key === 'cis-grade')
  assert.ok(ins, 'should add cis-grade insight')
  assert.equal(ins.value, 'B+')
})

test('clubReason() adds calibration-maturity insight when available', () => {
  const bundle = {
    clubIntelligence:   { available: false },
    proceduralLearning: { available: true, calibration: { calibrationMaturity: 'MATURE', totalOutcomesSeen: 50 } },
    platform:           { seasonData: null },
  }
  const result = clubReason(bundle)
  const ins = result.insights.find(i => i.key === 'calibration-maturity')
  assert.ok(ins)
  assert.equal(ins.value, 'MATURE')
})

test('clubReason() adds COLD_START warning when maturity is COLD_START', () => {
  const bundle = {
    clubIntelligence:   { available: false },
    proceduralLearning: { available: true, calibration: { calibrationMaturity: 'COLD_START', totalOutcomesSeen: 2 } },
    platform:           { seasonData: null },
  }
  const result = clubReason(bundle)
  const w = result.warnings.find(w => w.message.includes('COLD_START'))
  assert.ok(w, 'should add cold-start warning')
})

test('clubReason() adds season-phase insight when seasonData present', () => {
  const bundle = {
    clubIntelligence:   { available: false },
    proceduralLearning: { available: false },
    platform:           { seasonData: { phase: 'COMPETITIVE' } },
  }
  const result = clubReason(bundle)
  const ins = result.insights.find(i => i.key === 'season-phase')
  assert.ok(ins)
  assert.equal(ins.value, 'COMPETITIVE')
})

test('clubReason() never throws on null bundle', () => {
  assert.doesNotThrow(() => clubReason(null))
  assert.doesNotThrow(() => clubReason(undefined))
})

// ── Synthesis ─────────────────────────────────────────────────────────────────

function makeResult(reasonerName, recs = [], insights = [], warnings = [], evidence = []) {
  return { reasoner: reasonerName, recommendations: recs, insights, warnings, evidence, durationMs: 5 }
}

test('synthesise() returns ReasoningBundle with all required fields', () => {
  const rb = synthesise([makeResult('coach'), makeResult('squad'), makeResult('club')])
  assert.ok(Array.isArray(rb.recommendations))
  assert.ok(Array.isArray(rb.insights))
  assert.ok(Array.isArray(rb.warnings))
  assert.ok(Array.isArray(rb.evidence))
  assert.ok(typeof rb.trace === 'object')
  assert.ok(Array.isArray(rb.trace.reasoners))
  assert.ok(typeof rb.trace.reasonerDurations === 'object')
  assert.ok(typeof rb.trace.synthesisDurationMs === 'number')
  assert.ok(typeof rb.trace.totalDurationMs === 'number')
  assert.ok(typeof rb.trace.recommendationCount === 'object')
  assert.ok(typeof rb.trace.recommendationCount.preMerge === 'number')
  assert.ok(typeof rb.trace.recommendationCount.postMerge === 'number')
})

test('synthesise() trace lists all reasoner names', () => {
  const rb = synthesise([makeResult('coach'), makeResult('squad'), makeResult('club')])
  assert.ok(rb.trace.reasoners.includes('coach'))
  assert.ok(rb.trace.reasoners.includes('squad'))
  assert.ok(rb.trace.reasoners.includes('club'))
})

test('synthesise() deduplicates recommendations with same category+title', () => {
  const r1 = makeRec({ category: CATEGORY.TRAINING, priority: PRIORITY.MEDIUM, confidence: 70, title: 'Same title', source: 'a' })
  const r2 = makeRec({ category: CATEGORY.TRAINING, priority: PRIORITY.MEDIUM, confidence: 80, title: 'Same title', source: 'b' })
  const rb = synthesise([
    makeResult('coach', [r1]),
    makeResult('squad', [r2]),
  ])
  assert.equal(rb.recommendations.length, 1, 'duplicate recs must be merged to one')
})

test('synthesise() keeps higher-confidence rec when merging duplicates', () => {
  const r1 = makeRec({ category: CATEGORY.TRAINING, confidence: 60, title: 'Same title', source: 'a' })
  const r2 = makeRec({ category: CATEGORY.TRAINING, confidence: 90, title: 'Same title', source: 'b' })
  const rb = synthesise([makeResult('coach', [r1]), makeResult('squad', [r2])])
  assert.equal(rb.recommendations[0].confidence, 90, 'merged rec should have higher confidence')
})

test('synthesise() merges evidence arrays from duplicate recs', () => {
  const ev1 = { type: 'a', value: '1', source: 'src-a' }
  const ev2 = { type: 'b', value: '2', source: 'src-b' }
  const r1  = makeRec({ category: CATEGORY.TRAINING, confidence: 70, title: 'Same', source: 'a', evidence: [ev1] })
  const r2  = makeRec({ category: CATEGORY.TRAINING, confidence: 80, title: 'Same', source: 'b', evidence: [ev2] })
  const rb  = synthesise([makeResult('coach', [r1]), makeResult('squad', [r2])])
  assert.equal(rb.recommendations[0].evidence.length, 2, 'evidence must be merged')
})

test('synthesise() preserves distinct recommendations', () => {
  const r1 = makeRec({ category: CATEGORY.TRAINING,  confidence: 70, title: 'Train A', source: 'a' })
  const r2 = makeRec({ category: CATEGORY.MEDICAL,   confidence: 80, title: 'Medical B', source: 'b' })
  const rb = synthesise([makeResult('coach', [r1]), makeResult('squad', [r2])])
  assert.equal(rb.recommendations.length, 2)
})

test('synthesise() sorts recommendations by _score descending (HIGH before LOW)', () => {
  const low  = makeRec({ priority: PRIORITY.LOW,  confidence: 50, title: 'Low',  source: 'x', category: CATEGORY.CLUB })
  const high = makeRec({ priority: PRIORITY.HIGH, confidence: 90, title: 'High', source: 'x', category: CATEGORY.MEDICAL })
  const rb   = synthesise([makeResult('coach', [low, high])])
  assert.equal(rb.recommendations[0].priority, PRIORITY.HIGH, 'HIGH should come first')
})

test('synthesise() strips _score from output recommendations', () => {
  const r = makeRec({ category: CATEGORY.CLUB, confidence: 70, title: 'T', source: 's' })
  const rb = synthesise([makeResult('coach', [r])])
  assert.ok(!('_score' in rb.recommendations[0]), '_score must be stripped from output')
})

test('synthesise() deduplicates insights by key, keeping highest confidence', () => {
  const i1 = { key: 'cis-grade', value: 'B', confidence: 70 }
  const i2 = { key: 'cis-grade', value: 'B+', confidence: 90 }
  const rb = synthesise([
    makeResult('club',  [], [i1]),
    makeResult('coach', [], [i2]),
  ])
  const ins = rb.insights.find(i => i.key === 'cis-grade')
  assert.ok(ins, 'insight must be present')
  assert.equal(ins.confidence, 90, 'highest confidence insight wins')
})

test('synthesise() deduplicates warnings by message', () => {
  const w = { message: 'same warning', severity: 'low' }
  const rb = synthesise([
    makeResult('club',  [], [], [w]),
    makeResult('coach', [], [], [w]),
  ])
  assert.equal(rb.warnings.filter(x => x.message === 'same warning').length, 1)
})

test('synthesise() attaches reasoner field to all evidence items', () => {
  const ev = { type: 't', value: 'v', source: 's' }
  const rb = synthesise([makeResult('coach', [], [], [], [ev])])
  assert.ok(rb.evidence.length > 0)
  assert.equal(typeof rb.evidence[0].reasoner, 'string')
})

test('synthesise() trace.recommendationCount.preMerge equals total input recs', () => {
  const r1 = makeRec({ category: CATEGORY.TRAINING, confidence: 70, title: 'A', source: 'a' })
  const r2 = makeRec({ category: CATEGORY.MEDICAL,  confidence: 80, title: 'B', source: 'b' })
  const r3 = makeRec({ category: CATEGORY.CLUB,     confidence: 60, title: 'C', source: 'c' })
  const rb = synthesise([
    makeResult('coach', [r1]),
    makeResult('squad', [r2]),
    makeResult('club',  [r3]),
  ])
  assert.equal(rb.trace.recommendationCount.preMerge, 3)
  assert.equal(rb.trace.recommendationCount.postMerge, 3)
})

test('synthesise() handles empty results array', () => {
  const rb = synthesise([])
  assert.ok(Array.isArray(rb.recommendations))
  assert.ok(Array.isArray(rb.insights))
  assert.ok(Array.isArray(rb.warnings))
  assert.equal(rb.recommendations.length, 0)
})

// ── reason() orchestrator ─────────────────────────────────────────────────────

test('reason() returns ReasoningBundle with all required fields', async () => {
  const rb = await reason({})
  assert.ok(Array.isArray(rb.recommendations), 'recommendations must be array')
  assert.ok(Array.isArray(rb.insights),        'insights must be array')
  assert.ok(Array.isArray(rb.warnings),        'warnings must be array')
  assert.ok(Array.isArray(rb.evidence),        'evidence must be array')
  assert.ok(typeof rb.trace === 'object',      'trace must be object')
})

test('reason() trace includes all three reasoner names', async () => {
  const rb = await reason({})
  assert.ok(rb.trace.reasoners.includes('coach'), 'trace must include coach')
  assert.ok(rb.trace.reasoners.includes('squad'), 'trace must include squad')
  assert.ok(rb.trace.reasoners.includes('club'),  'trace must include club')
})

test('reason() trace.totalDurationMs is a non-negative number', async () => {
  const rb = await reason({})
  assert.ok(typeof rb.trace.totalDurationMs === 'number')
  assert.ok(rb.trace.totalDurationMs >= 0)
})

test('reason() trace.synthesisDurationMs is a non-negative number', async () => {
  const rb = await reason({})
  assert.ok(rb.trace.synthesisDurationMs >= 0)
})

test('reason() trace.reasonerDurations has coach, squad, club keys', async () => {
  const rb = await reason({})
  assert.ok('coach' in rb.trace.reasonerDurations)
  assert.ok('squad' in rb.trace.reasonerDurations)
  assert.ok('club'  in rb.trace.reasonerDurations)
})

test('reason() returns at least one recommendation on empty bundle (mock mode)', async () => {
  const rb = await reason({})
  assert.ok(rb.recommendations.length > 0, 'must return mock recs when no live data')
})

test('reason() never rejects', async () => {
  await assert.doesNotReject(reason({}))
  await assert.doesNotReject(reason(null))
  await assert.doesNotReject(reason(undefined))
})

test('reason() recommendations all have id, title, priority, confidence', async () => {
  const rb = await reason({})
  for (const rec of rb.recommendations) {
    assert.equal(typeof rec.id,         'string', 'rec.id must be string')
    assert.equal(typeof rec.title,      'string', 'rec.title must be string')
    assert.ok(rec.priority !== undefined,          'rec.priority must exist')
    assert.equal(typeof rec.confidence, 'number', 'rec.confidence must be number')
  }
})

test('reason() output recommendations have no _score field', async () => {
  const rb = await reason({})
  for (const rec of rb.recommendations) {
    assert.ok(!('_score' in rec), '_score must not appear in output')
  }
})

test('reason() with live fixture fires real recommendations, not mock', async () => {
  const bundle = {
    platform: {
      fixture: {
        daysToKickoff: 2,
        squadStatus:   { available: [], unavailable: [], uncertain: [] },
        medicalAlerts: [],
      },
      digitalTwin:    { injured: [], atRisk: [] },
      attendanceData: null,
    },
    workingMemory:      { recentEvents: [], total: 0, stats: {} },
    episodicMemory:     { players: [], teams: [], playerCount: 0, teamCount: 0, available: false },
    clubIntelligence:   { available: false },
    proceduralLearning: { available: false },
    assembledAt:        new Date().toISOString(),
    assemblyDurationMs: 0,
    providers: { knowledgeGraph: false, memoryEngine: false, timeline: false, learningEngine: false, clubIntelligence: false },
  }
  const rb = await reason(bundle)
  const realRec = rb.recommendations.find(r => !r.source.includes('/mock'))
  assert.ok(realRec, 'should produce at least one real (non-mock) recommendation')
})

// ── AI.reason namespace ───────────────────────────────────────────────────────

test('AI.reason is a function', () => {
  assert.equal(typeof AI.reason, 'function')
})

test('AI.reason() returns ReasoningBundle shape', async () => {
  const rb = await AI.reason({})
  assert.ok(Array.isArray(rb.recommendations))
  assert.ok(Array.isArray(rb.insights))
  assert.ok(typeof rb.trace === 'object')
})

test('AI.reason() never rejects', async () => {
  await assert.doesNotReject(AI.reason({}))
  await assert.doesNotReject(AI.reason(null))
})

// ── Integration: AI.request() uses reasoning layer ────────────────────────────

test('AI.request() trace.modules includes context-assembly, reasoning, synthesis', async () => {
  const result = await AI.request({})
  const modules = result.trace?.modules ?? []
  assert.ok(modules.includes('context-assembly'), `modules must include context-assembly, got [${modules}]`)
  assert.ok(modules.includes('reasoning'),        `modules must include reasoning, got [${modules}]`)
  assert.ok(modules.includes('synthesis'),        `modules must include synthesis, got [${modules}]`)
})

test('AI.request() meta includes isMock, total, highCount, mediumCount, lowCount, categories', async () => {
  const result = await AI.request({})
  assert.ok('isMock'      in result.meta, 'meta.isMock must exist')
  assert.ok('total'       in result.meta, 'meta.total must exist')
  assert.ok('highCount'   in result.meta, 'meta.highCount must exist')
  assert.ok('mediumCount' in result.meta, 'meta.mediumCount must exist')
  assert.ok('lowCount'    in result.meta, 'meta.lowCount must exist')
  assert.ok('categories'  in result.meta, 'meta.categories must exist')
  assert.ok(Array.isArray(result.meta.categories))
})

test('AI.request() meta.reasoning contains the ReasoningBundle trace', async () => {
  const result = await AI.request({})
  assert.ok(typeof result.meta.reasoning === 'object', 'meta.reasoning must be object')
  assert.ok(Array.isArray(result.meta.reasoning.reasoners), 'meta.reasoning.reasoners must be array')
})

test('AI.request() meta.providers is the ContextBundle providers map', async () => {
  const result = await AI.request({})
  assert.ok(typeof result.meta.providers === 'object', 'meta.providers must be object')
})

test('AI.request() returns BrainResponse with recommendations array', async () => {
  const result = await AI.request({})
  assert.ok(Array.isArray(result.recommendations))
  assert.ok(typeof result.meta  === 'object')
  assert.ok(typeof result.trace === 'object')
})

test('AI.request() still never rejects after M4 wiring', async () => {
  await assert.doesNotReject(AI.request(null))
  await assert.doesNotReject(AI.request(undefined))
  await assert.doesNotReject(AI.request({}))
})

// ── Regression: M1–M3 contracts ───────────────────────────────────────────────

test('AI.request() recommendations have required M1 fields', async () => {
  const result = await AI.request({})
  for (const rec of result.recommendations) {
    assert.equal(typeof rec.id,         'string')
    assert.equal(typeof rec.title,      'string')
    assert.ok(rec.priority !== undefined)
    assert.equal(typeof rec.confidence, 'number')
  }
})

test('AI.request() meta.isMock is present (M2 backward compat)', async () => {
  const result = await AI.request({})
  assert.ok('isMock' in result.meta)
})

test('AI.request() trace.modules includes context-assembly (M3 backward compat)', async () => {
  const result = await AI.request({})
  assert.ok(result.trace.modules.includes('context-assembly'))
})

test('AI.ask() still returns QueryResponse — unaffected by M4', async () => {
  const result = await AI.ask({ question: 'What is our squad health?' })
  assert.equal(typeof result.answer, 'string')
  assert.equal(typeof result.confidence, 'number')
})

test('AI.learn() still resolves — unaffected by M4', async () => {
  await assert.doesNotReject(AI.learn({ recommendationId: 'r-m4', outcome: 'accepted' }))
})

test('AI.assembleContext() still works — M3 unaffected by M4', async () => {
  const bundle = await AI.assembleContext({})
  assert.ok(typeof bundle.platform === 'object')
  assert.ok(typeof bundle.providers === 'object')
})
