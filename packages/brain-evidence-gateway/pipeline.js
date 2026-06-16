/**
 * @brain/evidence-gateway — full pipeline plan (M64, DORMANT, pure composition)
 *
 * A single composition helper that runs the entire dormant pipeline end-to-end and
 * returns ONE immutable PipelinePlan. It is PURE COMPOSITION ONLY — it introduces no
 * new calculation: every plan is produced by the SAME helper already built for its
 * stage, computed EXACTLY ONCE and threaded forward (no stage recomputes another's
 * work, so there is no duplicated logic).
 *
 * Canonical order (receive → validate → normalize → deduplicate → prepareConfidenceUpdate
 * → prepareMemoryLink → prepareAudit → prepareEngineExposure):
 *   - receive  : reuses the receive stage (pure echo of the gateway context);
 *   - validate : the submission tenant-gate carries no submission in the records-level
 *                composition, so it is a deferred marker (never throws on a tenant-less run);
 *   - normalize…engineExposure : the M54/M57–M63 data plans, each computed once.
 *
 * Reads/writes no store or graph, calls no engine, touches no runtime/browser, activates
 * no persistence. No clock, no randomness, no I/O. Result is deeply frozen; input is
 * never mutated. Depends only on @brain/evidence-normalization (+ sibling gateway modules).
 */

import { planBatchNormalization, planNormalizationApplication } from '@brain/evidence-normalization'
import { deriveDedupeGroups } from './dedupe.js'
import { deriveProvenanceProposals } from './provenance.js'
import { deriveConfidenceReweightProposals } from './reweight.js'
import { deriveConfidenceUpdatePlan } from './confidence-update.js'
import { deriveMemoryLinkPlan } from './memory-link.js'
import { deriveAuditPlan } from './audit.js'
import { deriveEngineExposurePlan } from './exposure.js'
import { receive } from './stages.js'
import { EVIDENCE_GATEWAY_STAGE_NAMES } from './registry.js'
import { createGatewayContext } from './context.js'

const stageResult = (stage, output) => Object.freeze({ stage, status: 'deferred', output: Object.freeze(output) })

/**
 * Execute the whole dormant pipeline once and bundle every stage output into one frozen
 * PipelinePlan.
 *
 * @param {{ registry: object, records: object[], context: { now:string, ingestRunId:string } }} input
 * @returns {Readonly<{
 *   deferred:true,
 *   stages: ReadonlyArray<string>,
 *   results: ReadonlyArray<Readonly<{ stage:string, status:string, output:object }>>,
 *   context: Readonly<{ ingestRunId:string|null, now:string|null }>,
 *   applicationPlan:object, dedupe:Readonly<{ groups:object, proposals:object }>,
 *   confidenceUpdatePlan:object, memoryLinkPlan:object, auditPlan:object, engineExposurePlan:object,
 *   counts: Readonly<object>
 * }>}
 */
export function prepareFullPipelinePlan({ registry = null, records = [], context = null } = {}) {
  if (!Array.isArray(records)) {
    throw new TypeError('prepareFullPipelinePlan requires { registry, records: array, context }')
  }

  // ── receive (reuse the stage) — pure echo of the gateway context
  const gatewayContext = createGatewayContext({
    ingestRunId: context && typeof context.ingestRunId === 'string' ? context.ingestRunId : undefined,
    normalization: { registry, records, context },
  })
  const receiveResult = receive.run(gatewayContext)

  // ── normalize → engine exposure: each plan computed EXACTLY ONCE, threaded forward
  const applicationPlan = planNormalizationApplication(planBatchNormalization(registry, records, context))
  const accepted = applicationPlan.accepted

  const dedupe = deriveDedupeGroups({ accepted, records })
  const provenance = deriveProvenanceProposals({ groups: dedupe.groups, records })
  const reweight = deriveConfidenceReweightProposals({ proposals: provenance.proposals, accepted })
  const confidenceUpdatePlan = deriveConfidenceUpdatePlan({ reweightProposals: reweight.proposals, records })
  const memoryLinkPlan = deriveMemoryLinkPlan({ accepted, records, proposals: provenance.proposals })
  const auditPlan = deriveAuditPlan({ applicationPlan, confidenceUpdatePlan, memoryLinkPlan, proposals: provenance.proposals, records, context })
  const engineExposurePlan = deriveEngineExposurePlan({ accepted, records, confidenceUpdatePlan, memoryLinkPlan, auditPlan })

  // ── ordered per-stage results (canonical order)
  const results = Object.freeze([
    receiveResult,
    stageResult('validate', { tenantValid: null }),                 // no submission to gate in this composition
    stageResult('normalize', { applicationPlan }),
    stageResult('deduplicate', { groups: dedupe.groups, proposals: provenance.proposals }),
    stageResult('prepareConfidenceUpdate', { confidenceUpdatePlan }),
    stageResult('prepareMemoryLink', { memoryLinkPlan }),
    stageResult('prepareAudit', { auditPlan }),
    stageResult('prepareEngineExposure', { engineExposurePlan }),
  ])

  return Object.freeze({
    deferred: true,
    stages: EVIDENCE_GATEWAY_STAGE_NAMES,
    results,
    context: Object.freeze({
      ingestRunId: context && typeof context.ingestRunId === 'string' ? context.ingestRunId : null,
      now: context && typeof context.now === 'string' ? context.now : null,
    }),
    applicationPlan,
    dedupe: Object.freeze({ groups: dedupe.groups, proposals: provenance.proposals }),
    confidenceUpdatePlan,
    memoryLinkPlan,
    auditPlan,
    engineExposurePlan,
    counts: Object.freeze({
      records: records.length,
      accepted: applicationPlan.counts.accepted,
      unknownSource: applicationPlan.counts.unknown_source,
      invalidSignals: applicationPlan.counts.invalid_signals,
      dedupeGroups: dedupe.groups.length,
      collapses: provenance.collapses,
      confidenceUpdates: confidenceUpdatePlan.count,
      memoryNodes: memoryLinkPlan.counts.evidence,
      memoryEdges: memoryLinkPlan.counts.edges,
      auditEntries: auditPlan.count,
      exposed: engineExposurePlan.count,
    }),
  })
}
