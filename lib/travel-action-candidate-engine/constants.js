// Deterministic Travel Action Candidate Engine (M17).
//
// Consumes M16 Travel Insight Engine output (through an injected port) and
// converts insights into ranked, explainable, NON-EXECUTING action candidates.
// It proposes possible next actions; it NEVER approves or executes anything.
// Vocabulary mirrors M16 as plain string literals rather than importing it.

export const CANDIDATE_TYPE = Object.freeze({
  COMPLETE_MISSING_INFORMATION: 'complete_missing_information',
  REVIEW_SAFETY_GAP: 'review_safety_gap',
  ADD_ACCOMMODATION: 'add_accommodation',
  CREATE_ITINERARY: 'create_itinerary',
  REVIEW_COMPANION_OPPORTUNITY: 'review_companion_opportunity',
  REVIEW_DESTINATION_PATTERN: 'review_destination_pattern',
  REVIEW_PREFERENCE_PATTERN: 'review_preference_pattern',
  REVIEW_MEMORY_PATTERN: 'review_memory_pattern',
  IMPROVE_CONTEXT_QUALITY: 'improve_context_quality',
  CUSTOM: 'custom',
});

export const CANDIDATE_PRIORITY = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' });
export const CANDIDATE_PRIORITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3, critical: 4 });

export const CANDIDATE_STATUS = Object.freeze({ PROPOSED: 'proposed' });

export const CANDIDATE_AUDIT_ACTIONS = Object.freeze({ GENERATED: 'GENERATED' });

// Mirror of M16 insight types.
export const INSIGHT_TYPE = Object.freeze({
  MISSING_INFORMATION: 'missing_information',
  SAFETY_GAP: 'safety_gap',
  PLANNING_GAP: 'planning_gap',
  PREFERENCE_PATTERN: 'preference_pattern',
  MEMORY_PATTERN: 'memory_pattern',
  COMPANION_OPPORTUNITY: 'companion_opportunity',
  DESTINATION_PATTERN: 'destination_pattern',
  TIMELINE_PATTERN: 'timeline_pattern',
  RELATIONSHIP_PATTERN: 'relationship_pattern',
  CONTEXT_QUALITY: 'context_quality',
  CUSTOM: 'custom',
});

export const INSIGHT_SEVERITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

// Risk codes (mirror of M15/M16) used to refine planning-gap candidates.
export const CONTEXT_RISK = Object.freeze({
  NO_ACCOMMODATION: 'no_accommodation',
  NO_ITINERARY: 'no_itinerary',
});

// High-impact candidate types always require human approval.
export const HIGH_IMPACT_CANDIDATE_TYPES = Object.freeze([
  CANDIDATE_TYPE.REVIEW_SAFETY_GAP,
  CANDIDATE_TYPE.ADD_ACCOMMODATION,
  CANDIDATE_TYPE.CREATE_ITINERARY,
]);

// Human-readable titles per candidate type.
export const CANDIDATE_TITLE = Object.freeze({
  [CANDIDATE_TYPE.COMPLETE_MISSING_INFORMATION]: 'Complete missing information',
  [CANDIDATE_TYPE.REVIEW_SAFETY_GAP]: 'Review safety gap',
  [CANDIDATE_TYPE.ADD_ACCOMMODATION]: 'Add accommodation',
  [CANDIDATE_TYPE.CREATE_ITINERARY]: 'Create an itinerary',
  [CANDIDATE_TYPE.REVIEW_COMPANION_OPPORTUNITY]: 'Review companion opportunity',
  [CANDIDATE_TYPE.REVIEW_DESTINATION_PATTERN]: 'Review destination pattern',
  [CANDIDATE_TYPE.REVIEW_PREFERENCE_PATTERN]: 'Review preference pattern',
  [CANDIDATE_TYPE.REVIEW_MEMORY_PATTERN]: 'Review memory pattern',
  [CANDIDATE_TYPE.IMPROVE_CONTEXT_QUALITY]: 'Improve context quality',
  [CANDIDATE_TYPE.CUSTOM]: 'Review pattern',
});
