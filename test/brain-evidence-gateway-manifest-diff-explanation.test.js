/**
 * M102 — Evidence Gateway explain manifest diff (explainManifestDiff) tests
 *
 * Deterministic tests over an M100 diff: verdicts (no-change / additions-only /
 * removals-only / changes-only / mixed), deterministic statement ordering, exact statement
 * strings, summary passthrough (same reference), invalid-diff / malformed-summary rejection,
 * deep-frozen output, no mutation, gateway parity. Explains an existing diff — inspects no
 * manifests, recomputes nothing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestIndex, diffManifestIndexes,
  explainManifestDiff, createEvidenceGateway,
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
const dA = a.pipelineDigest, dB = b.pipelineDigest, dC = c.pipelineDigest, dD = d.pipelineDigest
const CLOSER = 'No further manifest changes detected.'

// ── verdicts ─────────────────────────────────────────────────────────────────────────

test('no-change verdict', () => {
  const e = explainManifestDiff(diffManifestIndexes(ix(a, b), ix(a, b)))
  assert.equal(e.verdict, 'no-change')
  assert.deepEqual(e.statements, [CLOSER])
})

test('additions-only verdict + exact statement', () => {
  const e = explainManifestDiff(diffManifestIndexes(ix(a), ix(a, b)))
  assert.equal(e.verdict, 'additions-only')
  assert.deepEqual(e.statements, [`Digest ${dB} was added.`, CLOSER])
})

test('removals-only verdict + exact statement', () => {
  const e = explainManifestDiff(diffManifestIndexes(ix(a, b), ix(a)))
  assert.equal(e.verdict, 'removals-only')
  assert.deepEqual(e.statements, [`Digest ${dB} was removed.`, CLOSER])
})

test('changes-only verdict + exact statement', () => {
  const e = explainManifestDiff(diffManifestIndexes(ix(a), ix(a, a)))   // a: 1 → 2
  assert.equal(e.verdict, 'changes-only')
  assert.deepEqual(e.statements, [`Digest ${dA} changed count from 1 to 2.`, CLOSER])
})

test('mixed verdict — ordering added, removed, changed, closer', () => {
  const e = explainManifestDiff(diffManifestIndexes(ix(a, a, b, c, c), ix(a, b, b, d)))
  // added d ; removed c ; changed a(2→1), b(1→2)
  assert.equal(e.verdict, 'mixed')
  assert.deepEqual(e.statements, [
    `Digest ${dD} was added.`,
    `Digest ${dC} was removed.`,
    `Digest ${dA} changed count from 2 to 1.`,
    `Digest ${dB} changed count from 1 to 2.`,
    CLOSER,
  ])
})

// ── determinism / ordering ───────────────────────────────────────────────────────────

test('deterministic statement ordering across repeated calls', () => {
  const diff = diffManifestIndexes(ix(a, a, b, c, c), ix(a, b, b, d))
  assert.deepEqual(explainManifestDiff(diff), explainManifestDiff(diff))
})

// ── summary passthrough ──────────────────────────────────────────────────────────────

test('summary is the existing diff.summary, unmodified (same reference)', () => {
  const diff = diffManifestIndexes(ix(a, a, b), ix(a, c))
  const e = explainManifestDiff(diff)
  assert.equal(e.summary, diff.summary)   // same object reference, not a copy
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid diff → TypeError', () => {
  assert.throws(() => explainManifestDiff(null), TypeError)
  assert.throws(() => explainManifestDiff('nope'), TypeError)
  assert.throws(() => explainManifestDiff({}), TypeError)
  assert.throws(() => explainManifestDiff({ added: [], removed: [], changed: [], unchanged: [] }), TypeError)   // no summary
  assert.throws(() => explainManifestDiff({ added: [], removed: [], changed: [], summary: { added: 0, removed: 0, changed: 0, unchanged: 0 } }), TypeError)  // missing unchanged array
})

test('malformed summary → TypeError', () => {
  assert.throws(() => explainManifestDiff({ added: [], removed: [], changed: [], unchanged: [], summary: { added: 1 } }), TypeError)
  assert.throws(() => explainManifestDiff({ added: [], removed: [], changed: [], unchanged: [], summary: { added: '1', removed: 0, changed: 0, unchanged: 0 } }), TypeError)
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('output is deeply frozen', () => {
  const e = explainManifestDiff(diffManifestIndexes(ix(a), ix(a, b)))
  assert.ok(Object.isFrozen(e) && Object.isFrozen(e.statements) && Object.isFrozen(e.summary))
  assert.throws(() => { e.verdict = 'x' })
  assert.throws(() => e.statements.push('x'))
})

test('does not mutate the input diff', () => {
  const diff = diffManifestIndexes(ix(a, a, b, c, c), ix(a, b, b, d))
  const before = JSON.stringify(diff)
  explainManifestDiff(diff)
  assert.equal(JSON.stringify(diff), before)
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.explainManifestDiff matches explainManifestDiff', () => {
  const gw = createEvidenceGateway()
  const diff = diffManifestIndexes(ix(a, a, b, c, c), ix(a, b, b, d))
  assert.deepEqual(gw.explainManifestDiff(diff), explainManifestDiff(diff))
})
