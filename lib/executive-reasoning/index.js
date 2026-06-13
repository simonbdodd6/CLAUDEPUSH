// Executive Reasoning Layer — public API.
//
// A domain-agnostic explainability platform capability. It sits ABOVE existing
// intelligence and never makes decisions — it only EXPOSES reasoning. Any product
// domain (Website Lead, Coach's Eye, Wedding, Travel, Hospitality) maps its
// recommendation/decision objects onto the neutral ReasoningInput and gets a full
// ExecutiveExplanation back, with no changes to this module.
//
// It calls no engine and invokes no model — every field is composed from signals
// the platform already produced.

export {
  EXPLANATION_SCHEMA_VERSION, EXPLANATION_TYPE, CONFIDENCE_BAND, bandFor,
  UNCERTAINTY_REASON, DECISION_TIER, DEFAULT_OWNER_BY_TIER,
  EVIDENCE_KIND, EDGE_TYPE, MISSING_IMPACT, FACTOR_CATEGORY,
} from './constants.js';

export { ExecutiveReasoningError, InvalidReasoningInputError } from './errors.js';

export { buildConfidence } from './confidence.js';
export { buildEvidenceGraph, traverse } from './evidence-graph.js';
export { detectMissingEvidence } from './missing-evidence.js';
export { buildReasoningTrace } from './reasoning-trace.js';
export { buildTimeline, buildProvenance, buildApprovalLinkage } from './timeline.js';
export { buildExecutiveExplanation, toExplainabilityPanel } from './explanation.js';
export { InMemoryExplanationRepository } from './repository.js';
export { createExecutiveReasoningPlatform, normalizeReasoningInput } from './service.js';
