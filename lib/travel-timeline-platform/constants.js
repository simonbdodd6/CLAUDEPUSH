// Universal Travel Timeline Platform (M12).
//
// The timeline owns CHRONOLOGY, not business data. Every record is a reference
// to a fact that lives authoritatively in a source platform. Event types are a
// closed vocabulary (with CUSTOM as the escape hatch); source platforms are an
// OPEN string namespace on purpose — adding the 101st publisher must never
// require editing this file.

export const TIMELINE_EVENT_TYPE = Object.freeze({
  TRIP_CREATED: 'trip_created',
  TRIP_UPDATED: 'trip_updated',
  DESTINATION_ADDED: 'destination_added',
  BOOKING_PLANNED: 'booking_planned',
  BOOKING_CONFIRMED: 'booking_confirmed',
  ACCOMMODATION: 'accommodation',
  FLIGHT: 'flight',
  TRANSPORT: 'transport',
  ACTIVITY: 'activity',
  MEMORY_CREATED: 'memory_created',
  RECOMMENDATION_GENERATED: 'recommendation_generated',
  COMPANION_MATCH: 'companion_match',
  NOTIFICATION: 'notification',
  PHOTO_IMPORTED: 'photo_imported',
  JOURNAL_ENTRY: 'journal_entry',
  CUSTOM: 'custom',
});

export const TIMELINE_EVENT_TYPES = Object.freeze(Object.values(TIMELINE_EVENT_TYPE));

// Convenience constants for current publishers. NOT an allow-list — any
// non-empty slug is accepted so future modules/products can publish freely.
export const SOURCE_PLATFORM = Object.freeze({
  TRIP: 'trip-platform',
  DESTINATION: 'destination-platform',
  ACTIVITY: 'activity-platform',
  ITINERARY: 'itinerary-platform',
  RECOMMENDATION: 'recommendation-platform',
  TRAVEL_MEMORY: 'travel-memory-platform',
  COMPANION_DISCOVERY: 'companion-discovery-platform',
  TRAVELLER_PREFERENCES: 'traveller-preferences-platform',
  TRIP_INTELLIGENCE: 'trip-intelligence-platform',
  TRAVELLER_IDENTITY: 'traveller-identity-platform',
});

export const TIMELINE_IMPORTANCE = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
});

export const TIMELINE_IMPORTANCES = Object.freeze(Object.values(TIMELINE_IMPORTANCE));

export const TIMELINE_VISIBILITY = Object.freeze({
  PRIVATE: 'private', // only the traveller
  COMPANIONS: 'companions', // traveller + connected companions
  PUBLIC: 'public', // broadly shareable
  SYSTEM: 'system', // internal/operational, not traveller-facing
});

export const TIMELINE_VISIBILITIES = Object.freeze(Object.values(TIMELINE_VISIBILITY));

export const TIMELINE_EVENT_STATUS = Object.freeze({
  ACTIVE: 'active', // a live, current fact
  REDACTED: 'redacted', // content removed; chronology slot retained
  SUPERSEDED: 'superseded', // DERIVED only — an event replaced by a correction
});

// Stored statuses (SUPERSEDED is never stored; it is derived at query time).
export const STORED_EVENT_STATUSES = Object.freeze([
  TIMELINE_EVENT_STATUS.ACTIVE,
  TIMELINE_EVENT_STATUS.REDACTED,
]);

export const TIMELINE_AUDIT_ACTIONS = Object.freeze({
  EVENT_APPENDED: 'EVENT_APPENDED',
  EVENT_CORRECTED: 'EVENT_CORRECTED',
  EVENT_REDACTED: 'EVENT_REDACTED',
});

export const TIMELINE_ORDER = Object.freeze({
  ASC: 'asc',
  DESC: 'desc',
});

export const DEFAULT_TIMELINE_LIMIT = 500;
