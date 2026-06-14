import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityPlatform } from '../lib/identity-platform/index.js';
import {
  IdentityPlatformSourceAdapter,
  createTravellerIdentityPlatform,
} from '../lib/traveller-identity-platform/index.js';
import {
  SOURCE_PLATFORM,
  TIMELINE_EVENT_TYPE,
  TIMELINE_IMPORTANCE,
  createTravelTimelinePlatform,
} from '../lib/travel-timeline-platform/index.js';
import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  createTravelRelationshipGraph,
} from '../lib/travel-relationship-graph/index.js';
import {
  MISSING_SIGNAL,
  RISK_SIGNAL,
  createTravellerDigitalTwinPlatform,
} from '../lib/traveller-digital-twin-platform/index.js';

const BANNED_LOCATION = ['lat', 'lng', 'latitude', 'longitude', 'coordinates', 'liveLocation', 'gps', 'geo'];

function scanForLocation(value) {
  if (Array.isArray(value)) return value.some(scanForLocation);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => BANNED_LOCATION.includes(k) || scanForLocation(v));
  }
  return false;
}

// Compose real M10 + M12 + M13 plus an active traveller with some world state.
async function buildWorld({ verified = false, withData = true } = {}) {
  const identityPlatform = createIdentityPlatform();
  const travellerIdentityPlatform = createTravellerIdentityPlatform({
    identitySource: new IdentityPlatformSourceAdapter({ identityPlatform }),
  });
  const travelTimelinePlatform = createTravelTimelinePlatform();
  const travelRelationshipGraph = createTravelRelationshipGraph();

  const identity = await identityPlatform.createIdentity({
    type: 'PERSON',
    roles: ['TRAVELLER'],
    publicProfile: { displayName: 'Mei', country: 'JP', languages: ['ja'] },
    verification: verified ? { status: 'VERIFIED' } : undefined,
  });
  const id = identity.id;

  if (withData) {
    await travelTimelinePlatform.appendEvent({ travellerIdentityId: id, tripId: 'trip_1', eventType: TIMELINE_EVENT_TYPE.TRIP_CREATED, sourcePlatform: SOURCE_PLATFORM.TRIP, sourceEntityId: 'trip_1', timestamp: '2026-07-01T09:00:00.000Z' });
    await travelTimelinePlatform.appendEvent({ travellerIdentityId: id, tripId: 'trip_1', eventType: TIMELINE_EVENT_TYPE.MEMORY_CREATED, sourcePlatform: SOURCE_PLATFORM.TRAVEL_MEMORY, sourceEntityId: 'mem_1', timestamp: '2026-07-03T09:00:00.000Z', importance: TIMELINE_IMPORTANCE.CRITICAL });

    const traveller = { type: ENTITY_TYPE.TRAVELLER, id };
    await travelRelationshipGraph.createRelationship({ from: traveller, to: { type: ENTITY_TYPE.TRIP, id: 'trip_1' }, relationshipType: RELATIONSHIP_TYPE.PLANNED });
    await travelRelationshipGraph.createRelationship({ from: traveller, to: { type: ENTITY_TYPE.DESTINATION, id: 'canggu' }, relationshipType: RELATIONSHIP_TYPE.VISITED });
    await travelRelationshipGraph.createRelationship({ from: traveller, to: { type: ENTITY_TYPE.TRAVELLER, id: 'idn_friend' }, relationshipType: RELATIONSHIP_TYPE.TRAVELLED_WITH });
    await travelRelationshipGraph.createRelationship({ from: traveller, to: { type: ENTITY_TYPE.MEMORY, id: 'mem_1' }, relationshipType: RELATIONSHIP_TYPE.REMEMBERED });
  }

  return { id, identityPlatform, travellerIdentityPlatform, travelTimelinePlatform, travelRelationshipGraph };
}

function fullTwin(world) {
  return createTravellerDigitalTwinPlatform({
    travellerIdentityPlatform: world.travellerIdentityPlatform,
    travelTimelinePlatform: world.travelTimelinePlatform,
    travelRelationshipGraph: world.travelRelationshipGraph,
  });
}

test('composes a full deterministic traveller twin', async () => {
  const world = await buildWorld();
  const twin = fullTwin(world);
  const view = await twin.getTravellerTwin(world.id);

  assert.equal(view.traveller.travellerId, world.id);
  assert.equal(view.timelineSummary.totalEvents, 2);
  assert.equal(view.relationshipSummary.totalRelationships, 4);
  assert.deepEqual(view.activeTrips, [{ type: 'trip', id: 'trip_1' }]);
  assert.deepEqual(view.destinations, [{ type: 'destination', id: 'canggu' }]);
  assert.deepEqual(view.companions, [{ type: 'traveller', id: 'idn_friend' }]);
  assert.deepEqual(view.memories, [{ type: 'memory', id: 'mem_1' }]);
  assert.equal(view.recentTimelineEvents.length, 2);
  assert.equal(view.recentTimelineEvents[0].timestamp, '2026-07-03T09:00:00.000Z'); // newest first
  assert.equal(view.lastUpdated, '2026-07-03T09:00:00.000Z');
});

test('rejects inactive / non-traveller before building the view', async () => {
  const world = await buildWorld();
  const twin = fullTwin(world);

  await world.identityPlatform.suspendIdentity(world.id, 'policy', { id: 'admin', type: 'ADMINISTRATOR' });
  await assert.rejects(() => twin.getTravellerTwin(world.id), err => err.code === 'IDENTITY_INACTIVE');

  const host = await world.identityPlatform.createIdentity({ type: 'PERSON', roles: ['HOST'], publicProfile: { displayName: 'H' } });
  await assert.rejects(() => twin.getTravellerTwin(host.id), err => err.code === 'NOT_A_TRAVELLER');
  await assert.rejects(() => twin.getTravellerTwin('idn_ghost'), err => err.code === 'TRAVELLER_NOT_FOUND');
});

