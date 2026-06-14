import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityPlatform } from '../lib/identity-platform/index.js';
import {
  IdentityPlatformSourceAdapter,
  createTravellerIdentityPlatform,
} from '../lib/traveller-identity-platform/index.js';
import { SOURCE_PLATFORM, TIMELINE_EVENT_TYPE, TIMELINE_IMPORTANCE, createTravelTimelinePlatform } from '../lib/travel-timeline-platform/index.js';
import { ENTITY_TYPE as GRAPH_ENTITY, RELATIONSHIP_TYPE as GRAPH_REL, createTravelRelationshipGraph } from '../lib/travel-relationship-graph/index.js';
import { MEMORY_POLARITY, createTravelMemoryPlatform } from '../lib/travel-memory-platform/index.js';
import { createTravellerPreferencesPlatform } from '../lib/traveller-preferences-platform/index.js';
import { DISCOVERY_STATUS, createCompanionDiscoveryPlatform } from '../lib/companion-discovery-platform/index.js';
import { createTravellerDigitalTwinPlatform } from '../lib/traveller-digital-twin-platform/index.js';
import {
  EVIDENCE_SOURCE,
  MISSING_INFORMATION,
  RISK_SIGNAL,
  createTravelIntelligenceContext,
} from '../lib/travel-intelligence-context/index.js';

const BANNED_LOCATION = ['lat', 'lng', 'latitude', 'longitude', 'coordinates', 'liveLocation', 'gps', 'geo'];
function scanForLocation(value) {
  if (Array.isArray(value)) return value.some(scanForLocation);
  if (value && typeof value === 'object') return Object.entries(value).some(([k, v]) => BANNED_LOCATION.includes(k) || scanForLocation(v));
  return false;
}

async function buildFullWorld({ withData = true, verified = false } = {}) {
  const identityPlatform = createIdentityPlatform();
  const travellerIdentityPlatform = createTravellerIdentityPlatform({ identitySource: new IdentityPlatformSourceAdapter({ identityPlatform }) });
  const travelTimelinePlatform = createTravelTimelinePlatform();
  const travelRelationshipGraph = createTravelRelationshipGraph();
  const travelMemoryPlatform = createTravelMemoryPlatform();
  const travellerPreferencesPlatform = createTravellerPreferencesPlatform();
  const companionDiscoveryPlatform = createCompanionDiscoveryPlatform();
  const travellerDigitalTwinPlatform = createTravellerDigitalTwinPlatform({ travellerIdentityPlatform, travelTimelinePlatform, travelRelationshipGraph });

  const identity = await identityPlatform.createIdentity({
    type: 'PERSON', roles: ['TRAVELLER'],
    publicProfile: { displayName: 'Mei', country: 'JP', languages: ['ja'] },
    verification: verified ? { status: 'VERIFIED' } : undefined,
  });
  const id = identity.id;
  const actor = { id, type: 'TRAVELLER' };

  if (withData) {
    await travelTimelinePlatform.appendEvent({ travellerIdentityId: id, tripId: 'trip_1', eventType: TIMELINE_EVENT_TYPE.TRIP_CREATED, sourcePlatform: SOURCE_PLATFORM.TRIP, sourceEntityId: 'trip_1', timestamp: '2026-07-01T09:00:00.000Z' });
    await travelTimelinePlatform.appendEvent({ travellerIdentityId: id, tripId: 'trip_1', eventType: TIMELINE_EVENT_TYPE.MEMORY_CREATED, sourcePlatform: SOURCE_PLATFORM.TRAVEL_MEMORY, sourceEntityId: 'mem_1', timestamp: '2026-07-03T09:00:00.000Z', importance: TIMELINE_IMPORTANCE.CRITICAL });
    await travelTimelinePlatform.appendEvent({ travellerIdentityId: id, tripId: 'trip_1', eventType: 'accommodation', sourcePlatform: 'itinerary-platform', sourceEntityId: 'acc_1', timestamp: '2026-07-02T09:00:00.000Z' });

    const t = { type: GRAPH_ENTITY.TRAVELLER, id };
    await travelRelationshipGraph.createRelationship({ from: t, to: { type: GRAPH_ENTITY.TRIP, id: 'trip_1' }, relationshipType: GRAPH_REL.PLANNED });
    await travelRelationshipGraph.createRelationship({ from: t, to: { type: GRAPH_ENTITY.DESTINATION, id: 'canggu' }, relationshipType: GRAPH_REL.VISITED });
    await travelRelationshipGraph.createRelationship({ from: t, to: { type: GRAPH_ENTITY.ACCOMMODATION, id: 'acc_1' }, relationshipType: GRAPH_REL.BOOKED });
    await travelRelationshipGraph.createRelationship({ from: t, to: { type: GRAPH_ENTITY.TRAVELLER, id: 'idn_friend' }, relationshipType: GRAPH_REL.TRAVELLED_WITH });

    await travelMemoryPlatform.recordExplicitMemory({ travellerIdentityId: id, key: 'cuisine', value: 'spicy', polarity: MEMORY_POLARITY.POSITIVE });
    await travellerPreferencesPlatform.createPreferences({ travellerIdentityId: id, travelStyles: [], budgetLevel: 'mid_range' }, actor);
    const discoProfile = await companionDiscoveryPlatform.createProfile({ travellerIdentityId: id, approximateArea: 'Canggu', statuses: [DISCOVERY_STATUS.LOOKING_FOR_SURFING], optedIn: true });
    void discoProfile;
  }

  return {
    id,
    ports: {
      travellerIdentityPlatform, travellerDigitalTwinPlatform, travelTimelinePlatform,
      travelRelationshipGraph, travelMemoryPlatform, travellerPreferencesPlatform, companionDiscoveryPlatform,
    },
    identityPlatform,
  };
}

