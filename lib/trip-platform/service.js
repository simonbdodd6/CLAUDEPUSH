import { randomUUID } from 'crypto';
import {
  TERMINAL_TRIP_STATUSES,
  TRIP_AUDIT_ACTIONS,
  TRIP_STATUS,
  TRIP_VISIBILITY,
} from './constants.js';
import { InMemoryTripRepository } from './repository.js';
import { notFoundError, permissionError, transitionError, validationError } from './errors.js';

const VALID_STATUSES = new Set(Object.values(TRIP_STATUS));
const VALID_VISIBILITIES = new Set(Object.values(TRIP_VISIBILITY));
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

function assertOwner(trip, actor, action) {
  requireActor(actor, action);
  if (actor.id === trip.ownerIdentityId || PRIVILEGED_ACTOR_TYPES.has(actor.type)) return;
  throw permissionError('Actor cannot access this trip', {
    action,
    tripId: trip.tripId,
    ownerIdentityId: trip.ownerIdentityId,
    actorId: actor.id,
  });
}

function assertNoExactLocation(input = {}) {
  const present = EXACT_LOCATION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) {
    throw validationError('Trips may store approximate area only, not exact live location', { fields: present });
  }
}

function assertRequiredString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validationError(`${field} is required`, { field });
  }
  return value.trim();
}

function normalizeDate(value, field) {
  if (!value) throw validationError(`${field} is required`, { field });
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw validationError(`${field} must be a valid date`, { field, value });
  return value;
}

function assertDateRange(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (end < start) throw validationError('endDate must be on or after startDate', { startDate, endDate });
}

function normalizeVisibility(visibility = TRIP_VISIBILITY.PRIVATE) {
  if (!VALID_VISIBILITIES.has(visibility)) {
    throw validationError('Unsupported trip visibility', { visibility });
  }
  return visibility;
}

function normalizeStatus(status = TRIP_STATUS.DRAFT) {
  if (!VALID_STATUSES.has(status)) {
    throw validationError('Unsupported trip status', { status });
  }
  return status;
}

function assertMutable(trip, action) {
  if (TERMINAL_TRIP_STATUSES.includes(trip.status)) {
    throw transitionError(`Cannot ${action} a ${trip.status} trip`, { tripId: trip.tripId, status: trip.status });
  }
}

function assertCanTransition(trip, targetStatus) {
  const current = trip.status;
  const allowed = {
    [TRIP_STATUS.DRAFT]: [TRIP_STATUS.PLANNED, TRIP_STATUS.ACTIVE, TRIP_STATUS.CANCELLED],
    [TRIP_STATUS.PLANNED]: [TRIP_STATUS.ACTIVE, TRIP_STATUS.CANCELLED],
    [TRIP_STATUS.ACTIVE]: [TRIP_STATUS.COMPLETED, TRIP_STATUS.CANCELLED],
    [TRIP_STATUS.COMPLETED]: [],
    [TRIP_STATUS.CANCELLED]: [],
  };
  if (!allowed[current]?.includes(targetStatus)) {
    throw transitionError(`Cannot change trip status from ${current} to ${targetStatus}`, {
      tripId: trip.tripId,
      current,
      targetStatus,
    });
  }
}

