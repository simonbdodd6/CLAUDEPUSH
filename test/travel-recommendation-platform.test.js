import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOMMENDATION_TYPE,
  SCORE_FACTOR,
  createRecommendationPlatform,
} from '../lib/recommendation-platform/index.js';

function trip(overrides = {}) {
  return {
    tripId: 'trip_bali_1',
    ownerIdentityId: 'idn_traveller_1',
    country: 'Indonesia',
    destination: 'Bali',
    area: 'Canggu',
    startDate: '2026-06-20',
    endDate: '2026-06-27',
    ...overrides,
  };
}

function preferences(overrides = {}) {
  return {
    travellerIdentityId: 'idn_traveller_1',
    budgetLevel: 'budget',
    travelStyles: ['backpacking', 'adventure'],
    preferredActivityCategories: ['surfing', 'food'],
    fitnessLevel: 'moderate',
    accessibilityRequirements: { requirements: ['step-free access'] },
    languages: ['en', 'id'],
    transportPreferences: ['walking', 'public_transport'],
    riskTolerance: 'low',
    crowdTolerance: 'moderate',
    climatePreferences: ['tropical', 'coastal'],
    preferredTravelPace: 'slow',
    maximumDailyBudget: { amount: 750000, currency: 'IDR' },
    preferredTripDuration: { minDays: 5, maxDays: 14 },
    favouriteDestinations: ['dest_bali_canggu'],
    avoidedDestinations: [],
    favouriteActivities: ['act_surf'],
    avoidedActivities: [],
    ...overrides,
  };
}

function destinations() {
  return [
    {
      destinationId: 'dest_bali_canggu',
      name: 'Canggu',
      budgetLevel: 'budget',
      tags: ['backpacking', 'surfing', 'adventure'],
      climateTags: ['tropical', 'coastal'],
      languages: ['id', 'en'],
      transportOptions: ['walking', 'public_transport', 'scooter'],
      crowdLevel: 'moderate',
      riskLevel: 'low',
      recommendedPace: 'slow',
      idealTripDuration: { minDays: 4, maxDays: 14 },
      safetyNotes: ['Use registered transport at night'],
      accessibility: { supports: ['step-free access'] },
    },
    {
      destinationId: 'dest_party_strip',
      name: 'Party Strip',
      budgetLevel: 'premium',
      tags: ['nightlife', 'luxury'],
      climateTags: ['humid'],
      languages: ['en'],
      transportOptions: ['taxi'],
      crowdLevel: 'high',
      riskLevel: 'moderate',
      recommendedPace: 'fast',
      idealTripDuration: { minDays: 1, maxDays: 3 },
      safetyNotes: ['High petty theft risk'],
    },
  ];
}

function activities() {
  return [
    {
      activityId: 'act_surf',
      destinationId: 'dest_bali_canggu',
      name: 'Beginner surf lesson',
      status: 'active',
      visibility: 'public',
      categories: ['surfing', 'adventure'],
      tags: ['backpacking', 'adventure'],
      duration: { minMinutes: 90, maxMinutes: 120 },
      estimatedCostRange: { min: 250000, max: 450000, currency: 'IDR' },
      weatherSensitivity: 'medium',
      languages: ['id', 'en'],
      transportOptions: ['walking'],
      crowdLevel: 'moderate',
      riskLevel: 'low',
      recommendedPace: 'slow',
      climateTags: ['tropical', 'coastal'],
      accessibility: { supports: ['step-free access'] },
    },
    {
      activityId: 'act_food',
      destinationId: 'dest_bali_canggu',
      name: 'Local food walk',
      status: 'active',
      visibility: 'public',
      categories: ['food', 'culture'],
      tags: ['backpacking', 'culture'],
      duration: { minMinutes: 120, maxMinutes: 150 },
      estimatedCostRange: { min: 150000, max: 250000, currency: 'IDR' },
      weatherSensitivity: 'low',
      languages: ['id', 'en'],
      transportOptions: ['walking'],
      crowdLevel: 'low',
      riskLevel: 'low',
      recommendedPace: 'slow',
      climateTags: ['tropical'],
      accessibility: { supports: ['step-free access'] },
    },
    {
      activityId: 'act_private',
      destinationId: 'dest_bali_canggu',
      name: 'Private hidden route',
      status: 'active',
      visibility: 'private',
      categories: ['adventure'],
    },
    {
      activityId: 'act_inactive',
      destinationId: 'dest_bali_canggu',
      name: 'Inactive hike',
      status: 'inactive',
      visibility: 'public',
      categories: ['hiking'],
    },
  ];
}

test('scores an activity deterministically with explanation and source factors', () => {
  const platform = createRecommendationPlatform();
  const scored = platform.scoreActivity(activities()[0], { trip: trip(), preferences: preferences() });

  assert.equal(scored.type, RECOMMENDATION_TYPE.ACTIVITY);
  assert.equal(scored.itemId, 'act_surf');
  assert.equal(scored.score, 92.55);
  assert.equal(scored.confidence, 0.86);
  assert.match(scored.explanation, /Beginner surf lesson/);
  assert.ok(scored.sourceFactors.find(factor => factor.factor === SCORE_FACTOR.ACTIVITY_PREFERENCES));
});

