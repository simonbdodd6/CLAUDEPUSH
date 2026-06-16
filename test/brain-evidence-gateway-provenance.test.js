/**
 * M58 — Evidence Gateway deduplicate-stage provenance-link contract tests
 *
 * Deterministic tests for the dormant, data-only provenance proposals derived from M57
 * dedupe groups: empty, single-entry (no proposal), duplicate→one canonical, canonical
 * by lowest index, fallback by earliest observedAt, stable fallback, derivedFrom +
 * supersedes shapes, counts not inflated, no deletion/merge, unknown/invalid exclusion,
 * immutability, and the deduplicate stage's deferred output.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveDedupeGroups, deriveProvenanceProposals, STAGE_BY_NAME,
} from '@brain/evidence-gateway'
import {
  createNormalizerRegistry, planBatchNormalization, planNormalizationApplication,
} from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const TENANT = Object.freeze({ clubId: 'c1', teamId: 't1', seasonId: 's1' })
const rec = (id, over = {}) => Object.freeze({
  id, tenant: TENANT, subjectId: 'player-9', sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS,
  observedAt: '2026-06-16T09:30:00.000Z', confidence: 0.8, ...over,
})
const acc = (recordId, signalKeys, index) => Object.freeze({
  index, recordId, normalizerKey: 'provider.frameSports@1.0',
  signals: Object.freeze(signalKeys.map(k => Object.freeze({ key: k, value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: recordId }))),
})
// derive groups then proposals (the real composition)
const propose = (accepted, records) =>
  deriveProvenanceProposals({ groups: deriveDedupeGroups({ accepted, records }).groups, records })

// ── empty / single ──────────────────────────────────────────────────────────────────

test('empty groups — no proposals, frozen', () => {
  const r = deriveProvenanceProposals({ groups: [], records: [] })
  assert.deepEqual(r, { proposals: [], collapses: 0, linkedRecords: 0, problems: [] })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.proposals))
})

test('single-entry group produces NO collapse proposal', () => {
  const r = propose([acc('ev_1', ['lineout.winRate'], 0)], [rec('ev_1')])
  assert.deepEqual(r.proposals, [])
  assert.equal(r.collapses, 0)
})

// ── duplicate group → one canonical ─────────────────────────────────────────────────

test('duplicate group produces exactly one canonical and N-1 duplicate links', () => {
  const accepted = [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1), acc('ev_3', ['k.a'], 2)]
  const r = propose(accepted, [rec('ev_1'), rec('ev_2'), rec('ev_3')])
  assert.equal(r.proposals.length, 1)
  const p = r.proposals[0]
  assert.equal(p.canonical.recordId, 'ev_1')
  assert.equal(p.duplicates.length, 2)
  assert.deepEqual(p.duplicates.map(d => d.recordId), ['ev_2', 'ev_3'])
  assert.equal(r.collapses, 1)
  assert.equal(r.linkedRecords, 2)
})

// ── canonical selection ─────────────────────────────────────────────────────────────

test('canonical selection by LOWEST batch index', () => {
  // present out of order; lowest index (2) must win regardless of input order
  const accepted = [acc('ev_hi', ['k.a'], 5), acc('ev_lo', ['k.a'], 2), acc('ev_mid', ['k.a'], 4)]
  const r = propose(accepted, [rec('ev_hi'), rec('ev_lo'), rec('ev_mid')])
  assert.equal(r.proposals[0].canonical.recordId, 'ev_lo')
  assert.deepEqual(r.proposals[0].duplicates.map(d => d.recordId), ['ev_hi', 'ev_mid'])  // original order
})

test('canonical selection FALLBACK by earliest observedAt when index ties', () => {
  // same batch index → earliest observedAt wins
  const groups = [{
    key: 'shared', count: 2, wouldCollapse: true,
    entries: [
      { index: 7, recordId: 'ev_late', signalKey: 'k.a' },
      { index: 7, recordId: 'ev_early', signalKey: 'k.a' },
    ],
  }]
  const records = [rec('ev_late', { observedAt: '2026-06-16T18:00:00.000Z' }), rec('ev_early', { observedAt: '2026-06-16T06:00:00.000Z' })]
  const r = deriveProvenanceProposals({ groups, records })
  assert.equal(r.proposals[0].canonical.recordId, 'ev_early')
})

test('STABLE fallback ordering when index and observedAt tie', () => {
  const groups = [{
    key: 'shared', count: 2, wouldCollapse: true,
    entries: [
      { index: 7, recordId: 'ev_first', signalKey: 'k.a' },
      { index: 7, recordId: 'ev_second', signalKey: 'k.a' },
    ],
  }]
  const records = [rec('ev_first', { observedAt: '2026-06-16T06:00:00.000Z' }), rec('ev_second', { observedAt: '2026-06-16T06:00:00.000Z' })]
  const r = deriveProvenanceProposals({ groups, records })
  assert.equal(r.proposals[0].canonical.recordId, 'ev_first')   // first encountered kept
})

// ── link shapes ─────────────────────────────────────────────────────────────────────

test('derivedFrom proposal shape — duplicate derivedFrom = [canonicalRecordId]', () => {
  const r = propose([acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1)], [rec('ev_1'), rec('ev_2')])
  const dup = r.proposals[0].duplicates[0]
  assert.deepEqual(dup.derivedFrom, ['ev_1'])
  assert.ok(Object.isFrozen(dup.derivedFrom))
})

test('supersedes proposal shape (contract-consistent) — supersedes null, supersededBy canonical', () => {
  const r = propose([acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1)], [rec('ev_1'), rec('ev_2')])
  const dup = r.proposals[0].duplicates[0]
  assert.ok('supersedes' in dup)
  assert.equal(dup.supersedes, null)                 // pure duplication is not a correction
  assert.equal(dup.supersededBy, 'ev_1')             // canonical is authoritative
})

// ── invariants ──────────────────────────────────────────────────────────────────────

test('counts not inflated — proposal count equals group occurrences', () => {
  const accepted = [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1), acc('ev_3', ['k.a'], 2)]
  const r = propose(accepted, [rec('ev_1'), rec('ev_2'), rec('ev_3')])
  assert.equal(r.proposals[0].count, 3)
  assert.equal(1 + r.proposals[0].duplicates.length, r.proposals[0].count)  // canonical + dups == count
})

test('no deletion or merge — every non-canonical occurrence is represented as a link', () => {
  const accepted = [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1), acc('ev_3', ['k.a'], 2)]
  const r = propose(accepted, [rec('ev_1'), rec('ev_2'), rec('ev_3')])
  const represented = [r.proposals[0].canonical.recordId, ...r.proposals[0].duplicates.map(d => d.recordId)]
  assert.deepEqual(represented.sort(), ['ev_1', 'ev_2', 'ev_3'])
})

test('unknown_source / invalid_signals never produce proposals (via the real pipeline)', () => {
  const frame = { sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
    normalize: (r) => [{ key: 'lineout.winRate', value: 1, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.5, evidenceId: r.id }] }
  const badNote = { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
    normalize: (r) => [{ key: 'bad key', value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: r.id }] }
  const registry = createNormalizerRegistry([frame, badNote])
  const records = [
    rec('ev_a'), rec('ev_b'),                                          // two duplicates (same key/tenant/subject/day/source)
    rec('ev_unknown', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE }),
    rec('ev_bad', { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE }),
  ]
  const ctx = { now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' }
  const appPlan = planNormalizationApplication(planBatchNormalization(registry, records, ctx))
  const r = deriveProvenanceProposals({ groups: deriveDedupeGroups({ accepted: appPlan.accepted, records }).groups, records })
  const ids = r.proposals.flatMap(p => [p.canonical.recordId, ...p.duplicates.map(d => d.recordId)])
  assert.deepEqual(ids.sort(), ['ev_a', 'ev_b'])
  assert.equal(ids.includes('ev_unknown'), false)
  assert.equal(ids.includes('ev_bad'), false)
})

// ── immutability + determinism ──────────────────────────────────────────────────────

test('result is deeply frozen and input is not mutated', () => {
  const accepted = [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1)]
  const records = [rec('ev_1'), rec('ev_2')]
  const groups = deriveDedupeGroups({ accepted, records }).groups
  const snap = JSON.stringify({ groups, records })
  const r = deriveProvenanceProposals({ groups, records })
  assert.ok(Object.isFrozen(r) && r.proposals.every(p => Object.isFrozen(p) && Object.isFrozen(p.duplicates)))
  assert.throws(() => r.proposals.push({}))
  assert.equal(JSON.stringify({ groups, records }), snap)
})

test('deterministic — identical input → identical proposals', () => {
  const accepted = [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1)]
  const records = [rec('ev_1'), rec('ev_2')]
  const groups = deriveDedupeGroups({ accepted, records }).groups
  assert.deepEqual(deriveProvenanceProposals({ groups, records }), deriveProvenanceProposals({ groups, records }))
})

test('malformed input throws TypeError (programmer error)', () => {
  assert.throws(() => deriveProvenanceProposals({ groups: 'x', records: [] }), TypeError)
  assert.throws(() => deriveProvenanceProposals({ groups: [], records: 'x' }), TypeError)
})

// ── deduplicate stage exposes the deferred proposals ────────────────────────────────

test('deduplicate stage — provenance() returns a DEFERRED proposal report; run() unchanged', () => {
  const dedupe = STAGE_BY_NAME.deduplicate
  assert.deepEqual(dedupe.run().output, { isDuplicate: false, dedupeKey: null })
  const out = dedupe.provenance({ accepted: [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1)], records: [rec('ev_1'), rec('ev_2')] })
  assert.equal(out.stage, 'deduplicate')
  assert.equal(out.status, 'deferred')
  assert.equal(out.output.proposals[0].canonical.recordId, 'ev_1')
  assert.equal(out.output.proposals[0].duplicates[0].derivedFrom[0], 'ev_1')
  assert.ok(Object.isFrozen(out))
})
