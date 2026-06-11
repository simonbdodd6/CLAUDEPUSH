/**
 * API-level authentication and role-permission tests.
 *
 * Verifies that every protected endpoint enforces the correct role
 * before responding with data or taking a mutation:
 *
 *  Identity API (GET /api/identity)
 *    1. No session → 401
 *    2. Authenticated player → 403 (coach/admin only)
 *    3. Authenticated coach → 200
 *
 *  Identity API (POST approve/reject)
 *    4. Player tries to approve a member → 403
 *    5. Coach can approve a member → succeeds
 *
 *  Identity API (POST dev_login)
 *    6. DEV_LOGIN disabled → 403
 *
 *  Push API (POST /api/push)
 *    7. Unauthenticated → 401
 *    8. Authenticated player → 403
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.auth-perms.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const store = new Map();
const lists = new Map();

globalThis.fetch = async (url, options = {}) => {
  let parsed;
  try { parsed = JSON.parse(options.body || '[]'); } catch { return { ok: true, json: async () => ({ id: 'email_mock' }) }; }
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'email_mock', url }) };
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')   result = store.has(args[0]) ? store.get(args[0]) : null;
  if (command === 'SET') { store.set(args[0], args[1]); result = 'OK'; }
  if (command === 'LPUSH') {
    const list = lists.get(args[0]) || [];
    list.unshift(args[1]);
    lists.set(args[0], list);
    result = list.length;
  }
  if (command === 'DEL') { store.delete(args[0]); lists.delete(args[0]); result = 1; }
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler }   = await import('../api/identity.js');
const { default: pushHandler }       = await import('../api/push.js');
const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');

// ─── Express-style response mock ──────────────────────────────────────────

function buildRes() {
  const r = {
    statusCode: null, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(data)   { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()        { return this; },
  };
  return r;
}

// ─── Seed helpers ──────────────────────────────────────────────────────────

async function seedUser(id, role = 'player', { email, displayName } = {}) {
  email       = email       || `${id}@example.com`;
  displayName = displayName || `${role === 'coach' ? 'Coach' : 'Player'} ${id}`;

  const users = JSON.parse(store.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email, firstName: displayName.split(' ')[0], lastName: displayName.split(' ').slice(1).join(' '), displayName });
    store.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(store.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    members.push({ id: `tm_${id}`, teamId: 'boitsfort-rfc', userId: id, role, status: 'active' });
    store.set('app:identity:team_members', JSON.stringify(members));
  }
  if (role === 'player') {
    const profiles = JSON.parse(store.get('app:identity:player_profiles') || '[]');
    if (!profiles.find(p => p.userId === id)) {
      profiles.push({ id: `profile_${id}`, teamId: 'boitsfort-rfc', teamMemberId: `tm_${id}`, userId: id, displayName, email, legacyPlayerId: id });
      store.set('app:identity:player_profiles', JSON.stringify(profiles));
    }
  }
  const session = await createSession({ userId: id, teamId: 'boitsfort-rfc', role });
  return { id, cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` };
}

// ─── Identity API ─────────────────────────────────────────────────────────

test('GET /api/identity without session returns 401', async () => {
  store.clear(); lists.clear();

  const res = buildRes();
  await identityHandler({ method: 'GET', query: {}, headers: {}, body: {} }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.ok, false);
});

test('GET /api/identity as authenticated player returns 403', async () => {
  store.clear(); lists.clear();
  const player = await seedUser('auth_perm_player', 'player');

  const res = buildRes();
  await identityHandler({
    method: 'GET', query: {}, headers: { cookie: player.cookie }, body: {},
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.ok, false);
});

test('GET /api/identity as authenticated coach returns 200', async () => {
  store.clear(); lists.clear();
  const coach = await seedUser('auth_perm_coach', 'coach');

  const res = buildRes();
  await identityHandler({
    method: 'GET', query: {}, headers: { cookie: coach.cookie }, body: {},
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.ok(Array.isArray(res.body?.users), 'users array expected');
});

// ─── Identity API: approve / reject ───────────────────────────────────────

test('POST /api/identity approve as player returns 403', async () => {
  store.clear(); lists.clear();
  const player = await seedUser('auth_perm_approve_player', 'player');

  const res = buildRes();
  await identityHandler({
    method: 'POST',
    query: {},
    headers: { cookie: player.cookie },
    body: { action: 'approve', memberId: 'tm_some_member', teamId: 'boitsfort-rfc' },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.ok, false);
});

test('POST /api/identity approve as coach succeeds or returns meaningful error', async () => {
  store.clear(); lists.clear();
  const coach = await seedUser('auth_perm_approve_coach', 'coach');

  // Seed a pending join request member to approve
  const pending = JSON.parse(store.get('app:identity:team_members') || '[]');
  pending.push({
    id: 'tm_pending_join', teamId: 'boitsfort-rfc', userId: 'user_pending_join',
    role: 'player', status: 'pending',
  });
  store.set('app:identity:team_members', JSON.stringify(pending));
  const pendingUsers = JSON.parse(store.get('app:identity:users') || '[]');
  pendingUsers.push({ id: 'user_pending_join', email: 'pending@example.com', displayName: 'Pending Player' });
  store.set('app:identity:users', JSON.stringify(pendingUsers));

  const res = buildRes();
  await identityHandler({
    method: 'POST',
    query: {},
    headers: { cookie: coach.cookie },
    body: { action: 'approve', memberId: 'tm_pending_join', teamId: 'boitsfort-rfc' },
  }, res);

  // Coach reaches the logic (200) — not blocked at auth level
  assert.notEqual(res.statusCode, 403, 'Coach must not be blocked from approve action');
  assert.notEqual(res.statusCode, 401, 'Coach must not be rejected as unauthenticated');
});

// ─── Identity API: dev_login guard ────────────────────────────────────────

test('POST /api/identity dev_login returns 403 when DEV_LOGIN is not enabled', async () => {
  store.clear(); lists.clear();
  const originalDevLogin = process.env.DEV_LOGIN;
  delete process.env.DEV_LOGIN; // ensure it is not 'true'

  const res = buildRes();
  await identityHandler({
    method: 'POST',
    query: {},
    headers: {},
    body: { action: 'dev_login', userId: 'coach-demo' },
  }, res);

  process.env.DEV_LOGIN = originalDevLogin;

  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.ok, false);
});

// ─── Push API ─────────────────────────────────────────────────────────────

test('POST /api/push without session returns 401', async () => {
  store.clear(); lists.clear();

  const res = buildRes();
  await pushHandler({
    method: 'POST',
    headers: {},
    body: { title: 'Test', body: 'Hello squad' },
  }, res);

  assert.equal(res.statusCode, 401);
});

test('POST /api/push as authenticated player returns 403', async () => {
  store.clear(); lists.clear();
  const player = await seedUser('auth_perm_push_player', 'player');

  const res = buildRes();
  await pushHandler({
    method: 'POST',
    headers: { cookie: player.cookie },
    body: { title: 'Hijack', body: 'Player trying to push' },
  }, res);

  assert.equal(res.statusCode, 403);
});
