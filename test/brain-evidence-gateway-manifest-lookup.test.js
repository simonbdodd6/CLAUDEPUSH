/**
 * M96 — Evidence Gateway gate manifest lookup (lookupGateManifest) tests
 *
 * Deterministic tests over an M95 index: existing digest returns the entry, missing digest
 * returns null, object identity preserved (entry + manifest, not cloned), duplicate digest
 * entry (count>1, firstIndex preserved), invalid-index / missing-entries / invalid-digest
 * rejection, no mutation, determinism, frozen entry, gateway parity.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan,
  createExpectationSet, gateCI, createGateManifest, gateManifestIndex,
  lookupGateManifest, createEvidenceGateway,
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

// ── existing / missing ───────────────────────────────────────────────────────────────

test('lookup existing digest returns its entry', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const ix = gateManifestIndex([a, b])
  const entry = lookupGateManifest(ix, a.pipelineDigest)
  assert.deepEqual(entry, { count: 1, firstIndex: 0, manifest: a })
})

test('lookup missing (valid) digest returns null', () => {
  const ix = gateManifestIndex([manifestFor('a')])
  assert.equal(lookupGateManifest(ix, 'ffffffffffffffff'), null)
})

test('inherited/object keys do not falsely match (hasOwnProperty)', () => {
  const ix = gateManifestIndex([manifestFor('a')])
  assert.equal(lookupGateManifest(ix, 'constructor'), null)
  assert.equal(lookupGateManifest(ix, 'toString'), null)
})

// ── identity preservation ────────────────────────────────────────────────────────────

test('returned entry preserves object identity from index.entries[digest]', () => {
  const a = manifestFor('a')
  const ix = gateManifestIndex([a])
  assert.equal(lookupGateManifest(ix, a.pipelineDigest), ix.entries[a.pipelineDigest])   // same reference
})

test('returned manifest preserves the original manifest reference (not cloned)', () => {
  const a = manifestFor('a')
  const ix = gateManifestIndex([a])
  assert.equal(lookupGateManifest(ix, a.pipelineDigest).manifest, a)
})

// ── duplicate digest ─────────────────────────────────────────────────────────────────

test('duplicate digest → entry with count > 1 and firstIndex preserved', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const ix = gateManifestIndex([b, a, a, a])   // a first seen at index 1
  const entry = lookupGateManifest(ix, a.pipelineDigest)
  assert.equal(entry.count, 3)
  assert.equal(entry.firstIndex, 1)
  assert.equal(entry.manifest, a)
})

// ── works with gateManifestIndex output ──────────────────────────────────────────────

test('works across all digests of an index produced by gateManifestIndex', () => {
  const ms = ['a', 'b', 'c'].map(manifestFor)
  const ix = gateManifestIndex(ms)
  for (const m of ms) assert.equal(lookupGateManifest(ix, m.pipelineDigest).manifest, m)
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('rejects non-object / null index → TypeError', () => {
  assert.throws(() => lookupGateManifest(null, 'd'), TypeError)
  assert.throws(() => lookupGateManifest('nope', 'd'), TypeError)
  assert.throws(() => lookupGateManifest(42, 'd'), TypeError)
})

test('rejects index missing entries → TypeError', () => {
  assert.throws(() => lookupGateManifest({}, 'd'), TypeError)
  assert.throws(() => lookupGateManifest({ entries: null }, 'd'), TypeError)
  assert.throws(() => lookupGateManifest({ entries: 'x' }, 'd'), TypeError)
})

test('rejects invalid pipelineDigest (missing / non-string / empty) → TypeError', () => {
  const ix = gateManifestIndex([manifestFor('a')])
  assert.throws(() => lookupGateManifest(ix), TypeError)
  assert.throws(() => lookupGateManifest(ix, undefined), TypeError)
  assert.throws(() => lookupGateManifest(ix, 123), TypeError)
  assert.throws(() => lookupGateManifest(ix, ''), TypeError)
})

// ── immutability / mutation ──────────────────────────────────────────────────────────

test('returned entry is frozen (the M95 entry)', () => {
  const a = manifestFor('a')
  const ix = gateManifestIndex([a])
  const entry = lookupGateManifest(ix, a.pipelineDigest)
  assert.ok(Object.isFrozen(entry))
  assert.throws(() => { entry.count = 99 })
})

test('does not mutate the index or manifest references', () => {
  const a = manifestFor('a'), b = manifestFor('b')
  const ix = gateManifestIndex([a, b, a])
  const before = JSON.stringify(ix)
  lookupGateManifest(ix, a.pipelineDigest)
  lookupGateManifest(ix, 'missing-digest-xxxx')
  assert.equal(JSON.stringify(ix), before)
  assert.equal(ix.entries[a.pipelineDigest].manifest, a)   // reference intact
})

test('deterministic — repeated calls return the same entry', () => {
  const a = manifestFor('a')
  const ix = gateManifestIndex([a])
  assert.equal(lookupGateManifest(ix, a.pipelineDigest), lookupGateManifest(ix, a.pipelineDigest))
})

// ── gateway parity ───────────────────────────────────────────────────────────────────

test('gateway.lookupGateManifest matches lookupGateManifest', () => {
  const gw = createEvidenceGateway()
  const a = manifestFor('a'), b = manifestFor('b')
  const ix = gateManifestIndex([a, b, a])
  assert.equal(gw.lookupGateManifest(ix, a.pipelineDigest), lookupGateManifest(ix, a.pipelineDigest))
  assert.equal(gw.lookupGateManifest(ix, 'absent-digest-000'), lookupGateManifest(ix, 'absent-digest-000'))
})
