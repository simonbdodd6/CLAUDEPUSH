// Deterministic Travel Insight Engine (M16).
//
// Consumes an M15 Travel Intelligence Context snapshot (through an injected
// port) and turns its evidence/risk/missing/pattern signals into explainable
// insights. This is a deterministic rules layer — NOT AI, NOT recommendations,
// and it never executes actions. The vocabulary below mirrors M15 as plain
// string literals rather than importing it.

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

export const INSIGHT_SEVERITY = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high' });
export const INSIGHT_SEVERITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

export const INSIGHT_STATUS = Object.freeze({ ACTIVE: 'active' });

export const INSIGHT_AUDIT_ACTIONS = Object.freeze({ GENERATED: 'GENERATED' });

// Mirror of M15 evidence sources.
export const EVIDENCE_SOURCE = Object.freeze({
  IDENTITY: 'identity',
  DIGITAL_TWIN: 'digital_twin',
  TIMELINE: 'timeline',
  RELATIONSHIP: 'relationship',
  MEMORY: 'memory',
  PREFERENCE: 'preference',
  DISCOVERY: 'discovery',
});

// Mirror of M15 risk-signal codes.
export const CONTEXT_RISK = Object.freeze({
  IDENTITY_UNVERIFIED: 'identity_unverified',
  NO_TRAVEL_COMPANIONS: 'no_travel_companions',
  NO_ACCOMMODATION: 'no_accommodation',
  NO_ITINERARY: 'no_itinerary',
  MISSING_PREFERENCES: 'missing_preferences',
  SPARSE_TRAVEL_HISTORY: 'sparse_travel_history',
});

// Mirror of M15 missing-information codes used by the rules.
export const CONTEXT_MISSING = Object.freeze({
  EMERGENCY_CONTACT: 'emergency_contact_unknown_placeholder',
  PASSPORT: 'passport_information_unknown_placeholder',
  NO_PREFERENCES: 'no_preferences',
});

// Stable rule identifiers — part of the deterministic insightId.
export const RULE_ID = Object.freeze({
  EMERGENCY_CONTACT: 'emergency_contact_placeholder',
  PASSPORT: 'passport_placeholder',
  MISSING_PREFERENCES: 'missing_preferences',
  MISSING_ACCOMMODATION: 'missing_accommodation',
  MISSING_ITINERARY: 'missing_itinerary',
  SPARSE_HISTORY: 'sparse_travel_history',
  NO_COMPANIONS: 'no_companions',
  LOW_EVIDENCE_COVERAGE: 'low_evidence_coverage',
  CONFLICTING_PREFERENCE_MEMORY: 'conflicting_preference_memory',
  STRONG_DESTINATION_PATTERN: 'strong_destination_pattern',
  STRONG_COMPANION_OPPORTUNITY: 'strong_companion_opportunity',
  STRONG_MEMORY_PATTERN: 'strong_memory_pattern',
  RELATIONSHIP_HUB: 'relationship_hub',
  DOMINANT_TIMELINE: 'dominant_timeline',
});

export const INSIGHT_THRESHOLDS = Object.freeze({
  STRONG_DESTINATION_COUNT: 3,
  STRONG_MEMORY_COUNT: 2,
  HIGH_CONFIDENCE_MEMORY: 0.7,
  DOMINANT_EVENT_RATIO: 0.5,
  MIN_EVENTS_FOR_TIMELINE_PATTERN: 4,
  STRONG_CONNECTION_COUNT: 3,
  LOW_COVERAGE: 0.34,
});
