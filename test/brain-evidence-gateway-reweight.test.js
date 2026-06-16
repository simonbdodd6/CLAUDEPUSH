/**
 * M59 — Evidence Gateway deduplicate-stage confidence-reweight contract tests
 *
 * Deterministic tests for the dormant, data-only confidence-reweight proposals derived
 * from M58 provenance proposals + accepted entries: empty, single-canonical (no dup),
 * duplicates raise confidence deterministically, bounds respected, duplicate IDs
 * included, no count inflation, unknown/invalid excluded, immutability, no mutation,
 * and the deduplicate stage's deferred output. Confidence maths reuses
 * @brain/evidence-weighting (not re-implemented here).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveDedupeGroups, deriveProvenanceProposals, deriveConfidenceReweightProposals, STAGE_BY_NAME,
} from '@brain/evidence-gateway'
import {
  createNormalizerRegistry, planBatchNormalization, planNormalizationApplication,
} from '@brain/evidence-normalization'
import { combineEvidenceConfidence } from '@brain/evidence-weighting'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const TENANT = Object.freeze({ clubId: 'c1', teamId: 't1', seasonId: 's1' })
const rec = (id, over = {}) => Object.freeze({
  id, tenant: TENANT, subjectId: 'player-9', sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS,
  observedAt: '2026-06-16T09:30:00.000Z', confidence: 0.8, ...over,
})
const acc = (recordId, signalKey, confidence, index) => Object.freeze({
  index, recordId, normalizerKey: 'provider.frameSports@1.0',
  signals: Object.freeze([Object.freeze({ key: signalKey, value: 1, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence, evidenceId: recordId })]),
})
// full composition: accepted → dedupe groups → provenance proposals → reweight proposals
const reweight = (accepted, records) => {
  const { groups } = deriveDedupeGroups({ accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  return deriveConfidenceReweightProposals({ proposals, accepted })
}

// ── empty / single ──────────────────────────────────────────────────────────────────

test('empty provenance proposals — no reweight proposals, frozen', () => {
  const r = deriveConfidenceReweightProposals({ proposals: [], accepted: [] })
  assert.deepEqual(r, { proposals: [], reweighted: 0, problems: [] })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.proposals))
})

test('single canonical with NO duplicates → no reweight proposal', () => {
  const r = reweight([acc('ev_1', 'k.a', 0.5, 0)], [rec('ev_1')])
  assert.deepEqual(r.proposals, [])
  assert.equal(r.reweighted, 0)
})

// ── duplicate group adjusts confidence deterministically ────────────────────────────

test('duplicate group raises canonical confidence deterministically (reuses weighting)', () => {
  const accepted = [acc('ev_1', 'k.a', 0.5, 0), acc('ev_2', 'k.a', 0.5, 1)]
  const r = reweight(accepted, [rec('ev_1'), rec('ev_2')])
  assert.equal(r.proposals.length, 1)
  const p = r.proposals[0]
  assert.equal(p.recordId, 'ev_1')                          // canonical = lowest index
  assert.equal(p.currentConfidence, 0.5)                    // preserved
  // proposed must match the weighting library exactly (no re-implemented maths)
  const expected = combineEvidenceConfidence([{ confidence: 0.5 }, { confidence: 0.5 }]).confidence
  assert.equal(p.proposedConfidence, expected)
  assert.ok(p.proposedConfidence > p.currentConfidence)     // corroboration raises it
  assert.equal(p.delta, expected - 0.5)
})

test('deterministic — identical input → identical reweight proposals', () => {
  const accepted = [acc('ev_1', 'k.a', 0.6, 0), acc('ev_2', 'k.a', 0.4, 1)]
  const records = [rec('ev_1'), rec('ev_2')]
  assert.deepEqual(reweight(accepted, records), reweight(accepted, records))
})

// ── bounds ──────────────────────────────────────────────────────────────────────────

test('confidence bounds respected — proposed stays within [0,1] / cap, even with many duplicates', () => {
  const accepted = Array.from({ length: 12 }, (_, i) => acc(`ev_${i}`, 'k.a', 0.9, i))
  const records = accepted.map((a) => rec(a.recordId))
  const r = reweight(accepted, records)
  const p = r.proposals[0]
  assert.ok(p.proposedConfidence >= 0 && p.proposedConfidence <= 1)
  assert.ok(p.proposedConfidence <= 0.95)                   // corroboration cap from the contract
})

// ── duplicate IDs + counts ──────────────────────────────────────────────────────────

test('supporting duplicate IDs included; counts NOT inflated', () => {
  const accepted = [acc('ev_1', 'k.a', 0.5, 0), acc('ev_2', 'k.a', 0.5, 1), acc('ev_3', 'k.a', 0.5, 2)]
  const r = reweight(accepted, [rec('ev_1'), rec('ev_2'), rec('ev_3')])
  const p = r.proposals[0]
  assert.deepEqual(p.supportingDuplicates, ['ev_2', 'ev_3'])
  assert.equal(p.count, 3)                                   // == occurrences
  assert.equal(1 + p.supportingDuplicates.length, p.count)  // canonical + supporters
})

// ── exclusion via the real pipeline ─────────────────────────────────────────────────

test('unknown_source / invalid_signals never reach reweight proposals', () => {
  const frame = { sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
    normalize: (r) => [{ key: 'lineout.winRate', value: 1, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.5, evidenceId: r.id }] }
  const badNote = { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
    normalize: (r) => [{ key: 'bad key', value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: r.id }] }
  const registry = createNormalizerRegistry([frame, badNote])
  const records = [
    rec('ev_a'), rec('ev_b'),
    rec('ev_unknown', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE }),
    rec('ev_bad', { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE }),
  ]
  const ctx = { now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' }
  const appPlan = planNormalizationApplication(planBatchNormalization(registry, records, ctx))
  const r = reweight(appPlan.accepted, records)
  const ids = r.proposals.flatMap(p => [p.recordId, ...p.supportingDuplicates])
  assert.deepEqual(ids.sort(), ['ev_a', 'ev_b'])
  assert.equal(ids.includes('ev_unknown'), false)
  assert.equal(ids.includes('ev_bad'), false)
})

// ── immutability + no mutation ──────────────────────────────────────────────────────

test('result deeply frozen; input not mutated', () => {
  const accepted = [acc('ev_1', 'k.a', 0.5, 0), acc('ev_2', 'k.a', 0.5, 1)]
  const records = [rec('ev_1'), rec('ev_2')]
  const { groups } = deriveDedupeGroups({ accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  const snap = JSON.stringify({ proposals, accepted })
  const r = deriveConfidenceReweightProposals({ proposals, accepted })
  assert.ok(Object.isFrozen(r) && r.proposals.every(p => Object.isFrozen(p) && Object.isFrozen(p.supportingDuplicates)))
  assert.throws(() => r.proposals.push({}))
  assert.equal(JSON.stringify({ proposals, accepted }), snap)
})

test('malformed input throws TypeError (programmer error)', () => {
  assert.throws(() => deriveConfidenceReweightProposals({ proposals: 'x', accepted: [] }), TypeError)
  assert.throws(() => deriveConfidenceReweightProposals({ proposals: [], accepted: 'x' }), TypeError)
})

// ── deduplicate stage exposes the deferred reweight ─────────────────────────────────

test('deduplicate stage — reweight() returns a DEFERRED proposal report; run() unchanged', () => {
  const dedupe = STAGE_BY_NAME.deduplicate
  assert.deepEqual(dedupe.run().output, { isDuplicate: false, dedupeKey: null })
  const out = dedupe.reweight({ accepted: [acc('ev_1', 'k.a', 0.5, 0), acc('ev_2', 'k.a', 0.5, 1)], records: [rec('ev_1'), rec('ev_2')] })
  assert.equal(out.stage, 'deduplicate')
  assert.equal(out.status, 'deferred')
  assert.equal(out.output.proposals[0].recordId, 'ev_1')
  assert.ok(out.output.proposals[0].proposedConfidence > 0.5)
  assert.ok(Object.isFrozen(out))
})
