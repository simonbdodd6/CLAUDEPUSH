/**
 * AI Brain — M3 Context Assembly Tests
 *
 * Verifies:
 * 1. Each provider returns the correct shape and marks available correctly
 * 2. Each provider's fallback is safe when the underlying module throws
 * 3. assembleContext() builds a complete, strongly-typed ContextBundle
 * 4. assembleContext() never rejects — any provider failure is isolated
 * 5. AI.request() trace includes 'context-assembly' (integration: bundle wired in)
 * 6. All M3 additions preserve M1/M2 contracts (no regressions)
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AI } from '../ai-brain/index.js'
import { assembleContext } from '../ai-brain/context-assembly.js'

// ── Provider fallback shapes ───────────────────────────────────────────────────

import * as kgProvider  from '../ai-brain/providers/knowledge-graph-provider.js'
import * as memProvider from '../ai-brain/providers/memory-engine-provider.js'
import * as tlProvider  from '../ai-brain/providers/timeline-provider.js'
import * as leProvider  from '../ai-brain/providers/learning-provider.js'
import * as ciProvider  from '../ai-brain/providers/club-intelligence-provider.js'

test('knowledge-graph-provider: fallback has correct shape', () => {
  const fb = kgProvider.fallback
  assert.ok(typeof fb.stats === 'object',           'stats must be object')
  assert.ok(typeof fb.stats.nodeCount === 'number', 'nodeCount must be number')
  assert.ok(typeof fb.stats.edgeCount === 'number', 'edgeCount must be number')
  assert.ok(typeof fb.stats.byType    === 'object', 'byType must be object')
  assert.ok(typeof fb.stats.byEdgeType === 'object','byEdgeType must be object')
  assert.equal(fb.available, false)
})

test('memory-engine-provider: fallback has correct shape', () => {
  const fb = memProvider.fallback
  assert.ok(Array.isArray(fb.players), 'players must be array')
  assert.ok(Array.isArray(fb.teams),   'teams must be array')
  assert.equal(typeof fb.playerCount, 'number')
  assert.equal(typeof fb.teamCount,   'number')
  assert.equal(fb.available, false)
})

test('timeline-provider: fallback has correct shape', () => {
  const fb = tlProvider.fallback
  assert.ok(Array.isArray(fb.recentEvents), 'recentEvents must be array')
  assert.equal(typeof fb.total,   'number')
  assert.equal(typeof fb.stats,   'object')
  assert.equal(fb.available, false)
})

test('learning-provider: fallback has correct shape', () => {
  const fb = leProvider.fallback
  assert.ok('cis'         in fb, 'fallback must have cis')
  assert.ok('calibration' in fb, 'fallback must have calibration')
  assert.ok('accuracy'    in fb, 'fallback must have accuracy')
  assert.equal(fb.available, false)
})

test('club-intelligence-provider: fallback has correct shape', () => {
  const fb = ciProvider.fallback
  assert.ok('health'       in fb,            'fallback must have health')
  assert.ok(Array.isArray(fb.insights),      'insights must be array')
  assert.equal(fb.available, false)
})

// ── Provider names ─────────────────────────────────────────────────────────────

test('all providers export a name string', () => {
  for (const p of [kgProvider, memProvider, tlProvider, leProvider, ciProvider]) {
    assert.equal(typeof p.name, 'string', `provider name must be string (got ${p.name})`)
    assert.ok(p.name.length > 0, 'provider name must not be empty')
  }
})

test('all providers export a fetch function', () => {
  for (const p of [kgProvider, memProvider, tlProvider, leProvider, ciProvider]) {
    assert.equal(typeof p.fetch, 'function', `${p.name} must export fetch()`)
  }
})

// ── Provider fetch — shape contracts ──────────────────────────────────────────

test('knowledge-graph-provider.fetch() returns object with available field', async () => {
  const result = await kgProvider.fetch()
  assert.ok(typeof result === 'object',              'result must be object')
  assert.ok('available' in result,                   'must have available')
  assert.ok('stats'     in result,                   'must have stats')
  assert.ok(typeof result.stats === 'object')
})

test('knowledge-graph-provider.fetch() never rejects', async () => {
  await assert.doesNotReject(kgProvider.fetch())
})

test('memory-engine-provider.fetch() returns object with players, teams arrays', async () => {
  const result = await memProvider.fetch()
  assert.ok(Array.isArray(result.players),           'players must be array')
  assert.ok(Array.isArray(result.teams),             'teams must be array')
  assert.ok(typeof result.playerCount === 'number',  'playerCount must be number')
  assert.ok(typeof result.teamCount   === 'number',  'teamCount must be number')
  assert.ok('available' in result)
})

test('memory-engine-provider.fetch() never rejects', async () => {
  await assert.doesNotReject(memProvider.fetch())
})

test('timeline-provider.fetch() returns object with recentEvents, total, stats', async () => {
  const result = await tlProvider.fetch()
  assert.ok(Array.isArray(result.recentEvents),      'recentEvents must be array')
  assert.ok(typeof result.total === 'number',        'total must be number')
  assert.ok(typeof result.stats === 'object',        'stats must be object')
  assert.ok('available' in result)
})

test('timeline-provider.fetch() accepts filters without throwing', async () => {
  await assert.doesNotReject(tlProvider.fetch({ limit: 5 }))
  await assert.doesNotReject(tlProvider.fetch({}))
  await assert.doesNotReject(tlProvider.fetch())
})

test('learning-provider.fetch() returns object with cis, calibration, accuracy', async () => {
  const result = await leProvider.fetch()
  assert.ok('cis'         in result, 'must have cis')
  assert.ok('calibration' in result, 'must have calibration')
  assert.ok('accuracy'    in result, 'must have accuracy')
  assert.ok('available'   in result)
})

test('learning-provider.fetch() never rejects', async () => {
  await assert.doesNotReject(leProvider.fetch())
})

test('club-intelligence-provider.fetch() returns object with health, insights', async () => {
  const result = await ciProvider.fetch()
  assert.ok('health'              in result,  'must have health')
  assert.ok(Array.isArray(result.insights),   'insights must be array')
  assert.ok('available'           in result)
})

test('club-intelligence-provider.fetch() never rejects', async () => {
  await assert.doesNotReject(ciProvider.fetch())
})

// ── assembleContext() — ContextBundle shape ────────────────────────────────────

test('assembleContext() returns a ContextBundle with all required sections', async () => {
  const bundle = await assembleContext({})
  assert.ok(typeof bundle.platform              === 'object', 'platform must be object')
  assert.ok(typeof bundle.declarativeKnowledge  === 'object', 'declarativeKnowledge must be object')
  assert.ok(typeof bundle.episodicMemory        === 'object', 'episodicMemory must be object')
  assert.ok(typeof bundle.workingMemory         === 'object', 'workingMemory must be object')
  assert.ok(typeof bundle.proceduralLearning    === 'object', 'proceduralLearning must be object')
  assert.ok(typeof bundle.clubIntelligence      === 'object', 'clubIntelligence must be object')
  assert.ok(typeof bundle.assembledAt           === 'string', 'assembledAt must be ISO string')
  assert.ok(typeof bundle.assemblyDurationMs    === 'number', 'assemblyDurationMs must be number')
  assert.ok(typeof bundle.providers             === 'object', 'providers must be object')
})

test('assembleContext() platform section contains all expected fields', async () => {
  const bundle = await assembleContext({
    fixture: { id: 'f1' }, digitalTwin: { id: 'dt1' },
  })
  const p = bundle.platform
  assert.ok('fixture'        in p, 'platform must have fixture')
  assert.ok('digitalTwin'    in p, 'platform must have digitalTwin')
  assert.ok('attendanceData' in p, 'platform must have attendanceData')
  assert.ok('seasonData'     in p, 'platform must have seasonData')
  assert.ok('clubScoreData'  in p, 'platform must have clubScoreData')
  assert.ok('weatherData'    in p, 'platform must have weatherData')
  assert.ok('fixtureList'    in p, 'platform must have fixtureList')
  assert.ok('resultHistory'  in p, 'platform must have resultHistory')
  assert.deepEqual(bundle.platform.fixture, { id: 'f1' })
  assert.deepEqual(bundle.platform.digitalTwin, { id: 'dt1' })
})

test('assembleContext() platform nulls missing trigger fields', async () => {
  const bundle = await assembleContext({})
  assert.equal(bundle.platform.fixture,        null)
  assert.equal(bundle.platform.attendanceData, null)
  assert.equal(bundle.platform.weatherData,    null)
})

test('assembleContext() declarativeKnowledge has stats with correct sub-fields', async () => {
  const bundle = await assembleContext({})
  const dk = bundle.declarativeKnowledge
  assert.ok('stats'     in dk,               'must have stats')
  assert.ok('available' in dk,               'must have available')
  assert.ok(typeof dk.stats === 'object')
  assert.ok('nodeCount'  in dk.stats,        'stats must have nodeCount')
  assert.ok('edgeCount'  in dk.stats,        'stats must have edgeCount')
  assert.ok('byType'     in dk.stats,        'stats must have byType')
  assert.ok('byEdgeType' in dk.stats,        'stats must have byEdgeType')
})

test('assembleContext() episodicMemory has players, teams arrays', async () => {
  const bundle = await assembleContext({})
  const em = bundle.episodicMemory
  assert.ok(Array.isArray(em.players),        'players must be array')
  assert.ok(Array.isArray(em.teams),          'teams must be array')
  assert.ok(typeof em.playerCount === 'number', 'playerCount must be number')
  assert.ok(typeof em.teamCount   === 'number', 'teamCount must be number')
  assert.ok('available' in em)
})

test('assembleContext() workingMemory has recentEvents array, total, stats', async () => {
  const bundle = await assembleContext({})
  const wm = bundle.workingMemory
  assert.ok(Array.isArray(wm.recentEvents),   'recentEvents must be array')
  assert.ok(typeof wm.total   === 'number',   'total must be number')
  assert.ok(typeof wm.stats   === 'object',   'stats must be object')
  assert.ok('available' in wm)
})

test('assembleContext() proceduralLearning has cis, calibration, accuracy', async () => {
  const bundle = await assembleContext({})
  const pl = bundle.proceduralLearning
  assert.ok('cis'         in pl, 'must have cis')
  assert.ok('calibration' in pl, 'must have calibration')
  assert.ok('accuracy'    in pl, 'must have accuracy')
  assert.ok('available'   in pl)
})

test('assembleContext() clubIntelligence has health and insights array', async () => {
  const bundle = await assembleContext({})
  const ci = bundle.clubIntelligence
  assert.ok('health'            in ci,          'must have health')
  assert.ok(Array.isArray(ci.insights),         'insights must be array')
  assert.ok('available'         in ci)
})

test('assembleContext() providers map has all five provider keys', async () => {
  const bundle = await assembleContext({})
  const keys = ['knowledgeGraph', 'memoryEngine', 'timeline', 'learningEngine', 'clubIntelligence']
  for (const k of keys) {
    assert.ok(k in bundle.providers, `providers must have ${k}`)
    assert.equal(typeof bundle.providers[k], 'boolean', `providers.${k} must be boolean`)
  }
})

test('assembleContext() assembledAt is a valid ISO 8601 string', async () => {
  const bundle = await assembleContext({})
  assert.doesNotThrow(() => new Date(bundle.assembledAt))
  assert.ok(!isNaN(new Date(bundle.assembledAt).getTime()))
})

test('assembleContext() assemblyDurationMs is a non-negative number', async () => {
  const bundle = await assembleContext({})
  assert.ok(bundle.assemblyDurationMs >= 0)
})

// ── assembleContext() — safety contracts ──────────────────────────────────────

test('assembleContext() never rejects with empty trigger', async () => {
  await assert.doesNotReject(assembleContext({}))
})

test('assembleContext() never rejects with null trigger', async () => {
  await assert.doesNotReject(assembleContext(null))
})

test('assembleContext() never rejects with undefined trigger', async () => {
  await assert.doesNotReject(assembleContext(undefined))
})

test('assembleContext() still returns valid bundle when called with null', async () => {
  const bundle = await assembleContext(null)
  assert.ok(typeof bundle === 'object')
  assert.ok('platform' in bundle)
  assert.ok('providers' in bundle)
})

// ── AI.assembleContext() — Brain namespace pass-through ───────────────────────

test('AI.assembleContext is a function', () => {
  assert.equal(typeof AI.assembleContext, 'function')
})

test('AI.assembleContext() returns a valid ContextBundle', async () => {
  const bundle = await AI.assembleContext({})
  assert.ok(typeof bundle.platform           === 'object')
  assert.ok(typeof bundle.declarativeKnowledge === 'object')
  assert.ok(typeof bundle.episodicMemory     === 'object')
  assert.ok(typeof bundle.workingMemory      === 'object')
  assert.ok(typeof bundle.proceduralLearning === 'object')
  assert.ok(typeof bundle.clubIntelligence   === 'object')
  assert.ok(typeof bundle.providers          === 'object')
  assert.ok(typeof bundle.assembledAt        === 'string')
})

test('AI.assembleContext() never rejects', async () => {
  await assert.doesNotReject(AI.assembleContext({}))
  await assert.doesNotReject(AI.assembleContext(null))
})

// ── Integration: AI.request() uses context assembly ──────────────────────────

test('AI.request() trace includes context-assembly module', async () => {
  const result = await AI.request({})
  assert.ok(Array.isArray(result.trace.modules),            'trace.modules must be array')
  assert.ok(
    result.trace.modules.includes('context-assembly'),
    `trace.modules must include 'context-assembly', got [${result.trace.modules.join(', ')}]`
  )
})

test('AI.request() still returns a valid BrainResponse after M3 wiring', async () => {
  const result = await AI.request({})
  assert.ok(Array.isArray(result.recommendations), 'recommendations must be array')
  assert.ok(Array.isArray(result.insights),        'insights must be array')
  assert.ok(Array.isArray(result.warnings),        'warnings must be array')
  assert.ok(typeof result.meta  === 'object',      'meta must be object')
  assert.ok(typeof result.trace === 'object',      'trace must be object')
})

test('AI.request() still never rejects after M3 wiring', async () => {
  await assert.doesNotReject(AI.request(null))
  await assert.doesNotReject(AI.request(undefined))
  await assert.doesNotReject(AI.request({}))
})

test('AI.request() platform fields passed via trigger reach the bundle correctly', async () => {
  const trigger = { fixture: { id: 'match-99' }, weatherData: { temp: 15 } }
  const bundle  = await AI.assembleContext(trigger)
  assert.deepEqual(bundle.platform.fixture,     { id: 'match-99' })
  assert.deepEqual(bundle.platform.weatherData, { temp: 15 })
  assert.equal(bundle.platform.attendanceData,  null)
})

// ── Regression: M1/M2 contracts unaffected ────────────────────────────────────

test('AI.request() meta.isMock still exists after M3', async () => {
  const result = await AI.request({})
  assert.ok('isMock' in result.meta, 'meta.isMock must still be present')
})

test('AI.ask() still returns QueryResponse — unaffected by M3', async () => {
  const result = await AI.ask({ question: 'Who is on the injury list?' })
  assert.ok(typeof result.answer     === 'string')
  assert.ok(typeof result.confidence === 'number')
  assert.ok(Array.isArray(result.citations))
})

test('AI.learn() still resolves without throwing — unaffected by M3', async () => {
  await assert.doesNotReject(
    AI.learn({ recommendationId: 'r-m3-test', outcome: 'accepted' })
  )
})

test('AI namespace exposes assembleContext as M3 method', () => {
  assert.equal(typeof AI.assembleContext, 'function')
})
