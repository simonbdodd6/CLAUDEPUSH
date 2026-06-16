/**
 * @brain/evidence-gateway — the Evidence Gateway (M45, DORMANT)
 *
 * The write-side composition root: it sits between evidence sources and the
 * Evidence Store and defines the deterministic ingestion pipeline. It runs the
 * fixed stage registry in order; `validate` enforces strict tenant scoping FIRST,
 * and every substantive stage is a deferred placeholder (no work, no persistence).
 *
 * An Evidence Store may be injected for the FUTURE (when stages do real work), but
 * M45 NEVER calls a store persistence method — the gateway writes nothing. The
 * only dependencies are @brain/evidence-store (pure `assertTenant`, via the stages)
 * and @brain/evidence-contracts (the contract version). No engines, no Core, no
 * I/O, no LLM, no randomness, no clock.
 */

import { EVIDENCE_GATEWAY_STAGES, EVIDENCE_GATEWAY_STAGE_NAMES } from './registry.js'
import { createGatewayContext, isGatewayContext } from './context.js'

/**
 * Build the dormant Evidence Gateway.
 *
 * @param {{ store?: object|null, onStage?: ((name:string)=>void)|null }} [deps]
 *   store   — an @brain/evidence-store instance, held for future use (NEVER called
 *             for persistence in M45)
 *   onStage — optional observability hook, invoked with each stage name BEFORE it
 *             runs (pure DI; default off — used by tests to prove stage order)
 * @returns {Readonly<import('./types.js').EvidenceGateway>}
 */
export function createEvidenceGateway({ store = null, onStage = null } = {}) {
  const hook = typeof onStage === 'function' ? onStage : null

  return Object.freeze({
    /** Held for a future milestone's real stages; not called for persistence in M45. */
    store,
    /** The canonical pipeline order. */
    stages: EVIDENCE_GATEWAY_STAGE_NAMES,

    /**
     * Run the pipeline for one submission. Deterministic; tenant-validated first.
     * @param {import('./types.js').GatewayContext|object} input
     * @returns {Promise<Readonly<import('./types.js').GatewayResult>>}
     */
    async submit(input) {
      const context = isGatewayContext(input) ? input : createGatewayContext(input)
      const results = []
      for (const stage of EVIDENCE_GATEWAY_STAGES) {
        if (hook) hook(stage.name)
        results.push(stage.run(context))   // `validate` throws invalid_tenant → halts the pipeline
      }
      return Object.freeze({
        ingestRunId: context.ingestRunId,
        tenant: context.tenant,
        ok: true,
        stages: EVIDENCE_GATEWAY_STAGE_NAMES,
        results: Object.freeze(results),
      })
    },
  })
}
