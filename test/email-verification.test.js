/**
 * Email verification — token lifecycle tests.
 *
 * Verifies:
 *  1. createEmailVerificationToken() creates a token for unverified users
 *  2. verifyEmailToken() marks the user as emailVerified
 *  3. Expired tokens are rejected (410)
 *  4. Invalid/tampered tokens are rejected (410)
 *  5. Used tokens cannot be reused (410)
 *  6. Already-verified users get alreadyVerified=true, no new token
 *  7. Existing login/session flow is unaffected (no emailVerified gate)
 *  8. api/identity.js function count remains 12
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.email-verification.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  return { ok: true, json: async () => ({ result }) };
};

const {
  createClub,
  createEmailVerificationToken,
  verifyEmailToken,
  loadUsers,
  loginUser,
  createSession,
} = await import('../api/_identityStore.js');

function freshStore() {
  kv.clear();
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function makeCoach(suffix = '') {
  freshStore();
  return createClub({
    clubName: `Test Club ${suffix}`,
    name: `Test Coach ${suffix}`,
    email: `coach${suffix}@verify.test`,
    password: 'Password1!',
  });
}

// ── tests ────────────────────────────────────────────────────────────────────

test('createEmailVerificationToken returns a token for an unverified user', async () => {
  const { user } = await makeCoach('A');
  const result = await createEmailVerificationToken(user.id);
  assert.ok(result.token, 'token must be present');
  assert.ok(result.expiresAt, 'expiresAt must be set');
  assert.equal(result.alreadyVerified, false);
  assert.equal(result.user.id, user.id);
});

test('verifyEmailToken marks the user emailVerified=true', async () => {
  const { user } = await makeCoach('B');
  const { token } = await createEmailVerificationToken(user.id);
  const result = await verifyEmailToken(token);
  assert.equal(result.user.emailVerified, true, 'emailVerified must be true after verification');
  assert.ok(result.user.emailVerifiedAt, 'emailVerifiedAt must be set');
  assert.ok(result.verification.usedAt, 'token usedAt must be stamped');

  // Persist check: reload from store
  const users = await loadUsers();
  const stored = users.find(u => u.id === user.id);
  assert.equal(stored.emailVerified, true, 'emailVerified must be persisted in the store');
});

test('expired token is rejected with 410', async () => {
  const { user } = await makeCoach('C');
  const { token } = await createEmailVerificationToken(user.id);

  // Backdate the stored verification record to simulate expiry
  const verKey = 'app:identity:email_verifications';
  const stored = JSON.parse(kv.get(verKey) || '[]');
  for (const v of stored) v.expiresAt = new Date(Date.now() - 1000).toISOString();
  kv.set(verKey, JSON.stringify(stored));

  await assert.rejects(
    () => verifyEmailToken(token),
    err => {
      assert.equal(err.status, 410);
      assert.match(err.message, /invalid or expired/i);
      return true;
    },
  );
});

test('tampered/unknown token is rejected with 410', async () => {
  await makeCoach('D');
  await assert.rejects(
    () => verifyEmailToken('completely-invalid-token-xyz'),
    err => {
      assert.equal(err.status, 410);
      return true;
    },
  );
});

test('used token cannot be reused', async () => {
  const { user } = await makeCoach('E');
  const { token } = await createEmailVerificationToken(user.id);
  await verifyEmailToken(token);
  // Second call with the same token must fail
  await assert.rejects(
    () => verifyEmailToken(token),
    err => {
      assert.equal(err.status, 410);
      return true;
    },
  );
});

test('empty token string throws 400', async () => {
  await makeCoach('F');
  await assert.rejects(
    () => verifyEmailToken(''),
    err => {
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test('already-verified user returns alreadyVerified=true without a new token', async () => {
  const { user } = await makeCoach('G');
  const { token } = await createEmailVerificationToken(user.id);
  await verifyEmailToken(token);

  // Second call to createEmailVerificationToken should short-circuit
  const result = await createEmailVerificationToken(user.id);
  assert.equal(result.alreadyVerified, true);
  assert.equal(result.token, null, 'no token should be issued when already verified');
});

test('login and session work normally for an unverified user', async () => {
  const { user, team } = await makeCoach('H');
  // User was just created — emailVerified is unset (falsy). Login must still succeed.
  const loginResult = await loginUser({
    email: `coachH@verify.test`,
    password: 'Password1!',
    teamId: team.id,
  });
  assert.ok(loginResult.session?.token, 'session token must be issued for unverified user');
  assert.equal(loginResult.user.id, user.id);
});

test('login and session work normally for a verified user', async () => {
  const { user, team } = await makeCoach('I');
  const { token } = await createEmailVerificationToken(user.id);
  await verifyEmailToken(token);
  const loginResult = await loginUser({
    email: `coachI@verify.test`,
    password: 'Password1!',
    teamId: team.id,
  });
  assert.ok(loginResult.session?.token, 'session token must be issued for verified user');
  assert.equal(loginResult.user.emailVerified, true);
});

test('createEmailVerificationToken rejects unknown userId with 404', async () => {
  freshStore();
  await assert.rejects(
    () => createEmailVerificationToken('user-does-not-exist'),
    err => {
      assert.equal(err.status, 404);
      return true;
    },
  );
});

test('Vercel function count remains 12', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(new URL('../api', import.meta.url));
  const publicFunctions = files.filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.equal(publicFunctions.length, 12, `Expected 12 api functions, found: ${publicFunctions.join(', ')}`);
});
