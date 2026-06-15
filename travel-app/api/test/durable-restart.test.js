import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import {
  FileIdentityRepository, FileItineraryRepository, FileTravelMemoryRepository,
  FileRelationshipRepository, FileApprovalRepository,
} from '../persistence/durable-repositories.js';
import { createTravelApi } from '../index.js';
import { createIdentityPlatform } from '../../../lib/identity-platform/index.js';
import { createItineraryPlatform } from '../../../lib/itinerary-platform/index.js';
import { createTravelMemoryPlatform, MEMORY_POLARITY } from '../../../lib/travel-memory-platform/index.js';
import { createTravelRelationshipGraph, ENTITY_TYPE, RELATIONSHIP_TYPE } from '../../../lib/travel-relationship-graph/index.js';
import { createApprovalPlatform } from '../../../lib/approval-platform/index.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-durable-')); }
const appleVerifier = async (t) => { const [, sub, email] = t.split(':'); return { sub, email }; };

// ---------------------------------------------------------------------------
// Per-module durable conformance (real frozen platform + reload from disk)
// ---------------------------------------------------------------------------

test('identity-platform survives reload on FileIdentityRepository', async () => {
  const dir = freshDir();
  const p1 = createIdentityPlatform({ repository: new FileIdentityRepository(new FileStore(dir)) });
  const created = await p1.createIdentity({ type: 'PERSON', roles: ['TRAVELLER'], publicProfile: { displayName: 'Mei' } });
  const p2 = createIdentityPlatform({ repository: new FileIdentityRepository(new FileStore(dir)) });
  const view = await p2.readIdentity(created.id, { view: 'public' });
  assert.equal(view.type, 'PERSON');
  assert.ok(view.roles.includes('TRAVELLER'));
});

test('itinerary-platform survives reload (itinerary + version history)', async () => {
  const dir = freshDir();
  const p1 = createItineraryPlatform({ repository: new FileItineraryRepository(new FileStore(dir)) });
  const it = await p1.createBlankItinerary({ tripId: 'trip_1', ownerIdentityId: 'idn_1', days: 2 });
  await p1.addBlock({ itineraryId: it.itineraryId, day: 1, section: 'morning', block: { type: 'activity', title: 'Surf' } });
  const p2 = createItineraryPlatform({ repository: new FileItineraryRepository(new FileStore(dir)) });
  const reloaded = await p2.getItinerary(it.itineraryId);
  assert.equal(reloaded.days.length, 2);
  assert.ok((await p2.getVersionHistory(it.itineraryId)).length >= 2);
});

test('travel-memory-platform survives reload (memory + reinforce across restart)', async () => {
  const dir = freshDir();
  const p1 = createTravelMemoryPlatform({ repository: new FileTravelMemoryRepository(new FileStore(dir)) });
  await p1.recordExplicitMemory({ travellerIdentityId: 'idn_1', key: 'cuisine', value: 'spicy', polarity: MEMORY_POLARITY.POSITIVE });
  const p2 = createTravelMemoryPlatform({ repository: new FileTravelMemoryRepository(new FileStore(dir)) });
  const mems = await p2.listMemoriesForTraveller('idn_1');
  assert.equal(mems.length, 1);
  // observing the same (traveller,key,value) reinforces the persisted memory (findMemory works across reload)
  const reinforced = await p2.observeLearnedMemory({ travellerIdentityId: 'idn_1', key: 'cuisine', value: 'spicy', polarity: MEMORY_POLARITY.POSITIVE });
  assert.equal(reinforced.observationCount, 2);
});

test('relationship-graph survives reload (edges + dedupe)', async () => {
  const dir = freshDir();
  const t = { type: ENTITY_TYPE.TRAVELLER, id: 'idn_1' };
  const p1 = createTravelRelationshipGraph({ repository: new FileRelationshipRepository(new FileStore(dir)) });
  await p1.createRelationship({ from: t, to: { type: ENTITY_TYPE.TRIP, id: 'trip_1' }, relationshipType: RELATIONSHIP_TYPE.OWNS });
  const p2 = createTravelRelationshipGraph({ repository: new FileRelationshipRepository(new FileStore(dir)) });
  const out = await p2.queryNeighbours(t, { relationshipType: RELATIONSHIP_TYPE.OWNS });
  assert.deepEqual(out.map(n => n.entity.id), ['trip_1']);
  await assert.rejects(
    () => p2.createRelationship({ from: t, to: { type: ENTITY_TYPE.TRIP, id: 'trip_1' }, relationshipType: RELATIONSHIP_TYPE.OWNS }),
    err => err.code === 'DUPLICATE_RELATIONSHIP',
  );
});

