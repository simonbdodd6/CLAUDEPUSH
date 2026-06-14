import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCOVERY_AUDIT_ACTIONS,
  DISCOVERY_STATUS,
  DISCOVERY_VISIBILITY,
  createCompanionDiscoveryPlatform,
} from '../lib/companion-discovery-platform/index.js';

function baseProfile(overrides = {}) {
  return {
    travellerIdentityId: 'idn_1',
    optedIn: true,
    approximateArea: 'Canggu',
    destinationId: 'dest_canggu',
    travelStartDate: '2026-07-01',
    travelEndDate: '2026-07-10',
    activityInterests: ['surfing', 'diving'],
    travelStyles: ['adventure', 'budget'],
    statuses: [DISCOVERY_STATUS.LOOKING_FOR_SURFING],
    ...overrides,
  };
}

async function platformWithProfiles() {
  const platform = createCompanionDiscoveryPlatform();
  const seeker = await platform.createProfile(baseProfile({ travellerIdentityId: 'idn_seeker' }));
  const strong = await platform.createProfile(baseProfile({
    travellerIdentityId: 'idn_strong',
    statuses: [DISCOVERY_STATUS.LOOKING_FOR_SURFING, DISCOVERY_STATUS.AVAILABLE_TODAY],
  }));
  const weak = await platform.createProfile(baseProfile({
    travellerIdentityId: 'idn_weak',
    approximateArea: 'Ubud',
    destinationId: 'dest_ubud',
    travelStartDate: '2026-09-01',
    travelEndDate: '2026-09-10',
    activityInterests: ['museums'],
    travelStyles: ['luxury'],
    statuses: [DISCOVERY_STATUS.LOOKING_FOR_COFFEE],
  }));
  return { platform, seeker, strong, weak };
}

test('creates a privacy-safe discovery profile with safe defaults', async () => {
  const platform = createCompanionDiscoveryPlatform();
  const profile = await platform.createProfile(baseProfile({ optedIn: undefined }));

  assert.ok(profile.profileId.startsWith('discovery_'));
  assert.equal(profile.optedIn, false); // opt-in is explicit
  assert.equal(profile.visibility, DISCOVERY_VISIBILITY.EVERYONE);
  assert.equal(profile.deterministic, true);
  assert.equal(profile.aiUsed, false);
  assert.deepEqual(profile.activityInterests, ['surfing', 'diving']);
  assert.deepEqual(profile.blockedTravellerIds, []);
});

test('discovers compatible travellers ranked by deterministic compatibility', async () => {
  const { platform, seeker } = await platformWithProfiles();
  const results = await platform.discoverCompanions({ seekerProfileId: seeker.profileId });

  assert.equal(results.length, 1); // only the strong match scores > 0
  assert.equal(results[0].travellerIdentityId, 'idn_strong');
  assert.ok(results[0].compatibility > 0 && results[0].compatibility <= 1);
  assert.equal(results[0].sharedDestination, true);
  assert.deepEqual(results[0].sharedActivities, ['surfing', 'diving']);
  assert.ok(results[0].sharedDates.overlapDays > 0);
  assert.match(results[0].explanation, /share the destination/);
  assert.ok(results[0].sourceFactors.some(f => f.factor === 'available_today'));
});

test('never returns exact location fields', async () => {
  const { platform, seeker } = await platformWithProfiles();
  const [match] = await platform.discoverCompanions({ seekerProfileId: seeker.profileId });
  const keys = Object.keys(match);
  for (const banned of ['lat', 'lng', 'latitude', 'longitude', 'coordinates', 'liveLocation', 'gps']) {
    assert.ok(!keys.includes(banned), `result must not expose ${banned}`);
  }
  assert.equal(match.approximateArea, 'Canggu');
});

test('opted-out travellers are never discoverable', async () => {
  const { platform, seeker, strong } = await platformWithProfiles();
  await platform.optOut(strong.profileId);
  const results = await platform.discoverCompanions({ seekerProfileId: seeker.profileId });
  assert.equal(results.length, 0);
});

test('blocked travellers never appear in either direction', async () => {
  const { platform, seeker, strong } = await platformWithProfiles();

  // Seeker blocks the strong match.
  await platform.blockTraveller({ profileId: seeker.profileId, blockedTravellerIdentityId: 'idn_strong' });
  let results = await platform.discoverCompanions({ seekerProfileId: seeker.profileId });
  assert.equal(results.length, 0);

  // Reverse direction: the candidate blocks the seeker.
  await platform.unblockTraveller({ profileId: seeker.profileId, blockedTravellerIdentityId: 'idn_strong' });
  await platform.blockTraveller({ profileId: strong.profileId, blockedTravellerIdentityId: 'idn_seeker' });
  results = await platform.discoverCompanions({ seekerProfileId: seeker.profileId });
  assert.equal(results.length, 0);
});

