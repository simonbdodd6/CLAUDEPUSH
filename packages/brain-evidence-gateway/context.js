/**
 * @brain/evidence-gateway — GatewayContext (M45)
 *
 * The immutable object threaded through the pipeline stages. Pure + deterministic:
 * built from caller-supplied values only — the gateway invents no ids, no clock,
 * no randomness (`ingestRunId` is supplied by the caller). No I/O.
 */

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

/**
 * Build a frozen GatewayContext. Field presence only — deep tenant/record
 * validation is the `validate` stage's job (tenant first).
 *
 * @param {{ ingestRunId?: string, tenant?: object, submission?: object }} [input]
 * @returns {Readonly<import('./types.js').GatewayContext>}
 */
export function createGatewayContext({ ingestRunId, tenant, submission } = {}) {
  return Object.freeze({
    ingestRunId: typeof ingestRunId === 'string' ? ingestRunId : null,
    tenant:      isObj(tenant) ? tenant : null,
    submission:  isObj(submission) ? submission : null,
  })
}

/** Is this value already a GatewayContext (has the three known keys)? */
export function isGatewayContext(v) {
  return isObj(v) && 'ingestRunId' in v && 'tenant' in v && 'submission' in v
}
