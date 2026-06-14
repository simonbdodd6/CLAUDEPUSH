import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_PLATFORM,
  TIMELINE_AUDIT_ACTIONS,
  TIMELINE_EVENT_STATUS,
  TIMELINE_EVENT_TYPE,
  TIMELINE_IMPORTANCE,
  TIMELINE_VISIBILITY,
  createTravelTimelinePlatform,
} from '../lib/travel-timeline-platform/index.js';

const TRAVELLER = 'idn_traveller_1';

function event(overrides = {}) {
  return {
    travellerIdentityId: TRAVELLER,
    tripId: 'trip_bali_1',
    eventType: TIMELINE_EVENT_TYPE.TRIP_CREATED,
    sourcePlatform: SOURCE_PLATFORM.TRIP,
    sourceEntityId: 'trip_bali_1',
    timestamp: '2026-07-01T09:00:00.000Z',
    ...overrides,
  };
}

test('appends an immutable reference-only event with safe defaults', async () => {
  const platform = createTravelTimelinePlatform();
  const ev = await platform.appendEvent(event());

  assert.ok(ev.timelineEventId.startsWith('tev_'));
  assert.equal(ev.travellerIdentityId, TRAVELLER);
  assert.equal(ev.tripId, 'trip_bali_1');
  assert.equal(ev.eventType, TIMELINE_EVENT_TYPE.TRIP_CREATED);
  assert.equal(ev.sourcePlatform, SOURCE_PLATFORM.TRIP);
  assert.equal(ev.sourceEntityId, 'trip_bali_1'); // reference only
  assert.equal(ev.importance, TIMELINE_IMPORTANCE.NORMAL);
  assert.equal(ev.visibility, TIMELINE_VISIBILITY.PRIVATE);
  assert.equal(ev.status, TIMELINE_EVENT_STATUS.ACTIVE);
  assert.equal(ev.confidence, null);
  assert.deepEqual(ev.metadata, {});
  assert.equal(ev.deterministic, true);
  assert.equal(ev.aiUsed, false);
});

test('orders events chronologically regardless of insertion order', async () => {
  const platform = createTravelTimelinePlatform();
  await platform.appendEvent(event({ eventType: TIMELINE_EVENT_TYPE.ACTIVITY, sourceEntityId: 'a3', timestamp: '2026-07-03T09:00:00.000Z' }));
  await platform.appendEvent(event({ eventType: TIMELINE_EVENT_TYPE.ACTIVITY, sourceEntityId: 'a1', timestamp: '2026-07-01T09:00:00.000Z' }));
  await platform.appendEvent(event({ eventType: TIMELINE_EVENT_TYPE.ACTIVITY, sourceEntityId: 'a2', timestamp: '2026-07-02T09:00:00.000Z' }));

  const asc = await platform.listByTraveller(TRAVELLER);
  assert.deepEqual(asc.map(e => e.sourceEntityId), ['a1', 'a2', 'a3']);

  const desc = await platform.listByTraveller(TRAVELLER, { order: 'desc' });
  assert.deepEqual(desc.map(e => e.sourceEntityId), ['a3', 'a2', 'a1']);
});

test('the repository exposes no way to mutate a stored event (immutability)', async () => {
  const platform = createTravelTimelinePlatform();
  await platform.appendEvent(event());
  assert.equal(typeof platform.repository.update, 'undefined');
  assert.equal(typeof platform.repository.delete, 'undefined');
});

test('prevents duplicates via idempotencyKey but allows repeatable events', async () => {
  const platform = createTravelTimelinePlatform();
  await platform.appendEvent(event({ idempotencyKey: 'trip-platform:trip_bali_1:created' }));
  await assert.rejects(
    () => platform.appendEvent(event({ idempotencyKey: 'trip-platform:trip_bali_1:created' })),
    err => err.code === 'DUPLICATE_TIMELINE_EVENT',
  );

  // No key => repeatable events (trip_updated twice) are both accepted.
  await platform.appendEvent(event({ eventType: TIMELINE_EVENT_TYPE.TRIP_UPDATED, sourceEntityId: 'trip_bali_1' }));
  await platform.appendEvent(event({ eventType: TIMELINE_EVENT_TYPE.TRIP_UPDATED, sourceEntityId: 'trip_bali_1' }));
  const updates = await platform.listByEventType(TIMELINE_EVENT_TYPE.TRIP_UPDATED);
  assert.equal(updates.length, 2);
});

