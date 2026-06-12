import { randomUUID } from 'crypto';
import {
  ACCOMMODATION_STYLE,
  BUDGET_LEVEL,
  CLIMATE_PREFERENCE,
  CROWD_TOLERANCE,
  FITNESS_LEVEL,
  PREFERRED_ACTIVITY_CATEGORY,
  PREFERENCES_AUDIT_ACTIONS,
  RISK_TOLERANCE,
  TRANSPORT_PREFERENCE,
  TRAVEL_PACE,
  TRAVEL_STYLE,
} from './constants.js';
import { InMemoryTravellerPreferencesRepository } from './repository.js';
import { conflictError, notFoundError, permissionError, validationError } from './errors.js';

const VALID_BUDGET_LEVELS = new Set(Object.values(BUDGET_LEVEL));
const VALID_ACCOMMODATION_STYLES = new Set(Object.values(ACCOMMODATION_STYLE));
const VALID_TRAVEL_STYLES = new Set(Object.values(TRAVEL_STYLE));
const VALID_ACTIVITY_CATEGORIES = new Set(Object.values(PREFERRED_ACTIVITY_CATEGORY));
const VALID_FITNESS_LEVELS = new Set(Object.values(FITNESS_LEVEL));
const VALID_RISK_TOLERANCES = new Set(Object.values(RISK_TOLERANCE));
const VALID_CROWD_TOLERANCES = new Set(Object.values(CROWD_TOLERANCE));
const VALID_CLIMATE_PREFERENCES = new Set(Object.values(CLIMATE_PREFERENCE));
const VALID_TRAVEL_PACES = new Set(Object.values(TRAVEL_PACE));
const VALID_TRANSPORT_PREFERENCES = new Set(Object.values(TRANSPORT_PREFERENCE));
const PRIVILEGED_ACTOR_TYPES = new Set(['ADMINISTRATOR', 'MODERATOR', 'SYSTEM']);
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

function requireActor(actor, action) {
  if (!actor?.id) throw permissionError(`Actor is required for ${action}`, { action });
}

function canManage(travellerIdentityId, actor) {
  return actor?.id === travellerIdentityId || PRIVILEGED_ACTOR_TYPES.has(actor?.type);
}

function assertOwner(travellerIdentityId, actor, action) {
  requireActor(actor, action);
  if (canManage(travellerIdentityId, actor)) return;
  throw permissionError('Actor cannot access traveller preferences', {
    action,
    travellerIdentityId,
    actorId: actor.id,
  });
}

function assertNoExactLocation(input = {}) {
  const present = EXACT_LOCATION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) {
    throw validationError('Traveller preferences must not store exact traveller location', { fields: present });
  }
}

function assertRequiredString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validationError(`${field} is required`, { field });
  }
  return value.trim();
}

function normalizeEnum(value, validValues, field, fallback) {
  const candidate = value ?? fallback;
  if (!validValues.has(candidate)) throw validationError(`Unsupported traveller preferences ${field}`, { [field]: candidate });
  return candidate;
}

function normalizeEnumArray(values = [], validValues, field) {
  if (!Array.isArray(values)) throw validationError(`${field} must be an array`, { field });
  const normalized = [...new Set(values.map(value => String(value).trim().toLowerCase()).filter(Boolean))];
  const invalid = normalized.filter(value => !validValues.has(value));
  if (invalid.length) throw validationError(`Unsupported traveller preferences ${field}`, { [field]: invalid });
  return normalized;
}

function normalizeStringArray(values = [], field) {
  if (!Array.isArray(values)) throw validationError(`${field} must be an array`, { field });
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}

function normalizeLanguages(languages = []) {
  if (!Array.isArray(languages)) throw validationError('languages must be an array');
  return [...new Set(languages.map(language => String(language).trim().toLowerCase()).filter(Boolean))];
}