function buildTrip(input = {}) {
  assertNoExactLocation(input);
  const startDate = normalizeDate(input.startDate, 'startDate');
  const endDate = normalizeDate(input.endDate, 'endDate');
  assertDateRange(startDate, endDate);

  const timestamp = now();
  return {
    tripId: input.tripId ?? `trip_${randomUUID()}`,
    ownerIdentityId: assertRequiredString(input.ownerIdentityId, 'ownerIdentityId'),
    tripName: assertRequiredString(input.tripName, 'tripName'),
    country: assertRequiredString(input.country, 'country'),
    destination: assertRequiredString(input.destination, 'destination'),
    area: assertRequiredString(input.area, 'area'),
    startDate,
    endDate,
    status: normalizeStatus(input.status ?? TRIP_STATUS.DRAFT),
    visibility: normalizeVisibility(input.visibility ?? TRIP_VISIBILITY.PRIVATE),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createTripPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryTripRepository();

  // M11 Phase 1 — optional traveller-identity validation through the M10 port.
  // Injected (not imported), so trip-platform stays decoupled from identity.
  // When absent, behaviour is identical to before (backward compatible).
  const travellerIdentityPlatform = options.travellerIdentityPlatform ?? null;
  if (travellerIdentityPlatform && typeof travellerIdentityPlatform.assertActiveTraveller !== 'function') {
    throw validationError('travellerIdentityPlatform must expose assertActiveTraveller()');
  }

  // Validate that a trip owner is a real, ACTIVE traveller via the M10 port.
  // No-op when the port is not injected. Propagates the port's deterministic
  // typed errors (TRAVELLER_NOT_FOUND / IDENTITY_INACTIVE / NOT_A_TRAVELLER).
  async function assertOwnerIsActiveTraveller(ownerIdentityId) {
    if (!travellerIdentityPlatform) return;
    await travellerIdentityPlatform.assertActiveTraveller(ownerIdentityId);
  }

  async function audit(action, tripId, actor, details = {}) {
    return repository.appendAudit({
      action,
      tripId,
      actorId: actor?.id ?? 'system',
      actorType: actor?.type ?? 'SYSTEM',
      details,
    });
  }

  async function createTrip(input = {}, actor = { id: input.ownerIdentityId, type: 'TRAVELLER' }) {
    requireActor(actor, 'createTrip');
    const trip = buildTrip(input);
    if (actor.id !== trip.ownerIdentityId && !PRIVILEGED_ACTOR_TYPES.has(actor.type)) {
      throw permissionError('Actor cannot create a trip for another identity', {
        ownerIdentityId: trip.ownerIdentityId,
        actorId: actor.id,
      });
    }
    // Boundary check: the owner must be a valid active traveller (no-op unless
    // the M10 port is injected). Runs even for privileged actors so an admin
    // cannot create a trip for a non-existent or non-traveller identity.
    await assertOwnerIsActiveTraveller(trip.ownerIdentityId);
    await repository.create(trip);
    await audit(TRIP_AUDIT_ACTIONS.TRIP_CREATED, trip.tripId, actor, {
      ownerIdentityId: trip.ownerIdentityId,
      status: trip.status,
      visibility: trip.visibility,
    });
    return clone(trip);
  }

  async function getTripById(tripId, actor) {
    const trip = await repository.get(tripId);
    if (!trip) throw notFoundError(tripId);
    assertOwner(trip, actor, 'getTripById');
    await audit(TRIP_AUDIT_ACTIONS.TRIP_READ, trip.tripId, actor, { ownerIdentityId: trip.ownerIdentityId });
    return clone(trip);
  }

  async function listTripsForIdentity(ownerIdentityId, actor) {
    requireActor(actor, 'listTripsForIdentity');
    if (actor.id !== ownerIdentityId && !PRIVILEGED_ACTOR_TYPES.has(actor.type)) {
      throw permissionError('Actor cannot list trips for another identity', { ownerIdentityId, actorId: actor.id });
    }
    return repository.listByOwner(ownerIdentityId);
  }

  async function updateTrip(tripId, patch = {}, actor) {
    assertNoExactLocation(patch);
    const updated = await repository.update(tripId, trip => {
      assertOwner(trip, actor, 'updateTrip');
      assertMutable(trip, 'update');
      const next = {
        ...trip,
        tripName: patch.tripName == null ? trip.tripName : assertRequiredString(patch.tripName, 'tripName'),
        country: patch.country == null ? trip.country : assertRequiredString(patch.country, 'country'),
        destination: patch.destination == null ? trip.destination : assertRequiredString(patch.destination, 'destination'),
        area: patch.area == null ? trip.area : assertRequiredString(patch.area, 'area'),
        visibility: patch.visibility == null ? trip.visibility : normalizeVisibility(patch.visibility),
        updatedAt: now(),
      };
      return next;
    });
    if (!updated) throw notFoundError(tripId);
    await audit(TRIP_AUDIT_ACTIONS.TRIP_UPDATED, tripId, actor, { fields: Object.keys(patch) });
    return clone(updated);
  }

  async function changeTripDates(tripId, startDate, endDate, actor) {
    const normalizedStart = normalizeDate(startDate, 'startDate');
    const normalizedEnd = normalizeDate(endDate, 'endDate');
    assertDateRange(normalizedStart, normalizedEnd);
    const updated = await repository.update(tripId, trip => {
      assertOwner(trip, actor, 'changeTripDates');
      assertMutable(trip, 'change dates for');
      return {
        ...trip,
        startDate: normalizedStart,
        endDate: normalizedEnd,
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(tripId);
    await audit(TRIP_AUDIT_ACTIONS.TRIP_DATES_CHANGED, tripId, actor, { startDate: normalizedStart, endDate: normalizedEnd });
    return clone(updated);
  }

  async function changeTripDestination(tripId, destinationPatch = {}, actor) {
    assertNoExactLocation(destinationPatch);
    const updated = await repository.update(tripId, trip => {
      assertOwner(trip, actor, 'changeTripDestination');
      assertMutable(trip, 'change destination for');
      return {
        ...trip,
        country: destinationPatch.country == null ? trip.country : assertRequiredString(destinationPatch.country, 'country'),
        destination: destinationPatch.destination == null ? trip.destination : assertRequiredString(destinationPatch.destination, 'destination'),
        area: destinationPatch.area == null ? trip.area : assertRequiredString(destinationPatch.area, 'area'),
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(tripId);
    await audit(TRIP_AUDIT_ACTIONS.TRIP_DESTINATION_CHANGED, tripId, actor, {
      country: updated.country,
      destination: updated.destination,
      area: updated.area,
    });
    return clone(updated);
  }

  async function changeTripVisibility(tripId, visibility, actor) {
    const normalizedVisibility = normalizeVisibility(visibility);
    const updated = await repository.update(tripId, trip => {
      assertOwner(trip, actor, 'changeTripVisibility');
      assertMutable(trip, 'change visibility for');
      return {
        ...trip,
        visibility: normalizedVisibility,
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(tripId);
    await audit(TRIP_AUDIT_ACTIONS.TRIP_VISIBILITY_CHANGED, tripId, actor, { visibility: normalizedVisibility });
    return clone(updated);
  }

  async function transitionTrip(tripId, targetStatus, actor, auditAction, details = {}) {
    const updated = await repository.update(tripId, trip => {
      assertOwner(trip, actor, auditAction);
      assertCanTransition(trip, targetStatus);
      return {
        ...trip,
        status: targetStatus,
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(tripId);
    await audit(auditAction, tripId, actor, details);
    return clone(updated);
  }

  async function startTrip(tripId, actor) {
    return transitionTrip(tripId, TRIP_STATUS.ACTIVE, actor, TRIP_AUDIT_ACTIONS.TRIP_STARTED);
  }

  async function completeTrip(tripId, actor) {
    return transitionTrip(tripId, TRIP_STATUS.COMPLETED, actor, TRIP_AUDIT_ACTIONS.TRIP_COMPLETED);
  }

  async function cancelTrip(tripId, actor, reason = null) {
    return transitionTrip(tripId, TRIP_STATUS.CANCELLED, actor, TRIP_AUDIT_ACTIONS.TRIP_CANCELLED, { reason });
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    createTrip,
    updateTrip,
    changeTripDates,
    changeTripDestination,
    changeTripVisibility,
    startTrip,
    completeTrip,
    cancelTrip,
    getTripById,
    listTripsForIdentity,
    getAuditEvents,
  };
}

