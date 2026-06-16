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
 * 3 — normalize: raw → NormalizedSignal[].
 *
 * `run()` stays the inert pipeline placeholder (empty signals) so the end-to-end
 * `submit()` flow remains dormant and unchanged. `plan()` WIRES this stage to the
 * completed normalization pipeline (M50–M54): given an INJECTED normalizer registry,
 * the evidence records, and a passed-in NormalizationContext, it builds the M53 batch
 * plan and folds it into the M54 ApplicationPlan — describing exactly what WOULD be
 * forwarded to the Evidence Store. It uses the existing helpers (no duplicated logic),
 * writes NOTHING, never advances to `deduplicate`, and never mutates its input. The
 * result is a DEFERRED stage output (nothing is executed/applied). Unknown sources and
 * invalid signals stay structured data inside the plan.
 */
export const normalize = Object.freeze({
  name: 'normalize',
  run() { return deferred('normalize', { signals: Object.freeze([]) }) },
  plan({ registry, records, context } = {}) {
    const batch = planBatchNormalization(registry, records, context)
    const applicationPlan = planNormalizationApplication(batch)
    return deferred('normalize', { applicationPlan })
  },
})

/** 4 — deduplicate: collapse repeats by a deterministic key (deferred placeholder). */
export const deduplicate = Object.freeze({
  name: 'deduplicate',
  run() { return deferred('deduplicate', { isDuplicate: false, dedupeKey: null }) },
})

/** 5 — prepare confidence update: per (subject, signal) reweight plan (deferred placeholder). */
export const prepareConfidenceUpdate = Object.freeze({
  name: 'prepareConfidenceUpdate',
  run() { return deferred('prepareConfidenceUpdate', { updates: Object.freeze([]) }) },
})

/** 6 — prepare memory link: knowledge-graph upserts (deferred placeholder). */
export const prepareMemoryLink = Object.freeze({
  name: 'prepareMemoryLink',
  run() { return deferred('prepareMemoryLink', { nodes: Object.freeze([]), edges: Object.freeze([]) }) },
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
