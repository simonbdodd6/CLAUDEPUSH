import { randomUUID } from 'crypto';
import {
  DEFAULT_SLOT_SCORE_BONUS,
  TRIP_PLAN_AUDIT_ACTIONS,
  TRIP_PLAN_GAP_TYPE,
  TRIP_PLAN_SLOT,
} from './constants.js';
import { InMemoryTripIntelligenceRepository } from './repository.js';
import { notFoundError, validationError } from './errors.js';

const EXACT_LOCATION_FIELDS = [
  'coordinates',
  'coordinate',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'exactLocation',
  'liveLocation',
  'travellerLocation',
  'currentLocation',
];

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertNoExactLocation(input = {}) {
  const present = EXACT_LOCATION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) {
    throw validationError('Trip intelligence inputs must not include exact traveller location', { fields: present });
  }
}

function assertObject(value, field) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(`${field} must be an object`, { field });
  }
  assertNoExactLocation(value);
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeString(value) {
  return String(value ?? '').trim().toLowerCase();
}

function round(value, precision = 2) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function daysBetween(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function addDays(dateString, days) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function recommendationScore(recommendation) {
  return Number(recommendation?.score ?? 0);
}

function recommendationConfidence(recommendation) {
  return Number(recommendation?.confidence ?? 0);
}

function sourceFactors(recommendation) {
  return clone(recommendation?.sourceFactors ?? []);
}

function itemName(recommendation) {
  return recommendation?.item?.name ?? recommendation?.itemId ?? recommendation?.type ?? 'recommendation';
}

function isActivityRecommendation(recommendation) {
  return ['activity', 'food', 'weather_suitability'].includes(recommendation?.type);
}

function isEveningFriendly(recommendation) {
  const categories = asArray(recommendation?.item?.categories).map(normalizeString);
  return ['food', 'culture', 'nightlife', 'wellness'].some(category => categories.includes(category))
    || ['food', 'safety', 'transport'].includes(recommendation?.type);
}

function isRainyDayFriendly(recommendation) {
  const sensitivity = normalizeString(recommendation?.item?.weatherSensitivity);
  const environment = normalizeString(recommendation?.item?.environment);
  return ['low', 'medium'].includes(sensitivity) || ['indoor', 'mixed'].includes(environment);
}

function rankForSlot(recommendations, slot, usedIds = new Set()) {
  return asArray(recommendations)
    .filter(recommendation => !usedIds.has(recommendation.recommendationId))
    .filter(recommendation => {
      if (slot === TRIP_PLAN_SLOT.RAINY_DAY_BACKUP) return isRainyDayFriendly(recommendation);
      if (slot === TRIP_PLAN_SLOT.EVENING) return isEveningFriendly(recommendation);
      return isActivityRecommendation(recommendation) || recommendation.type === 'destination';
    })
    .map(recommendation => ({
      recommendation,
      slotScore: recommendationScore(recommendation)
        + recommendationConfidence(recommendation) * 10
        + (DEFAULT_SLOT_SCORE_BONUS[slot] ?? 0),
    }))
    .sort((a, b) => b.slotScore - a.slotScore || String(a.recommendation.itemId).localeCompare(String(b.recommendation.itemId)))
    .map(entry => entry.recommendation);
}

function buildSuggestion(slot, recommendation = null) {
  if (!recommendation) {
    return {
      slot,
      recommendationId: null,
      type: null,
      itemId: null,
      title: 'No suitable suggestion yet',
      score: 0,
      confidence: 0,
      explanation: 'No recommendation met the deterministic planner rules for this slot.',
      sourceFactors: [],
    };
  }

  return {
    slot,
    recommendationId: recommendation.recommendationId,
    type: recommendation.type,
    itemId: recommendation.itemId,
    title: itemName(recommendation),
    score: recommendation.score,
    confidence: recommendation.confidence,
    explanation: recommendation.explanation,
    sourceFactors: sourceFactors(recommendation),
  };
}

function extractBudgetNote(daySuggestions, preferences) {
  const budget = preferences?.maximumDailyBudget;
  const estimatedCosts = daySuggestions
    .map(suggestion => suggestion?.sourceFactors?.find(factor => factor.factor === 'budget')?.score)
    .filter(score => typeof score === 'number');
  const budgetFit = estimatedCosts.length
    ? round(estimatedCosts.reduce((sum, score) => sum + score, 0) / estimatedCosts.length)
    : null;
  if (!budget) return 'No maximum daily budget supplied; budget fit is estimated from recommendation scores only.';
  if (budgetFit != null && budgetFit < 0.4) return `Some suggestions may stretch the daily budget of ${budget.amount} ${budget.currency}.`;
  return `Plan is designed to fit around the daily budget of ${budget.amount} ${budget.currency}.`;
}

function extractSafetyNote(daySuggestions, destination) {
  const riskFactors = daySuggestions
    .flatMap(suggestion => suggestion.sourceFactors ?? [])
    .filter(factor => factor.factor === 'risk_tolerance');
  const lowRisk = riskFactors.every(factor => factor.score >= 0.5);
  const destinationNote = asArray(destination?.safetyNotes)[0];
  if (destinationNote) return `${destinationNote}${lowRisk ? ' Recommendations fit stated risk tolerance.' : ' Review risk fit before booking.'}`;
  return lowRisk ? 'No major deterministic safety concern detected from recommendation factors.' : 'Review safety risk before following this plan.';
}

function extractTransportNote(daySuggestions, preferences) {
  const preferred = asArray(preferences?.transportPreferences);
  if (!preferred.length) return 'No transport preferences supplied; keep transport flexible.';
  const transportScores = daySuggestions
    .flatMap(suggestion => suggestion.sourceFactors ?? [])
    .filter(factor => factor.factor === 'transport_preference');
  const average = transportScores.length
    ? transportScores.reduce((sum, factor) => sum + factor.score, 0) / transportScores.length
    : 0.5;
  return average >= 0.6
    ? `Transport fit is aligned with preferred options: ${preferred.join(', ')}.`
    : `Transport may need manual review against preferred options: ${preferred.join(', ')}.`;
}

function buildWhyThisFits(daySuggestions, preferences) {
  const topFactors = daySuggestions
    .flatMap(suggestion => suggestion.sourceFactors ?? [])
    .filter(factor => factor.score >= 0.8)
    .map(factor => factor.factor)
    .filter((factor, index, all) => all.indexOf(factor) === index)
    .slice(0, 4);
  const pace = preferences?.preferredTravelPace ? ` It follows a ${preferences.preferredTravelPace} pace.` : '';
  return topFactors.length
    ? `This plan fits because it scores strongly on ${topFactors.join(', ')}.${pace}`
    : `This plan is a moderate deterministic fit based on available recommendation scores.${pace}`;
}

function findDestinationForTrip(trip, destinations) {
  const normalizedDestination = normalizeString(trip?.destination);
  const normalizedArea = normalizeString(trip?.area);
  return asArray(destinations).find(destination => normalizeString(destination.name) === normalizedArea)
    ?? asArray(destinations).find(destination => normalizeString(destination.name) === normalizedDestination)
    ?? asArray(destinations)[0]
    ?? null;
}

function buildDailyPlan({ trip, destination, preferences, recommendations, dayIndex }) {
  const used = new Set();
  const morning = rankForSlot(recommendations, TRIP_PLAN_SLOT.MORNING, used)[0] ?? null;
  if (morning) used.add(morning.recommendationId);
  const afternoon = rankForSlot(recommendations, TRIP_PLAN_SLOT.AFTERNOON, used)[0] ?? null;
  if (afternoon) used.add(afternoon.recommendationId);
  const evening = rankForSlot(recommendations, TRIP_PLAN_SLOT.EVENING, used)[0] ?? null;
  if (evening) used.add(evening.recommendationId);
  const backup = rankForSlot(recommendations, TRIP_PLAN_SLOT.RAINY_DAY_BACKUP, used)[0] ?? null;

  const suggestions = [
    buildSuggestion(TRIP_PLAN_SLOT.MORNING, morning),
    buildSuggestion(TRIP_PLAN_SLOT.AFTERNOON, afternoon),
    buildSuggestion(TRIP_PLAN_SLOT.EVENING, evening),
    buildSuggestion(TRIP_PLAN_SLOT.RAINY_DAY_BACKUP, backup),
  ];
  const primarySuggestions = suggestions.filter(suggestion => suggestion.slot !== TRIP_PLAN_SLOT.RAINY_DAY_BACKUP);

  return {
    day: dayIndex + 1,
    date: addDays(trip.startDate, dayIndex),
    destinationFocus: destination?.name ?? trip.destination ?? null,
    morningSuggestion: suggestions[0],
    afternoonSuggestion: suggestions[1],
    eveningSuggestion: suggestions[2],
    backupRainyDayOption: suggestions[3],
    safetyNote: extractSafetyNote(primarySuggestions, destination),
    transportNote: extractTransportNote(primarySuggestions, preferences),
    budgetNote: extractBudgetNote(primarySuggestions, preferences),
    whyThisPlanFits: buildWhyThisFits(primarySuggestions, preferences),
  };
}

function detectGaps(plan) {
  const gaps = [];
  if (!plan.recommendationsUsed.length) gaps.push({ type: TRIP_PLAN_GAP_TYPE.NO_RECOMMENDATIONS, severity: 'high' });
  for (const day of plan.dailyPlans) {
    if (!day.morningSuggestion.recommendationId) gaps.push({ type: TRIP_PLAN_GAP_TYPE.NO_MORNING_ACTIVITY, severity: 'medium', day: day.day });
    if (!day.afternoonSuggestion.recommendationId) gaps.push({ type: TRIP_PLAN_GAP_TYPE.NO_AFTERNOON_ACTIVITY, severity: 'medium', day: day.day });
    if (!day.eveningSuggestion.recommendationId) gaps.push({ type: TRIP_PLAN_GAP_TYPE.NO_EVENING_ACTIVITY, severity: 'low', day: day.day });
    if (!day.backupRainyDayOption.recommendationId) gaps.push({ type: TRIP_PLAN_GAP_TYPE.NO_RAINY_DAY_BACKUP, severity: 'medium', day: day.day });
    const riskScores = [
      day.morningSuggestion,
      day.afternoonSuggestion,
      day.eveningSuggestion,
    ].flatMap(suggestion => suggestion.sourceFactors ?? [])
      .filter(factor => factor.factor === 'risk_tolerance')
      .map(factor => factor.score);
    if (riskScores.some(score => score < 0.35)) gaps.push({ type: TRIP_PLAN_GAP_TYPE.HIGH_RISK_DAY, severity: 'high', day: day.day });
  }
  return gaps;
}

export function createTripIntelligencePlatform(options = {}) {
  const repository = options.repository ?? new InMemoryTripIntelligenceRepository();

  async function audit(action, tripPlanId, details = {}) {
    return repository.appendAudit({
      action,
      tripPlanId,
      details,
    });
  }

  function suggestDestinationFocus({ trip, destinations = [], recommendations = [] } = {}) {
    const destination = findDestinationForTrip(assertObject(trip, 'trip'), destinations);
    const topDestinationRecommendation = asArray(recommendations)
      .filter(recommendation => recommendation.type === 'destination')
      .sort((a, b) => recommendationScore(b) - recommendationScore(a))[0];
    return {
      destinationId: topDestinationRecommendation?.itemId ?? destination?.destinationId ?? null,
      name: topDestinationRecommendation?.item?.name ?? destination?.name ?? trip.destination ?? null,
      explanation: topDestinationRecommendation?.explanation ?? `Focus is based on the trip destination: ${trip.destination}.`,
      sourceFactors: sourceFactors(topDestinationRecommendation),
    };
  }

  function suggestActivitiesForDay({ recommendations = [], dayIndex = 0 } = {}) {
    const ranked = asArray(recommendations)
      .filter(isActivityRecommendation)
      .sort((a, b) => recommendationScore(b) - recommendationScore(a) || String(a.itemId).localeCompare(String(b.itemId)));
    return ranked.slice(dayIndex * 3, dayIndex * 3 + 3);
  }

  function generateDailyPlan(input = {}) {
    const trip = assertObject(input.trip, 'trip');
    const preferences = assertObject(input.preferences, 'preferences');
    assertNoExactLocation(input);
    const destination = input.destination ?? findDestinationForTrip(trip, input.destinations ?? []);
    if (destination) assertNoExactLocation(destination);
    return buildDailyPlan({
      trip,
      destination,
      preferences,
      recommendations: input.recommendations ?? [],
      dayIndex: input.dayIndex ?? 0,
    });
  }

  function detectTripGaps(plan) {
    assertObject(plan, 'tripPlan');
    return detectGaps(plan);
  }

  function explainTripPlan(plan) {
    assertObject(plan, 'tripPlan');
    return {
      tripPlanId: plan.tripPlanId,
      tripId: plan.tripId,
      explanation: plan.explanation,
      sourceFactors: clone(plan.sourceFactors ?? []),
      gapCount: asArray(plan.gaps).length,
      dailySummary: asArray(plan.dailyPlans).map(day => ({
        day: day.day,
        date: day.date,
        destinationFocus: day.destinationFocus,
        morning: day.morningSuggestion.title,
        afternoon: day.afternoonSuggestion.title,
        evening: day.eveningSuggestion.title,
      })),
    };
  }

  async function generateTripPlan(input = {}) {
    assertNoExactLocation(input);
    const trip = assertObject(input.trip, 'trip');
    const preferences = assertObject(input.preferences, 'preferences');
    const destinations = asArray(input.destinations);
    const destination = findDestinationForTrip(trip, destinations);
    const recommendations = asArray(input.recommendations)
      .map(clone)
      .sort((a, b) => recommendationScore(b) - recommendationScore(a) || recommendationConfidence(b) - recommendationConfidence(a));
    const days = Math.min(input.maxDays ?? 3, daysBetween(trip.startDate, trip.endDate));
    const dailyPlans = Array.from({ length: days }, (_, dayIndex) => buildDailyPlan({
      trip,
      destination,
      preferences,
      recommendations,
      dayIndex,
    }));
    const recommendationsUsed = [...new Set(dailyPlans.flatMap(day => [
      day.morningSuggestion.recommendationId,
      day.afternoonSuggestion.recommendationId,
      day.eveningSuggestion.recommendationId,
      day.backupRainyDayOption.recommendationId,
    ]).filter(Boolean))];
    const focus = suggestDestinationFocus({ trip, destinations, recommendations });
    const sourceFactors = recommendations
      .slice(0, 5)
      .flatMap(recommendation => recommendation.sourceFactors ?? [])
      .filter((factor, index, all) => all.findIndex(other => other.factor === factor.factor) === index);

    const plan = {
      tripPlanId: input.tripPlanId ?? `tripplan_${randomUUID()}`,
      tripId: trip.tripId ?? null,
      travellerIdentityId: preferences.travellerIdentityId ?? trip.ownerIdentityId ?? null,
      generatedAt: now(),
      deterministic: true,
      aiUsed: false,
      destinationFocus: focus,
      dailyPlans,
      recommendationsUsed,
      sourceFactors,
      explanation: `Generated deterministic trip plan from ${recommendations.length} ranked recommendations for ${trip.destination}.`,
      gaps: [],
    };
    plan.gaps = detectGaps(plan);
    await repository.savePlan(plan);
    await audit(TRIP_PLAN_AUDIT_ACTIONS.TRIP_PLAN_GENERATED, plan.tripPlanId, {
      tripId: plan.tripId,
      days: plan.dailyPlans.length,
      recommendationsUsed: plan.recommendationsUsed.length,
      gaps: plan.gaps.length,
    });
    return clone(plan);
  }

  async function getTripPlansForTrip(tripId) {
    return repository.listPlansForTrip(tripId);
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    generateTripPlan,
    generateDailyPlan,
    suggestActivitiesForDay,
    suggestDestinationFocus,
    detectTripGaps,
    explainTripPlan,
    getTripPlansForTrip,
    getAuditEvents,
  };
}
