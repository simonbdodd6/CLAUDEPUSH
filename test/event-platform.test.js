import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_CATEGORY,
  EVENT_SCHEMA_VERSION,
  createEventPlatform,
} from '../lib/event-platform/index.js';

function event(overrides = {}) {
  return {
    eventCategory: EVENT_CATEGORY.TRAVEL,
    eventType: 'trip_created',
    sourcePlatform: 'travel',
    sourceModule: 'trip-platform',
    sourceEntityType: 'trip',
    sourceEntityId: 'trip_1',
    actorIdentityId: 'idn_traveller_1',
    timestamp: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

test('appends a canonical event with schema version, sequence, and audit', async () => {
  const platform = createEventPlatform();
  const ev = await platform.appendEvent(event());

  assert.ok(ev.eventId.startsWith('evt_'));
  assert.equal(ev.schemaVersion, EVENT_SCHEMA_VERSION);
  assert.equal(ev.eventCategory, 'travel');
  assert.equal(ev.eventType, 'trip_created');
  assert.equal(ev.sourcePlatform, 'travel');
  assert.equal(ev.sourceEntityId, 'trip_1');
  assert.equal(ev.actorIdentityId, 'idn_traveller_1');
  assert.equal(ev.organisationId, null);
  assert.equal(ev.sequence, 1);
  assert.deepEqual(ev.references, []);
  assert.deepEqual(ev.metadata, {});
  assert.ok(ev.audit.recordedAt);
});

test('is append-only and immutable — no update/delete on repository; returned clones are detached', async () => {
  const platform = createEventPlatform();
  const ev = await platform.appendEvent(event({ eventId: 'evt_x' }));
  assert.equal(typeof platform.repository.update, 'undefined');
  assert.equal(typeof platform.repository.delete, 'undefined');

  ev.eventType = 'mutated';
  ev.metadata.injected = true;
  const stored = await platform.getEvent('evt_x');
  assert.equal(stored.eventType, 'trip_created'); // store unaffected by mutating the returned clone
  assert.deepEqual(stored.metadata, {});
});

test('assigns a deterministic monotonic sequence (total order) regardless of timestamp', async () => {
  const platform = createEventPlatform();
  await platform.appendEvent(event({ eventId: 'a', timestamp: '2026-07-03T00:00:00.000Z' }));
  await platform.appendEvent(event({ eventId: 'b', timestamp: '2026-07-01T00:00:00.000Z' }));
  await platform.appendEvent(event({ eventId: 'c', timestamp: '2026-07-02T00:00:00.000Z' }));

  const all = await platform.queryEvents();
  assert.deepEqual(all.map(e => e.eventId), ['a', 'b', 'c']); // append order, not timestamp order
  assert.deepEqual(all.map(e => e.sequence), [1, 2, 3]);
  const desc = await platform.queryEvents({ order: 'desc' });
  assert.deepEqual(desc.map(e => e.eventId), ['c', 'b', 'a']);
});

test('prevents duplicate event ids', async () => {
  const platform = createEventPlatform();
  await platform.appendEvent(event({ eventId: 'evt_dup' }));
  await assert.rejects(() => platform.appendEvent(event({ eventId: 'evt_dup' })), err => err.code === 'DUPLICATE_EVENT');
});

test('queries by category, type, platform, module and time range', async () => {
  const platform = createEventPlatform();
  await platform.appendEvent(event({ eventId: '1', eventCategory: EVENT_CATEGORY.TRAVEL, eventType: 'trip_created', timestamp: '2026-07-01T00:00:00.000Z' }));
  await platform.appendEvent(event({ eventId: '2', eventCategory: EVENT_CATEGORY.MEMORY, eventType: 'memory_created', sourceModule: 'travel-memory-platform', timestamp: '2026-07-05T00:00:00.000Z' }));
  await platform.appendEvent(event({ eventId: '3', eventCategory: EVENT_CATEGORY.APPROVAL, sourcePlatform: 'coachs-eye', timestamp: '2026-07-09T00:00:00.000Z' }));

  assert.deepEqual((await platform.queryByCategory(EVENT_CATEGORY.MEMORY)).map(e => e.eventId), ['2']);
  assert.deepEqual((await platform.queryByPlatform('coachs-eye')).map(e => e.eventId), ['3']);
  assert.deepEqual((await platform.queryEvents({ sourceModule: 'travel-memory-platform' })).map(e => e.eventId), ['2']);
  assert.deepEqual((await platform.queryEvents({ from: '2026-07-04T00:00:00.000Z', to: '2026-07-06T00:00:00.000Z' })).map(e => e.eventId), ['2']);
  assert.deepEqual((await platform.queryEvents({ sinceSequence: 2 })).map(e => e.eventId), ['3']);
});

test('queries by entity — as source entity OR as a reference', async () => {
  const platform = createEventPlatform();
  await platform.appendEvent(event({ eventId: 'subj', sourceEntityType: 'trip', sourceEntityId: 'trip_9' }));
  await platform.appendEvent(event({ eventId: 'ref', sourceEntityType: 'itinerary', sourceEntityId: 'itin_1', references: [{ type: 'trip', id: 'trip_9' }] }));
  await platform.appendEvent(event({ eventId: 'other', sourceEntityType: 'trip', sourceEntityId: 'trip_other' }));

  const history = await platform.queryByEntity({ type: 'trip', id: 'trip_9' });
  assert.deepEqual(history.map(e => e.eventId), ['subj', 'ref']);
});

test('queries by actor', async () => {
  const platform = createEventPlatform();
  await platform.appendEvent(event({ eventId: '1', actorIdentityId: 'idn_a' }));
  await platform.appendEvent(event({ eventId: '2', actorIdentityId: 'idn_b' }));
  assert.deepEqual((await platform.queryByActor('idn_a')).map(e => e.eventId), ['1']);
});

test('validates references and strips non-reference keys', async () => {
  const platform = createEventPlatform();
  await assert.rejects(() => platform.appendEvent(event({ references: [{ type: 'trip' }] })), /references\[0\].id is required/);
  await assert.rejects(() => platform.appendEvent(event({ references: 'nope' })), /references must be an array/);

  const ev = await platform.appendEvent(event({ references: [{ type: 'Trip', id: 'trip_1', tripName: 'leak', secret: 'x' }] }));
  assert.deepEqual(ev.references, [{ type: 'trip', id: 'trip_1' }]); // only {type,id}, business data dropped
});

test('forbids exact-location fields anywhere in the event', async () => {
  const platform = createEventPlatform();
  await assert.rejects(() => platform.appendEvent(event({ latitude: -8.65 })), /must not include exact location/);
  await assert.rejects(() => platform.appendEvent(event({ metadata: { nested: { gps: '1,2' } } })), /must not include exact location/);
});

test('validates required fields and category', async () => {
  const platform = createEventPlatform();
  await assert.rejects(() => platform.appendEvent(event({ eventType: '' })), /eventType is required/);
  await assert.rejects(() => platform.appendEvent(event({ sourcePlatform: '' })), /sourcePlatform is required/);
  await assert.rejects(() => platform.appendEvent(event({ sourceEntityId: '' })), /sourceEntityId is required/);
  await assert.rejects(() => platform.appendEvent(event({ eventCategory: 'galactic' })), /eventCategory must be one of/);
  await assert.rejects(() => platform.appendEvent(event({ timestamp: 'whenever' })), /must be a valid ISO timestamp/);
  await assert.rejects(() => platform.getEvent('missing'), /Event not found/);
});

test('append-only history grows and earlier events never change', async () => {
  const platform = createEventPlatform();
  const first = await platform.appendEvent(event({ eventId: '1' }));
  const snapshotFirst = JSON.stringify(first);
  await platform.appendEvent(event({ eventId: '2' }));
  await platform.appendEvent(event({ eventId: '3' }));

  const all = await platform.queryEvents();
  assert.equal(all.length, 3);
  assert.equal(JSON.stringify(all[0]), snapshotFirst); // unchanged
  assert.deepEqual(all.map(e => e.sequence), [1, 2, 3]);
});

test('produces deterministic output for identical inputs (ids + timestamps + recordedAt)', async () => {
  async function run() {
    const platform = createEventPlatform();
    await platform.appendEvent(event({ eventId: 'a', timestamp: '2026-07-01T00:00:00.000Z', recordedAt: '2026-07-01T00:00:00.000Z' }));
    await platform.appendEvent(event({ eventId: 'b', timestamp: '2026-07-02T00:00:00.000Z', recordedAt: '2026-07-02T00:00:00.000Z', references: [{ type: 'trip', id: 'trip_1' }] }));
    return platform.queryEvents();
  }
  assert.deepEqual(await run(), await run());
});

test('supports corrections as new events referencing the original', async () => {
  const platform = createEventPlatform();
  const original = await platform.appendEvent(event({ eventId: 'orig', eventType: 'trip_created' }));
  const correction = await platform.appendEvent(event({
    eventId: 'corr', eventType: 'trip_created_corrected', references: [{ type: 'event', id: original.eventId }],
  }));
  // The correction references the original; the original is untouched and still present.
  assert.deepEqual(correction.references, [{ type: 'event', id: 'orig' }]);
  const lineage = await platform.queryByEntity({ type: 'event', id: 'orig' });
  assert.deepEqual(lineage.map(e => e.eventId), ['corr']); // 'orig' references nothing back; correction points to it
  assert.equal((await platform.getEvent('orig')).eventType, 'trip_created');
});
