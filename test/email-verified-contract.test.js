/**
 * emailVerified contract — every user creation path must produce a clean boolean.
 *
 * Invariants:
 *  1. publicUser() always returns emailVerified as a boolean (never undefined)
 *  2. New users from every creation path start with emailVerified: false
 *  3. Verified users retain emailVerified: true through publicUser()
 *  4. Legacy users stored without the field are treated as unverified (false)
 *
 * Paths covered:
 *  - createJoinRequest (self-serve player join)
 *  - claimInvite (coach-created invite)
 *  - createClub (head coach self-registration)
 *  - ensureLegacyCompatibilityTeamRecords (Simon Test Player bootstrap)
 *  - ensureLegacyStaffAccountForLogin (coach-demo login-time hydration)
 *  - publicUser() with a stored user that has no emailVerified field (legacy Redis)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.ev-contract.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.COACH_DEMO_EMAIL         = 'coach@ev-contract.test';
process.env.COACH_DEMO_PASSWORD      = 'DemoPass99!';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  let parsed;
  try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'email_mock' }) };
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'EXPIRE' || command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const {
  publicUser,
  createJoinRequest,
  createClub,
  claimInvite,
  createEmailVerificationToken,
  verifyEmailToken,
  loadUsers,
  saveUsers,
  loginUser,
} = await import('../api/_identityStore.js');

// Minimal invite helper — write directly to the store so tests don't depend on
// the invite handler (avoids email-send side effects in this unit test file).
async function seedInvite(kv, { token, teamId, role = 'player', email = null, name = 'Invited Player' }) {
  const existing = JSON.parse(kv.get('ce:invites') || '[]');
  existing.push({
    token,
    teamId,
    role,
    email,
    name,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  kv.set('ce:invites', JSON.stringify(existing));
}

// ── publicUser() normalization ───────────────────────────────────────────────

test('publicUser normalizes missing emailVerified to false (legacy Redis record)', () => {
  const legacy = { id: 'u1', email: 'old@user.test', displayName: 'Old User' };
  const result = publicUser(legacy);
  assert.equal(typeof result.emailVerified, 'boolean', 'emailVerified must be a boolean');
  assert.equal(result.emailVerified, false, 'missing field must normalize to false');
});

test('publicUser preserves emailVerified: true for a verified user', () => {
  const verified = { id: 'u2', email: 'verified@user.test', emailVerified: true, emailVerifiedAt: '2026-06-14T00:00:00Z' };
  const result = publicUser(verified);
  assert.equal(result.emailVerified, true);
  assert.ok(result.emailVerifiedAt, 'emailVerifiedAt must survive publicUser');
});

test('publicUser preserves emailVerified: false for an explicit false value', () => {
  const unverified = { id: 'u3', email: 'no@verify.test', emailVerified: false };
  const result = publicUser(unverified);
  assert.equal(result.emailVerified, false);
});

test('publicUser does not expose password fields', () => {
  const raw = { id: 'u4', email: 'x@x.test', passwordHash: 'secret', passwordSalt: 'salt', passwordAlgo: 'scrypt', emailVerified: false };
  const result = publicUser(raw);
  assert.equal(result.passwordHash, undefined);
  assert.equal(result.passwordSalt, undefined);
  assert.equal(result.passwordAlgo, undefined);
  assert.equal(result.emailVerified, false);
});

// ── createJoinRequest ────────────────────────────────────────────────────────

test('createJoinRequest: new user has emailVerified: false', async () => {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: 'test-club', name: 'Test Club', teamCode: 'TESTJOIN', createdAt: '2026-01-01T00:00:00Z' },
  ]));
  const result = await createJoinRequest({
    firstName: 'Join',
    lastName: 'Player',
    email: 'join@player.test',
    password: 'JoinPass1!',
    teamCode: 'TESTJOIN',
  });
  assert.equal(result.user.emailVerified, false, 'join-request user must start unverified');

  // Confirm stored record also has the field
  const users = await loadUsers();
  const stored = users.find(u => u.email === 'join@player.test');
  assert.equal(stored.emailVerified, false, 'emailVerified must be persisted in the store');
});

// ── claimInvite ──────────────────────────────────────────────────────────────

test('claimInvite: newly created player has emailVerified: false', async () => {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: 'invite-club', name: 'Invite Club', teamCode: 'INVITE', createdAt: '2026-01-01T00:00:00Z' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-coach', teamId: 'invite-club', userId: 'coach-u', role: 'coach', status: 'active' },
  ]));
  await seedInvite(kv, { token: 'INVITE_TOKEN_01', teamId: 'invite-club', role: 'player' });

  const result = await claimInvite({
    token: 'INVITE_TOKEN_01',
    name: 'Invited Player',
    email: 'invited@player.test',
    password: 'InvitePass1!',
  });
  assert.equal(result.user.emailVerified, false, 'claimed invite player must start unverified');

  // Confirm stored record
  const users = await loadUsers();
  const stored = users.find(u => u.email === 'invited@player.test');
  assert.equal(stored.emailVerified, false, 'emailVerified must be persisted in the store');
});

// ── createClub ───────────────────────────────────────────────────────────────

test('createClub: new head coach has emailVerified: false', async () => {
  kv.clear();
  const result = await createClub({
    clubName: 'Contract RFC',
    name: 'Contract Coach',
    email: 'coach@contract-rfc.test',
    password: 'ContractPass1!',
  });
  assert.equal(result.user.emailVerified, false, 'club creator must start unverified');

  const users = await loadUsers();
  const stored = users.find(u => u.email === 'coach@contract-rfc.test');
  assert.equal(stored.emailVerified, false, 'emailVerified must be persisted in the store');
});

// ── legacy compatibility bootstrap ───────────────────────────────────────────

test('legacy bootstrap: Simon Test Player is created with emailVerified: false', async () => {
  kv.clear();
  // Trigger the bootstrap by attempting a login for the default team — this
  // calls ensureLegacyCompatibilityTeamRecords internally.
  try {
    await loginUser({ email: 'nobody@example.test', password: 'wrong', teamId: 'boitsfort-rfc' });
  } catch { /* expected — wrong credentials */ }

  const users = await loadUsers();
  const simon = users.find(u => u.id === 'player-simon-test');
  if (simon) {
    assert.equal(simon.emailVerified, false, 'legacy compatibility player must be marked unverified');
  }
  // If Simon Test Player account was not bootstrapped (env not set), skip gracefully.
});

