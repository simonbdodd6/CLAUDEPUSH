import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIP_PLAN_GAP_TYPE,
  TRIP_PLAN_SLOT,
  createTripIntelligencePlatform,
} from '../lib/trip-intelligence-platform/index.js';

function trip(overrides = {}) {
  return {
    tripId: 'trip_bali_1',
    ownerIdentityId: 'idn_traveller_1',
    country: 'Indonesia',
    destination: 'Bali',
    area: 'Canggu',
    startDate: '2026-06-20',
    endDate: '2026-06-23',
    ...overrides,
  };
}

function destination(overrides = {}) {
  return {
    destinationId: 'dest_bali_canggu',
    name: 'Canggu',
    safetyNotes: ['Use registered transport at night'],
    ...overrides,
  };
}

function preferences(overrides = {}) {
  return {
    travellerIdentityId: 'idn_traveller_1',
    preferredTravelPace: 'slow',
    maximumDailyBudget: { amount: 750000, currency: 'IDR' },
    transportPreferences: ['walking', 'public_transport'],
    ...overrides,
  };
}

function factor(factorName, score = 1, weight = 10) {
  return { factor: factorName, score, weight };
}

function recommendation(overrides = {}) {
  const id = overrides.itemId ?? overrides.recommendationId ?? 'act_surf';
  return {
    recommendationId: `rec_${id}`,
    type: 'activity',
    itemId: id,
    item: {
      activityId: id,
      name: overrides.name ?? 'Beginner surf lesson',
      categories: overrides.categories ?? ['surfing', 'adventure'],
      weatherSensitivity: overrides.weatherSensitivity ?? 'medium',
      environment: overrides.environment ?? 'outdoor',
    },
    score: overrides.score ?? 90,
    confidence: overrides.confidence ?? 0.86,
    explanation: overrides.explanation ?? `${overrides.name ?? 'Beginner surf lesson'} is a strong deterministic fit.`,
    sourceFactors: overrides.sourceFactors ?? [
      factor('activity_preferences', 1, 18),
      factor('budget', 0.85, 12),
      factor('risk_tolerance', 1, 10),
      factor('transport_preference', 1, 6),
    ],
    ...overrides,
  };
}

function recommendations() {
  return [
    recommendation({ itemId: 'act_surf', name: 'Beginner surf lesson', score: 92 }),
    recommendation({ itemId: 'act_food', name: 'Local food walk', type: 'food', categories: ['food', 'culture'], score: 88, weatherSensitivity: 'low', environment: 'mixed' }),
    recommendation({ itemId: 'act_culture', name: 'Temple culture walk', score: 84, categories: ['culture'], weatherSensitivity: 'medium', environment: 'mixed' }),
    recommendation({ itemId: 'act_wellness', name: 'Evening yoga', score: 80, categories: ['wellness'], weatherSensitivity: 'low', environment: 'indoor' }),
    recommendation({ itemId: 'dest_bali_canggu', name: 'Canggu', type: 'destination', score: 86, explanation: 'Canggu is a strong destination fit.' }),
    recommendation({ itemId: 'safety_canggu', name: 'Canggu safety reminder', type: 'safety', score: 72 }),
  ];
}

test('generates an explainable deterministic trip plan', async () => {
  const platform = createTripIntelligencePlatform();
  const plan = await platform.generateTripPlan({
    trip: trip(),
    destinations: [destination()],
    activities: [],
    preferences: preferences(),
    recommendations: recommendations(),
    maxDays: 2,
  });

  assert.ok(plan.tripPlanId.startsWith('tripplan_'));
  assert.equal(plan.tripId, 'trip_bali_1');
  assert.equal(plan.deterministic, true);
  assert.equal(plan.aiUsed, false);
  assert.equal(plan.dailyPlans.length, 2);
  assert.equal(plan.destinationFocus.name, 'Canggu');
  assert.equal(plan.dailyPlans[0].morningSuggestion.slot, TRIP_PLAN_SLOT.MORNING);
  assert.equal(plan.dailyPlans[0].afternoonSuggestion.slot, TRIP_PLAN_SLOT.AFTERNOON);
  assert.equal(plan.dailyPlans[0].eveningSuggestion.slot, TRIP_PLAN_SLOT.EVENING);
  assert.equal(plan.dailyPlans[0].backupRainyDayOption.slot, TRIP_PLAN_SLOT.RAINY_DAY_BACKUP);
  assert.match(plan.dailyPlans[0].safetyNote, /registered transport/);
  assert.match(plan.dailyPlans[0].transportNote, /walking/);
  assert.match(plan.dailyPlans[0].budgetNote, /750000 IDR/);
  assert.match(plan.dailyPlans[0].whyThisPlanFits, /activity_preferences/);
  assert.ok(plan.sourceFactors.length);
});