function normalizeFoodPreferences(foodPreferences = {}) {
  if (foodPreferences == null) return { dietaryNeeds: [], cuisines: [], avoids: [], notes: null };
  if (typeof foodPreferences !== 'object' || Array.isArray(foodPreferences)) {
    throw validationError('foodPreferences must be an object');
  }
  return {
    dietaryNeeds: normalizeStringArray(foodPreferences.dietaryNeeds ?? [], 'foodPreferences.dietaryNeeds'),
    cuisines: normalizeStringArray(foodPreferences.cuisines ?? [], 'foodPreferences.cuisines'),
    avoids: normalizeStringArray(foodPreferences.avoids ?? [], 'foodPreferences.avoids'),
    notes: normalizeOptionalString(foodPreferences.notes),
  };
}

function normalizeAccessibilityRequirements(accessibilityRequirements = {}) {
  if (accessibilityRequirements == null) return { requirements: [], notes: null };
  if (typeof accessibilityRequirements !== 'object' || Array.isArray(accessibilityRequirements)) {
    throw validationError('accessibilityRequirements must be an object');
  }
  return {
    requirements: normalizeStringArray(accessibilityRequirements.requirements ?? [], 'accessibilityRequirements.requirements'),
    notes: normalizeOptionalString(accessibilityRequirements.notes),
  };
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeMoney(value = null, field) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw validationError(`${field} must be an object`);
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount < 0) throw validationError(`${field}.amount must be zero or greater`);
  return {
    amount,
    currency: assertRequiredString(value.currency, `${field}.currency`).toUpperCase(),
  };
}

function normalizeTripDuration(value = null) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw validationError('preferredTripDuration must be an object');
  }
  const minDays = Number(value.minDays);
  const maxDays = Number(value.maxDays ?? value.minDays);
  if (!Number.isInteger(minDays) || minDays <= 0) {
    throw validationError('preferredTripDuration.minDays must be a positive integer');
  }
  if (!Number.isInteger(maxDays) || maxDays < minDays) {
    throw validationError('preferredTripDuration.maxDays must be greater than or equal to minDays');
  }
  return { minDays, maxDays };
}

