import { randomUUID } from 'crypto';
import {
  ITINERARY_AUDIT_ACTIONS,
  ITINERARY_BLOCK_TYPE,
  ITINERARY_BLOCK_TYPES,
  ITINERARY_SECTION,
  ITINERARY_SECTION_KEYS,
  ITINERARY_STATUS,
  MEAL_TYPE,
  RAIN_ALTERNATIVES_KEY,
} from './constants.js';
import { InMemoryItineraryRepository } from './repository.js';
import {
  blockNotFoundError,
  dayNotFoundError,
  notFoundError,
  validationError,
  versionNotFoundError,
} from './errors.js';

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

function assertNoExactLocation(input = {}, label = 'itinerary input') {
  if (input == null || typeof input !== 'object') return input;
  const present = EXACT_LOCATION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) {
    throw validationError(`${label} must not include exact traveller location`, { fields: present });
  }
  return input;
}

function assertObject(value, field) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(`${field} must be an object`, { field });
  }
  assertNoExactLocation(value, field);
  return value;
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw validationError(`${field} is required`, { field });
  }
  return value.trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function addDays(dateString, days) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Normalise an arbitrary block input into a stored block. Blocks are the
 * editable unit of an itinerary: activities, transport, meals, rest periods,
 * free time and rain-day alternatives all share this shape.
 */
function normalizeBlock(input = {}, { defaultType } = {}) {
  assertObject(input, 'block');
  const type = input.type ?? defaultType;
  if (!ITINERARY_BLOCK_TYPES.includes(type)) {
    throw validationError(`block.type must be one of: ${ITINERARY_BLOCK_TYPES.join(', ')}`, { type });
  }
  if (input.details != null) assertObject(input.details, 'block.details');

  return {
    blockId: input.blockId ?? `block_${randomUUID()}`,
    type,
    title: typeof input.title === 'string' && input.title.trim()
      ? input.title.trim()
      : defaultTitleForType(type),
    notes: typeof input.notes === 'string' ? input.notes : '',
    sourceRecommendationId: input.sourceRecommendationId ?? null,
    locked: input.locked === true,
    details: clone(input.details ?? {}),
  };
}

function defaultTitleForType(type) {
  switch (type) {
    case ITINERARY_BLOCK_TYPE.ACTIVITY: return 'Activity';
    case ITINERARY_BLOCK_TYPE.TRANSPORT: return 'Transport';
    case ITINERARY_BLOCK_TYPE.MEAL: return 'Meal';
    case ITINERARY_BLOCK_TYPE.REST: return 'Rest';
    case ITINERARY_BLOCK_TYPE.FREE_TIME: return 'Free time';
    case ITINERARY_BLOCK_TYPE.RAIN_ALTERNATIVE: return 'Rain-day alternative';
    default: return 'Block';
  }
}

function placeholderBlock(type, title, extra = {}) {
  return normalizeBlock({ type, title, ...extra });
}

function emptyDay(dayNumber, date, destinationFocus) {
  return {
    day: dayNumber,
    date: date ?? null,
    destinationFocus: destinationFocus ?? null,
    [ITINERARY_SECTION.MORNING]: [],
    [ITINERARY_SECTION.AFTERNOON]: [],
    [ITINERARY_SECTION.EVENING]: [],
    [RAIN_ALTERNATIVES_KEY]: [],
  };
}

function activityBlockFromSuggestion(suggestion) {
  if (!suggestion || !suggestion.recommendationId) return null;
  return normalizeBlock({
    type: ITINERARY_BLOCK_TYPE.ACTIVITY,
    title: suggestion.title,
    notes: typeof suggestion.explanation === 'string' ? suggestion.explanation : '',
    sourceRecommendationId: suggestion.recommendationId,
    details: { itemId: suggestion.itemId ?? null, suggestionType: suggestion.type ?? null },
  });
}

/**
 * Build one editable itinerary day from a Trip Intelligence daily plan.
 * Every supported block type is represented so a generated itinerary is a
 * complete, editable skeleton: meals, transport, rest, free time and a
 * rain-day alternative, plus the planned activities.
 */
