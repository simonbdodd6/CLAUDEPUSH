/**
 * @brain/evidence-gateway — pipeline stages (M45, DORMANT)
 *
 * The eight ordered stages of the deterministic write pipeline. Each stage is a
 * pure function `run(context) -> StageResult` returning a deterministic contract
 * — NO stage performs real work in M45:
 *
 *   - `receive`  echoes the context (pure).
 *   - `validate` performs TENANT VALIDATION FIRST (the gateway's first gate),
 *     reusing @brain/evidence-store's pure `assertTenant`; throws `invalid_tenant`
 *     before any later stage runs. This is the only behaviour beyond placeholders.
 *   - every other stage is a `deferred` placeholder returning an empty, typed
 *     output contract. No normalization, no dedupe, no confidence math, no memory
 *     link, no audit write, no exposure, no storage.
 *
 * Stages import ONLY @brain/evidence-store (assertTenant) and @brain/evidence-contracts
 * (the contract version stamp). No engines, no Core, no I/O, no randomness.
 */

import { assertTenant } from '@brain/evidence-store'
import { EVIDENCE_CONTRACT_VERSION } from '@brain/evidence-contracts'
import { planBatchNormalization, planNormalizationApplication } from '@brain/evidence-normalization'
import { deriveDedupeGroups } from './dedupe.js'
import { deriveProvenanceProposals } from './provenance.js'
import { deriveConfidenceReweightProposals } from './reweight.js'
import { deriveConfidenceUpdatePlan } from './confidence-update.js'
import { deriveMemoryLinkPlan } from './memory-link.js'

const ok = (stage, output) => Object.freeze({ stage, status: 'ok', output: Object.freeze(output) })
const deferred = (stage, output) => Object.freeze({ stage, status: 'deferred', output: Object.freeze(output) })

/** 1 — receive: wrap the inbound submission (pure echo). */
export const receive = Object.freeze({
  name: 'receive',
  run(ctx) {
    return ok('receive', {
      ingestRunId: ctx.ingestRunId,
      tenant: ctx.tenant,
      submission: ctx.submission,
      evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
    })
  },
})

/** 2 — validate: TENANT VALIDATION FIRST. Throws invalid_tenant before later stages. */
export const validate = Object.freeze({
  name: 'validate',
  run(ctx) {
    assertTenant(ctx.tenant)            // first gate — strict tenant scoping (§4.6)
    return ok('validate', { tenantValid: true })
  },
})

/**
 * Build the deferred ApplicationPlan output from injected normalization inputs, via
 * the existing M53/M54 helpers (no duplicated logic). Writes nothing; never advances
 * to `deduplicate`; never mutates its input.
 */
function buildNormalizeApplicationPlan({ registry, records, context } = {}) {
  const batch = planBatchNormalization(registry, records, context)
  const applicationPlan = planNormalizationApplication(batch)
  return deferred('normalize', { applicationPlan })
}

/**
 * 3 — normalize: raw → NormalizedSignal[].
 *
 * Dormant. `run(context)`: when the GatewayContext carries `normalization`
 * (`{ registry, records, context }`, threaded through `submit()` in M56) it emits the
 * deferred M54 ApplicationPlan INSIDE the ordered pipeline result; otherwise it stays
 * the inert placeholder (empty signals) so existing `submit()` behaviour is unchanged.
 * `plan(input)` is the M55 direct-call API (same helper). Both describe exactly what
 * WOULD be forwarded to the Evidence Store — they write NOTHING, never advance to
 * `deduplicate`, never mutate input; unknown sources / invalid signals stay structured
 * data inside the plan.
 */
export const normalize = Object.freeze({
  name: 'normalize',
  run(context) {
    const n = context && context.normalization
    if (n) return buildNormalizeApplicationPlan(n)
    return deferred('normalize', { signals: Object.freeze([]) })
  },
  plan(input) { return buildNormalizeApplicationPlan(input) },
})

/**
 * 4 — deduplicate: collapse repeats by a deterministic §3.4 key.
 *
 * Dormant. `run()` stays the inert placeholder (no work) so end-to-end `submit()` is
 * unchanged. `groups({ accepted, records })` is the M57 DATA-ONLY contract: it derives
 * §3.4 dedupe keys over the ACCEPTED entries of an ApplicationPlan and returns a
 * DEFERRED grouping report of which signals WOULD collapse. `provenance({ accepted,
 * records })` is the M58 DATA-ONLY contract: it folds those groups into deferred
 * provenance-link PROPOSALS (canonical + derivedFrom/supersedes patches the duplicates
 * WOULD receive). `reweight({ accepted, records })` is the M59 DATA-ONLY contract: it
 * folds those proposals into deferred CONFIDENCE-REWEIGHT proposals (the aggregate
 * confidence each canonical signal WOULD carry, via @brain/evidence-weighting). All
 * collapse/link/reweight/store NOTHING, never mutate input; unknown sources / invalid
 * signals are not in `accepted`, so they never enter a group, proposal or reweight.
 */
