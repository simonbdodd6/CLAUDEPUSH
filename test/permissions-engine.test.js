/**
 * Identity & Permissions engine tests.
 *
 * Single source of truth: api/_permissions.js. Route code never checks role
 * names — only permissions. These tests pin:
 *
 *  1. Matrix invariants — legacy parity: head coach + admin retain every
 *     ability the old ['coach','admin'] gates granted; assistants lack staff
 *     management; managers lack publishing; players hold no club permissions
 *  2. canonicalRole mapping incl. legacy coach + staffLevel records
 *  3. New roles hit real endpoints with exactly their permissions:
 *     S&C can publish training but not squads; analyst can read reports but
 *     not send push; manager can invite players but not staff
 *  4. Session payload carries computed permissions + memberships
 *  5. switch_team: re-scopes without logout, old token dies, data is the
 *     target team's; non-membership switch → 403
 *  6. AI contract: can() is the same gate an AI surface must use — players
 *     and guests are denied ai_intelligence, staff are not
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.permissions.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

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
  if (command === 'EXPIRE' || command === 'LPUSH' || command === 'LTRIM' || command === 'SCAN') result = command === 'SCAN' ? ['0', []] : 1;
  return { ok: true, json: async () => ({ result }) };
};

const { PERM, ROLE_PERMISSIONS, permissionsFor, canonicalRole, can } = await import('../api/_permissions.js');
const { default: publishHandler } = await import('../api/publish.js');
const { default: inviteHandler } = await import('../api/invite.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const { default: pushHandler } = await import('../api/push.js');
const { default: identityHandler } = await import('../api/identity.js');
const { createSession, resolveSession, SESSION_COOKIE } = await import('../api/_identityStore.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

async function seedMember(id, role, teamId = 'boitsfort-rfc', extra = {}) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email: `${id}@perm.test`, displayName: id });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.push({ id: `tm_${id}_${teamId}`, teamId, userId: id, role, status: 'active', ...extra });
  kv.set('app:identity:team_members', JSON.stringify(members));
  const session = await createSession({ userId: id, teamId, role });
  return { token: session.token, cookie: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` } };
}

// ─── 1. Matrix invariants ────────────────────────────────────────────────────

test('legacy parity: head coach and admin retain every old coach/admin ability', async () => {
  const legacyAbilities = [
    PERM.MANAGE_PLAYERS, PERM.MANAGE_TEAMS, PERM.MANAGE_COACHES,
    PERM.PUBLISH_TRAINING, PERM.PUBLISH_SQUADS, PERM.MESSAGING,
    PERM.REPORTS, PERM.CLUB_EXPORTS, PERM.DANGER_ZONE,
  ];
  for (const ability of legacyAbilities) {
    assert.ok(ROLE_PERMISSIONS.head_coach.includes(ability), `head_coach must keep ${ability}`);
    assert.ok(ROLE_PERMISSIONS.admin.includes(ability), `admin must keep ${ability}`);
  }
  // Assistants keep day-to-day coaching but NOT staff management
  assert.ok(ROLE_PERMISSIONS.assistant.includes(PERM.PUBLISH_SQUADS));
  assert.ok(!ROLE_PERMISSIONS.assistant.includes(PERM.MANAGE_COACHES));
  // Managers organise, they don't select or publish
  assert.ok(ROLE_PERMISSIONS.manager.includes(PERM.MANAGE_PLAYERS));
  assert.ok(!ROLE_PERMISSIONS.manager.includes(PERM.PUBLISH_SQUADS));
  // Players, parents, guests hold no club permissions
  assert.equal(ROLE_PERMISSIONS.player.length, 0);
  assert.equal(ROLE_PERMISSIONS.parent.length, 0);
  assert.equal(ROLE_PERMISSIONS.guest.length, 0);
});

// ─── 2. canonicalRole mapping ────────────────────────────────────────────────

test('canonicalRole maps legacy records onto the role catalogue', () => {
  assert.equal(canonicalRole({ role: 'coach' }), 'head_coach', 'legacy coach with no level = head');
  assert.equal(canonicalRole({ role: 'coach', staffLevel: 'head' }), 'head_coach');
  assert.equal(canonicalRole({ role: 'coach', staffLevel: 'assistant' }), 'assistant');
  assert.equal(canonicalRole({ role: 'coach', staffLevel: 'manager' }), 'manager');
  assert.equal(canonicalRole({ role: 'admin' }), 'admin');
  assert.equal(canonicalRole({ role: 'medical' }), 'medical');
  assert.equal(canonicalRole({ role: 'player' }), 'player');
  assert.equal(canonicalRole({ role: 'snc' }), 'snc');
  assert.equal(canonicalRole({ role: 'made-up-role' }), 'guest', 'unknown roles get guest (no permissions)');
  assert.equal(permissionsFor({ role: 'coach', status: 'removed' }).size, 0, 'inactive members hold nothing');
});

// ─── 3. New roles against real endpoints ─────────────────────────────────────

test('S&C coach can publish training but not squads', async () => {
  kv.clear();
  const snc = await seedMember('snc-1', 'snc');

  const training = buildRes();
  await publishHandler({ method: 'POST', query: {}, headers: snc.cookie,
    body: { type: 'sessions', data: [{ id: 'tue', title: 'Conditioning', type: 'Training' }] } }, training);
  assert.equal(training.statusCode, 200, 'S&C publishes training plans');

  const squad = buildRes();
  await publishHandler({ method: 'POST', query: {}, headers: snc.cookie,
    body: { type: 'squad', data: { published: true, opposition: 'X', formationNames: {}, benchPlayers: [] } } }, squad);
  assert.equal(squad.statusCode, 403, 'S&C must not publish squads');
});

test('analyst can read the availability board but cannot send push', async () => {
  kv.clear();
  const analyst = await seedMember('analyst-1', 'analyst');

  const board = buildRes();
  await availabilityHandler({ method: 'GET', query: { sessionId: 'tue' }, headers: analyst.cookie, body: {} }, board);
  assert.equal(board.statusCode, 200, 'analyst reads reports');

  const push = buildRes();
  await pushHandler({ method: 'POST', headers: analyst.cookie, body: { title: 'X', body: 'Hello' } }, push);
  assert.equal(push.statusCode, 403, 'analyst must not message the squad');
});

test('team manager can invite players but not staff', async () => {
  kv.clear();
  const manager = await seedMember('mgr-1', 'coach', 'boitsfort-rfc', { staffLevel: 'manager' });

  const player = buildRes();
  await inviteHandler({ method: 'POST', query: {}, headers: { ...manager.cookie, host: 'perm.test' },
    body: { name: 'New Player', role: 'player', sendEmail: false } }, player);
  assert.equal(player.statusCode, 201, 'manager invites players');

  const staff = buildRes();
  await inviteHandler({ method: 'POST', query: {}, headers: { ...manager.cookie, host: 'perm.test' },
    body: { name: 'New Coach', role: 'coach', staffLevel: 'assistant', sendEmail: false } }, staff);
  assert.equal(staff.statusCode, 403, 'manager must not invite staff');
});

// ─── 4. Session payload ──────────────────────────────────────────────────────

test('session payload carries computed permissions and memberships', async () => {
  kv.clear();
  const coach = await seedMember('multi-coach', 'coach', 'boitsfort-rfc', { staffLevel: 'head' });
  // Second membership: assistant of another team
  const members = JSON.parse(kv.get('app:identity:team_members'));
  members.push({ id: 'tm_multi2', teamId: 'u16-team', userId: 'multi-coach', role: 'coach', staffLevel: 'assistant', status: 'active' });
  kv.set('app:identity:team_members', JSON.stringify(members));
  kv.set('app:identity:teams', JSON.stringify([
    { id: 'boitsfort-rfc', name: 'Boitsfort RFC', teamCode: 'B1' },
    { id: 'u16-team', name: 'Boitsfort U16', teamCode: 'B2' },
  ]));

  const ctx = await resolveSession(coach.token);
  assert.ok(ctx.permissions.includes(PERM.PUBLISH_SQUADS));
  assert.ok(ctx.permissions.includes(PERM.MANAGE_COACHES), 'head in current team');
  assert.equal(ctx.memberships.length, 2);
  assert.equal(ctx.memberships.find(m => m.teamId === 'u16-team').canonicalRole, 'assistant');
  assert.equal(ctx.memberships.find(m => m.current).teamId, 'boitsfort-rfc');
});

// ─── 5. switch_team ──────────────────────────────────────────────────────────

test('switch_team re-scopes the session without logout; old token dies; non-member 403', async () => {
  kv.clear();
  const coach = await seedMember('switcher', 'coach', 'club-a', { staffLevel: 'head' });
  const members = JSON.parse(kv.get('app:identity:team_members'));
  members.push({ id: 'tm_sw2', teamId: 'club-b', userId: 'switcher', role: 'coach', staffLevel: 'head', status: 'active' });
  kv.set('app:identity:team_members', JSON.stringify(members));
  kv.set('app:identity:teams', JSON.stringify([{ id: 'club-a', name: 'Club A' }, { id: 'club-b', name: 'Club B' }]));
  kv.set('app:club:club-a', JSON.stringify({ clubName: 'Club A' }));
  kv.set('app:club:club-b', JSON.stringify({ clubName: 'Club B' }));

  const res = buildRes();
  await identityHandler({ method: 'POST', query: {}, headers: coach.cookie, body: { action: 'switch_team', teamId: 'club-b' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.teamId, 'club-b');
  const newToken = decodeURIComponent((res.headers['Set-Cookie'] || '').match(/ce_session=([^;]+)/)[1]);

  // Old token revoked, new token scoped to club-b
  assert.equal(await resolveSession(coach.token), null, 'old session must die on switch');
  const ctx = await resolveSession(newToken);
  assert.equal(ctx.session.teamId, 'club-b');

  // Club config now reads club B, not club A (tenant isolation across the switch)
  const cfg = buildRes();
  await publishHandler({ method: 'GET', query: { resource: 'club' }, headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(newToken)}` }, body: {} }, cfg);
  assert.equal(cfg.body.club.clubName, 'Club B');

  // Switching to a team without membership → 403
  const bad = buildRes();
  await identityHandler({ method: 'POST', query: {}, headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(newToken)}` }, body: { action: 'switch_team', teamId: 'rival-club' } }, bad);
  assert.equal(bad.statusCode, 403);
});

// ─── 6. AI contract ──────────────────────────────────────────────────────────

test('AI surfaces use the same gate: can(ctx, ai_intelligence)', async () => {
  kv.clear();
  const head = await seedMember('ai-head', 'coach', 'boitsfort-rfc', { staffLevel: 'head' });
  const player = await seedMember('ai-player', 'player');
  const headCtx = await resolveSession(head.token);
  const playerCtx = await resolveSession(player.token);
  assert.equal(can(headCtx, PERM.AI_INTELLIGENCE), true);
  assert.equal(can(playerCtx, PERM.AI_INTELLIGENCE), false, 'the AI Brain must refuse to act for identities without the permission');
  assert.equal(can({}, PERM.AI_INTELLIGENCE), false, 'no identity, no AI');
});
