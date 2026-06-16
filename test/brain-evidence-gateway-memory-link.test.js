/**
 * M61 — Evidence Gateway prepareMemoryLink stage contract tests
 *
 * Deterministic tests for the dormant, data-only MemoryLinkPlan: empty, single/multiple
 * evidence nodes, unique subject nodes, derivedFrom + supersedes edge generation,
 * relationship direction (from→to), deterministic ordering, immutability, no mutation,
 * unknown/invalid exclusion, no graph reads/writes, and the stage's deferred output.
 * Provenance facts are reused from M58 (not re-derived here).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveDedupeGroups, deriveProvenanceProposals, deriveMemoryLinkPlan, STAGE_BY_NAME,
} from '@brain/evidence-gateway'
import {
  createNormalizerRegistry, planBatchNormalization, planNormalizationApplication,
} from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const TENANT = Object.freeze({ clubId: 'c1', teamId: 't1', seasonId: 's1' })
const rec = (id, over = {}) => Object.freeze({
  id, tenant: TENANT, subjectType: 'player', subjectId: 'player-9',
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, observedAt: '2026-06-16T09:30:00.000Z', confidence: 0.8, ...over,
})
const acc = (recordId, signalKeys, index) => Object.freeze({
  index, recordId, normalizerKey: 'provider.frameSports@1.0',
  signals: Object.freeze(signalKeys.map(k => Object.freeze({ key: k, value: 1, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.5, evidenceId: recordId }))),
})
const plan = (accepted, records) => {
  const { groups } = deriveDedupeGroups({ accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  return deriveMemoryLinkPlan({ accepted, records, proposals })
}

// ── empty ─────────────────────────────────────────────────────────────────────────

test('empty plan — no subjects/evidence/edges, frozen', () => {
  const r = deriveMemoryLinkPlan({ accepted: [], records: [], proposals: [] })
  assert.deepEqual(r, { subjects: [], evidence: [], edges: [], counts: { subjects: 0, evidence: 0, edges: 0 }, problems: [] })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.edges))
})

// ── single evidence node ────────────────────────────────────────────────────────────

test('single evidence node — subject node, evidence node, about edge (evidence → subject)', () => {
  const r = plan([acc('ev_1', ['lineout.winRate'])], [rec('ev_1')])
  assert.deepEqual(r.subjects, [{ subjectType: 'player', subjectId: 'player-9' }])
  assert.equal(r.evidence.length, 1)
  assert.deepEqual(r.evidence[0], { evidenceId: 'ev_1', subjectType: 'player', subjectId: 'player-9', sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, signalKeys: ['lineout.winRate'] })
  assert.deepEqual(r.edges, [{ type: 'about', from: 'ev_1', to: 'player-9' }])    // direction: evidence → subject
})

// ── multiple evidence nodes + unique subjects ───────────────────────────────────────

test('multiple evidence nodes — unique subject nodes, ordered evidence + about edges', () => {
  const accepted = [acc('ev_1', ['a.k'], 0), acc('ev_2', ['b.k'], 1), acc('ev_3', ['c.k'], 2)]
  const records = [rec('ev_1'), rec('ev_2', { subjectId: 'player-10' }), rec('ev_3')]   // ev_1 + ev_3 same subject
  const r = plan(accepted, records)
  assert.deepEqual(r.subjects.map(s => s.subjectId), ['player-9', 'player-10'])         // unique, first-seen
  assert.deepEqual(r.evidence.map(e => e.evidenceId), ['ev_1', 'ev_2', 'ev_3'])         // order preserved
  assert.deepEqual(r.edges.filter(e => e.type === 'about').map(e => [e.from, e.to]),
    [['ev_1', 'player-9'], ['ev_2', 'player-10'], ['ev_3', 'player-9']])
})

// ── derivedFrom + supersedes edges + direction ──────────────────────────────────────

test('derivedFrom + supersedes edges with correct direction', () => {
  // ev_1 (idx 0) canonical, ev_2 (idx 1) duplicate of the same fact
  const accepted = [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1)]
  const r = plan(accepted, [rec('ev_1'), rec('ev_2')])
  const derived = r.edges.filter(e => e.type === 'derivedFrom')
  const supersedes = r.edges.filter(e => e.type === 'supersedes')
  assert.deepEqual(derived, [{ type: 'derivedFrom', from: 'ev_2', to: 'ev_1' }])   // duplicate → canonical
  assert.deepEqual(supersedes, [{ type: 'supersedes', from: 'ev_1', to: 'ev_2' }]) // canonical → duplicate
})

test('no provenance edges when there are no duplicates', () => {
  const r = plan([acc('ev_1', ['k.a'], 0)], [rec('ev_1')])
  assert.equal(r.edges.filter(e => e.type !== 'about').length, 0)
})

// ── exclusion via the real pipeline ─────────────────────────────────────────────────

test('unknown_source / invalid_signals excluded — no nodes or edges for them', () => {
  const frame = { sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
    normalize: (r) => [{ key: 'lineout.winRate', value: 1, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.5, evidenceId: r.id }] }
  const badNote = { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
    normalize: (r) => [{ key: 'bad key', value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: r.id }] }
  const registry = createNormalizerRegistry([frame, badNote])
  const records = [
    rec('ev_ok'),
    rec('ev_unknown', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE }),
    rec('ev_bad', { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE }),
  ]
  const ctx = { now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' }
  const appPlan = planNormalizationApplication(planBatchNormalization(registry, records, ctx))
  const { groups } = deriveDedupeGroups({ accepted: appPlan.accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  const r = deriveMemoryLinkPlan({ accepted: appPlan.accepted, records, proposals })
  assert.deepEqual(r.evidence.map(e => e.evidenceId), ['ev_ok'])
  const nodeIds = r.evidence.map(e => e.evidenceId)
  assert.equal(nodeIds.includes('ev_unknown'), false)
  assert.equal(nodeIds.includes('ev_bad'), false)
})

// ── immutability + determinism ──────────────────────────────────────────────────────

test('result deeply frozen; input not mutated', () => {
  const accepted = [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1)]
  const records = [rec('ev_1'), rec('ev_2')]
  const { groups } = deriveDedupeGroups({ accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  const snap = JSON.stringify({ accepted, records, proposals })
  const r = deriveMemoryLinkPlan({ accepted, records, proposals })
  assert.ok(Object.isFrozen(r) && r.edges.every(e => Object.isFrozen(e)) && r.evidence.every(e => Object.isFrozen(e)))
  assert.throws(() => r.edges.push({}))
  assert.equal(JSON.stringify({ accepted, records, proposals }), snap)
})

test('deterministic — identical input → identical plan', () => {
  const accepted = [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1)]
  const records = [rec('ev_1'), rec('ev_2')]
  assert.deepEqual(plan(accepted, records), plan(accepted, records))
})

test('record not found → problem, no node emitted', () => {
  const r = deriveMemoryLinkPlan({ accepted: [acc('missing', ['k.a'], 0)], records: [], proposals: [] })
  assert.deepEqual(r.evidence, [])
  assert.equal(r.problems.length, 1)
  assert.match(r.problems[0].problem, /record not found/)
})

test('malformed input throws TypeError (programmer error)', () => {
  assert.throws(() => deriveMemoryLinkPlan({ accepted: 'x', records: [], proposals: [] }), TypeError)
  assert.throws(() => deriveMemoryLinkPlan({ accepted: [], records: 'x', proposals: [] }), TypeError)
  assert.throws(() => deriveMemoryLinkPlan({ accepted: [], records: [], proposals: 'x' }), TypeError)
})

// ── stage exposes the deferred plan ─────────────────────────────────────────────────

test('prepareMemoryLink stage — plan() returns a DEFERRED memory-link plan; run() unchanged', () => {
  const stage = STAGE_BY_NAME.prepareMemoryLink
  assert.deepEqual(stage.run().output, { nodes: [], edges: [] })
  const out = stage.plan({ accepted: [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1)], records: [rec('ev_1'), rec('ev_2')] })
  assert.equal(out.stage, 'prepareMemoryLink')
  assert.equal(out.status, 'deferred')
  assert.deepEqual(out.output.subjects, [{ subjectType: 'player', subjectId: 'player-9' }])
  assert.ok(out.output.edges.some(e => e.type === 'derivedFrom' && e.from === 'ev_2' && e.to === 'ev_1'))
  assert.ok(Object.isFrozen(out))
})
