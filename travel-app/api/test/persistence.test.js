import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { FileTripRepository, FileEventRepository, FileTimelineRepository } from '../persistence/durable-repositories.js';
import { createTripPlatform } from '../../../lib/trip-platform/index.js';
import { createEventPlatform, EVENT_CATEGORY } from '../../../lib/event-platform/index.js';
import { createTravelTimelinePlatform, SOURCE_PLATFORM, TIMELINE_EVENT_TYPE } from '../../../lib/travel-timeline-platform/index.js';

function freshDir() {
  return mkdtempSync(join(tmpdir(), 'travel-store-'));
}

// ---------------------------------------------------------------------------
// FileStore
// ---------------------------------------------------------------------------
test('FileStore persists durably and atomically across a fresh instance', () => {
  const dir = freshDir();
  const a = new FileStore(dir);
  a.write('things', [{ id: 1 }, { id: 2 }]);

  const b = new FileStore(dir); // fresh process simulation (cold cache)
  assert.deepEqual(b.read('things'), [{ id: 1 }, { id: 2 }]);
  // returned copies are detached
  const read = b.read('things');
  read[0].id = 99;
  assert.equal(b.read('things')[0].id, 1);
  // unknown collection => empty
  assert.deepEqual(b.read('missing'), []);
});

// ---------------------------------------------------------------------------
// trip-platform on the durable repo (CRUD + audit + reload)
// ---------------------------------------------------------------------------
test('trip-platform works on FileTripRepository and survives a reload', async () => {
  const dir = freshDir();
  const traveller = { id: 'idn_1', type: 'TRAVELLER' };
  const trip = {
    ownerIdentityId: 'idn_1', tripName: 'Bali July', country: 'Indonesia',
    destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25',
  };

  // session 1: create + update via the REAL frozen platform
  const p1 = createTripPlatform({ repository: new FileTripRepository(new FileStore(dir)) });
  const created = await p1.createTrip(trip, traveller);
  await p1.updateTrip(created.tripId, { tripName: 'Bali & Lombok' }, traveller);

  // session 2: brand-new platform + repo from the SAME dir → state persisted
  const p2 = createTripPlatform({ repository: new FileTripRepository(new FileStore(dir)) });
  const reloaded = await p2.getTripById(created.tripId, traveller);
  assert.equal(reloaded.tripId, created.tripId);
  assert.equal(reloaded.tripName, 'Bali & Lombok'); // update persisted
  const owned = await p2.listTripsForIdentity('idn_1', traveller);
  assert.equal(owned.length, 1);
  // audit persisted too
  const audit = await p2.getAuditEvents({ tripId: created.tripId });
  assert.ok(audit.some(e => e.action) && audit.length >= 2);
});

// ---------------------------------------------------------------------------
// event-platform on the durable repo (append-only + ordering + reload)
// ---------------------------------------------------------------------------
test('event-platform works on FileEventRepository and survives a reload', async () => {
  const dir = freshDir();
  const ev = (id, ts) => ({
    eventId: id, eventCategory: EVENT_CATEGORY.TRAVEL, eventType: 'trip_created',
    sourcePlatform: 'travel', sourceModule: 'trip-platform', sourceEntityType: 'trip',
    sourceEntityId: 'trip_1', timestamp: ts,
  });
  const p1 = createEventPlatform({ repository: new FileEventRepository(new FileStore(dir)) });
  await p1.appendEvent(ev('a', '2026-07-01T00:00:00.000Z'));
  await p1.appendEvent(ev('b', '2026-07-02T00:00:00.000Z'));

  const p2 = createEventPlatform({ repository: new FileEventRepository(new FileStore(dir)) });
  const all = await p2.queryEvents();
  assert.deepEqual(all.map(e => e.eventId), ['a', 'b']); // append order + sequence persisted
  assert.deepEqual(all.map(e => e.sequence), [1, 2]);
  // duplicate id rejected across reload (durable dedupe)
  await assert.rejects(() => p2.appendEvent(ev('a', '2026-07-03T00:00:00.000Z')), err => err.code === 'DUPLICATE_EVENT');
  // next append continues the sequence from persisted size
  const c = await p2.appendEvent(ev('c', '2026-07-04T00:00:00.000Z'));
  assert.equal(c.sequence, 3);
});

// ---------------------------------------------------------------------------
// timeline-platform on the durable repo (append-only + idempotency + reload)
// ---------------------------------------------------------------------------
test('timeline-platform works on FileTimelineRepository and survives a reload', async () => {
  const dir = freshDir();
  const base = {
    travellerIdentityId: 'idn_1', tripId: 'trip_1', eventType: TIMELINE_EVENT_TYPE.TRIP_CREATED,
    sourcePlatform: SOURCE_PLATFORM.TRIP, sourceEntityId: 'trip_1', timestamp: '2026-07-11T00:00:00.000Z',
  };
  const p1 = createTravelTimelinePlatform({ repository: new FileTimelineRepository(new FileStore(dir)) });
  await p1.appendEvent({ ...base, idempotencyKey: 'trip-platform:trip_created:trip_1' });

  const p2 = createTravelTimelinePlatform({ repository: new FileTimelineRepository(new FileStore(dir)) });
  const events = await p2.listByTraveller('idn_1');
  assert.equal(events.length, 1); // persisted
  // idempotency survives reload (no duplicate)
  await assert.rejects(
    () => p2.appendEvent({ ...base, idempotencyKey: 'trip-platform:trip_created:trip_1' }),
    err => err.code === 'DUPLICATE_TIMELINE_EVENT',
  );
  assert.equal((await p2.listByTraveller('idn_1')).length, 1);
});
