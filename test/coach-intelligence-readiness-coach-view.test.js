/**
 * coach-intelligence — Readiness Draft Coach View Contract (M217) tests
 *
 * Maps an M213 bundle into a curated coachView for a future UI. Exposes only mapped fields; recommends
 * nothing. Bundles are built with the real M213 engine.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildReadinessCoachView, buildReadinessEvidenceBundle } from '../packages/coach-intelligence/index.js'

const squadSummary = (over = {}) => ({
  readinessLevel: 'MATCH_READY',
  confidence: { level: 'HIGH', label: '' },
  counts: { total: 20, fullyAvailable: 14, availableForSelection: 16, injuryConcern: 2, unavailableOrSuspended: 1, limitedTraining: 1, missingInformation: 0 },
  positionGroups: { FRONT_ROW: { total: 3, available: 2, injuryConcern: 0, unavailableOrSuspended: 1, limitedTraining: 0, missingInformation: 0 } },
  summary: 'Match ready: 16 of 20 available for selection.',
  ...over,
})
const explanations = () => [
  { playerId: 'p1', positiveFactors: [{ code: 'AVAILABLE', label: '' }], limitingFactors: [], missingInformation: [], confidence: { level: 'HIGH' } },
  { playerId: 'p2', positiveFactors: [], limitingFactors: [{ code: 'POOR_ATTENDANCE', label: '' }], missingInformation: [], confidence: { level: 'HIGH' } },
  { playerId: 'p3', positiveFactors: [], limitingFactors: [], missingInformation: [{ code: 'NO_FITNESS_DATA', label: '' }], confidence: { level: 'MEDIUM' } },
]
const trend = (over = {}) => ({ direction: 'IMPROVING', comparable: true, currentReadinessLevel: 'MATCH_READY', previousReadinessLevel: 'UNDERSTRENGTH', confidenceTrend: 'IMPROVING', changes: { availability: 4, injuries: 0, unavailableOrSuspended: 0, limitedTraining: 0 }, ...over })
const report = (over = {}) => ({ readinessLevel: 'MATCH_READY', confidenceLevel: 'HIGH', counts: { total: 20 }, positionGroups: [], trend: null, ...over })
const envelope = (over = {}) => ({ type: 'squad-readiness-report', schemaVersion: 1, readinessLevel: 'MATCH_READY', confidenceLevel: 'HIGH', sections: ['counts'], warnings: [], gate: { status: 'PASS', reasons: [] }, report: report(), ...over })

const fullBundle = (over = {}) => buildReadinessEvidenceBundle({
  readiness: { status: 'READY', codes: [], metrics: {} },
  explanations: explanations(),
  squadSummary: squadSummary(),
  trend: trend(),
  report: report(),
  envelope: envelope(),
  ...over,
})

// ── full bundle ────────────────────────────────────────────────────────────────────────

test('full readiness bundle → complete coach view', () => {
  const v = buildReadinessCoachView(fullBundle())
  assert.equal(v.status, 'MATCH_READY')
  assert.equal(v.confidence, 'HIGH')
  assert.deepEqual(v.gate, { status: 'PASS', reasons: [] })
  assert.equal(v.headline, 'Match ready — 16/20 available')
  assert.deepEqual(v.keyNumbers, { total: 20, available: 16, injuries: 2, unavailableOrSuspended: 1, limitedTraining: 1, missing: 0 })
  assert.deepEqual(v.playerReadiness, { count: 3, withLimitingFactors: 1, withMissingInformation: 1 })
  assert.deepEqual(v.squad.positionGroups.map((g) => g.group), ['FRONT_ROW'])
  assert.equal(v.squad.summary, 'Match ready: 16 of 20 available for selection.')
  assert.equal(v.trend.direction, 'IMPROVING')
})

// ── without trend ────────────────────────────────────────────────────────────────────

test('bundle without trend → trend null', () => {
  const b = fullBundle({ trend: undefined })
  const v = buildReadinessCoachView(b)
  assert.equal(v.trend, null)
})

// ── low confidence ─────────────────────────────────────────────────────────────────────

test('low confidence bundle → confidence LOW + warning surfaced in headline', () => {
  const b = buildReadinessEvidenceBundle({ squadSummary: squadSummary({ confidence: { level: 'LOW', label: '' }, counts: { ...squadSummary().counts, missingInformation: 4 } }), explanations: explanations() })
  const v = buildReadinessCoachView(b)
  assert.equal(v.confidence, 'LOW')
  assert.ok(v.warnings.includes('LOW_CONFIDENCE'))
  assert.match(v.headline, /to review$/)
})

// ── failed gate ────────────────────────────────────────────────────────────────────────

test('failed-gate bundle (NO_SQUAD) → gate FAIL', () => {
  const b = buildReadinessEvidenceBundle({
    squadSummary: squadSummary({ readinessLevel: 'NO_SQUAD', confidence: { level: 'NONE', label: '' }, counts: { total: 0, availableForSelection: 0, injuryConcern: 0, unavailableOrSuspended: 0, limitedTraining: 0, fullyAvailable: 0, missingInformation: 0 }, positionGroups: {}, summary: '' }),
    envelope: envelope({ readinessLevel: 'NO_SQUAD', gate: { status: 'FAIL', reasons: ['NO_SQUAD'] }, warnings: ['NO_SQUAD'] }),
  })
  const v = buildReadinessCoachView(b)
  assert.equal(v.status, 'NO_SQUAD')
  assert.equal(v.gate.status, 'FAIL')
  assert.deepEqual(v.gate.reasons, ['NO_SQUAD'])
})

// ── missing warnings / empty ───────────────────────────────────────────────────────────

test('missing warnings → empty warnings, headline has no review note', () => {
  const v = buildReadinessCoachView(fullBundle())
  assert.deepEqual(v.warnings, [])
  assert.doesNotMatch(v.headline, /to review/)
})

test('empty bundle → minimal coach view (null status, zeroed numbers)', () => {
  const v = buildReadinessCoachView(buildReadinessEvidenceBundle({}))
  assert.equal(v.status, null)
  assert.equal(v.squad, null)
  assert.equal(v.trend, null)
  assert.deepEqual(v.keyNumbers, { total: 0, available: 0, injuries: 0, unavailableOrSuspended: 0, limitedTraining: 0, missing: 0 })
  assert.deepEqual(v.playerReadiness, { count: 0, withLimitingFactors: 0, withMissingInformation: 0 })
  assert.equal(v.headline, 'Readiness unknown — 0/0 available')
})

// ── no raw internals leaked ────────────────────────────────────────────────────────────

test('does not expose raw internal bundle fields', () => {
  const v = buildReadinessCoachView(fullBundle())
  assert.equal(v.sources, undefined)
  assert.equal(v.manifest, undefined)
  assert.equal(v.type, undefined)
  assert.equal(v.components, undefined)
})

// ── determinism / immutability / mutation / validation / export ─────────────────────────

test('deterministic — repeated execution is identical', () => {
  const b = fullBundle()
  assert.deepEqual(buildReadinessCoachView(b), buildReadinessCoachView(b))
})

test('output is deeply frozen', () => {
  const v = buildReadinessCoachView(fullBundle())
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.keyNumbers) && Object.isFrozen(v.warnings) &&
    Object.isFrozen(v.playerReadiness) && Object.isFrozen(v.gate) && Object.isFrozen(v.squad) && Object.isFrozen(v.trend))
  assert.throws(() => { v.status = 'X' })
})

test('does not mutate the input bundle', () => {
  const b = fullBundle()
  const before = JSON.stringify(b)
  buildReadinessCoachView(b)
  assert.equal(JSON.stringify(b), before)
})

test('malformed input rejected clearly', () => {
  assert.throws(() => buildReadinessCoachView(null), TypeError)
  assert.throws(() => buildReadinessCoachView([]), TypeError)
  assert.throws(() => buildReadinessCoachView({}), TypeError)                                       // no sources/validation/warnings
  assert.throws(() => buildReadinessCoachView({ sources: {}, validation: {} }), TypeError)          // no warnings array
})

test('export exists', () => {
  assert.equal(typeof buildReadinessCoachView, 'function')
})
