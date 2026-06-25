/**
 * brain-decision-planner — Dry Run Decision Diff Harness (M194) tests
 *
 * Composes two M186 dry-run results into decision states, runs the M192 diff, and renders it via
 * M193. Hand-built dry-run-shaped inputs exercise each change type; a real runBrainDryRun proves the
 * end-to-end path. Read-only composition; no Brain logic rerun.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diffBrainDryRuns, runBrainDryRun } from '../packages/brain-decision-planner/index.js'
import { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline } from '../packages/coach-intelligence/index.js'
import { createFullSquadScenario } from './fixtures/brain-regression-fixtures.js'

const ENGINES = { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline }

// minimal M186-dry-run-shaped object carrying only the fields the harness reads
function dryRun(opts = {}) {
  const starters = opts.starters ?? [
    { playerId: 'p1', jersey: '1', explanationCodes: ['FORMATION_REQUIREMENT', 'POSITION_MATCH'] },
    { playerId: 'p2', jersey: '2', explanationCodes: ['FORMATION_REQUIREMENT'] },
  ]
  const bench = opts.bench ?? [{ playerId: 'b1', explanationCodes: ['BENCH_COVER'] }]
  const risks = opts.risks ?? [{ type: 'review-required', severity: 'MEDIUM', playerId: 'p2' }]
  const startingCount = opts.startingCount ?? starters.length
  return {
    brainInputs: {}, summary: {},
    capstone: { squad: { captain: 'captain' in opts ? opts.captain : { playerId: 'p1' }, viceCaptain: 'viceCaptain' in opts ? opts.viceCaptain : { playerId: 'p2' } } },
    verification: { startingCount },
    explanation: { summary: {}, starters, bench, risks, alternatives: [], confidenceNotes: [] },
    explanationView: { counts: { starters: starters.length } },
  }
}

// ── identical ──────────────────────────────────────────────────────────────────────────

test('identical dry runs → no changes, with before/after summaries', () => {
  const out = diffBrainDryRuns(dryRun(), dryRun())
  assert.deepEqual(Object.keys(out).sort(), ['afterSummary', 'beforeSummary', 'diff', 'diffView'])
  assert.equal(out.diff.summary.changed, false)
  assert.equal(out.diffView.changeCount, 0)
  assert.deepEqual(out.beforeSummary, { starterCount: 2, benchCount: 1, captain: 'p1', viceCaptain: 'p2', riskCount: 1, coverage: 1 })
  assert.deepEqual(out.afterSummary, out.beforeSummary)
})

// ── individual change types ──────────────────────────────────────────────────────────

test('changed captain', () => {
  const out = diffBrainDryRuns(dryRun(), dryRun({ captain: { playerId: 'p2' } }))
  assert.deepEqual(out.diff.captainChanges, [{ code: 'CAPTAIN_CHANGED', from: 'p1', to: 'p2' }])
  assert.ok(out.diffView.codes.includes('CAPTAIN_CHANGED'))
  assert.equal(out.afterSummary.captain, 'p2')
})

test('changed starter (one out, one in)', () => {
  const after = dryRun({ starters: [{ playerId: 'p1', explanationCodes: ['FORMATION_REQUIREMENT', 'POSITION_MATCH'] }, { playerId: 'p3', explanationCodes: ['FORMATION_REQUIREMENT'] }] })
  const out = diffBrainDryRuns(dryRun(), after)
  assert.deepEqual(out.diff.playerChanges, [{ playerId: 'p2', code: 'PLAYER_REMOVED' }, { playerId: 'p3', code: 'PLAYER_ADDED' }])
})

test('changed bench', () => {
  const out = diffBrainDryRuns(dryRun(), dryRun({ bench: [{ playerId: 'b2', explanationCodes: ['BENCH_COVER'] }] }))
  assert.deepEqual(out.diff.benchChanges.entered, ['b2'])
  assert.deepEqual(out.diff.benchChanges.left, ['b1'])
})

test('changed risks', () => {
  const after = dryRun({ risks: [{ type: 'a', severity: 'LOW', playerId: 'p1' }, { type: 'b', severity: 'LOW' }, { type: 'c', severity: 'LOW' }] })
  const out = diffBrainDryRuns(dryRun(), after)
  assert.deepEqual(out.diff.riskChanges, { before: 1, after: 3, delta: 2, code: 'RISK_INCREASED' })
})

test('changed explanation coverage', () => {
  const out = diffBrainDryRuns(dryRun(), dryRun({ startingCount: 4 }))   // 2 explained / 4 starters = 0.5
  assert.equal(out.beforeSummary.coverage, 1)
  assert.equal(out.afterSummary.coverage, 0.5)
  assert.deepEqual(out.diff.coverageChanges, { before: 1, after: 0.5, delta: -0.5, code: 'COVERAGE_DECREASED' })
})

// ── real end-to-end ────────────────────────────────────────────────────────────────────

test('two identical REAL dry runs diff to no change', () => {
  const s = createFullSquadScenario()
  const dr = runBrainDryRun({ squadLoader: s.squadLoader, decisionPlanSource: s.decisionPlanSource }, { pipelineServices: ENGINES })
  const out = diffBrainDryRuns(dr, dr)
  assert.equal(out.diff.summary.changed, false)
  assert.equal(out.beforeSummary.starterCount, 15)
  assert.equal(out.beforeSummary.coverage, 1)
})

// ── validation / determinism / frozen / mutation / export ───────────────────────────────

test('malformed inputs rejected clearly', () => {
  assert.throws(() => diffBrainDryRuns(null, dryRun()), TypeError)
  assert.throws(() => diffBrainDryRuns(dryRun(), {}), TypeError)                                       // missing sections
  assert.throws(() => diffBrainDryRuns({ capstone: { squad: {} }, verification: {} }, dryRun()), TypeError)   // no explanation
  assert.throws(() => diffBrainDryRuns(dryRun(), { explanation: {}, verification: {} }), TypeError)    // no capstone.squad
  assert.throws(() => diffBrainDryRuns({ explanation: {}, capstone: { squad: {} } }, dryRun()), TypeError)    // no verification
})

test('deterministic — repeated runs are identical', () => {
  const a = dryRun()
  const b = dryRun({ captain: { playerId: 'p2' }, startingCount: 4 })
  assert.deepEqual(diffBrainDryRuns(a, b), diffBrainDryRuns(a, b))
})

test('output is deeply frozen', () => {
  const out = diffBrainDryRuns(dryRun(), dryRun({ captain: { playerId: 'p2' } }))
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.beforeSummary) && Object.isFrozen(out.diff) && Object.isFrozen(out.diffView))
  assert.throws(() => { out.beforeSummary.starterCount = 0 })
})

test('does not mutate the input dry runs', () => {
  const a = dryRun(); const b = dryRun({ captain: { playerId: 'p2' } })
  const snap = JSON.stringify({ a, b })
  diffBrainDryRuns(a, b)
  assert.equal(JSON.stringify({ a, b }), snap)
})

test('export exists', () => {
  assert.equal(typeof diffBrainDryRuns, 'function')
})
