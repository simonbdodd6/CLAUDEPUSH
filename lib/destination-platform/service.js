import { randomUUID } from 'crypto';
import {
  DESTINATION_AUDIT_ACTIONS,
  DESTINATION_STATUS,
  DESTINATION_TYPE,
  TERMINAL_DESTINATION_STATUSES,
} from './constants.js';
import { InMemoryDestinationRepository } from './repository.js';
import { notFoundError, permissionError, transitionError, validationError } from './errors.js';

const VALID_TYPES = new Set(Object.values(DESTINATION_TYPE));
const VALID_STATUSES = new Set(Object.values(DESTINATION_STATUS));
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

function requirePrivileged(actor, action) {
  requireActor(actor, action);
  if (!PRIVILEGED_ACTOR_TYPES.has(actor.type)) {
    throw permissionError('Actor cannot manage destinations', { action, actorId: actor.id, actorType: actor.type });
  }
}

function assertNoExactLocation(input = {}) {
  const present = EXACT_LOCATION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) {
    throw validationError('Destinations must not store exact traveller location', { fields: present });
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

function normalizeLanguages(languages = []) {
  return [...new Set(languages.map(language => String(language).trim().toLowerCase()).filter(Boolean))];
}

function normalizeAreas(areas = []) {
  if (!Array.isArray(areas)) throw validationError('areas must be an array');
  return areas.map(area => String(area).trim()).filter(Boolean);
}

function normalizeType(type) {
  if (!VALID_TYPES.has(type)) throw validationError('Unsupported destination type', { type });
  return type;
}

function normalizeStatus(status = DESTINATION_STATUS.DRAFT) {
  if (!VALID_STATUSES.has(status)) throw validationError('Unsupported destination status', { status });
  return status;
}

function normalizeSafetyNotes(safetyNotes = []) {
  if (!Array.isArray(safetyNotes)) throw validationError('safetyNotes must be an array');
  return safetyNotes.map(note => String(note).trim()).filter(Boolean);
}

function normalizeSeasonality(seasonality = {}) {
  if (seasonality == null) return {};
  if (typeof seasonality !== 'object' || Array.isArray(seasonality)) {
    throw validationError('seasonality must be an object');
  }
  return clone(seasonality);
}

function normalizeParentDestinationId(parentDestinationId = null) {
  if (parentDestinationId == null) return null;
  const normalized = String(parentDestinationId).trim();
  return normalized.length ? normalized : null;
}

function assertMutable(destination, action) {
  if (TERMINAL_DESTINATION_STATUSES.includes(destination.status)) {
    throw transitionError(`Cannot ${action} a ${destination.status} destination`, {
      destinationId: destination.destinationId,
      status: destination.status,
    });
  }
}

function assertCanTransition(destination, targetStatus) {
  const current = destination.status;
  const allowed = {
    [DESTINATION_STATUS.DRAFT]: [DESTINATION_STATUS.ACTIVE, DESTINATION_STATUS.CLOSED],
    [DESTINATION_STATUS.ACTIVE]: [DESTINATION_STATUS.PAUSED, DESTINATION_STATUS.CLOSED],
    [DESTINATION_STATUS.PAUSED]: [DESTINATION_STATUS.ACTIVE, DESTINATION_STATUS.CLOSED],
    [DESTINATION_STATUS.CLOSED]: [],
  };
  if (!allowed[current]?.includes(targetStatus)) {
    throw transitionError(`Cannot change destination status from ${current} to ${targetStatus}`, {
      destinationId: destination.destinationId,
      current,
      targetStatus,
    });
  }
}

function buildDestination(input = {}) {
  assertNoExactLocation(input);
  const timestamp = now();
  const type = normalizeType(input.type);
  return {
    destinationId: input.destinationId ?? `dest_${randomUUID()}`,
    name: assertRequiredString(input.name, 'name'),
    type,
    parentDestinationId: normalizeParentDestinationId(input.parentDestinationId),
    country: assertRequiredString(input.country, 'country'),
    region: normalizeOptionalString(input.region),
    areas: normalizeAreas(input.areas ?? []),
    timezone: assertRequiredString(input.timezone, 'timezone'),
    currency: assertRequiredString(input.currency, 'currency').toUpperCase(),
    languages: normalizeLanguages(input.languages ?? []),
    safetyNotes: normalizeSafetyNotes(input.safetyNotes ?? []),
    seasonality: normalizeSeasonality(input.seasonality ?? {}),
    status: normalizeStatus(input.status ?? DESTINATION_STATUS.DRAFT),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDestinationPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryDestinationRepository();

  async function audit(action, destinationId, actor, details = {}) {
    return repository.appendAudit({
      action,
      destinationId,
      actorId: actor?.id ?? 'system',
      actorType: actor?.type ?? 'SYSTEM',
      details,
    });
  }

  // M20 Phase 2 — optional publishing into Timeline & Relationship Graph via
  // injected ports. No direct imports; publishers optional; publishing is
  // best-effort and ISOLATED. Only references (ids) are published — never
  // destination business data. Destinations are canonical/system-owned (not
  // traveller-scoped), so their timeline events use a system identity.
  const timelinePublisher = options.timelinePublisher ?? null;
  const relationshipPublisher = options.relationshipPublisher ?? null;
  if (timelinePublisher && typeof timelinePublisher.appendEvent !== 'function') {
    throw validationError('timelinePublisher must expose appendEvent()');
  }
  if (relationshipPublisher && typeof relationshipPublisher.createRelationship !== 'function') {
    throw validationError('relationshipPublisher must expose createRelationship()');
  }

  const SYSTEM_IDENTITY = 'system';
  const DESTINATION_TIMELINE_TYPE = { destination_created: 'destination_added', destination_updated: 'custom' };

  function destinationSlug(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  }

  async function safePublish(task) {
    if (!task) return;
    try { await task(); } catch { /* publishing is isolated; never fail the op */ }
  }

  async function publishDestinationEvent(destination, eventName) {
    if (!timelinePublisher) return;
    const isUpdate = eventName === 'destination_updated';
    await safePublish(() => timelinePublisher.appendEvent({
      travellerIdentityId: SYSTEM_IDENTITY, // canonical/system timeline, not a real traveller
      eventType: DESTINATION_TIMELINE_TYPE[eventName] ?? 'custom',
      sourcePlatform: 'destination-platform',
      sourceEntityId: destination.destinationId, // canonical reference id
      timestamp: destination.updatedAt ?? destination.createdAt,
      visibility: 'system',
      metadata: { eventName, status: destination.status, type: destination.type },
      idempotencyKey: isUpdate
        ? `destination-platform:destination_updated:${destination.destinationId}:${destination.updatedAt}`
        : `destination-platform:${eventName}:${destination.destinationId}`,
    }));
  }

  async function publishDestinationEdges(destination) {
    if (!relationshipPublisher) return;
    // Destination LOCATED_IN parent (canonical ids only).
    if (destination.parentDestinationId) {
      await safePublish(() => relationshipPublisher.createRelationship({
        from: { type: 'destination', id: destination.destinationId },
        to: { type: 'destination', id: destination.parentDestinationId },
        relationshipType: 'located_in',
      }));
    }
    // Alias bridge: link the canonical destination to the name-slug id that
    // Phase 1 trip/itinerary publishing used, so those references resolve to the
    // canonical destination. Symmetric (related_to → undirected). This is the
    // deterministic fix for the Phase 1 slug-derived id gap.
    const aliasId = destinationSlug(destination.name);
    if (aliasId && aliasId !== destination.destinationId) {
      await safePublish(() => relationshipPublisher.createRelationship({
        from: { type: 'destination', id: destination.destinationId },
        to: { type: 'destination', id: aliasId },
        relationshipType: 'related_to',
        metadata: { alias: 'name_slug' },
      }));
    }
  }

  async function validateParentDestination(destination, parentDestinationId = destination.parentDestinationId) {
    if (!parentDestinationId) {
      if (destination.type !== DESTINATION_TYPE.COUNTRY) return;
      return;
    }
    if (destination.destinationId === parentDestinationId) {
      throw validationError('Destination cannot be its own parent', {
        destinationId: destination.destinationId,
        parentDestinationId,
      });
    }
    if (destination.type === DESTINATION_TYPE.COUNTRY) {
      throw validationError('Country destinations cannot have a parent destination', {
        destinationId: destination.destinationId,
        parentDestinationId,
      });
    }

    let parent = await repository.get(parentDestinationId);
    if (!parent) throw validationError('Parent destination does not exist', { parentDestinationId });

    const seen = new Set([destination.destinationId]);
    while (parent) {
      if (seen.has(parent.destinationId)) {
        throw validationError('Destination hierarchy cannot contain circular parent relationships', {
          destinationId: destination.destinationId,
          parentDestinationId,
        });
      }
      seen.add(parent.destinationId);
      if (!parent.parentDestinationId) return;
      parent = await repository.get(parent.parentDestinationId);
    }
  }

  async function createDestination(input = {}, actor = { id: 'system', type: 'SYSTEM' }) {
    requirePrivileged(actor, 'createDestination');
    const destination = buildDestination(input);
    await validateParentDestination(destination);
    await repository.create(destination);
    await audit(DESTINATION_AUDIT_ACTIONS.DESTINATION_CREATED, destination.destinationId, actor, {
      type: destination.type,
      status: destination.status,
      country: destination.country,
      parentDestinationId: destination.parentDestinationId,
    });
    await publishDestinationEvent(destination, 'destination_created');
    await publishDestinationEdges(destination);
    return clone(destination);
  }

  async function getDestinationById(destinationId, actor = { id: 'system', type: 'SYSTEM' }) {
    requireActor(actor, 'getDestinationById');
    const destination = await repository.get(destinationId);
    if (!destination) throw notFoundError(destinationId);
    await audit(DESTINATION_AUDIT_ACTIONS.DESTINATION_READ, destination.destinationId, actor, {});
    return clone(destination);
  }

  async function updateDestination(destinationId, patch = {}, actor = { id: 'system', type: 'SYSTEM' }) {
    requirePrivileged(actor, 'updateDestination');
    assertNoExactLocation(patch);
    const current = await repository.get(destinationId);
    if (!current) throw notFoundError(destinationId);
    assertMutable(current, 'update');
    const candidate = {
      ...current,
      destinationId,
      type: patch.type == null ? current.type : normalizeType(patch.type),
      parentDestinationId: patch.parentDestinationId === undefined
        ? current.parentDestinationId
        : normalizeParentDestinationId(patch.parentDestinationId),
    };
    await validateParentDestination(candidate, candidate.parentDestinationId);
    const updated = await repository.update(destinationId, destination => {
      return {
        ...destination,
        name: patch.name == null ? destination.name : assertRequiredString(patch.name, 'name'),
        type: candidate.type,
        parentDestinationId: candidate.parentDestinationId,
        country: patch.country == null ? destination.country : assertRequiredString(patch.country, 'country'),
        region: patch.region === undefined ? destination.region : normalizeOptionalString(patch.region),
        areas: patch.areas == null ? destination.areas : normalizeAreas(patch.areas),
        timezone: patch.timezone == null ? destination.timezone : assertRequiredString(patch.timezone, 'timezone'),
        currency: patch.currency == null ? destination.currency : assertRequiredString(patch.currency, 'currency').toUpperCase(),
        languages: patch.languages == null ? destination.languages : normalizeLanguages(patch.languages),
        safetyNotes: patch.safetyNotes == null ? destination.safetyNotes : normalizeSafetyNotes(patch.safetyNotes),
        seasonality: patch.seasonality == null ? destination.seasonality : normalizeSeasonality(patch.seasonality),
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(destinationId);
    await audit(DESTINATION_AUDIT_ACTIONS.DESTINATION_UPDATED, destinationId, actor, { fields: Object.keys(patch) });
    await publishDestinationEvent(updated, 'destination_updated');
    await publishDestinationEdges(updated);
    return clone(updated);
  }

  async function transitionDestination(destinationId, targetStatus, actor, auditAction, details = {}) {
    requirePrivileged(actor, auditAction);
    const updated = await repository.update(destinationId, destination => {
      assertCanTransition(destination, targetStatus);
      return {
        ...destination,
        status: targetStatus,
        updatedAt: now(),
      };
    });
    if (!updated) throw notFoundError(destinationId);
    await audit(auditAction, destinationId, actor, details);
    await publishDestinationEvent(updated, 'destination_updated');
    return clone(updated);
  }

  async function activateDestination(destinationId, actor) {
    return transitionDestination(destinationId, DESTINATION_STATUS.ACTIVE, actor, DESTINATION_AUDIT_ACTIONS.DESTINATION_ACTIVATED);
  }

  async function pauseDestination(destinationId, actor, reason = null) {
    return transitionDestination(destinationId, DESTINATION_STATUS.PAUSED, actor, DESTINATION_AUDIT_ACTIONS.DESTINATION_PAUSED, { reason });
  }

  async function closeDestination(destinationId, actor, reason = null) {
    return transitionDestination(destinationId, DESTINATION_STATUS.CLOSED, actor, DESTINATION_AUDIT_ACTIONS.DESTINATION_CLOSED, { reason });
  }

  async function listDestinationsByCountry(country) {
    assertRequiredString(country, 'country');
    return repository.listByCountry(country);
  }

  async function listActiveDestinations() {
    return repository.listActive();
  }

  async function listChildDestinations(parentDestinationId, actor = { id: 'system', type: 'SYSTEM' }) {
    requireActor(actor, 'listChildDestinations');
    const parent = await repository.get(parentDestinationId);
    if (!parent) throw notFoundError(parentDestinationId);
    await audit(DESTINATION_AUDIT_ACTIONS.DESTINATION_CHILDREN_LISTED, parentDestinationId, actor, {});
    return repository.listChildren(parentDestinationId);
  }

  async function listActiveDestinationsUnderParent(parentDestinationId, actor = { id: 'system', type: 'SYSTEM' }) {
    requireActor(actor, 'listActiveDestinationsUnderParent');
    const parent = await repository.get(parentDestinationId);
    if (!parent) throw notFoundError(parentDestinationId);
    await audit(DESTINATION_AUDIT_ACTIONS.DESTINATION_CHILDREN_LISTED, parentDestinationId, actor, { activeOnly: true });
    return repository.listActiveChildren(parentDestinationId);
  }

  async function getDestinationBreadcrumbPath(destinationId, actor = { id: 'system', type: 'SYSTEM' }) {
    requireActor(actor, 'getDestinationBreadcrumbPath');
    const path = [];
    const seen = new Set();
    let current = await repository.get(destinationId);
    if (!current) throw notFoundError(destinationId);

    while (current) {
      if (seen.has(current.destinationId)) {
        throw validationError('Destination hierarchy cannot contain circular parent relationships', { destinationId });
      }
      seen.add(current.destinationId);
      path.unshift(current);
      if (!current.parentDestinationId) break;
      current = await repository.get(current.parentDestinationId);
    }

    await audit(DESTINATION_AUDIT_ACTIONS.DESTINATION_BREADCRUMB_READ, destinationId, actor, {
      depth: path.length,
    });
    return path.map(clone);
  }

  async function searchDestinationsByName(query) {
    return repository.searchByName(query);
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    createDestination,
    updateDestination,
    activateDestination,
    pauseDestination,
    closeDestination,
    getDestinationById,
    listDestinationsByCountry,
    listActiveDestinations,
    listChildDestinations,
    listActiveDestinationsUnderParent,
    getDestinationBreadcrumbPath,
    searchDestinationsByName,
    getAuditEvents,
  };
}
