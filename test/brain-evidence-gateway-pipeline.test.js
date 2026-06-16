/**
 * M64 — Evidence Gateway full pipeline plan tests
 *
 * Deterministic tests for the dormant, pure-composition PipelinePlan: empty / single /
 * multiple records, unknown_source, invalid_signals, duplicates, and presence of each
 * downstream plan (confidence update, memory links, audit, engine exposure). Plus
 * canonical stage ordering, immutability, determinism, and the gateway.planRun() method.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  prepareFullPipelinePlan, createEvidenceGateway, EVIDENCE_GATEWAY_STAGE_NAMES,
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

const run = (records) => prepareFullPipelinePlan({ registry: REGISTRY, records, context: NCTX })

// ── empty run ───────────────────────────────────────────────────────────────────────

test('empty run — all plans empty, deferred, frozen, canonical stage order', () => {
  const p = run([])
  assert.equal(p.deferred, true)
  assert.deepEqual([...p.stages], [...EVIDENCE_GATEWAY_STAGE_NAMES])
  assert.deepEqual(p.results.map(r => r.stage), [...EVIDENCE_GATEWAY_STAGE_NAMES])
  assert.equal(p.applicationPlan.total, 0)
  assert.equal(p.engineExposurePlan.count, 0)
  assert.equal(p.auditPlan.count, 0)
  assert.deepEqual(p.counts, {
    records: 0, accepted: 0, unknownSource: 0, invalidSignals: 0, dedupeGroups: 0,
    collapses: 0, confidenceUpdates: 0, memoryNodes: 0, memoryEdges: 0, auditEntries: 0, exposed: 0,
  })
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.results) && Object.isFrozen(p.counts))
})

// ── single / multiple ───────────────────────────────────────────────────────────────

test('single record — accepted, exposed, audited, linked', () => {
  const p = run([rec('ev_1')])
  assert.equal(p.counts.accepted, 1)
  assert.equal(p.counts.exposed, 1)              // engine exposure present
  assert.ok(p.counts.auditEntries > 0)           // audit entries present
  assert.ok(p.counts.memoryNodes >= 1)           // memory links present
  assert.equal(p.engineExposurePlan.entries[0].evidenceId, 'ev_1')
})

test('multiple records — counts aggregate', () => {
  const p = run([rec('ev_1'), rec('ev_2', { subjectId: 'player-10' })])
  assert.equal(p.counts.records, 2)
  assert.equal(p.counts.accepted, 2)
  assert.equal(p.counts.exposed, 2)
  assert.equal(p.counts.memoryNodes, 2)
})

// ── partitions ──────────────────────────────────────────────────────────────────────

test('unknown source — counted, excluded from exposure', () => {
  const p = run([rec('ev_ok'), rec('ev_u', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE })])
  assert.equal(p.counts.unknownSource, 1)
  assert.equal(p.counts.accepted, 1)
  assert.deepEqual(p.engineExposurePlan.entries.map(e => e.evidenceId), ['ev_ok'])
})

test('invalid signal — counted, excluded from exposure', () => {
  const p = run([rec('ev_ok'), rec('ev_bad', { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE })])
  assert.equal(p.counts.invalidSignals, 1)
  assert.equal(p.counts.accepted, 1)
  assert.deepEqual(p.engineExposurePlan.entries.map(e => e.evidenceId), ['ev_ok'])
})

// ── duplicates → confidence update present ──────────────────────────────────────────

test('duplicates — dedupe group, collapse, confidence update + provenance edges present', () => {
  const p = run([rec('ev_1'), rec('ev_2')])    // same key/tenant/subject/day/source → duplicates
  assert.equal(p.counts.dedupeGroups, 1)
  assert.equal(p.counts.collapses, 1)
  assert.equal(p.counts.confidenceUpdates, 1)           // confidence update present
  assert.ok(p.dedupe.proposals.length === 1)            // provenance proposal present
  // memory edges include derivedFrom + supersedes (+ about edges)
  assert.ok(p.memoryLinkPlan.edges.some(e => e.type === 'derivedFrom'))
  assert.ok(p.memoryLinkPlan.edges.some(e => e.type === 'supersedes'))
  // exposure uses the reweighted confidence for the canonical
  const canonical = p.engineExposurePlan.entries.find(e => e.evidenceId === 'ev_1')
  assert.ok(canonical.proposedConfidence > 0.5)
})

// ── ordering / immutability / determinism ───────────────────────────────────────────

test('deterministic stage ordering — results follow canonical order exactly', () => {
  const p = run([rec('ev_1'), rec('ev_2')])
  assert.deepEqual(p.results.map(r => r.stage),
    ['receive', 'validate', 'normalize', 'deduplicate', 'prepareConfidenceUpdate', 'prepareMemoryLink', 'prepareAudit', 'prepareEngineExposure'])
  assert.ok(p.results.every(r => Object.isFrozen(r)))
})

test('result deeply frozen; input records not mutated', () => {
  const records = [rec('ev_1'), rec('ev_2')]
  const snap = JSON.stringify(records)
  const p = run(records)
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.applicationPlan) && Object.isFrozen(p.engineExposurePlan))
  assert.throws(() => p.results.push({}))
  assert.equal(JSON.stringify(records), snap)
})

test('deterministic — identical input → identical pipeline plan', () => {
  const records = [rec('ev_1'), rec('ev_2'), rec('ev_u', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE })]
  assert.deepEqual(run(records), run(records))
})

test('malformed input throws TypeError (programmer error)', () => {
  assert.throws(() => prepareFullPipelinePlan({ registry: REGISTRY, records: 'x', context: NCTX }), TypeError)
})

// ── gateway method ──────────────────────────────────────────────────────────────────

test('gateway.planRun() delegates to the pipeline helper', () => {
  const g = createEvidenceGateway()
  const viaMethod = g.planRun({ registry: REGISTRY, records: [rec('ev_1'), rec('ev_2')], context: NCTX })
  const viaHelper = run([rec('ev_1'), rec('ev_2')])
  assert.deepEqual(viaMethod, viaHelper)
})

test('no store is touched by planRun (an injected store gets zero calls)', () => {
  const calls = {}
  const spyStore = new Proxy({}, { get: (_t, p) => (...a) => { calls[p] = (calls[p] ?? 0) + 1; return Promise.resolve(null) } })
  const g = createEvidenceGateway({ store: spyStore })
  g.planRun({ registry: REGISTRY, records: [rec('ev_1')], context: NCTX })
  assert.deepEqual(calls, {})
})
