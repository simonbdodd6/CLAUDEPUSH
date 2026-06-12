import { randomUUID } from 'crypto';
import {
  DEFAULT_SCORE_WEIGHTS,
  RECOMMENDATION_AUDIT_ACTIONS,
  RECOMMENDATION_TYPE,
  SCORE_FACTOR,
} from './constants.js';
import { InMemoryRecommendationRepository } from './repository.js';
import { validationError } from './errors.js';

const RECOMMENDATION_TYPES = new Set(Object.values(RECOMMENDATION_TYPE));
const ACTIVE_ACTIVITY_STATUS = 'active';
const PUBLIC_ACTIVITY_VISIBILITY = 'public';
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
    throw validationError('Recommendation inputs must not include exact traveller location', { fields: present });
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

function unique(values) {
  return [...new Set(asArray(values).map(normalizeString).filter(Boolean))];
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, precision = 2) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function ratio(matches, total) {
  if (!total) return 0.5;
  return clamp(matches / total, 0, 1);
}

function daysBetween(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function budgetAmount(preferences) {
  return preferences?.maximumDailyBudget?.amount == null ? null : Number(preferences.maximumDailyBudget.amount);
}

function activityDailyCost(activity) {
  if (!activity?.estimatedCostRange) return null;
  const min = Number(activity.estimatedCostRange.min ?? 0);
  const max = Number(activity.estimatedCostRange.max ?? min);
  return Number.isFinite(min) && Number.isFinite(max) ? (min + max) / 2 : null;
}

function scoreBudgetForActivity(activity, preferences) {
  const maxDailyBudget = budgetAmount(preferences);
  const cost = activityDailyCost(activity);
  if (maxDailyBudget == null || cost == null) return 0.5;
  if (cost <= maxDailyBudget * 0.35) return 1;
  if (cost <= maxDailyBudget * 0.7) return 0.85;
  if (cost <= maxDailyBudget) return 0.65;
  if (cost <= maxDailyBudget * 1.25) return 0.35;
  return 0.1;
}

function scoreBudgetForDestination(destination, preferences) {
  const budgetLevel = normalizeString(preferences?.budgetLevel);
  const destinationBudget = normalizeString(destination?.budgetLevel ?? destination?.costLevel);
  if (!budgetLevel || !destinationBudget) return 0.5;
  if (budgetLevel === destinationBudget) return 1;
  const ordered = ['shoestring', 'budget', 'mid_range', 'premium', 'luxury'];
  const distance = Math.abs(ordered.indexOf(budgetLevel) - ordered.indexOf(destinationBudget));
  if (distance === 1) return 0.75;
  if (distance === 2) return 0.45;
  return 0.2;
}

function scoreTripDurationForActivity(activity, trip, preferences) {
  const tripDays = daysBetween(trip?.startDate, trip?.endDate);
  const preferredDuration = preferences?.preferredTripDuration;
  const durationMinutes = activity?.duration?.maxMinutes ?? activity?.duration?.minMinutes;
  if (!tripDays || !durationMinutes) return 0.5;
  if (tripDays <= 3 && durationMinutes > 360) return 0.25;
  if (tripDays <= 3 && durationMinutes <= 180) return 1;
  if (preferredDuration?.maxDays && tripDays > preferredDuration.maxDays && durationMinutes <= 180) return 0.85;
  return 0.7;
}

function scoreTripDurationForDestination(destination, trip, preferences) {
  const tripDays = daysBetween(trip?.startDate, trip?.endDate);
  const idealMin = destination?.idealTripDuration?.minDays ?? preferences?.preferredTripDuration?.minDays;
  const idealMax = destination?.idealTripDuration?.maxDays ?? preferences?.preferredTripDuration?.maxDays;
  if (!tripDays || !idealMin || !idealMax) return 0.5;
  if (tripDays >= idealMin && tripDays <= idealMax) return 1;
  if (tripDays < idealMin) return clamp(tripDays / idealMin, 0.2, 0.8);
  return clamp(idealMax / tripDays, 0.2, 0.8);
}

function scoreActivityPreferences(activity, preferences) {
  const preferred = unique(preferences?.preferredActivityCategories);
  const categories = unique(activity?.categories);
  const matched = categories.filter(category => preferred.includes(category)).length;
  return ratio(matched, Math.max(preferred.length, 1));
}

function scoreTravellerInterests(item, preferences) {
  const travelStyles = unique(preferences?.travelStyles);
  const tags = unique([...(item?.tags ?? []), ...(item?.travelStyles ?? []), ...(item?.categories ?? [])]);
  const favouriteDestinations = unique(preferences?.favouriteDestinations);
  const favouriteActivities = unique(preferences?.favouriteActivities);
  let base = ratio(tags.filter(tag => travelStyles.includes(tag)).length, Math.max(travelStyles.length, 1));
  if (item?.destinationId && favouriteDestinations.includes(normalizeString(item.destinationId))) base += 0.25;
  if (item?.activityId && favouriteActivities.includes(normalizeString(item.activityId))) base += 0.25;
  return clamp(base);
}

function scoreAccessibility(item, preferences) {
  const requirements = unique(preferences?.accessibilityRequirements?.requirements);
  if (!requirements.length) return 1;
  const supported = unique(item?.accessibility?.supports ?? item?.accessibilityRequirements ?? []);
  return ratio(requirements.filter(requirement => supported.includes(requirement)).length, requirements.length);
}

function scoreTravelPace(item, preferences) {
  const pace = normalizeString(preferences?.preferredTravelPace);
  const itemPace = normalizeString(item?.recommendedPace ?? item?.pace);
  if (!pace || !itemPace) return 0.5;
  if (pace === itemPace) return 1;
  if (pace === 'balanced') return 0.75;
  return 0.35;
}

function scoreCrowdTolerance(item, preferences) {
  const tolerance = normalizeString(preferences?.crowdTolerance);
  const crowdLevel = normalizeString(item?.crowdLevel);
  if (!tolerance || !crowdLevel) return 0.5;
  const levels = { low: 1, moderate: 2, high: 3 };
  if (!levels[tolerance] || !levels[crowdLevel]) return 0.5;
  return levels[crowdLevel] <= levels[tolerance] ? 1 : 0.25;
}

function scoreClimate(item, preferences) {
  const preferred = unique(preferences?.climatePreferences);
  if (!preferred.length) return 0.5;
  const climates = unique(item?.climateTags ?? item?.climates ?? []);
  return ratio(climates.filter(climate => preferred.includes(climate)).length, preferred.length);
}

function scoreLanguages(item, preferences) {
  const preferred = unique(preferences?.languages);
  if (!preferred.length) return 0.5;
  const languages = unique(item?.languages);
  return ratio(languages.filter(language => preferred.includes(language)).length, preferred.length);
}

function scoreTransport(item, preferences) {
  const preferred = unique(preferences?.transportPreferences);
  if (!preferred.length) return 0.5;
  const options = unique(item?.transportOptions ?? item?.transportPreferences ?? []);
  return ratio(options.filter(option => preferred.includes(option)).length, preferred.length);
}

function scoreRisk(item, preferences) {
  const tolerance = normalizeString(preferences?.riskTolerance);
  const riskLevel = normalizeString(item?.riskLevel ?? item?.safetyRiskLevel);
  if (!tolerance || !riskLevel) return 0.5;
  const levels = { very_low: 1, low: 2, moderate: 3, high: 4 };
  if (!levels[tolerance] || !levels[riskLevel]) return 0.5;
  return levels[riskLevel] <= levels[tolerance] ? 1 : 0.15;
}

function buildFactorScores(item, context, mode) {
  const { trip, preferences } = context;
  return {
    [SCORE_FACTOR.TRAVELLER_INTERESTS]: scoreTravellerInterests(item, preferences),
    [SCORE_FACTOR.BUDGET]: mode === RECOMMENDATION_TYPE.ACTIVITY
      ? scoreBudgetForActivity(item, preferences)
      : scoreBudgetForDestination(item, preferences),
    [SCORE_FACTOR.TRIP_DURATION]: mode === RECOMMENDATION_TYPE.ACTIVITY
      ? scoreTripDurationForActivity(item, trip, preferences)
      : scoreTripDurationForDestination(item, trip, preferences),
    [SCORE_FACTOR.ACTIVITY_PREFERENCES]: mode === RECOMMENDATION_TYPE.ACTIVITY ? scoreActivityPreferences(item, preferences) : 0.5,
    [SCORE_FACTOR.ACCESSIBILITY]: scoreAccessibility(item, preferences),
    [SCORE_FACTOR.TRAVEL_PACE]: scoreTravelPace(item, preferences),
    [SCORE_FACTOR.CROWD_TOLERANCE]: scoreCrowdTolerance(item, preferences),
    [SCORE_FACTOR.CLIMATE_PREFERENCE]: scoreClimate(item, preferences),
    [SCORE_FACTOR.LANGUAGE_PREFERENCE]: scoreLanguages(item, preferences),
    [SCORE_FACTOR.TRANSPORT_PREFERENCE]: scoreTransport(item, preferences),
    [SCORE_FACTOR.RISK_TOLERANCE]: scoreRisk(item, preferences),
  };
}

function weightedScore(factorScores, weights) {
  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const weighted = entries.reduce((sum, [factor, weight]) => sum + (factorScores[factor] ?? 0.5) * weight, 0);
  return round((weighted / totalWeight) * 100);
}

function buildExplanation(type, item, factorScores) {
  const strong = Object.entries(factorScores)
    .filter(([, score]) => score >= 0.8)
    .map(([factor]) => factor.replaceAll('_', ' '));
  const weak = Object.entries(factorScores)
    .filter(([, score]) => score <= 0.35)
    .map(([factor]) => factor.replaceAll('_', ' '));
  const name = item.name ?? item.destination ?? item.activityId ?? item.destinationId ?? type;
  const positive = strong.length ? `Strong match on ${strong.slice(0, 3).join(', ')}.` : 'Moderate overall match.';
  const caution = weak.length ? ` Lower match on ${weak.slice(0, 2).join(', ')}.` : '';
  return `${name} is recommended as a ${type} option. ${positive}${caution}`;
}

function confidenceFromFactors(factorScores) {
  const known = Object.values(factorScores).filter(score => score !== 0.5).length;
  return round(clamp(0.45 + known * 0.045, 0.45, 0.95));
}

function buildRecommendation(type, item, context, weights) {
  const factorScores = buildFactorScores(item, context, type);
  const score = weightedScore(factorScores, weights);
  const confidence = confidenceFromFactors(factorScores);
  const sourceFactors = Object.entries(factorScores).map(([factor, factorScore]) => ({
    factor,
    score: round(factorScore),
    weight: weights[factor],
  }));
  return {
    recommendationId: `rec_${randomUUID()}`,
    type,
    itemId: item.activityId ?? item.destinationId ?? item.id ?? item.name,
    item: clone(item),
    score,
    confidence,
    explanation: buildExplanation(type, item, factorScores),
    sourceFactors,
  };
}

function derivedFoodRecommendations(activities, context, weights) {
  return asArray(activities)
    .filter(activity => unique(activity.categories).includes('food'))
    .map(activity => buildRecommendation(RECOMMENDATION_TYPE.FOOD, activity, context, weights));
}

function derivedSafetyRecommendations(destinations, context, weights) {
  return asArray(destinations)
    .filter(destination => destination.safetyNotes?.length || destination.safetyRiskLevel || destination.riskLevel)
    .map(destination => buildRecommendation(RECOMMENDATION_TYPE.SAFETY, destination, context, weights));
}

function derivedWeatherRecommendations(activities, context, weights) {
  return asArray(activities)
    .filter(activity => ['low', 'medium'].includes(normalizeString(activity.weatherSensitivity)))
    .map(activity => buildRecommendation(RECOMMENDATION_TYPE.WEATHER_SUITABILITY, activity, context, weights));
}

export function createRecommendationPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryRecommendationRepository();
  const weights = { ...DEFAULT_SCORE_WEIGHTS, ...(options.weights ?? {}) };

  async function audit(action, recommendationRunId, details = {}) {
    return repository.appendAudit({
      action,
      recommendationRunId,
      details,
    });
  }

  function scoreActivity(activity, context = {}) {
    assertObject(activity, 'activity');
    const trip = assertObject(context.trip, 'trip');
    const preferences = assertObject(context.preferences, 'preferences');
    return buildRecommendation(RECOMMENDATION_TYPE.ACTIVITY, activity, { trip, preferences }, weights);
  }

  function scoreDestination(destination, context = {}) {
    assertObject(destination, 'destination');
    const trip = assertObject(context.trip, 'trip');
    const preferences = assertObject(context.preferences, 'preferences');
    return buildRecommendation(RECOMMENDATION_TYPE.DESTINATION, destination, { trip, preferences }, weights);
  }

  function rankRecommendations(recommendations = []) {
    if (!Array.isArray(recommendations)) throw validationError('recommendations must be an array');
    return recommendations
      .map(clone)
      .sort((a, b) => b.score - a.score || b.confidence - a.confidence || String(a.itemId).localeCompare(String(b.itemId)));
  }

  function explainRecommendation(recommendation) {
    assertObject(recommendation, 'recommendation');
    if (!RECOMMENDATION_TYPES.has(recommendation.type)) {
      throw validationError('Unsupported recommendation type', { type: recommendation.type });
    }
    return {
      recommendationId: recommendation.recommendationId,
      type: recommendation.type,
      score: recommendation.score,
      confidence: recommendation.confidence,
      explanation: recommendation.explanation,
      sourceFactors: clone(recommendation.sourceFactors ?? []),
    };
  }

  async function generateRecommendations(input = {}) {
    assertNoExactLocation(input);
    const trip = assertObject(input.trip, 'trip');
    const preferences = assertObject(input.preferences, 'preferences');
    const destinations = asArray(input.destinations);
    const activities = asArray(input.activities)
      .filter(activity => activity.status === ACTIVE_ACTIVITY_STATUS)
      .filter(activity => activity.visibility === PUBLIC_ACTIVITY_VISIBILITY);
    const context = { trip, preferences };

    const recommendations = rankRecommendations([
      ...destinations.map(destination => scoreDestination(destination, context)),
      ...activities.map(activity => scoreActivity(activity, context)),
      ...derivedFoodRecommendations(activities, context, weights),
      ...derivedSafetyRecommendations(destinations, context, weights),
      ...derivedWeatherRecommendations(activities, context, weights),
      ...asArray(input.accommodations).map(item => buildRecommendation(RECOMMENDATION_TYPE.ACCOMMODATION, item, context, weights)),
      ...asArray(input.transportOptions).map(item => buildRecommendation(RECOMMENDATION_TYPE.TRANSPORT, item, context, weights)),
    ]).slice(0, input.limit ?? 25);

    const run = {
      recommendationRunId: input.recommendationRunId ?? `recrun_${randomUUID()}`,
      travellerIdentityId: preferences.travellerIdentityId ?? trip.ownerIdentityId ?? null,
      tripId: trip.tripId ?? null,
      generatedAt: now(),
      deterministic: true,
      aiUsed: false,
      recommendations,
    };
    await repository.saveRun(run);
    await audit(RECOMMENDATION_AUDIT_ACTIONS.RECOMMENDATIONS_GENERATED, run.recommendationRunId, {
      count: recommendations.length,
      tripId: run.tripId,
      travellerIdentityId: run.travellerIdentityId,
    });
    return clone(run);
  }

  async function getRecommendationRunsForTraveller(travellerIdentityId) {
    return repository.listRunsForTraveller(travellerIdentityId);
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    generateRecommendations,
    scoreDestination,
    scoreActivity,
    rankRecommendations,
    explainRecommendation,
    getRecommendationRunsForTraveller,
    getAuditEvents,
  };
}
