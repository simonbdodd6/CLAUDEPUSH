/**
 * Stripe Phase 3.5 — Subscription permission alignment.
 *
 * Verifies that MANAGE_SUBSCRIPTIONS is held by the right roles after
 * adding it to head_coach:
 *
 *  1. head_coach (club creator) has MANAGE_SUBSCRIPTIONS
 *  2. admin has MANAGE_SUBSCRIPTIONS (unchanged)
 *  3. owner has MANAGE_SUBSCRIPTIONS (unchanged, via ALL_PERMISSIONS)
 *  4. assistant coach does NOT have MANAGE_SUBSCRIPTIONS
 *  5. player does NOT have MANAGE_SUBSCRIPTIONS
 *  6. A freshly-created club creator can call create_checkout (was 403, now 200)
 *  7. A player on the same team cannot call create_checkout (403)
 *  8. An admin member can still call create_checkout (200, unchanged)
 *  9. create_billing_portal works for the club creator (200)
 * 10. Vercel function count remains 12
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.sub-perms.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

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

const { PERM, ROLE_PERMISSIONS, canonicalRole, permissionsFor } = await import('../api/_permissions.js');
const { default: identityHandler } = await import('../api/identity.js');
const {
  createClub,
  createSession,
  loadTeamMembers,
  saveTeamMembers,
  SESSION_COOKIE,
} = await import('../api/_identityStore.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

function cookieHeader(token) {
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` };
}

async function callIdentity(action, token) {
  const res = buildRes();
  await identityHandler({
    method: 'POST', query: {},
    headers: { 'x-forwarded-for': '198.51.100.1', ...cookieHeader(token) },
    body: { action },
  }, res);
  return res;
}

// ── 1–5. Static permission matrix checks ─────────────────────────────────────

test('head_coach has MANAGE_SUBSCRIPTIONS', () => {
  assert.ok(
    ROLE_PERMISSIONS.head_coach.includes(PERM.MANAGE_SUBSCRIPTIONS),
    'head_coach must include MANAGE_SUBSCRIPTIONS',
  );
});

test('admin has MANAGE_SUBSCRIPTIONS (unchanged)', () => {
  assert.ok(ROLE_PERMISSIONS.admin.includes(PERM.MANAGE_SUBSCRIPTIONS));
});

test('owner has MANAGE_SUBSCRIPTIONS via ALL_PERMISSIONS (unchanged)', () => {
  assert.ok(ROLE_PERMISSIONS.owner.includes(PERM.MANAGE_SUBSCRIPTIONS));
});

test('assistant does NOT have MANAGE_SUBSCRIPTIONS', () => {
  assert.equal(ROLE_PERMISSIONS.assistant.includes(PERM.MANAGE_SUBSCRIPTIONS), false);
});

test('player does NOT have MANAGE_SUBSCRIPTIONS', () => {
  assert.equal(ROLE_PERMISSIONS.player.includes(PERM.MANAGE_SUBSCRIPTIONS), false);
});

// ── 6. Club creator (head_coach) can call create_checkout ────────────────────

test('club creator (role:coach, staffLevel:head) can call create_checkout → 200', async () => {
  kv.clear();
  // createClub sets role:'coach', staffLevel:'head' → canonicalRole 'head_coach'
  const { session } = await createClub({
    clubName: 'Head Coach Checkout RFC',
    name: 'Head Coach',
    email: 'headcoach@checkout.test',
    password: 'HeadCoachPass1!',
  });
  const res = await callIdentity('create_checkout', session.token);
  assert.equal(
    res.statusCode, 200,
    `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`,
  );
  assert.equal(res.body.ok, true);
  assert.ok('checkoutUrl' in res.body, 'checkoutUrl must be present');
});

// ── 7. Player on same team cannot call create_checkout ───────────────────────

test('player cannot call create_checkout → 403', async () => {
  kv.clear();
  const { team } = await createClub({
    clubName: 'Player Permission RFC',
    name: 'The Coach',
    email: 'coach@playerperm.test',
    password: 'CoachPass1!',
  });
  // Add a player member and create their session.
  const playerClub = await createClub({
    clubName: 'Player Scratch',
    name: 'Test Player',
    email: 'player@playerperm.test',
    password: 'PlayerPass1!',
  });
  const members = await loadTeamMembers();
  members.push({
    id: 'tm-test-player',
    teamId: team.id,
    userId: playerClub.user.id,
    role: 'player',
    status: 'active',
    joinedAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedBy: 'test',
    rejectedAt: null,
    rejectedBy: null,
  });
  await saveTeamMembers(members);
  const playerSession = await createSession({ userId: playerClub.user.id, teamId: team.id, role: 'player' });

  const res = await callIdentity('create_checkout', playerSession.token);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.ok, false);
});

// ── 8. Admin still works unchanged ───────────────────────────────────────────

test('admin member can still call create_checkout → 200 (unchanged behaviour)', async () => {
  kv.clear();
  const { team } = await createClub({
    clubName: 'Admin Permission RFC',
    name: 'The Admin',
    email: 'admin@adminperm.test',
    password: 'AdminPass1!',
  });
  const adminClub = await createClub({
    clubName: 'Admin Scratch',
    name: 'Test Admin',
    email: 'admin2@adminperm.test',
    password: 'AdminPass1!',
  });
  const members = await loadTeamMembers();
  members.push({
    id: 'tm-test-admin',
    teamId: team.id,
    userId: adminClub.user.id,
    role: 'admin',
    status: 'active',
    joinedAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedBy: 'test',
    rejectedAt: null,
    rejectedBy: null,
  });
  await saveTeamMembers(members);
  const adminSession = await createSession({ userId: adminClub.user.id, teamId: team.id, role: 'admin' });

  const res = await callIdentity('create_checkout', adminSession.token);
  assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true);
});

// ── 9. create_billing_portal works for club creator ──────────────────────────

test('club creator can call create_billing_portal → 200', async () => {
  kv.clear();
  const { session } = await createClub({
    clubName: 'Portal RFC',
    name: 'Portal Coach',
    email: 'coach@portal.test',
    password: 'PortalPass1!',
  });
  const res = await callIdentity('create_billing_portal', session.token);
  assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true);
  assert.ok('portalUrl' in res.body);
});

// ── 10. Vercel function count remains 12 ─────────────────────────────────────

test('Vercel function count remains 12', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(new URL('../api', import.meta.url));
  const publicFunctions = files.filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.equal(publicFunctions.length, 12, `Expected 12 api functions, found: ${publicFunctions.join(', ')}`);
});
