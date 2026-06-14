import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityPlatform } from '../lib/identity-platform/index.js';
import {
  IdentitySourceAdapter,
  IdentityPlatformSourceAdapter,
  TravellerIdentityPlatformError,
  createTravellerIdentityPlatform,
} from '../lib/traveller-identity-platform/index.js';

// ---------------------------------------------------------------------------
// Fake identity source: a hand-built port implementation with NO dependency on
// identity-platform. Proves the service depends only on the port.
// ---------------------------------------------------------------------------
function publicSnapshot(overrides = {}) {
  return {
    id: 'idn_fake_1',
    type: 'PERSON',
    roles: ['TRAVELLER'],
    status: 'ACTIVE',
    verified: true,
    verificationStatus: 'VERIFIED',
    publicProfile: {
      displayName: 'Ada',
      avatarUrl: null,
      bio: 'loves surfing',
      country: 'ID',
      languages: ['en', 'id'],
      timezone: null,
    },
    trust: { score: null, level: 'UNASSESSED' },
    reputation: { summary: 'No reputation events yet', eventsCount: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

class FakeIdentitySource extends IdentitySourceAdapter {
  constructor(snapshotsById = {}) {
    super();
    this.snapshotsById = snapshotsById;
    this.calls = [];
  }

  async getIdentitySnapshot(id) {
    this.calls.push(id);
    return this.snapshotsById[id] ?? null;
  }
}

// ===========================================================================
// Fake-source tests
// ===========================================================================

test('resolves a valid traveller into a privacy-safe view (fake source)', async () => {
  const source = new FakeIdentitySource({ idn_fake_1: publicSnapshot() });
  const platform = createTravellerIdentityPlatform({ identitySource: source });

  const view = await platform.resolveTraveller('idn_fake_1');
  assert.equal(view.travellerId, 'idn_fake_1');
  assert.equal(view.type, 'PERSON');
  assert.equal(view.status, 'ACTIVE');
  assert.equal(view.isTraveller, true);
  assert.equal(view.verified, true);
  assert.equal(view.displayName, 'Ada');
  assert.deepEqual(view.languages, ['en', 'id']);
});

test('view exposes only privacy-safe fields (no internal/PII)', async () => {
  const source = new FakeIdentitySource({ idn_fake_1: publicSnapshot() });
  const platform = createTravellerIdentityPlatform({ identitySource: source });

  const view = await platform.getTravellerView('idn_fake_1');
  const keys = Object.keys(view);
  for (const banned of ['email', 'legalName', 'phone', 'emergencyContact', 'internalProfile', 'privacySettings']) {
    assert.ok(!keys.includes(banned), `view must not expose ${banned}`);
  }
});

test('isTraveller returns true / false without throwing', async () => {
  const source = new FakeIdentitySource({
    idn_fake_1: publicSnapshot(),
    idn_host: publicSnapshot({ id: 'idn_host', roles: ['HOST'] }),
  });
  const platform = createTravellerIdentityPlatform({ identitySource: source });

  assert.equal(await platform.isTraveller('idn_fake_1'), true);
  assert.equal(await platform.isTraveller('idn_host'), false);
  assert.equal(await platform.isTraveller('idn_missing'), false);
});

test('assertActiveTraveller returns id or throws typed errors', async () => {
  const source = new FakeIdentitySource({
    idn_fake_1: publicSnapshot(),
    idn_suspended: publicSnapshot({ id: 'idn_suspended', status: 'SUSPENDED' }),
    idn_host: publicSnapshot({ id: 'idn_host', roles: ['HOST'] }),
    idn_org: publicSnapshot({ id: 'idn_org', type: 'ORGANIZATION' }),
  });
  const platform = createTravellerIdentityPlatform({ identitySource: source });

  assert.equal(await platform.assertActiveTraveller('idn_fake_1'), 'idn_fake_1');

  await assert.rejects(() => platform.assertActiveTraveller('idn_missing'),
    err => err instanceof TravellerIdentityPlatformError && err.code === 'TRAVELLER_NOT_FOUND');
  await assert.rejects(() => platform.assertActiveTraveller('idn_suspended'),
    err => err.code === 'IDENTITY_INACTIVE');
  await assert.rejects(() => platform.assertActiveTraveller('idn_host'),
    err => err.code === 'NOT_A_TRAVELLER' && err.details.reason === 'missing_traveller_role');
  await assert.rejects(() => platform.assertActiveTraveller('idn_org'),
    err => err.code === 'NOT_A_TRAVELLER' && err.details.reason === 'unexpected_type');
});

test('type is only checked when the snapshot provides it', async () => {
  const source = new FakeIdentitySource({
    idn_no_type: publicSnapshot({ id: 'idn_no_type', type: undefined }),
  });
  const platform = createTravellerIdentityPlatform({ identitySource: source });
  const view = await platform.resolveTraveller('idn_no_type');
  assert.equal(view.travellerId, 'idn_no_type');
  assert.equal(view.type, null);
});

test('output is deterministic for the same snapshot', async () => {
  const source = new FakeIdentitySource({ idn_fake_1: publicSnapshot() });
  const platform = createTravellerIdentityPlatform({ identitySource: source });
  const a = await platform.getTravellerView('idn_fake_1');
  const b = await platform.getTravellerView('idn_fake_1');
  assert.deepEqual(a, b);
});

test('adapter boundary: the port is the sole data path', async () => {
  const source = new FakeIdentitySource({ idn_fake_1: publicSnapshot() });
  const platform = createTravellerIdentityPlatform({ identitySource: source });

  await platform.resolveTraveller('idn_fake_1');
  await platform.isTraveller('idn_fake_1');
  // Every resolution went through the injected port — no other data source.
  assert.deepEqual(source.calls, ['idn_fake_1', 'idn_fake_1']);
});

test('rejects invalid id and missing/invalid identitySource', async () => {
  await assert.throws(() => createTravellerIdentityPlatform({}),
    err => err.code === 'CONFIGURATION_ERROR');
  await assert.throws(() => createTravellerIdentityPlatform({ identitySource: {} }),
    err => err.code === 'CONFIGURATION_ERROR');

  const source = new FakeIdentitySource({});
  const platform = createTravellerIdentityPlatform({ identitySource: source });
  await assert.rejects(() => platform.resolveTraveller(''),
    err => err.code === 'VALIDATION_FAILED');

  // Base port is abstract.
  await assert.rejects(() => new IdentitySourceAdapter().getIdentitySnapshot('x'),
    err => err.code === 'CONFIGURATION_ERROR');
});

// ===========================================================================
// Real identity-platform tests (through IdentityPlatformSourceAdapter)
// ===========================================================================

function travellerPlatformOverReal() {
  const identityPlatform = createIdentityPlatform();
  const travellers = createTravellerIdentityPlatform({
    identitySource: new IdentityPlatformSourceAdapter({ identityPlatform }),
  });
  return { identityPlatform, travellers };
}

test('IdentityPlatformSourceAdapter requires a readIdentity-capable platform', () => {
  assert.throws(() => new IdentityPlatformSourceAdapter({}),
    err => err.code === 'CONFIGURATION_ERROR');
  assert.throws(() => new IdentityPlatformSourceAdapter({ identityPlatform: {} }),
    err => err.code === 'CONFIGURATION_ERROR');
});

test('resolves a real traveller identity through the public view', async () => {
  const { identityPlatform, travellers } = travellerPlatformOverReal();
  const created = await identityPlatform.createIdentity({
    type: 'PERSON',
    roles: ['TRAVELLER'],
    publicProfile: { displayName: 'Mei', country: 'JP', languages: ['ja'], timezone: 'Asia/Tokyo' },
  });

  const view = await travellers.resolveTraveller(created.id);
  assert.ok(created.id.startsWith('idn_'));
  assert.equal(view.travellerId, created.id);
  assert.equal(view.type, 'PERSON');
  assert.equal(view.isTraveller, true);
  assert.equal(view.country, 'JP'); // showCountry default true
  // Privacy default showTimezone=false -> public view hides it, so M10 cannot expose it.
  assert.equal(view.timezone, null);
});

test('real: not found, suspended, soft-deleted, and non-traveller role', async () => {
  const { identityPlatform, travellers } = travellerPlatformOverReal();
  const actor = { id: 'admin_1', type: 'ADMINISTRATOR' };

  await assert.rejects(() => travellers.resolveTraveller('idn_does_not_exist'),
    err => err.code === 'TRAVELLER_NOT_FOUND');

  const suspended = await identityPlatform.createIdentity({ type: 'PERSON', roles: ['TRAVELLER'], publicProfile: { displayName: 'S' } });
  await identityPlatform.suspendIdentity(suspended.id, 'policy', actor);
  await assert.rejects(() => travellers.resolveTraveller(suspended.id),
    err => err.code === 'IDENTITY_INACTIVE');

  const deleted = await identityPlatform.createIdentity({ type: 'PERSON', roles: ['TRAVELLER'], publicProfile: { displayName: 'D' } });
  await identityPlatform.softDeleteIdentity(deleted.id, actor, { gdpr: true });
  await assert.rejects(() => travellers.resolveTraveller(deleted.id),
    err => err.code === 'TRAVELLER_NOT_FOUND'); // public view is null for soft-deleted

  const host = await identityPlatform.createIdentity({ type: 'PERSON', roles: ['HOST'], publicProfile: { displayName: 'H' } });
  assert.equal(await travellers.isTraveller(host.id), false);
});

test('real: non-person identity with traveller role is rejected', async () => {
  const { identityPlatform, travellers } = travellerPlatformOverReal();
  const org = await identityPlatform.createIdentity({
    type: 'ORGANIZATION',
    roles: ['TRAVELLER'],
    publicProfile: { displayName: 'Org' },
  });
  await assert.rejects(() => travellers.resolveTraveller(org.id),
    err => err.code === 'NOT_A_TRAVELLER' && err.details.reason === 'unexpected_type');
});
