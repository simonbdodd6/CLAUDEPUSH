import { randomUUID } from 'crypto';
import { clone, assertNoExactLocationShallow } from '../platform-kernel/index.js';
import {
  DEFAULT_TIMELINE_LIMIT,
  STORED_EVENT_STATUSES,
  TIMELINE_AUDIT_ACTIONS,
  TIMELINE_EVENT_STATUS,
  TIMELINE_EVENT_TYPES,
  TIMELINE_IMPORTANCE,
  TIMELINE_IMPORTANCES,
  TIMELINE_ORDER,
  TIMELINE_VISIBILITY,
  TIMELINE_VISIBILITIES,
} from './constants.js';
import { InMemoryTravelTimelineRepository } from './repository.js';
import { duplicateError, notFoundError, validationError } from './errors.js';

const EXACT_LOCATION_FIELDS = [
  'coordinates', 'coordinate', 'lat', 'lng', 'latitude', 'longitude',
  'exactLocation', 'liveLocation', 'travellerLocation', 'currentLocation', 'gps', 'geo',
];

// Fields that identify the underlying fact and therefore can NEVER change
// through a correction (a different fact is a different event).
const IMMUTABLE_IDENTITY_FIELDS = ['travellerIdentityId', 'sourcePlatform', 'sourceEntityId', 'eventType'];

function now() {
  return new Date().toISOString();
}

// Backed by the platform kernel's shallow guard; passes this module's own
// validationError, label default, and field list so behaviour is unchanged.
function assertNoExactLocation(input = {}, label = 'timeline input') {
  return assertNoExactLocationShallow(input, validationError, { label, fields: EXACT_LOCATION_FIELDS });
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw validationError(`${field} is required`, { field });
  }
  return value.trim();
}

function normalizeSlug(value, field) {
  return assertNonEmptyString(value, field).toLowerCase();
}

function assertTimestamp(value, field = 'timestamp') {
  const raw = assertNonEmptyString(value, field);
  if (Number.isNaN(new Date(raw).getTime())) {
    throw validationError(`${field} must be a valid date`, { field, value });
  }
  return raw;
}

function assertEventType(value) {
  if (!TIMELINE_EVENT_TYPES.includes(value)) {
    throw validationError(`eventType must be one of: ${TIMELINE_EVENT_TYPES.join(', ')}`, { eventType: value });
  }
  return value;
}

function assertImportance(value) {
  if (!TIMELINE_IMPORTANCES.includes(value)) {
    throw validationError(`importance must be one of: ${TIMELINE_IMPORTANCES.join(', ')}`, { importance: value });
  }
  return value;
}

function assertVisibility(value) {
  if (!TIMELINE_VISIBILITIES.includes(value)) {
    throw validationError(`visibility must be one of: ${TIMELINE_VISIBILITIES.join(', ')}`, { visibility: value });
  }
  return value;
}

function normalizeConfidence(value) {
  if (value == null) return null;
  const num = Number(value);
  if (Number.isNaN(num) || num < 0 || num > 1) {
    throw validationError('confidence must be a number between 0 and 1', { confidence: value });
  }
  return num;
}

function normalizeMetadata(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw validationError('metadata must be an object', { metadata: value });
  }
  assertNoExactLocation(value, 'metadata');
  return clone(value);
}

