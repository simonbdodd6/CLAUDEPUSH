/**
 * coach-intelligence — Readiness Report Gate Envelope (M212) tests
 *
 * Wraps an M211 report in a deterministic envelope + gate, embedding the report verbatim. It changes
 * no content and recommends nothing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { gateReadinessReport, summarizeSquadReadiness } from '../packages/coach-intelligence/index.js'

// an M211-report-shaped object (object form of summarizeSquadReadiness)
const report = (over = {}) => ({
  readinessLevel: 'MATCH_READY',
  confidenceLevel: 'HIGH',
  counts: { total: 20, fullyAvailable: 14, availableForSelection: 16, injuryConcern: 2, unavailableOrSuspended: 1, limitedTraining: 1, missingInformation: 0 },
  positionGroups: [{ group: 'FRONT_ROW', total: 3, available: 2, injuryConcern: 0, unavailableOrSuspended: 1, limitedTraining: 0, missingInformation: 0 }],
  trend: { direction: 'IMPROVING', comparable: true, currentReadinessLevel: 'MATCH_READY', previousReadinessLevel: 'UNDERSTRENGTH', confidenceTrend: 'IMPROVING', changes: { availability: 4, injuries: 3, unavailableOrSuspended: 0, limitedTraining: 0 } },
  ...over,
})

// ── valid full report ──────────────────────────────────────────────────────────────────

test('valid full report → PASS gate, all sections, no warnings', () => {
  const env = gateReadinessReport(report())
  assert.equal(env.type, 'squad-readiness-report')
  assert.equal(env.schemaVersion, 1)
  assert.equal(env.readinessLevel, 'MATCH_READY')
  assert.equal(env.confidenceLevel, 'HIGH')
  assert.deepEqual(env.sections, ['counts', 'positionGroups', 'trend'])
  assert.deepEqual(env.warnings, [])
  assert.deepEqual(env.gate, { status: 'PASS', reasons: [] })
})

test('report content is embedded verbatim and never changed', () => {
  const r = report()
  const env = gateReadinessReport(r)
  assert.deepEqual(env.report, r)        // identical content
  assert.notEqual(env.report, r)         // but a clone, not the same reference
})

// ── low confidence ─────────────────────────────────────────────────────────────────────

test('low confidence report → WARN with LOW_CONFIDENCE', () => {
  const env = gateReadinessReport(report({ confidenceLevel: 'LOW' }))
  assert.equal(env.gate.status, 'WARN')
  assert.ok(env.warnings.includes('LOW_CONFIDENCE'))
  assert.ok(env.gate.reasons.includes('LOW_CONFIDENCE'))
})

test('missing-player-information warning when counts flag it', () => {
  const env = gateReadinessReport(report({ counts: { ...report().counts, missingInformation: 3 } }))
  assert.ok(env.warnings.includes('MISSING_PLAYER_INFORMATION'))
  assert.equal(env.gate.status, 'WARN')
})

// ── missing sections ─────────────────────────────────────────────────────────────────

test('missing sections → warnings + reduced sections list', () => {
  const env = gateReadinessReport(report({ positionGroups: [], trend: null }))
  assert.deepEqual(env.sections, ['counts'])
  assert.deepEqual(env.warnings, ['NO_POSITION_DATA', 'NO_TREND'])   // sorted
  assert.equal(env.gate.status, 'WARN')
})

// ── empty report ───────────────────────────────────────────────────────────────────────

test('empty report (NO_SQUAD) → FAIL gate', () => {
  const env = gateReadinessReport({ readinessLevel: 'NO_SQUAD', confidenceLevel: 'NONE', counts: { total: 0, availableForSelection: 0, injuryConcern: 0, unavailableOrSuspended: 0, limitedTraining: 0, fullyAvailable: 0, missingInformation: 0 }, positionGroups: [], trend: null })
  assert.equal(env.gate.status, 'FAIL')
  assert.ok(env.warnings.includes('NO_SQUAD'))
  assert.ok(env.gate.reasons.includes('NO_SQUAD'))
})

// ── reuse real M211 output ─────────────────────────────────────────────────────────────

test('wraps real summarizeSquadReadiness output', () => {
  const m211 = summarizeSquadReadiness({ readiness: { readinessLevel: 'MATCH_READY', confidence: { level: 'HIGH', label: '' }, counts: { total: 16, fullyAvailable: 16, availableForSelection: 16, injuryConcern: 0, unavailableOrSuspended: 0, limitedTraining: 0, missingInformation: 0 }, positionGroups: {}, summary: '' } }, 'object')
  const env = gateReadinessReport(m211)
  assert.equal(env.type, 'squad-readiness-report')
  assert.equal(env.gate.status, 'WARN')   // no position data + no trend
  assert.deepEqual(env.report, m211)
})

// ── determinism / immutability / mutation / validation / export ─────────────────────────

test('deterministic — repeated execution is identical', () => {
  const r = report()
  assert.deepEqual(gateReadinessReport(r), gateReadinessReport(r))
})

test('output is deeply frozen', () => {
  const env = gateReadinessReport(report())
  assert.ok(Object.isFrozen(env) && Object.isFrozen(env.sections) && Object.isFrozen(env.warnings) && Object.isFrozen(env.gate) && Object.isFrozen(env.report) && Object.isFrozen(env.report.counts))
  assert.throws(() => { env.gate.status = 'X' })
  assert.throws(() => env.warnings.push('Y'))
})

test('does not mutate the input report', () => {
  const r = report()
  const before = JSON.stringify(r)
  gateReadinessReport(r)
  assert.equal(JSON.stringify(r), before)
})

test('malformed input rejected clearly', () => {
  assert.throws(() => gateReadinessReport(null), TypeError)
  assert.throws(() => gateReadinessReport([]), TypeError)
  assert.throws(() => gateReadinessReport({}), TypeError)                              // no readinessLevel
  assert.throws(() => gateReadinessReport({ readinessLevel: 5 }), TypeError)           // non-string
})

test('export exists', () => {
  assert.equal(typeof gateReadinessReport, 'function')
})
