/**
 * @brain/evidence-gateway — GatewayContext (M45; normalization threading M56)
 *
 * The immutable object threaded through the pipeline stages. Pure + deterministic:
 * built from caller-supplied values only — the gateway invents no ids, no clock,
 * no randomness (`ingestRunId` is supplied by the caller). No I/O.
 *
 * M56 adds an optional `normalization` field. When present it carries the inputs the
 * (still dormant) `normalize` stage needs to emit a deferred ApplicationPlan inside
 * the ordered pipeline result: `{ registry, records, context }`. Absent → `null`,
 * and `submit()` behaves exactly as before (empty deferred placeholder).
 */

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

/**
 * Build a frozen GatewayContext. Field presence only — deep tenant/record validation
 * is the `validate` stage's job (tenant first); deep normalization validation is the
 * `normalize` stage's plan() helpers' job. Normalization inputs may be supplied either
 * top-level (`registry` / `records` / `normalizationContext`) or pre-nested as a
 * `normalization` object; either way they are threaded unchanged (never mutated).
 *
 * @param {{ ingestRunId?: string, tenant?: object, submission?: object, registry?: object, records?: object[], normalizationContext?: object, normalization?: object }} [input]
 * @returns {Readonly<import('./types.js').GatewayContext>}
 */
export function createGatewayContext({ ingestRunId, tenant, submission, registry, records, normalizationContext, normalization } = {}) {
  const nested = isObj(normalization) ? normalization : null
  const hasTopLevel = registry !== undefined || records !== undefined || normalizationContext !== undefined
  const norm = nested
    ? Object.freeze({ registry: nested.registry ?? null, records: nested.records ?? null, context: nested.context ?? null })
    : hasTopLevel
      ? Object.freeze({ registry: registry ?? null, records: records ?? null, context: normalizationContext ?? null })
      : null
  return Object.freeze({
    ingestRunId: typeof ingestRunId === 'string' ? ingestRunId : null,
    tenant:      isObj(tenant) ? tenant : null,
    submission:  isObj(submission) ? submission : null,
    normalization: norm,
  })
}

/** Is this value already a GatewayContext (has the four known keys)? */
export function isGatewayContext(v) {
  return isObj(v) && 'ingestRunId' in v && 'tenant' in v && 'submission' in v && 'normalization' in v
}
