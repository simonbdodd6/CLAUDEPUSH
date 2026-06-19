/**
 * M95 — Evidence Gateway gate manifest index (gateManifestIndex) tests
 *
 * Deterministic tests over arrays of M83 manifests: empty, single, multiple-unique,
 * duplicates (count only), firstIndex preserved, first-seen digest ordering,
 * total/unique/duplicates, entries.count, references (not clones) the first occurrence,
 * invalid-manifest / missing-digest / non-array rejection, deep-frozen output, determinism,
 * no input mutation, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestIndex, createEvidenceGateway,
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

// distinct case-name sets → distinct pipelineDigests
const manifestFor = (name) => createGateManifest(gateCI(setOf(name), { [name]: PLAN_PASS }))

// ── empty ──────────────────────────────────────────────────────────────────────────

test('empty array → zeros, empty digests/entries', () => {
  const ix = gateManifestIndex([])
  assert.equal(ix.total, 0)
  assert.equal(ix.unique, 0)
  assert.equal(ix.duplicates, 0)
  assert.deepEqual(ix.digests, [])
  assert.deepEqual(ix.entries, {})
})

// ── single ─────────────────────────────────────────────────────────────────────────

test('single manifest', () => {
  const m = manifestFor('a')
  const ix = gateManifestIndex([m])
  assert.equal(ix.total, 1)
  assert.equal(ix.unique, 1)
  assert.equal(ix.duplicates, 0)
  assert.deepEqual(ix.digests, [m.pipelineDigest])
  assert.deepEqual(ix.entries[m.pipelineDigest], { count: 1, firstIndex: 0, manifest: m })
  assert.equal(ix.entries[m.pipelineDigest].manifest, m)   // reference, not clone
})

// ── multiple unique ──────────────────────────────────────────────────────────────────

test('multiple unique manifests → unique == total, first-seen order', () => {
  const a = manifestFor('a'), b = manifestFor('b'), c = manifestFor('c')
  const ix = gateManifestIndex([a, b, c])
  assert.equal(ix.total, 3)
  assert.equal(ix.unique, 3)
  assert.equal(ix.duplicates, 0)
  assert.deepEqual(ix.digests, [a.pipelineDigest, b.pipelineDigest, c.pipelineDigest])
  assert.equal(ix.entries[b.pipelineDigest].firstIndex, 1)
})

// ── duplicates ───────────────────────────────────────────────────────────────────────

test('duplicate manifests → count increases, unique counts once', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const ix = gateManifestIndex([a, b, a, a])
  assert.equal(ix.total, 4)
  assert.equal(ix.unique, 2)
  assert.equal(ix.duplicates, 2)
  assert.equal(ix.entries[a.pipelineDigest].count, 3)
  assert.equal(ix.entries[b.pipelineDigest].count, 1)
})

test('different manifest objects sharing a digest increase count; entry keeps the first', () => {
  const a = manifestFor('a')
  const aClone = structuredClone(a)   // different object, same pipelineDigest + content
  assert.notEqual(aClone, a)
  assert.equal(aClone.pipelineDigest, a.pipelineDigest)
  const ix = gateManifestIndex([a, aClone])
  assert.equal(ix.total, 2)
  assert.equal(ix.unique, 1)
  assert.equal(ix.entries[a.pipelineDigest].count, 2)
  assert.equal(ix.entries[a.pipelineDigest].manifest, a)        // first occurrence reference
  assert.equal(ix.entries[a.pipelineDigest].firstIndex, 0)
})

// ── firstIndex / ordering ────────────────────────────────────────────────────────────

test('firstIndex preserved at the first occurrence', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const ix = gateManifestIndex([b, a, b, a])   // b@0, a@1
  assert.equal(ix.entries[b.pipelineDigest].firstIndex, 0)
  assert.equal(ix.entries[a.pipelineDigest].firstIndex, 1)
  assert.deepEqual(ix.digests, [b.pipelineDigest, a.pipelineDigest])   // first-seen order
})

// ── counts ───────────────────────────────────────────────────────────────────────────

test('total / unique / duplicates arithmetic', () => {
  const a = manifestFor('a'), b = manifestFor('b'), c = manifestFor('c')
  const ix = gateManifestIndex([a, a, b, c, c, c])
  assert.equal(ix.total, 6)
  assert.equal(ix.unique, 3)
  assert.equal(ix.duplicates, 3)
  assert.equal(ix.entries[a.pipelineDigest].count, 2)
  assert.equal(ix.entries[c.pipelineDigest].count, 3)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('non-array input → TypeError', () => {
  assert.throws(() => gateManifestIndex(null), TypeError)
  assert.throws(() => gateManifestIndex({}), TypeError)
  assert.throws(() => gateManifestIndex('nope'), TypeError)
})

test('invalid manifest / missing pipelineDigest → TypeError', () => {
  const a = manifestFor('a')
  assert.throws(() => gateManifestIndex([a, null]), TypeError)               // invalid manifest
  assert.throws(() => gateManifestIndex([a, 'nope']), TypeError)
  assert.throws(() => gateManifestIndex([a, {}]), TypeError)                 // missing pipelineDigest
  assert.throws(() => gateManifestIndex([{ pipelineDigest: 123 }]), TypeError)
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('output is deeply frozen (index + digests + entries + entry objects)', () => {
  const a = manifestFor('a')
  const ix = gateManifestIndex([a, a])
  assert.ok(Object.isFrozen(ix) && Object.isFrozen(ix.digests) && Object.isFrozen(ix.entries) && Object.isFrozen(ix.entries[a.pipelineDigest]))
  assert.throws(() => { ix.total = 99 })
  assert.throws(() => ix.digests.push('x'))
  assert.throws(() => { ix.entries[a.pipelineDigest].count = 99 })
})

test('deterministic — identical input → identical index', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  assert.deepEqual(gateManifestIndex([a, b, a]), gateManifestIndex([a, b, a]))
})

test('does not mutate the input array or manifests', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const arr = [a, b, a]
  const beforeArr = JSON.stringify(arr)
  const len = arr.length
  gateManifestIndex(arr)
  assert.equal(JSON.stringify(arr), beforeArr)
  assert.equal(arr.length, len)
  assert.equal(arr[0], a)   // still the same references
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.gateManifestIndex matches gateManifestIndex', () => {
  const gw = createEvidenceGateway()
  const a = manifestFor('a'), b = manifestFor('b')
  assert.deepEqual(gw.gateManifestIndex([a, b, a]), gateManifestIndex([a, b, a]))
})
