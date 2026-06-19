/**
 * M100 — Evidence Gateway diff manifest indexes (diffManifestIndexes) tests
 *
 * Deterministic tests over two M95 indexes: identical, only additions, only removals,
 * additions+removals, changed counts, unchanged counts, mixed, empty; invalid-index /
 * malformed-entry rejection; determinism, no mutation, deep-frozen output, gateway parity,
 * summary counts. Compares only digests + per-entry count (never manifest contents).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestIndex,
  diffManifestIndexes, createEvidenceGateway,
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

// ── identical ──────────────────────────────────────────────────────────────────────

test('identical indexes → all unchanged, no add/remove/change', () => {
  const r = diffManifestIndexes(ix(a, a, b), ix(a, a, b))
  assert.deepEqual(r.added, [])
  assert.deepEqual(r.removed, [])
  assert.deepEqual(r.changed, [])
  assert.deepEqual(r.unchanged, [dA, dB])
  assert.deepEqual(r.summary, { previousUnique: 2, currentUnique: 2, added: 0, removed: 0, changed: 0, unchanged: 2 })
})

// ── additions / removals ─────────────────────────────────────────────────────────────

test('only additions', () => {
  const r = diffManifestIndexes(ix(a), ix(a, b))
  assert.deepEqual(r.added, [dB])
  assert.deepEqual(r.removed, [])
  assert.deepEqual(r.unchanged, [dA])
  assert.equal(r.summary.added, 1)
})

test('only removals', () => {
  const r = diffManifestIndexes(ix(a, b), ix(a))
  assert.deepEqual(r.removed, [dB])
  assert.deepEqual(r.added, [])
  assert.deepEqual(r.unchanged, [dA])
  assert.equal(r.summary.removed, 1)
})

test('additions + removals', () => {
  const r = diffManifestIndexes(ix(a, b), ix(a, c))
  assert.deepEqual(r.added, [dC])
  assert.deepEqual(r.removed, [dB])
  assert.deepEqual(r.unchanged, [dA])
  assert.deepEqual(r.changed, [])
})

// ── changed / unchanged counts ───────────────────────────────────────────────────────

test('changed counts', () => {
  const r = diffManifestIndexes(ix(a), ix(a, a))   // a: 1 → 2
  assert.deepEqual(r.changed, [{ pipelineDigest: dA, previousCount: 1, currentCount: 2 }])
  assert.deepEqual(r.unchanged, [])
  assert.equal(r.summary.changed, 1)
})

test('unchanged counts', () => {
  const r = diffManifestIndexes(ix(a, a), ix(a, a))   // a: 2 → 2
  assert.deepEqual(r.unchanged, [dA])
  assert.deepEqual(r.changed, [])
})

// ── mixed ────────────────────────────────────────────────────────────────────────────

test('mixed scenario — add, remove, two changed, none unchanged', () => {
  const r = diffManifestIndexes(ix(a, a, b, c), ix(a, b, b, d))
  // a: 2→1 changed ; b: 1→2 changed ; c: removed ; d: added
  assert.deepEqual(r.added, [dD])
  assert.deepEqual(r.removed, [dC])
  assert.deepEqual(r.changed, [
    { pipelineDigest: dA, previousCount: 2, currentCount: 1 },
    { pipelineDigest: dB, previousCount: 1, currentCount: 2 },
  ])
  assert.deepEqual(r.unchanged, [])
  assert.deepEqual(r.summary, { previousUnique: 3, currentUnique: 3, added: 1, removed: 1, changed: 2, unchanged: 0 })
})

// ── empty ──────────────────────────────────────────────────────────────────────────

test('empty indexes → all empty, zero summary', () => {
  const r = diffManifestIndexes(ix(), ix())
  assert.deepEqual({ added: r.added, removed: r.removed, changed: r.changed, unchanged: r.unchanged }, { added: [], removed: [], changed: [], unchanged: [] })
  assert.deepEqual(r.summary, { previousUnique: 0, currentUnique: 0, added: 0, removed: 0, changed: 0, unchanged: 0 })
})

test('empty previous + non-empty current → all added', () => {
  const r = diffManifestIndexes(ix(), ix(a, b))
  assert.deepEqual(r.added, [dA, dB])
  assert.deepEqual(r.removed, [])
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid index → TypeError', () => {
  const ok = ix(a)
  assert.throws(() => diffManifestIndexes(null, ok), TypeError)
  assert.throws(() => diffManifestIndexes(ok, 'nope'), TypeError)
  assert.throws(() => diffManifestIndexes({}, ok), TypeError)
  assert.throws(() => diffManifestIndexes(ok, { total: 1, unique: 1, duplicates: 0, digests: [] }), TypeError)   // no entries
})

test('malformed entries → TypeError', () => {
  const ok = ix(a)
  assert.throws(() => diffManifestIndexes({ total: 1, unique: 1, duplicates: 0, digests: ['x'], entries: {} }, ok), TypeError)              // listed, no entry
  assert.throws(() => diffManifestIndexes(ok, { total: 1, unique: 1, duplicates: 0, digests: ['x'], entries: { x: { firstIndex: 0 } } }), TypeError)  // no count
})

// ── immutability / mutation / determinism ────────────────────────────────────────────

test('deep frozen output', () => {
  const r = diffManifestIndexes(ix(a, a, b), ix(a, c))
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.added) && Object.isFrozen(r.removed) &&
    Object.isFrozen(r.changed) && Object.isFrozen(r.unchanged) && Object.isFrozen(r.summary))
  if (r.changed.length) assert.ok(Object.isFrozen(r.changed[0]))
  assert.throws(() => r.added.push('x'))
  assert.throws(() => { r.summary.added = 99 })
})

test('does not mutate the input indexes', () => {
  const prev = ix(a, a, b), curr = ix(a, c)
  const beforePrev = JSON.stringify(prev), beforeCurr = JSON.stringify(curr)
  diffManifestIndexes(prev, curr)
  assert.equal(JSON.stringify(prev), beforePrev)
  assert.equal(JSON.stringify(curr), beforeCurr)
})

test('deterministic — repeated calls identical', () => {
  const prev = ix(a, a, b, c), curr = ix(a, b, b, d)
  assert.deepEqual(diffManifestIndexes(prev, curr), diffManifestIndexes(prev, curr))
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.diffManifestIndexes matches diffManifestIndexes', () => {
  const gw = createEvidenceGateway()
  const prev = ix(a, a, b, c), curr = ix(a, b, b, d)
  assert.deepEqual(gw.diffManifestIndexes(prev, curr), diffManifestIndexes(prev, curr))
})
