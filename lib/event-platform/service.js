import { randomUUID } from 'crypto';
import { clone, assertNoExactLocation } from '../platform-kernel/index.js';
import {
  DEFAULT_EVENT_QUERY_LIMIT,
  EVENT_CATEGORIES,
  EVENT_ORDER,
  EVENT_SCHEMA_VERSION,
} from './constants.js';
import { InMemoryEventRepository } from './repository.js';
import { duplicateError, notFoundError, validationError } from './errors.js';

function now() {
  return new Date().toISOString();
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw validationError(`${field} is required`, { field });
  return value.trim();
}

function normalizeSlug(value, field) {
  return assertNonEmptyString(value, field).toLowerCase();
}

function optionalString(value, field) {
  if (value == null) return null;
  return assertNonEmptyString(value, field);
}

function assertTimestamp(value, field = 'timestamp') {
  const raw = assertNonEmptyString(value, field);
  if (Number.isNaN(new Date(raw).getTime())) throw validationError(`${field} must be a valid ISO timestamp`, { field, value });
  return raw;
}

// Backed by the platform kernel; passes this module's own validationError + the
// caller-supplied label so the error type and message are unchanged.
function assertNoLocationDeep(value, label) {
  return assertNoExactLocation(value, validationError, { label });
}

function assertCategory(value) {
  if (!EVENT_CATEGORIES.includes(value)) {
    throw validationError(`eventCategory must be one of: ${EVENT_CATEGORIES.join(', ')}`, { eventCategory: value });
  }
  return value;
}

// References are pure entity pointers — {type, id} only. Any extra keys are
// dropped so business data can never ride along inside a reference.
function normalizeReferences(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw validationError('references must be an array', { references: value });
  return value.map((ref, index) => {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
      throw validationError(`references[${index}] must be an object with { type, id }`, { index });
    }
    return {
      type: normalizeSlug(ref.type, `references[${index}].type`),
      id: assertNonEmptyString(ref.id, `references[${index}].id`),
    };
  });
}

function normalizeMetadata(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw validationError('metadata must be an object', { metadata: value });
  assertNoLocationDeep(value, 'metadata');
  return clone(value);
}

// Deterministic total order: by append sequence. Sequence is monotonic and
// unique, so ordering never depends on timestamp ties or storage iteration.
function bySequenceAsc(a, b) {
  return a.sequence - b.sequence;
}

function matchesEntity(event, type, id) {
  const t = String(type).toLowerCase();
  if (event.sourceEntityType === t && event.sourceEntityId === id) return true;
  return (event.references ?? []).some(ref => ref.type === t && ref.id === id);
}