function dayOf(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

// Deterministic chronological ordering: by event timestamp, then by recorded
// time, then by id — so output never depends on Map/insertion order.
function compareChronological(a, b) {
  return new Date(a.timestamp) - new Date(b.timestamp)
    || new Date(a.recordedAt) - new Date(b.recordedAt)
    || String(a.timelineEventId).localeCompare(String(b.timelineEventId));
}

export function createTravelTimelinePlatform(options = {}) {
  const repository = options.repository ?? new InMemoryTravelTimelineRepository();

  async function audit(action, event, details = {}) {
    return repository.appendAudit({
      action,
      timelineEventId: event.timelineEventId,
      travellerIdentityId: event.travellerIdentityId,
      details,
    });
  }

  function buildEvent(input, { correctsEventId = null, status = TIMELINE_EVENT_STATUS.ACTIVE } = {}) {
    const recordedAt = now();
    return {
      timelineEventId: `tev_${randomUUID()}`,
      travellerIdentityId: assertNonEmptyString(input.travellerIdentityId, 'travellerIdentityId'),
      tripId: input.tripId != null ? assertNonEmptyString(input.tripId, 'tripId') : null,
      eventType: assertEventType(input.eventType),
      sourcePlatform: normalizeSlug(input.sourcePlatform, 'sourcePlatform'),
      sourceEntityId: assertNonEmptyString(input.sourceEntityId, 'sourceEntityId'),
      timestamp: assertTimestamp(input.timestamp),
      importance: assertImportance(input.importance ?? TIMELINE_IMPORTANCE.NORMAL),
      visibility: assertVisibility(input.visibility ?? TIMELINE_VISIBILITY.PRIVATE),
      status: STORED_EVENT_STATUSES.includes(status) ? status : TIMELINE_EVENT_STATUS.ACTIVE,
      confidence: normalizeConfidence(input.confidence),
      metadata: normalizeMetadata(input.metadata),
      correctsEventId,
      recordedAt,
      deterministic: true,
      aiUsed: false,
    };
  }

  /**
   * Append a new immutable timeline event — a reference to a fact owned by a
   * source platform. The timeline stores no business data of its own.
   *
   * Idempotency: pass `idempotencyKey` for repeatable safety. Re-appending the
   * same key throws DUPLICATE_TIMELINE_EVENT. Without a key, events are treated
   * as distinct facts (repeatable events like trip_updated are allowed).
   */
  async function appendEvent(input = {}) {
    assertNoExactLocation(input, 'appendEvent input');
    const idempotencyKey = input.idempotencyKey != null
      ? assertNonEmptyString(input.idempotencyKey, 'idempotencyKey')
      : null;

    if (idempotencyKey) {
      const existingId = await repository.getIdByIdempotencyKey(idempotencyKey);
      if (existingId) throw duplicateError(idempotencyKey, existingId);
    }

    const event = buildEvent(input);
    await repository.append(event, { idempotencyKey });
    await audit(TIMELINE_AUDIT_ACTIONS.EVENT_APPENDED, event, {
      eventType: event.eventType,
      sourcePlatform: event.sourcePlatform,
      sourceEntityId: event.sourceEntityId,
    });
    return clone(event);
  }

  async function loadEvent(timelineEventId) {
    const event = await repository.get(assertNonEmptyString(timelineEventId, 'timelineEventId'));
    if (!event) throw notFoundError(timelineEventId);
    return event;
  }

  /**
   * Correct an event WITHOUT mutating it. Appends a NEW event that supersedes
   * the original (linked via correctsEventId) and writes a correction audit
   * record. The original remains as an immutable historical fact.
   *
   * Only display/chronology fields may change; identity fields that define the
   * underlying fact cannot.
   */
  async function correctEvent(input = {}) {
    const original = await loadEvent(input.timelineEventId);
    const changes = input.changes ?? {};
    assertNoExactLocation(changes, 'changes');
    const illegal = IMMUTABLE_IDENTITY_FIELDS.filter(field => field in changes);
    if (illegal.length) {
      throw validationError('Cannot change identity fields via correction', { fields: illegal });
    }

    const corrected = buildEvent({
      travellerIdentityId: original.travellerIdentityId,
      sourcePlatform: original.sourcePlatform,
      sourceEntityId: original.sourceEntityId,
      eventType: original.eventType,
      tripId: 'tripId' in changes ? changes.tripId : original.tripId,
      timestamp: changes.timestamp ?? original.timestamp,
      importance: changes.importance ?? original.importance,
      visibility: changes.visibility ?? original.visibility,
      confidence: 'confidence' in changes ? changes.confidence : original.confidence,
      metadata: 'metadata' in changes ? changes.metadata : original.metadata,
    }, { correctsEventId: original.timelineEventId });

    await repository.append(corrected);
    await audit(TIMELINE_AUDIT_ACTIONS.EVENT_CORRECTED, corrected, {
      correctsEventId: original.timelineEventId,
      fields: Object.keys(changes),
      reason: typeof input.reason === 'string' ? input.reason : null,
    });
    return clone(corrected);
  }

  /**
   * Redact an event's content while preserving its chronological slot. Appends
   * a REDACTED superseding event with cleared metadata; the original is never
   * mutated.
   */
  async function redactEvent(input = {}) {
    const original = await loadEvent(input.timelineEventId);
    const redaction = buildEvent({
      travellerIdentityId: original.travellerIdentityId,
      sourcePlatform: original.sourcePlatform,
      sourceEntityId: original.sourceEntityId,
      eventType: original.eventType,
      tripId: original.tripId,
      timestamp: original.timestamp,
      importance: original.importance,
      visibility: TIMELINE_VISIBILITY.PRIVATE,
      confidence: null,
      metadata: {},
    }, { correctsEventId: original.timelineEventId, status: TIMELINE_EVENT_STATUS.REDACTED });

    await repository.append(redaction);
    await audit(TIMELINE_AUDIT_ACTIONS.EVENT_REDACTED, redaction, {
      correctsEventId: original.timelineEventId,
      reason: typeof input.reason === 'string' ? input.reason : null,
    });
    return clone(redaction);
  }

  async function getEvent(timelineEventId) {
    return clone(await loadEvent(timelineEventId));
  }

  function decorate(event, supersededIds) {
    const superseded = supersededIds.has(event.timelineEventId);
    return {
      ...event,
      superseded,
      effectiveStatus: superseded ? TIMELINE_EVENT_STATUS.SUPERSEDED : event.status,
    };
  }

  /**
   * The core query. Future-friendly: a single filter object drives every read.
   * Returns the deterministic effective timeline (superseded originals hidden by
   * default; corrections shown in their place).
   */
  async function query(filter = {}) {
    let base;
    if (filter.travellerIdentityId) base = await repository.listByTraveller(filter.travellerIdentityId);
    else if (filter.tripId) base = await repository.listByTrip(filter.tripId);
    else base = await repository.listAll();

    // Any id referenced by a correction is superseded.
    const supersededIds = new Set(base.map(e => e.correctsEventId).filter(Boolean));

    const from = filter.from ? new Date(filter.from).getTime() : null;
    const to = filter.to ? new Date(filter.to).getTime() : null;
    const includeSuperseded = filter.includeSuperseded === true;
    const includeRedacted = filter.includeRedacted !== false; // default true

    const rows = base.filter(event => {
      if (filter.travellerIdentityId && event.travellerIdentityId !== filter.travellerIdentityId) return false;
      if (filter.tripId && event.tripId !== filter.tripId) return false;
      if (filter.sourcePlatform && event.sourcePlatform !== String(filter.sourcePlatform).toLowerCase()) return false;
      if (filter.eventType && event.eventType !== filter.eventType) return false;
      if (filter.importance && event.importance !== filter.importance) return false;
      if (filter.visibility && event.visibility !== filter.visibility) return false;
      if (filter.status && event.status !== filter.status) return false;
      if (!includeSuperseded && supersededIds.has(event.timelineEventId)) return false;
      if (!includeRedacted && event.status === TIMELINE_EVENT_STATUS.REDACTED) return false;
      if (from != null && new Date(event.timestamp).getTime() < from) return false;
      if (to != null && new Date(event.timestamp).getTime() > to) return false;
      return true;
    });

    rows.sort(compareChronological);
    if (filter.order === TIMELINE_ORDER.DESC) rows.reverse();

    const limit = Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : DEFAULT_TIMELINE_LIMIT;
    return rows.slice(0, limit).map(event => decorate(event, supersededIds));
  }

  // Thin, named wrappers over the core query.
  const listByTraveller = (travellerIdentityId, filter = {}) =>
    query({ ...filter, travellerIdentityId: assertNonEmptyString(travellerIdentityId, 'travellerIdentityId') });
  const listByTrip = (tripId, filter = {}) =>
    query({ ...filter, tripId: assertNonEmptyString(tripId, 'tripId') });
  const listBySourcePlatform = (sourcePlatform, filter = {}) =>
    query({ ...filter, sourcePlatform: normalizeSlug(sourcePlatform, 'sourcePlatform') });
  const listByEventType = (eventType, filter = {}) =>
    query({ ...filter, eventType: assertEventType(eventType) });
  const listByDateRange = (from, to, filter = {}) =>
    query({ ...filter, from: assertTimestamp(from, 'from'), to: assertTimestamp(to, 'to') });

  async function groupByDay(filter = {}) {
    const events = await query(filter);
    const groups = new Map();
    for (const event of events) {
      const day = dayOf(event.timestamp);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(event);
    }
    return [...groups.keys()].sort().map(day => ({ day, events: groups.get(day) }));
  }

  async function groupByTrip(filter = {}) {
    const events = await query(filter);
    const groups = new Map();
    for (const event of events) {
      const key = event.tripId ?? '__no_trip__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    }
    // Deterministic: trip ids sorted; the no-trip bucket (null) sorts last.
    return [...groups.keys()]
      .sort((a, b) => {
        if (a === '__no_trip__') return 1;
        if (b === '__no_trip__') return -1;
        return a.localeCompare(b);
      })
      .map(key => ({ tripId: key === '__no_trip__' ? null : key, events: groups.get(key) }));
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    appendEvent,
    correctEvent,
    redactEvent,
    getEvent,
    query,
    listByTraveller,
    listByTrip,
    listBySourcePlatform,
    listByEventType,
    listByDateRange,
    groupByDay,
    groupByTrip,
    getAuditEvents,
  };
}
