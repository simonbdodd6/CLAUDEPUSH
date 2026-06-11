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
