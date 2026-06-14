export const DISCOVERY_STATUS = Object.freeze({
  LOOKING_FOR_DINNER: 'looking_for_dinner',
  LOOKING_FOR_DIVING: 'looking_for_diving',
  LOOKING_FOR_SURFING: 'looking_for_surfing',
  LOOKING_FOR_EXPLORING: 'looking_for_exploring',
  LOOKING_FOR_PHOTOGRAPHY: 'looking_for_photography',
  LOOKING_FOR_COFFEE: 'looking_for_coffee',
  AVAILABLE_TODAY: 'available_today',
});

export const DISCOVERY_STATUSES = Object.freeze(Object.values(DISCOVERY_STATUS));

export const DISCOVERY_VISIBILITY = Object.freeze({
  EVERYONE: 'everyone', // any opted-in traveller may discover
  SAME_DESTINATION: 'same_destination', // only travellers sharing the destination
  SAME_AREA: 'same_area', // only travellers sharing the approximate area
  HIDDEN: 'hidden', // opted in but currently not discoverable (paused)
});

export const DISCOVERY_VISIBILITIES = Object.freeze(Object.values(DISCOVERY_VISIBILITY));

export const DISCOVERY_AUDIT_ACTIONS = Object.freeze({
  PROFILE_CREATED: 'PROFILE_CREATED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  OPTED_IN: 'OPTED_IN',
  OPTED_OUT: 'OPTED_OUT',
  STATUS_SET: 'STATUS_SET',
  VISIBILITY_CHANGED: 'VISIBILITY_CHANGED',
  TRAVELLER_BLOCKED: 'TRAVELLER_BLOCKED',
  TRAVELLER_UNBLOCKED: 'TRAVELLER_UNBLOCKED',
  DISCOVERY_RUN: 'DISCOVERY_RUN',
});

// Deterministic compatibility weights. No model is learned; the score is a pure
// weighted sum of overlapping, privacy-safe attributes.
export const DISCOVERY_SCORE_WEIGHTS = Object.freeze({
  SHARED_DESTINATION: 30,
  SHARED_AREA: 15,
  SHARED_ACTIVITY: 12, // per overlapping activity, capped
  SHARED_DATES: 18, // any overlapping travel dates
  SHARED_TRAVEL_STYLE: 8, // per overlapping travel style, capped
  POSITIVE_MEMORY_AFFINITY: 6, // per shared positive memory tag, capped
  MEMORY_CONFLICT_PENALTY: 10, // per conflicting memory tag
  SHARED_STATUS: 10, // per shared status, capped
  AVAILABLE_TODAY_BOOST: 5,
});

export const DISCOVERY_SCORE_CAPS = Object.freeze({
  SHARED_ACTIVITY: 3,
  SHARED_TRAVEL_STYLE: 3,
  POSITIVE_MEMORY_AFFINITY: 4,
  SHARED_STATUS: 3,
});

export const DEFAULT_DISCOVERY_LIMIT = 25;
