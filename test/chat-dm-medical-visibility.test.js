/**
 * MEDICAL / PHYSIO STAFF DIRECT-MESSAGE VISIBILITY.
 *
 * The chat gates branched on exactly two standings — 'coach'/'admin' staff
 * and 'player' — and every other authenticated role (medical, snc, analyst)
 * fell through to the closed default. The club physio could be DM'd by any
 * player (dm_candidates lists medical staff) and could even CREATE a DM
 * (create_conv admits every role to DIRECT), but could never read or answer
 * one: their own thread was invisible and their reply refused.
 *
 * The contract these tests pin, for EVERY authenticated role:
 *
 *   A DIRECT conversation belongs to its participants and to nobody else.
 *
 * Participation is judged on the SESSION's authenticated identity — never on
 * body/query group fields, claimed sender ids, or the Medical permission.
 * Group channels stay a separate authorization domain: DM access grants no
 * channel and no group standing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.dm-medical.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const lists = new Map();
function range(list, start, end) {
  const s = Number(start), e = Number(end);
  const finalEnd = e < 0 ? list.length + e : e;
  return list.slice(s, finalEnd + 1);
}
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = range(lists.get(args[0]) || [], args[1], args[2]);
  if (command === 'LTRIM') { const l = lists.get(args[0]) || []; lists.set(args[0], range(l, args[1], args[2])); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); lists.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', []];
  return { ok: true, json: async () => ({ result }) };
};

const { default: chatHandler, sessionCanReadConversation } = await import('../api/chat.js');
const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');
const { dmConvId } = await import('../src/chat-state.js');

// ── UNIT: the exported read gate, role by role ───────────────────────────────
const ctx = (id, role) => ({ user: { id, role }, teamMember: { role, teamId: 'club1' } });
const dmConv = (a, b) => ({ id: `dm:${a}:${b}`, type: 'DIRECT', participants: [a, b], teamId: 'club1' });

test('unit: a medical participant reads their own DM; a medical non-participant cannot', () => {
  assert.equal(sessionCanReadConversation(ctx('u-physio', 'medical'), dmConv('u-physio', 'u-p'), ['u-physio']), true);
  assert.equal(sessionCanReadConversation(ctx('u-other', 'medical'), dmConv('u-physio', 'u-p'), ['u-other']), false);
});

test('unit: snc and analyst participants read their own DMs too', () => {
  for (const role of ['snc', 'analyst']) {
    assert.equal(sessionCanReadConversation(ctx('u-s', role), dmConv('u-s', 'u-p'), ['u-s']), true, role);
    assert.equal(sessionCanReadConversation(ctx('u-x', role), dmConv('u-s', 'u-p'), ['u-x']), false, `${role} non-participant`);
  }
});

test('unit: DM participation grants no group-channel standing to medical staff', () => {
  const groupChannel = { id: 'group:grp-sen', type: 'GROUP', teamId: 'club1' };
  assert.equal(sessionCanReadConversation(ctx('u-physio', 'medical'), groupChannel, ['u-physio'],
    { playingGroupId: '', staffGroupIds: new Set() }), false);
});

// ── INTEGRATION: through the real /api/chat handler ──────────────────────────
function req(method, url, body = null, headers = {}) {
  return { method, url, headers, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } };
}
function res() {
  return {
    statusCode: 0, headers: {}, body: '',
    setHeader(n, v) { this.headers[n] = v; },
    writeHead(s, h = {}) { this.statusCode = s; this.headers = { ...this.headers, ...h }; },
    end(c = '') { this.body = String(c || ''); },
  };
}
async function raw(method, url, body = null, headers = {}) {
  const r = res();
  await chatHandler(req(method, url, body, headers), r);
  return r;
}
async function call(method, url, body = null, headers = {}) {
  const r = await raw(method, url, body, headers);
  assert.equal(r.statusCode, 200, r.body);
  return JSON.parse(r.body);
}
async function seedAccount({ id, role, teamId = 'club1', displayName = 'User' }) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) { users.push({ id, email: `${id}@club.test`, displayName }); kv.set('app:identity:users', JSON.stringify(users)); }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) { members.push({ id: `tm_${id}`, teamId, userId: id, role, status: 'active' }); kv.set('app:identity:team_members', JSON.stringify(members)); }
  if (role === 'player') {
    const profiles = JSON.parse(kv.get('app:identity:player_profiles') || '[]');
    if (!profiles.find(p => p.userId === id)) { profiles.push({ id: `profile_${id}`, teamId, userId: id, displayName, legacyPlayerId: id }); kv.set('app:identity:player_profiles', JSON.stringify(profiles)); }
  }
  const session = await createSession({ userId: id, teamId, role });
  return { headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` } };
}

test('integration: a player DMs the physio — the physio sees it, reads it, and can answer', async () => {
  kv.clear(); lists.clear();
  const player = await seedAccount({ id: 'user_P', role: 'player', displayName: 'Player P' });
  const physio = await seedAccount({ id: 'user_M', role: 'medical', displayName: 'Physio M' });

  const conv = dmConvId('user_P', 'user_M');
  await call('POST', '/api/chat', { action: 'create_conv', id: conv, name: 'Physio M', type: 'DIRECT', participants: ['user_P', 'user_M'] }, player.headers);
  await call('POST', '/api/chat', { action: 'send', convId: conv, senderId: 'user_P', senderName: 'Player P', senderRole: 'player', text: 'my ankle hurts' }, player.headers);

  const mList = await call('GET', '/api/chat?action=conversations', null, physio.headers);
  const row = mList.conversations.find(c => c.id === conv);
  assert.ok(row, 'the physio\'s own DM appears in their list');
  assert.equal(row.unread, 1, 'with its real unread count');

  const msgs = await call('GET', `/api/chat?action=messages&convId=${encodeURIComponent(conv)}`, null, physio.headers);
  assert.ok((msgs.messages || []).some(m => m.text === 'my ankle hurts'), 'the physio reads the thread');

  const reply = await call('POST', '/api/chat', { action: 'send', convId: conv, senderId: 'user_M', senderName: 'Physio M', senderRole: 'medical', text: 'come in before training' }, physio.headers);
  assert.ok(reply.ok !== false, 'the reply is accepted');
  const pMsgs = await call('GET', `/api/chat?action=messages&convId=${encodeURIComponent(conv)}`, null, player.headers);
  assert.ok((pMsgs.messages || []).some(m => m.text === 'come in before training'), 'the player receives the answer');
});

test('integration: the physio can START a DM of their own, end to end', async () => {
  kv.clear(); lists.clear();
  const physio = await seedAccount({ id: 'user_M', role: 'medical', displayName: 'Physio M' });
  const player = await seedAccount({ id: 'user_P', role: 'player', displayName: 'Player P' });

  const conv = dmConvId('user_M', 'user_P');
  await call('POST', '/api/chat', { action: 'create_conv', id: conv, name: 'Player P', type: 'DIRECT', participants: ['user_M', 'user_P'] }, physio.headers);
  await call('POST', '/api/chat', { action: 'send', convId: conv, senderId: 'user_M', senderName: 'Physio M', senderRole: 'medical', text: 'rehab plan attached' }, physio.headers);

  const pList = await call('GET', '/api/chat?action=conversations', null, player.headers);
  assert.equal(pList.conversations.find(c => c.id === conv)?.unread, 1, 'the player receives the physio\'s DM');
});

test('integration: Medical permission is not DM access — a non-participant physio stays out', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedAccount({ id: 'user_A', role: 'coach', displayName: 'Coach A' });
  const player = await seedAccount({ id: 'user_P', role: 'player', displayName: 'Player P' });
  const physio = await seedAccount({ id: 'user_M', role: 'medical', displayName: 'Physio M' });

  const conv = dmConvId('user_A', 'user_P');
  await call('POST', '/api/chat', { action: 'create_conv', id: conv, name: 'Player P', type: 'DIRECT', participants: ['user_A', 'user_P'] }, coach.headers);
  await call('POST', '/api/chat', { action: 'send', convId: conv, senderId: 'user_A', senderName: 'Coach A', senderRole: 'coach', text: 'selection chat' }, coach.headers);

  const mList = await call('GET', '/api/chat?action=conversations', null, physio.headers);
  assert.equal(mList.conversations.some(c => c.id === conv), false, 'foreign DM absent from the physio\'s list');

  // Conversation-id guessing: the direct read is refused outright.
  const guess = await raw('GET', `/api/chat?action=messages&convId=${encodeURIComponent(conv)}`, null, physio.headers);
  assert.equal(guess.statusCode, 403, guess.body);

  const write = await raw('POST', '/api/chat', { action: 'send', convId: conv, senderId: 'user_M', senderName: 'Physio M', senderRole: 'medical', text: 'intruding' }, physio.headers);
  assert.equal(write.statusCode, 403, write.body);
});

test('integration: forged group and participant fields do not create authorization', async () => {
  kv.clear(); lists.clear();
  const coach  = await seedAccount({ id: 'user_A', role: 'coach', displayName: 'Coach A' });
  const player = await seedAccount({ id: 'user_P', role: 'player', displayName: 'Player P' });
  const physio = await seedAccount({ id: 'user_M', role: 'medical', displayName: 'Physio M' });

  const conv = dmConvId('user_A', 'user_P');
  await call('POST', '/api/chat', { action: 'create_conv', id: conv, name: 'Player P', type: 'DIRECT', participants: ['user_A', 'user_P'] }, coach.headers);

  const forgedRead = await raw('GET',
    `/api/chat?action=messages&convId=${encodeURIComponent(conv)}&group=grp-sen&groupId=grp-sen&participantId=user_A`,
    null, physio.headers);
  assert.equal(forgedRead.statusCode, 403, 'query fields are not authorization');

  const forgedWrite = await raw('POST', '/api/chat', {
    action: 'send', convId: conv, senderId: 'user_A', senderName: 'Coach A', senderRole: 'coach',
    groupId: 'grp-sen', participants: ['user_M'], text: 'still intruding',
  }, physio.headers);
  assert.equal(forgedWrite.statusCode, 403, 'body fields are not authorization');
});

test('integration: inside their own DM, a forged senderId is overridden by the session', async () => {
  kv.clear(); lists.clear();
  const player = await seedAccount({ id: 'user_P', role: 'player', displayName: 'Player P' });
  const physio = await seedAccount({ id: 'user_M', role: 'medical', displayName: 'Physio M' });

  const conv = dmConvId('user_P', 'user_M');
  await call('POST', '/api/chat', { action: 'create_conv', id: conv, name: 'Physio M', type: 'DIRECT', participants: ['user_P', 'user_M'] }, player.headers);
  await call('POST', '/api/chat', { action: 'send', convId: conv, senderId: 'user_P', senderName: 'Player P', senderRole: 'player', text: 'impersonation attempt' }, physio.headers);

  const msgs = await call('GET', `/api/chat?action=messages&convId=${encodeURIComponent(conv)}`, null, player.headers);
  const msg = (msgs.messages || []).find(m => m.text === 'impersonation attempt');
  assert.equal(msg?.senderId, 'user_M', 'the session, never the body, names the sender');
});

test('integration: players still cannot reach other people\'s DMs', async () => {
  kv.clear(); lists.clear();
  const player  = await seedAccount({ id: 'user_P', role: 'player', displayName: 'Player P' });
  const physio  = await seedAccount({ id: 'user_M', role: 'medical', displayName: 'Physio M' });
  const player2 = await seedAccount({ id: 'user_Q', role: 'player', displayName: 'Player Q' });

  const conv = dmConvId('user_P', 'user_M');
  await call('POST', '/api/chat', { action: 'create_conv', id: conv, name: 'Physio M', type: 'DIRECT', participants: ['user_P', 'user_M'] }, player.headers);
  await call('POST', '/api/chat', { action: 'send', convId: conv, senderId: 'user_P', senderName: 'Player P', senderRole: 'player', text: 'private' }, player.headers);

  const qRead = await raw('GET', `/api/chat?action=messages&convId=${encodeURIComponent(conv)}`, null, player2.headers);
  assert.equal(qRead.statusCode, 403, qRead.body);
  const qList = await call('GET', '/api/chat?action=conversations', null, player2.headers);
  assert.equal(qList.conversations.some(c => c.id === conv), false);
});