test('generates a single daily plan', () => {
  const platform = createTripIntelligencePlatform();
  const dailyPlan = platform.generateDailyPlan({
    trip: trip(),
    destination: destination(),
    preferences: preferences(),
    recommendations: recommendations(),
    dayIndex: 1,
  });

  assert.equal(dailyPlan.day, 2);
  assert.equal(dailyPlan.date, '2026-06-21');
  assert.equal(dailyPlan.destinationFocus, 'Canggu');
  assert.ok(dailyPlan.morningSuggestion.recommendationId);
  assert.ok(dailyPlan.backupRainyDayOption.recommendationId);
});

test('suggests activities for a day from recommendation scores', () => {
  const platform = createTripIntelligencePlatform();
  const suggestions = platform.suggestActivitiesForDay({ recommendations: recommendations(), dayIndex: 0 });

  assert.deepEqual(suggestions.map(item => item.itemId), ['act_surf', 'act_food', 'act_culture']);
});

test('suggests destination focus from destination recommendation first', () => {
  const platform = createTripIntelligencePlatform();
  const focus = platform.suggestDestinationFocus({
    trip: trip(),
    destinations: [destination({ name: 'Fallback Canggu' })],
    recommendations: recommendations(),
  });

  assert.equal(focus.destinationId, 'dest_bali_canggu');
  assert.equal(focus.name, 'Canggu');
  assert.match(focus.explanation, /destination fit/);
});

test('detects trip gaps for missing slots', async () => {
  const platform = createTripIntelligencePlatform();
  const plan = await platform.generateTripPlan({
    trip: trip(),
    destinations: [destination()],
    preferences: preferences(),
    recommendations: [],
    maxDays: 1,
  });
  const gaps = platform.detectTripGaps(plan);

  assert.ok(gaps.find(gap => gap.type === TRIP_PLAN_GAP_TYPE.NO_RECOMMENDATIONS));
  assert.ok(gaps.find(gap => gap.type === TRIP_PLAN_GAP_TYPE.NO_MORNING_ACTIVITY));
  assert.ok(gaps.find(gap => gap.type === TRIP_PLAN_GAP_TYPE.NO_RAINY_DAY_BACKUP));
});

test('explains a trip plan without recomputing it', async () => {
  const platform = createTripIntelligencePlatform();
  const plan = await platform.generateTripPlan({
    trip: trip(),
    destinations: [destination()],
    preferences: preferences(),
    recommendations: recommendations(),
    maxDays: 1,
  });
  const explanation = platform.explainTripPlan(plan);

  assert.equal(explanation.tripPlanId, plan.tripPlanId);
  assert.equal(explanation.tripId, plan.tripId);
  assert.match(explanation.explanation, /deterministic trip plan/);
  assert.equal(explanation.dailySummary.length, 1);
  assert.ok(explanation.sourceFactors.length);
});

test('rejects exact live location inputs', async () => {
  const platform = createTripIntelligencePlatform();

  await assert.rejects(() => platform.generateTripPlan({
    trip: trip(),
    destinations: [destination()],
    preferences: preferences(),
    recommendations: recommendations(),
    latitude: -8.65,
  }), /must not include exact traveller location/);

  assert.throws(() => platform.generateDailyPlan({
    trip: { ...trip(), exactLocation: 'specific villa' },
    preferences: preferences(),
    recommendations: recommendations(),
  }), /must not include exact traveller location/);
});

test('validates required objects', async () => {
  const platform = createTripIntelligencePlatform();

  await assert.rejects(() => platform.generateTripPlan({
    trip: null,
    preferences: preferences(),
    recommendations: recommendations(),
  }), /trip must be an object/);

  assert.throws(() => platform.generateDailyPlan({
    trip: trip(),
    preferences: null,
    recommendations: recommendations(),
  }), /preferences must be an object/);

  assert.throws(() => platform.detectTripGaps(null), /tripPlan must be an object/);
});

test('stores generated plans and audit events', async () => {
  const platform = createTripIntelligencePlatform();
  const plan = await platform.generateTripPlan({
    trip: trip(),
    destinations: [destination()],
    preferences: preferences(),
    recommendations: recommendations(),
    maxDays: 1,
  });

  const plans = await platform.getTripPlansForTrip('trip_bali_1');
  const auditEvents = await platform.getAuditEvents({ tripPlanId: plan.tripPlanId });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].tripPlanId, plan.tripPlanId);
  assert.deepEqual(auditEvents.map(event => event.action), ['TRIP_PLAN_GENERATED']);
});
