import { randomUUID } from 'crypto';
import {
  ACTIVITY_AUDIT_ACTIONS,
  ACTIVITY_CATEGORY,
  ACTIVITY_DIFFICULTY,
  ACTIVITY_ENVIRONMENT,
  ACTIVITY_STATUS,
  ACTIVITY_VISIBILITY,
  WEATHER_SENSITIVITY,
} from './constants.js';
import { InMemoryActivityRepository } from './repository.js';
import { notFoundError, permissionError, transitionError, validationError } from './errors.js';

const VALID_CATEGORIES = new Set(Object.values(ACTIVITY_CATEGORY));
const VALID_DIFFICULTIES = new Set(Object.values(ACTIVITY_DIFFICULTY));
const VALID_STATUSES = new Set(Object.values(ACTIVITY_STATUS));
const VALID_VISIBILITIES = new Set(Object.values(ACTIVITY_VISIBILITY));
const VALID_ENVIRONMENTS = new Set(Object.values(ACTIVITY_ENVIRONMENT));
const VALID_WEATHER_SENSITIVITY = new Set(Object.values(WEATHER_SENSITIVITY));
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

function canManage(activity, actor) {
  return actor?.id === activity.ownerIdentityId || PRIVILEGED_ACTOR_TYPES.has(actor?.type);
}

function assertOwner(activity, actor, action) {
  requireActor(actor, action);
  if (canManage(activity, actor)) return;
  throw permissionError('Actor cannot access this activity', {
    action,
    activityId: activity.activityId,
    ownerIdentityId: activity.ownerIdentityId,
    actorId: actor.id,
  });
}

function assertNoExactLocation(input = {}) {
  const present = EXACT_LOCATION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) {
    throw validationError('Activities must not store exact traveller location', { fields: present });
  }
}

function assertRequiredString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validationError(`${field} is required`, { field });
  }
  return value.trim();
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeEnum(value, validValues, field, fallback) {
  const candidate = value ?? fallback;
  if (!validValues.has(candidate)) throw validationError(`Unsupported activity ${field}`, { [field]: candidate });
  return candidate;
}

function normalizeCategories(categories = []) {
  if (!Array.isArray(categories)) throw validationError('categories must be an array');
  const normalized = [...new Set(categories.map(category => String(category).trim().toLowerCase()).filter(Boolean))];
  if (!normalized.length) throw validationError('At least one activity category is required');
  const invalid = normalized.filter(category => !VALID_CATEGORIES.has(category));
  if (invalid.length) throw validationError('Unsupported activity category', { categories: invalid });
  return normalized;
}

function normalizeDuration(duration = {}) {
  if (duration == null || typeof duration !== 'object' || Array.isArray(duration)) {
    throw validationError('duration must be an object');
  }
  const minMinutes = Number(duration.minMinutes);
  const maxMinutes = Number(duration.maxMinutes ?? duration.minMinutes);
  if (!Number.isInteger(minMinutes) || minMinutes <= 0) {
    throw validationError('duration.minMinutes must be a positive integer');
  }
  if (!Number.isInteger(maxMinutes) || maxMinutes < minMinutes) {
    throw validationError('duration.maxMinutes must be greater than or equal to minMinutes');
  }
  return {
    minMinutes,
    maxMinutes,
  };
}

function normalizeEstimatedCostRange(estimatedCostRange = {}) {
  if (estimatedCostRange == null || typeof estimatedCostRange !== 'object' || Array.isArray(estimatedCostRange)) {
    throw validationError('estimatedCostRange must be an object');
  }
  const min = Number(estimatedCostRange.min);
  const max = Number(estimatedCostRange.max ?? estimatedCostRange.min);
  if (!Number.isFinite(min) || min < 0) throw validationError('estimatedCostRange.min must be zero or greater');
  if (!Number.isFinite(max) || max < min) {
    throw validationError('estimatedCostRange.max must be greater than or equal to min');
  }
  return {
    min,
    max,
    currency: assertRequiredString(estimatedCostRange.currency, 'estimatedCostRange.currency').toUpperCase(),
  };
}

function normalizeSeasonality(seasonality = {}) {
  if (seasonality == null) return {};
  if (typeof seasonality !== 'object' || Array.isArray(seasonality)) {
    throw validationError('seasonality must be an object');
  }
  return clone(seasonality);
}

