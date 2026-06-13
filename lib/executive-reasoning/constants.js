// Executive Reasoning — shared constants.
//
// Domain-agnostic explainability vocabulary. Nothing here is specific to Coach's
// Eye, Website Lead, Wedding, Travel or Hospitality — every consumer maps its own
// outputs onto these neutral terms.

export const EXPLANATION_SCHEMA_VERSION = '1.0.0';

// What kind of thing is being explained. Free-form strings are allowed; these are
// the conventional values so panels can group consistently across domains.
export const EXPLANATION_TYPE = {
  RECOMMENDATION: 'recommendation',
  DECISION:       'decision',
  ALERT:          'alert',
  PREDICTION:     'prediction',
  LEAD:           'lead',
  PLAN:           'plan',
};

// Confidence bands — a presentation classification of an already-computed
// confidence value. This does NOT compute confidence; it only labels it.
export const CONFIDENCE_BAND = {
  HIGH:       'high',        // >= 75
  MODERATE:   'moderate',    // 50–74
  LOW:        'low',         // 30–49
  VERY_LOW:   'very_low',    // < 30
};

export function bandFor(value) {
  const v = Number.isFinite(value) ? value : 0;
  if (v >= 75) return CONFIDENCE_BAND.HIGH;
  if (v >= 50) return CONFIDENCE_BAND.MODERATE;
  if (v >= 30) return CONFIDENCE_BAND.LOW;
  return CONFIDENCE_BAND.VERY_LOW;
}

// Why a conclusion carries uncertainty. Composed from real signals, never invented.
export const UNCERTAINTY_REASON = {
  SMALL_SAMPLE:     'small_sample',       // calibrated on < 3 prior outcomes
  MOCK_DATA:        'mock_data',          // some inputs are synthetic / placeholder
  STALE_DATA:       'stale_data',         // inputs are older than expected
  MISSING_EVIDENCE: 'missing_evidence',   // expected evidence not present
  LOW_CONFIDENCE:   'low_confidence',     // the confidence value itself is low
  CONFLICTING:      'conflicting',        // evidence points in different directions
};

// Decision tiers — mirror the platform's existing AUTO / APPROVE / HUMAN model.
export const DECISION_TIER = {
  AUTO:    'AUTO',
  APPROVE: 'APPROVE',
  HUMAN:   'HUMAN',
};

// Generic owner fallback by tier. Domains may override with a specific role
// (e.g. 'coach', 'venue manager', 'sales rep') via input.decision.owner.
export const DEFAULT_OWNER_BY_TIER = {
  [DECISION_TIER.AUTO]:    'automation',
  [DECISION_TIER.APPROVE]: 'designated approver',
  [DECISION_TIER.HUMAN]:   'human decision-maker',
};

// Evidence node kinds in the evidence graph.
export const EVIDENCE_KIND = {
  CITATION: 'citation',   // a cited fact from a source engine
  ENTITY:   'entity',     // a domain entity (player, lead, venue, trip…)
  METRIC:   'metric',     // a measured value
  DOCUMENT: 'document',   // a source document / record
  SIGNAL:   'signal',     // a raw observation / detector input
};

// Edge relationships in the evidence graph.
export const EDGE_TYPE = {
  CITES:        'cites',         // subject → citation
  ABOUT:        'about',         // citation/subject → entity
  DERIVED_FROM: 'derived_from',  // subject → signal/metric
  LINKED_TO:    'linked_to',     // entity → entity
};

// Impact of a missing-evidence gap on the conclusion.
export const MISSING_IMPACT = {
  CRITICAL: 'critical',   // conclusion may be unsound without it
  MAJOR:    'major',      // materially weakens confidence
  MINOR:    'minor',      // nice-to-have, low effect
};

// Factor categories for confidence/score decomposition.
export const FACTOR_CATEGORY = {
  URGENCY:     'urgency',
  IMPACT:      'impact',
  CONFIDENCE:  'confidence',
  TIME_SAVED:  'time_saved',
  CUSTOM:      'custom',
};