test('visibility controls gate discoverability', async () => {
  const { platform, seeker, strong } = await platformWithProfiles();

  // same_area: strong shares Canggu with seeker -> visible.
  await platform.setVisibility({ profileId: strong.profileId, visibility: DISCOVERY_VISIBILITY.SAME_AREA });
  let results = await platform.discoverCompanions({ seekerProfileId: seeker.profileId });
  assert.equal(results.length, 1);

  // Move strong's area away while keeping same_area -> no longer visible.
  await platform.updateProfile({ profileId: strong.profileId, changes: { approximateArea: 'Seminyak' } });
  results = await platform.discoverCompanions({ seekerProfileId: seeker.profileId });
  assert.equal(results.length, 0);

  // hidden -> never visible even though everything else matches.
  await platform.updateProfile({ profileId: strong.profileId, changes: { approximateArea: 'Canggu' } });
  await platform.setVisibility({ profileId: strong.profileId, visibility: DISCOVERY_VISIBILITY.HIDDEN });
  results = await platform.discoverCompanions({ seekerProfileId: seeker.profileId });
  assert.equal(results.length, 0);
});

test('requireStatus and onlySharedDestination filters apply', async () => {
  const { platform, seeker } = await platformWithProfiles();

  const diving = await platform.discoverCompanions({
    seekerProfileId: seeker.profileId,
    requireStatus: DISCOVERY_STATUS.LOOKING_FOR_DINNER,
  });
  assert.equal(diving.length, 0); // nobody is looking for dinner

  const sameDest = await platform.discoverCompanions({
    seekerProfileId: seeker.profileId,
    onlySharedDestination: true,
  });
  assert.equal(sameDest.length, 1);
  assert.equal(sameDest[0].travellerIdentityId, 'idn_strong');
});

test('seeker must be opted in to discover', async () => {
  const platform = createCompanionDiscoveryPlatform();
  const seeker = await platform.createProfile(baseProfile({ travellerIdentityId: 'idn_seeker', optedIn: false }));
  await assert.rejects(
    () => platform.discoverCompanions({ seekerProfileId: seeker.profileId }),
    /must be opted in/,
  );
});

test('memory conflicts reduce compatibility', async () => {
  const platform = createCompanionDiscoveryPlatform();
  const seeker = await platform.createProfile(baseProfile({
    travellerIdentityId: 'idn_seeker',
    positiveMemoryTags: ['noise:quiet'],
    negativeMemoryTags: ['scene:party'],
  }));
  const aligned = await platform.createProfile(baseProfile({
    travellerIdentityId: 'idn_aligned',
    positiveMemoryTags: ['noise:quiet'],
  }));
  const conflicted = await platform.createProfile(baseProfile({
    travellerIdentityId: 'idn_conflicted',
    positiveMemoryTags: ['scene:party'], // conflicts with seeker's negative tag
  }));

  const results = await platform.discoverCompanions({ seekerProfileId: seeker.profileId });
  const alignedResult = results.find(r => r.travellerIdentityId === 'idn_aligned');
  const conflictedResult = results.find(r => r.travellerIdentityId === 'idn_conflicted');
  assert.ok(alignedResult.score > conflictedResult.score);
  assert.match(conflictedResult.explanation, /preference conflict/);
});

test('derives privacy-safe profile fields from snapshots', async () => {
  const platform = createCompanionDiscoveryPlatform();
  const fields = platform.deriveProfileFieldsFromSnapshots({
    preferences: { travelStyles: ['Adventure'], activities: ['Surfing', 'Diving'] },
    memories: [
      { key: 'cuisine', value: 'spicy', polarity: 'positive' },
      { key: 'scene', value: 'party', polarity: 'negative' },
    ],
  });

  assert.deepEqual(fields.activityInterests, ['surfing', 'diving']);
  assert.deepEqual(fields.travelStyles, ['adventure']);
  assert.deepEqual(fields.positiveMemoryTags, ['cuisine:spicy']);
  assert.deepEqual(fields.negativeMemoryTags, ['scene:party']);
});

test('rejects exact location inputs and coordinate-like area labels', async () => {
  const platform = createCompanionDiscoveryPlatform();

  await assert.rejects(() => platform.createProfile(baseProfile({ latitude: -8.65 })),
    /must not include exact traveller location/);
  await assert.rejects(() => platform.createProfile(baseProfile({ approximateArea: '-8.65, 115.13' })),
    /must be an approximate area label/);
  assert.throws(() => platform.deriveProfileFieldsFromSnapshots({
    preferences: { gps: '1,2' }, memories: [],
  }), /must not include exact traveller location/);
});

test('validates input, prevents duplicates, and records audit events', async () => {
  const platform = createCompanionDiscoveryPlatform();
  await platform.createProfile(baseProfile({ travellerIdentityId: 'idn_dup' }));

  await assert.rejects(() => platform.createProfile(baseProfile({ travellerIdentityId: 'idn_dup' })),
    /already exists/);
  await assert.rejects(() => platform.createProfile(baseProfile({ travellerIdentityId: '', })),
    /travellerIdentityId is required/);
  await assert.rejects(() => platform.createProfile(baseProfile({ travellerIdentityId: 'idn_x', statuses: ['looking_for_napping'] })),
    /status must be one of/);
  await assert.rejects(() => platform.getProfile('missing'), /Discovery profile not found/);

  const audit = await platform.getAuditEvents({ travellerIdentityId: 'idn_dup' });
  assert.ok(audit.some(e => e.action === DISCOVERY_AUDIT_ACTIONS.PROFILE_CREATED));
});
