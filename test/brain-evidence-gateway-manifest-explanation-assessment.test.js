/**
 * M103 — Evidence Gateway assess manifest explanation (assessManifestExplanation) tests
 *
 * Deterministic tests over an M102 explanation + declarative policy: default passes,
 * forbidVerdicts, maxStatements, requireNoRemovals, requireNoChanges, multiple failures
 * (fixed order), determinism, explanation unchanged, invalid-explanation / invalid-policy
 * rejection, deep-frozen output, no mutation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestIndex, diffManifestIndexes,
  explainManifestDiff, assessManifestExplanation, createEvidenceGateway,
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
const planFor = (registry, records) => prepareFullPipelinePlan({ registry, records, context: NCTX })
const snapFor = (registry, records) => snapshotPipelinePlan(planFor(registry, records))

const SNAP_A = snapFor(REG, [rec('ev_1')])
const PLAN_PASS = planFor(REG, [rec('ev_1')])
const setOf = (...names) => createExpectationSet(names.map(n => ({ name: n, expectedSnapshot: SNAP_A })))
const manifestFor = (name) => createGateManifest(gateCI(setOf(name), { [name]: PLAN_PASS }))
const ix = (...ms) => gateManifestIndex(ms)

const a = manifestFor('a'), b = manifestFor('b'), c = manifestFor('c'), d = manifestFor('d')

// no-change: verdict 'no-change', statements length 1, removed 0, changed 0
const noChange = () => explainManifestDiff(diffManifestIndexes(ix(a, b), ix(a, b)))
// mixed: verdict 'mixed', statements length 5, removed 1, changed 2
const mixed = () => explainManifestDiff(diffManifestIndexes(ix(a, a, b, c, c), ix(a, b, b, d)))

// ── default passes ───────────────────────────────────────────────────────────────────

test('default policy passes', () => {
  const e = mixed()
  const r = assessManifestExplanation(e)
  assert.equal(r.ok, true)
  assert.equal(r.verdict, 'mixed')          // verdict passthrough
  assert.deepEqual(r.reasons, ['Explanation satisfies policy.'])
})

test('default policy passes for no-change', () => {
  const r = assessManifestExplanation(noChange())
  assert.equal(r.ok, true)
  assert.equal(r.verdict, 'no-change')
})

// ── forbidVerdicts ───────────────────────────────────────────────────────────────────

test('forbid verdict fails', () => {
  const r = assessManifestExplanation(mixed(), { forbidVerdicts: ['mixed', 'removals-only'] })
  assert.equal(r.ok, false)
  assert.deepEqual(r.reasons, ['Verdict "mixed" is forbidden.'])
})

test('forbid verdict that does not match passes', () => {
  const r = assessManifestExplanation(mixed(), { forbidVerdicts: ['no-change'] })
  assert.equal(r.ok, true)
})

// ── maxStatements ────────────────────────────────────────────────────────────────────

test('max statements fails when exceeded', () => {
  const e = mixed()   // 5 statements
  const r = assessManifestExplanation(e, { maxStatements: 4 })
  assert.equal(r.ok, false)
  assert.deepEqual(r.reasons, ['Statement count 5 exceeds maxStatements 4.'])
  // boundary: equal is allowed
  assert.equal(assessManifestExplanation(e, { maxStatements: 5 }).ok, true)
})

// ── requireNoRemovals / requireNoChanges ─────────────────────────────────────────────

test('require no removals fails when removals present', () => {
  const r = assessManifestExplanation(mixed(), { requireNoRemovals: true })
  assert.equal(r.ok, false)
  assert.deepEqual(r.reasons, ['Removals are not allowed (removed=1).'])
  // no-change explanation has removed=0 → passes
  assert.equal(assessManifestExplanation(noChange(), { requireNoRemovals: true }).ok, true)
})

test('require no changes fails when changes present', () => {
  const r = assessManifestExplanation(mixed(), { requireNoChanges: true })
  assert.equal(r.ok, false)
  assert.deepEqual(r.reasons, ['Changes are not allowed (changed=2).'])
  assert.equal(assessManifestExplanation(noChange(), { requireNoChanges: true }).ok, true)
})

// ── multiple failures + ordering ─────────────────────────────────────────────────────

test('multiple failures appended in fixed order', () => {
  const e = mixed()
  const r = assessManifestExplanation(e, {
    forbidVerdicts: ['mixed'],
    maxStatements: 0,
    requireNoRemovals: true,
    requireNoChanges: true,
  })
  assert.equal(r.ok, false)
  assert.deepEqual(r.reasons, [
    'Verdict "mixed" is forbidden.',
    'Statement count 5 exceeds maxStatements 0.',
    'Removals are not allowed (removed=1).',
    'Changes are not allowed (changed=2).',
  ])
})

// ── determinism / passthrough ────────────────────────────────────────────────────────

test('deterministic — identical inputs → identical assessment', () => {
  const e = mixed()
  const policy = { forbidVerdicts: ['mixed'], maxStatements: 0 }
  assert.deepEqual(assessManifestExplanation(e, policy), assessManifestExplanation(e, policy))
})

test('explanation is unchanged (verdict passed through, no mutation)', () => {
  const e = mixed()
  const before = JSON.stringify(e)
  const r = assessManifestExplanation(e, { requireNoRemovals: true })
  assert.equal(JSON.stringify(e), before)
  assert.equal(r.verdict, e.verdict)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid explanation → TypeError', () => {
  assert.throws(() => assessManifestExplanation(null), TypeError)
  assert.throws(() => assessManifestExplanation('nope'), TypeError)
  assert.throws(() => assessManifestExplanation({}), TypeError)                                            // no verdict
  assert.throws(() => assessManifestExplanation({ verdict: 'mixed', statements: [] }), TypeError)          // no summary
  assert.throws(() => assessManifestExplanation({ verdict: 'mixed', summary: {} }), TypeError)             // no statements
})

test('invalid policy → TypeError', () => {
  const e = mixed()
  assert.throws(() => assessManifestExplanation(e, null), TypeError)
  assert.throws(() => assessManifestExplanation(e, [1, 2]), TypeError)
  assert.throws(() => assessManifestExplanation(e, { forbidVerdicts: 'mixed' }), TypeError)
  assert.throws(() => assessManifestExplanation(e, { forbidVerdicts: [1] }), TypeError)
  assert.throws(() => assessManifestExplanation(e, { maxStatements: 'lots' }), TypeError)
  assert.throws(() => assessManifestExplanation(e, { maxStatements: NaN }), TypeError)
  assert.throws(() => assessManifestExplanation(e, { requireNoRemovals: 'yes' }), TypeError)
  assert.throws(() => assessManifestExplanation(e, { requireNoChanges: 1 }), TypeError)
})

// ── immutability ─────────────────────────────────────────────────────────────────────

test('output is deeply frozen', () => {
  const r = assessManifestExplanation(mixed(), { forbidVerdicts: ['mixed'] })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.reasons))
  assert.throws(() => { r.ok = true })
  assert.throws(() => r.reasons.push('x'))
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.assessManifestExplanation matches assessManifestExplanation', () => {
  const gw = createEvidenceGateway()
  const e = mixed()
  const policy = { forbidVerdicts: ['mixed'], maxStatements: 0 }
  assert.deepEqual(gw.assessManifestExplanation(e, policy), assessManifestExplanation(e, policy))
  assert.deepEqual(gw.assessManifestExplanation(e), assessManifestExplanation(e))   // default
})
