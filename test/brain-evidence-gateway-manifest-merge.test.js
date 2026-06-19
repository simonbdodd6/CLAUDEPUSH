/**
 * M98 — Evidence Gateway merge manifest indexes (mergeGateManifestIndexes) tests
 *
 * Deterministic tests over two M95 indexes: empty+empty, empty+nonempty, nonempty+empty,
 * disjoint, overlapping; count sums, firstIndex preservation/offset, manifest reference
 * preservation, digest ordering (a then new b), total/unique/duplicates arithmetic; deep
 * frozen output, no input mutation, no manifest cloning, invalid-index / missing-entry /
 * malformed-entry rejection, determinism, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestIndex,
  mergeGateManifestIndexes, createEvidenceGateway,
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
const empty = () => gateManifestIndex([])

// ── empties ──────────────────────────────────────────────────────────────────────────

test('merge two empty indexes', () => {
  const m = mergeGateManifestIndexes(empty(), empty())
  assert.deepEqual({ total: m.total, unique: m.unique, duplicates: m.duplicates, digests: m.digests, entries: m.entries },
    { total: 0, unique: 0, duplicates: 0, digests: [], entries: {} })
})

test('merge empty a + non-empty b', () => {
  const b = manifestFor('b')
  const m = mergeGateManifestIndexes(empty(), ix(b, b))
  assert.equal(m.total, 2)
  assert.equal(m.unique, 1)
  assert.equal(m.duplicates, 1)
  assert.deepEqual(m.digests, [b.pipelineDigest])
  assert.equal(m.entries[b.pipelineDigest].count, 2)
  assert.equal(m.entries[b.pipelineDigest].firstIndex, 0)   // a.total (0) + b firstIndex (0)
  assert.equal(m.entries[b.pipelineDigest].manifest, b)
})

test('merge non-empty a + empty b', () => {
  const a = manifestFor('a')
  const m = mergeGateManifestIndexes(ix(a, a), empty())
  assert.equal(m.total, 2)
  assert.equal(m.unique, 1)
  assert.equal(m.entries[a.pipelineDigest].count, 2)
  assert.equal(m.entries[a.pipelineDigest].firstIndex, 0)
  assert.equal(m.entries[a.pipelineDigest].manifest, a)
})

// ── disjoint ─────────────────────────────────────────────────────────────────────────

test('merge disjoint indexes — order a then new b, offsets applied', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const A = ix(a, a)      // a.total = 2, a firstIndex 0
  const B = ix(b)         // b firstIndex 0
  const m = mergeGateManifestIndexes(A, B)
  assert.deepEqual(m.digests, [a.pipelineDigest, b.pipelineDigest])
  assert.equal(m.total, 3)
  assert.equal(m.unique, 2)
  assert.equal(m.duplicates, 1)
  assert.equal(m.entries[a.pipelineDigest].firstIndex, 0)
  assert.equal(m.entries[b.pipelineDigest].firstIndex, 2)   // offset by a.total
  assert.equal(m.entries[b.pipelineDigest].manifest, b)
})

// ── overlapping ──────────────────────────────────────────────────────────────────────

test('merge overlapping indexes — sums, a firstIndex/manifest kept, b-only offset', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const aFromB = structuredClone(a)               // different object, same digest as a
  const A = ix(a, a)                              // A: a x2, total 2, firstIndex 0
  const B = ix(aFromB, b)                         // B: a@0, b@1
  const m = mergeGateManifestIndexes(A, B)

  // overlapping digest a: count summed, a's firstIndex + a's manifest reference kept
  assert.equal(m.entries[a.pipelineDigest].count, 3)            // 2 + 1
  assert.equal(m.entries[a.pipelineDigest].firstIndex, 0)
  assert.equal(m.entries[a.pipelineDigest].manifest, a)        // a's reference, NOT aFromB

  // b-only digest: offset by a.total, b's manifest reference
  assert.equal(m.entries[b.pipelineDigest].count, 1)
  assert.equal(m.entries[b.pipelineDigest].firstIndex, 2 + 1)  // a.total (2) + b firstIndex (1)
  assert.equal(m.entries[b.pipelineDigest].manifest, b)

  // ordering: a (from A.digests) then b (new from B)
  assert.deepEqual(m.digests, [a.pipelineDigest, b.pipelineDigest])
  assert.equal(m.total, 4)   // 2 + 2
  assert.equal(m.unique, 2)
  assert.equal(m.duplicates, 2)
})

// ── immutability / mutation / cloning ────────────────────────────────────────────────

test('returned index is deeply frozen', () => {
  const a = manifestFor('a')
  const m = mergeGateManifestIndexes(ix(a), empty())
  assert.ok(Object.isFrozen(m) && Object.isFrozen(m.digests) && Object.isFrozen(m.entries) && Object.isFrozen(m.entries[a.pipelineDigest]))
  assert.throws(() => { m.total = 99 })
  assert.throws(() => m.digests.push('x'))
  assert.throws(() => { m.entries[a.pipelineDigest].count = 0 })
})

test('does not mutate the input indexes', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const A = ix(a, a), B = ix(a, b)
  const beforeA = JSON.stringify(A), beforeB = JSON.stringify(B)
  mergeGateManifestIndexes(A, B)
  assert.equal(JSON.stringify(A), beforeA)
  assert.equal(JSON.stringify(B), beforeB)
})

test('does not clone manifests (references preserved)', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const m = mergeGateManifestIndexes(ix(a), ix(b))
  assert.equal(m.entries[a.pipelineDigest].manifest, a)
  assert.equal(m.entries[b.pipelineDigest].manifest, b)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid index → TypeError', () => {
  const ok = ix(manifestFor('a'))
  assert.throws(() => mergeGateManifestIndexes(null, ok), TypeError)
  assert.throws(() => mergeGateManifestIndexes(ok, null), TypeError)
  assert.throws(() => mergeGateManifestIndexes({}, ok), TypeError)
  assert.throws(() => mergeGateManifestIndexes(ok, { total: 1, unique: 1, duplicates: 0, digests: [] }), TypeError)   // no entries
  assert.throws(() => mergeGateManifestIndexes({ total: '1', unique: 1, duplicates: 0, digests: [], entries: {} }, ok), TypeError)
})

test('digest listed but missing entry → TypeError', () => {
  const ok = ix(manifestFor('a'))
  const broken = { total: 1, unique: 1, duplicates: 0, digests: ['xyz'], entries: {} }   // 'xyz' has no entry
  assert.throws(() => mergeGateManifestIndexes(broken, ok), TypeError)
  assert.throws(() => mergeGateManifestIndexes(ok, broken), TypeError)
})

test('malformed entry → TypeError', () => {
  const ok = ix(manifestFor('a'))
  const m1 = manifestFor('m')
  const noCount = { total: 1, unique: 1, duplicates: 0, digests: ['d'], entries: { d: { firstIndex: 0, manifest: m1 } } }
  const noFirstIndex = { total: 1, unique: 1, duplicates: 0, digests: ['d'], entries: { d: { count: 1, manifest: m1 } } }
  const noManifest = { total: 1, unique: 1, duplicates: 0, digests: ['d'], entries: { d: { count: 1, firstIndex: 0 } } }
  assert.throws(() => mergeGateManifestIndexes(noCount, ok), TypeError)
  assert.throws(() => mergeGateManifestIndexes(noFirstIndex, ok), TypeError)
  assert.throws(() => mergeGateManifestIndexes(noManifest, ok), TypeError)
})

// ── determinism / parity ─────────────────────────────────────────────────────────────

test('deterministic — repeated calls identical', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const A = ix(a, a), B = ix(a, b)
  assert.deepEqual(mergeGateManifestIndexes(A, B), mergeGateManifestIndexes(A, B))
})

test('gateway.mergeGateManifestIndexes matches mergeGateManifestIndexes', () => {
  const gw = createEvidenceGateway()
  const a = manifestFor('a'), b = manifestFor('b')
  const A = ix(a, a), B = ix(a, b)
  assert.deepEqual(gw.mergeGateManifestIndexes(A, B), mergeGateManifestIndexes(A, B))
})
