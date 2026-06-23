/**
 * M131 — Selection Pipeline Facade tests
 *
 * Deterministic tests for the pure, dormant orchestration entry point: complete pipeline,
 * validation delegation, downstream error propagation, identical output to calling the engines
 * manually, determinism, no mutation, deep-frozen output, export.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  runSelectionPipeline,
  evaluateSquad, buildDepthChart, recommendStartingXV, evaluateSelectionRisk,
  evaluateTeamSignOff, recommendCaptain, recommendBench, composeMatchDaySquad,
} from '../packages/coach-intelligence/index.js'

// minimal valid M118/M119 fixtures (the fields the engines actually read)
const PIPELINE_RESULT = { alignment: { alignmentScore: 0.8 } }
const RECOMMENDATION = { confidence: 0.8, action: 'present', requiresCoachReview: false, alignmentTier: 'good', evidence: { challenged: false, dominantSignals: [], matchedSignals: [] } }

const baseInput = (over = {}) => ({
  candidates: [
    { playerId: 'p1', position: 'LH', availability: true, confidence: 0.9 },
    { playerId: 'p2', position: 'Hooker', availability: true, confidence: 0.8 },
    { playerId: 'p3', position: 'TH', availability: true, confidence: 0.7 },
    { playerId: 'p4', position: 'Lock', availability: true, confidence: 0.6 },
    { playerId: 'p5', position: 'Lock', availability: true, confidence: 0.55 },
    { playerId: 'p6', position: 'Lock', availability: true, confidence: 0.5 },   // extra Lock → bench
    { playerId: 'p7', position: 'Openside', availability: false, confidence: 0.4 },   // unavailable → ineligible
  ],
  pipelineResult: PIPELINE_RESULT,
  recommendation: RECOMMENDATION,
  ...over,
})

// the same chain, called by hand
function manualPipeline(i) {
  const squadEvaluation = evaluateSquad(i.candidates, i.pipelineResult, i.recommendation, i.squadOptions ?? {})
  const depthChart = buildDepthChart(squadEvaluation, i.positionGroups ?? {})
  const startingXV = recommendStartingXV(depthChart, i.formation ?? {})
  const selectionRisk = evaluateSelectionRisk(startingXV)
  const signOff = evaluateTeamSignOff(startingXV, selectionRisk)
  const captainRecommendation = recommendCaptain(startingXV, i.captainOptions ?? {})
  const benchRecommendation = recommendBench(startingXV, squadEvaluation, i.benchOptions ?? {})
  return composeMatchDaySquad({ startingXV, captainRecommendation, benchRecommendation, selectionRisk, signOff })
}

// ── complete pipeline ────────────────────────────────────────────────────────────────

test('complete pipeline returns an M130 match-day squad', () => {
  const sq = runSelectionPipeline(baseInput())
  for (const k of ['startingXV', 'captain', 'viceCaptain', 'bench', 'reserves', 'risk', 'signOff', 'metadata']) {
    assert.ok(k in sq, `missing field: ${k}`)
  }
  assert.ok(Array.isArray(sq.startingXV))
  assert.equal(sq.captain.playerId, 'p1')                 // tie-broken by playerId
  assert.deepEqual(sq.bench.map((p) => p.playerId), ['p6'])
  assert.equal(sq.metadata.llm, false)
  assert.equal(typeof sq.signOff.approved, 'boolean')
})

// ── identical to manual chain ────────────────────────────────────────────────────────

test('output is identical to calling all engines manually', () => {
  const i = baseInput()
  assert.deepEqual(runSelectionPipeline(i), manualPipeline(i))
})

test('per-stage options are threaded through (bench size honoured)', () => {
  const i = baseInput({ benchOptions: { benchSize: 1 } })
  assert.deepEqual(runSelectionPipeline(i), manualPipeline(i))
  assert.equal(runSelectionPipeline(i).bench.length, 1)
})

// ── validation delegation / error propagation ────────────────────────────────────────

test('top-level input must be an object', () => {
  assert.throws(() => runSelectionPipeline(null), TypeError)
  assert.throws(() => runSelectionPipeline([]), TypeError)
})

test('validation is delegated to the engines (missing candidates)', () => {
  assert.throws(() => runSelectionPipeline({ pipelineResult: PIPELINE_RESULT, recommendation: RECOMMENDATION }), TypeError)   // evaluateSquad rejects
})

test('downstream engine errors propagate (malformed candidate)', () => {
  const bad = baseInput({ candidates: [{ playerId: 'x', position: 'LH', availability: true, confidence: 2 }] })   // confidence out of [0,1]
  assert.throws(() => runSelectionPipeline(bad), TypeError)
})

test('downstream engine errors propagate (invalid bench size)', () => {
  assert.throws(() => runSelectionPipeline(baseInput({ benchOptions: { benchSize: 99 } })), TypeError)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('does not mutate the input', () => {
  const i = baseInput()
  const before = JSON.stringify(i)
  runSelectionPipeline(i)
  assert.equal(JSON.stringify(i), before)
})

test('deterministic — identical input → identical squad', () => {
  const i = baseInput()
  assert.deepEqual(runSelectionPipeline(i), runSelectionPipeline(i))
})

test('output is deeply frozen', () => {
  const sq = runSelectionPipeline(baseInput())
  assert.ok(Object.isFrozen(sq) && Object.isFrozen(sq.bench) && Object.isFrozen(sq.metadata) && Object.isFrozen(sq.startingXV))
  assert.throws(() => sq.bench.push({}))
  assert.throws(() => { sq.metadata.approved = true })
})

// ── export ───────────────────────────────────────────────────────────────────────────

test('export exists', () => {
  assert.equal(typeof runSelectionPipeline, 'function')
})
