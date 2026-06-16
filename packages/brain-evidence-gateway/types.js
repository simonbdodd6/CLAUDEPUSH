/**
 * @brain/evidence-gateway — type surface (M45)
 *
 * JSDoc typedefs for the gateway contract. DOCUMENTATION ONLY — no runtime values.
 *
 * @typedef {import('@brain/evidence-contracts').EvidenceRecord} EvidenceRecord
 * @typedef {import('@brain/evidence-contracts').Tenant} Tenant
 */

/**
 * The immutable object threaded through the pipeline.
 * @typedef {Object} GatewayContext
 * @property {string|null} ingestRunId  caller-supplied run id (no clock/randomness here)
 * @property {Tenant|null} tenant        the tenant scope — validated FIRST
 * @property {object|null} submission    the raw inbound submission ({ sourceType, raw, … })
 */

/**
 * The deterministic result of one stage.
 * @typedef {Object} StageResult
 * @property {string} stage
 * @property {'ok'|'deferred'} status    'ok' = receive/validate; 'deferred' = placeholder
 * @property {object} output             frozen, stage-specific contract (empty in M45)
 */

/**
 * One pipeline stage.
 * @typedef {Object} GatewayStage
 * @property {string} name
 * @property {(context:GatewayContext) => StageResult} run   pure; deterministic
 */

/**
 * The deterministic result of a full pipeline run.
 * @typedef {Object} GatewayResult
 * @property {string|null} ingestRunId
 * @property {Tenant|null} tenant
 * @property {boolean} ok
 * @property {string[]} stages           the canonical stage order that ran
 * @property {StageResult[]} results
 */

/**
 * The Evidence Gateway — the write-side composition root.
 * @typedef {Object} EvidenceGateway
 * @property {object|null} store         injected store (future use; not called in M45)
 * @property {string[]} stages           canonical pipeline order
 * @property {(input:GatewayContext|object) => Promise<GatewayResult>} submit
 */

export {}
