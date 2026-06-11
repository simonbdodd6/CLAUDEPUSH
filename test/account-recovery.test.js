/**
 * Production account recovery tests — CRON_SECRET-gated coach reset.
 *
 *  1. admin_account_status confirms exactly which coach email exists
 *     (and gives masked hints for near-miss emails)
 *  2. admin_reset_coach resets an existing coach to a temporary password,
 *     revokes every live session, and the coach can log in with it
 *  3. Recovery actions without the secret → 401 (and no state change)
 *  4. Recovery cannot be used on player accounts → 403
 *  5. Invalid password still fails with 'Invalid email or password'
 *  6. The rate-limit message states the wait time clearly
 *  7. Stale sessions (old devices) are dead after a reset — server-side
 *     cleanup behind the frontend "clear this device" path
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.account-recovery.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';
process.env.CRON_SECRET             = 'test-cron-secret';

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

const { default: identityHandler } = await import('../api/identity.js');
const { createSession, loginUser, resolveSession, SESSION_COOKIE } = await import('../api/_identityStore.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

async function call(body, headers = {}) {
  const res = buildRes();
  await identityHandler({ method: 'POST', query: {}, headers, body }, res);
  return res;
}

const ADMIN_HEADERS = { authorization: `Bearer ${process.env.CRON_SECRET}` };

function seedCoach(email = 'coach.recovery@test.club') {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  users.push({
    id: 'coach-recovery', email, firstName: 'Recovery', lastName: 'Coach',
    displayName: 'Recovery Coach', authProvider: 'password', passwordSet: true,
    // Deliberately unusable hash — simulates forgotten/drifted credentials
    passwordAlgo: 'scrypt', passwordSalt: 'aa', passwordHash: 'bb',
  });
  kv.set('app:identity:users', JSON.stringify(users));
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.push({ id: 'tm_coach-recovery', teamId: 'boitsfort-rfc', userId: 'coach-recovery', role: 'coach', status: 'active' });
  kv.set('app:identity:team_members', JSON.stringify(members));
}

function seedPlayer(email = 'player.recovery@test.club') {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  users.push({ id: 'player-recovery', email, displayName: 'Recovery Player', passwordSet: true, passwordAlgo: 'scrypt', passwordSalt: 'aa', passwordHash: 'bb' });
  kv.set('app:identity:users', JSON.stringify(users));
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.push({ id: 'tm_player-recovery', teamId: 'boitsfort-rfc', userId: 'player-recovery', role: 'player', status: 'active' });
  kv.set('app:identity:team_members', JSON.stringify(members));
}

// ─── 1. Account status confirms the exact email ──────────────────────────────

test('admin_account_status confirms the exact coach email and hints on near-misses', async () => {
  kv.clear();
  seedCoach('coach.recovery@test.club');

  const exact = await call({ action: 'admin_account_status', email: 'coach.recovery@test.club' }, ADMIN_HEADERS);
  assert.equal(exact.statusCode, 200);
  assert.equal(exact.body.exists, true);
  assert.equal(exact.body.email, 'coach.recovery@test.club');
  assert.equal(exact.body.passwordSet, true);
  assert.equal(exact.body.memberships[0].role, 'coach');

  // Near-miss email (extra character) → not found, masked staff hint provided
  const miss = await call({ action: 'admin_account_status', email: 'coach.recovery1@test.club' }, ADMIN_HEADERS);
  assert.equal(miss.body.exists, false);
  assert.equal(miss.body.staffAccountHints.length, 1);
  assert.match(miss.body.staffAccountHints[0], /^coa…@test\.club$/);
});

// ─── 2. Reset + login-after-reset ────────────────────────────────────────────

test('admin_reset_coach issues a temporary password, revokes sessions, and the coach logs in with it', async () => {
  kv.clear();
  seedCoach();

  // The coach has two live sessions (laptop + phone)
  const laptop = await createSession({ userId: 'coach-recovery', teamId: 'boitsfort-rfc', role: 'coach' });
  const phone  = await createSession({ userId: 'coach-recovery', teamId: 'boitsfort-rfc', role: 'coach' });

  // Old (drifted) password fails — the locked-out state
  await assert.rejects(
    loginUser({ email: 'coach.recovery@test.club', password: 'forgotten-pass' }),
    /Invalid email or password/,
  );

  const reset = await call({ action: 'admin_reset_coach', email: 'coach.recovery@test.club' }, ADMIN_HEADERS);
  assert.equal(reset.statusCode, 200);
  assert.equal(reset.body.email, 'coach.recovery@test.club');
  assert.equal(reset.body.sessionsRevoked, 2, 'both stale device sessions revoked');
  assert.ok(reset.body.temporaryPassword?.length >= 8, 'temporary password returned once');

  // Stale device sessions are dead (req: stale local cleanup, server side)
  assert.equal(await resolveSession(laptop.token), null);
  assert.equal(await resolveSession(phone.token), null);

  // Successful login after reset
  const login = await loginUser({ email: 'coach.recovery@test.club', password: reset.body.temporaryPassword });
  assert.equal(login.user.id, 'coach-recovery');
  assert.equal(login.user.role, 'coach');
});

test('admin_reset_coach accepts an explicit new password and does not echo it back', async () => {
  kv.clear();
  seedCoach();
  const reset = await call({ action: 'admin_reset_coach', email: 'coach.recovery@test.club', newPassword: 'MyChosenPass99' }, ADMIN_HEADERS);
  assert.equal(reset.statusCode, 200);
  assert.equal(reset.body.temporaryPassword, undefined, 'explicit password must not be echoed');
  const login = await loginUser({ email: 'coach.recovery@test.club', password: 'MyChosenPass99' });
  assert.equal(login.user.id, 'coach-recovery');
});

// ─── 3. Secret required ──────────────────────────────────────────────────────

test('recovery actions without the secret are rejected and change nothing', async () => {
  kv.clear();
  seedCoach();

  for (const headers of [{}, { authorization: 'Bearer wrong-secret' }]) {
    const status = await call({ action: 'admin_account_status', email: 'coach.recovery@test.club' }, headers);
    assert.equal(status.statusCode, 401);
    const reset = await call({ action: 'admin_reset_coach', email: 'coach.recovery@test.club' }, headers);
    assert.equal(reset.statusCode, 401);
  }
  const user = JSON.parse(kv.get('app:identity:users')).find(u => u.id === 'coach-recovery');
  assert.equal(user.passwordHash, 'bb', 'password untouched by unauthorized attempts');
});

// ─── 4. Player accounts cannot be reset through this path ────────────────────

test('admin_reset_coach refuses non-staff accounts', async () => {
  kv.clear();
  seedPlayer();
  const res = await call({ action: 'admin_reset_coach', email: 'player.recovery@test.club' }, ADMIN_HEADERS);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /not an active staff account/i);
});

// ─── 5. Invalid password unchanged ───────────────────────────────────────────

test('wrong password still fails with the standard error', async () => {
  kv.clear();
  seedCoach();
  await assert.rejects(
    loginUser({ email: 'coach.recovery@test.club', password: 'definitely-wrong' }),
    /Invalid email or password/,
  );
});

// ─── 6. Rate limit message is clear ──────────────────────────────────────────

test('rate-limit message states the wait time and suggests checking the email', async () => {
  kv.clear();
  seedCoach();

  // Burn through the 5-attempt login budget from one "device"
  const headers = { 'x-forwarded-for': '203.0.113.7' };
  let lastBody = null;
  for (let i = 0; i < 6; i++) {
    const res = await call({ action: 'login', email: 'coach.recovery@test.club', password: 'wrong-pass' }, headers);
    lastBody = res.body;
    if (i < 5) assert.match(res.body.error, /Invalid email or password/);
  }
  assert.match(lastBody.error, /Too many attempts/);
  assert.match(lastBody.error, /Wait \d+ minutes?/, 'message must state how long to wait');
  assert.match(lastBody.error, /email/i, 'message must point at the most common cause');
});
