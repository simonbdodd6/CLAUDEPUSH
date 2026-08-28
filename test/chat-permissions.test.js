/**
 * Chat permission and access-control tests.
 *
 * Covers the boundaries enforced by sessionCanReadConversation /
 * sessionCanWriteConversation and requireConversationAccess:
 *
 *  1. Player → coach DM: message is sent, coach receives unread count
 *  2. Player messages persist across refresh until coach opens conversation
 *  3. Player can send to squad group channel
 *  4. Player blocked from writing to announcement channel (403)
 *  5. Player blocked from writing to coaching channel (403)
 *  6. Player blocked from reading coaching channel messages (403)
 *  7. Coaching channel is absent from player conversation list
 *  8. Player can edit their own message
 *  9. Player cannot edit a coach message (403)
 * 10. Player can delete their own message
 * 11. Player cannot delete a coach message (403)
 * 12. Unauthenticated send → 401
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.chat-perms.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv    = new Map();
const lists = new Map();

function rangeList(list, start, end) {
  const s = Number(start);
  const e = Number(end);
  const finalEnd = e < 0 ? list.length + e : e;
  return list.slice(s, finalEnd + 1);
}

globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'LPUSH') {
    const list = lists.get(args[0]) || [];
    list.unshift(args[1]);
    lists.set(args[0], list);
    result = list.length;
  }
  if (command === 'LRANGE') result = rangeList(lists.get(args[0]) || [], args[1], args[2]);
  if (command === 'LTRIM') {
    const list = lists.get(args[0]) || [];
    lists.set(args[0], rangeList(list, args[1], args[2]));
    result = 'OK';
  }
  if (command === 'DEL') { kv.delete(args[0]); lists.delete(args[0]); result = 1; }
  return { ok: true, json: async () => ({ result }) };
};

const { default: chatHandler }    = await import('../api/chat.js');
const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');
const { dmConvId }                = await import('../src/chat-state.js');

// ─── Request / response helpers ────────────────────────────────────────────

function buildReq(method, url, body = null, headers = {}) {
  return {
    method, url, headers,
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(JSON.stringify(body));
    },
  };
}

function buildRes() {
  return {
    statusCode: 0, headers: {}, body: '',
    setHeader(n, v)     { this.headers[n] = v; },
    writeHead(s, h = {}) { this.statusCode = s; this.headers = { ...this.headers, ...h }; },
    end(chunk = '')      { this.body = String(chunk || ''); },
  };
}

async function call(method, url, body = null, headers = {}) {
  const r = buildRes();
  await chatHandler(buildReq(method, url, body, headers), r);
  assert.equal(r.statusCode, 200, `Expected 200, got ${r.statusCode}: ${r.body}`);
  return JSON.parse(r.body);
}

async function callRaw(method, url, body = null, headers = {}) {
  const r = buildRes();
  await chatHandler(buildReq(method, url, body, headers), r);
  return r;
}

// ─── Seed helpers ──────────────────────────────────────────────────────────

async function seedPlayer(id, { displayName = 'Test Player', email = `${id}@example.com`, legacyPlayerId = null } = {}) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email, firstName: displayName.split(' ')[0], lastName: displayName.split(' ').slice(1).join(' '), displayName });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    members.push({ id: `tm_${id}`, teamId: 'boitsfort-rfc', userId: id, role: 'player', status: 'active' });
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
  const profiles = JSON.parse(kv.get('app:identity:player_profiles') || '[]');
  if (!profiles.find(p => p.userId === id)) {
    profiles.push({
      id: `profile_${id}`, teamId: 'boitsfort-rfc', teamMemberId: `tm_${id}`,
      userId: id, displayName, email, legacyPlayerId: legacyPlayerId || id,
    });
    kv.set('app:identity:player_profiles', JSON.stringify(profiles));
  }
  const session = await createSession({ userId: id, teamId: 'boitsfort-rfc', role: 'player' });
  return { id, headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` } };
}

async function seedCoach(id = 'coach-demo') {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email: `${id}@example.com`, firstName: 'Simon', lastName: 'Coach', displayName: 'Simon Coach' });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    members.push({ id: `tm-${id}`, teamId: 'boitsfort-rfc', userId: id, role: 'coach', status: 'active' });
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
  const session = await createSession({ userId: id, teamId: 'boitsfort-rfc', role: 'coach' });
  return { id, headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` } };
}

async function ensureDefaultChannels(coachHeaders) {
  await call('GET', '/api/chat?action=conversations', null, coachHeaders);
}

// ─── 1. Player → coach DM ─────────────────────────────────────────────────

test('player sends DM to coach and coach receives unread count', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_p2c_1', { displayName: 'P2C Player' });
  const coach  = await seedCoach();
  const convId = dmConvId(coach.id, player.id);

  await call('POST', '/api/chat', {
    action: 'create_conv', id: convId, name: 'P2C Player', type: 'DIRECT',
    participants: [coach.id, player.id],
  }, coach.headers);

  const sent = await call('POST', '/api/chat', {
    action: 'send', convId, text: 'Hi Coach, ready for Saturday',
  }, player.headers);

  assert.equal(sent.message.senderId,   player.id);
  assert.equal(sent.message.senderRole, 'player');
  assert.equal(sent.message.text,       'Hi Coach, ready for Saturday');

  const coachConvs = await call('GET', '/api/chat?action=conversations', null, coach.headers);
  const dm = coachConvs.conversations.find(c => c.id === convId);
  assert.ok(dm, `DM ${convId} not found in coach conversations`);
  assert.equal(dm.unread, 1);

  // Coach's own send should never count as unread for the coach
  await call('POST', '/api/chat', {
    action: 'send', convId, text: 'Got it, see you Saturday',
  }, coach.headers);
  const afterCoachSend = await call('GET', '/api/chat?action=conversations', null, coach.headers);
  assert.equal(afterCoachSend.conversations.find(c => c.id === convId).unread, 0);
});

// ─── 2. Unread persists across refresh ────────────────────────────────────

test('player messages persist as unread across coach refresh until read is marked', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_persist', { displayName: 'Persist Player' });
  const coach  = await seedCoach();
  const convId = dmConvId(coach.id, player.id);

  await call('POST', '/api/chat', {
    action: 'create_conv', id: convId, name: 'Persist Player', type: 'DIRECT',
    participants: [coach.id, player.id],
  }, coach.headers);

  await call('POST', '/api/chat', { action: 'send', convId, text: 'Ping 1' }, player.headers);
  await call('POST', '/api/chat', { action: 'send', convId, text: 'Ping 2' }, player.headers);

  for (let i = 0; i < 3; i++) {
    const d = await call('GET', '/api/chat?action=conversations', null, coach.headers);
    assert.equal(
      d.conversations.find(c => c.id === convId).unread, 2,
      `Refresh ${i + 1}: expected 2 unread`
    );
  }

  await call('POST', '/api/chat', { action: 'read', convId }, coach.headers);

  const cleared = await call('GET', '/api/chat?action=conversations', null, coach.headers);
  assert.equal(cleared.conversations.find(c => c.id === convId).unread, 0);
});

// ─── 3. Player can write to squad ─────────────────────────────────────────

test('player can send a message to the squad group channel', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_squad', { displayName: 'Squad Sender' });
  const coach  = await seedCoach();
  await ensureDefaultChannels(coach.headers);

  const r = await call('POST', '/api/chat', {
    action: 'send', convId: 'squad', text: 'Ready for Tuesday training!',
  }, player.headers);

  assert.equal(r.message.senderId, player.id);
  assert.equal(r.message.convId,   'squad');
});

// ─── 4. Player blocked from announce ──────────────────────────────────────

test('player cannot send a message to the announcement channel', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_no_announce', { displayName: 'No Announce Player' });
  const coach  = await seedCoach();
  await ensureDefaultChannels(coach.headers);

  const r = await callRaw('POST', '/api/chat', {
    action: 'send', convId: 'announce', text: 'Trying to broadcast',
  }, player.headers);

  assert.equal(r.statusCode, 403);
});

// ─── 5. Player blocked from writing to coaching ───────────────────────────

test('player cannot send a message to the coaching channel', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_no_coaching_write', { displayName: 'No Coaching Write' });
  const coach  = await seedCoach();
  await ensureDefaultChannels(coach.headers);

  const r = await callRaw('POST', '/api/chat', {
    action: 'send', convId: 'coaching', text: 'Trying to enter coaching channel',
  }, player.headers);

  assert.equal(r.statusCode, 403);
});

// ─── 6. Player blocked from reading coaching ──────────────────────────────

test('player cannot read messages from the coaching channel', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_no_coaching_read', { displayName: 'No Coaching Read' });
  const coach  = await seedCoach();
  await ensureDefaultChannels(coach.headers);

  const r = await callRaw('GET', '/api/chat?action=messages&convId=coaching', null, player.headers);

  assert.equal(r.statusCode, 403);
});

// ─── 7. Coaching channel hidden from player conversation list ─────────────

test('coaching channel is absent from player conversation list', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_conv_list', { displayName: 'List Player' });
  const coach  = await seedCoach();
  await ensureDefaultChannels(coach.headers);

  const d    = await call('GET', '/api/chat?action=conversations', null, player.headers);
  const ids  = d.conversations.map(c => c.id);

  assert.ok(!ids.includes('coaching'), `coaching must not appear for players, got: ${ids.join(', ')}`);
  assert.ok(ids.includes('squad'),    'squad must be visible to players');
  assert.ok(ids.includes('announce'), 'announce must be visible to players');
});

// ─── 8. Player edits own message ──────────────────────────────────────────

test('player can edit their own DM message', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_edit_own', { displayName: 'Edit Own' });
  const coach  = await seedCoach();
  const convId = dmConvId(coach.id, player.id);

  await call('POST', '/api/chat', {
    action: 'create_conv', id: convId, name: 'Edit Own', type: 'DIRECT',
    participants: [coach.id, player.id],
  }, coach.headers);

  const { message } = await call('POST', '/api/chat', {
    action: 'send', convId, text: 'Original text',
  }, player.headers);

  const edited = await call('POST', '/api/chat', {
    action: 'edit', convId, msgId: message.id, text: 'Edited text',
  }, player.headers);

  assert.equal(edited.message.text,     'Edited text');
  assert.equal(edited.message.isEdited, true);
});

// ─── 9. Player cannot edit coach message ──────────────────────────────────

test('player cannot edit a message sent by the coach', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_no_edit_coach', { displayName: 'No Edit Coach' });
  const coach  = await seedCoach();
  const convId = dmConvId(coach.id, player.id);

  await call('POST', '/api/chat', {
    action: 'create_conv', id: convId, name: 'No Edit Coach', type: 'DIRECT',
    participants: [coach.id, player.id],
  }, coach.headers);

  const { message } = await call('POST', '/api/chat', {
    action: 'send', convId, text: 'Coach message — do not touch',
  }, coach.headers);

  const r = await callRaw('POST', '/api/chat', {
    action: 'edit', convId, msgId: message.id, text: 'Tampered text',
  }, player.headers);

  assert.equal(r.statusCode, 403);
});

// ─── 10. Player deletes own message ───────────────────────────────────────

test('player can delete their own DM message', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_delete_own', { displayName: 'Delete Own' });
  const coach  = await seedCoach();
  const convId = dmConvId(coach.id, player.id);

  await call('POST', '/api/chat', {
    action: 'create_conv', id: convId, name: 'Delete Own', type: 'DIRECT',
    participants: [coach.id, player.id],
  }, coach.headers);

  const { message } = await call('POST', '/api/chat', {
    action: 'send', convId, text: 'To be deleted',
  }, player.headers);

  const r = await call('POST', '/api/chat', {
    action: 'delete', convId, msgId: message.id,
  }, player.headers);

  assert.ok(r.ok);
});

// ─── 11. Player cannot delete coach message ───────────────────────────────

test('player cannot delete a message sent by the coach', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_no_delete_coach', { displayName: 'No Delete Coach' });
  const coach  = await seedCoach();
  const convId = dmConvId(coach.id, player.id);

  await call('POST', '/api/chat', {
    action: 'create_conv', id: convId, name: 'No Delete Coach', type: 'DIRECT',
    participants: [coach.id, player.id],
  }, coach.headers);

  const { message } = await call('POST', '/api/chat', {
    action: 'send', convId, text: 'Coach note — cannot delete',
  }, coach.headers);

  const r = await callRaw('POST', '/api/chat', {
    action: 'delete', convId, msgId: message.id,
  }, player.headers);

  assert.equal(r.statusCode, 403);
});

// ─── 12. Unauthenticated request ──────────────────────────────────────────

test('unauthenticated send to squad channel returns 401', async () => {
  kv.clear(); lists.clear();
  const coach = await seedCoach();
  await ensureDefaultChannels(coach.headers);

  // Include senderId so the body passes the null-check and reaches auth enforcement
  const r = await callRaw('POST', '/api/chat', {
    action: 'send', convId: 'squad', senderId: 'anon', text: 'Sneaky message',
  }, {});

  assert.equal(r.statusCode, 401);
});

// ─── 13. GET conversations requires authentication ────────────────────────

test('GET conversations without session returns 401', async () => {
  kv.clear(); lists.clear();
  const r = await callRaw('GET', '/api/chat?action=conversations', null, {});
  assert.equal(r.statusCode, 401);
});

// ─── 14. Player DM creation permissions ──────────────────────────────────

test('player can create their own DM but not GROUP channels or third-party DMs', async () => {
  kv.clear(); lists.clear();
  const player = await seedPlayer('player_dm_create', { displayName: 'DM Create Player' });

  // Allowed: player creates their own DM
  const ownDm = await call('POST', '/api/chat', {
    action: 'create_conv',
    id: dmConvId(player.id, 'coach-demo'),
    name: 'DM Create Player',
    type: 'DIRECT',
    participants: [player.id, 'coach-demo'],
  }, player.headers);
  assert.ok(ownDm.convId, 'player should receive a convId for their own DM');

  // Blocked: player tries to create a GROUP channel
  const groupBlocked = await callRaw('POST', '/api/chat', {
    action: 'create_conv',
    id: 'fake-group-xyz',
    name: 'Fake Squad',
    type: 'GROUP',
    participants: [player.id],
  }, player.headers);
  assert.equal(groupBlocked.statusCode, 403);

  // Blocked: player creates a DM they are not part of
  const thirdPartyBlocked = await callRaw('POST', '/api/chat', {
    action: 'create_conv',
    id: dmConvId('coach-demo', 'other-player-xyz'),
    name: 'Other Player',
    type: 'DIRECT',
    participants: ['coach-demo', 'other-player-xyz'],
  }, player.headers);
  assert.equal(thirdPartyBlocked.statusCode, 403);
});

// ═══════════════════════════════════════════════════════════════════════════
// 13-22. PLAYER "NEW MESSAGE" — discovery, and the boundary around it.
//
// The server has always PERMITTED a player to create a direct conversation
// (create_conv restricts players to DMs rather than forbidding them), but gave
// them no way to learn WHO: GET /api/identity is gated on MANAGE_PLAYERS and
// group_recipients is staff-only. So a player's device had no staff in
// state.users, playerCoachParticipantId() returned '', the pre-seeded "Coach"
// contact carried an EMPTY id, and there was no New Message control either —
// a player could only ever hold a DM their coach had started first.
//
// dm_candidates is the missing half: a minimal, server-resolved answer to
// "who may I direct-message?". These tests pin what it must and must not give.
// ═══════════════════════════════════════════════════════════════════════════

async function seedStaff(id, role, displayName, { groups = null } = {}) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email: `${id}@example.com`, displayName });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    const m = { id: `tm-${id}`, teamId: 'boitsfort-rfc', userId: id, role, status: 'active' };
    if (groups) m.accessScope = { groupIds: groups };
    members.push(m);
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
  const session = await createSession({ userId: id, teamId: 'boitsfort-rfc', role });
  return { id, headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` } };
}

test('13. a player is told who they may message — and it is their staff', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedCoach();
  const medic  = await seedStaff('staff_medic_13', 'medical', 'Mo Medic');
  const player = await seedPlayer('player_dm_13', { displayName: 'Dana Player' });
  const other  = await seedPlayer('player_dm_13b', { displayName: 'Other Player' });

  const res = await call('GET', '/api/chat?action=dm_candidates', null, player.headers);
  const names = res.candidates.map(c => c.name).sort();
  assert.ok(names.includes('Simon Coach'), 'their coach is offered');
  assert.ok(names.includes('Mo Medic'), 'club medical staff too');
  // The whole point of the reported bug: without this the list was empty.
  assert.ok(res.candidates.length >= 2, 'a player is no longer told nothing');
  // A player is NOT handed the roster.
  assert.ok(!names.includes('Other Player'), 'another player is not a DM candidate');
  assert.ok(!names.includes('Dana Player'), 'and never themselves');
  assert.ok(!res.candidates.some(c => String(c.userId) === String(other.id)), 'by id either');
});

test('14. the candidate list is a thin projection — no contact details', async () => {
  kv.clear(); lists.clear();
  await seedCoach();
  const player = await seedPlayer('player_dm_14');
  const res = await call('GET', '/api/chat?action=dm_candidates', null, player.headers);
  assert.ok(res.candidates.length > 0);
  for (const c of res.candidates) {
    assert.deepEqual(Object.keys(c).sort(), ['name', 'role', 'userId'],
      'exactly id, name and role — a DM list must not become a staff contact harvest');
  }
  assert.ok(!JSON.stringify(res).includes('@'), 'no email address anywhere in the response');
  assert.ok(!/phone|password|token/i.test(JSON.stringify(res)), 'and nothing else personal');
});

test('15. discovery requires a session', async () => {
  kv.clear(); lists.clear();
  await seedCoach();
  const r = await callRaw('GET', '/api/chat?action=dm_candidates');
  assert.equal(r.statusCode, 401, 'anonymous callers learn nothing');
});

test('16. a player can create the DM they were offered, and send to it', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedCoach();
  const player = await seedPlayer('player_dm_16', { displayName: 'Pat Player' });
  const cands  = await call('GET', '/api/chat?action=dm_candidates', null, player.headers);
  const target = cands.candidates.find(c => c.role === 'coach');
  assert.ok(target, 'the coach is offered');

  const convId = dmConvId(player.id, target.userId);
  const created = await call('POST', '/api/chat', {
    action: 'create_conv', id: convId, name: target.name, type: 'DIRECT',
    participants: [player.id, target.userId],
  }, player.headers);
  assert.ok(created.ok !== false, 'the player creates the conversation themselves');

  await call('POST', '/api/chat', { action: 'send', convId, text: 'Hi coach' }, player.headers);
  const msgs = await call('GET', `/api/chat?action=messages&convId=${encodeURIComponent(convId)}&since=0`,
    null, player.headers);
  assert.ok(JSON.stringify(msgs).includes('Hi coach'), 'the first message lands');

  // And the coach receives it.
  const coachMsgs = await call('GET', `/api/chat?action=messages&convId=${encodeURIComponent(convId)}&since=0`,
    null, coach.headers);
  assert.ok(JSON.stringify(coachMsgs).includes('Hi coach'), 'the coach can read it');
});

test('17. creating the same DM twice does not duplicate it', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedCoach();
  const player = await seedPlayer('player_dm_17');
  const convId = dmConvId(player.id, coach.id);
  const body = { action: 'create_conv', id: convId, name: 'Coach', type: 'DIRECT',
                 participants: [player.id, coach.id] };
  await call('POST', '/api/chat', body, player.headers);
  await call('POST', '/api/chat', body, player.headers);
  const list = await call('GET', '/api/chat?action=conversations', null, player.headers);
  const dms = (list.conversations || []).filter(c => String(c.id) === convId);
  assert.equal(dms.length, 1, 'repeated taps yield one conversation, not two');
});

test('18. exposing the UI grants no new capability — a player still cannot create a group', async () => {
  kv.clear(); lists.clear();
  await seedCoach();
  const player = await seedPlayer('player_dm_18');
  const r = await callRaw('POST', '/api/chat', {
    action: 'create_conv', id: 'sneaky-group', name: 'Sneaky', type: 'GROUP',
    participants: [player.id],
  }, player.headers);
  assert.equal(r.statusCode, 403);
  assert.match(r.body, /Players can only create direct conversations/);
});

test('19. a player cannot fabricate a DM between two other people', async () => {
  kv.clear(); lists.clear();
  const coach = await seedCoach();
  const a = await seedPlayer('player_dm_19a');
  const b = await seedPlayer('player_dm_19b');
  const notMine = dmConvId(coach.id, b.id);
  const r = await callRaw('POST', '/api/chat', {
    action: 'create_conv', id: notMine, type: 'DIRECT', participants: [coach.id, b.id],
  }, a.headers);
  assert.equal(r.statusCode, 403, 'a DM must include its creator');
  assert.match(r.body, /must include its creator|include the creator/);
});

test('20. discovery does not widen what a player may READ', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedCoach();
  const player = await seedPlayer('player_dm_20');
  await ensureDefaultChannels(coach.headers);
  // Knowing a coach exists must not grant the coaching channel.
  const r = await callRaw('GET', '/api/chat?action=messages&convId=coaching&since=0', null, player.headers);
  assert.equal(r.statusCode, 403, 'staff channel still refused');
  // Nor the staff-only recipient endpoint.
  const g = await callRaw('GET', '/api/chat?action=group_recipients&groupId=grp_initial', null, player.headers);
  assert.equal(g.statusCode, 403, 'group_recipients is still staff only');
});

test('21. staff keep their own broader directory through the same endpoint', async () => {
  kv.clear(); lists.clear();
  const coach = await seedCoach();
  await seedStaff('staff_admin_21', 'admin', 'Ada Admin');
  await seedPlayer('player_21', { displayName: 'Some Player' });
  const res = await call('GET', '/api/chat?action=dm_candidates', null, coach.headers);
  const names = res.candidates.map(c => c.name);
  assert.ok(names.includes('Ada Admin'), 'a coach still reaches other staff');
  assert.ok(!names.includes('Simon Coach'), 'but never themselves');
});

test('22. the client offers a player only what the server authorised', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  // The control exists for players (it was gated on mode==='coach').
  assert.ok(!/\$\{mode==='coach'\?`<button class="chat-new-msg-btn"/.test(html),
    'the New Message button must not be coach-only');
  assert.match(html, /<button class="chat-new-msg-btn" type="button" onclick="chatOpenNewDmPicker\(\)"/,
    'and is rendered unconditionally in the chat shell');
  // Opening it is no longer coach-only either.
  const open = html.slice(html.indexOf('function chatOpenNewDmPicker'), html.indexOf('function chatCloseNewDmPicker'));
  assert.ok(!/if \(!isCoach\(\)\) return;/.test(open), 'players can open the picker');
  // A player's candidates come from the authorised staff list, never the roster.
  const picker = html.slice(html.indexOf('function chatCoachDmPickerPlayers'), html.indexOf('function chatNewDmPickerResultsHtml'));
  assert.match(picker, /if \(!isCoach\(\)\)[\s\S]{0,400}chatStaffDmCandidates/,
    'a player is offered staff only');
  // Selection routes through the ONE existing creation path.
  const starter = html.slice(html.indexOf('async function chatStartDmWith'), html.indexOf('async function chatStartCoachDm'));
  assert.match(starter, /chatStartStaffDm\(staff\)/, 'reuses the existing DM creation path');
  assert.match(starter, /if \(!staff\) return showToast/, 'an unlisted target is refused client-side too');
  // And players actually load their candidates.
  const playerRender = html.slice(html.indexOf('function renderPlayerMessages'), html.indexOf('function renderPlayerMessages') + 900);
  assert.match(playerRender, /chatEnsureStaffDirectory\(\)/,
    'the player renderer loads the directory — the coach one never runs for them');
});
