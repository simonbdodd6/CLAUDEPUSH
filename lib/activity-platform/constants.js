export const ACTIVITY_CATEGORY = Object.freeze({
  SURFING: 'surfing',
  DIVING: 'diving',
  HIKING: 'hiking',
  FOOD: 'food',
  CULTURE: 'culture',
  WILDLIFE: 'wildlife',
  NIGHTLIFE: 'nightlife',
  ADVENTURE: 'adventure',
  WELLNESS: 'wellness',
  PHOTOGRAPHY: 'photography',
  SHOPPING: 'shopping',
  FAMILY: 'family',
  TRANSPORT: 'transport',
  VOLUNTEERING: 'volunteering',
  OTHER: 'other',
});

export const ACTIVITY_DIFFICULTY = Object.freeze({
  ALL_LEVELS: 'all_levels',
  EASY: 'easy',
  MODERATE: 'moderate',
  CHALLENGING: 'challenging',
  EXPERT: 'expert',
});

export const ACTIVITY_STATUS = Object.freeze({
  INACTIVE: 'inactive',
  ACTIVE: 'active',
});

export const ACTIVITY_VISIBILITY = Object.freeze({
  PRIVATE: 'private',
  PUBLIC: 'public',
});

export const ACTIVITY_ENVIRONMENT = Object.freeze({
  INDOOR: 'indoor',
  OUTDOOR: 'outdoor',
  MIXED: 'mixed',
});

export const WEATHER_SENSITIVITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  WEATHER_DEPENDENT: 'weather_dependent',
});

export const ACTIVITY_AUDIT_ACTIONS = Object.freeze({
  ACTIVITY_CREATED: 'ACTIVITY_CREATED',
  ACTIVITY_UPDATED: 'ACTIVITY_UPDATED',
  ACTIVITY_ACTIVATED: 'ACTIVITY_ACTIVATED',
  ACTIVITY_DEACTIVATED: 'ACTIVITY_DEACTIVATED',
  ACTIVITY_VISIBILITY_CHANGED: 'ACTIVITY_VISIBILITY_CHANGED',
  ACTIVITY_READ: 'ACTIVITY_READ',
});
