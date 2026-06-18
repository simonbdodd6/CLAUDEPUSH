/**
 * M70 — Evidence Gateway expectation-set registry / named baseline store-plan tests
 *
 * Deterministic tests for the dormant data-only registry + resolver: valid creation,
 * duplicate-name / invalid-entry / missing-expectedSnapshot rejection, allowlist + default
 * planOrSnapshot preservation, resolving runs from an object keyed by name and from an
 * array of named runs, missing / unknown run rejection, deterministic ordering, deep-frozen
 * outputs, no input mutation, integration into checkPipelineSuite, and gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, resolveExpectationSet, checkPipelineSuite, createEvidenceGateway,
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
const SNAP_B = snapFor(REG, [rec('ev_2')])
const PLAN_A = planFor(REG, [rec('ev_1')])
const PLAN_A_FAIL = planFor(REG_CONF, [rec('ev_1')])

// ── creation ─────────────────────────────────────────────────────────────────────────

test('valid expectation set creation → frozen registry with names/entries/byName', () => {
  const set = createExpectationSet([
    { name: 'alpha', expectedSnapshot: SNAP_A },
    { name: 'beta', expectedSnapshot: SNAP_B, allowlist: ['counts'] },
  ])
  assert.equal(set.size, 2)
  assert.deepEqual(set.names, ['alpha', 'beta'])
  assert.equal(set.entries.length, 2)
  assert.equal(set.byName.alpha.expectedSnapshot, SNAP_A)
  assert.ok(Object.isFrozen(set) && Object.isFrozen(set.entries) && Object.isFrozen(set.names) && Object.isFrozen(set.byName))
  assert.ok(Object.isFrozen(set.entries[0]))
})

test('allowlist + default planOrSnapshot preserved verbatim', () => {
  const set = createExpectationSet([
    { name: 'a', expectedSnapshot: SNAP_A, allowlist: { stages: ['normalize'] }, planOrSnapshot: PLAN_A },
  ])
  assert.deepEqual(set.byName.a.allowlist, { stages: ['normalize'] })
  assert.equal(set.byName.a.planOrSnapshot, PLAN_A)
})

test('entry without allowlist/planOrSnapshot omits those keys', () => {
  const set = createExpectationSet([{ name: 'a', expectedSnapshot: SNAP_A }])
  assert.ok(!('allowlist' in set.byName.a))
  assert.ok(!('planOrSnapshot' in set.byName.a))
})

// ── creation validation ──────────────────────────────────────────────────────────────

test('non-array entries → TypeError', () => {
  assert.throws(() => createExpectationSet(null), TypeError)
  assert.throws(() => createExpectationSet({ name: 'a' }), TypeError)
})

test('invalid entry / empty name → TypeError', () => {
  assert.throws(() => createExpectationSet(['nope']), TypeError)
  assert.throws(() => createExpectationSet([{ expectedSnapshot: SNAP_A }]), TypeError)            // no name
  assert.throws(() => createExpectationSet([{ name: '', expectedSnapshot: SNAP_A }]), TypeError)  // empty name
  assert.throws(() => createExpectationSet([{ name: 5, expectedSnapshot: SNAP_A }]), TypeError)   // non-string
})

test('missing expectedSnapshot → TypeError', () => {
  assert.throws(() => createExpectationSet([{ name: 'a' }]), TypeError)
  assert.throws(() => createExpectationSet([{ name: 'a', expectedSnapshot: null }]), TypeError)
})

test('duplicate names → TypeError', () => {
  assert.throws(() => createExpectationSet([
    { name: 'dup', expectedSnapshot: SNAP_A },
    { name: 'dup', expectedSnapshot: SNAP_B },
  ]), TypeError)
})

test('empty entries → empty frozen set', () => {
  const set = createExpectationSet([])
  assert.equal(set.size, 0)
  assert.deepEqual(set.names, [])
  assert.deepEqual(resolveExpectationSet(set), [])
})

// ── resolving from object keyed by name ──────────────────────────────────────────────

test('resolve runs from object keyed by name → M68 cases array, ordered', () => {
  const set = createExpectationSet([
    { name: 'a', expectedSnapshot: SNAP_A, allowlist: ['counts'] },
    { name: 'b', expectedSnapshot: SNAP_B },
  ])
  const cases = resolveExpectationSet(set, { a: PLAN_A, b: planFor(REG, [rec('ev_2')]) })
  assert.deepEqual(cases.map(c => c.name), ['a', 'b'])
  assert.equal(cases[0].planOrSnapshot, PLAN_A)
  assert.equal(cases[0].expectedSnapshot, SNAP_A)
  assert.deepEqual(cases[0].allowlist, ['counts'])
  assert.ok(!('allowlist' in cases[1]))   // b had none
})

test('resolve accepts object values as { planOrSnapshot } wrappers too', () => {
  const set = createExpectationSet([{ name: 'a', expectedSnapshot: SNAP_A }])
  const cases = resolveExpectationSet(set, { a: { planOrSnapshot: PLAN_A } })
  assert.equal(cases[0].planOrSnapshot, PLAN_A)
})

// ── resolving from array of named runs ───────────────────────────────────────────────

test('resolve runs from array of { name, planOrSnapshot }', () => {
  const set = createExpectationSet([
    { name: 'a', expectedSnapshot: SNAP_A },
    { name: 'b', expectedSnapshot: SNAP_B },
  ])
  const cases = resolveExpectationSet(set, [
    { name: 'b', planOrSnapshot: planFor(REG, [rec('ev_2')]) },
    { name: 'a', planOrSnapshot: PLAN_A },
  ])
  // ordering follows the expectation set, not the runs array
  assert.deepEqual(cases.map(c => c.name), ['a', 'b'])
  assert.equal(cases[0].planOrSnapshot, PLAN_A)
})

test('default planOrSnapshot used when no fresh run supplied for a name', () => {
  const set = createExpectationSet([
    { name: 'a', expectedSnapshot: SNAP_A, planOrSnapshot: PLAN_A },   // has default
    { name: 'b', expectedSnapshot: SNAP_B },
  ])
  const cases = resolveExpectationSet(set, { b: planFor(REG, [rec('ev_2')]) })
  assert.equal(cases[0].planOrSnapshot, PLAN_A)   // fell back to entry default
})

// ── resolve validation ───────────────────────────────────────────────────────────────

test('missing run (no fresh run, no default) → TypeError', () => {
  const set = createExpectationSet([{ name: 'a', expectedSnapshot: SNAP_A }])
  assert.throws(() => resolveExpectationSet(set, {}), TypeError)
})

test('unknown run name → TypeError', () => {
  const set = createExpectationSet([{ name: 'a', expectedSnapshot: SNAP_A }])
  assert.throws(() => resolveExpectationSet(set, { a: PLAN_A, ghost: PLAN_A }), TypeError)
  assert.throws(() => resolveExpectationSet(set, [{ name: 'ghost', planOrSnapshot: PLAN_A }]), TypeError)
})

test('duplicate run name in array → TypeError', () => {
  const set = createExpectationSet([{ name: 'a', expectedSnapshot: SNAP_A }])
  assert.throws(() => resolveExpectationSet(set, [
    { name: 'a', planOrSnapshot: PLAN_A }, { name: 'a', planOrSnapshot: PLAN_A },
  ]), TypeError)
})

test('invalid run shape / runs type → TypeError', () => {
  const set = createExpectationSet([{ name: 'a', expectedSnapshot: SNAP_A }])
  assert.throws(() => resolveExpectationSet(set, [{ planOrSnapshot: PLAN_A }]), TypeError)   // no name
  assert.throws(() => resolveExpectationSet(set, 'nope'), TypeError)
  assert.throws(() => resolveExpectationSet({ not: 'a set' }, {}), TypeError)
})

// ── ordering / immutability / mutation ───────────────────────────────────────────────

test('deterministic ordering follows the expectation set', () => {
  const set = createExpectationSet(['c', 'a', 'b'].map(n => ({ name: n, expectedSnapshot: SNAP_A })))
  const cases = resolveExpectationSet(set, { a: PLAN_A, b: PLAN_A, c: PLAN_A })
  assert.deepEqual(cases.map(c => c.name), ['c', 'a', 'b'])
})

test('resolve output is frozen (array + case objects)', () => {
  const set = createExpectationSet([{ name: 'a', expectedSnapshot: SNAP_A }])
  const cases = resolveExpectationSet(set, { a: PLAN_A })
  assert.ok(Object.isFrozen(cases) && Object.isFrozen(cases[0]))
  assert.throws(() => cases.push({}))
  assert.throws(() => { cases[0].name = 'x' })
})

test('does not mutate input entries or runs', () => {
  const entries = [{ name: 'a', expectedSnapshot: SNAP_A, allowlist: ['counts'] }]
  const runs = { a: PLAN_A }
  const beforeEntries = JSON.stringify(entries)
  const beforeRuns = JSON.stringify(runs)
  const set = createExpectationSet(entries)
  resolveExpectationSet(set, runs)
  assert.equal(JSON.stringify(entries), beforeEntries)
  assert.equal(JSON.stringify(runs), beforeRuns)
  assert.ok(!Object.isFrozen(entries[0]), 'input entry object must not be frozen by the helper')
})

// ── integration: resolve → checkPipelineSuite ────────────────────────────────────────

test('resolved cases feed directly into checkPipelineSuite', () => {
  const set = createExpectationSet([
    { name: 'pass', expectedSnapshot: SNAP_A },
    { name: 'fail', expectedSnapshot: SNAP_A },
  ])
  const cases = resolveExpectationSet(set, { pass: PLAN_A, fail: PLAN_A_FAIL })
  const suite = checkPipelineSuite(cases)
  assert.equal(suite.total, 2)
  assert.equal(suite.firstFailingCase, 'fail')
  assert.equal(suite.cases.find(c => c.name === 'pass').pass, true)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.createExpectationSet / resolveExpectationSet match the standalone helpers', () => {
  const gw = createEvidenceGateway()
  const entries = [{ name: 'a', expectedSnapshot: SNAP_A, allowlist: ['counts'] }]
  const gwSet = gw.createExpectationSet(entries)
  const directSet = createExpectationSet(entries)
  assert.deepEqual(gwSet, directSet)
  assert.deepEqual(gw.resolveExpectationSet(gwSet, { a: PLAN_A }), resolveExpectationSet(directSet, { a: PLAN_A }))
})
