/**
 * M68 — Evidence Gateway expectation-suite / multi-case regression-gate tests
 *
 * Deterministic tests for the dormant suite gate that folds M67 per-case verdicts:
 * all-pass, first-failing case, mixed pass/fail, suite-level allowlist, per-case allowlist
 * overriding the suite default, union of affected stages, immutability, determinism,
 * empty suite (vacuous pass), input validation, and gateway.checkSuite parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  checkPipelineAgainstExpected, checkPipelineSuite, createEvidenceGateway,
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

// ── all passing ──────────────────────────────────────────────────────────────────────

test('all cases passing → suite pass, no failures', () => {
  const s = checkPipelineSuite([passCase('a'), passCase('b'), passCase('c')])
  assert.equal(s.pass, true)
  assert.equal(s.total, 3)
  assert.equal(s.passed, 3)
  assert.equal(s.failed, 0)
  assert.equal(s.firstFailingCase, null)
  assert.deepEqual(s.affectedStages, [])
  assert.deepEqual(s.summary, { violations: 0, tolerated: 0, affectedStages: 0 })
  assert.ok(s.cases.every(c => c.pass === true))
})

// ── first failing case ───────────────────────────────────────────────────────────────

test('first failing case is the earliest failing in input order', () => {
  const s = checkPipelineSuite([passCase('ok-1'), confFailCase('bad-2'), confFailCase('bad-3')])
  assert.equal(s.pass, false)
  assert.equal(s.firstFailingCase, 'bad-2')
  assert.equal(s.passed, 1)
  assert.equal(s.failed, 2)
})

// ── mixed pass/fail ──────────────────────────────────────────────────────────────────

test('mixed pass/fail → suite fails; counts + per-case verdicts correct', () => {
  const s = checkPipelineSuite([passCase('p1'), confFailCase('f1'), passCase('p2'), valFailCase('f2')])
  assert.equal(s.pass, false)
  assert.equal(s.total, 4)
  assert.equal(s.passed, 2)
  assert.equal(s.failed, 2)
  assert.equal(s.firstFailingCase, 'f1')
  assert.equal(s.cases.find(c => c.name === 'p1').pass, true)
  assert.equal(s.cases.find(c => c.name === 'f1').pass, false)
  // each per-case verdict is a full M67 verdict
  assert.ok(s.cases.find(c => c.name === 'f1').verdict.summary.total > 0)
  assert.ok(s.summary.violations > 0)
})

// ── suite-level allowlist ────────────────────────────────────────────────────────────

test('suite allowlist applied to every case by default → tolerated → pass', () => {
  const stages = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), baseExpected()).affectedStages
  const s = checkPipelineSuite([confFailCase('f1'), confFailCase('f2')], { allowlist: { stages } })
  assert.equal(s.pass, true)
  assert.equal(s.failed, 0)
  assert.ok(s.summary.tolerated > 0)
  assert.equal(s.summary.violations, 0)
})

// ── per-case allowlist overrides the suite default ───────────────────────────────────

test('per-case allowlist overrides suite allowlist for that case only', () => {
  const tolerantStages = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), baseExpected()).affectedStages
  const s = checkPipelineSuite(
    [
      // f1 carries its own tolerant allowlist → passes
      { ...confFailCase('f1'), allowlist: { stages: tolerantStages } },
      // f2 inherits the suite allowlist, which does NOT cover its deviation → fails
      confFailCase('f2'),
    ],
    { allowlist: { stages: ['nonexistent-stage'] } },
  )
  assert.equal(s.cases.find(c => c.name === 'f1').pass, true)
  assert.equal(s.cases.find(c => c.name === 'f2').pass, false)
  assert.equal(s.pass, false)
  assert.equal(s.firstFailingCase, 'f2')
})

test('per-case empty allowlist overrides a tolerant suite allowlist → case fails', () => {
  const tolerantStages = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), baseExpected()).affectedStages
  const s = checkPipelineSuite(
    [{ ...confFailCase('f1'), allowlist: [] }],   // explicit empty overrides suite default
    { allowlist: { stages: tolerantStages } },
  )
  assert.equal(s.pass, false)
  assert.equal(s.cases[0].pass, false)
})

// ── union of affected stages ─────────────────────────────────────────────────────────

test('affectedStages is the sorted union across failing cases', () => {
  const valStages = checkPipelineAgainstExpected(planFor(REG_VAL, [rec('ev_1')]), baseExpected()).affectedStages
  const addStages = checkPipelineAgainstExpected(planFor(REG, [rec('ev_1'), rec('ev_2')]), baseExpected()).affectedStages
  const addCase = { name: 'added', planOrSnapshot: planFor(REG, [rec('ev_1'), rec('ev_2')]), expectedSnapshot: baseExpected() }
  const s = checkPipelineSuite([valFailCase('v'), addCase])
  const expectedUnion = [...new Set([...valStages, ...addStages])].sort()
  assert.deepEqual(s.affectedStages, expectedUnion)
  assert.equal(s.summary.affectedStages, expectedUnion.length)
  // sorted + de-duplicated
  assert.deepEqual([...new Set(s.affectedStages)].sort(), s.affectedStages)
})

// ── immutability / determinism ───────────────────────────────────────────────────────

test('suite verdict is deeply frozen', () => {
  const s = checkPipelineSuite([passCase('a'), confFailCase('b')])
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.cases) && Object.isFrozen(s.summary) && Object.isFrozen(s.affectedStages))
  assert.ok(Object.isFrozen(s.cases[0]) && Object.isFrozen(s.cases[0].verdict))
  assert.throws(() => s.cases.push({}))
  assert.throws(() => { s.pass = true })
  assert.throws(() => { s.summary.violations = 0 })
})

test('deterministic — identical suite inputs → identical verdict', () => {
  const build = () => [passCase('a'), confFailCase('b'), valFailCase('c')]
  assert.deepEqual(checkPipelineSuite(build()), checkPipelineSuite(build()))
})

// ── empty suite ──────────────────────────────────────────────────────────────────────

test('empty suite → vacuous pass with zeroed aggregate', () => {
  const s = checkPipelineSuite([])
  assert.equal(s.pass, true)
  assert.equal(s.total, 0)
  assert.equal(s.passed, 0)
  assert.equal(s.failed, 0)
  assert.equal(s.firstFailingCase, null)
  assert.deepEqual(s.cases, [])
  assert.deepEqual(s.affectedStages, [])
  assert.deepEqual(s.summary, { violations: 0, tolerated: 0, affectedStages: 0 })
})

// ── input validation ─────────────────────────────────────────────────────────────────

test('non-array cases → TypeError', () => {
  assert.throws(() => checkPipelineSuite(null), TypeError)
  assert.throws(() => checkPipelineSuite({ name: 'x' }), TypeError)
})

test('non-object case → TypeError', () => {
  assert.throws(() => checkPipelineSuite([passCase('ok'), 'not-a-case']), TypeError)
})

test('invalid plan/snapshot inside a case → throws via the M65/M67 contract', () => {
  assert.throws(() => checkPipelineSuite([{ name: 'bad', planOrSnapshot: null, expectedSnapshot: baseExpected() }]), TypeError)
})

// ── gateway.checkSuite parity ────────────────────────────────────────────────────────

test('gateway.checkSuite matches checkPipelineSuite', () => {
  const gw = createEvidenceGateway()
  const cases = [passCase('a'), confFailCase('b')]
  const opts = { allowlist: ['counts'] }
  assert.deepEqual(gw.checkSuite(cases, opts), checkPipelineSuite(cases, opts))
})

test('gateway.checkSuite over all-passing cases → pass', () => {
  const gw = createEvidenceGateway()
  const s = gw.checkSuite([passCase('a'), passCase('b')])
  assert.equal(s.pass, true)
  assert.equal(s.passed, 2)
})
