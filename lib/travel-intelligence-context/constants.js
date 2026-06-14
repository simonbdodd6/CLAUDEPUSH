// Travel Intelligence Context Engine (M15).
//
// The final deterministic layer before AI reasoning. It owns NO data and
// composes the existing platforms through injected ports only. The vocabulary
// below mirrors the upstream modules as plain string literals rather than
// importing them, keeping this engine fully decoupled.

export const CONTEXT_SCHEMA_VERSION = '1.0.0';
export const CONTEXT_VERSION_PREFIX = 'ctxv1';

// Evidence sources — every output value is attributable to one of these.
export const EVIDENCE_SOURCE = Object.freeze({
  IDENTITY: 'identity',
  DIGITAL_TWIN: 'digital_twin',
  TIMELINE: 'timeline',
  RELATIONSHIP: 'relationship',
  MEMORY: 'memory',
  PREFERENCE: 'preference',
  DISCOVERY: 'discovery',
});

// Mirrors relationship-graph vocabulary (open namespace upstream).
export const ENTITY_TYPE = Object.freeze({
  TRAVELLER: 'traveller',
  TRIP: 'trip',
  COUNTRY: 'country',
  CITY: 'city',
  DESTINATION: 'destination',
  ACCOMMODATION: 'accommodation',
  COMPANION: 'companion',
  MEMORY: 'memory',
});

export const RELATIONSHIP_TYPE = Object.freeze({
  VISITED: 'visited',
  PLANNED: 'planned',
  LOCATED_IN: 'located_in',
  TRAVELLED_WITH: 'travelled_with',
  CONNECTED_TO: 'connected_to',
});

// Mirrors timeline vocabulary.
export const TIMELINE_IMPORTANCE = Object.freeze({ HIGH: 'high', CRITICAL: 'critical' });
export const ITINERARY_SOURCE_PLATFORM = 'itinerary-platform';
export const ACCOMMODATION_ENTITY_TYPE = 'accommodation';

export const RISK_SIGNAL = Object.freeze({
  IDENTITY_UNVERIFIED: 'identity_unverified',
  NO_TRAVEL_COMPANIONS: 'no_travel_companions',
  NO_ACCOMMODATION: 'no_accommodation',
  NO_ITINERARY: 'no_itinerary',
  MISSING_PREFERENCES: 'missing_preferences',
  SPARSE_TRAVEL_HISTORY: 'sparse_travel_history',
});

export const RISK_SEVERITY = Object.freeze({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high' });

// Information the engine cannot determine from the available ports. Surfaced
// honestly as placeholders rather than fabricated as risk.
export const MISSING_INFORMATION = Object.freeze({
  TIMELINE_UNAVAILABLE: 'timeline_platform_unavailable',
  RELATIONSHIP_UNAVAILABLE: 'relationship_platform_unavailable',
  MEMORY_UNAVAILABLE: 'memory_platform_unavailable',
  PREFERENCES_UNAVAILABLE: 'preferences_platform_unavailable',
  DISCOVERY_UNAVAILABLE: 'discovery_platform_unavailable',
  DIGITAL_TWIN_UNAVAILABLE: 'digital_twin_platform_unavailable',
  NO_TIMELINE_EVENTS: 'no_timeline_events',
  NO_RELATIONSHIPS: 'no_relationships',
  NO_MEMORIES: 'no_memories',
  NO_PREFERENCES: 'no_preferences',
  NO_DISCOVERY_PROFILE: 'no_discovery_profile',
  NO_TRIPS: 'no_trips',
  // Placeholders: not exposed by current ports (privacy public view / no port yet).
  EMERGENCY_CONTACT_UNKNOWN: 'emergency_contact_unknown_placeholder',
  PASSPORT_INFORMATION_UNKNOWN: 'passport_information_unknown_placeholder',
});

export const COVERAGE_LEVEL = Object.freeze({ NONE: 'none', SPARSE: 'sparse', MODERATE: 'moderate', RICH: 'rich' });

export const SPARSE_HISTORY_THRESHOLD = 3;

export const DEFAULT_CONTEXT_OPTIONS = Object.freeze({
  recentLimit: 10,
  highlightLimit: 10,
  timelineLimit: 1000,
  graphDepth: 1,
  memoryLimit: 200,
});
