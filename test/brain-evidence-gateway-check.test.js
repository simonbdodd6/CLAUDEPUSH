/**
 * M67 — Evidence Gateway pipeline expectation / regression-gate tests
 *
 * Deterministic tests for the dormant gate that snapshots a fresh run (M65), diffs it
 * against a stored EXPECTED snapshot (M66), and classifies each deviation as tolerated
 * (allowlisted) vs. violating: matching baseline → pass; deviation → fail with structured
 * diff + affected stages; path-subtree and stage allowlists; immutability; determinism;
 * accepts raw plans; gateway.checkRun parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan, checkPipelineAgainstExpected,
  createEvidenceGateway,
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

// ── pass when the fresh run matches the baseline ─────────────────────────────────────

test('matching baseline → pass, fingerprint match, empty violations', () => {
  const expected = snapFor(REG, [rec('ev_1'), rec('ev_2')])
  const v = checkPipelineAgainstExpected(planFor(REG, [rec('ev_1'), rec('ev_2')]), expected)
  assert.equal(v.pass, true)
  assert.equal(v.fingerprint.match, true)
  assert.equal(v.fingerprint.actual, v.fingerprint.expected)
  assert.deepEqual(v.violations, { added: [], removed: [], changed: [] })
  assert.deepEqual(v.affectedStages, [])
  assert.deepEqual(v.summary, { added: 0, removed: 0, changed: 0, total: 0, tolerated: 0, affectedStages: 0 })
})

// ── fail on deviation, with structured diff + affected stages ────────────────────────

test('changed confidence → fail with violations + affected stages + full diff', () => {
  const expected = snapFor(REG, [rec('ev_1')])
  const v = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), expected)
  assert.equal(v.pass, false)
  assert.equal(v.fingerprint.match, false)
  assert.ok(v.summary.total > 0)
  assert.ok(v.violations.changed.some(c => /confidence/i.test(c.path)))
  assert.ok(v.affectedStages.includes('normalize'))
  assert.ok(v.affectedStages.includes('prepareEngineExposure'))
  // carries the full M66 diff
  assert.equal(v.diff.identical, false)
  assert.equal(v.diff.fingerprint.match, false)
})

test('changed normalized value → fail; value path present in violations', () => {
  const v = checkPipelineAgainstExpected(planFor(REG_VAL, [rec('ev_1')]), snapFor(REG, [rec('ev_1')]))
  assert.equal(v.pass, false)
  assert.ok(v.violations.changed.some(c => /\.value$/.test(c.path)))
  assert.ok(v.affectedStages.includes('normalize'))
})

test('added record → fail; counts stage among violations', () => {
  const v = checkPipelineAgainstExpected(planFor(REG, [rec('ev_1'), rec('ev_2')]), snapFor(REG, [rec('ev_1')]))
  assert.equal(v.pass, false)
  assert.ok(v.summary.added > 0 || v.summary.changed > 0)
  assert.ok(v.affectedStages.includes('counts'))
})

// ── allowlist tolerates permitted differences ────────────────────────────────────────

test('allowlist by stage → deviation tolerated → pass', () => {
  const expected = snapFor(REG, [rec('ev_1')])
  const actual = planFor(REG_CONF, [rec('ev_1')])
  const stages = checkPipelineAgainstExpected(actual, expected).affectedStages   // every affected stage
  const v = checkPipelineAgainstExpected(actual, expected, { allowlist: { stages } })
  assert.equal(v.pass, true)
  assert.equal(v.fingerprint.match, false)          // fingerprints still differ…
  assert.equal(v.summary.total, 0)                  // …but no violations remain
  assert.ok(v.summary.tolerated > 0)
  assert.deepEqual(v.violations, { added: [], removed: [], changed: [] })
})

test('allowlist by path subtree → deviations under that path tolerated', () => {
  const expected = snapFor(REG, [rec('ev_1')])
  const actual = planFor(REG_CONF, [rec('ev_1')])
  // tolerate every value path that changed
  const changedPaths = checkPipelineAgainstExpected(actual, expected).violations.changed.map(c => c.path)
  const v = checkPipelineAgainstExpected(actual, expected, { allowlist: { paths: changedPaths } })
  assert.equal(v.violations.changed.length, 0)
  assert.ok(v.tolerated.changed.length >= changedPaths.length)
})

test('array allowlist is treated as path subtrees; subtree prefix tolerates descendants', () => {
  const expected = snapFor(REG, [rec('ev_1')])
  const actual = planFor(REG_CONF, [rec('ev_1')])
  const full = checkPipelineAgainstExpected(actual, expected)
  // a top-level subtree should tolerate at least one deeper violation under it
  const top = full.violations.changed[0].path.split(/[.[]/, 1)[0]
  const v = checkPipelineAgainstExpected(actual, expected, { allowlist: [top] })
  assert.equal(v.allowlist.paths[0], top)
  assert.ok(v.tolerated.changed.length > 0)
  // none of the remaining violations start with the tolerated subtree
  assert.ok(v.violations.changed.every(c => !(c.path === top || c.path.startsWith(top + '.') || c.path.startsWith(top + '['))))
})

test('allowlist that does not cover the deviation → still fails', () => {
  const v = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), snapFor(REG, [rec('ev_1')]),
    { allowlist: { stages: ['nonexistent-stage'], paths: ['no.such.path'] } })
  assert.equal(v.pass, false)
  assert.ok(v.summary.total > 0)
})

test('matching baseline passes regardless of allowlist', () => {
  const expected = snapFor(REG, [rec('ev_1')])
  const v = checkPipelineAgainstExpected(planFor(REG, [rec('ev_1')]), expected, { allowlist: { stages: ['normalize'] } })
  assert.equal(v.pass, true)
  assert.equal(v.summary.tolerated, 0)
})

// ── immutability / determinism / inputs ──────────────────────────────────────────────

test('verdict is deeply frozen', () => {
  const v = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), snapFor(REG, [rec('ev_1')]))
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.violations) && Object.isFrozen(v.violations.changed))
  assert.ok(Object.isFrozen(v.summary) && Object.isFrozen(v.affectedStages) && Object.isFrozen(v.allowlist))
  assert.throws(() => v.violations.changed.push({}))
  assert.throws(() => { v.summary.total = 99 })
  assert.throws(() => { v.pass = true })
})

test('deterministic — identical inputs → identical verdict', () => {
  const expected = snapFor(REG, [rec('ev_1'), rec('ev_2')])
  const a = planFor(REG_CONF, [rec('ev_1'), rec('ev_2')])
  assert.deepEqual(
    checkPipelineAgainstExpected(a, expected, { allowlist: ['counts'] }),
    checkPipelineAgainstExpected(a, expected, { allowlist: ['counts'] }),
  )
})

test('accepts raw PipelinePlans as either argument (snapshots via M65)', () => {
  const viaPlan = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), planFor(REG, [rec('ev_1')]))
  const viaSnap = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), snapFor(REG, [rec('ev_1')]))
  assert.deepEqual(viaPlan, viaSnap)
})

test('does not mutate its inputs', () => {
  const expected = snapFor(REG, [rec('ev_1')])
  const plan = planFor(REG_CONF, [rec('ev_1')])
  const beforeExpected = JSON.stringify(expected)
  const beforePlan = JSON.stringify(plan)
  checkPipelineAgainstExpected(plan, expected, { allowlist: ['normalize'] })
  assert.equal(JSON.stringify(expected), beforeExpected)
  assert.equal(JSON.stringify(plan), beforePlan)
})

test('invalid inputs throw via the M65 contract', () => {
  assert.throws(() => checkPipelineAgainstExpected(null, snapFor(REG, [rec('ev_1')])), TypeError)
  assert.throws(() => checkPipelineAgainstExpected(planFor(REG, [rec('ev_1')]), null), TypeError)
})

// ── gateway.checkRun parity ──────────────────────────────────────────────────────────

test('gateway.checkRun matches checkPipelineAgainstExpected over a fresh run', () => {
  const gw = createEvidenceGateway()
  const expected = snapFor(REG, [rec('ev_1')])
  const input = { registry: REG_CONF, records: [rec('ev_1')], context: NCTX }
  const viaGateway = gw.checkRun(input, expected)
  const direct = checkPipelineAgainstExpected(planFor(REG_CONF, [rec('ev_1')]), expected)
  assert.deepEqual(viaGateway, direct)
  assert.equal(viaGateway.pass, false)
})

test('gateway.checkRun passes when the run matches the baseline', () => {
  const gw = createEvidenceGateway()
  const expected = gw.snapshotRun({ registry: REG, records: [rec('ev_1')], context: NCTX })
  const v = gw.checkRun({ registry: REG, records: [rec('ev_1')], context: NCTX }, expected)
  assert.equal(v.pass, true)
})
