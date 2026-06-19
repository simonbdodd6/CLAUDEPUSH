/**
 * M99 — Evidence Gateway filter manifest index (filterManifestIndex) tests
 *
 * Deterministic tests over an M95 index: keep all / none / duplicates-only / unique-only,
 * filter by count, filter by digest, ordering preserved, manifest references preserved (no
 * clone), recomputed total/unique/duplicates, invalid-index / invalid-predicate / malformed-
 * entry rejection, predicate exception propagation, determinism, no mutation, deep-frozen
 * output, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestIndex,
  filterManifestIndex, createEvidenceGateway,
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

// a:count2, b:count1, c:count3 ; total6 unique3 duplicates3
const a = manifestFor('a'), b = manifestFor('b'), c = manifestFor('c')
const dA = a.pipelineDigest, dB = b.pipelineDigest, dC = c.pipelineDigest
const baseIndex = () => gateManifestIndex([a, a, b, c, c, c])

// ── keep all / none ──────────────────────────────────────────────────────────────────

test('keep all → same shape, recomputed totals match original', () => {
  const ix = baseIndex()
  const f = filterManifestIndex(ix, () => true)
  assert.deepEqual(f.digests, [dA, dB, dC])
  assert.equal(f.total, 6)
  assert.equal(f.unique, 3)
  assert.equal(f.duplicates, 3)
})

test('keep none → empty index', () => {
  const f = filterManifestIndex(baseIndex(), () => false)
  assert.deepEqual({ total: f.total, unique: f.unique, duplicates: f.duplicates, digests: f.digests, entries: f.entries },
    { total: 0, unique: 0, duplicates: 0, digests: [], entries: {} })
})

// ── duplicates-only / unique-only ────────────────────────────────────────────────────

test('keep only duplicates (count > 1)', () => {
  const f = filterManifestIndex(baseIndex(), (_d, e) => e.count > 1)
  assert.deepEqual(f.digests, [dA, dC])    // b dropped
  assert.equal(f.total, 5)                  // 2 + 3
  assert.equal(f.unique, 2)
  assert.equal(f.duplicates, 3)
})

test('keep only unique entries (count === 1)', () => {
  const f = filterManifestIndex(baseIndex(), (_d, e) => e.count === 1)
  assert.deepEqual(f.digests, [dB])
  assert.equal(f.total, 1)
  assert.equal(f.unique, 1)
  assert.equal(f.duplicates, 0)
})

// ── filter by count / digest ─────────────────────────────────────────────────────────

test('filter by count threshold', () => {
  const f = filterManifestIndex(baseIndex(), (_d, e) => e.count >= 3)
  assert.deepEqual(f.digests, [dC])
  assert.equal(f.total, 3)
  assert.equal(f.unique, 1)
  assert.equal(f.duplicates, 2)
})

test('filter by digest', () => {
  const f = filterManifestIndex(baseIndex(), (d) => d === dB)
  assert.deepEqual(f.digests, [dB])
  assert.equal(f.entries[dB].count, 1)
})

// ── ordering / references / no clone ─────────────────────────────────────────────────

test('digest ordering is preserved (subset of original order)', () => {
  const f = filterManifestIndex(baseIndex(), (d) => d === dC || d === dA)
  assert.deepEqual(f.digests, [dA, dC])   // original order, not selection order
})

test('manifest references preserved (no cloning)', () => {
  const f = filterManifestIndex(baseIndex(), () => true)
  assert.equal(f.entries[dA].manifest, a)
  assert.equal(f.entries[dB].manifest, b)
  assert.equal(f.entries[dC].manifest, c)
})

test('firstIndex carried through unchanged on retained entries', () => {
  const ix = baseIndex()
  const f = filterManifestIndex(ix, (_d, e) => e.count > 1)
  assert.equal(f.entries[dA].firstIndex, ix.entries[dA].firstIndex)
  assert.equal(f.entries[dC].firstIndex, ix.entries[dC].firstIndex)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid index → TypeError', () => {
  assert.throws(() => filterManifestIndex(null, () => true), TypeError)
  assert.throws(() => filterManifestIndex('nope', () => true), TypeError)
  assert.throws(() => filterManifestIndex({}, () => true), TypeError)
  assert.throws(() => filterManifestIndex({ total: 1, unique: 1, duplicates: 0, digests: [] }, () => true), TypeError)   // no entries
})

test('invalid predicate → TypeError', () => {
  const ix = baseIndex()
  assert.throws(() => filterManifestIndex(ix, null), TypeError)
  assert.throws(() => filterManifestIndex(ix, 'nope'), TypeError)
  assert.throws(() => filterManifestIndex(ix), TypeError)
})

test('malformed entry → TypeError', () => {
  const m = manifestFor('m')
  assert.throws(() => filterManifestIndex({ total: 1, unique: 1, duplicates: 0, digests: ['d'], entries: {} }, () => true), TypeError)                    // listed, no entry
  assert.throws(() => filterManifestIndex({ total: 1, unique: 1, duplicates: 0, digests: ['d'], entries: { d: { firstIndex: 0, manifest: m } } }, () => true), TypeError)   // no count
  assert.throws(() => filterManifestIndex({ total: 1, unique: 1, duplicates: 0, digests: ['d'], entries: { d: { count: 1, manifest: m } } }, () => true), TypeError)        // no firstIndex
  assert.throws(() => filterManifestIndex({ total: 1, unique: 1, duplicates: 0, digests: ['d'], entries: { d: { count: 1, firstIndex: 0 } } }, () => true), TypeError)      // no manifest
})

// ── predicate exception propagation ──────────────────────────────────────────────────

test('predicate exception propagates unchanged', () => {
  const boom = new Error('predicate exploded')
  assert.throws(() => filterManifestIndex(baseIndex(), () => { throw boom }), (e) => e === boom)
})

// ── immutability / mutation / determinism ────────────────────────────────────────────

test('returned index is deeply frozen', () => {
  const f = filterManifestIndex(baseIndex(), (_d, e) => e.count > 1)
  assert.ok(Object.isFrozen(f) && Object.isFrozen(f.digests) && Object.isFrozen(f.entries) && Object.isFrozen(f.entries[dA]))
  assert.throws(() => { f.total = 99 })
  assert.throws(() => f.digests.push('x'))
  assert.throws(() => { f.entries[dA].count = 0 })
})

test('does not mutate the input index', () => {
  const ix = baseIndex()
  const before = JSON.stringify(ix)
  filterManifestIndex(ix, (_d, e) => e.count > 1)
  assert.equal(JSON.stringify(ix), before)
  assert.equal(ix.entries[dA].manifest, a)   // reference intact
})

test('deterministic — repeated calls identical', () => {
  const ix = baseIndex()
  const pred = (_d, e) => e.count > 1
  assert.deepEqual(filterManifestIndex(ix, pred), filterManifestIndex(ix, pred))
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.filterManifestIndex matches filterManifestIndex', () => {
  const gw = createEvidenceGateway()
  const ix = baseIndex()
  const pred = (_d, e) => e.count > 1
  assert.deepEqual(gw.filterManifestIndex(ix, pred), filterManifestIndex(ix, pred))
})