function dayFromDailyPlan(dailyPlan, dayNumber) {
  const day = emptyDay(dayNumber, dailyPlan?.date, dailyPlan?.destinationFocus);

  const morningActivity = activityBlockFromSuggestion(dailyPlan?.morningSuggestion);
  day[ITINERARY_SECTION.MORNING].push(
    placeholderBlock(ITINERARY_BLOCK_TYPE.MEAL, 'Breakfast', { details: { mealType: MEAL_TYPE.BREAKFAST } }),
    placeholderBlock(ITINERARY_BLOCK_TYPE.TRANSPORT, 'Transport to morning activity'),
    morningActivity ?? placeholderBlock(ITINERARY_BLOCK_TYPE.FREE_TIME, 'Free morning'),
  );

  const afternoonActivity = activityBlockFromSuggestion(dailyPlan?.afternoonSuggestion);
  day[ITINERARY_SECTION.AFTERNOON].push(
    placeholderBlock(ITINERARY_BLOCK_TYPE.MEAL, 'Lunch', { details: { mealType: MEAL_TYPE.LUNCH } }),
    afternoonActivity ?? placeholderBlock(ITINERARY_BLOCK_TYPE.FREE_TIME, 'Free afternoon'),
    placeholderBlock(ITINERARY_BLOCK_TYPE.REST, 'Rest period'),
  );

  const eveningActivity = activityBlockFromSuggestion(dailyPlan?.eveningSuggestion);
  day[ITINERARY_SECTION.EVENING].push(
    eveningActivity ?? placeholderBlock(ITINERARY_BLOCK_TYPE.FREE_TIME, 'Free evening'),
    placeholderBlock(ITINERARY_BLOCK_TYPE.MEAL, 'Dinner', { details: { mealType: MEAL_TYPE.DINNER } }),
  );

  const backup = dailyPlan?.backupRainyDayOption;
  if (backup && backup.recommendationId) {
    day[RAIN_ALTERNATIVES_KEY].push(normalizeBlock({
      type: ITINERARY_BLOCK_TYPE.RAIN_ALTERNATIVE,
      title: backup.title,
      notes: typeof backup.explanation === 'string' ? backup.explanation : '',
      sourceRecommendationId: backup.recommendationId,
      details: { itemId: backup.itemId ?? null },
    }));
  }

  return day;
}

function snapshotOf(itinerary, label) {
  return {
    version: itinerary.version,
    status: itinerary.status,
    title: itinerary.title,
    label,
    days: clone(itinerary.days),
    createdAt: now(),
  };
}

function findBlockLocation(itinerary, blockId) {
  for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex += 1) {
    const day = itinerary.days[dayIndex];
    for (const key of [...ITINERARY_SECTION_KEYS, RAIN_ALTERNATIVES_KEY]) {
      const index = day[key].findIndex(block => block.blockId === blockId);
      if (index !== -1) return { dayIndex, key, index, block: day[key][index] };
    }
  }
  return null;
}

function findDay(itinerary, day) {
  const match = itinerary.days.find(entry => entry.day === day);
  if (!match) throw dayNotFoundError(day);
  return match;
}

function assertSection(section) {
  if (!ITINERARY_SECTION_KEYS.includes(section)) {
    throw validationError(`section must be one of: ${ITINERARY_SECTION_KEYS.join(', ')}`, { section });
  }
  return section;
}

