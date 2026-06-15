import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createTravelApi } from '../index.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-journey-')); }

// Fake Apple verifier: "apple:<sub>:<email>" -> claims.
const appleVerifier = async (token) => { const [, sub, email] = token.split(':'); return { sub, email }; };

function api() {
  return createTravelApi({ store: new FileStore(freshDir()), appleVerifier });
}

test('END-TO-END: Sign In → Trip → Itinerary → Capture → Timeline → Readiness → Approve', async () => {
  const app = api();

  // 1. Sign In with Apple
  const auth = await app.signIn({ identityToken: 'apple:simon123:simon@example.com', displayName: 'Simon' });
  const token = auth.token;
  assert.ok(token);
  assert.equal(auth.traveller.isTraveller, true);

  // 2. Create Trip (Indonesia)
  const { trip } = await app.putTrip(token, {
    tripName: 'Indonesia July', country: 'Indonesia', destination: 'Bali', area: 'Canggu',
    startDate: '2026-07-11', endDate: '2026-07-25',
  });
  assert.ok(trip.tripId);
  assert.equal(trip.destination, 'Bali');

  // 3. Build Itinerary (create + add an activity)
  const built = await app.putItinerary(token, {
    days: 3,
    day: 1, section: 'morning',
    block: { type: 'activity', title: 'Surf lesson', details: { itemId: 'act_surf' } },
  });
  assert.ok(built.itinerary.itineraryId);
  assert.equal(built.itinerary.days.length, 3);

  // 4. Capture a memory (journal + photo ref)
  const cap = await app.capture(token, { note: 'Sunset at Echo Beach', photoRef: 'photo_1', day: 1 });
  assert.equal(cap.capture.eventType, 'photo_imported');

  // 5. View Timeline — trip_created + capture present, grouped by day
  const tl = await app.getTimeline(token);
  const allEvents = tl.days.flatMap(d => d.events);
  assert.ok(allEvents.some(e => e.metadata?.eventName === 'trip_created'));
  assert.ok(allEvents.some(e => e.eventType === 'photo_imported'));

  // 6. Trip Readiness — deterministic candidates + routed approval requests
  const readiness = await app.getTripReadiness(token);
  assert.ok(readiness.candidates.length > 0);
  assert.ok(readiness.approvalRequests.length > 0); // high-impact gaps routed to approval

  // 7. Approvals — pending list, then approve one
  const { pending } = await app.getApprovals(token);
  assert.ok(pending.length > 0);
  const resolved = await app.resolveApproval(token, pending[0].requestId, { decision: 'approve' });
  assert.equal(resolved.request.status, 'approved');

  // Today reflects the active trip + recent activity
  const today = await app.getToday(token);
  assert.equal(today.currentTrip.tripId, trip.tripId);
  assert.ok(today.recentTimeline.length > 0);
});

test('persists the journey across a restart (same store dir, fresh API)', async () => {
  const dir = freshDir();
  const a1 = createTravelApi({ store: new FileStore(dir), appleVerifier });
  const auth = await a1.signIn({ identityToken: 'apple:simon123:s@e.com', displayName: 'Simon' });
  await a1.putTrip(auth.token, { tripName: 'Indonesia', country: 'Indonesia', destination: 'Ubud', area: 'Central', startDate: '2026-07-11', endDate: '2026-07-20' });

  // restart: fresh API over the same store; session persisted → same traveller, trip persisted
  const a2 = createTravelApi({ store: new FileStore(dir), appleVerifier });
  const { trip } = await a2.getTrip(auth.token);
  assert.ok(trip, 'trip should persist across restart');
  assert.equal(trip.destination, 'Ubud');
});

test('unauthenticated requests are rejected', async () => {
  const app = api();
  await assert.rejects(() => app.getToday('bogus-token'), err => err.status === 401);
  await assert.rejects(() => app.putTrip(undefined, {}), err => err.status === 401);
});