export const deduplicate = Object.freeze({
  name: 'deduplicate',
  run() { return deferred('deduplicate', { isDuplicate: false, dedupeKey: null }) },
  groups(input) { return deferred('deduplicate', deriveDedupeGroups(input)) },
  provenance(input) {
    const { groups } = deriveDedupeGroups(input)
    const records = input && Array.isArray(input.records) ? input.records : []
    return deferred('deduplicate', deriveProvenanceProposals({ groups, records }))
  },
  reweight(input) {
    const { groups } = deriveDedupeGroups(input)
    const records = input && Array.isArray(input.records) ? input.records : []
    const accepted = input && Array.isArray(input.accepted) ? input.accepted : []
    const { proposals } = deriveProvenanceProposals({ groups, records })
    return deferred('deduplicate', deriveConfidenceReweightProposals({ proposals, accepted }))
  },
})

/**
 * 5 — prepare confidence update: per (subject, signal.key) reweight plan (§3.6).
 *
 * Dormant. `run()` stays the inert placeholder (empty updates) so end-to-end `submit()`
 * is unchanged. `plan({ accepted, records })` is the M60 DATA-ONLY contract: it composes
 * the dedupe chain (groups → provenance → reweight, M57–M59) and folds the M59 reweight
 * proposals into a deferred ConfidenceUpdatePlan — the per-(subject, signal.key) "set
 * confidence to X" instructions the store WOULD apply, each carrying the §4.6 tenant
 * scope. It applies/writes NOTHING, never mutates input; unknown sources / invalid
 * signals are not in `accepted`, so they never produce an update.
 */
export const prepareConfidenceUpdate = Object.freeze({
  name: 'prepareConfidenceUpdate',
  run() { return deferred('prepareConfidenceUpdate', { updates: Object.freeze([]) }) },
  plan(input) {
    const records = input && Array.isArray(input.records) ? input.records : []
    const accepted = input && Array.isArray(input.accepted) ? input.accepted : []
    const { groups } = deriveDedupeGroups({ accepted, records })
    const { proposals } = deriveProvenanceProposals({ groups, records })
    const { proposals: reweightProposals } = deriveConfidenceReweightProposals({ proposals, accepted })
    return deferred('prepareConfidenceUpdate', deriveConfidenceUpdatePlan({ reweightProposals, records }))
  },
})

/**
 * 6 — prepare memory link: knowledge-graph upserts (§3.5).
 *
 * Dormant. `run()` stays the inert placeholder (no nodes/edges) so end-to-end
 * `submit()` is unchanged. `plan({ accepted, records })` is the M61 DATA-ONLY contract:
 * it composes the dedupe chain (groups → provenance, M57–M58) and assembles a deferred
 * MemoryLinkPlan — the subject/evidence nodes, `about` edges and dedupe
 * derivedFrom/supersedes edges the graph WOULD receive. It reads/writes NO graph,
 * creates nothing, never mutates input; unknown sources / invalid signals are not in
 * `accepted`, so they never produce a node or edge.
 */
export const prepareMemoryLink = Object.freeze({
  name: 'prepareMemoryLink',
  run() { return deferred('prepareMemoryLink', { nodes: Object.freeze([]), edges: Object.freeze([]) }) },
  plan(input) {
    const records = input && Array.isArray(input.records) ? input.records : []
    const accepted = input && Array.isArray(input.accepted) ? input.accepted : []
    const { groups } = deriveDedupeGroups({ accepted, records })
    const { proposals } = deriveProvenanceProposals({ groups, records })
    return deferred('prepareMemoryLink', deriveMemoryLinkPlan({ accepted, records, proposals }))
  },
})

/** 7 — prepare audit: append-only audit entries (deferred placeholder). */
export const prepareAudit = Object.freeze({
  name: 'prepareAudit',
  run() { return deferred('prepareAudit', { entries: Object.freeze([]) }) },
})

/** 8 — prepare engine exposure: signals the engines may later read (deferred placeholder). */
export const prepareEngineExposure = Object.freeze({
  name: 'prepareEngineExposure',
  run() { return deferred('prepareEngineExposure', { exposed: false }) },
})
