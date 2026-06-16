/**
 * @brain/evidence-gateway — stage registry (M45)
 *
 * The single source of truth for pipeline order. The gateway runs stages in this
 * exact order; tests assert it. Frozen + deterministic.
 */

import {
  receive, validate, normalize, deduplicate,
  prepareConfidenceUpdate, prepareMemoryLink, prepareAudit, prepareEngineExposure,
} from './stages.js'

/** Ordered stage objects ({ name, run }). receive → validate → … → prepareEngineExposure. */
export const EVIDENCE_GATEWAY_STAGES = Object.freeze([
  receive,
  validate,
  normalize,
  deduplicate,
  prepareConfidenceUpdate,
  prepareMemoryLink,
  prepareAudit,
  prepareEngineExposure,
])

/** Ordered stage names — the canonical pipeline order. */
export const EVIDENCE_GATEWAY_STAGE_NAMES = Object.freeze(EVIDENCE_GATEWAY_STAGES.map(s => s.name))

/** Lookup by name. */
export const STAGE_BY_NAME = Object.freeze(
  Object.fromEntries(EVIDENCE_GATEWAY_STAGES.map(s => [s.name, s])),
)
