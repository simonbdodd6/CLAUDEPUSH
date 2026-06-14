import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTripPlatform } from '../lib/trip-platform/index.js';
import { createItineraryPlatform } from '../lib/itinerary-platform/index.js';
import { createTravelTimelinePlatform } from '../lib/travel-timeline-platform/index.js';
import { createTravelRelationshipGraph } from '../lib/travel-relationship-graph/index.js';

const traveller = { id: 'idn_traveller_1', type: 'TRAVELLER' };

function validTrip(overrides = {}) {
  return {
    ownerIdentityId: traveller.id,
    tripName: 'Bali June',
    country: 'Indonesia',
    destination: 'Bali',
    area: 'Canggu',
    startDate: '2026-06-20',
    endDate: '2026-07-02',
    ...overrides,
  };
}

// Wire the real Timeline + Relationship Graph as injected publisher ports.
function wiredTripPlatform() {
  const timelinePublisher = createTravelTimelinePlatform();
  const relationshipPublisher = createTravelRelationshipGraph();
  const platform = createTripPlatform({ timelinePublisher, relationshipPublisher });
  return { platform, timelinePublisher, relationshipPublisher };
}

function wiredItineraryPlatform() {
  const timelinePublisher = createTravelTimelinePlatform();
  const relationshipPublisher = createTravelRelationshipGraph();
  const platform = createItineraryPlatform({ timelinePublisher, relationshipPublisher });
  return { platform, timelinePublisher, relationshipPublisher };
}

function tripPlan() {
  const activity = (slot, id) => ({
    slot, recommendationId: `rec_${id}`, type: 'activity', itemId: id, title: `${id} activity`,
    score: 80, confidence: 0.8, explanation: 'fit', sourceFactors: [],
  });
  return {
    tripPlanId: 'tripplan_1', tripId: 'trip_1', travellerIdentityId: traveller.id,
    destinationFocus: { name: 'Canggu' },
    dailyPlans: [{
      day: 1, date: '2026-06-20', destinationFocus: 'Canggu',
      morningSuggestion: activity('morning', 'act_surf'),
      afternoonSuggestion: activity('afternoon', 'act_food'),
      eveningSuggestion: activity('evening', 'act_yoga'),
      backupRainyDayOption: { slot: 'rainy_day_backup', recommendationId: null, type: null, itemId: null, title: 'none', score: 0, confidence: 0, explanation: 'none', sourceFactors: [] },
    }],
  };
}

// ---------------------------------------------------------------------------
// Trip Platform publishing
// ---------------------------------------------------------------------------

test('trip create/update/complete/cancel publish timeline events', async () => {
  const { platform, timelinePublisher } = wiredTripPlatform();
  const created = await platform.createTrip(validTrip({ status: 'planned' }), traveller);
  await platform.updateTrip(created.tripId, { tripName: 'Bali & Lombok' }, traveller);
  await platform.startTrip(created.tripId, traveller);
  await platform.completeTrip(created.tripId, traveller);

  const events = await timelinePublisher.listByTraveller(traveller.id);
  const names = events.map(e => e.metadata.eventName).sort();
  assert.ok(names.includes('trip_created'));
  assert.ok(names.includes('trip_updated'));
  assert.ok(names.includes('trip_completed'));
  // Reference only — sourceEntityId is the trip id, no trip business data leaked.
  assert.ok(events.every(e => e.sourceEntityId === created.tripId));
  assert.ok(events.every(e => e.sourcePlatform === 'trip-platform'));

  const { platform: p2, timelinePublisher: t2 } = wiredTripPlatform();
  const c2 = await p2.createTrip(validTrip(), traveller);
  await p2.cancelTrip(c2.tripId, traveller, 'weather');
  assert.ok((await t2.listByTraveller(traveller.id)).some(e => e.metadata.eventName === 'trip_cancelled'));
});

test('trip create publishes graph edges (OWNS, VISITS)', async () => {
  const { platform, relationshipPublisher } = wiredTripPlatform();
  const trip = await platform.createTrip(validTrip(), traveller);

  const owns = await relationshipPublisher.queryNeighbours({ type: 'traveller', id: traveller.id }, { relationshipType: 'owns' });
  assert.deepEqual(owns.map(n => n.entity.id), [trip.tripId]);

  const visits = await relationshipPublisher.queryNeighbours({ type: 'trip', id: trip.tripId }, { relationshipType: 'visited' });
  assert.deepEqual(visits.map(n => n.entity), [{ type: 'destination', id: 'bali' }]);
});

test('trip publishing does not duplicate business data on the edges', async () => {
  const { platform, relationshipPublisher } = wiredTripPlatform();
  const trip = await platform.createTrip(validTrip(), traveller);
  const edge = (await relationshipPublisher.queryByRelationshipType('owns'))[0];
  // Edge holds references + minimal metadata only — no tripName/country/dates.
  for (const banned of ['tripName', 'country', 'startDate', 'endDate', 'area']) {
    assert.ok(!JSON.stringify(edge).includes(banned), `edge must not carry ${banned}`);
  }
  assert.equal(edge.toId, trip.tripId);
});

// ---------------------------------------------------------------------------
// Itinerary Platform publishing
// ---------------------------------------------------------------------------

