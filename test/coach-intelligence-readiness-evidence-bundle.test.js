/**
 * coach-intelligence — Readiness Evidence Bundle (M213) tests
 *
 * Packages the readiness module outputs (M206/M208–M212) into one immutable bundle. It recomputes
 * nothing, preserves every source verbatim, and recommends nothing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildReadinessEvidenceBundle,
  assessSquadReadiness, summarizeSquadReadiness, gateReadinessReport, analyzeSquadReadinessTrend, explainPlayerReadiness,
} from '../packages/coach-intelligence/index.js'

// hand-built component-output fixtures (the shapes each module emits)
const readiness206 = (over = {}) => ({ status: 'READY', codes: [], metrics: { startersFilled: 15 }, ...over })
const explanations208 = () => [{ playerId: 'p1', positiveFactors: [], limitingFactors: [], missingInformation: [], confidence: { level: 'HIGH', label: '' } }]
const squadSummary209 = (over = {}) => ({ readinessLevel: 'MATCH_READY', confidence: { level: 'HIGH', label: '' }, counts: { total: 16, fullyAvailable: 16, availableForSelection: 16, injuryConcern: 0, unavailableOrSuspended: 0, limitedTraining: 0, missingInformation: 0 }, positionGroups: {}, summary: '', ...over })
const trend210 = (over = {}) => ({ direction: 'IMPROVING', comparable: true, currentReadinessLevel: 'MATCH_READY', previousReadinessLevel: 'UNDERSTRENGTH', confidenceTrend: 'IMPROVING', changes: { availability: 4, injuries: 0, unavailableOrSuspended: 0, limitedTraining: 0 }, ...over })
const report211 = (over = {}) => ({ readinessLevel: 'MATCH_READY', confidenceLevel: 'HIGH', counts: { total: 16 }, positionGroups: [], trend: null, ...over })
const envelope212 = (over = {}) => ({ type: 'squad-readiness-report', schemaVersion: 1, readinessLevel: 'MATCH_READY', confidenceLevel: 'HIGH', sections: ['counts'], warnings: [], gate: { status: 'PASS', reasons: [] }, report: report211(), ...over })

const full = () => ({ readiness: readiness206(), explanations: explanations208(), squadSummary: squadSummary209(), trend: trend210(), report: report211(), envelope: envelope212() })

// ── complete bundle ──────────────────────────────────────────────────────────────────

test('complete bundle — manifest, components, PASS validation, sources verbatim', () => {
  const input = full()
  const b = buildReadinessEvidenceBundle(input)
  assert.equal(b.type, 'readiness-evidence-bundle')
  assert.equal(b.schemaVersion, 1)
  assert.deepEqual(b.manifest, { readiness: true, explanations: true, squadSummary: true, trend: true, report: true, envelope: true })
  assert.deepEqual(b.components, ['envelope', 'explanations', 'readiness', 'report', 'squadSummary', 'trend'])
  assert.deepEqual(b.validation, { status: 'PASS', source: 'envelope' })
  assert.deepEqual(b.confidence, { level: 'HIGH', source: 'envelope' })
  assert.deepEqual(b.warnings, [])
  // every source preserved without modification
  assert.deepEqual(b.sources.squadSummary, input.squadSummary)
  assert.deepEqual(b.sources.envelope, input.envelope)
})

// ── without trend ──────────────────────────────────────────────────────────────────────

test('bundle without trend', () => {
  const input = full(); delete input.trend
  const b = buildReadinessEvidenceBundle(input)
  assert.equal(b.manifest.trend, false)
  assert.ok(!b.components.includes('trend'))
  assert.equal(b.sources.trend, null)
})

// ── low confidence ─────────────────────────────────────────────────────────────────────

test('low-confidence bundle collects LOW_CONFIDENCE', () => {
  const b = buildReadinessEvidenceBundle({ squadSummary: squadSummary209({ confidence: { level: 'LOW', label: '' } }), report: report211({ confidenceLevel: 'LOW' }) })
  assert.ok(b.warnings.includes('LOW_CONFIDENCE'))
  assert.deepEqual(b.confidence, { level: 'LOW', source: 'report' })   // no envelope ⇒ report is highest authority
})

// ── containing warnings from multiple components ──────────────────────────────────────

test('warnings are collected and merged from all components (deduped, sorted)', () => {
  const b = buildReadinessEvidenceBundle({
    readiness: readiness206({ codes: ['VACANT_POSITIONS'] }),
    envelope: envelope212({ warnings: ['NO_TREND', 'LOW_CONFIDENCE'], gate: { status: 'WARN', reasons: ['NO_TREND', 'LOW_CONFIDENCE'] } }),
    squadSummary: squadSummary209({ counts: { ...squadSummary209().counts, missingInformation: 2 } }),
  })
  assert.deepEqual(b.warnings, ['LOW_CONFIDENCE', 'MISSING_PLAYER_INFORMATION', 'NO_TREND', 'VACANT_POSITIONS'])
  assert.equal(b.validation.status, 'WARN')
})

// ── empty inputs ───────────────────────────────────────────────────────────────────────

test('empty inputs — empty manifest, UNVALIDATED, null confidence', () => {
  const b = buildReadinessEvidenceBundle({})
  assert.deepEqual(b.manifest, { readiness: false, explanations: false, squadSummary: false, trend: false, report: false, envelope: false })
  assert.deepEqual(b.components, [])
  assert.deepEqual(b.validation, { status: 'UNVALIDATED', source: 'none' })
  assert.deepEqual(b.confidence, { level: null, source: 'none' })
  assert.deepEqual(b.warnings, [])
  assert.deepEqual(b.sources, { readiness: null, explanations: null, squadSummary: null, trend: null, report: null, envelope: null })
})

// ── reuse the real readiness chain end-to-end ─────────────────────────────────────────

test('bundles real M208–M212 outputs (reuse, not recompute)', () => {
  const players = (n) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, position: 'Lock', availability: 'available', fitness: 'fit', attendance: 'good' }))
  const s1 = assessSquadReadiness(players(12))
  const squadSummary = assessSquadReadiness(players(18))
  const trend = analyzeSquadReadinessTrend([s1, squadSummary])
  const report = summarizeSquadReadiness({ readiness: squadSummary, trend })
  const envelope = gateReadinessReport(report)
  const explanations = players(3).map(explainPlayerReadiness)

  const b = buildReadinessEvidenceBundle({ explanations, squadSummary, trend, report, envelope })
  assert.deepEqual(b.components, ['envelope', 'explanations', 'report', 'squadSummary', 'trend'])
  assert.equal(b.validation.status, envelope.gate.status)
  assert.deepEqual(b.sources.squadSummary, squadSummary)   // verbatim
  assert.deepEqual(b.sources.report, report)
})

// ── determinism / immutability / mutation / validation / export ─────────────────────────

test('deterministic — repeated execution is identical', () => {
  const input = full()
  assert.deepEqual(buildReadinessEvidenceBundle(input), buildReadinessEvidenceBundle(input))
})

test('output is deeply frozen', () => {
  const b = buildReadinessEvidenceBundle(full())
  assert.ok(Object.isFrozen(b) && Object.isFrozen(b.manifest) && Object.isFrozen(b.components) && Object.isFrozen(b.warnings) &&
    Object.isFrozen(b.sources) && Object.isFrozen(b.sources.squadSummary) && Object.isFrozen(b.validation))
  assert.throws(() => { b.schemaVersion = 9 })
  assert.throws(() => b.components.push('x'))
})

test('does not mutate the input', () => {
  const input = full()
  const before = JSON.stringify(input)
  buildReadinessEvidenceBundle(input)
  assert.equal(JSON.stringify(input), before)
})

test('malformed input rejected clearly', () => {
  assert.throws(() => buildReadinessEvidenceBundle(null), TypeError)
  assert.throws(() => buildReadinessEvidenceBundle([]), TypeError)
  assert.throws(() => buildReadinessEvidenceBundle({ readiness: 'x' }), TypeError)            // non-object component
  assert.throws(() => buildReadinessEvidenceBundle({ explanations: 'x' }), TypeError)         // non-array
  assert.throws(() => buildReadinessEvidenceBundle({ explanations: [1, 2] }), TypeError)      // array of non-objects
})

test('export exists', () => {
  assert.equal(typeof buildReadinessEvidenceBundle, 'function')
})
