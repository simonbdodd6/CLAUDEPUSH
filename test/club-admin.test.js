/**
 * Club Administration regression tests.
 *
 * Member management (/api/identity POST):
 *  1. Coach removes a player → member status 'removed', sessions revoked,
 *     player can no longer call authenticated APIs
 *  2. Coach archives a player → status 'archived', restorable
 *  3. restore_member brings an archived player back to active
 *  4. Coach cannot remove themselves
 *  5. The last head coach cannot be removed or demoted
 *  6. Players cannot call any admin action
 *  7. Cross-team: coach B cannot remove/archive coach A's members
 *
 * Staff levels:
 *  8. set_staff_level changes assistant ↔ manager ↔ head
 *  9. An assistant coach cannot remove staff or change staff levels
 *     (head-coach-only), but still has normal coach powers
 * 10. Staff invite carries staffLevel through claim → member.staffLevel
 *
 * Invites (/api/invite):
 * 11. resend re-sends the email for a pending invite and stamps emailSentAt
 * 12. resend refuses accepted invites and invites without email
 * 13. Cross-team: coach B cannot resend/revoke coach A's invites
 *
 * Club config fixtures:
 * 14. Fixture list round-trips through club config, junk stripped
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.club-admin.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();
const sentEmails = [];

globalThis.fetch = async (url, options = {}) => {
  let parsed;
  try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) {
    sentEmails.push(parsed || {});
    return { ok: true, json: async () => ({ id: 'email_mock' }) };
  }
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'INCR') { const n = Number(kv.get(args[0]) || 0) + 1; kv.set(args[0], String(n)); result = n; }
  if (command === 'EXPIRE' || command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');
const { default: inviteHandler } = await import('../api/invite.js');
const { default: publishHandler } = await import('../api/publish.js');
const { claimInvite, createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

async function seedMember(id, role, teamId, { staffLevel = null } = {}) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email: `${id}@admin.test`, firstName: id, lastName: 'User', displayName: id });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    members.push({ id: `tm_${id}`, teamId, userId: id, role, status: 'active', ...(staffLevel ? { staffLevel } : {}) });
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
  const session = await createSession({ userId: id, teamId, role });
  return { memberId: `tm_${id}`, cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` };
}

async function identityCall(body, headers) {
  const res = buildRes();
  await identityHandler({ method: 'POST', query: {}, headers: headers || {}, body }, res);
  return res;
}

async function identityGet(headers) {
  const res = buildRes();
  await identityHandler({ method: 'GET', query: {}, headers: headers || {}, body: {} }, res);
  return res;
}

function memberById(memberId) {
  return JSON.parse(kv.get('app:identity:team_members') || '[]').find(m => m.id === memberId);
}

const TEAM_A = 'boitsfort-rfc';
const TEAM_B = 'rival-club';

// ─── 1. Remove player ────────────────────────────────────────────────────────

test('coach removes a player — status removed, live sessions revoked', async () => {
  kv.clear();
  const coach  = await seedMember('adm-coach-1', 'coach', TEAM_A);
  const player = await seedMember('adm-player-1', 'player', TEAM_A);

  // Player session works before removal
  const before = await identityGet({ cookie: player.cookie });
  assert.equal(before.statusCode, 403, 'player has a live session (403 = authenticated but not coach)');

  const res = await identityCall({ action: 'remove_member', memberId: player.memberId }, { cookie: coach.cookie });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.teamMember.status, 'removed');

  // The player's session no longer authenticates
  const after = await identityGet({ cookie: player.cookie });
  assert.equal(after.statusCode, 401, 'removed player session must be revoked');
  assert.equal(memberById(player.memberId).status, 'removed');
});

// ─── 2 + 3. Archive and restore ──────────────────────────────────────────────

test('coach archives a player and restores them later', async () => {
  kv.clear();
  const coach  = await seedMember('adm-coach-2', 'coach', TEAM_A);
  const player = await seedMember('adm-player-2', 'player', TEAM_A);

  const archive = await identityCall({ action: 'archive_member', memberId: player.memberId }, { cookie: coach.cookie });
  assert.equal(archive.statusCode, 200);
  assert.equal(archive.body.teamMember.status, 'archived');

  const restore = await identityCall({ action: 'restore_member', memberId: player.memberId }, { cookie: coach.cookie });
  assert.equal(restore.statusCode, 200);
  assert.equal(restore.body.teamMember.status, 'active');
});

// ─── 4 + 5. Self-removal and last-head-coach guards ──────────────────────────

test('coach cannot remove themselves; last head coach cannot be removed or demoted', async () => {
  kv.clear();
  const coach = await seedMember('adm-coach-3', 'coach', TEAM_A);

  const selfRemove = await identityCall({ action: 'remove_member', memberId: coach.memberId }, { cookie: coach.cookie });
  assert.equal(selfRemove.statusCode, 400);
  assert.match(selfRemove.body.error, /cannot remove yourself/i);

  // A second head coach trying to remove the only OTHER head also fails when
  // it would leave zero heads — here coach-3 is the only head, so even another
  // admin path cannot demote them.
  const demote = await identityCall({ action: 'set_staff_level', memberId: coach.memberId, staffLevel: 'assistant' }, { cookie: coach.cookie });
  assert.equal(demote.statusCode, 400);
  assert.match(demote.body.error, /last head coach/i);
});

// ─── 6. Players cannot administrate ──────────────────────────────────────────

test('players cannot call any admin action', async () => {
  kv.clear();
  await seedMember('adm-coach-4', 'coach', TEAM_A);
  const player = await seedMember('adm-player-4', 'player', TEAM_A);
  const victim = await seedMember('adm-player-4b', 'player', TEAM_A);

  for (const action of ['remove_member', 'archive_member', 'restore_member', 'set_staff_level']) {
    const res = await identityCall({ action, memberId: victim.memberId, staffLevel: 'manager' }, { cookie: player.cookie });
    assert.equal(res.statusCode, 403, `${action} must be blocked for players`);
  }
  assert.equal(memberById(victim.memberId).status, 'active');
});

// ─── 7. Cross-team isolation ─────────────────────────────────────────────────

test('coach B cannot remove or archive coach A members', async () => {
  kv.clear();
  await seedMember('adm-coach-a', 'coach', TEAM_A);
  const coachB  = await seedMember('adm-coach-b', 'coach', TEAM_B);
  const playerA = await seedMember('adm-player-a', 'player', TEAM_A);

  for (const action of ['remove_member', 'archive_member']) {
    const res = await identityCall({ action, memberId: playerA.memberId }, { cookie: coachB.cookie });
    assert.equal(res.statusCode, 403, `${action} across teams must be 403`);
  }
  assert.equal(memberById(playerA.memberId).status, 'active', 'team A player untouched');
});

// ─── 8 + 9. Staff levels ─────────────────────────────────────────────────────

test('head coach sets staff levels; assistants cannot manage staff but keep coach powers', async () => {
  kv.clear();
  const head      = await seedMember('adm-head', 'coach', TEAM_A, { staffLevel: 'head' });
  const assistant = await seedMember('adm-assist', 'coach', TEAM_A, { staffLevel: 'assistant' });
  const player    = await seedMember('adm-player-9', 'player', TEAM_A);

  // Head changes assistant → manager
  const change = await identityCall({ action: 'set_staff_level', memberId: assistant.memberId, staffLevel: 'manager' }, { cookie: head.cookie });
  assert.equal(change.statusCode, 200);
  assert.equal(change.body.teamMember.staffLevel, 'manager');

  // Manager/assistant cannot change staff levels or remove staff
  const blockedLevel = await identityCall({ action: 'set_staff_level', memberId: head.memberId, staffLevel: 'assistant' }, { cookie: assistant.cookie });
  assert.equal(blockedLevel.statusCode, 403);
  const blockedRemove = await identityCall({ action: 'remove_member', memberId: head.memberId }, { cookie: assistant.cookie });
  assert.equal(blockedRemove.statusCode, 403);

  // But an assistant still has normal coach powers (e.g. removing a player)
  const playerRemove = await identityCall({ action: 'remove_member', memberId: player.memberId }, { cookie: assistant.cookie });
  assert.equal(playerRemove.statusCode, 200, 'assistant keeps day-to-day coach powers');
});

// ─── 10. Staff invite carries the permission level ───────────────────────────

test('staff invite with staffLevel lands on the claimed member record', async () => {
  kv.clear();
  const head = await seedMember('adm-head-10', 'coach', TEAM_A, { staffLevel: 'head' });

  const createRes = buildRes();
  await inviteHandler({
    method: 'POST', query: {},
    headers: { cookie: head.cookie, host: 'admin.test' },
    body: { name: 'New Assistant', role: 'coach', staffLevel: 'assistant', email: '', sendEmail: false },
  }, createRes);
  assert.equal(createRes.statusCode, 201);
  assert.equal(createRes.body.invite.staffLevel, 'assistant');

  const claim = await claimInvite({
    token: createRes.body.token,
    email: 'new.assistant@admin.test',
    password: 'password123',
    name: 'New Assistant',
  });
  assert.equal(claim.teamMember.role, 'coach');
  assert.equal(claim.teamMember.staffLevel, 'assistant');
  assert.equal(claim.teamMember.teamId, TEAM_A);

  // staffLevel rejected on player invites
  const badRes = buildRes();
  await inviteHandler({
    method: 'POST', query: {},
    headers: { cookie: head.cookie, host: 'admin.test' },
    body: { name: 'Sneaky Player', role: 'player', staffLevel: 'head' },
  }, badRes);
  assert.equal(badRes.statusCode, 400);
});

// ─── 11 + 12. Re-send invitation ─────────────────────────────────────────────

test('resend re-sends pending invite email; refuses accepted or email-less invites', async () => {
  kv.clear();
  sentEmails.length = 0;
  process.env.RESEND_API_KEY = 're_test_key';
  const coach = await seedMember('adm-coach-11', 'coach', TEAM_A);

  kv.set('ce:invites', JSON.stringify([
    { token: 'resend-ok-tok',   name: 'Resend Me',  role: 'player', status: 'pending',  email: 'resend@admin.test', teamId: TEAM_A },
    { token: 'resend-done-tok', name: 'Already In', role: 'player', status: 'accepted', email: 'done@admin.test',   teamId: TEAM_A },
    { token: 'resend-noemail',  name: 'No Email',   role: 'player', status: 'pending',  email: '',                  teamId: TEAM_A },
  ]));

  const ok = buildRes();
  await inviteHandler({ method: 'PATCH', query: {}, headers: { cookie: coach.cookie, host: 'admin.test' },
    body: { token: 'resend-ok-tok', action: 'resend' } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.body.invite.emailSentAt, 'emailSentAt must be stamped');
  assert.ok(sentEmails.length > 0, 'an email must actually be sent');

  const done = buildRes();
  await inviteHandler({ method: 'PATCH', query: {}, headers: { cookie: coach.cookie, host: 'admin.test' },
    body: { token: 'resend-done-tok', action: 'resend' } }, done);
  assert.equal(done.statusCode, 400);

  const noEmail = buildRes();
  await inviteHandler({ method: 'PATCH', query: {}, headers: { cookie: coach.cookie, host: 'admin.test' },
    body: { token: 'resend-noemail', action: 'resend' } }, noEmail);
  assert.equal(noEmail.statusCode, 400);
  delete process.env.RESEND_API_KEY;
});

// ─── 13. Cross-team invite administration ────────────────────────────────────

test('coach B cannot resend or revoke coach A invites', async () => {
  kv.clear();
  await seedMember('adm-coach-a13', 'coach', TEAM_A);
  const coachB = await seedMember('adm-coach-b13', 'coach', TEAM_B);

  kv.set('ce:invites', JSON.stringify([
    { token: 'team-a-invite', name: 'Team A Player', role: 'player', status: 'pending', email: 'a@admin.test', teamId: TEAM_A },
  ]));

  const resend = buildRes();
  await inviteHandler({ method: 'PATCH', query: {}, headers: { cookie: coachB.cookie, host: 'admin.test' },
    body: { token: 'team-a-invite', action: 'resend' } }, resend);
  assert.equal(resend.statusCode, 403);

  const revoke = buildRes();
  await inviteHandler({ method: 'DELETE', query: {}, headers: { cookie: coachB.cookie, host: 'admin.test' },
    body: { token: 'team-a-invite' } }, revoke);
  assert.equal(revoke.statusCode, 403);

  const invites = JSON.parse(kv.get('ce:invites'));
  assert.equal(invites[0].status, 'pending', 'team A invite untouched');
});

// ─── 14. Fixture list round-trips through club config ────────────────────────

test('fixture list round-trips through club config with junk stripped', async () => {
  kv.clear();
  const coach = await seedMember('adm-coach-14', 'coach', TEAM_A);

  const post = buildRes();
  await publishHandler({
    method: 'POST', query: { resource: 'club' },
    headers: { cookie: coach.cookie },
    body: { club: {
      clubName: 'Fixture Club',
      fixtures: [
        { id: 'fx1', opposition: 'France U20', date: '2026-07-04', time: '15:00', venue: 'Stade Fallon', homeAway: 'away', evil: 'x' },
        { opposition: '', date: '2026-07-11' },              // no opposition → dropped
        { opposition: 'Wales U20', time: 'not-a-time' },     // bad time → blanked
      ],
    } },
  }, post);
  assert.equal(post.statusCode, 200);

  const get = buildRes();
  await publishHandler({ method: 'GET', query: { resource: 'club' }, headers: { cookie: coach.cookie }, body: {} }, get);
  const fixtures = get.body.club.fixtures;
  assert.equal(fixtures.length, 2);
  assert.equal(fixtures[0].opposition, 'France U20');
  assert.equal(fixtures[0].homeAway, 'away');
  assert.equal(fixtures[0].evil, undefined);
  assert.equal(fixtures[1].opposition, 'Wales U20');
  assert.equal(fixtures[1].time, '');
});
