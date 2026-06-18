/**
 * M81 — Evidence Gateway gate-report serializers (serializeGateReport) tests
 *
 * Deterministic tests for the dormant serializers over an M69 report: text (verbatim),
 * json (canonical, round-trips, reuses canonicalStringify), markdown (deterministic from
 * existing fields), default format, determinism, missing optional fields omitted cleanly,
 * invalid-format rejection, invalid-report rejection, frozen input untouched, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, runExpectationGate, formatPipelineSuiteReport,
  serializeGateReport, canonicalStringify, createEvidenceGateway,
} from '@brain/evidence-gateway'
import { createNormalizerRegistry } from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const TENANT = Object.freeze({ clubId: 'c1', teamId: 't1', seasonId: 's1' })
const NCTX = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
const rec = (id, over = {}) => Object.freeze({
  id, tenant: TENANT, subjectType: 'player', subjectId: 'player-9',
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, observedAt: '2026-06-16T09:30:00.000Z', confidence: 0.8, ...over,
})
const frame = (value = 0.82, confidence = 0.5) => ({
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
  normalize: (r) => [{ key: 'lineout.winRate', value, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence, evidenceId: r.id }],
})
const badNote = { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
  normalize: (r) => [{ key: 'bad key', value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: r.id }] }

const REG = createNormalizerRegistry([frame(), badNote])
const REG_CONF = createNormalizerRegistry([frame(0.82, 0.6), badNote])

const planFor = (registry, records) => prepareFullPipelinePlan({ registry, records, context: NCTX })
const snapFor = (registry, records) => snapshotPipelinePlan(planFor(registry, records))

const SNAP_A = snapFor(REG, [rec('ev_1')])
const PLAN_PASS = planFor(REG, [rec('ev_1')])
const PLAN_FAIL = planFor(REG_CONF, [rec('ev_1')])
const setOf = (...names) => createExpectationSet(names.map(n => ({ name: n, expectedSnapshot: SNAP_A })))

const passReport = () => runExpectationGate(setOf('a', 'b'), { a: PLAN_PASS, b: PLAN_PASS }).report
const failReport = (opts) => runExpectationGate(setOf('ok', 'bad'), { ok: PLAN_PASS, bad: PLAN_FAIL }, opts).report

// ── text ─────────────────────────────────────────────────────────────────────────────

test('format:"text" → the report text field verbatim', () => {
  const r = failReport()
  assert.equal(serializeGateReport(r, { format: 'text' }), r.text)
})

test('default format is text', () => {
  const r = failReport()
  assert.equal(serializeGateReport(r), r.text)
})

// ── json ─────────────────────────────────────────────────────────────────────────────

test('format:"json" → canonical JSON that round-trips, reusing canonicalStringify', () => {
  const r = failReport()
  const s = serializeGateReport(r, { format: 'json' })
  assert.equal(s, canonicalStringify(r))
  assert.deepEqual(JSON.parse(s), JSON.parse(canonicalStringify(r)))
  assert.ok(s.indexOf('"cases"') < s.indexOf('"headline"'))   // canonical key sort
})

// ── markdown ─────────────────────────────────────────────────────────────────────────

test('format:"markdown" → headline, status, counts, first failing case, roll-up, sections', () => {
  const r = failReport()
  const md = serializeGateReport(r, { format: 'markdown' })
  assert.ok(md.startsWith(`# ${r.headline}`))
  assert.ok(md.includes('**Status:** FAIL'))
  assert.ok(md.includes(`**Cases:** total=${r.summary.totalCases} passed=${r.summary.passed} failed=${r.summary.failed}`))
  assert.ok(md.includes(`**First failing case:** ${r.cases[0].name}`))
  assert.ok(md.includes(`**Violations:** ${r.summary.violations}`))
  assert.ok(md.includes(`**Tolerated:** ${r.summary.tolerated}`))
  assert.ok(md.includes('## Failing cases'))
  assert.ok(md.includes(`### ${r.cases[0].name}`))
  // a sampled violation path appears as a markdown bullet
  assert.ok(md.includes(`\`${r.cases[0].sample[0].kind}\` ${r.cases[0].sample[0].path}`))
})

test('markdown for a passing report → status PASS, no Failing cases section', () => {
  const r = passReport()
  const md = serializeGateReport(r, { format: 'markdown' })
  assert.ok(md.includes('**Status:** PASS'))
  assert.ok(!md.includes('## Failing cases'))
  assert.ok(!md.includes('**First failing case:**'))
  assert.ok(md.includes('**Affected stages:** none'))
})

test('markdown shows the "…and N more" truncation note when present', () => {
  const r = failReport({ maxEntriesPerCase: 1 })
  const md = serializeGateReport(r, { format: 'markdown' })
  assert.ok(r.cases[0].truncated > 0)
  assert.ok(md.includes(`…and ${r.cases[0].truncated} more`))
})

// ── determinism ──────────────────────────────────────────────────────────────────────

test('deterministic — identical report → identical serialization (all formats)', () => {
  for (const format of ['text', 'json', 'markdown']) {
    assert.equal(serializeGateReport(failReport(), { format }), serializeGateReport(failReport(), { format }))
  }
})

// ── missing optional fields omitted cleanly ──────────────────────────────────────────

test('markdown omits sections for missing fields cleanly', () => {
  // a minimal report-like object with only a headline
  const minimal = { headline: 'Just a headline', text: 'x' }
  const md = serializeGateReport(minimal, { format: 'markdown' })
  assert.equal(md, '# Just a headline')   // no status/counts/rollup/sections
})

test('markdown with summary but no cases → roll-up present, no Failing cases section', () => {
  const partial = {
    text: 'x', pass: true, headline: 'H',
    summary: { totalCases: 3, passed: 3, failed: 0, violations: 0, tolerated: 0, affectedStages: [] },
    cases: [],
  }
  const md = serializeGateReport(partial, { format: 'markdown' })
  assert.ok(md.includes('**Cases:** total=3 passed=3 failed=0'))
  assert.ok(!md.includes('**First failing case:**'))
  assert.ok(!md.includes('## Failing cases'))
})

// ── invalid format / report ──────────────────────────────────────────────────────────

test('unknown format → TypeError', () => {
  const r = passReport()
  assert.throws(() => serializeGateReport(r, { format: 'html' }), TypeError)
  assert.throws(() => serializeGateReport(r, { format: '' }), TypeError)
  assert.throws(() => serializeGateReport(r, { format: 7 }), TypeError)
})

test('invalid report → TypeError', () => {
  assert.throws(() => serializeGateReport(null), TypeError)
  assert.throws(() => serializeGateReport('nope'), TypeError)
})

// ── purity: input untouched ──────────────────────────────────────────────────────────

test('frozen input report is left untouched', () => {
  const r = failReport({ maxEntriesPerCase: 1 })
  assert.ok(Object.isFrozen(r))
  const before = JSON.stringify(r)
  serializeGateReport(r, { format: 'text' })
  serializeGateReport(r, { format: 'json' })
  serializeGateReport(r, { format: 'markdown' })
  assert.equal(JSON.stringify(r), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.serializeGateReport matches serializeGateReport (all formats)', () => {
  const gw = createEvidenceGateway()
  const r = failReport({ maxEntriesPerCase: 2 })
  for (const format of ['text', 'json', 'markdown']) {
    assert.equal(gw.serializeGateReport(r, { format }), serializeGateReport(r, { format }))
  }
  assert.equal(gw.serializeGateReport(r), serializeGateReport(r))   // default
})