test('filters by trip, source platform, event type, and date range', async () => {
  const platform = createTravelTimelinePlatform();
  await platform.appendEvent(event({ eventType: TIMELINE_EVENT_TYPE.TRIP_CREATED, sourceEntityId: 'trip_bali_1', timestamp: '2026-07-01T09:00:00.000Z' }));
  await platform.appendEvent(event({ eventType: TIMELINE_EVENT_TYPE.MEMORY_CREATED, sourcePlatform: SOURCE_PLATFORM.TRAVEL_MEMORY, sourceEntityId: 'mem_1', timestamp: '2026-07-05T09:00:00.000Z' }));
  await platform.appendEvent(event({ tripId: 'trip_other', eventType: TIMELINE_EVENT_TYPE.FLIGHT, sourceEntityId: 'fl_1', timestamp: '2026-07-09T09:00:00.000Z' }));

  assert.equal((await platform.listByTrip('trip_bali_1')).length, 2);
  assert.equal((await platform.listBySourcePlatform(SOURCE_PLATFORM.TRAVEL_MEMORY)).length, 1);
  assert.equal((await platform.listByEventType(TIMELINE_EVENT_TYPE.FLIGHT)).length, 1);

  const inRange = await platform.listByDateRange('2026-07-02T00:00:00.000Z', '2026-07-06T00:00:00.000Z');
  assert.deepEqual(inRange.map(e => e.sourceEntityId), ['mem_1']);
});

test('groups by day and by trip deterministically', async () => {
  const platform = createTravelTimelinePlatform();
  await platform.appendEvent(event({ sourceEntityId: 'a', timestamp: '2026-07-01T09:00:00.000Z' }));
  await platform.appendEvent(event({ eventType: TIMELINE_EVENT_TYPE.ACTIVITY, sourceEntityId: 'b', timestamp: '2026-07-01T18:00:00.000Z' }));
  await platform.appendEvent(event({ tripId: 'trip_other', eventType: TIMELINE_EVENT_TYPE.ACTIVITY, sourceEntityId: 'c', timestamp: '2026-07-02T09:00:00.000Z' }));
  await platform.appendEvent(event({ tripId: null, eventType: TIMELINE_EVENT_TYPE.NOTIFICATION ?? 'notification', sourceEntityId: 'd', timestamp: '2026-07-03T09:00:00.000Z' }));

  const byDay = await platform.groupByDay({ travellerIdentityId: TRAVELLER });
  assert.deepEqual(byDay.map(g => g.day), ['2026-07-01', '2026-07-02', '2026-07-03']);
  assert.equal(byDay[0].events.length, 2);

  const byTrip = await platform.groupByTrip({ travellerIdentityId: TRAVELLER });
  assert.deepEqual(byTrip.map(g => g.tripId), ['trip_bali_1', 'trip_other', null]); // null bucket last
});

test('corrections append a new event and never mutate the original', async () => {
  const platform = createTravelTimelinePlatform();
  const original = await platform.appendEvent(event({ importance: TIMELINE_IMPORTANCE.NORMAL }));

  const corrected = await platform.correctEvent({
    timelineEventId: original.timelineEventId,
    changes: { importance: TIMELINE_IMPORTANCE.HIGH, metadata: { note: 'reclassified' } },
    reason: 'wrong importance',
  });
  assert.notEqual(corrected.timelineEventId, original.timelineEventId);
  assert.equal(corrected.correctsEventId, original.timelineEventId);
  assert.equal(corrected.importance, TIMELINE_IMPORTANCE.HIGH);

  // Original is untouched in storage.
  const storedOriginal = await platform.getEvent(original.timelineEventId);
  assert.equal(storedOriginal.importance, TIMELINE_IMPORTANCE.NORMAL);

  // Effective view hides the superseded original, shows the correction.
  const effective = await platform.listByTraveller(TRAVELLER);
  assert.equal(effective.length, 1);
  assert.equal(effective[0].timelineEventId, corrected.timelineEventId);

  // Full history includes both; the original is flagged superseded.
  const full = await platform.listByTraveller(TRAVELLER, { includeSuperseded: true });
  assert.equal(full.length, 2);
  const orig = full.find(e => e.timelineEventId === original.timelineEventId);
  assert.equal(orig.superseded, true);
  assert.equal(orig.effectiveStatus, TIMELINE_EVENT_STATUS.SUPERSEDED);
});