function buildPreferences(input = {}) {
  assertNoExactLocation(input);
  const timestamp = now();
  return {
    preferencesId: input.preferencesId ?? `pref_${randomUUID()}`,
    travellerIdentityId: assertRequiredString(input.travellerIdentityId, 'travellerIdentityId'),
    budgetLevel: normalizeEnum(input.budgetLevel, VALID_BUDGET_LEVELS, 'budgetLevel', BUDGET_LEVEL.MID_RANGE),
    accommodationStyles: normalizeEnumArray(input.accommodationStyles ?? [], VALID_ACCOMMODATION_STYLES, 'accommodationStyles'),
    travelStyles: normalizeEnumArray(input.travelStyles ?? [], VALID_TRAVEL_STYLES, 'travelStyles'),
    preferredActivityCategories: normalizeEnumArray(input.preferredActivityCategories ?? [], VALID_ACTIVITY_CATEGORIES, 'preferredActivityCategories'),
    fitnessLevel: normalizeEnum(input.fitnessLevel, VALID_FITNESS_LEVELS, 'fitnessLevel', FITNESS_LEVEL.MODERATE),
    accessibilityRequirements: normalizeAccessibilityRequirements(input.accessibilityRequirements ?? {}),
    foodPreferences: normalizeFoodPreferences(input.foodPreferences ?? {}),
    languages: normalizeLanguages(input.languages ?? []),
    transportPreferences: normalizeEnumArray(input.transportPreferences ?? [], VALID_TRANSPORT_PREFERENCES, 'transportPreferences'),
    riskTolerance: normalizeEnum(input.riskTolerance, VALID_RISK_TOLERANCES, 'riskTolerance', RISK_TOLERANCE.MODERATE),
    crowdTolerance: normalizeEnum(input.crowdTolerance, VALID_CROWD_TOLERANCES, 'crowdTolerance', CROWD_TOLERANCE.MODERATE),
    climatePreferences: normalizeEnumArray(input.climatePreferences ?? [], VALID_CLIMATE_PREFERENCES, 'climatePreferences'),
    preferredTravelPace: normalizeEnum(input.preferredTravelPace, VALID_TRAVEL_PACES, 'preferredTravelPace', TRAVEL_PACE.BALANCED),
    maximumDailyBudget: normalizeMoney(input.maximumDailyBudget ?? null, 'maximumDailyBudget'),
    preferredTripDuration: normalizeTripDuration(input.preferredTripDuration ?? null),
    favouriteDestinations: normalizeStringArray(input.favouriteDestinations ?? [], 'favouriteDestinations'),
    avoidedDestinations: normalizeStringArray(input.avoidedDestinations ?? [], 'avoidedDestinations'),
    favouriteActivities: normalizeStringArray(input.favouriteActivities ?? [], 'favouriteActivities'),
    avoidedActivities: normalizeStringArray(input.avoidedActivities ?? [], 'avoidedActivities'),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

function mergePreferences(current, patch = {}) {
  assertNoExactLocation(patch);
  return {
    ...current,
    budgetLevel: patch.budgetLevel == null ? current.budgetLevel : normalizeEnum(patch.budgetLevel, VALID_BUDGET_LEVELS, 'budgetLevel'),
    accommodationStyles: patch.accommodationStyles == null
      ? current.accommodationStyles
      : normalizeEnumArray(patch.accommodationStyles, VALID_ACCOMMODATION_STYLES, 'accommodationStyles'),
    travelStyles: patch.travelStyles == null ? current.travelStyles : normalizeEnumArray(patch.travelStyles, VALID_TRAVEL_STYLES, 'travelStyles'),
    preferredActivityCategories: patch.preferredActivityCategories == null
      ? current.preferredActivityCategories
      : normalizeEnumArray(patch.preferredActivityCategories, VALID_ACTIVITY_CATEGORIES, 'preferredActivityCategories'),
    fitnessLevel: patch.fitnessLevel == null ? current.fitnessLevel : normalizeEnum(patch.fitnessLevel, VALID_FITNESS_LEVELS, 'fitnessLevel'),
    accessibilityRequirements: patch.accessibilityRequirements == null
      ? current.accessibilityRequirements
      : normalizeAccessibilityRequirements(patch.accessibilityRequirements),
    foodPreferences: patch.foodPreferences == null ? current.foodPreferences : normalizeFoodPreferences(patch.foodPreferences),
    languages: patch.languages == null ? current.languages : normalizeLanguages(patch.languages),
    transportPreferences: patch.transportPreferences == null
      ? current.transportPreferences
      : normalizeEnumArray(patch.transportPreferences, VALID_TRANSPORT_PREFERENCES, 'transportPreferences'),
    riskTolerance: patch.riskTolerance == null ? current.riskTolerance : normalizeEnum(patch.riskTolerance, VALID_RISK_TOLERANCES, 'riskTolerance'),
    crowdTolerance: patch.crowdTolerance == null ? current.crowdTolerance : normalizeEnum(patch.crowdTolerance, VALID_CROWD_TOLERANCES, 'crowdTolerance'),
    climatePreferences: patch.climatePreferences == null
      ? current.climatePreferences
      : normalizeEnumArray(patch.climatePreferences, VALID_CLIMATE_PREFERENCES, 'climatePreferences'),
    preferredTravelPace: patch.preferredTravelPace == null
      ? current.preferredTravelPace
      : normalizeEnum(patch.preferredTravelPace, VALID_TRAVEL_PACES, 'preferredTravelPace'),
    maximumDailyBudget: patch.maximumDailyBudget === undefined ? current.maximumDailyBudget : normalizeMoney(patch.maximumDailyBudget, 'maximumDailyBudget'),
    preferredTripDuration: patch.preferredTripDuration === undefined ? current.preferredTripDuration : normalizeTripDuration(patch.preferredTripDuration),
    favouriteDestinations: patch.favouriteDestinations == null ? current.favouriteDestinations : normalizeStringArray(patch.favouriteDestinations, 'favouriteDestinations'),
    avoidedDestinations: patch.avoidedDestinations == null ? current.avoidedDestinations : normalizeStringArray(patch.avoidedDestinations, 'avoidedDestinations'),
    favouriteActivities: patch.favouriteActivities == null ? current.favouriteActivities : normalizeStringArray(patch.favouriteActivities, 'favouriteActivities'),
    avoidedActivities: patch.avoidedActivities == null ? current.avoidedActivities : normalizeStringArray(patch.avoidedActivities, 'avoidedActivities'),
    updatedAt: now(),
  };
}

export function createTravellerPreferencesPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryTravellerPreferencesRepository();

  async function audit(action, travellerIdentityId, actor, details = {}) {
    return repository.appendAudit({
      action,
      travellerIdentityId,
      actorId: actor?.id ?? 'system',
      actorType: actor?.type ?? 'SYSTEM',
      details,
    });
  }

  async function createPreferences(input = {}, actor = { id: input.travellerIdentityId, type: 'TRAVELLER' }) {
    const preferences = buildPreferences(input);
    assertOwner(preferences.travellerIdentityId, actor, 'createPreferences');
    const created = await repository.create(preferences);
    if (!created) throw conflictError('Traveller preferences already exist', { travellerIdentityId: preferences.travellerIdentityId });
    await audit(PREFERENCES_AUDIT_ACTIONS.PREFERENCES_CREATED, preferences.travellerIdentityId, actor, {
      preferencesId: preferences.preferencesId,
    });
    return clone(created);
  }

  async function getPreferencesForTraveller(travellerIdentityId, actor) {
    assertOwner(travellerIdentityId, actor, 'getPreferencesForTraveller');
    const preferences = await repository.getByTravellerIdentityId(travellerIdentityId);
    if (!preferences || preferences.deletedAt) throw notFoundError(travellerIdentityId);
    await audit(PREFERENCES_AUDIT_ACTIONS.PREFERENCES_READ, travellerIdentityId, actor, {});
    return clone(preferences);
  }

  async function updatePreferences(travellerIdentityId, patch = {}, actor) {
    assertOwner(travellerIdentityId, actor, 'updatePreferences');
    const updated = await repository.update(travellerIdentityId, current => {
      if (current.deletedAt) throw notFoundError(travellerIdentityId);
      return mergePreferences(current, patch);
    });
    if (!updated) throw notFoundError(travellerIdentityId);
    await audit(PREFERENCES_AUDIT_ACTIONS.PREFERENCES_UPDATED, travellerIdentityId, actor, { fields: Object.keys(patch) });
    return clone(updated);
  }

  async function deletePreferences(travellerIdentityId, actor) {
    assertOwner(travellerIdentityId, actor, 'deletePreferences');
    const deleted = await repository.delete(travellerIdentityId, current => ({
      ...current,
      accommodationStyles: [],
      travelStyles: [],
      preferredActivityCategories: [],
      accessibilityRequirements: { requirements: [], notes: null },
      foodPreferences: { dietaryNeeds: [], cuisines: [], avoids: [], notes: null },
      languages: [],
      transportPreferences: [],
      climatePreferences: [],
      maximumDailyBudget: null,
      preferredTripDuration: null,
      favouriteDestinations: [],
      avoidedDestinations: [],
      favouriteActivities: [],
      avoidedActivities: [],
      updatedAt: now(),
      deletedAt: now(),
    }));
    if (!deleted) throw notFoundError(travellerIdentityId);
    await audit(PREFERENCES_AUDIT_ACTIONS.PREFERENCES_DELETED, travellerIdentityId, actor, {});
    return clone(deleted);
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    createPreferences,
    getPreferencesForTraveller,
    updatePreferences,
    deletePreferences,
    getAuditEvents,
  };
}