export function createEventPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryEventRepository();
  const schemaVersion = options.schemaVersion ?? EVENT_SCHEMA_VERSION;

  /**
   * Append a new immutable event. The eventId is caller-supplied for
   * idempotency (a duplicate id is rejected) or generated when absent. The
   * event is stamped with a monotonic `sequence` (total order) and an immutable
   * `audit.recordedAt`. There is no update or delete — corrections are new
   * events that reference the original.
   */
  async function appendEvent(input = {}) {
    if (input == null || typeof input !== 'object' || Array.isArray(input)) {
      throw validationError('event input must be an object');
    }
    assertNoLocationDeep(input, 'event');

    const eventId = input.eventId != null
      ? assertNonEmptyString(input.eventId, 'eventId')
      : `evt_${randomUUID()}`;
    if (await repository.has(eventId)) throw duplicateError(eventId);

    const event = {
      eventId,
      schemaVersion,
      eventCategory: assertCategory(input.eventCategory),
      eventType: assertNonEmptyString(input.eventType, 'eventType'),
      sourcePlatform: normalizeSlug(input.sourcePlatform, 'sourcePlatform'),
      sourceModule: normalizeSlug(input.sourceModule, 'sourceModule'),
      sourceEntityType: normalizeSlug(input.sourceEntityType, 'sourceEntityType'),
      sourceEntityId: assertNonEmptyString(input.sourceEntityId, 'sourceEntityId'),
      actorIdentityId: optionalString(input.actorIdentityId, 'actorIdentityId'),
      organisationId: optionalString(input.organisationId, 'organisationId'),
      timestamp: assertTimestamp(input.timestamp ?? now()),
      references: normalizeReferences(input.references),
      metadata: normalizeMetadata(input.metadata),
      sequence: (await repository.size()) + 1, // monotonic append offset
      audit: { recordedAt: input.recordedAt ?? now() },
    };

    await repository.append(event);
    return clone(event);
  }

  async function getEvent(eventId) {
    const event = await repository.getById(assertNonEmptyString(eventId, 'eventId'));
    if (!event) throw notFoundError(eventId);
    return event;
  }

  /**
   * The core query. A single filter object drives every read; the named helpers
   * below are thin wrappers. Results are always returned in deterministic
   * sequence order.
   */
  async function queryEvents(filter = {}) {
    const all = await repository.list();
    const from = filter.from ? new Date(filter.from).getTime() : null;
    const to = filter.to ? new Date(filter.to).getTime() : null;
    const refType = filter.referenceType ? String(filter.referenceType).toLowerCase() : null;

    const rows = all.filter(event => {
      if (filter.eventCategory && event.eventCategory !== filter.eventCategory) return false;
      if (filter.eventType && event.eventType !== filter.eventType) return false;
      if (filter.sourcePlatform && event.sourcePlatform !== String(filter.sourcePlatform).toLowerCase()) return false;
      if (filter.sourceModule && event.sourceModule !== String(filter.sourceModule).toLowerCase()) return false;
      if (filter.sourceEntityType && event.sourceEntityType !== String(filter.sourceEntityType).toLowerCase()) return false;
      if (filter.sourceEntityId && event.sourceEntityId !== filter.sourceEntityId) return false;
      if (filter.actorIdentityId && event.actorIdentityId !== filter.actorIdentityId) return false;
      if (filter.organisationId && event.organisationId !== filter.organisationId) return false;
      if (filter.sinceSequence != null && event.sequence <= filter.sinceSequence) return false;
      if (refType && filter.referenceId
        && !(event.references ?? []).some(r => r.type === refType && r.id === filter.referenceId)) return false;
      if (from != null && new Date(event.timestamp).getTime() < from) return false;
      if (to != null && new Date(event.timestamp).getTime() > to) return false;
      return true;
    });

    rows.sort(bySequenceAsc);
    if (filter.order === EVENT_ORDER.DESC) rows.reverse();
    const limit = Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : DEFAULT_EVENT_QUERY_LIMIT;
    return rows.slice(0, limit);
  }

  /**
   * Events about an entity — where it is the source entity OR a reference.
   * The single most important cross-product query: the full event history of
   * any thing in any product.
   */
  async function queryByEntity(entity = {}, filter = {}) {
    const type = normalizeSlug(entity.type, 'entity.type');
    const id = assertNonEmptyString(entity.id, 'entity.id');
    const all = await repository.list();
    const rows = all
      .filter(event => matchesEntity(event, type, id))
      .filter(event => !filter.eventCategory || event.eventCategory === filter.eventCategory)
      .filter(event => !filter.sourcePlatform || event.sourcePlatform === String(filter.sourcePlatform).toLowerCase());
    rows.sort(bySequenceAsc);
    if (filter.order === EVENT_ORDER.DESC) rows.reverse();
    const limit = Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : DEFAULT_EVENT_QUERY_LIMIT;
    return rows.slice(0, limit);
  }

  function queryByActor(actorIdentityId, filter = {}) {
    return queryEvents({ ...filter, actorIdentityId: assertNonEmptyString(actorIdentityId, 'actorIdentityId') });
  }

  function queryByPlatform(sourcePlatform, filter = {}) {
    return queryEvents({ ...filter, sourcePlatform: normalizeSlug(sourcePlatform, 'sourcePlatform') });
  }

  function queryByCategory(eventCategory, filter = {}) {
    return queryEvents({ ...filter, eventCategory: assertCategory(eventCategory) });
  }

  return {
    repository,
    schemaVersion,
    appendEvent,
    getEvent,
    queryEvents,
    queryByEntity,
    queryByActor,
    queryByPlatform,
    queryByCategory,
  };
}