test('correction cannot change identity fields', async () => {
  const platform = createTravelTimelinePlatform();
  const original = await platform.appendEvent(event());
  await assert.rejects(
    () => platform.correctEvent({ timelineEventId: original.timelineEventId, changes: { sourceEntityId: 'hijack' } }),
    err => err.code === 'VALIDATION_FAILED' && err.details.fields.includes('sourceEntityId'),
  );
});

test('redaction clears content but keeps the chronological slot', async () => {
  const platform = createTravelTimelinePlatform();
  const original = await platform.appendEvent(event({ metadata: { caption: 'secret' }, eventType: TIMELINE_EVENT_TYPE.PHOTO_IMPORTED, sourceEntityId: 'photo_1' }));

  const redaction = await platform.redactEvent({ timelineEventId: original.timelineEventId, reason: 'gdpr' });
  assert.equal(redaction.status, TIMELINE_EVENT_STATUS.REDACTED);
  assert.deepEqual(redaction.metadata, {});

  const effective = await platform.listByTraveller(TRAVELLER);
  assert.equal(effective.length, 1);
  assert.equal(effective[0].status, TIMELINE_EVENT_STATUS.REDACTED);

  const withoutRedacted = await platform.listByTraveller(TRAVELLER, { includeRedacted: false });
  assert.equal(withoutRedacted.length, 0);
});

test('writes an immutable audit trail for append, correct, and redact', async () => {
  const platform = createTravelTimelinePlatform();
  const ev = await platform.appendEvent(event());
  await platform.correctEvent({ timelineEventId: ev.timelineEventId, changes: { importance: TIMELINE_IMPORTANCE.HIGH } });

  const ev2 = await platform.appendEvent(event({ eventType: TIMELINE_EVENT_TYPE.PHOTO_IMPORTED, sourceEntityId: 'photo_9' }));
  await platform.redactEvent({ timelineEventId: ev2.timelineEventId });

  const audit = await platform.getAuditEvents({ travellerIdentityId: TRAVELLER });
  const actions = audit.map(a => a.action);
  assert.ok(actions.includes(TIMELINE_AUDIT_ACTIONS.EVENT_APPENDED));
  assert.ok(actions.includes(TIMELINE_AUDIT_ACTIONS.EVENT_CORRECTED));
  assert.ok(actions.includes(TIMELINE_AUDIT_ACTIONS.EVENT_REDACTED));
});

test('rejects exact location, unknown event type, and missing fields', async () => {
  const platform = createTravelTimelinePlatform();

  await assert.rejects(() => platform.appendEvent(event({ latitude: -8.65 })), /must not include exact traveller location/);
  await assert.rejects(() => platform.appendEvent(event({ metadata: { gps: '1,2' } })), /must not include exact traveller location/);
  await assert.rejects(() => platform.appendEvent(event({ eventType: 'teleport' })), /eventType must be one of/);
  await assert.rejects(() => platform.appendEvent(event({ sourcePlatform: '' })), /sourcePlatform is required/);
  await assert.rejects(() => platform.appendEvent(event({ sourceEntityId: '' })), /sourceEntityId is required/);
  await assert.rejects(() => platform.appendEvent(event({ timestamp: 'whenever' })), /timestamp must be a valid date/);
  await assert.rejects(() => platform.appendEvent(event({ confidence: 2 })), /confidence must be a number/);
  await assert.rejects(() => platform.getEvent('missing'), /Timeline event not found/);
});

test('produces deterministic output for the same inputs', async () => {
  async function build() {
    const platform = createTravelTimelinePlatform();
    await platform.appendEvent(event({ sourceEntityId: 'x', timestamp: '2026-07-02T00:00:00.000Z' }));
    await platform.appendEvent(event({ eventType: TIMELINE_EVENT_TYPE.ACTIVITY, sourceEntityId: 'y', timestamp: '2026-07-01T00:00:00.000Z' }));
    const rows = await platform.listByTraveller(TRAVELLER);
    // Strip non-deterministic ids/timestamps generated at append time.
    return rows.map(({ sourceEntityId, eventType, timestamp }) => ({ sourceEntityId, eventType, timestamp }));
  }
  assert.deepEqual(await build(), await build());
});
