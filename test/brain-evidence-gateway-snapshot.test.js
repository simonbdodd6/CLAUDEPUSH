/**
 * M65 — Evidence Gateway pipeline plan snapshot tests
 *
 * Deterministic tests for the dormant PipelinePlan serializer: identical plan → identical
 * digest, key-order insensitivity (canonical ordering), different evidence → different
 * digest, empty / single / duplicates / unknown / invalid scenarios, deterministic
 * serialization, immutable output, and the gateway.snapshotRun() method.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan, canonicalStringify, pipelineDigest,
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
const frame = { sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
  normalize: (r) => [{ key: 'lineout.winRate', value: 0.82, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.5, evidenceId: r.id }] }
const badNote = { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
  normalize: (r) => [{ key: 'bad key', value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: r.id }] }
const REGISTRY = createNormalizerRegistry([frame, badNote])

const planFor = (records) => prepareFullPipelinePlan({ registry: REGISTRY, records, context: NCTX })
const snapFor = (records) => snapshotPipelinePlan(planFor(records))

// deep clone that re-inserts object keys in REVERSE order (to prove key-order insensitivity)
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value).reverse()) out[k] = reverseKeys(value[k])
    return out
  }
  return value
}

// ── identical plan → identical digest ───────────────────────────────────────────────

test('identical plan → identical snapshot + digest', () => {
  const a = snapFor([rec('ev_1'), rec('ev_2')])
  const b = snapFor([rec('ev_1'), rec('ev_2')])
  assert.equal(a.digest, b.digest)
  assert.equal(a.json, b.json)
  assert.deepEqual(a.snapshot, b.snapshot)
})

// ── canonical key ordering ──────────────────────────────────────────────────────────

test('reordered object keys still canonicalise to the same digest', () => {
  const plan = planFor([rec('ev_1'), rec('ev_2')])
  const shuffled = reverseKeys(JSON.parse(JSON.stringify(plan)))   // same content, reversed key order
  assert.notEqual(JSON.stringify(plan), JSON.stringify(shuffled))  // raw stringify differs...
  assert.equal(snapshotPipelinePlan(plan).digest, snapshotPipelinePlan(shuffled).digest)   // ...canonical does not
  assert.equal(snapshotPipelinePlan(plan).json, snapshotPipelinePlan(shuffled).json)
})

test('canonicalStringify sorts keys deterministically', () => {
  assert.equal(canonicalStringify({ b: 1, a: 2 }), '{"a":2,"b":1}')
  assert.equal(canonicalStringify({ a: 2, b: 1 }), '{"a":2,"b":1}')
  assert.equal(canonicalStringify([3, 1, 2]), '[3,1,2]')           // array order preserved
  assert.equal(canonicalStringify({ n: NaN, u: undefined, x: 1 }), '{"n":null,"x":1}')  // JSON-like normalisation
})

// ── different evidence → different digest ───────────────────────────────────────────

test('different evidence → different digest', () => {
  const a = snapFor([rec('ev_1')])
  const b = snapFor([rec('ev_1'), rec('ev_2')])
  const c = snapFor([rec('ev_9', { subjectId: 'player-99' })])
  assert.notEqual(a.digest, b.digest)
  assert.notEqual(a.digest, c.digest)
  assert.notEqual(b.digest, c.digest)
})

// ── scenarios ───────────────────────────────────────────────────────────────────────

test('empty pipeline — stable snapshot + digest', () => {
  const a = snapFor([]), b = snapFor([])
  assert.equal(a.digest, b.digest)
  assert.equal(a.snapshot.counts.records, 0)
  assert.equal(typeof a.digest, 'string')
  assert.equal(a.digest.length, 16)
})

test('single record / duplicates / unknown / invalid each snapshot to a distinct digest', () => {
  const single = snapFor([rec('ev_1')]).digest
  const duplicates = snapFor([rec('ev_1'), rec('ev_2')]).digest
  const unknown = snapFor([rec('ev_u', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE })]).digest
  const invalid = snapFor([rec('ev_b', { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE })]).digest
  const all = new Set([single, duplicates, unknown, invalid])
  assert.equal(all.size, 4)                                        // all distinct
})

// ── determinism / immutability ──────────────────────────────────────────────────────

test('deterministic serialization — json round-trips to the snapshot object', () => {
  const s = snapFor([rec('ev_1'), rec('ev_2')])
  assert.deepEqual(JSON.parse(s.json), s.snapshot)
  assert.equal(pipelineDigest(s.json), s.digest)
})

test('snapshot output is deeply frozen', () => {
  const s = snapFor([rec('ev_1')])
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.snapshot))
  assert.throws(() => { s.digest = 'x' })
  assert.throws(() => { s.snapshot.counts.records = 99 })
})

test('snapshot does not mutate the plan', () => {
  const plan = planFor([rec('ev_1'), rec('ev_2')])
  const before = JSON.stringify(plan)
  snapshotPipelinePlan(plan)
  assert.equal(JSON.stringify(plan), before)
})

test('malformed input throws TypeError', () => {
  assert.throws(() => snapshotPipelinePlan(null), TypeError)
  assert.throws(() => snapshotPipelinePlan('x'), TypeError)
})

// ── gateway method ──────────────────────────────────────────────────────────────────

test('gateway.snapshotRun() composes planRun + snapshot', () => {
  const g = createEvidenceGateway()
  const viaMethod = g.snapshotRun({ registry: REGISTRY, records: [rec('ev_1'), rec('ev_2')], context: NCTX })
  const viaHelpers = snapFor([rec('ev_1'), rec('ev_2')])
  assert.equal(viaMethod.digest, viaHelpers.digest)
  assert.deepEqual(viaMethod.snapshot, viaHelpers.snapshot)
})
