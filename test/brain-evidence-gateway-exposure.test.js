/**
 * M63 — Evidence Gateway prepareEngineExposure stage contract tests
 *
 * Deterministic tests for the dormant, data-only EngineExposurePlan: empty, single /
 * multiple accepted signals, required fields, proposed confidence (reweighted vs own),
 * memory-link + audit references, unknown/invalid exclusion, deterministic ordering,
 * immutability, no mutation, no engine calls, and the stage's deferred output. Upstream
 * plans are reused (not recomputed).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveDedupeGroups, deriveProvenanceProposals, deriveConfidenceReweightProposals,
  deriveConfidenceUpdatePlan, deriveMemoryLinkPlan, deriveAuditPlan, deriveEngineExposurePlan,
  STAGE_BY_NAME,
} from '@brain/evidence-gateway'
import {
  createNormalizerRegistry, planBatchNormalization, planNormalizationApplication,
} from '@brain/evidence-normalization'
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

// full pipeline → exposure plan
function exposureFor(records) {
  const applicationPlan = planNormalizationApplication(planBatchNormalization(REGISTRY, records, NCTX))
  const accepted = applicationPlan.accepted
  const { groups } = deriveDedupeGroups({ accepted, records })
  const { proposals } = deriveProvenanceProposals({ groups, records })
  const { proposals: reweightProposals } = deriveConfidenceReweightProposals({ proposals, accepted })
  const confidenceUpdatePlan = deriveConfidenceUpdatePlan({ reweightProposals, records })
  const memoryLinkPlan = deriveMemoryLinkPlan({ accepted, records, proposals })
  const auditPlan = deriveAuditPlan({ applicationPlan, confidenceUpdatePlan, memoryLinkPlan, proposals, records, context: NCTX })
  return { applicationPlan, confidenceUpdatePlan, memoryLinkPlan, auditPlan, accepted,
    plan: deriveEngineExposurePlan({ accepted, records, confidenceUpdatePlan, memoryLinkPlan, auditPlan }) }
}

// ── empty ─────────────────────────────────────────────────────────────────────────

test('empty exposure plan — nothing exposed, frozen', () => {
  const r = deriveEngineExposurePlan({ accepted: [], records: [] })
  assert.deepEqual(r, { exposed: false, entries: [], count: 0, problems: [] })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.entries))
})

// ── single accepted signal ──────────────────────────────────────────────────────────

test('single accepted signal — entry carries all required fields', () => {
  const { plan } = exposureFor([rec('ev_1')])
  assert.equal(plan.exposed, true)
  assert.equal(plan.count, 1)
  const e = plan.entries[0]
  assert.equal(e.tenant, TENANT)
  assert.equal(e.subjectId, 'player-9')
  assert.equal(e.signalKey, 'lineout.winRate')
  assert.equal(e.value, 0.82)                          // normalized value
  assert.equal(e.proposedConfidence, 0.5)              // no duplicates → signal's own confidence
  assert.equal(e.evidenceId, 'ev_1')
  assert.equal(e.sourceType, SOURCE_TYPE.PROVIDER_FRAME_SPORTS)
  assert.deepEqual(e.memoryLink, { evidenceId: 'ev_1', subjectId: 'player-9' })   // ref available
  assert.equal(e.auditRef.evidenceId, 'ev_1')          // audit ref available
  assert.ok(e.auditRef.entries > 0)
})

// ── reweighted proposed confidence used when available ──────────────────────────────

test('proposed confidence uses the M60 reweighted value when a duplicate exists', () => {
  const { plan, confidenceUpdatePlan } = exposureFor([rec('ev_1'), rec('ev_2')])   // duplicates → reweight
  const canonical = plan.entries.find(e => e.evidenceId === 'ev_1')
  const upd = confidenceUpdatePlan.updates.find(u => u.evidenceId === 'ev_1' && u.signalKey === 'lineout.winRate')
  assert.ok(upd)                                       // there IS a reweight for the canonical
  assert.equal(canonical.proposedConfidence, upd.proposedConfidence)   // exposure uses it
  assert.ok(canonical.proposedConfidence > 0.5)
})

// ── multiple accepted signals + ordering ────────────────────────────────────────────

test('multiple accepted signals — order preserved (accepted order, then signal order)', () => {
  const multi = { sourceType: SOURCE_TYPE.PROVIDER_VIDEO, version: '1.0',
    normalize: (r) => [
      { key: 'a.one', value: 1, unit: null, polarity: null, confidence: 0.4, evidenceId: r.id },
      { key: 'a.two', value: 2, unit: null, polarity: null, confidence: 0.4, evidenceId: r.id },
    ] }
  const registry = createNormalizerRegistry([multi])
  const records = [rec('ev_1', { sourceType: SOURCE_TYPE.PROVIDER_VIDEO }), rec('ev_2', { sourceType: SOURCE_TYPE.PROVIDER_VIDEO, subjectId: 'player-10' })]
  const applicationPlan = planNormalizationApplication(planBatchNormalization(registry, records, NCTX))
  const r = deriveEngineExposurePlan({ accepted: applicationPlan.accepted, records })
  assert.deepEqual(r.entries.map(e => [e.evidenceId, e.signalKey]),
    [['ev_1', 'a.one'], ['ev_1', 'a.two'], ['ev_2', 'a.one'], ['ev_2', 'a.two']])
})

// ── exclusion ───────────────────────────────────────────────────────────────────────

test('unknown_source / invalid_signals excluded from exposure', () => {
  const { plan } = exposureFor([
    rec('ev_ok'),
    rec('ev_unknown', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE }),
    rec('ev_bad', { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE }),
  ])
  assert.deepEqual(plan.entries.map(e => e.evidenceId), ['ev_ok'])
})

// ── refs absent when upstream plans omitted ─────────────────────────────────────────

test('memory/audit refs are null when those plans are not supplied', () => {
  const applicationPlan = planNormalizationApplication(planBatchNormalization(REGISTRY, [rec('ev_1')], NCTX))
  const r = deriveEngineExposurePlan({ accepted: applicationPlan.accepted, records: [rec('ev_1')] })
  assert.equal(r.entries[0].memoryLink, null)
  assert.equal(r.entries[0].auditRef, null)
  assert.equal(r.entries[0].proposedConfidence, 0.5)   // falls back to signal confidence
})

// ── immutability + determinism + no engine ──────────────────────────────────────────

test('result deeply frozen; input not mutated', () => {
  const records = [rec('ev_1')]
  const applicationPlan = planNormalizationApplication(planBatchNormalization(REGISTRY, records, NCTX))
  const accepted = applicationPlan.accepted
  const snap = JSON.stringify({ accepted, records })
  const r = deriveEngineExposurePlan({ accepted, records })
  assert.ok(Object.isFrozen(r) && r.entries.every(e => Object.isFrozen(e)))
  assert.throws(() => r.entries.push({}))
  assert.equal(JSON.stringify({ accepted, records }), snap)
})

test('deterministic — identical input → identical exposure plan', () => {
  const a = exposureFor([rec('ev_1'), rec('ev_2')]).plan
  const b = exposureFor([rec('ev_1'), rec('ev_2')]).plan
  assert.deepEqual(a, b)
})

test('malformed input throws TypeError (programmer error)', () => {
  assert.throws(() => deriveEngineExposurePlan({ accepted: 'x', records: [] }), TypeError)
  assert.throws(() => deriveEngineExposurePlan({ accepted: [], records: 'x' }), TypeError)
})

// ── stage exposes the deferred plan ─────────────────────────────────────────────────

test('prepareEngineExposure stage — plan() returns a DEFERRED exposure plan; run() unchanged', () => {
  const stage = STAGE_BY_NAME.prepareEngineExposure
  assert.deepEqual(stage.run().output, { exposed: false })
  const out = stage.plan({ registry: REGISTRY, records: [rec('ev_1'), rec('ev_2')], context: NCTX })
  assert.equal(out.stage, 'prepareEngineExposure')
  assert.equal(out.status, 'deferred')
  assert.equal(out.output.exposed, true)
  assert.ok(out.output.entries.every(e => e.tenant === TENANT && e.subjectId === 'player-9'))
  // canonical entry carries memory + audit refs (full pipeline composed)
  const canonical = out.output.entries.find(e => e.evidenceId === 'ev_1')
  assert.ok(canonical.memoryLink && canonical.auditRef)
  assert.ok(Object.isFrozen(out))
})
