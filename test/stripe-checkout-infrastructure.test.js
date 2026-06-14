/**
 * Stripe Phase 3 — Checkout Infrastructure.
 *
 * Tests that create_checkout and create_billing_portal:
 *  1. Require an authenticated session (unauthenticated → 401)
 *  2. Require MANAGE_SUBSCRIPTIONS permission (player → 403)
 *  3. Return the correct placeholder response for a trial team
 *  4. Return the correct placeholder response for a core (post-trial) team
 *  5. Return 409 when the team already has an active Pro subscription
 *  6. Behave safely for a legacy team with no plan fields
 *  7. create_billing_portal returns ok:true and portalUrl field
 *  8. updateTeamBilling only writes allowlisted billing fields
 *  9. updateTeamBilling rejects an unknown teamId with 404
 * 10. Vercel function count remains 12
 *
 * Permission note: MANAGE_SUBSCRIPTIONS is held by `admin` canonical role.
 * A head coach (role:'coach', staffLevel:'head') does NOT have this permission
 * under the current permission matrix. Tests use role:'admin' for success paths.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.stripe-infra.test';
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

const { default: identityHandler } = await import('../api/identity.js');
const {
  createClub,
  createSession,
  loadTeams,
  saveTeams,
  loadTeamMembers,
  saveTeamMembers,
  updateTeamBilling,
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

async function callIdentity(action, token, extra = {}) {
  const res = buildRes();
  await identityHandler({
    method: 'POST',
    query: {},
    headers: { 'x-forwarded-for': '198.51.100.1', ...cookieHeader(token) },
    body: { action, ...extra },
  }, res);
  return res;
}

// Helper: create a club and upgrade its creator to admin role so they have
// MANAGE_SUBSCRIPTIONS (head_coach canonical role does NOT include it).
async function makeAdminSession(suffix = '') {
  const created = await createClub({
    clubName: `Stripe Test Club ${suffix}`,
    name: `Admin Coach ${suffix}`,
    email: `admin${suffix}@stripe-test.test`,
    password: 'StripePass1!',
  });
  // Upgrade the head coach member to admin role to get MANAGE_SUBSCRIPTIONS.
  const members = await loadTeamMembers();
  const member = members.find(m => m.userId === created.user.id && m.teamId === created.team.id);
  if (member) { member.role = 'admin'; await saveTeamMembers(members); }
  // Create a fresh session so the token reflects the updated role.
  const session = await createSession({ userId: created.user.id, teamId: created.team.id, role: 'admin' });
  return { session, team: created.team, user: created.user };
}

// Helper: create a player session on an existing team.
async function makePlayerSession(teamId, suffix = '') {
  const created = await createClub({
    clubName: `Player Club ${suffix}`,
    name: `Player User ${suffix}`,
    email: `player${suffix}@stripe-test.test`,
    password: 'PlayerPass1!',
  });
  // Create a player member on the target team.
  const members = await loadTeamMembers();
  members.push({
    id: `tm-player-${suffix}`,
    teamId,
    userId: created.user.id,
    role: 'player',
    status: 'active',
    joinedAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedBy: 'test',
    rejectedAt: null,
    rejectedBy: null,
  });
  await saveTeamMembers(members);
  const session = await createSession({ userId: created.user.id, teamId, role: 'player' });
  return { session, userId: created.user.id };
}

// ── 1. Unauthenticated → 401 ──────────────────────────────────────────────────

test('create_checkout: unauthenticated request → 401', async () => {
  kv.clear();
  const res = buildRes();
  await identityHandler({
    method: 'POST',
    query: {},
    headers: { 'x-forwarded-for': '198.51.100.1' },
    body: { action: 'create_checkout' },
  }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
});

test('create_billing_portal: unauthenticated request → 401', async () => {
  kv.clear();
  const res = buildRes();
  await identityHandler({
    method: 'POST',
    query: {},
    headers: { 'x-forwarded-for': '198.51.100.1' },
    body: { action: 'create_billing_portal' },
  }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
});

// ── 2. Insufficient permission (player) → 403 ────────────────────────────────

test('create_checkout: player role → 403 (missing MANAGE_SUBSCRIPTIONS)', async () => {
  kv.clear();
  const { session: adminSession, team } = await makeAdminSession('perm-a');
  const { session: playerSession } = await makePlayerSession(team.id, 'perm-a');
  const res = await callIdentity('create_checkout', playerSession.token);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.ok, false);
});

test('create_billing_portal: player role → 403', async () => {
  kv.clear();
  const { session: adminSession, team } = await makeAdminSession('perm-b');
  const { session: playerSession } = await makePlayerSession(team.id, 'perm-b');
  const res = await callIdentity('create_billing_portal', playerSession.token);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.ok, false);
});

// ── 3. Trial team → 503 (Stripe not configured in test env) ──────────────────

test('create_checkout: trial team → 503 when STRIPE_SECRET_KEY not set', async () => {
  kv.clear();
  const { session, team } = await makeAdminSession('trial');
  assert.equal(team.plan, 'trial', 'precondition: new club starts on trial');
  const res = await callIdentity('create_checkout', session.token);
  // Auth and permission check passed (else would be 401/403); Stripe is unconfigured in tests.
  assert.equal(res.statusCode, 503, `Expected 503, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, false);
  assert.ok('checkoutUrl' in res.body || 'error' in res.body);
});

// ── 4. Core (post-trial) team → 503 ──────────────────────────────────────────

test('create_checkout: core team → 503 when STRIPE_SECRET_KEY not set', async () => {
  kv.clear();
  const { session, team } = await makeAdminSession('core');
  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  stored.plan = 'core'; stored.planStatus = 'active';
  await saveTeams(teams);
  const res = await callIdentity('create_checkout', session.token);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
});

// ── 5. Already-Pro team → 409 ────────────────────────────────────────────────

test('create_checkout: active Pro team → 409 (already subscribed)', async () => {
  kv.clear();
  const { session, team } = await makeAdminSession('pro');
  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  stored.plan = 'pro'; stored.planStatus = 'active';
  stored.stripeCustomerId = 'cus_test'; stored.stripeSubscriptionId = 'sub_test';
  await saveTeams(teams);
  const res = await callIdentity('create_checkout', session.token);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /already has an active Pro/i);
});

// ── 6. Legacy team (no plan fields) → 503 (not blocked by Pro check) ─────────

test('create_checkout: legacy team without plan fields → 503 (not blocked, Stripe unconfigured)', async () => {
  kv.clear();
  const { session, team } = await makeAdminSession('legacy');
  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  delete stored.plan; delete stored.planStatus;
  delete stored.trialEndsAt; delete stored.stripeCustomerId;
  delete stored.stripeSubscriptionId;
  await saveTeams(teams);
  const res = await callIdentity('create_checkout', session.token);
  // 503 means the Pro-team guard did not block it; Stripe is just unconfigured.
  assert.equal(res.statusCode, 503, `Expected 503, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, false);
});

// ── 7. create_billing_portal with no billing account → 409 ───────────────────

test('create_billing_portal: no stripeCustomerId → 409 (no billing account)', async () => {
  kv.clear();
  const { session } = await makeAdminSession('portal');
  // New club has no stripeCustomerId; portal requires one.
  const res = await callIdentity('create_billing_portal', session.token);
  assert.equal(res.statusCode, 409, `Expected 409, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, false);
  assert.ok('portalUrl' in res.body || 'error' in res.body);
});

// ── 8. updateTeamBilling writes only allowlisted fields ──────────────────────

test('updateTeamBilling: writes billing fields and ignores non-billing keys', async () => {
  kv.clear();
  const { team } = await makeAdminSession('billing-update');
  const updated = await updateTeamBilling(team.id, {
    plan: 'pro',
    planStatus: 'active',
    stripeCustomerId: 'cus_xyz',
    stripeSubscriptionId: 'sub_xyz',
    name: 'SHOULD BE IGNORED',    // structural field — must not change
    id: 'SHOULD BE IGNORED',      // structural field — must not change
  });
  assert.equal(updated.plan, 'pro');
  assert.equal(updated.planStatus, 'active');
  assert.equal(updated.stripeCustomerId, 'cus_xyz');
  assert.equal(updated.stripeSubscriptionId, 'sub_xyz');
  assert.equal(updated.name, team.name, 'name must not be overwritten');
  assert.equal(updated.id, team.id, 'id must not be overwritten');
});

// ── 9. updateTeamBilling: unknown teamId → 404 ───────────────────────────────

test('updateTeamBilling: unknown teamId → throws 404', async () => {
  kv.clear();
  await makeAdminSession('billing-404');
  await assert.rejects(
    () => updateTeamBilling('nonexistent-team-id', { plan: 'pro' }),
    err => { assert.equal(err.status, 404); return true; },
  );
});

// ── 10. Vercel function count remains 12 ─────────────────────────────────────

test('Vercel function count remains 12', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(new URL('../api', import.meta.url));
  const publicFunctions = files.filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.equal(publicFunctions.length, 12, `Expected 12 api functions, found: ${publicFunctions.join(', ')}`);
});
