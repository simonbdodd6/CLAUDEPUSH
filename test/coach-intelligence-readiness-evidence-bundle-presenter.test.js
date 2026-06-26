/**
 * coach-intelligence — Readiness Evidence Bundle Presenter (M214) tests
 *
 * Renders an M213 bundle's metadata as object/text/json. Reads only; recomputes nothing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { summarizeReadinessBundle, buildReadinessEvidenceBundle } from '../packages/coach-intelligence/index.js'

const bundle = (over = {}) => ({
  type: 'readiness-evidence-bundle',
  schemaVersion: 1,
  manifest: { readiness: true, explanations: false, squadSummary: true, trend: false, report: true, envelope: true },
  components: ['envelope', 'readiness', 'report', 'squadSummary'],
  validation: { status: 'WARN', source: 'envelope' },
  confidence: { level: 'HIGH', source: 'envelope' },
  warnings: ['LOW_CONFIDENCE', 'NO_TREND'],
  sources: {},
  ...over,
})

// ── object ───────────────────────────────────────────────────────────────────────────

test('object format summarizes the bundle metadata', () => {
  const out = summarizeReadinessBundle(bundle(), 'object')
  assert.equal(out.type, 'readiness-evidence-bundle')
  assert.equal(out.schemaVersion, 1)
  assert.equal(out.validationStatus, 'WARN')
  assert.equal(out.confidenceLevel, 'HIGH')
  assert.deepEqual(out.components, ['envelope', 'readiness', 'report', 'squadSummary'])
  assert.deepEqual(out.warnings, ['LOW_CONFIDENCE', 'NO_TREND'])
  assert.deepEqual(out.counts, { components: 4, warnings: 2 })
})

// ── text ───────────────────────────────────────────────────────────────────────────────

test('text format renders deterministic lines', () => {
  const lines = summarizeReadinessBundle(bundle(), 'text').split('\n')
  assert.equal(lines[0], 'ReadinessBundle type=readiness-evidence-bundle v=1 validation=WARN confidence=HIGH components=4 warnings=2')
  assert.equal(lines[1], 'components: envelope,readiness,report,squadSummary')
  assert.equal(lines[2], 'warnings: LOW_CONFIDENCE,NO_TREND')
})

test('empty bundle renders (none) for components/warnings', () => {
  const out = summarizeReadinessBundle(bundle({ components: [], warnings: [], confidence: { level: null, source: 'none' }, validation: { status: 'UNVALIDATED', source: 'none' } }), 'text').split('\n')
  assert.equal(out[1], 'components: (none)')
  assert.equal(out[2], 'warnings: (none)')
})

// ── json ───────────────────────────────────────────────────────────────────────────────

test('json format parses back to the object form', () => {
  const json = summarizeReadinessBundle(bundle(), 'json')
  assert.equal(typeof json, 'string')
  assert.deepEqual(JSON.parse(json), summarizeReadinessBundle(bundle(), 'object'))
})

// ── default / real bundle / determinism / frozen / mutation / validation / export ───────

test('default format (omitted) is the object form', () => {
  assert.deepEqual(summarizeReadinessBundle(bundle()), summarizeReadinessBundle(bundle(), 'object'))
})

test('renders a real M213 bundle', () => {
  const real = buildReadinessEvidenceBundle({ squadSummary: { readinessLevel: 'MATCH_READY', confidence: { level: 'HIGH', label: '' }, counts: { total: 16, missingInformation: 0 }, positionGroups: {} } })
  const out = summarizeReadinessBundle(real, 'object')
  assert.equal(out.type, 'readiness-evidence-bundle')
  assert.deepEqual(out.components, ['squadSummary'])
  assert.equal(out.validationStatus, 'UNVALIDATED')
})

test('deterministic — repeated calls are identical', () => {
  const b = bundle()
  assert.deepEqual(summarizeReadinessBundle(b, 'object'), summarizeReadinessBundle(b, 'object'))
  assert.equal(summarizeReadinessBundle(b, 'text'), summarizeReadinessBundle(b, 'text'))
  assert.equal(summarizeReadinessBundle(b, 'json'), summarizeReadinessBundle(b, 'json'))
})

test('object output is deeply frozen', () => {
  const out = summarizeReadinessBundle(bundle(), 'object')
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.components) && Object.isFrozen(out.warnings) && Object.isFrozen(out.counts))
  assert.throws(() => { out.validationStatus = 'X' })
})

test('does not mutate the input bundle', () => {
  const b = bundle()
  const before = JSON.stringify(b)
  summarizeReadinessBundle(b, 'object')
  assert.equal(JSON.stringify(b), before)
})

test('malformed input rejected clearly', () => {
  assert.throws(() => summarizeReadinessBundle(null), TypeError)
  assert.throws(() => summarizeReadinessBundle({}), TypeError)                                  // missing fields
  assert.throws(() => summarizeReadinessBundle({ type: 'x', validation: {}, components: [] }), TypeError)   // no warnings array
  assert.throws(() => summarizeReadinessBundle(bundle(), 'yaml'), TypeError)                    // bad format
})

test('export exists', () => {
  assert.equal(typeof summarizeReadinessBundle, 'function')
})