test('composes a full deterministic travel intelligence context', async () => {
  const world = await buildFullWorld();
  const engine = createTravelIntelligenceContext(world.ports);
  const ctx = await engine.buildContextSnapshot(world.id);

  assert.equal(ctx.traveller.travellerId, world.id);
  assert.equal(ctx.travelHistory.totalEvents, 3);
  assert.equal(ctx.travelRelationships.totalRelationships, 4);
  assert.equal(ctx.currentTripContext.trip.id, 'trip_1');
  assert.deepEqual(ctx.visitedDestinations, [{ type: 'destination', id: 'canggu' }]);
  assert.deepEqual(ctx.plannedDestinations, [{ type: 'trip', id: 'trip_1' }]);
  assert.deepEqual(ctx.companions.connected, [{ type: 'traveller', id: 'idn_friend' }]);
  assert.equal(ctx.companions.discovery.optedIn, true);
  assert.equal(ctx.travelMemory.length, 1);
  assert.ok(ctx.travelPreferences);
  assert.equal(ctx.schemaVersion, '1.0.0');
  assert.ok(ctx.contextVersion.startsWith('ctxv1:'));
  assert.equal(ctx.generatedAt, ctx.lastUpdated);
});

test('partial composition: identity only, others degrade with evidence', async () => {
  const world = await buildFullWorld();
  const engine = createTravelIntelligenceContext({ travellerIdentityPlatform: world.ports.travellerIdentityPlatform });
  const ctx = await engine.buildContextSnapshot(world.id);

  assert.equal(ctx.travelHistory.totalEvents, 0);
  assert.equal(ctx.travelRelationships.totalRelationships, 0);
  assert.equal(ctx.travelMemory.length, 0);
  assert.equal(ctx.travelPreferences, null);
  for (const code of [MISSING_INFORMATION.TIMELINE_UNAVAILABLE, MISSING_INFORMATION.RELATIONSHIP_UNAVAILABLE, MISSING_INFORMATION.MEMORY_UNAVAILABLE, MISSING_INFORMATION.PREFERENCES_UNAVAILABLE, MISSING_INFORMATION.DISCOVERY_UNAVAILABLE]) {
    assert.ok(ctx.missingInformation.includes(code), `expected ${code}`);
  }
  assert.equal(ctx.generatedFrom.timeline, false);
});

test('deterministic output and stable contextVersion for identical inputs', async () => {
  const world = await buildFullWorld();
  const engine = createTravelIntelligenceContext(world.ports);
  const a = await engine.buildContextSnapshot(world.id);
  const b = await engine.buildContextSnapshot(world.id);
  assert.deepEqual(a, b);
  assert.equal(a.contextVersion, b.contextVersion);
});

test('rejects inactive / non-traveller before composing', async () => {
  const world = await buildFullWorld();
  const engine = createTravelIntelligenceContext(world.ports);
  await world.identityPlatform.suspendIdentity(world.id, 'policy', { id: 'admin', type: 'ADMINISTRATOR' });
  await assert.rejects(() => engine.buildContextSnapshot(world.id), err => err.code === 'IDENTITY_INACTIVE');
  await assert.rejects(() => engine.buildContextSnapshot('idn_ghost'), err => err.code === 'TRAVELLER_NOT_FOUND');
});

