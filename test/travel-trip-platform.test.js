import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TRIP_STATUS,
  TRIP_VISIBILITY,
  createTripPlatform,
} from '../lib/trip-platform/index.js';
import { createIdentityPlatform } from '../lib/identity-platform/index.js';
import {
  IdentityPlatformSourceAdapter,
  createTravellerIdentityPlatform,
} from '../lib/traveller-identity-platform/index.js';

const traveller = { id: 'idn_traveller_1', type: 'TRAVELLER' };
const otherTraveller = { id: 'idn_traveller_2', type: 'TRAVELLER' };
const admin = { id: 'idn_admin_1', type: 'ADMINISTRATOR' };

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

test('creates a trip with required fields and safe defaults', async () => {
  const platform = createTripPlatform();
  const trip = await platform.createTrip(validTrip(), traveller);

  assert.ok(trip.tripId.startsWith('trip_'));
  assert.equal(trip.ownerIdentityId, traveller.id);
  assert.equal(trip.tripName, 'Bali June');
  assert.equal(trip.country, 'Indonesia');
  assert.equal(trip.destination, 'Bali');
  assert.equal(trip.area, 'Canggu');
  assert.equal(trip.status, TRIP_STATUS.DRAFT);
  assert.equal(trip.visibility, TRIP_VISIBILITY.PRIVATE);
  assert.ok(trip.createdAt);
  assert.ok(trip.updatedAt);
});

test('validates required fields and date ranges', async () => {
  const platform = createTripPlatform();

  await assert.rejects(() => platform.createTrip(validTrip({ ownerIdentityId: '' }), traveller), /ownerIdentityId is required/);
  await assert.rejects(() => platform.createTrip(validTrip({ tripName: '' }), traveller), /tripName is required/);
  await assert.rejects(() => platform.createTrip(validTrip({ country: '' }), traveller), /country is required/);
  await assert.rejects(() => platform.createTrip(validTrip({ destination: '' }), traveller), /destination is required/);
  await assert.rejects(() => platform.createTrip(validTrip({ area: '' }), traveller), /area is required/);
  await assert.rejects(() => platform.createTrip(validTrip({ startDate: 'not-a-date' }), traveller), /startDate must be a valid date/);
  await assert.rejects(() => platform.createTrip(validTrip({ startDate: '2026-07-02', endDate: '2026-06-20' }), traveller), /endDate must be on or after startDate/);
});

test('rejects exact live location fields', async () => {
  const platform = createTripPlatform();
  await assert.rejects(() => platform.createTrip(validTrip({ latitude: -8.65 }), traveller), /approximate area only/);

  const trip = await platform.createTrip(validTrip(), traveller);
  await assert.rejects(() => platform.changeTripDestination(trip.tripId, { destination: 'Ubud', exactLocation: 'private villa' }, traveller), /approximate area only/);
});

test('supports valid status transitions', async () => {
  const platform = createTripPlatform();
  const trip = await platform.createTrip(validTrip({ status: TRIP_STATUS.PLANNED }), traveller);

  const active = await platform.startTrip(trip.tripId, traveller);
  assert.equal(active.status, TRIP_STATUS.ACTIVE);

  const completed = await platform.completeTrip(trip.tripId, traveller);
  assert.equal(completed.status, TRIP_STATUS.COMPLETED);
});

test('rejects invalid status transitions', async () => {
  const platform = createTripPlatform();
  const draft = await platform.createTrip(validTrip(), traveller);
  await assert.rejects(() => platform.completeTrip(draft.tripId, traveller), /Cannot change trip status from draft to completed/);

  const cancelled = await platform.cancelTrip(draft.tripId, traveller, 'changed plans');
  assert.equal(cancelled.status, TRIP_STATUS.CANCELLED);
  await assert.rejects(() => platform.startTrip(cancelled.tripId, traveller), /Cannot change trip status from cancelled to active/);
});

