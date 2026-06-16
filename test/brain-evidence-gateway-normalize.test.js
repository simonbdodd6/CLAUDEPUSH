/**
 * M55 — Evidence Gateway normalize-stage wiring tests
 *
 * Proves the dormant gateway `normalize` stage consumes the M50–M54 normalization
 * pipeline via `plan({ registry, records, context })`, returning a DEFERRED
 * ApplicationPlan: empty/accepted/unknown/invalid partitions, context passthrough, no
 * store writes, no deduplicate execution, immutability, determinism — and that the
 * end-to-end gateway flow stays inert (run() unchanged).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  STAGE_BY_NAME, EVIDENCE_GATEWAY_STAGE_NAMES, createEvidenceGateway,
} from '@brain/evidence-gateway'
import { createNormalizerRegistry } from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const normalize = STAGE_BY_NAME.normalize

const CTX = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
const signal = (id, over = {}) => ({
  key: 'lineout.winRate', value: 0.82, unit: null,
  polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.7, evidenceId: id, ...over,
})
const record = (id, sourceType = SOURCE_TYPE.PROVIDER_FRAME_SPORTS) =>
  Object.freeze({ id, sourceType, confidence: 0.8 })

const frame = Object.freeze({
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
  normalize: (rec) => [signal(rec.id)],
})
const badNote = Object.freeze({
  sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
  normalize: (rec) => [signal(rec.id, { key: 'bad key' })],
})
const REG = createNormalizerRegistry([frame, badNote])

const plan = (records) => normalize.plan({ registry: REG, records, context: CTX })

// ── stage exposes the wiring ────────────────────────────────────────────────────────

test('normalize stage keeps name/run and adds plan()', () => {
  assert.equal(normalize.name, 'normalize')
  assert.equal(typeof normalize.run, 'function')
  assert.equal(typeof normalize.plan, 'function')
})

// ── returns a deferred application-plan contract ────────────────────────────────────

test('plan() returns a DEFERRED stage output carrying the application plan', () => {
  const out = plan([record('ev_1')])
  assert.equal(out.stage, 'normalize')
  assert.equal(out.status, 'deferred')                 // nothing executed/applied
  assert.ok(out.output.applicationPlan)
  assert.equal(out.output.applicationPlan.total, 1)
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.output))
})

// ── empty / accepted / unknown / invalid ────────────────────────────────────────────

test('empty records — empty application plan, nothing to apply', () => {
  const ap = plan([]).output.applicationPlan
  assert.equal(ap.total, 0)
  assert.equal(ap.willApply, false)
  assert.deepEqual(ap.counts, { total: 0, accepted: 0, unknown_source: 0, invalid_signals: 0, signals: 0 })
})

test('accepted records — signals described for forwarding (not written)', () => {
  const ap = plan([record('ev_1'), record('ev_2')]).output.applicationPlan
  assert.equal(ap.willApply, true)
  assert.deepEqual(ap.counts, { total: 2, accepted: 2, unknown_source: 0, invalid_signals: 0, signals: 2 })
  assert.deepEqual(ap.accepted.map(a => a.recordId), ['ev_1', 'ev_2'])
  assert.equal(ap.accepted[0].normalizerKey, 'provider.frameSports@1.0')
})

test('unknown source records — kept as structured data', () => {
  const ap = plan([record('ev_u', SOURCE_TYPE.MANUAL_SCOUTING_NOTE)]).output.applicationPlan
  assert.equal(ap.counts.unknown_source, 1)
  assert.deepEqual(ap.unknownSource, [{ index: 0, recordId: 'ev_u', sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE }])
})

test('invalid signal records — kept as structured data with problems', () => {
  const ap = plan([record('ev_b', SOURCE_TYPE.MANUAL_MATCH_NOTE)]).output.applicationPlan
  assert.equal(ap.counts.invalid_signals, 1)
  assert.equal(ap.invalidSignals[0].recordId, 'ev_b')
  assert.ok(ap.invalidSignals[0].problems.some(p => /^signal\[0\]:/.test(p)))
})

test('mixed batch through the stage — counts correct, order preserved', () => {
  const records = [
    record('ev_ok'), record('ev_u', SOURCE_TYPE.MANUAL_SCOUTING_NOTE), record('ev_b', SOURCE_TYPE.MANUAL_MATCH_NOTE),
  ]
  const ap = plan(records).output.applicationPlan
  assert.deepEqual(ap.counts, { total: 3, accepted: 1, unknown_source: 1, invalid_signals: 1, signals: 1 })
  assert.deepEqual(ap.accepted.map(a => a.index), [0])
  assert.deepEqual(ap.unknownSource.map(u => u.index), [1])
  assert.deepEqual(ap.invalidSignals.map(v => v.index), [2])
})

// ── context passthrough ─────────────────────────────────────────────────────────────

test('NormalizationContext is passed through to the normalizer (frozen, exact)', () => {
  const seen = []
  const spy = { sourceType: SOURCE_TYPE.PROVIDER_VIDEO, version: '1.0', normalize: (rec, ctx) => { seen.push(ctx); return [] } }
  const reg = createNormalizerRegistry([spy])
  normalize.plan({ registry: reg, records: [record('ev_1', SOURCE_TYPE.PROVIDER_VIDEO)], context: CTX })
  assert.deepEqual(seen, [{ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' }])
  assert.ok(Object.isFrozen(seen[0]))
})

// ── no store writes / no deduplicate execution ──────────────────────────────────────

test('plan() takes no store and performs no storage', () => {
  // plan() has no store parameter at all; an injected gateway store still gets zero calls
  const calls = {}
  const spyStore = new Proxy({}, { get: (_t, p) => (...a) => { calls[p] = (calls[p] ?? 0) + 1; return Promise.resolve(null) } })
  const g = createEvidenceGateway({ store: spyStore })
  g.stages // touch
  normalize.plan({ registry: REG, records: [record('ev_1')], context: CTX })
  assert.deepEqual(calls, {}, 'no store method may be called by the normalize wiring')
})

test('plan() does not run deduplicate — output is the single normalize stage only', () => {
  const out = plan([record('ev_1')])
  assert.equal(out.stage, 'normalize')
  assert.equal('isDuplicate' in out.output, false)     // no deduplicate output leaked in
  assert.equal('dedupeKey' in out.output, false)
})

test('end-to-end submit() stays inert — normalize.run() still emits the empty placeholder', async () => {
  const g = createEvidenceGateway()
  const res = await g.submit({ ingestRunId: 'run_1', tenant: { clubId: 'c1', teamId: null, seasonId: null }, submission: {} })
  assert.deepEqual([...res.stages], [...EVIDENCE_GATEWAY_STAGE_NAMES])
  const normResult = res.results.find(r => r.stage === 'normalize')
  assert.equal(normResult.status, 'deferred')
  assert.deepEqual(normResult.output, { signals: [] })  // run() unchanged; no application plan in the inert flow
})

// ── immutability + determinism ──────────────────────────────────────────────────────

test('input records + registry are not mutated; result deeply frozen', () => {
  const records = [record('ev_1'), record('ev_b', SOURCE_TYPE.MANUAL_MATCH_NOTE)]
  const snapshot = JSON.stringify(records)
  const before = REG.keys()
  const out = plan(records)
  assert.equal(JSON.stringify(records), snapshot)
  assert.deepEqual(REG.keys(), before)
  assert.equal(REG.size, 2)
  assert.ok(Object.isFrozen(out.output.applicationPlan))
  assert.ok(out.output.applicationPlan.accepted.every(a => Object.isFrozen(a)))
})

test('deterministic — identical inputs → identical stage output', () => {
  const records = [record('ev_1'), record('ev_u', SOURCE_TYPE.MANUAL_SCOUTING_NOTE)]
  assert.deepEqual(plan(records), plan(records))
})
