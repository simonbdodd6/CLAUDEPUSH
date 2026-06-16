/**
 * M60 — Evidence Gateway prepareConfidenceUpdate stage contract tests
 *
 * Deterministic tests for the dormant, data-only ConfidenceUpdatePlan derived from M59
 * reweight proposals + records: empty, single update, multiple updates preserve order,
 * bounds respected, supporting duplicate ids preserved, current/proposed/delta carried,
 * tenant/subject/signal.key present, immutability, no mutation, and the stage's deferred
 * output. No weighting maths is recomputed here (M59 values reused verbatim).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveDedupeGroups, deriveProvenanceProposals, deriveConfidenceReweightProposals,
  deriveConfidenceUpdatePlan, STAGE_BY_NAME,
} from '@brain/evidence-gateway'
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
// full composition: accepted → dedupe → provenance → reweight → confidence-update
const updatePlan = (accepted, records) => {
  const { groups } = deriveDedupeGroups({ accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  const { proposals: reweightProposals } = deriveConfidenceReweightProposals({ proposals, accepted })
  return deriveConfidenceUpdatePlan({ reweightProposals, records })
}

// ── empty ─────────────────────────────────────────────────────────────────────────

test('empty reweight proposals — empty update plan, frozen', () => {
  const r = deriveConfidenceUpdatePlan({ reweightProposals: [], records: [] })
  assert.deepEqual(r, { updates: [], count: 0, problems: [] })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.updates))
})

// ── single update instruction ───────────────────────────────────────────────────────

test('single confidence-update instruction carries all required fields', () => {
  const accepted = [acc('ev_1', 'lineout.winRate', 0.5, 0), acc('ev_2', 'lineout.winRate', 0.5, 1)]
  const records = [rec('ev_1'), rec('ev_2')]
  const r = updatePlan(accepted, records)
  assert.equal(r.count, 1)
  const u = r.updates[0]
  assert.equal(u.tenant, TENANT)                        // §4.6 tenant scope
  assert.equal(u.subjectId, 'player-9')
  assert.equal(u.signalKey, 'lineout.winRate')
  assert.equal(u.evidenceId, 'ev_1')                    // canonical occurrence / evidence id
  assert.equal(u.currentConfidence, 0.5)
  assert.ok(u.proposedConfidence > 0.5)
  assert.equal(u.delta, u.proposedConfidence - u.currentConfidence)
  assert.deepEqual(u.supportingDuplicates, ['ev_2'])
})

// ── ordering preserved ──────────────────────────────────────────────────────────────

test('multiple updates preserve deterministic order (group order)', () => {
  // two distinct dedupe groups (different signal keys) each with a duplicate
  const accepted = [
    acc('ev_1a', 'a.one', 0.5, 0), acc('ev_1b', 'a.one', 0.5, 1),
    acc('ev_2a', 'b.two', 0.6, 2), acc('ev_2b', 'b.two', 0.6, 3),
  ]
  const records = accepted.map(a => rec(a.recordId))
  const r = updatePlan(accepted, records)
  assert.equal(r.count, 2)
  assert.deepEqual(r.updates.map(u => u.signalKey), ['a.one', 'b.two'])
  assert.deepEqual(r.updates.map(u => u.evidenceId), ['ev_1a', 'ev_2a'])
})

// ── bounds ──────────────────────────────────────────────────────────────────────────

test('confidence bounds respected — proposed within [0,1]', () => {
  const accepted = Array.from({ length: 10 }, (_, i) => acc(`ev_${i}`, 'k.a', 0.9, i))
  const records = accepted.map(a => rec(a.recordId))
  const r = updatePlan(accepted, records)
  assert.ok(r.updates.every(u => u.proposedConfidence >= 0 && u.proposedConfidence <= 1))
})

test('out-of-bounds proposed confidence is skipped + reported, never emitted', () => {
  // hand-crafted M59-shaped proposal with an illegal proposed confidence
  const bad = [{ key: 'k', recordId: 'ev_1', signalKey: 'k.a', currentConfidence: 0.5, proposedConfidence: 1.5, delta: 1.0, supportingDuplicates: ['ev_2'] }]
  const r = deriveConfidenceUpdatePlan({ reweightProposals: bad, records: [rec('ev_1')] })
  assert.deepEqual(r.updates, [])
  assert.equal(r.problems.length, 1)
  assert.match(r.problems[0].problem, /out of bounds/)
})

// ── reuse + invariants ──────────────────────────────────────────────────────────────

test('current/proposed/delta + supporting ids reused verbatim from the reweight proposal', () => {
  const accepted = [acc('ev_1', 'k.a', 0.5, 0), acc('ev_2', 'k.a', 0.5, 1), acc('ev_3', 'k.a', 0.5, 2)]
  const records = [rec('ev_1'), rec('ev_2'), rec('ev_3')]
  const { groups } = deriveDedupeGroups({ accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  const { proposals: reweightProposals } = deriveConfidenceReweightProposals({ proposals, accepted })
  const r = deriveConfidenceUpdatePlan({ reweightProposals, records })
  const src = reweightProposals[0], u = r.updates[0]
  assert.equal(u.currentConfidence, src.currentConfidence)
  assert.equal(u.proposedConfidence, src.proposedConfidence)
  assert.equal(u.delta, src.delta)
  assert.deepEqual(u.supportingDuplicates, src.supportingDuplicates)
})

test('record not found → problem, no instruction emitted', () => {
  const bad = [{ key: 'k', recordId: 'missing', signalKey: 'k.a', currentConfidence: 0.5, proposedConfidence: 0.58, delta: 0.08, supportingDuplicates: [] }]
  const r = deriveConfidenceUpdatePlan({ reweightProposals: bad, records: [] })
  assert.deepEqual(r.updates, [])
  assert.equal(r.problems.length, 1)
  assert.match(r.problems[0].problem, /record not found/)
})

// ── immutability + determinism ──────────────────────────────────────────────────────

test('result deeply frozen; input not mutated', () => {
  const accepted = [acc('ev_1', 'k.a', 0.5, 0), acc('ev_2', 'k.a', 0.5, 1)]
  const records = [rec('ev_1'), rec('ev_2')]
  const { groups } = deriveDedupeGroups({ accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  const { proposals: reweightProposals } = deriveConfidenceReweightProposals({ proposals, accepted })
  const snap = JSON.stringify({ reweightProposals, records })
  const r = deriveConfidenceUpdatePlan({ reweightProposals, records })
  assert.ok(Object.isFrozen(r) && r.updates.every(u => Object.isFrozen(u) && Object.isFrozen(u.supportingDuplicates)))
  assert.throws(() => r.updates.push({}))
  assert.equal(JSON.stringify({ reweightProposals, records }), snap)
})

test('deterministic — identical input → identical update plan', () => {
  const accepted = [acc('ev_1', 'k.a', 0.5, 0), acc('ev_2', 'k.a', 0.5, 1)]
  const records = [rec('ev_1'), rec('ev_2')]
  assert.deepEqual(updatePlan(accepted, records), updatePlan(accepted, records))
})

test('malformed input throws TypeError (programmer error)', () => {
  assert.throws(() => deriveConfidenceUpdatePlan({ reweightProposals: 'x', records: [] }), TypeError)
  assert.throws(() => deriveConfidenceUpdatePlan({ reweightProposals: [], records: 'x' }), TypeError)
})

// ── stage exposes the deferred update plan ──────────────────────────────────────────

test('prepareConfidenceUpdate stage — plan() returns a DEFERRED update plan; run() unchanged', () => {
  const stage = STAGE_BY_NAME.prepareConfidenceUpdate
  assert.deepEqual(stage.run().output, { updates: [] })
  const out = stage.plan({ accepted: [acc('ev_1', 'k.a', 0.5, 0), acc('ev_2', 'k.a', 0.5, 1)], records: [rec('ev_1'), rec('ev_2')] })
  assert.equal(out.stage, 'prepareConfidenceUpdate')
  assert.equal(out.status, 'deferred')
  assert.equal(out.output.updates[0].evidenceId, 'ev_1')
  assert.equal(out.output.updates[0].subjectId, 'player-9')
  assert.ok(Object.isFrozen(out))
})