test('scores a destination deterministically', () => {
  const platform = createRecommendationPlatform();
  const scored = platform.scoreDestination(destinations()[0], { trip: trip(), preferences: preferences() });

  assert.equal(scored.type, RECOMMENDATION_TYPE.DESTINATION);
  assert.equal(scored.itemId, 'dest_bali_canggu');
  assert.ok(scored.score > 80);
  assert.ok(scored.explanation.includes('Canggu'));
});

test('generates ranked recommendations across supported types', async () => {
  const platform = createRecommendationPlatform();
  const run = await platform.generateRecommendations({
    trip: trip(),
    preferences: preferences(),
    destinations: destinations(),
    activities: activities(),
    accommodations: [{
      id: 'stay_hostel',
      name: 'Quiet social hostel',
      budgetLevel: 'budget',
      tags: ['backpacking', 'social'],
      languages: ['en', 'id'],
      transportOptions: ['walking'],
      crowdLevel: 'moderate',
      riskLevel: 'low',
      recommendedPace: 'slow',
      climateTags: ['coastal'],
      accessibility: { supports: ['step-free access'] },
    }],
    transportOptions: [{
      id: 'transport_walk',
      name: 'Walkable local route',
      transportPreferences: ['walking'],
      riskLevel: 'low',
      crowdLevel: 'low',
      recommendedPace: 'slow',
      languages: ['en'],
    }],
  });

  assert.equal(run.deterministic, true);
  assert.equal(run.aiUsed, false);
  assert.ok(run.recommendations.length >= 7);
  assert.equal(run.recommendations[0].score >= run.recommendations[1].score, true);
  assert.ok(run.recommendations.some(rec => rec.type === RECOMMENDATION_TYPE.FOOD));
  assert.ok(run.recommendations.some(rec => rec.type === RECOMMENDATION_TYPE.SAFETY));
  assert.ok(run.recommendations.some(rec => rec.type === RECOMMENDATION_TYPE.WEATHER_SUITABILITY));
  assert.ok(run.recommendations.some(rec => rec.type === RECOMMENDATION_TYPE.ACCOMMODATION));
  assert.ok(run.recommendations.some(rec => rec.type === RECOMMENDATION_TYPE.TRANSPORT));
  assert.equal(run.recommendations.some(rec => rec.itemId === 'act_private'), false);
  assert.equal(run.recommendations.some(rec => rec.itemId === 'act_inactive'), false);
});

test('ranks recommendations by score confidence and item id', () => {
  const platform = createRecommendationPlatform();
  const ranked = platform.rankRecommendations([
    { itemId: 'b', score: 80, confidence: 0.7 },
    { itemId: 'a', score: 90, confidence: 0.5 },
    { itemId: 'c', score: 90, confidence: 0.8 },
  ]);

  assert.deepEqual(ranked.map(item => item.itemId), ['c', 'a', 'b']);
});

test('explains a recommendation without recomputing it', () => {
  const platform = createRecommendationPlatform();
  const recommendation = platform.scoreActivity(activities()[0], { trip: trip(), preferences: preferences() });
  const explanation = platform.explainRecommendation(recommendation);

  assert.equal(explanation.recommendationId, recommendation.recommendationId);
  assert.equal(explanation.score, recommendation.score);
  assert.equal(explanation.confidence, recommendation.confidence);
  assert.deepEqual(explanation.sourceFactors, recommendation.sourceFactors);
});

test('rejects exact traveller location in inputs', async () => {
  const platform = createRecommendationPlatform();

  await assert.rejects(() => platform.generateRecommendations({
    trip: trip(),
    preferences: preferences(),
    destinations: destinations(),
    activities: activities(),
    latitude: -8.65,
  }), /must not include exact traveller location/);

  assert.throws(() => platform.scoreActivity({ ...activities()[0], exactLocation: 'specific villa' }, {
    trip: trip(),
    preferences: preferences(),
  }), /must not include exact traveller location/);
});

test('validates required context and recommendation type', () => {
  const platform = createRecommendationPlatform();

  assert.throws(() => platform.scoreActivity(null, { trip: trip(), preferences: preferences() }), /activity must be an object/);
  assert.throws(() => platform.scoreActivity(activities()[0], { trip: null, preferences: preferences() }), /trip must be an object/);
  assert.throws(() => platform.scoreDestination(destinations()[0], { trip: trip(), preferences: null }), /preferences must be an object/);
  assert.throws(() => platform.rankRecommendations({}), /recommendations must be an array/);
  assert.throws(() => platform.explainRecommendation({ type: 'ai_magic' }), /Unsupported recommendation type/);
});

test('stores generated recommendation runs and audit events', async () => {
  const platform = createRecommendationPlatform();
  const run = await platform.generateRecommendations({
    trip: trip(),
    preferences: preferences(),
    destinations: destinations(),
    activities: activities(),
    limit: 3,
  });

  const runs = await platform.getRecommendationRunsForTraveller('idn_traveller_1');
  const auditEvents = await platform.getAuditEvents({ recommendationRunId: run.recommendationRunId });

  assert.equal(runs.length, 1);
  assert.equal(runs[0].recommendationRunId, run.recommendationRunId);
  assert.equal(run.recommendations.length, 3);
  assert.deepEqual(auditEvents.map(event => event.action), ['RECOMMENDATIONS_GENERATED']);
});