test('approval-platform survives reload (request + decision history)', async () => {
  const dir = freshDir();
  const actor = { id: 'idn_admin', type: 'ADMINISTRATOR' };
  const p1 = createApprovalPlatform({ repository: new FileApprovalRepository(new FileStore(dir)) });
  await p1.submitApprovalRequest({ requestId: 'req_1', sourcePlatform: 'travel', actionType: 'add_accommodation', requestedBy: 'orch' });
  const p2 = createApprovalPlatform({ repository: new FileApprovalRepository(new FileStore(dir)) });
  const approved = await p2.approve('req_1', actor);
  assert.equal(approved.status, 'approved');
  const p3 = createApprovalPlatform({ repository: new FileApprovalRepository(new FileStore(dir)) });
  assert.equal((await p3.getRequest('req_1')).status, 'approved'); // decision persisted
  assert.ok((await p3.queryHistory({ requestId: 'req_1' })).length >= 1);
});

// ---------------------------------------------------------------------------
// PRODUCTION-READINESS PROOF — full journey survives a complete restart
// ---------------------------------------------------------------------------

test('PRODUCTION PROOF: create entire trip, restart fresh API, retrieve everything', async () => {
  const dir = freshDir();

  // 1. Create the entire trip on API #1
  const a1 = createTravelApi({ store: new FileStore(dir), appleVerifier });
  const auth = await a1.signIn({ identityToken: 'apple:simon:simon@e.com', displayName: 'Simon' });
  const token = auth.token;
  const travellerId = auth.traveller.travellerId;
  await a1.putTrip(token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Bali', area: 'Canggu', startDate: '2026-07-11', endDate: '2026-07-25' });
  await a1.putItinerary(token, { days: 3, day: 1, section: 'morning', block: { type: 'activity', title: 'Surf', details: { itemId: 'act_surf' } } });
  await a1.capture(token, { note: 'Echo Beach sunset', photoRef: 'photo_1', day: 1 });
  await a1.getTripReadiness(token); // routes approval requests

  // 2 + 3. "Shut down" and start a completely fresh API over the same store
  const a2 = createTravelApi({ store: new FileStore(dir), appleVerifier });

  // 4. Retrieve EVERYTHING without rebuilding anything
  // Sign In (identity + apple link durable → same traveller)
  const reAuth = await a2.signIn({ identityToken: 'apple:simon:simon@e.com' });
  assert.equal(reAuth.traveller.travellerId, travellerId);

  // Trip
  const { trip } = await a2.getTrip(token);
  assert.equal(trip.destination, 'Bali');

  // Itinerary
  const { itinerary } = await a2.getItinerary(token);
  assert.equal(itinerary.days.length, 3);

  // Captured memories + Timeline (consumer-ready DTOs persist across restart)
  const tl = await a2.getTimeline(token);
  const entries = tl.days.flatMap(d => d.entries);
  assert.ok(entries.some(e => e.title === 'Trip created' && e.kind === 'trip'));
  assert.ok(entries.some(e => e.kind === 'photo'));

  // Relationship graph (traveller OWNS trip persisted)
  const owns = await a2._platforms.graph.queryNeighbours({ type: 'traveller', id: travellerId }, { relationshipType: 'owns' });
  assert.ok(owns.some(n => n.entity.id === trip.tripId));

  // Approvals persisted → and approvable after restart
  const { pending } = await a2.getApprovals(token);
  assert.ok(pending.length > 0);
  const resolved = await a2.resolveApproval(token, pending[0].requestId, { decision: 'approve' });
  assert.equal(resolved.request.status, 'approved');

  // Trip readiness still computable after restart
  const readiness = await a2.getTripReadiness(token);
  assert.ok(readiness.candidates.length > 0);
});
