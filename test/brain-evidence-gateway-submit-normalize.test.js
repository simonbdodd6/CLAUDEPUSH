/**
 * M56 — Evidence Gateway submit() normalize threading tests
 *
 * Proves the dormant normalization ApplicationPlan flows through the gateway's OWN
 * submit()/run loop (not just the directly-called stage method): submit with
 * normalization inputs surfaces the deferred plan as the ordered `normalize` result;
 * submit without them is byte-for-byte unchanged; empty/accepted/unknown/invalid
 * partitions; deduplicate stays inert; the store is never touched; context passthrough;
 * immutability; determinism.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createEvidenceGateway, createGatewayContext, isGatewayContext, EVIDENCE_GATEWAY_STAGE_NAMES,
} from '@brain/evidence-gateway'
import { createNormalizerRegistry } from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const TENANT = Object.freeze({ clubId: 'c1', teamId: null, seasonId: null })
const NCTX = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
const signal = (id, over = {}) => ({
  key: 'lineout.winRate', value: 0.82, unit: null,
  polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.7, evidenceId: id, ...over,
})
const record = (id, sourceType = SOURCE_TYPE.PROVIDER_FRAME_SPORTS) =>
  Object.freeze({ id, sourceType, confidence: 0.8 })

const frame = Object.freeze({
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0', normalize: (rec) => [signal(rec.id)],
})
const badNote = Object.freeze({
  sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0', normalize: (rec) => [signal(rec.id, { key: 'bad key' })],
})
const REG = createNormalizerRegistry([frame, badNote])

const submitWith = (records, gatewayOpts = {}) =>
  createEvidenceGateway(gatewayOpts).submit({
    ingestRunId: 'run_1', tenant: TENANT, submission: {},
    registry: REG, records, normalizationContext: NCTX,
  })

const normResult = (res) => res.results.find(r => r.stage === 'normalize')
const appPlan = (res) => normResult(res).output.applicationPlan

// ── unchanged behaviour without normalization inputs ────────────────────────────────

test('submit WITHOUT normalization inputs is unchanged — normalize emits empty placeholder', async () => {
  const g = createEvidenceGateway()
  const res = await g.submit({ ingestRunId: 'run_1', tenant: TENANT, submission: {} })
  assert.deepEqual([...res.stages], [...EVIDENCE_GATEWAY_STAGE_NAMES])
  assert.equal(normResult(res).status, 'deferred')
  assert.deepEqual(normResult(res).output, { signals: [] })   // no applicationPlan in the inert flow
})

// ── normalization inputs flow through submit() ──────────────────────────────────────

test('submit WITH normalization inputs surfaces the deferred ApplicationPlan in order', async () => {
  const res = await submitWith([record('ev_1')])
  assert.deepEqual([...res.stages], [...EVIDENCE_GATEWAY_STAGE_NAMES])      // ordered result preserved
  assert.deepEqual(res.results.map(r => r.stage), [...EVIDENCE_GATEWAY_STAGE_NAMES])
  const n = normResult(res)
  assert.equal(n.status, 'deferred')                                       // still deferred
  assert.ok(n.output.applicationPlan)
  assert.equal(n.output.applicationPlan.total, 1)
  assert.ok(Object.isFrozen(res) && Object.isFrozen(res.results) && Object.isFrozen(n))
})

test('empty records — empty application plan via submit()', async () => {
  const ap = appPlan(await submitWith([]))
  assert.equal(ap.total, 0)
  assert.equal(ap.willApply, false)
  assert.deepEqual(ap.counts, { total: 0, accepted: 0, unknown_source: 0, invalid_signals: 0, signals: 0 })
})

test('accepted records — signals described for forwarding via submit()', async () => {
  const ap = appPlan(await submitWith([record('ev_1'), record('ev_2')]))
  assert.deepEqual(ap.counts, { total: 2, accepted: 2, unknown_source: 0, invalid_signals: 0, signals: 2 })
  assert.deepEqual(ap.accepted.map(a => a.recordId), ['ev_1', 'ev_2'])
})

test('unknown source records — structured data via submit()', async () => {
  const ap = appPlan(await submitWith([record('ev_u', SOURCE_TYPE.MANUAL_SCOUTING_NOTE)]))
  assert.equal(ap.counts.unknown_source, 1)
  assert.deepEqual(ap.unknownSource, [{ index: 0, recordId: 'ev_u', sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE }])
})

test('invalid signal records — structured data via submit()', async () => {
  const ap = appPlan(await submitWith([record('ev_b', SOURCE_TYPE.MANUAL_MATCH_NOTE)]))
  assert.equal(ap.counts.invalid_signals, 1)
  assert.ok(ap.invalidSignals[0].problems.some(p => /^signal\[0\]:/.test(p)))
})

test('mixed batch through submit() — counts + order preserved', async () => {
  const ap = appPlan(await submitWith([
    record('ev_ok'), record('ev_u', SOURCE_TYPE.MANUAL_SCOUTING_NOTE), record('ev_b', SOURCE_TYPE.MANUAL_MATCH_NOTE),
  ]))
  assert.deepEqual(ap.counts, { total: 3, accepted: 1, unknown_source: 1, invalid_signals: 1, signals: 1 })
  assert.deepEqual(ap.accepted.map(a => a.index), [0])
  assert.deepEqual(ap.unknownSource.map(u => u.index), [1])
  assert.deepEqual(ap.invalidSignals.map(v => v.index), [2])
})

// ── deduplicate inert + store untouched ─────────────────────────────────────────────

test('deduplicate stays inert even when normalization ran', async () => {
  const res = await submitWith([record('ev_1')])
  const dedupe = res.results.find(r => r.stage === 'deduplicate')
  assert.equal(dedupe.status, 'deferred')
  assert.deepEqual(dedupe.output, { isDuplicate: false, dedupeKey: null })   // placeholder, not executed
})

test('Evidence Store is never touched during a normalization submit', async () => {
  const calls = {}
  const spyStore = new Proxy({}, { get: (_t, p) => (...a) => { calls[p] = (calls[p] ?? 0) + 1; return Promise.resolve(null) } })
  await submitWith([record('ev_1'), record('ev_b', SOURCE_TYPE.MANUAL_MATCH_NOTE)], { store: spyStore })
  assert.deepEqual(calls, {}, 'no store method may be called')
})

// ── context passthrough ─────────────────────────────────────────────────────────────

test('NormalizationContext is passed through submit() to the normalizer (frozen, exact)', async () => {
  const seen = []
  const spy = { sourceType: SOURCE_TYPE.PROVIDER_VIDEO, version: '1.0', normalize: (rec, ctx) => { seen.push(ctx); return [] } }
  const reg = createNormalizerRegistry([spy])
  await createEvidenceGateway().submit({
    ingestRunId: 'run_1', tenant: TENANT, submission: {},
    registry: reg, records: [record('ev_1', SOURCE_TYPE.PROVIDER_VIDEO)], normalizationContext: NCTX,
  })
  assert.deepEqual(seen, [{ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' }])
  assert.ok(Object.isFrozen(seen[0]))
})

// ── context shape + pre-built context path ──────────────────────────────────────────

test('createGatewayContext threads normalization (top-level or nested); isGatewayContext sees it', () => {
  const top = createGatewayContext({ ingestRunId: 'r', tenant: TENANT, submission: {}, registry: REG, records: [record('ev_1')], normalizationContext: NCTX })
  assert.ok(isGatewayContext(top))
  assert.equal(top.normalization.registry, REG)
  assert.equal(top.normalization.context, NCTX)
  assert.ok(Object.isFrozen(top.normalization))
  const nested = createGatewayContext({ ingestRunId: 'r', tenant: TENANT, submission: {}, normalization: { registry: REG, records: [], context: NCTX } })
  assert.equal(nested.normalization.registry, REG)
  // no normalization → null, submit() unaffected
  assert.equal(createGatewayContext({ ingestRunId: 'r', tenant: TENANT, submission: {} }).normalization, null)
})

test('a pre-built GatewayContext passed to submit() is used as-is and still normalizes', async () => {
  const ctx = createGatewayContext({ ingestRunId: 'run_1', tenant: TENANT, submission: {}, registry: REG, records: [record('ev_1')], normalizationContext: NCTX })
  const res = await createEvidenceGateway().submit(ctx)
  assert.equal(appPlan(res).counts.accepted, 1)
})

// ── immutability + determinism ──────────────────────────────────────────────────────

test('submit does not mutate registry, records, context, or its result', async () => {
  const records = [record('ev_1'), record('ev_b', SOURCE_TYPE.MANUAL_MATCH_NOTE)]
  const snapshot = JSON.stringify(records)
  const before = REG.keys()
  const res = await submitWith(records)
  assert.equal(JSON.stringify(records), snapshot)
  assert.deepEqual(REG.keys(), before)
  assert.deepEqual(NCTX, { now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
  assert.ok(Object.isFrozen(res.results))
  assert.throws(() => res.results.push({}))
})

test('deterministic — identical submit inputs → identical result', async () => {
  const records = [record('ev_1'), record('ev_u', SOURCE_TYPE.MANUAL_SCOUTING_NOTE)]
  assert.deepEqual(await submitWith(records), await submitWith(records))
})