function normalizeAgeRestrictions(ageRestrictions = {}) {
  if (ageRestrictions == null || typeof ageRestrictions !== 'object' || Array.isArray(ageRestrictions)) {
    throw validationError('ageRestrictions must be an object');
  }
  const minimumAge = ageRestrictions.minimumAge == null ? null : Number(ageRestrictions.minimumAge);
  const maximumAge = ageRestrictions.maximumAge == null ? null : Number(ageRestrictions.maximumAge);
  if (minimumAge != null && (!Number.isInteger(minimumAge) || minimumAge < 0)) {
    throw validationError('ageRestrictions.minimumAge must be zero or greater');
  }
  if (maximumAge != null && (!Number.isInteger(maximumAge) || maximumAge < 0)) {
    throw validationError('ageRestrictions.maximumAge must be zero or greater');
  }
  if (minimumAge != null && maximumAge != null && maximumAge < minimumAge) {
    throw validationError('ageRestrictions.maximumAge must be greater than or equal to minimumAge');
  }
  return {
    minimumAge,
    maximumAge,
    familyFriendly: Boolean(ageRestrictions.familyFriendly),
    notes: normalizeOptionalString(ageRestrictions.notes),
  };
}

function buildActivity(input = {}) {
  assertNoExactLocation(input);
  const timestamp = now();
  return {
    activityId: input.activityId ?? `act_${randomUUID()}`,
    destinationId: assertRequiredString(input.destinationId, 'destinationId'),
    ownerIdentityId: assertRequiredString(input.ownerIdentityId, 'ownerIdentityId'),
    name: assertRequiredString(input.name, 'name'),
    description: normalizeOptionalString(input.description),
    categories: normalizeCategories(input.categories ?? []),
    difficulty: normalizeEnum(input.difficulty, VALID_DIFFICULTIES, 'difficulty', ACTIVITY_DIFFICULTY.ALL_LEVELS),
    duration: normalizeDuration(input.duration),
    estimatedCostRange: normalizeEstimatedCostRange(input.estimatedCostRange),
    seasonality: normalizeSeasonality(input.seasonality ?? {}),
    ageRestrictions: normalizeAgeRestrictions(input.ageRestrictions ?? {}),
    weatherSensitivity: normalizeEnum(input.weatherSensitivity, VALID_WEATHER_SENSITIVITY, 'weatherSensitivity', WEATHER_SENSITIVITY.MEDIUM),
    environment: normalizeEnum(input.environment, VALID_ENVIRONMENTS, 'environment', ACTIVITY_ENVIRONMENT.OUTDOOR),
    status: normalizeEnum(input.status, VALID_STATUSES, 'status', ACTIVITY_STATUS.INACTIVE),
    visibility: normalizeEnum(input.visibility, VALID_VISIBILITIES, 'visibility', ACTIVITY_VISIBILITY.PRIVATE),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function assertCanTransition(activity, targetStatus) {
  if (activity.status === targetStatus) {
    throw transitionError(`Activity is already ${targetStatus}`, {
      activityId: activity.activityId,
      status: activity.status,
    });
  }
  if (!VALID_STATUSES.has(targetStatus)) {
    throw validationError('Unsupported activity status', { status: targetStatus });
  }
}

export function createActivityPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryActivityRepository();

  async function audit(action, activityId, actor, details = {}) {
    return repository.appendAudit({
      action,
      activityId,
      actorId: actor?.id ?? 'system',
      actorType: actor?.type ?? 'SYSTEM',
      details,
    });
  }

  async function createActivity(input = {}, actor = { id: input.ownerIdentityId, type: 'TRAVELLER' }) {
    requireActor(actor, 'createActivity');
    const activity = buildActivity(input);
    if (!canManage(activity, actor)) {
      throw permissionError('Actor cannot create an activity for another identity', {
        ownerIdentityId: activity.ownerIdentityId,
        actorId: actor.id,
      });
    }
    await repository.create(activity);
    await audit(ACTIVITY_AUDIT_ACTIONS.ACTIVITY_CREATED, activity.activityId, actor, {
      destinationId: activity.destinationId,
      ownerIdentityId: activity.ownerIdentityId,
      categories: activity.categories,
      status: activity.status,
      visibility: activity.visibility,
    });
    return clone(activity);
  }

  async function getActivityById(activityId, actor = { id: 'system', type: 'SYSTEM' }) {
    requireActor(actor, 'getActivityById');
    const activity = await repository.get(activityId);
    if (!activity) throw notFoundError(activityId);
    if (activity.visibility === ACTIVITY_VISIBILITY.PRIVATE && !canManage(activity, actor)) {
      throw permissionError('Actor cannot access this private activity', {
        activityId,
        ownerIdentityId: activity.ownerIdentityId,
        actorId: actor.id,
      });
    }
    await audit(ACTIVITY_AUDIT_ACTIONS.ACTIVITY_READ, activity.activityId, actor, {});
    return clone(activity);
  }

  async function updateActivity(activityId, patch = {}, actor) {
    assertNoExactLocation(patch);
    const updated = await repository.update(activityId, activity => {
      assertOwner(activity, actor, 'updateActivity');
      return {
        ...activity,
        destinationId: patch.destinationId == null ? activity.destinationId : assertRequiredString(patch.destinationId, 'destinationId'),
        name: patch.name == null ? activity.name : assertRequiredString(patch.name, 'name'),
        description: patch.description === undefined ? activity.description : normalizeOptionalString(patch.description),
        categories: patch.categories == null ? activity.categories : normalizeCategories(patch.categories),
        difficulty: patch.difficulty == null ? activity.difficulty : normalizeEnum(patch.difficulty, VALID_DIFFICULTIES, 'difficulty'),
        duration: patch.duration == null ? activity.duration : normalizeDuration(patch.duration),
        estimatedCostRange: patch.estimatedCostRange == null
          ? activity.estimatedCostRange
          : normalizeEstimatedCostRange(patch.estimatedCostRange),
        seasonality: patch.seasonality == null ? activity.seasonality : normalizeSeasonality(patch.seasonality),
        ageRestrictions: patch.ageRestrictions == null ? activity.ageRestrictions : normalizeAgeRestrictions(patch.ageRestrictions),
        weatherSensitivity: patch.weatherSensitivity == null
          ? activity.weatherSensitivity
          : normalizeEnum(patch.weatherSensitivity, VALID_WEATHER_SENSITIVITY, 'weatherSensitivity'),
        environment: patch.environment == null ? activity.environment : normalizeEnum(patch.environment, VALID_ENVIRONMENTS, 'environment'),
        visibility: patch.visibility == null ? activity.visibility : normalizeEnum(patch.visibility, VALID_VISIBILITIES, 'visibility'),
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(activityId);
    await audit(ACTIVITY_AUDIT_ACTIONS.ACTIVITY_UPDATED, activityId, actor, { fields: Object.keys(patch) });
    return clone(updated);
  }

  async function transitionActivity(activityId, targetStatus, actor, auditAction) {
    const updated = await repository.update(activityId, activity => {
      assertOwner(activity, actor, auditAction);
      assertCanTransition(activity, targetStatus);
      return {
        ...activity,
        status: targetStatus,
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(activityId);
    await audit(auditAction, activityId, actor, { targetStatus });
    return clone(updated);
  }

  async function activateActivity(activityId, actor) {
    return transitionActivity(activityId, ACTIVITY_STATUS.ACTIVE, actor, ACTIVITY_AUDIT_ACTIONS.ACTIVITY_ACTIVATED);
  }

  async function deactivateActivity(activityId, actor) {
    return transitionActivity(activityId, ACTIVITY_STATUS.INACTIVE, actor, ACTIVITY_AUDIT_ACTIONS.ACTIVITY_DEACTIVATED);
  }

  async function changeActivityVisibility(activityId, visibility, actor) {
    const normalizedVisibility = normalizeEnum(visibility, VALID_VISIBILITIES, 'visibility');
    const updated = await repository.update(activityId, activity => {
      assertOwner(activity, actor, 'changeActivityVisibility');
      return {
        ...activity,
        visibility: normalizedVisibility,
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(activityId);
    await audit(ACTIVITY_AUDIT_ACTIONS.ACTIVITY_VISIBILITY_CHANGED, activityId, actor, { visibility: normalizedVisibility });
    return clone(updated);
  }

  async function listActivitiesByDestination(destinationId, actor = { id: 'system', type: 'SYSTEM' }) {
    requireActor(actor, 'listActivitiesByDestination');
    const activities = await repository.listByDestination(destinationId);
    if (PRIVILEGED_ACTOR_TYPES.has(actor.type)) return activities;
    return activities.filter(activity => activity.visibility === ACTIVITY_VISIBILITY.PUBLIC || activity.ownerIdentityId === actor.id);
  }

  async function listActiveActivitiesByDestination(destinationId) {
    assertRequiredString(destinationId, 'destinationId');
    return repository.listActiveByDestination(destinationId);
  }

  async function listActivitiesForOwner(ownerIdentityId, actor) {
    requireActor(actor, 'listActivitiesForOwner');
    if (actor.id !== ownerIdentityId && !PRIVILEGED_ACTOR_TYPES.has(actor.type)) {
      throw permissionError('Actor cannot list activities for another identity', { ownerIdentityId, actorId: actor.id });
    }
    return repository.listByOwner(ownerIdentityId);
  }

  async function searchActivitiesByName(query) {
    return repository.searchByName(query);
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    createActivity,
    updateActivity,
    activateActivity,
    deactivateActivity,
    changeActivityVisibility,
    getActivityById,
    listActivitiesByDestination,
    listActiveActivitiesByDestination,
    listActivitiesForOwner,
    searchActivitiesByName,
    getAuditEvents,
  };
}
