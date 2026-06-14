export const ITINERARY_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
});

export const ITINERARY_SECTION = Object.freeze({
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
});

// Section keys that hold ordered day blocks, in natural day order.
export const ITINERARY_SECTION_KEYS = Object.freeze([
  ITINERARY_SECTION.MORNING,
  ITINERARY_SECTION.AFTERNOON,
  ITINERARY_SECTION.EVENING,
]);

// Key holding rain-day alternative blocks on each day.
export const RAIN_ALTERNATIVES_KEY = 'rainAlternatives';

export const ITINERARY_BLOCK_TYPE = Object.freeze({
  ACTIVITY: 'activity',
  TRANSPORT: 'transport',
  MEAL: 'meal',
  REST: 'rest',
  FREE_TIME: 'free_time',
  RAIN_ALTERNATIVE: 'rain_alternative',
});

export const ITINERARY_BLOCK_TYPES = Object.freeze(Object.values(ITINERARY_BLOCK_TYPE));

export const MEAL_TYPE = Object.freeze({
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACK: 'snack',
});

export const ITINERARY_AUDIT_ACTIONS = Object.freeze({
  ITINERARY_CREATED: 'ITINERARY_CREATED',
  BLOCK_ADDED: 'BLOCK_ADDED',
  BLOCK_UPDATED: 'BLOCK_UPDATED',
  BLOCK_NOTES_UPDATED: 'BLOCK_NOTES_UPDATED',
  BLOCK_REMOVED: 'BLOCK_REMOVED',
  BLOCK_MOVED: 'BLOCK_MOVED',
  RAIN_ALTERNATIVE_ADDED: 'RAIN_ALTERNATIVE_ADDED',
  ITINERARY_PUBLISHED: 'ITINERARY_PUBLISHED',
  ITINERARY_REVERTED: 'ITINERARY_REVERTED',
});
