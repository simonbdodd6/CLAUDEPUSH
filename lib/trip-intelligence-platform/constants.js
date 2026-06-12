export const TRIP_PLAN_SLOT = Object.freeze({
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
  RAINY_DAY_BACKUP: 'rainy_day_backup',
});

export const TRIP_PLAN_GAP_TYPE = Object.freeze({
  NO_RECOMMENDATIONS: 'no_recommendations',
  NO_MORNING_ACTIVITY: 'no_morning_activity',
  NO_AFTERNOON_ACTIVITY: 'no_afternoon_activity',
  NO_EVENING_ACTIVITY: 'no_evening_activity',
  NO_RAINY_DAY_BACKUP: 'no_rainy_day_backup',
  HIGH_RISK_DAY: 'high_risk_day',
  OVER_BUDGET: 'over_budget',
});

export const TRIP_PLAN_AUDIT_ACTIONS = Object.freeze({
  TRIP_PLAN_GENERATED: 'TRIP_PLAN_GENERATED',
  TRIP_PLAN_EXPLAINED: 'TRIP_PLAN_EXPLAINED',
});

export const DEFAULT_SLOT_SCORE_BONUS = Object.freeze({
  [TRIP_PLAN_SLOT.MORNING]: 4,
  [TRIP_PLAN_SLOT.AFTERNOON]: 2,
  [TRIP_PLAN_SLOT.EVENING]: 0,
  [TRIP_PLAN_SLOT.RAINY_DAY_BACKUP]: 3,
});
