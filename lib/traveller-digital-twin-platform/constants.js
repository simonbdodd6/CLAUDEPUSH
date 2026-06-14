// Traveller Digital Twin Read Model (M14).
//
// This module is a READ-ONLY projection. It owns no data and no store. The
// vocabulary below mirrors the timeline (M12) and relationship-graph (M13) as
// plain string literals rather than importing those modules, so the twin stays
// decoupled and composes everything through injected ports only (the same
// pattern M10 established).

// Entity types (mirrors relationship-graph vocabulary; open namespace upstream).
export const ENTITY_TYPE = Object.freeze({
  TRAVELLER: 'traveller',
  TRIP: 'trip',
  COUNTRY: 'country',
  CITY: 'city',
  DESTINATION: 'destination',
  MEMORY: 'memory',
  RECOMMENDATION: 'recommendation',
  COMPANION: 'companion',
});

// Relationship types used to classify a traveller's direct neighbours.
export const RELATIONSHIP_TYPE = Object.freeze({
  VISITED: 'visited',
  PLANNED: 'planned',
  BOOKED: 'booked',
  REMEMBERED: 'remembered',
  TRAVELLED_WITH: 'travelled_with',
  LOCATED_IN: 'located_in',
  GENERATED: 'generated',
  OWNS: 'owns',
  CONNECTED_TO: 'connected_to',
});

// Timeline event types the twin specifically derives references from.
export const TIMELINE_EVENT_TYPE = Object.freeze({
  TRIP_CREATED: 'trip_created',
  TRIP_UPDATED: 'trip_updated',
  MEMORY_CREATED: 'memory_created',
  RECOMMENDATION_GENERATED: 'recommendation_generated',
});

export const TIMELINE_IMPORTANCE = Object.freeze({
  CRITICAL: 'critical',
  HIGH: 'high',
});

export const TIMELINE_STATUS = Object.freeze({
  REDACTED: 'redacted',
});

// Classification groupings for direct neighbours.
export const COMPANION_ENTITY_TYPES = Object.freeze([ENTITY_TYPE.COMPANION, ENTITY_TYPE.TRAVELLER]);
export const COMPANION_RELATIONSHIP_TYPES = Object.freeze([RELATIONSHIP_TYPE.TRAVELLED_WITH, RELATIONSHIP_TYPE.CONNECTED_TO]);
export const DESTINATION_ENTITY_TYPES = Object.freeze([ENTITY_TYPE.DESTINATION, ENTITY_TYPE.COUNTRY, ENTITY_TYPE.CITY]);
export const DESTINATION_RELATIONSHIP_TYPES = Object.freeze([RELATIONSHIP_TYPE.VISITED, RELATIONSHIP_TYPE.LOCATED_IN]);

export const RISK_SIGNAL = Object.freeze({
  IDENTITY_UNVERIFIED: 'identity_unverified',
  CRITICAL_TIMELINE_EVENT: 'critical_timeline_event',
  REDACTED_TIMELINE_EVENTS: 'redacted_timeline_events',
});

export const RISK_SEVERITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

export const MISSING_SIGNAL = Object.freeze({
  TIMELINE_PLATFORM_UNAVAILABLE: 'timeline_platform_unavailable',
  RELATIONSHIP_GRAPH_UNAVAILABLE: 'relationship_graph_unavailable',
  NO_TIMELINE_EVENTS: 'no_timeline_events',
  NO_RELATIONSHIPS: 'no_relationships',
  NO_TRIPS: 'no_trips',
  NO_COMPANIONS: 'no_companions',
  NO_DESTINATIONS: 'no_destinations',
  NO_MEMORIES: 'no_memories',
  NO_RECOMMENDATIONS: 'no_recommendations',
  PROFILE_DISPLAY_NAME_MISSING: 'profile_display_name_missing',
  PROFILE_COUNTRY_MISSING: 'profile_country_missing',
});

export const DEFAULT_TWIN_OPTIONS = Object.freeze({
  recentLimit: 10,
  timelineLimit: 1000,
  graphDepth: 1,
  importantLimit: 10,
});
