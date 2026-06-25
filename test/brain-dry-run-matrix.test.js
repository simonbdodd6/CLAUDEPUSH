/**
 * brain-decision-planner — Multi-Scenario Brain Dry Run Matrix tests
 *
 * Runs the M178 dry-run harness across fixed in-memory scenarios (full squad, injury-thinned,
 * invalid provider) and reports per-scenario pass/fail. Deterministic fixtures; real engines
 * injected; no networking/persistence/AI/runtime activation.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runBrainDryRunMatrix } from '../packages/brain-decision-planner/index.js'
import { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline } from '../packages/coach-intelligence/index.js'

const ENGINES = { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline }
const OPTIONS = { pipelineServices: ENGINES }

const corePlayer = (userId, position) => ({ id: `profile_${userId}`, userId, displayName: userId, position })
const memory = (id, type) => ({ id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual', confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: `2026-06-0${id.slice(1)}T00:00:00.000Z` })

const STARTERS = [
  corePlayer('u_lh', 'Loosehead Prop'), corePlayer('u_hk', 'Hooker'), corePlayer('u_th', 'Tighthead Prop'), corePlayer('u_lk1', 'Lock'), corePlayer('u_lk2', 'Lock'),
  corePlayer('u_bs', 'Blindside Flanker'), corePlayer('u_os', 'Openside Flanker'), corePlayer('u_n8', 'Number 8'), corePlayer('u_sh', 'Scrum-half'), corePlayer('u_fh', 'Fly-half'),
  corePlayer('u_lw', 'Left Wing'), corePlayer('u_ic', 'Inside Centre'), corePlayer('u_oc', 'Outside Centre'), corePlayer('u_rw', 'Right Wing'), corePlayer('u_fb', 'Fullback'),
]
const DEPTH = [corePlayer('d_lh', 'Loosehead Prop'), corePlayer('d_hk', 'Hooker'), corePlayer('d_th', 'Tighthead Prop'), corePlayer('d_lk', 'Lock'), corePlayer('d_n8', 'Number 8'), corePlayer('d_sh', 'Scrum-half'), corePlayer('d_fh', 'Fly-half'), corePlayer('d_fb', 'Fullback'), corePlayer('d_lw', 'Left Wing')]
const FULL_PLAYERS = [...STARTERS, ...DEPTH]   // 24, every jersey covered
// injury-thinned: both Fullbacks removed → jersey 15 cannot be filled
const THINNED_PLAYERS = FULL_PLAYERS.filter((p) => p.position !== 'Fullback')   // 22, no Fullback
const MEMORIES = [memory('m1', 'selection-preference'), memory('m2', 'selection-preference'), memory('m3', 'selection-preference'), memory('m4', 'tactical-preference')]
const FIXTURE = { fixtureId: 'fix_1', opponent: 'Leinster', competition: 'AIL', venue: 'Home', date: '2026-07-05' }
const MATCH = { category: 'selection-preference', confidence: 0.7, matchedSignals: ['form'] }
const IDENTITY = { coachId: 'coach-demo', clubId: 'boitsfort-rfc', tags: [] }

const availabilityFor = (players) => Object.fromEntries(players.map((p) => [p.userId, { response: 'available' }]))
const squadLoaderFor = (players) => ({ getActivePlayers: () => players, getAvailabilityResponses: () => availabilityFor(players), getCoachMemories: () => MEMORIES, getPlayerTags: () => ({}) })
const decisionSource = () => ({ getFixtureContext: () => ({ fixture: FIXTURE, match: MATCH }), getCoachIdentity: () => IDENTITY })

const fullScenario = (over = {}) => ({ id: 'full', squadLoader: squadLoaderFor(FULL_PLAYERS), decisionPlanSource: decisionSource(), expected: { startingCount: 15, hasSquad: true }, ...over })
const thinnedScenario = (over = {}) => ({ id: 'thinned', squadLoader: squadLoaderFor(THINNED_PLAYERS), decisionPlanSource: decisionSource(), expected: { startingCount: 14 }, ...over })
const invalidScenario = (over = {}) => ({ id: 'invalid', squadLoader: {}, decisionPlanSource: decisionSource(), ...over })

// ── happy path ───────────────────────────────────────────────────────────────────────

test('all scenarios pass', () => {
  const out = runBrainDryRunMatrix([fullScenario(), thinnedScenario()], OPTIONS)
  assert.equal(out.total, 2)
  assert.equal(out.passed, 2)
  assert.equal(out.failed, 0)
  assert.ok(out.scenarios.every((s) => s.ok && s.error === null && s.verification))
  // injury-thinned degrades deterministically: Fullback jersey vacant → 14 starters, a risk warning raised
  const thinned = out.scenarios.find((s) => s.id === 'thinned')
  assert.equal(thinned.verification.startingCount, 14)
  assert.ok(thinned.verification.warningCount >= 1)
})

// ── failure isolation ────────────────────────────────────────────────────────────────

test('one scenario fails while later scenarios still run', () => {
  const out = runBrainDryRunMatrix([fullScenario(), invalidScenario(), thinnedScenario()], OPTIONS)
  assert.equal(out.total, 3)
  assert.equal(out.passed, 2)
  assert.equal(out.failed, 1)
  const invalid = out.scenarios.find((s) => s.id === 'invalid')
  assert.equal(invalid.ok, false)
  assert.equal(invalid.dryRun, null)
  assert.equal(invalid.verification, null)
  assert.equal(typeof invalid.error, 'string')
  // the scenario AFTER the failing one still ran
  assert.equal(out.scenarios.find((s) => s.id === 'thinned').ok, true)
})

test('order is preserved', () => {
  const out = runBrainDryRunMatrix([fullScenario(), invalidScenario(), thinnedScenario()], OPTIONS)
  assert.deepEqual(out.scenarios.map((s) => s.id), ['full', 'invalid', 'thinned'])
})

test('expected-mismatch counts as failed without throwing', () => {
  const out = runBrainDryRunMatrix([fullScenario({ expected: { startingCount: 99 } })], OPTIONS)
  assert.equal(out.passed, 0)
  assert.equal(out.failed, 1)
  assert.equal(out.scenarios[0].ok, false)
  assert.equal(out.scenarios[0].error, null)        // it ran fine; it just didn't match
  assert.ok(out.scenarios[0].verification)
})

// ── determinism / frozen / no mutation ───────────────────────────────────────────────

test('deterministic — repeated runs are identical', () => {
  const scenarios = [fullScenario(), invalidScenario(), thinnedScenario()]
  assert.deepEqual(
    runBrainDryRunMatrix(scenarios, OPTIONS).scenarios.map((s) => ({ id: s.id, ok: s.ok, error: s.error, v: s.verification })),
    runBrainDryRunMatrix(scenarios, OPTIONS).scenarios.map((s) => ({ id: s.id, ok: s.ok, error: s.error, v: s.verification })),
  )
})

test('output is deeply frozen', () => {
  const out = runBrainDryRunMatrix([fullScenario()], OPTIONS)
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.scenarios) && Object.isFrozen(out.scenarios[0]))
  assert.throws(() => { out.passed = 0 })
  assert.throws(() => out.scenarios.push({}))
})

test('does not mutate scenario inputs', () => {
  const scenarios = [fullScenario(), invalidScenario()]
  const ids = scenarios.map((s) => s.id)
  const loaders = scenarios.map((s) => s.squadLoader)
  runBrainDryRunMatrix(scenarios, OPTIONS)
  assert.deepEqual(scenarios.map((s) => s.id), ids)
  assert.deepEqual(scenarios.map((s) => s.squadLoader), loaders)   // same references, untouched
  assert.equal(Object.isFrozen(scenarios[0]), false)               // caller's scenario not frozen
})

// ── validation / injection / export ──────────────────────────────────────────────────

test('malformed scenarios are rejected clearly', () => {
  assert.throws(() => runBrainDryRunMatrix('nope', OPTIONS), TypeError)
  assert.throws(() => runBrainDryRunMatrix([null], OPTIONS), TypeError)
  assert.throws(() => runBrainDryRunMatrix([{ squadLoader: {}, decisionPlanSource: {} }], OPTIONS), TypeError)   // no id
  assert.throws(() => runBrainDryRunMatrix([fullScenario({ expected: 'x' })], OPTIONS), TypeError)
  assert.throws(() => runBrainDryRunMatrix([fullScenario()], 'x'), TypeError)
})

test('the dry-run function is called exactly once per scenario (injected)', () => {
  let calls = 0
  const fakeDryRun = () => { calls += 1; return Object.freeze({ verification: Object.freeze({ hasSquad: true, startingCount: 15 }) }) }
  const out = runBrainDryRunMatrix([fullScenario(), thinnedScenario(), invalidScenario()], OPTIONS, { runDryRun: fakeDryRun })
  assert.equal(calls, 3)
  assert.equal(out.total, 3)
})

test('export exists', () => {
  assert.equal(typeof runBrainDryRunMatrix, 'function')
})