test('itinerary create publishes timeline + graph (CONTAINS, PLANNED, LOCATED)', async () => {
  const { platform, timelinePublisher, relationshipPublisher } = wiredItineraryPlatform();
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });

  const events = await timelinePublisher.listByTraveller(traveller.id);
  assert.ok(events.some(e => e.metadata.eventName === 'itinerary_created'));

  // Trip CONTAINS Itinerary
  const contains = await relationshipPublisher.queryNeighbours({ type: 'trip', id: 'trip_1' }, { direction: 'out' });
  assert.ok(contains.some(n => n.entity.id === itinerary.itineraryId));
  // Traveller PLANNED Activity
  const planned = await relationshipPublisher.queryNeighbours({ type: 'traveller', id: traveller.id }, { relationshipType: 'planned' });
  assert.ok(planned.length >= 1);
  // Activity LOCATED_AT Destination (canggu)
  const located = await relationshipPublisher.queryByRelationshipType('located_in');
  assert.ok(located.some(e => e.toId === 'canggu'));
});

test('itinerary activity add/remove publish specific timeline events', async () => {
  const { platform, timelinePublisher } = wiredItineraryPlatform();
  const itinerary = await platform.createItineraryFromTripPlan({ tripPlan: tripPlan() });

  const block = await platform.addBlock({
    itineraryId: itinerary.itineraryId, day: 1, section: 'afternoon',
    block: { type: 'activity', title: 'Extra surf', details: { itemId: 'act_extra' } },
  });
  await platform.removeBlock({ itineraryId: itinerary.itineraryId, blockId: block.blockId });

  const names = (await timelinePublisher.listByTraveller(traveller.id)).map(e => e.metadata.eventName);
  assert.ok(names.includes('activity_added'));
  assert.ok(names.includes('activity_removed'));
});

// ---------------------------------------------------------------------------
// Cross-cutting guarantees
// ---------------------------------------------------------------------------

test('no publishers = unchanged legacy behaviour (no events, no edges)', async () => {
  const timeline = createTravelTimelinePlatform();
  const graph = createTravelRelationshipGraph();
  const platform = createTripPlatform(); // no publishers injected
  const trip = await platform.createTrip(validTrip(), traveller);
  assert.ok(trip.tripId);
  assert.equal((await timeline.listByTraveller(traveller.id)).length, 0);
  assert.equal((await graph.queryNeighbours({ type: 'traveller', id: traveller.id })).length, 0);
});

test('publisher failures are isolated — the business op still succeeds', async () => {
  const explodingTimeline = { appendEvent() { throw new Error('timeline down'); } };
  const explodingGraph = { createRelationship() { throw new Error('graph down'); } };
  const platform = createTripPlatform({ timelinePublisher: explodingTimeline, relationshipPublisher: explodingGraph });

  const trip = await platform.createTrip(validTrip({ status: 'planned' }), traveller); // must not throw
  assert.ok(trip.tripId);
  await platform.startTrip(trip.tripId, traveller); // active
  const completed = await platform.completeTrip(trip.tripId, traveller); // must not throw despite publisher failures
  assert.equal(completed.status, 'completed');
});

test('deterministic idempotency keys; re-publish creates no duplicate events', async () => {
  const { platform, timelinePublisher } = wiredTripPlatform();
  const trip = await platform.createTrip(validTrip(), traveller);
  const createdEvent = (await timelinePublisher.listByTraveller(traveller.id)).find(e => e.metadata.eventName === 'trip_created');

  // Re-publish the identical trip_created via the same idempotency key -> duplicate rejected, swallowed.
  await assert.rejects(() => timelinePublisher.appendEvent({
    travellerIdentityId: traveller.id, tripId: trip.tripId, eventType: 'trip_created',
    sourcePlatform: 'trip-platform', sourceEntityId: trip.tripId, timestamp: trip.createdAt,
    metadata: { eventName: 'trip_created' }, idempotencyKey: `trip-platform:trip_created:${trip.tripId}`,
  }), err => err.code === 'DUPLICATE_TIMELINE_EVENT');

  const createdCount = (await timelinePublisher.listByTraveller(traveller.id)).filter(e => e.metadata.eventName === 'trip_created').length;
  assert.equal(createdCount, 1);
  assert.ok(createdEvent);
});

test('re-publishing an edge creates no duplicate (graph dedup, swallowed)', async () => {
  const { relationshipPublisher } = wiredTripPlatform();
  await relationshipPublisher.createRelationship({ from: { type: 'traveller', id: 'idn_z' }, to: { type: 'trip', id: 'trip_z' }, relationshipType: 'owns' });
  await assert.rejects(
    () => relationshipPublisher.createRelationship({ from: { type: 'traveller', id: 'idn_z' }, to: { type: 'trip', id: 'trip_z' }, relationshipType: 'owns' }),
    err => err.code === 'DUPLICATE_RELATIONSHIP',
  );
  const owns = await relationshipPublisher.queryByRelationshipType('owns');
  assert.equal(owns.length, 1);
});

test('trip and itinerary source import no Timeline or Relationship Graph directly', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  for (const mod of ['trip-platform', 'itinerary-platform']) {
    const src = readFileSync(join(dir, '..', 'lib', mod, 'service.js'), 'utf8');
    assert.ok(!/from\s+['"][^'"]*travel-timeline-platform/.test(src), `${mod} must not import timeline directly`);
    assert.ok(!/from\s+['"][^'"]*travel-relationship-graph/.test(src), `${mod} must not import relationship graph directly`);
  }
});

test('rejects a misconfigured publisher port', () => {
  assert.throws(() => createTripPlatform({ timelinePublisher: {} }), /timelinePublisher must expose appendEvent/);
  assert.throws(() => createTripPlatform({ relationshipPublisher: {} }), /relationshipPublisher must expose createRelationship/);
  assert.throws(() => createItineraryPlatform({ timelinePublisher: {} }), /timelinePublisher must expose appendEvent/);
});
