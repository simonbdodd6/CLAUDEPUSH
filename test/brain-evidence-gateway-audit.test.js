/**
 * M62 — Evidence Gateway prepareAudit stage contract tests
 *
 * Deterministic tests for the dormant, data-only AuditPlan: empty, accepted-record
 * transitions, rejected (unknown_source / invalid_signals), required entry fields,
 * timestamp from the supplied NormalizationContext, deterministic ordering,
 * immutability, no mutation, and the stage's deferred output. Upstream plans are reused
 * (not recomputed).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveDedupeGroups, deriveProvenanceProposals, deriveConfidenceReweightProposals,
  deriveConfidenceUpdatePlan, deriveMemoryLinkPlan, deriveAuditPlan, AUDIT_PLAN_ACTION,
  STAGE_BY_NAME,
} from '@brain/evidence-gateway'
import {
  createNormalizerRegistry, planBatchNormalization, planNormalizationApplication,
} from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY, AUDIT_ACTION } from '@brain/evidence-contracts'

const TENANT = Object.freeze({ clubId: 'c1', teamId: 't1', seasonId: 's1' })
const NCTX = Object.freeze({ now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' })
const rec = (id, over = {}) => Object.freeze({
  id, tenant: TENANT, subjectType: 'player', subjectId: 'player-9',
  sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, observedAt: '2026-06-16T09:30:00.000Z', confidence: 0.8, ...over,
})

const frame = { sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
  normalize: (r) => [{ key: 'lineout.winRate', value: 1, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.5, evidenceId: r.id }] }
const badNote = { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
  normalize: (r) => [{ key: 'bad key', value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: r.id }] }
const REGISTRY = createNormalizerRegistry([frame, badNote])

// build all upstream plans for a set of records, then the audit plan
function auditFor(records) {
  const applicationPlan = planNormalizationApplication(planBatchNormalization(REGISTRY, records, NCTX))
  const accepted = applicationPlan.accepted
  const { groups } = deriveDedupeGroups({ accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  const { proposals: reweightProposals } = deriveConfidenceReweightProposals({ proposals, accepted })
  const confidenceUpdatePlan = deriveConfidenceUpdatePlan({ reweightProposals, records })
  const memoryLinkPlan = deriveMemoryLinkPlan({ accepted, records, proposals })
  return deriveAuditPlan({ applicationPlan, confidenceUpdatePlan, memoryLinkPlan, proposals, records, context: NCTX })
}
const actionsFor = (plan, evidenceId) => plan.entries.filter(e => e.evidenceId === evidenceId).map(e => e.action)

// ── empty ─────────────────────────────────────────────────────────────────────────

test('empty application plan — no entries, frozen', () => {
  const r = deriveAuditPlan({ applicationPlan: { accepted: [], unknownSource: [], invalidSignals: [] }, proposals: [], records: [], context: NCTX })
  assert.deepEqual(r.entries, [])
  assert.equal(r.count, 0)
  assert.equal(r.at, NCTX.now)
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.entries))
})

// ── accepted-record transitions ─────────────────────────────────────────────────────

test('accepted record with a duplicate — full transition trail incl. deduplicated/linked/reweighted/accepted', () => {
  const plan = auditFor([rec('ev_1'), rec('ev_2')])   // two duplicates → ev_1 canonical
  // canonical ev_1: received, validated, normalized, deduplicated, linked, reweighted, accepted
  assert.deepEqual(actionsFor(plan, 'ev_1'), [
    AUDIT_ACTION.RECEIVED, AUDIT_ACTION.VALIDATED, AUDIT_ACTION.NORMALIZED,
    AUDIT_ACTION.DEDUPLICATED, AUDIT_ACTION.LINKED, AUDIT_ACTION.REWEIGHTED, AUDIT_PLAN_ACTION.ACCEPTED,
  ])
  // duplicate ev_2: received, validated, normalized, deduplicated, linked, accepted (no reweight — not canonical)
  assert.deepEqual(actionsFor(plan, 'ev_2'), [
    AUDIT_ACTION.RECEIVED, AUDIT_ACTION.VALIDATED, AUDIT_ACTION.NORMALIZED,
    AUDIT_ACTION.DEDUPLICATED, AUDIT_ACTION.LINKED, AUDIT_PLAN_ACTION.ACCEPTED,
  ])
})

test('single accepted record, no duplicates — received, validated, normalized, linked, accepted', () => {
  const plan = auditFor([rec('ev_solo')])
  assert.deepEqual(actionsFor(plan, 'ev_solo'), [
    AUDIT_ACTION.RECEIVED, AUDIT_ACTION.VALIDATED, AUDIT_ACTION.NORMALIZED, AUDIT_ACTION.LINKED, AUDIT_PLAN_ACTION.ACCEPTED,
  ])
})

// ── rejected records ────────────────────────────────────────────────────────────────

test('unknown_source record — received, validated, rejected', () => {
  const plan = auditFor([rec('ev_u', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE })])
  assert.deepEqual(actionsFor(plan, 'ev_u'), [AUDIT_ACTION.RECEIVED, AUDIT_ACTION.VALIDATED, AUDIT_ACTION.REJECTED])
})

test('invalid_signals record — received, validated, normalized, rejected', () => {
  const plan = auditFor([rec('ev_b', { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE })])
  assert.deepEqual(actionsFor(plan, 'ev_b'), [AUDIT_ACTION.RECEIVED, AUDIT_ACTION.VALIDATED, AUDIT_ACTION.NORMALIZED, AUDIT_ACTION.REJECTED])
})

// ── required fields + timestamp ─────────────────────────────────────────────────────

test('every entry carries tenant, subjectId, evidenceId, stage, action, outcome, at', () => {
  const plan = auditFor([rec('ev_1')])
  for (const e of plan.entries) {
    assert.equal(e.evidenceId, 'ev_1')
    assert.equal(e.tenant, TENANT)
    assert.equal(e.subjectId, 'player-9')
    assert.equal(typeof e.stage, 'string')
    assert.equal(typeof e.action, 'string')
    assert.equal(e.outcome, 'deferred')          // dormant — nothing applied
    assert.equal(e.at, NCTX.now)                  // timestamp from the supplied context
  }
})

test('timestamp comes only from the supplied context (no clock); absent context → at null', () => {
  const ap = { accepted: [{ recordId: 'ev_1' }], unknownSource: [], invalidSignals: [] }
  const withCtx = deriveAuditPlan({ applicationPlan: ap, proposals: [], records: [rec('ev_1')], context: { now: '2026-01-02T03:04:05.000Z' } })
  assert.ok(withCtx.entries.every(e => e.at === '2026-01-02T03:04:05.000Z'))
  const noCtx = deriveAuditPlan({ applicationPlan: ap, proposals: [], records: [rec('ev_1')] })
  assert.ok(noCtx.entries.every(e => e.at === null))
  assert.equal(noCtx.at, null)
})

// ── ordering + counts ───────────────────────────────────────────────────────────────

test('deterministic ordering — accepted first, then unknown_source, then invalid_signals', () => {
  const plan = auditFor([
    rec('ev_ok'),
    rec('ev_u', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE }),
    rec('ev_b', { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE }),
  ])
  const firstSeen = []
  for (const e of plan.entries) if (!firstSeen.includes(e.evidenceId)) firstSeen.push(e.evidenceId)
  assert.deepEqual(firstSeen, ['ev_ok', 'ev_u', 'ev_b'])
  assert.ok(plan.byAction[AUDIT_ACTION.REJECTED] >= 2)   // unknown + invalid both rejected
  assert.equal(plan.byAction[AUDIT_PLAN_ACTION.ACCEPTED], 1)
})

// ── immutability + determinism ──────────────────────────────────────────────────────

test('result deeply frozen; input not mutated', () => {
  const records = [rec('ev_1'), rec('ev_2')]
  const applicationPlan = planNormalizationApplication(planBatchNormalization(REGISTRY, records, NCTX))
  const { groups } = deriveDedupeGroups({ accepted: applicationPlan.accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  const snap = JSON.stringify({ applicationPlan, proposals, records })
  const r = deriveAuditPlan({ applicationPlan, proposals, records, context: NCTX })
  assert.ok(Object.isFrozen(r) && r.entries.every(e => Object.isFrozen(e)))
  assert.throws(() => r.entries.push({}))
  assert.equal(JSON.stringify({ applicationPlan, proposals, records }), snap)
})

test('deterministic — identical input → identical audit plan', () => {
  const records = [rec('ev_1'), rec('ev_2')]
  assert.deepEqual(auditFor(records), auditFor(records))
})

test('malformed input throws TypeError (programmer error)', () => {
  assert.throws(() => deriveAuditPlan({ applicationPlan: null }), TypeError)
  assert.throws(() => deriveAuditPlan({ applicationPlan: {}, proposals: 'x', records: [] }), TypeError)
})

// ── stage exposes the deferred plan ─────────────────────────────────────────────────

test('prepareAudit stage — plan() returns a DEFERRED audit plan; run() unchanged', () => {
  const stage = STAGE_BY_NAME.prepareAudit
  assert.deepEqual(stage.run().output, { entries: [] })
  const out = stage.plan({ registry: REGISTRY, records: [rec('ev_1'), rec('ev_2')], context: NCTX })
  assert.equal(out.stage, 'prepareAudit')
  assert.equal(out.status, 'deferred')
  assert.ok(out.output.entries.length > 0)
  assert.ok(out.output.entries.every(e => e.outcome === 'deferred' && e.at === NCTX.now))
  assert.ok(Object.isFrozen(out))
})