test('supports trip updates date changes destination changes and visibility changes', async () => {
  const platform = createTripPlatform();
  const trip = await platform.createTrip(validTrip(), traveller);

  const renamed = await platform.updateTrip(trip.tripId, { tripName: 'Bali and Lombok' }, traveller);
  assert.equal(renamed.tripName, 'Bali and Lombok');

  const dated = await platform.changeTripDates(trip.tripId, '2026-06-21', '2026-07-05', traveller);
  assert.equal(dated.startDate, '2026-06-21');
  assert.equal(dated.endDate, '2026-07-05');

  const moved = await platform.changeTripDestination(trip.tripId, {
    country: 'Indonesia',
    destination: 'Lombok',
    area: 'Kuta Lombok',
  }, traveller);
  assert.equal(moved.destination, 'Lombok');
  assert.equal(moved.area, 'Kuta Lombok');

  const visible = await platform.changeTripVisibility(trip.tripId, TRIP_VISIBILITY.APPROXIMATE_AREA, traveller);
  assert.equal(visible.visibility, TRIP_VISIBILITY.APPROXIMATE_AREA);
});

test('validates visibility changes', async () => {
  const platform = createTripPlatform();
  const trip = await platform.createTrip(validTrip(), traveller);

  await assert.rejects(() => platform.changeTripVisibility(trip.tripId, 'exact_location_public', traveller), /Unsupported trip visibility/);
});

test('enforces owner isolation for reads updates and lists', async () => {
  const platform = createTripPlatform();
  const trip = await platform.createTrip(validTrip(), traveller);
  await platform.createTrip(validTrip({
    ownerIdentityId: otherTraveller.id,
    tripName: 'Ubud July',
  }), otherTraveller);

  await assert.rejects(() => platform.getTripById(trip.tripId, otherTraveller), /Actor cannot access this trip/);
  await assert.rejects(() => platform.updateTrip(trip.tripId, { tripName: 'Hijack' }, otherTraveller), /Actor cannot access this trip/);
  await assert.rejects(() => platform.listTripsForIdentity(traveller.id, otherTraveller), /Actor cannot list trips/);

  const ownTrips = await platform.listTripsForIdentity(traveller.id, traveller);
  assert.equal(ownTrips.length, 1);
  assert.equal(ownTrips[0].ownerIdentityId, traveller.id);

  const adminRead = await platform.getTripById(trip.tripId, admin);
  assert.equal(adminRead.tripId, trip.tripId);
});

test('completed trips cannot be mutated or cancelled', async () => {
  const platform = createTripPlatform();
  const trip = await platform.createTrip(validTrip({ status: TRIP_STATUS.PLANNED }), traveller);
  await platform.startTrip(trip.tripId, traveller);
  await platform.completeTrip(trip.tripId, traveller);

  await assert.rejects(() => platform.updateTrip(trip.tripId, { tripName: 'Nope' }, traveller), /Cannot update a completed trip/);
  await assert.rejects(() => platform.changeTripDates(trip.tripId, '2026-07-01', '2026-07-03', traveller), /Cannot change dates for a completed trip/);
  await assert.rejects(() => platform.cancelTrip(trip.tripId, traveller), /Cannot change trip status from completed to cancelled/);
});

test('cancelled trips cannot be mutated or completed', async () => {
  const platform = createTripPlatform();
  const trip = await platform.createTrip(validTrip(), traveller);
  await platform.cancelTrip(trip.tripId, traveller, 'weather');

  await assert.rejects(() => platform.changeTripVisibility(trip.tripId, TRIP_VISIBILITY.PUBLIC_TO_JOINED_CONTEXTS, traveller), /Cannot change visibility for a cancelled trip/);
  await assert.rejects(() => platform.completeTrip(trip.tripId, traveller), /Cannot change trip status from cancelled to completed/);
});

// ===========================================================================
// M11 Phase 1 — Traveller Identity adoption (injected M10 port)
// ===========================================================================