test('requires identity platform at construction', () => {
  assert.throws(() => createTravelIntelligenceContext({}), err => err.code === 'CONFIGURATION_ERROR');
  assert.throws(() => createTravelIntelligenceContext({ travellerIdentityPlatform: {} }), err => err.code === 'CONFIGURATION_ERROR');
});

test('cross-entity values are references only (no business-data duplication)', async () => {
  const world = await buildFullWorld();
  const engine = createTravelIntelligenceContext(world.ports);
  const ctx = await engine.buildContextSnapshot(world.id);
  const refs = [...ctx.visitedDestinations, ...ctx.plannedDestinations, ...ctx.companions.connected];
  for (const ref of refs) assert.deepEqual(Object.keys(ref).sort(), ['id', 'type']);
  for (const t of ctx.travelHistory.trips) assert.deepEqual(Object.keys(t.trip).sort(), ['id', 'type']);
});

test('output never contains exact-location fields', async () => {
  const world = await buildFullWorld();
  const engine = createTravelIntelligenceContext(world.ports);
  const ctx = await engine.buildContextSnapshot(world.id);
  assert.equal(scanForLocation(ctx), false);
});

test('every output is traceable to an evidence source', async () => {
  const world = await buildFullWorld();
  const engine = createTravelIntelligenceContext(world.ports);
  const ctx = await engine.buildContextSnapshot(world.id);
  const sources = new Set(ctx.availableEvidence.map(e => e.source));
  for (const s of [EVIDENCE_SOURCE.IDENTITY, EVIDENCE_SOURCE.TIMELINE, EVIDENCE_SOURCE.RELATIONSHIP, EVIDENCE_SOURCE.MEMORY, EVIDENCE_SOURCE.PREFERENCE, EVIDENCE_SOURCE.DISCOVERY]) {
    assert.ok(sources.has(s), `evidence missing source ${s}`);
  }
  // Evidence is sorted deterministically.
  const sorted = [...ctx.availableEvidence].sort((a, b) => a.source.localeCompare(b.source) || a.kind.localeCompare(b.kind));
  assert.deepEqual(ctx.availableEvidence, sorted);
});

test('generates deterministic risk signals and honest placeholders', async () => {
  const world = await buildFullWorld({ withData: false, verified: false });
  const engine = createTravelIntelligenceContext(world.ports);
  const risk = await engine.buildRiskSummary(world.id);
  const codes = risk.riskSignals.map(s => s.code);

  assert.ok(codes.includes(RISK_SIGNAL.IDENTITY_UNVERIFIED));
  assert.ok(codes.includes(RISK_SIGNAL.MISSING_PREFERENCES));
  assert.ok(codes.includes(RISK_SIGNAL.SPARSE_TRAVEL_HISTORY));
  assert.ok(codes.includes(RISK_SIGNAL.NO_TRAVEL_COMPANIONS));
  // Unverifiable info surfaced honestly as placeholders, not fake risks.
  assert.ok(risk.missingInformation.includes(MISSING_INFORMATION.EMERGENCY_CONTACT_UNKNOWN));
  assert.ok(risk.missingInformation.includes(MISSING_INFORMATION.PASSPORT_INFORMATION_UNKNOWN));
  // Every risk signal carries a source.
  assert.ok(risk.riskSignals.every(s => typeof s.source === 'string'));
});

test('evidence summary and confidence signals reflect available data', async () => {
  const full = await buildFullWorld();
  const fullCtx = await createTravelIntelligenceContext(full.ports).buildEvidenceSummary(full.id);
  assert.equal(fullCtx.confidenceSignals.overall, 'high');
  assert.equal(fullCtx.generatedFrom.timeline, true);

  const sparse = await buildFullWorld({ withData: false });
  const sparseCtx = await createTravelIntelligenceContext({ travellerIdentityPlatform: sparse.ports.travellerIdentityPlatform }).buildEvidenceSummary(sparse.id);
  assert.equal(sparseCtx.confidenceSignals.overall, 'low');
});

test('section builders work independently and stably order output', async () => {
  const world = await buildFullWorld();
  const engine = createTravelIntelligenceContext(world.ports);

  const traveller = await engine.buildTravellerContext(world.id);
  assert.equal(traveller.traveller.travellerId, world.id);

  const trip = await engine.buildTripContext(world.id);
  assert.equal(trip.travelHistory.totalEvents, 3);

  const rel = await engine.buildRelationshipContext(world.id);
  assert.deepEqual(rel.visitedDestinations, [{ type: 'destination', id: 'canggu' }]);

  const mem = await engine.buildMemoryContext(world.id);
  assert.equal(mem.travelMemory.length, 1);
  assert.ok(mem.travelPreferences);
});
