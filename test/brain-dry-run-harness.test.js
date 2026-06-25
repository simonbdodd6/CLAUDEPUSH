/**
 * brain-decision-planner — End-to-End Brain Dry Run Harness tests
 *
 * Runs the full dormant stack (M170 inputs → M171 summary → M172 capstone squad) and returns a
 * structured verification result. Real coach-intelligence engines injected; deterministic in-memory
 * fixtures; no networking/persistence/AI/runtime activation.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runBrainDryRun } from '../packages/brain-decision-planner/index.js'
import { summarizeBrainInputs } from '../packages/brain-decision-planner/index.js'
import { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline } from '../packages/coach-intelligence/index.js'

const ENGINES = { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline }

const corePlayer = (userId, position) => ({ id: `profile_${userId}`, userId, displayName: userId, position })
const memory = (id, type) => ({ id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual', confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: `2026-06-0${id.slice(1)}T00:00:00.000Z` })

const STARTERS = [
  corePlayer('u_lh', 'Loosehead Prop'), corePlayer('u_hk', 'Hooker'), corePlayer('u_th', 'Tighthead Prop'), corePlayer('u_lk1', 'Lock'), corePlayer('u_lk2', 'Lock'),
  corePlayer('u_bs', 'Blindside Flanker'), corePlayer('u_os', 'Openside Flanker'), corePlayer('u_n8', 'Number 8'), corePlayer('u_sh', 'Scrum-half'), corePlayer('u_fh', 'Fly-half'),
  corePlayer('u_lw', 'Left Wing'), corePlayer('u_ic', 'Inside Centre'), corePlayer('u_oc', 'Outside Centre'), corePlayer('u_rw', 'Right Wing'), corePlayer('u_fb', 'Fullback'),
]
const DEPTH = [corePlayer('d_lh', 'Loosehead Prop'), corePlayer('d_hk', 'Hooker'), corePlayer('d_th', 'Tighthead Prop'), corePlayer('d_lk', 'Lock'), corePlayer('d_n8', 'Number 8'), corePlayer('d_sh', 'Scrum-half'), corePlayer('d_fh', 'Fly-half'), corePlayer('d_fb', 'Fullback'), corePlayer('d_lw', 'Left Wing')]
const PLAYERS = [...STARTERS, ...DEPTH]   // 24
const AVAILABILITY = Object.fromEntries(PLAYERS.map((p) => [p.userId, { response: 'available' }]))
const MEMORIES = [memory('m1', 'selection-preference'), memory('m2', 'selection-preference'), memory('m3', 'selection-preference'), memory('m4', 'tactical-preference')]
const TAGS = { u_sh: { tags: ['reliable'] } }
const FIXTURE = { fixtureId: 'fix_1', opponent: 'Leinster', competition: 'AIL', venue: 'Home', date: '2026-07-05' }
const MATCH = { category: 'selection-preference', confidence: 0.7, matchedSignals: ['form'] }
const IDENTITY = { coachId: 'coach-demo', clubId: 'boitsfort-rfc', tags: [] }

const makeSquadLoader = (over = {}) => ({ getActivePlayers: () => PLAYERS, getAvailabilityResponses: () => AVAILABILITY, getCoachMemories: () => MEMORIES, getPlayerTags: () => TAGS, ...over })
const makeDecisionSource = (over = {}) => ({ getFixtureContext: () => ({ fixture: FIXTURE, match: MATCH }), getCoachIdentity: () => IDENTITY, ...over })
const makeInput = (over = {}) => ({ squadLoader: makeSquadLoader(), decisionPlanSource: makeDecisionSource(), ...over })
const run = (input = makeInput()) => runBrainDryRun(input, { pipelineServices: ENGINES })

// ── full result ──────────────────────────────────────────────────────────────────────

test('valid input returns the full dry-run result', () => {
  const out = run()
  assert.deepEqual(Object.keys(out).sort(), ['brainInputs', 'capstone', 'summary', 'verification'])
  assert.ok(isObjLike(out.brainInputs) && isObjLike(out.summary) && isObjLike(out.capstone) && isObjLike(out.verification))
})

test('summary is the M171 snapshot of brainInputs', () => {
  const out = run()
  assert.deepEqual(out.summary, summarizeBrainInputs(out.brainInputs))
  assert.equal(out.summary.hasSquadInput, true)
  assert.equal(out.summary.hasDecisionInput, true)
})

test('capstone is the M172 result (brainInputs + candidates + formation + squad)', () => {
  const out = run()
  assert.deepEqual(Object.keys(out.capstone).sort(), ['brainInputs', 'candidates', 'formation', 'squad'])
  assert.equal(out.brainInputs, out.capstone.brainInputs)   // reused, not recomputed
})

// ── verification counts ──────────────────────────────────────────────────────────────

test('verification counts match the squad', () => {
  const out = run()
  const squad = out.capstone.squad
  const v = out.verification
  assert.equal(v.hasSquadInput, true)
  assert.equal(v.hasDecisionInput, true)
  assert.equal(v.hasSquad, true)
  assert.equal(v.startingCount, squad.startingXV.filter((s) => s.status === 'filled').length)
  assert.equal(v.startingCount, 15)
  assert.equal(v.benchCount, squad.bench.length)
  assert.equal(v.reserveCount, squad.reserves.length)
  assert.equal(v.warningCount, squad.risk.risks.length)
})

// ── failures propagate ───────────────────────────────────────────────────────────────

test('missing pipelineServices is rejected clearly', () => {
  assert.throws(() => runBrainDryRun(makeInput(), {}), TypeError)
  assert.throws(() => runBrainDryRun(makeInput(), []), TypeError)
})

test('buildBrainInputs failure propagates (malformed input)', () => {
  assert.throws(() => runBrainDryRun(null, { pipelineServices: ENGINES }), TypeError)
  assert.throws(() => runBrainDryRun({}, { pipelineServices: ENGINES }), TypeError)
})

test('capstone failure propagates (invalid squadLoader)', () => {
  assert.throws(() => run(makeInput({ squadLoader: {} })), TypeError)
})

// ── determinism / frozen / no mutation ───────────────────────────────────────────────

test('deterministic — repeated runs are identical', () => {
  assert.deepEqual(run().verification, run().verification)
  assert.deepEqual(run().capstone.squad, run().capstone.squad)
})

test('output is deeply frozen', () => {
  const out = run()
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.brainInputs) && Object.isFrozen(out.summary) &&
    Object.isFrozen(out.capstone) && Object.isFrozen(out.verification))
  assert.throws(() => { out.verification.startingCount = 0 })
})

test('does not mutate the provider data', () => {
  const before = JSON.stringify({ PLAYERS, AVAILABILITY, MEMORIES, TAGS, FIXTURE, MATCH, IDENTITY })
  run()
  assert.equal(JSON.stringify({ PLAYERS, AVAILABILITY, MEMORIES, TAGS, FIXTURE, MATCH, IDENTITY }), before)
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof runBrainDryRun, 'function')
})

function isObjLike(v) { return v !== null && typeof v === 'object' }