// Build a trip-platform wired to a real traveller-identity port over a real
// identity-platform, plus a freshly-created ACTIVE traveller to own trips.
async function tripPlatformWithIdentity() {
  const identityPlatform = createIdentityPlatform();
  const travellerIdentityPlatform = createTravellerIdentityPlatform({
    identitySource: new IdentityPlatformSourceAdapter({ identityPlatform }),
  });
  const platform = createTripPlatform({ travellerIdentityPlatform });
  return { identityPlatform, platform };
}

test('M11: accepts a trip for a valid active traveller (port injected)', async () => {
  const { identityPlatform, platform } = await tripPlatformWithIdentity();
  const identity = await identityPlatform.createIdentity({
    type: 'PERSON', roles: ['TRAVELLER'], publicProfile: { displayName: 'Mei' },
  });
  const actor = { id: identity.id, type: 'TRAVELLER' };

  const trip = await platform.createTrip(validTrip({ ownerIdentityId: identity.id }), actor);
  assert.equal(trip.ownerIdentityId, identity.id);
  assert.equal(trip.status, TRIP_STATUS.DRAFT);

  // Existing behaviour preserved end-to-end for a validated owner.
  const renamed = await platform.updateTrip(trip.tripId, { tripName: 'Renamed' }, actor);
  assert.equal(renamed.tripName, 'Renamed');
});

test('M11: rejects a trip for a missing identity', async () => {
  const { platform } = await tripPlatformWithIdentity();
  const actor = { id: 'idn_ghost', type: 'TRAVELLER' };
  await assert.rejects(
    () => platform.createTrip(validTrip({ ownerIdentityId: 'idn_ghost' }), actor),
    err => err.code === 'TRAVELLER_NOT_FOUND',
  );
});

test('M11: rejects a trip for an inactive (suspended) traveller', async () => {
  const { identityPlatform, platform } = await tripPlatformWithIdentity();
  const identity = await identityPlatform.createIdentity({
    type: 'PERSON', roles: ['TRAVELLER'], publicProfile: { displayName: 'S' },
  });
  await identityPlatform.suspendIdentity(identity.id, 'policy', { id: 'idn_admin', type: 'ADMINISTRATOR' });
  const actor = { id: identity.id, type: 'TRAVELLER' };

  await assert.rejects(
    () => platform.createTrip(validTrip({ ownerIdentityId: identity.id }), actor),
    err => err.code === 'IDENTITY_INACTIVE',
  );
});

test('M11: rejects a trip for a non-traveller identity (admin actor)', async () => {
  const { identityPlatform, platform } = await tripPlatformWithIdentity();
  const host = await identityPlatform.createIdentity({
    type: 'PERSON', roles: ['HOST'], publicProfile: { displayName: 'H' },
  });
  // Privileged actor may create for another identity, but the owner must still
  // be a valid traveller — so this is rejected by the M10 port.
  await assert.rejects(
    () => platform.createTrip(validTrip({ ownerIdentityId: host.id }), { id: 'idn_admin', type: 'ADMINISTRATOR' }),
    err => err.code === 'NOT_A_TRAVELLER',
  );
});

test('M11: existing behaviour preserved when no port is injected', async () => {
  // Same as the baseline tests: no identity port, raw ids trusted.
  const platform = createTripPlatform();
  const trip = await platform.createTrip(validTrip({ ownerIdentityId: 'idn_unchecked' }), { id: 'idn_unchecked', type: 'TRAVELLER' });
  assert.equal(trip.ownerIdentityId, 'idn_unchecked');
});

test('M11: rejects a misconfigured traveller identity port', () => {
  assert.throws(
    () => createTripPlatform({ travellerIdentityPlatform: {} }),
    /travellerIdentityPlatform must expose assertActiveTraveller/,
  );
});

test('M11: trip-platform source imports no identity module directly', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const srcDir = join(dir, '..', 'lib', 'trip-platform');
  for (const file of readdirSync(srcDir).filter(f => f.endsWith('.js'))) {
    const source = readFileSync(join(srcDir, file), 'utf8');
    assert.ok(!/from\s+['"][^'"]*identity-platform/.test(source),
      `${file} must not import an identity module directly`);
  }
});