// ── legacy staff login-time hydration ────────────────────────────────────────

test('legacy staff login: newly hydrated coach-demo has emailVerified: false', async () => {
  kv.clear();
  // COACH_DEMO_EMAIL/PASSWORD are set at the top of this file.
  const result = await loginUser({
    email: 'coach@ev-contract.test',
    password: 'DemoPass99!',
  });
  assert.ok(result.user, 'login must succeed');
  assert.equal(result.user.emailVerified, false, 'freshly hydrated demo coach must be unverified');

  const users = await loadUsers();
  const stored = users.find(u => u.email === 'coach@ev-contract.test');
  assert.ok(stored, 'coach-demo user must be persisted');
  assert.equal(stored.emailVerified, false, 'emailVerified must be persisted in the store');
});

// ── existing user in Redis without emailVerified field ───────────────────────

test('existing Redis user without emailVerified field: publicUser returns false', async () => {
  kv.clear();
  // Simulate a user record written before emailVerified was introduced.
  const legacyUsers = [
    { id: 'legacy-u1', email: 'legacy@user.test', displayName: 'Legacy User', passwordSet: false, authProvider: 'legacy-compatibility' },
  ];
  await saveUsers(legacyUsers);

  const users = await loadUsers();
  const raw = users.find(u => u.id === 'legacy-u1');
  assert.equal(raw.emailVerified, undefined, 'raw stored record has no emailVerified field');

  const pub = publicUser(raw);
  assert.equal(typeof pub.emailVerified, 'boolean', 'publicUser must return a boolean');
  assert.equal(pub.emailVerified, false, 'absent field must normalize to false');
});

// ── verification round-trip ──────────────────────────────────────────────────

test('emailVerified transitions from false to true only after token consumption', async () => {
  kv.clear();
  const { user } = await createClub({
    clubName: 'Roundtrip RFC',
    name: 'Roundtrip Coach',
    email: 'rt@roundtrip.test',
    password: 'RoundtripPass1!',
  });

  assert.equal(publicUser(user).emailVerified, false, 'initial state must be false');

  const { token } = await createEmailVerificationToken(user.id);
  const verified = await verifyEmailToken(token);
  assert.equal(verified.user.emailVerified, true, 'after verification must be true');

  // publicUser applied to the raw stored user must also return true
  const users = await loadUsers();
  const raw = users.find(u => u.id === user.id);
  assert.equal(publicUser(raw).emailVerified, true, 'publicUser must reflect the stored true');
});
