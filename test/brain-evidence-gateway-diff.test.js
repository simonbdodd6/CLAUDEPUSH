/**
 * M66 — Evidence Gateway pipeline snapshot diff tests
 *
 * Deterministic tests for the dormant diff engine over two M65 snapshots: identical,
 * changed confidence / normalization / audit / engine exposure, added / removed record,
 * key-reordering → zero diff, immutability, determinism, and accepting raw plans.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, snapshotPipelinePlan, diffPipelineSnapshots,
} from '@brain/evidence-gateway'
import { createNormalizerRegistry } from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const TENANT = Object.freeze({ clubId: 'c1', teamId: 't1', seasonId: 's1' })
const NCTX = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
const rec = (id, over = {}) => Object.freeze({
  id, tenant: TENANT, subjectType: 'player', subjectId: 'player-9',
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, observedAt: '2026-06-16T09:30:00.000Z', confidence: 0.8, ...over,
})
// frame normalizers with tunable value/confidence
const frame = (value = 0.82, confidence = 0.5) => ({
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
  normalize: (r) => [{ key: 'lineout.winRate', value, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence, evidenceId: r.id }],
})
const badNote = { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
  normalize: (r) => [{ key: 'bad key', value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: r.id }] }

const REG = createNormalizerRegistry([frame(), badNote])
const REG_CONF = createNormalizerRegistry([frame(0.82, 0.6), badNote])     // changed confidence
const REG_VAL = createNormalizerRegistry([frame(0.9, 0.5), badNote])       // changed normalized value

const planFor = (registry, records) => prepareFullPipelinePlan({ registry, records, context: NCTX })
const snapFor = (registry, records) => snapshotPipelinePlan(planFor(registry, records))

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value).reverse()) out[k] = reverseKeys(value[k])
    return out
  }
  return value
}

// ── identical ───────────────────────────────────────────────────────────────────────

test('identical snapshots → identical, fingerprint match, empty diffs', () => {
  const d = diffPipelineSnapshots(snapFor(REG, [rec('ev_1'), rec('ev_2')]), snapFor(REG, [rec('ev_1'), rec('ev_2')]))
  assert.equal(d.identical, true)
  assert.equal(d.fingerprint.match, true)
  assert.deepEqual(d.added, [])
  assert.deepEqual(d.removed, [])
  assert.deepEqual(d.changed, [])
  assert.deepEqual(d.affectedStages, [])
  assert.deepEqual(d.summary, { added: 0, removed: 0, changed: 0, total: 0, affectedStages: 0 })
})

// ── changed confidence / normalization ──────────────────────────────────────────────

test('changed confidence → non-identical, normalize + exposure affected', () => {
  const d = diffPipelineSnapshots(snapFor(REG, [rec('ev_1')]), snapFor(REG_CONF, [rec('ev_1')]))
  assert.equal(d.identical, false)
  assert.equal(d.fingerprint.match, false)
  assert.ok(d.summary.total > 0)
  assert.ok(d.changed.some(c => /confidence/i.test(c.path)))
  assert.ok(d.affectedStages.includes('normalize'))
  assert.ok(d.affectedStages.includes('prepareEngineExposure'))
})

test('changed normalized value → normalize affected; value path changed', () => {
  const d = diffPipelineSnapshots(snapFor(REG, [rec('ev_1')]), snapFor(REG_VAL, [rec('ev_1')]))
  assert.equal(d.identical, false)
  assert.ok(d.changed.some(c => /\.value$/.test(c.path)))
  assert.ok(d.affectedStages.includes('normalize'))
})

// ── changed audit / engine exposure (record valid → invalid) ────────────────────────

test('record valid in A but unknown_source in B → audit + exposure affected', () => {
  const a = snapFor(REG, [rec('ev_1')])
  const b = snapFor(REG, [rec('ev_1', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE })])   // no normalizer → unknown
  const d = diffPipelineSnapshots(a, b)
  assert.equal(d.identical, false)
  assert.ok(d.affectedStages.includes('prepareAudit'))
  assert.ok(d.affectedStages.includes('prepareEngineExposure'))
  assert.ok(typeof d.countsPerStage.prepareAudit === 'number' && d.countsPerStage.prepareAudit > 0)
})

// ── added / removed record ──────────────────────────────────────────────────────────

test('added record → diff reports additions, not identical', () => {
  const d = diffPipelineSnapshots(snapFor(REG, [rec('ev_1')]), snapFor(REG, [rec('ev_1'), rec('ev_2')]))
  assert.equal(d.identical, false)
  assert.ok(d.summary.added > 0 || d.summary.changed > 0)
  assert.ok(d.affectedStages.includes('counts'))   // record count changed
})

test('removed record → diff reports removals, not identical', () => {
  const d = diffPipelineSnapshots(snapFor(REG, [rec('ev_1'), rec('ev_2')]), snapFor(REG, [rec('ev_1')]))
  assert.equal(d.identical, false)
  assert.ok(d.summary.removed > 0 || d.summary.changed > 0)
})

// ── canonical ordering ──────────────────────────────────────────────────────────────

test('reordered object keys → zero diff (canonical comparison)', () => {
  const plan = planFor(REG, [rec('ev_1'), rec('ev_2')])
  const shuffled = reverseKeys(JSON.parse(JSON.stringify(plan)))
  const d = diffPipelineSnapshots(snapshotPipelinePlan(plan), snapshotPipelinePlan(shuffled))
  assert.equal(d.identical, true)
  assert.equal(d.summary.total, 0)
})

// ── immutability / determinism / inputs ─────────────────────────────────────────────

test('diff output is deeply frozen', () => {
  const d = diffPipelineSnapshots(snapFor(REG, [rec('ev_1')]), snapFor(REG_CONF, [rec('ev_1')]))
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.changed) && Object.isFrozen(d.summary) && Object.isFrozen(d.countsPerStage))
  assert.throws(() => d.changed.push({}))
  assert.throws(() => { d.summary.total = 99 })
})

test('deterministic — identical inputs → identical diff', () => {
  const a = snapFor(REG, [rec('ev_1'), rec('ev_2')])
  const b = snapFor(REG_CONF, [rec('ev_1'), rec('ev_2')])
  assert.deepEqual(diffPipelineSnapshots(a, b), diffPipelineSnapshots(a, b))
})

test('accepts raw PipelinePlans (snapshots them via the M65 contract)', () => {
  const viaPlans = diffPipelineSnapshots(planFor(REG, [rec('ev_1')]), planFor(REG_CONF, [rec('ev_1')]))
  const viaSnaps = diffPipelineSnapshots(snapFor(REG, [rec('ev_1')]), snapFor(REG_CONF, [rec('ev_1')]))
  assert.deepEqual(viaPlans, viaSnaps)
})

test('added/removed/changed lists are sorted by path (deterministic)', () => {
  const d = diffPipelineSnapshots(snapFor(REG, [rec('ev_1')]), snapFor(REG, [rec('ev_1'), rec('ev_2')]))
  const sorted = (arr) => arr.map(e => e.path).every((p, i, a) => i === 0 || a[i - 1] <= p)
  assert.ok(sorted(d.added) && sorted(d.removed) && sorted(d.changed))
})