export function createItineraryPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryItineraryRepository();

  async function audit(action, itineraryId, details = {}) {
    return repository.appendAudit({ action, itineraryId, details });
  }

  async function loadItinerary(itineraryId) {
    const itinerary = await repository.getItinerary(itineraryId);
    if (!itinerary) throw notFoundError(itineraryId);
    return itinerary;
  }

  // M20 Phase 1 — optional publishing into Timeline & Relationship Graph via
  // injected ports. No direct imports; publishers are optional; publishing is
  // best-effort and ISOLATED so it can never fail a business operation. Only
  // references (ids) are published — never itinerary business data.
  const timelinePublisher = options.timelinePublisher ?? null;
  const relationshipPublisher = options.relationshipPublisher ?? null;
  if (timelinePublisher && typeof timelinePublisher.appendEvent !== 'function') {
    throw validationError('timelinePublisher must expose appendEvent()');
  }
  if (relationshipPublisher && typeof relationshipPublisher.createRelationship !== 'function') {
    throw validationError('relationshipPublisher must expose createRelationship()');
  }

  // activity_added/removed map to the graph/timeline's native `activity` type;
  // the rest use the `custom` escape hatch with the precise metadata.eventName.
  const ITINERARY_NATIVE_TYPE = { activity_added: 'activity', activity_removed: 'activity' };

  function slug(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  }

  function activityRef(block) {
    return block.details?.itemId ?? block.blockId; // reference id, never activity data
  }

  async function safePublish(task) {
    if (!task) return;
    try { await task(); } catch { /* publishing is isolated; never fail the op */ }
  }

  async function publishItineraryEvent(itinerary, eventName, extra = {}) {
    if (!timelinePublisher || !itinerary.ownerIdentityId) return;
    const discriminator = extra.discriminator ?? (eventName === 'itinerary_created' ? 'created' : String(itinerary.version));
    await safePublish(() => timelinePublisher.appendEvent({
      travellerIdentityId: itinerary.ownerIdentityId,
      tripId: itinerary.tripId,
      eventType: ITINERARY_NATIVE_TYPE[eventName] ?? 'custom',
      sourcePlatform: 'itinerary-platform',
      sourceEntityId: extra.sourceEntityId ?? itinerary.itineraryId, // reference only
      timestamp: itinerary.updatedAt ?? itinerary.createdAt,
      metadata: { eventName, ...(extra.metadata ?? {}) },
      idempotencyKey: `itinerary-platform:${eventName}:${itinerary.itineraryId}:${discriminator}`,
    }));
  }

  async function publishContainsItinerary(itinerary) {
    if (!relationshipPublisher || !itinerary.tripId) return;
    // Trip CONTAINS Itinerary (CONTAINS via the graph's `custom` type).
    await safePublish(() => relationshipPublisher.createRelationship({
      from: { type: 'trip', id: itinerary.tripId },
      to: { type: 'itinerary', id: itinerary.itineraryId },
      relationshipType: 'custom',
      metadata: { relationshipName: 'contains' },
    }));
  }

  async function publishActivityEdges(itinerary, day, block) {
    if (!relationshipPublisher || block.type !== ITINERARY_BLOCK_TYPE.ACTIVITY) return;
    const activityId = activityRef(block);
    // Itinerary CONTAINS Activity
    await safePublish(() => relationshipPublisher.createRelationship({
      from: { type: 'itinerary', id: itinerary.itineraryId },
      to: { type: 'activity', id: activityId },
      relationshipType: 'custom',
      metadata: { relationshipName: 'contains' },
    }));
    // Traveller PLANNED Activity
    if (itinerary.ownerIdentityId) {
      await safePublish(() => relationshipPublisher.createRelationship({
        from: { type: 'traveller', id: itinerary.ownerIdentityId },
        to: { type: 'activity', id: activityId },
        relationshipType: 'planned',
      }));
    }
    // Activity LOCATED_AT Destination (mapped to the graph's native located_in).
    if (day?.destinationFocus) {
      await safePublish(() => relationshipPublisher.createRelationship({
        from: { type: 'activity', id: activityId },
        to: { type: 'destination', id: slug(day.destinationFocus) },
        relationshipType: 'located_in',
      }));
    }
  }

  async function publishItineraryCreated(itinerary) {
    await publishItineraryEvent(itinerary, 'itinerary_created');
    await publishContainsItinerary(itinerary);
    // Publish edges for any activity blocks already present in the generated days.
    for (const day of itinerary.days) {
      for (const key of ITINERARY_SECTION_KEYS) {
        for (const block of day[key]) {
          if (block.type === ITINERARY_BLOCK_TYPE.ACTIVITY) await publishActivityEdges(itinerary, day, block);
        }
      }
    }
  }

  // Persist a mutated itinerary: bump version, snapshot it into version
  // history, audit it. Editing a published itinerary reopens it as a draft so
  // the published snapshot is preserved in history and never silently changed.
  // Publishes `itinerary_updated` by default; callers handling a more specific
  // event (activity_added/removed) pass publishEvent:false and publish it themselves.
  async function commit(itinerary, { action, details = {}, label, reopen = true, publishEvent = true }) {
    if (reopen && itinerary.status === ITINERARY_STATUS.PUBLISHED) {
      itinerary.status = ITINERARY_STATUS.DRAFT;
    }
    itinerary.version += 1;
    itinerary.updatedAt = now();
    await repository.saveItinerary(itinerary);
    await repository.appendVersion(itinerary.itineraryId, snapshotOf(itinerary, label ?? action));
    await audit(action, itinerary.itineraryId, details);
    if (publishEvent) await publishItineraryEvent(itinerary, 'itinerary_updated');
    return clone(itinerary);
  }

  function baseItinerary({ tripId, tripPlanId, ownerIdentityId, title, days }) {
    const createdAt = now();
    return {
      itineraryId: `itinerary_${randomUUID()}`,
      tripId: tripId ?? null,
      tripPlanId: tripPlanId ?? null,
      ownerIdentityId: ownerIdentityId ?? null,
      title: title ?? 'Untitled itinerary',
      status: ITINERARY_STATUS.DRAFT,
      version: 1,
      deterministic: true,
      aiUsed: false,
      days,
      createdAt,
      updatedAt: createdAt,
      publishedAt: null,
    };
  }

  async function persistNew(itinerary, details) {
    await repository.saveItinerary(itinerary);
    await repository.appendVersion(itinerary.itineraryId, snapshotOf(itinerary, 'created'));
    await audit(ITINERARY_AUDIT_ACTIONS.ITINERARY_CREATED, itinerary.itineraryId, details);
    await publishItineraryCreated(itinerary);
    return clone(itinerary);
  }

  /**
   * Build an editable itinerary from a Trip Intelligence trip plan.
   * Consumes the plan as an immutable snapshot — it never mutates the plan or
   * any upstream domain.
   */
  async function createItineraryFromTripPlan(input = {}) {
    assertNoExactLocation(input, 'createItineraryFromTripPlan input');
    const tripPlan = assertObject(input.tripPlan, 'tripPlan');
    const dailyPlans = asArray(tripPlan.dailyPlans);
    if (!dailyPlans.length) {
      throw validationError('tripPlan must contain at least one daily plan', { tripPlanId: tripPlan.tripPlanId });
    }

    const ownerIdentityId = input.ownerIdentityId
      ?? tripPlan.travellerIdentityId
      ?? null;
    const days = dailyPlans.map((dailyPlan, index) => dayFromDailyPlan(dailyPlan, index + 1));
    const itinerary = baseItinerary({
      tripId: input.tripId ?? tripPlan.tripId ?? null,
      tripPlanId: tripPlan.tripPlanId ?? null,
      ownerIdentityId,
      title: input.title ?? `Itinerary for ${tripPlan.destinationFocus?.name ?? 'trip'}`,
      days,
    });

    return persistNew(itinerary, {
      tripPlanId: itinerary.tripPlanId,
      tripId: itinerary.tripId,
      days: itinerary.days.length,
    });
  }

  /**
   * Build a blank multi-day itinerary skeleton without a trip plan.
   * Useful for fully manual itineraries; still deterministic.
   */
  async function createBlankItinerary(input = {}) {
    assertNoExactLocation(input, 'createBlankItinerary input');
    const dayCount = Number(input.days ?? 1);
    if (!Number.isInteger(dayCount) || dayCount < 1) {
      throw validationError('days must be a positive integer', { days: input.days });
    }
    const days = Array.from({ length: dayCount }, (_, index) => emptyDay(
      index + 1,
      addDays(input.startDate, index),
      input.destinationFocus ?? null,
    ));
    const itinerary = baseItinerary({
      tripId: input.tripId ?? null,
      tripPlanId: input.tripPlanId ?? null,
      ownerIdentityId: input.ownerIdentityId ?? null,
      title: input.title ?? 'Untitled itinerary',
      days,
    });
    return persistNew(itinerary, { tripId: itinerary.tripId, days: itinerary.days.length });
  }

  async function getItinerary(itineraryId) {
    return clone(await loadItinerary(itineraryId));
  }

  async function listItinerariesForTrip(tripId) {
    return repository.listItinerariesForTrip(tripId);
  }

  async function listItinerariesForOwner(ownerIdentityId) {
    return repository.listItinerariesForOwner(ownerIdentityId);
  }

  async function addBlock(input = {}) {
    const itinerary = await loadItinerary(assertNonEmptyString(input.itineraryId, 'itineraryId'));
    const section = assertSection(input.section);
    const day = findDay(itinerary, input.day);
    const block = normalizeBlock(input.block, { defaultType: ITINERARY_BLOCK_TYPE.ACTIVITY });
    const index = Number.isInteger(input.index)
      ? Math.max(0, Math.min(input.index, day[section].length))
      : day[section].length;
    day[section].splice(index, 0, block);
    const isActivity = block.type === ITINERARY_BLOCK_TYPE.ACTIVITY;
    await commit(itinerary, {
      action: ITINERARY_AUDIT_ACTIONS.BLOCK_ADDED,
      details: { day: day.day, section, blockId: block.blockId, type: block.type },
      publishEvent: !isActivity, // activity blocks emit the specific event below
    });
    if (isActivity) {
      await publishItineraryEvent(itinerary, 'activity_added', {
        sourceEntityId: activityRef(block),
        discriminator: block.blockId,
        metadata: { activityId: activityRef(block), blockId: block.blockId, day: day.day },
      });
      await publishActivityEdges(itinerary, day, block);
    }
    return clone(block);
  }

  async function addRainAlternative(input = {}) {
    const itinerary = await loadItinerary(assertNonEmptyString(input.itineraryId, 'itineraryId'));
    const day = findDay(itinerary, input.day);
    const block = normalizeBlock(
      { ...input.block, type: ITINERARY_BLOCK_TYPE.RAIN_ALTERNATIVE },
      { defaultType: ITINERARY_BLOCK_TYPE.RAIN_ALTERNATIVE },
    );
    day[RAIN_ALTERNATIVES_KEY].push(block);
    await commit(itinerary, {
      action: ITINERARY_AUDIT_ACTIONS.RAIN_ALTERNATIVE_ADDED,
      details: { day: day.day, blockId: block.blockId },
    });
    return clone(block);
  }

  async function updateBlock(input = {}) {
    const itinerary = await loadItinerary(assertNonEmptyString(input.itineraryId, 'itineraryId'));
    const blockId = assertNonEmptyString(input.blockId, 'blockId');
    const changes = assertObject(input.changes, 'changes');
    const location = findBlockLocation(itinerary, blockId);
    if (!location) throw blockNotFoundError(blockId);

    const block = location.block;
    if ('title' in changes) block.title = assertNonEmptyString(changes.title, 'changes.title');
    if ('notes' in changes) {
      if (typeof changes.notes !== 'string') throw validationError('changes.notes must be a string', { blockId });
      block.notes = changes.notes;
    }
    if ('locked' in changes) block.locked = changes.locked === true;
    if ('details' in changes) {
      block.details = { ...block.details, ...assertObject(changes.details, 'changes.details') };
    }
    if ('sourceRecommendationId' in changes) block.sourceRecommendationId = changes.sourceRecommendationId ?? null;

    await commit(itinerary, {
      action: ITINERARY_AUDIT_ACTIONS.BLOCK_UPDATED,
      details: { blockId, fields: Object.keys(changes) },
    });
    return clone(block);
  }

  async function setBlockNotes(input = {}) {
    const itinerary = await loadItinerary(assertNonEmptyString(input.itineraryId, 'itineraryId'));
    const blockId = assertNonEmptyString(input.blockId, 'blockId');
    if (typeof input.notes !== 'string') throw validationError('notes must be a string', { blockId });
    const location = findBlockLocation(itinerary, blockId);
    if (!location) throw blockNotFoundError(blockId);
    location.block.notes = input.notes;
    await commit(itinerary, {
      action: ITINERARY_AUDIT_ACTIONS.BLOCK_NOTES_UPDATED,
      details: { blockId },
    });
    return clone(location.block);
  }

  async function removeBlock(input = {}) {
    const itinerary = await loadItinerary(assertNonEmptyString(input.itineraryId, 'itineraryId'));
    const blockId = assertNonEmptyString(input.blockId, 'blockId');
    const location = findBlockLocation(itinerary, blockId);
    if (!location) throw blockNotFoundError(blockId);
    const removedBlock = location.block;
    const isActivity = removedBlock.type === ITINERARY_BLOCK_TYPE.ACTIVITY;
    itinerary.days[location.dayIndex][location.key].splice(location.index, 1);
    await commit(itinerary, {
      action: ITINERARY_AUDIT_ACTIONS.BLOCK_REMOVED,
      details: { blockId, section: location.key },
      publishEvent: !isActivity, // activity blocks emit the specific event below
    });
    if (isActivity) {
      await publishItineraryEvent(itinerary, 'activity_removed', {
        sourceEntityId: activityRef(removedBlock),
        discriminator: removedBlock.blockId,
        metadata: { activityId: activityRef(removedBlock), blockId },
      });
    }
    return clone(itinerary);
  }

  /**
   * Move a block to a different section within the same day (reorder / retime).
   */
  async function moveBlock(input = {}) {
    const itinerary = await loadItinerary(assertNonEmptyString(input.itineraryId, 'itineraryId'));
    const blockId = assertNonEmptyString(input.blockId, 'blockId');
    const toSection = assertSection(input.toSection);
    const location = findBlockLocation(itinerary, blockId);
    if (!location) throw blockNotFoundError(blockId);

    const day = itinerary.days[location.dayIndex];
    const [block] = day[location.key].splice(location.index, 1);
    const target = day[toSection];
    const toIndex = Number.isInteger(input.toIndex)
      ? Math.max(0, Math.min(input.toIndex, target.length))
      : target.length;
    target.splice(toIndex, 0, block);
    await commit(itinerary, {
      action: ITINERARY_AUDIT_ACTIONS.BLOCK_MOVED,
      details: { blockId, from: location.key, to: toSection, toIndex },
    });
    return clone(block);
  }

  async function publishItinerary(itineraryId) {
    const itinerary = await loadItinerary(assertNonEmptyString(itineraryId, 'itineraryId'));
    itinerary.status = ITINERARY_STATUS.PUBLISHED;
    itinerary.publishedAt = now();
    return commit(itinerary, {
      action: ITINERARY_AUDIT_ACTIONS.ITINERARY_PUBLISHED,
      details: { publishedAt: itinerary.publishedAt },
      label: 'published',
      reopen: false,
    });
  }

  /**
   * Restore a previous version's days/title/status. Append-only: reverting
   * creates a new version rather than deleting history.
   */
  async function revertToVersion(input = {}) {
    const itineraryId = assertNonEmptyString(input.itineraryId, 'itineraryId');
    const targetVersion = Number(input.version);
    const itinerary = await loadItinerary(itineraryId);
    const snapshot = await repository.getVersion(itineraryId, targetVersion);
    if (!snapshot) throw versionNotFoundError(input.version);

    itinerary.days = clone(snapshot.days);
    itinerary.title = snapshot.title;
    itinerary.status = snapshot.status;
    if (snapshot.status !== ITINERARY_STATUS.PUBLISHED) itinerary.publishedAt = null;
    return commit(itinerary, {
      action: ITINERARY_AUDIT_ACTIONS.ITINERARY_REVERTED,
      details: { revertedTo: targetVersion },
      label: `reverted-from-v${targetVersion}`,
      reopen: false,
    });
  }

  async function getVersionHistory(itineraryId) {
    await loadItinerary(itineraryId);
    return repository.listVersions(itineraryId);
  }

  async function getVersion(itineraryId, version) {
    const snapshot = await repository.getVersion(itineraryId, Number(version));
    if (!snapshot) throw versionNotFoundError(version);
    return snapshot;
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    createItineraryFromTripPlan,
    createBlankItinerary,
    getItinerary,
    listItinerariesForTrip,
    listItinerariesForOwner,
    addBlock,
    addRainAlternative,
    updateBlock,
    setBlockNotes,
    removeBlock,
    moveBlock,
    publishItinerary,
    revertToVersion,
    getVersionHistory,
    getVersion,
    getAuditEvents,
  };
}
