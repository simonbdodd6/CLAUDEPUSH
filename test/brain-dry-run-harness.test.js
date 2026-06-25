/**
 * brain-decision-planner — End-to-End Brain Dry Run Harness tests
 *
 * Runs the full dormant stack (M170 inputs → M171 summary → M172 capstone squad) and returns a
 * structured verification result. Providers come from the shared canonical regression fixtures; real
 * coach-intelligence engines injected; no networking/persistence/AI/runtime activation.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runBrainDryRun, summarizeBrainInputs } from '../packages/brain-decision-planner/index.js'
import { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline } from '../packages/coach-intelligence/index.js'
import { createFullSquadScenario } from './fixtures/brain-regression-fixtures.js'

const ENGINES = { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline }

const baseInput = () => { const s = createFullSquadScenario(); return { squadLoader: s.squadLoader, decisionPlanSource: s.decisionPlanSource } }
const makeInput = (over = {}) => ({ ...baseInput(), ...over })
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
  const s = createFullSquadScenario()
  const snapshot = () => JSON.stringify({
    players: s.squadLoader.getActivePlayers(),
    availability: s.squadLoader.getAvailabilityResponses(),
    memories: s.squadLoader.getCoachMemories(),
    fixture: s.decisionPlanSource.getFixtureContext(),
    identity: s.decisionPlanSource.getCoachIdentity(),
  })
  const before = snapshot()
  runBrainDryRun({ squadLoader: s.squadLoader, decisionPlanSource: s.decisionPlanSource }, { pipelineServices: ENGINES })
  assert.equal(snapshot(), before)
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof runBrainDryRun, 'function')
})

function isObjLike(v) { return v !== null && typeof v === 'object' }
