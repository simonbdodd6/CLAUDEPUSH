/**
 * M69 — Evidence Gateway suite report / human-readable gate summary tests
 *
 * Deterministic tests for the dormant formatter over M67/M68 verdicts: passing-suite
 * report, failing-suite report, single M67 verdict report, mixed suite, violation-path
 * truncation ("…and N more"), tolerated-vs-violation roll-up, determinism, deep-frozen
 * return, gateway.formatSuiteReport parity, and invalid-input handling.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  checkPipelineAgainstExpected, checkPipelineSuite,
  formatPipelineSuiteReport, createEvidenceGateway,
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
const REG_CONF = createNormalizerRegistry([frame(0.82, 0.6), badNote])   // changed confidence
const REG_VAL = createNormalizerRegistry([frame(0.9, 0.5), badNote])     // changed normalized value

const planFor = (registry, records) => prepareFullPipelinePlan({ registry, records, context: NCTX })
const snapFor = (registry, records) => snapshotPipelinePlan(planFor(registry, records))

const baseExpected = () => snapFor(REG, [rec('ev_1')])
const passCase = (name) => ({ name, planOrSnapshot: planFor(REG, [rec('ev_1')]), expectedSnapshot: baseExpected() })
const confFailCase = (name) => ({ name, planOrSnapshot: planFor(REG_CONF, [rec('ev_1')]), expectedSnapshot: baseExpected() })
const valFailCase = (name) => ({ name, planOrSnapshot: planFor(REG_VAL, [rec('ev_1')]), expectedSnapshot: baseExpected() })

// ── passing suite ────────────────────────────────────────────────────────────────────

test('passing suite → PASS headline, no failing-case sections', () => {
  const r = formatPipelineSuiteReport(checkPipelineSuite([passCase('a'), passCase('b')]))
  assert.equal(r.pass, true)
  assert.equal(r.headline, 'PASS — 2/2 cases passed')
  assert.deepEqual(r.cases, [])
  assert.equal(r.summary.failed, 0)
  assert.ok(r.text.startsWith('PASS — 2/2 cases passed'))
  assert.ok(!/Failing cases:/.test(r.text))
})

// ── failing suite ────────────────────────────────────────────────────────────────────

test('failing suite → FAIL headline names first failing case + sections', () => {
  const r = formatPipelineSuiteReport(checkPipelineSuite([passCase('ok'), confFailCase('bad-1'), valFailCase('bad-2')]))
  assert.equal(r.pass, false)
  assert.equal(r.headline, 'FAIL — 2/3 cases failed (first failing: bad-1)')
  assert.equal(r.cases.length, 2)
  assert.deepEqual(r.cases.map(c => c.name), ['bad-1', 'bad-2'])
  assert.ok(r.text.includes('Failing cases:'))
  assert.ok(r.text.includes('- bad-1:'))
  // affected stages surfaced in a section
  assert.ok(r.cases[0].affectedStages.length > 0)
  assert.ok(r.cases[0].affectedStages.every(s => r.text.includes(s)))
})

// ── single M67 verdict ───────────────────────────────────────────────────────────────

test('single M67 verdict (failing) → report with one synthetic case', () => {
  const v = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), baseExpected())
  const r = formatPipelineSuiteReport(v)
  assert.equal(r.pass, false)
  assert.equal(r.headline, 'FAIL — 1/1 cases failed (first failing: (single))')
  assert.equal(r.cases.length, 1)
  assert.equal(r.cases[0].name, '(single)')
  assert.equal(r.cases[0].violations.total, v.summary.total)
  assert.equal(r.summary.violations, v.summary.total)
  assert.equal(r.summary.tolerated, v.summary.tolerated)
})

test('single M67 verdict (passing) → PASS 1/1', () => {
  const v = checkPipelineAgainstExpected(planFor(REG, [rec('ev_1')]), baseExpected())
  const r = formatPipelineSuiteReport(v)
  assert.equal(r.pass, true)
  assert.equal(r.headline, 'PASS — 1/1 cases passed')
  assert.deepEqual(r.cases, [])
})

// ── mixed suite ──────────────────────────────────────────────────────────────────────

test('mixed suite → only failing cases get sections; counts match', () => {
  const r = formatPipelineSuiteReport(checkPipelineSuite([passCase('p1'), confFailCase('f1'), passCase('p2'), valFailCase('f2')]))
  assert.equal(r.summary.totalCases, 4)
  assert.equal(r.summary.passed, 2)
  assert.equal(r.summary.failed, 2)
  assert.deepEqual(r.cases.map(c => c.name), ['f1', 'f2'])
})

// ── truncation ───────────────────────────────────────────────────────────────────────

test('maxEntriesPerCase truncates the sample with an explicit "…and N more"', () => {
  const v = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), baseExpected())
  const totalViolations = v.summary.total
  assert.ok(totalViolations > 2, 'fixture should produce several violation paths')
  const r = formatPipelineSuiteReport(checkPipelineSuite([confFailCase('big')]), { maxEntriesPerCase: 2 })
  const cr = r.cases[0]
  assert.equal(cr.sample.length, 2)
  assert.equal(cr.truncated, cr.violations.total - 2)
  assert.ok(cr.truncated > 0)
  assert.ok(r.text.includes(`…and ${cr.truncated} more`))
})

test('maxEntriesPerCase=0 → empty sample, all violations counted as truncated', () => {
  const r = formatPipelineSuiteReport(checkPipelineSuite([confFailCase('z')]), { maxEntriesPerCase: 0 })
  const cr = r.cases[0]
  assert.equal(cr.sample.length, 0)
  assert.equal(cr.truncated, cr.violations.total)
  assert.ok(r.text.includes(`…and ${cr.violations.total} more`))
})

test('no truncation note when sample covers all violations', () => {
  const r = formatPipelineSuiteReport(checkPipelineSuite([confFailCase('z')]), { maxEntriesPerCase: 1000 })
  const cr = r.cases[0]
  assert.equal(cr.truncated, 0)
  assert.equal(cr.sample.length, cr.violations.total)
  assert.ok(!r.text.includes('more'))
})

test('invalid maxEntriesPerCase falls back to the default (no throw)', () => {
  const r = formatPipelineSuiteReport(checkPipelineSuite([confFailCase('z')]), { maxEntriesPerCase: -5 })
  assert.ok(r.cases[0].sample.length >= 0)
  const r2 = formatPipelineSuiteReport(checkPipelineSuite([confFailCase('z')]), { maxEntriesPerCase: 'lots' })
  assert.ok(r2.cases[0].sample.length >= 0)
})

// ── tolerated vs violation roll-up ───────────────────────────────────────────────────

test('tolerated vs violation roll-up reflected in summary + text', () => {
  const tolerantStages = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), baseExpected()).affectedStages
  // f1 fully tolerated (passes), f2 fully violating
  const suite = checkPipelineSuite([
    { ...confFailCase('f1'), allowlist: { stages: tolerantStages } },
    confFailCase('f2'),
  ])
  const r = formatPipelineSuiteReport(suite)
  assert.equal(r.summary.tolerated, suite.summary.tolerated)
  assert.equal(r.summary.violations, suite.summary.violations)
  assert.ok(r.summary.tolerated > 0 && r.summary.violations > 0)
  assert.ok(r.text.includes(`Violations: ${suite.summary.violations}`))
  assert.ok(r.text.includes(`Tolerated: ${suite.summary.tolerated}`))
})

// ── determinism / immutability ───────────────────────────────────────────────────────

test('deterministic — identical verdict → identical report', () => {
  const build = () => checkPipelineSuite([passCase('a'), confFailCase('b'), valFailCase('c')])
  assert.deepEqual(formatPipelineSuiteReport(build()), formatPipelineSuiteReport(build()))
})

test('report is deeply frozen', () => {
  const r = formatPipelineSuiteReport(checkPipelineSuite([confFailCase('b')]), { maxEntriesPerCase: 1 })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.cases) && Object.isFrozen(r.summary))
  assert.ok(Object.isFrozen(r.cases[0]) && Object.isFrozen(r.cases[0].sample) && Object.isFrozen(r.cases[0].affectedStages))
  assert.throws(() => r.cases.push({}))
  assert.throws(() => { r.headline = 'x' })
  assert.throws(() => { r.summary.failed = 0 })
})

test('does not mutate the input verdict', () => {
  const suite = checkPipelineSuite([confFailCase('b')])
  const before = JSON.stringify(suite)
  formatPipelineSuiteReport(suite, { maxEntriesPerCase: 1 })
  assert.equal(JSON.stringify(suite), before)
})

// ── invalid input ────────────────────────────────────────────────────────────────────

test('invalid input → TypeError', () => {
  assert.throws(() => formatPipelineSuiteReport(null), TypeError)
  assert.throws(() => formatPipelineSuiteReport({}), TypeError)
  assert.throws(() => formatPipelineSuiteReport({ foo: 'bar' }), TypeError)
  assert.throws(() => formatPipelineSuiteReport('nope'), TypeError)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.formatSuiteReport matches formatPipelineSuiteReport', () => {
  const gw = createEvidenceGateway()
  const suite = checkPipelineSuite([passCase('a'), confFailCase('b')])
  assert.deepEqual(gw.formatSuiteReport(suite, { maxEntriesPerCase: 3 }), formatPipelineSuiteReport(suite, { maxEntriesPerCase: 3 }))
})

test('gateway.formatSuiteReport accepts a single M67 verdict', () => {
  const gw = createEvidenceGateway()
  const v = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), baseExpected())
  assert.deepEqual(gw.formatSuiteReport(v), formatPipelineSuiteReport(v))
})