test('timeline-only and relationship-only views', async () => {
  const world = await buildWorld();
  const twin = fullTwin(world);

  const tl = await twin.getTravellerTimelineView(world.id);
  assert.equal(tl.timelineSummary.totalEvents, 2);
  assert.equal(tl.eventsByDay.length, 2);
  assert.equal(tl.relationshipSummary, undefined); // timeline view has no graph data

  const rel = await twin.getTravellerRelationshipView(world.id);
  assert.equal(rel.relationshipSummary.totalRelationships, 4);
  assert.ok(rel.importantEntities.length >= 1);
  assert.equal(rel.timelineSummary, undefined);
});

test('context summary composes both platforms', async () => {
  const world = await buildWorld();
  const twin = fullTwin(world);
  const summary = await twin.getTravellerContextSummary(world.id);

  assert.equal(summary.traveller.travellerId, world.id);
  assert.equal(summary.timelineSummary.totalEvents, 2);
  assert.equal(summary.relationshipSummary.totalRelationships, 4);
  assert.ok(Array.isArray(summary.riskSignals));
});

test('output is deterministic across repeated calls', async () => {
  const world = await buildWorld();
  const twin = fullTwin(world);
  const a = await twin.getTravellerTwin(world.id);
  const b = await twin.getTravellerTwin(world.id);
  assert.deepEqual(a, b);
});

test('missing platforms fail clearly unless allowPartial', async () => {
  const world = await buildWorld();
  // Twin with identity only.
  const partial = createTravellerDigitalTwinPlatform({ travellerIdentityPlatform: world.travellerIdentityPlatform });

  await assert.rejects(() => partial.getTravellerTwin(world.id), err => err.code === 'CONFIGURATION_ERROR');
  await assert.rejects(() => partial.getTravellerTimelineView(world.id), err => err.code === 'CONFIGURATION_ERROR');
  await assert.rejects(() => partial.getTravellerRelationshipView(world.id), err => err.code === 'CONFIGURATION_ERROR');

  const degraded = await partial.getTravellerTwin(world.id, { allowPartial: true });
  assert.ok(degraded.missingSignals.includes(MISSING_SIGNAL.TIMELINE_PLATFORM_UNAVAILABLE));
  assert.ok(degraded.missingSignals.includes(MISSING_SIGNAL.RELATIONSHIP_GRAPH_UNAVAILABLE));
  assert.equal(degraded.timelineSummary.totalEvents, 0);
  assert.equal(degraded.relationshipSummary.totalRelationships, 0);
});

test('requires a valid identity platform at construction', () => {
  assert.throws(() => createTravellerDigitalTwinPlatform({}), err => err.code === 'CONFIGURATION_ERROR');
  assert.throws(() => createTravellerDigitalTwinPlatform({ travellerIdentityPlatform: {} }), err => err.code === 'CONFIGURATION_ERROR');
});

test('surfaces references only — no business data duplication', async () => {
  const world = await buildWorld();
  const twin = fullTwin(world);
  const view = await twin.getTravellerTwin(world.id);

  for (const ref of [...view.activeTrips, ...view.destinations, ...view.companions, ...view.memories, ...view.recommendations]) {
    assert.deepEqual(Object.keys(ref).sort(), ['id', 'type']); // only references, nothing else
  }
  for (const imp of view.importantEntities) {
    assert.deepEqual(Object.keys(imp.entity).sort(), ['id', 'type']);
  }
});

test('output never contains exact-location fields', async () => {
  const world = await buildWorld();
  const twin = fullTwin(world);
  const view = await twin.getTravellerTwin(world.id);
  assert.equal(scanForLocation(view), false);
});

test('handles an empty traveller state', async () => {
  const world = await buildWorld({ withData: false });
  const twin = fullTwin(world);
  const view = await twin.getTravellerTwin(world.id);

  assert.equal(view.timelineSummary.totalEvents, 0);
  assert.equal(view.relationshipSummary.totalRelationships, 0);
  assert.deepEqual(view.activeTrips, []);
  for (const code of [
    MISSING_SIGNAL.NO_TIMELINE_EVENTS, MISSING_SIGNAL.NO_RELATIONSHIPS, MISSING_SIGNAL.NO_TRIPS,
    MISSING_SIGNAL.NO_COMPANIONS, MISSING_SIGNAL.NO_DESTINATIONS, MISSING_SIGNAL.NO_MEMORIES, MISSING_SIGNAL.NO_RECOMMENDATIONS,
  ]) {
    assert.ok(view.missingSignals.includes(code), `expected missing signal ${code}`);
  }
});

test('computes risk signals from identity and timeline', async () => {
  const unverified = await buildWorld({ verified: false });
  const unverifiedView = await fullTwin(unverified).getTravellerTwin(unverified.id);
  const codes = unverifiedView.riskSignals.map(s => s.code);
  assert.ok(codes.includes(RISK_SIGNAL.IDENTITY_UNVERIFIED));
  assert.ok(codes.includes(RISK_SIGNAL.CRITICAL_TIMELINE_EVENT)); // mem_1 is critical

  const verified = await buildWorld({ verified: true, withData: false });
  const verifiedView = await fullTwin(verified).getTravellerTwin(verified.id);
  assert.ok(!verifiedView.riskSignals.map(s => s.code).includes(RISK_SIGNAL.IDENTITY_UNVERIFIED));
});
