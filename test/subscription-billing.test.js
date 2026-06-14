/**
 * Subscription / billing — Phase 1: team record billing fields.
 *
 * Verifies:
 *  1. New club has plan: 'trial', planStatus: 'active', future trialEndsAt
 *  2. New club has stripeCustomerId: null, stripeSubscriptionId: null
 *  3. resolveSession() returns teamPlan, teamPlanStatus, trialEndsAt
 *  4. Expired trial auto-downgrades to plan: 'core' on session resolve
 *  5. Expired trial downgrade is persisted back to Redis (idempotent)
 *  6. Pro club is not downgraded even if trialEndsAt is past
 *  7. Legacy team without plan fields resolves safely (defaults to 'trial')
 *  8. Vercel function count remains 12
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.billing-phase1.test';
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

const {
  createClub,
  resolveSession,
  loadTeams,
  saveTeams,
} = await import('../api/_identityStore.js');

const COACH = {
  clubName: 'Billing Test RFC',
  teamName: 'Seniors',
  sport: 'Rugby',
  name: 'Billing Coach',
  email: 'coach@billing-test.test',
  password: 'BillingPass1!',
};

// ── 1. New club has plan: 'trial', planStatus: 'active', future trialEndsAt ──

test('new club has plan: trial and planStatus: active', async () => {
  kv.clear();
  const { team } = await createClub(COACH);
  assert.equal(team.plan, 'trial', 'plan must be trial');
  assert.equal(team.planStatus, 'active', 'planStatus must be active');
});

test('new club trialEndsAt is ~30 days in the future', async () => {
  kv.clear();
  const { team } = await createClub(COACH);
  assert.ok(team.trialEndsAt, 'trialEndsAt must be set');
  const trialMs = new Date(team.trialEndsAt).getTime();
  const nowMs = Date.now();
  const diffDays = (trialMs - nowMs) / (1000 * 60 * 60 * 24);
  assert.ok(diffDays > 29 && diffDays < 31, `trialEndsAt should be ~30 days out, got ${diffDays.toFixed(2)}`);
});

// ── 2. Stripe IDs start null ──────────────────────────────────────────────────

test('new club has stripeCustomerId: null and stripeSubscriptionId: null', async () => {
  kv.clear();
  const { team } = await createClub(COACH);
  assert.equal(team.stripeCustomerId, null, 'stripeCustomerId must be null');
  assert.equal(team.stripeSubscriptionId, null, 'stripeSubscriptionId must be null');
});

// ── 3. resolveSession() returns plan fields ───────────────────────────────────

test('resolveSession returns teamPlan, teamPlanStatus, trialEndsAt', async () => {
  kv.clear();
  const { session } = await createClub(COACH);
  const ctx = await resolveSession(session.token);
  assert.ok(ctx, 'session must resolve');
  assert.equal(ctx.teamPlan, 'trial', 'teamPlan must be trial on new club');
  assert.equal(ctx.teamPlanStatus, 'active', 'teamPlanStatus must be active');
  assert.ok(ctx.trialEndsAt, 'trialEndsAt must be in session response');
});

// ── 4. Expired trial auto-downgrades to core ─────────────────────────────────

test('expired trial auto-downgrades to plan: core on session resolve', async () => {
  kv.clear();
  const { session, team } = await createClub(COACH);

  // Backdate the trialEndsAt to simulate expiry
  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  stored.trialEndsAt = new Date(Date.now() - 1000).toISOString(); // 1 second ago
  await saveTeams(teams);

  const ctx = await resolveSession(session.token);
  assert.equal(ctx.teamPlan, 'core', 'expired trial must downgrade to core');
  assert.equal(ctx.teamPlanStatus, 'active', 'planStatus must remain active after downgrade');
});

// ── 5. Downgrade is persisted (idempotent) ────────────────────────────────────

test('trial downgrade is written back to Redis (persisted)', async () => {
  kv.clear();
  const { session, team } = await createClub(COACH);

  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  stored.trialEndsAt = new Date(Date.now() - 1000).toISOString();
  await saveTeams(teams);

  // First resolve — triggers the downgrade write
  await resolveSession(session.token);

  // Read teams directly from Redis to confirm persistence
  const teamsAfter = await loadTeams();
  const teamAfter = teamsAfter.find(t => t.id === team.id);
  assert.equal(teamAfter.plan, 'core', 'plan must be persisted as core in Redis after downgrade');
});

// ── 6. Pro club is not downgraded ────────────────────────────────────────────

test('pro club with past trialEndsAt is not downgraded', async () => {
  kv.clear();
  const { session, team } = await createClub(COACH);

  // Set to pro with a past trialEndsAt
  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  stored.plan = 'pro';
  stored.planStatus = 'active';
  stored.stripeCustomerId = 'cus_test123';
  stored.stripeSubscriptionId = 'sub_test123';
  stored.trialEndsAt = new Date(Date.now() - 1000).toISOString();
  await saveTeams(teams);

  const ctx = await resolveSession(session.token);
  assert.equal(ctx.teamPlan, 'pro', 'pro club must not be downgraded');
  assert.equal(ctx.teamPlanStatus, 'active', 'planStatus must remain active');
});

// ── 7. Legacy team without plan fields resolves safely ───────────────────────

test('legacy team without plan fields defaults to trial in session response', async () => {
  kv.clear();
  const { session, team } = await createClub(COACH);

  // Strip billing fields to simulate a team created before Phase 1
  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  delete stored.plan;
  delete stored.planStatus;
  delete stored.trialEndsAt;
  delete stored.stripeCustomerId;
  delete stored.stripeSubscriptionId;
  await saveTeams(teams);

  const ctx = await resolveSession(session.token);
  assert.ok(ctx, 'session must still resolve for legacy team');
  assert.equal(ctx.teamPlan, 'trial', 'missing plan field defaults to trial');
  assert.equal(ctx.teamPlanStatus, 'active', 'missing planStatus defaults to active');
  assert.equal(ctx.trialEndsAt, null, 'missing trialEndsAt returns null (no auto-downgrade)');
});

// ── 8. Vercel function count remains 12 ──────────────────────────────────────

test('Vercel function count remains 12', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(new URL('../api', import.meta.url));
  const publicFunctions = files.filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.equal(publicFunctions.length, 12, `Expected 12 api functions, found: ${publicFunctions.join(', ')}`);
});
