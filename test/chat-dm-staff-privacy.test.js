/**
 * Fix A — staff DM privacy.
 *
 * Root cause of the "Simon2Coach 9+" phantom + wrong row previews: the chat read
 * gate returned TRUE for every conversation to any staff (coach/admin) session, so
 * a coach received EVERY DM in the club — including the other coach's private player
 * DMs — and their whole backlog was counted as that coach's own unread.
 *
 * Intended behaviour (verified here):
 *   - Staff keep access to GROUP / TEAM / SYSTEM channels (squad, coaching, announce).
 *   - Direct messages are PRIVATE: returned / readable / unread-counted only when the
 *     authenticated user is a participant.
 *   - A coach never receives another coach's (or a player-to-player) DM.
 *   - Participant coach↔coach and coach↔player DMs still work end to end.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.dm-privacy.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

// ── Minimal Map-backed Redis mock (mirrors test/chat-api-unread.test.js) ──────
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
  return { ok: true, json: async () => ({ result }) };
};

const { default: chatHandler, sessionCanReadConversation } = await import('../api/chat.js');
const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');
const { dmConvId } = await import('../src/chat-state.js');

// ── UNIT: the exported read gate ──────────────────────────────────────────────
// actorIds are userId-only, exactly as the live handler passes them (Option A).
const coachCtx  = (id) => ({ user: { id, role: 'coach' },  teamMember: { role: 'coach',  teamId: 'club1' } });
const playerCtx = (id) => ({ user: { id, role: 'player' }, teamMember: { role: 'player', teamId: 'club1' } });
const dmConv = (a, b) => ({ id: `dm:${a}:${b}`, type: 'DIRECT', participants: [a, b], teamId: 'club1' });

test('unit: coach can read a DM they participate in', () => {
  assert.equal(sessionCanReadConversation(coachCtx('user_A'), dmConv('user_A', 'user_P'), ['user_A']), true);
});
test('unit: coach B CANNOT read coach A\'s DM with a player', () => {
  assert.equal(sessionCanReadConversation(coachCtx('user_B'), dmConv('user_A', 'user_P'), ['user_B']), false);
});
test('unit: coach CANNOT read a player-to-player DM', () => {
  assert.equal(sessionCanReadConversation(coachCtx('user_B'), dmConv('user_P', 'user_Q'), ['user_B']), false);
});
test('unit: participant coach-to-coach DM is readable by each participant, not by a third coach', () => {
  assert.equal(sessionCanReadConversation(coachCtx('user_A'), dmConv('user_A', 'user_B'), ['user_A']), true);
  assert.equal(sessionCanReadConversation(coachCtx('user_B'), dmConv('user_A', 'user_B'), ['user_B']), true);
  assert.equal(sessionCanReadConversation(coachCtx('user_C'), dmConv('user_A', 'user_B'), ['user_C']), false);
});
test('unit: participant coach-to-player DM is readable by the player', () => {
  assert.equal(sessionCanReadConversation(playerCtx('user_P'), dmConv('user_A', 'user_P'), ['user_P']), true);
});
test('unit: staff still read GROUP / TEAM / SYSTEM channels they are not "in"', () => {
  assert.equal(sessionCanReadConversation(coachCtx('user_B'), { id: 'squad', type: 'GROUP', teamId: 'club1' }, ['user_B']), true);
  assert.equal(sessionCanReadConversation(coachCtx('user_B'), { id: 'coaching', type: 'COACHING', teamId: 'club1' }, ['user_B']), true);
  assert.equal(sessionCanReadConversation(coachCtx('user_B'), { id: 'announce', type: 'ANNOUNCEMENT', teamId: 'club1' }, ['user_B']), true);
});

// ── INTEGRATION: through the real /api/chat handler ───────────────────────────
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
async function call(method, url, body = null, headers = {}) {
  const r = res();
  await chatHandler(req(method, url, body, headers), r);
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
const totalUnread = (list) => list.conversations.reduce((n, c) => n + Number(c.unread || 0), 0);

test('integration: coach B never receives coach A\'s player DM, and it is not counted in B\'s unread', async () => {
  kv.clear(); lists.clear();
  const coachA = await seedAccount({ id: 'user_A', role: 'coach', displayName: 'Coach A' });
  const coachB = await seedAccount({ id: 'user_B', role: 'coach', displayName: 'Coach B' });
  const player = await seedAccount({ id: 'user_P', role: 'player', displayName: 'Player P' });

  const apConv = dmConvId('user_A', 'user_P');
  await call('POST', '/api/chat', { action: 'create_conv', id: apConv, name: 'Player P', type: 'DIRECT', participants: ['user_A', 'user_P'] }, coachA.headers);
  await call('POST', '/api/chat', { action: 'send', convId: apConv, senderId: 'user_A', senderName: 'Coach A', senderRole: 'coach', text: 'hello player' }, coachA.headers);

  const aList = await call('GET', '/api/chat?action=conversations', null, coachA.headers);
  const bList = await call('GET', '/api/chat?action=conversations', null, coachB.headers);
  const pList = await call('GET', '/api/chat?action=conversations', null, player.headers);

  assert.equal(aList.conversations.some(c => c.id === apConv), true, 'coach A (participant) sees own DM');
  assert.equal(bList.conversations.some(c => c.id === apConv), false, 'coach B must NOT receive coach A\'s DM');
  assert.equal(pList.conversations.some(c => c.id === apConv), true, 'player (participant) sees the DM');

  // The player has the unread; coach B has none from the foreign DM.
  assert.equal(pList.conversations.find(c => c.id === apConv).unread, 1, 'player unread = 1');
  assert.equal(totalUnread(bList), 0, 'coach B has no phantom unread from a foreign DM');
});

test('integration: group/team channels stay visible to a coach with no DMs', async () => {
  kv.clear(); lists.clear();
  const coachB = await seedAccount({ id: 'user_B', role: 'coach', displayName: 'Coach B' });
  const list = await call('GET', '/api/chat?action=conversations', null, coachB.headers);
  assert.equal(list.conversations.some(c => c.id === 'squad'), true, 'squad visible to staff');
  assert.equal(list.conversations.some(c => c.id === 'coaching'), true, 'coaching visible to staff');
  assert.equal(list.conversations.some(c => c.id === 'announce'), true, 'announce visible to staff');
  assert.equal(totalUnread(list), 0);
});

test('integration: participant coach-to-coach DM works both ways, invisible to a third coach', async () => {
  kv.clear(); lists.clear();
  const coachA = await seedAccount({ id: 'user_A', role: 'coach', displayName: 'Coach A' });
  const coachB = await seedAccount({ id: 'user_B', role: 'coach', displayName: 'Coach B' });
  const coachC = await seedAccount({ id: 'user_C', role: 'coach', displayName: 'Coach C' });

  const abConv = dmConvId('user_A', 'user_B');
  await call('POST', '/api/chat', { action: 'create_conv', id: abConv, name: 'Coach B', type: 'DIRECT', participants: ['user_A', 'user_B'] }, coachA.headers);
  await call('POST', '/api/chat', { action: 'send', convId: abConv, senderId: 'user_A', senderName: 'Coach A', senderRole: 'coach', text: 'hi B' }, coachA.headers);

  const aList = await call('GET', '/api/chat?action=conversations', null, coachA.headers);
  const bList = await call('GET', '/api/chat?action=conversations', null, coachB.headers);
  const cList = await call('GET', '/api/chat?action=conversations', null, coachC.headers);
  assert.equal(aList.conversations.some(c => c.id === abConv), true, 'coach A participant sees it');
  assert.equal(bList.conversations.some(c => c.id === abConv), true, 'coach B participant sees it');
  assert.equal(bList.conversations.find(c => c.id === abConv).unread, 1, 'coach B has the real unread');
  assert.equal(cList.conversations.some(c => c.id === abConv), false, 'coach C (non-participant) does not');
  assert.equal(totalUnread(cList), 0, 'coach C has no phantom unread');
});

test('integration: participant coach-to-player DM is delivered to the player', async () => {
  kv.clear(); lists.clear();
  const coachA = await seedAccount({ id: 'user_A', role: 'coach', displayName: 'Coach A' });
  const player = await seedAccount({ id: 'user_P', role: 'player', displayName: 'Player P' });

  const apConv = dmConvId('user_A', 'user_P');
  await call('POST', '/api/chat', { action: 'create_conv', id: apConv, name: 'Player P', type: 'DIRECT', participants: ['user_A', 'user_P'] }, coachA.headers);
  await call('POST', '/api/chat', { action: 'send', convId: apConv, senderId: 'user_A', senderName: 'Coach A', senderRole: 'coach', text: 'training tonight' }, coachA.headers);

  const pList = await call('GET', '/api/chat?action=conversations', null, player.headers);
  assert.equal(pList.conversations.some(c => c.id === apConv), true, 'player receives the coach DM');
  assert.equal(pList.conversations.find(c => c.id === apConv).unread, 1, 'player sees it as unread');
});
