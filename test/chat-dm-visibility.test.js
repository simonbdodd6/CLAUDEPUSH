/**
 * Chat DM end-to-end (server, mocked Upstash incl. Redis lists).
 *
 * Proves the flow the player UI now treats as source of truth:
 *  - coach creates a DM + sends -> the player's conversations endpoint returns it
 *  - the player can read both coach messages
 *  - the player replies -> the coach reads the reply in the SAME thread
 *
 * No API/storage/auth/conv-creation changes — this locks existing behaviour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.chat-dm.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
globalThis.fetch = async (_u, o = {}) => {
  const a = JSON.parse(o.body || '[]'); const cmd = a[0], k = a[1];
  let r = null;
  if (cmd === 'GET')  r = kv.has(k) ? kv.get(k) : null;
  if (cmd === 'SET') { kv.set(k, a[2]); r = 'OK'; }
  if (cmd === 'DEL') { kv.delete(k); r = 1; }
  if (cmd === 'EXPIRE') r = 1;
  if (cmd === 'LPUSH') { const arr = Array.isArray(kv.get(k)) ? kv.get(k) : []; arr.unshift(a[2]); kv.set(k, arr); r = arr.length; }
  if (cmd === 'LRANGE') { const arr = Array.isArray(kv.get(k)) ? kv.get(k) : []; const s = +a[2], e = +a[3]; r = e < 0 ? arr.slice(s) : arr.slice(s, e + 1); }
  if (cmd === 'LTRIM') { const arr = Array.isArray(kv.get(k)) ? kv.get(k) : []; kv.set(k, arr.slice(+a[2], (+a[3]) + 1)); r = 'OK'; }
  if (cmd === 'SCAN') r = ['0', []];
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: chatHandler } = await import('../api/chat.js');
const { SESSION_COOKIE } = store;

function res() { return { _s: 200, _b: '', writeHead(s){ this._s = s; return this; }, end(b){ this._b = b || ''; return this; }, setHeader(){}, getHeader(){} }; }
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
async function chatGet(path, cookie) { const r = res(); await chatHandler({ method: 'GET', url: path, headers: cookie ? { cookie } : {} }, r); return { status: r._s, body: JSON.parse(r._b || '{}') }; }
async function chatPost(bodyObj, cookie) {
  const buf = Buffer.from(JSON.stringify(bodyObj));
  const req = { method: 'POST', url: '/api/chat', headers: cookie ? { cookie } : {}, async *[Symbol.asyncIterator]() { yield buf; } };
  const r = res(); await chatHandler(req, r); return { status: r._s, body: JSON.parse(r._b || '{}') };
}
const dmId = (a, b) => 'dm:' + [a, b].sort().join(':');

test('coach DM is visible to the player and replies thread back to the coach', async () => {
  kv.clear();
  const club = await store.createClub({ clubName: 'Chat Club', teamName: 'Seniors', sport: 'rugby', name: 'Chat Coach', email: 'cc@chat.test', password: 'password123' });
  const token = 'TK00000001';
  kv.set('ce:invites', JSON.stringify([{ token, email: 'cp@chat.test', name: 'Chat Player', role: 'player', teamId: club.team.id, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  const player = await store.claimInvite({ token, email: 'cp@chat.test', name: 'Chat Player', password: 'password123' });
  const coachId = club.user.id, playerId = player.user.id;
  const DM = dmId(coachId, playerId);

  // Coach creates the DM + sends two messages.
  const created = await chatPost({ action: 'create_conv', id: DM, name: 'Chat Player', type: 'DIRECT', participants: [coachId, playerId] }, ck(club.session));
  assert.equal(created.status, 200);
  assert.equal((await chatPost({ action: 'send', convId: DM, text: 'test' }, ck(club.session))).status, 200);
  assert.equal((await chatPost({ action: 'send', convId: DM, text: 'ping1' }, ck(club.session))).status, 200);

  // (1) Player's conversations endpoint returns the SAME DM.
  const pConvs = await chatGet('/api/chat?action=conversations', ck(player.session));
  assert.equal(pConvs.status, 200);
  const dm = pConvs.body.conversations.find(c => c.id === DM);
  assert.ok(dm, 'player sees the coach DM (same id)');
  assert.equal(dm.lastMessage?.text, 'ping1');

  // (2) Player can read both coach messages.
  const pMsgs = await chatGet(`/api/chat?action=messages&convId=${encodeURIComponent(DM)}`, ck(player.session));
  assert.equal(pMsgs.status, 200);
  assert.deepEqual(pMsgs.body.messages.map(m => m.text), ['test', 'ping1']);

  // (3) Player replies in the same thread.
  const reply = await chatPost({ action: 'send', convId: DM, text: 'reply1' }, ck(player.session));
  assert.equal(reply.status, 200);
  assert.equal(reply.body.message.senderRole, 'player');

  // (4) Coach reads the player's reply in the SAME thread.
  const cMsgs = await chatGet(`/api/chat?action=messages&convId=${encodeURIComponent(DM)}`, ck(club.session));
  assert.deepEqual(cMsgs.body.messages.map(m => m.text), ['test', 'ping1', 'reply1']);
  assert.equal(cMsgs.body.messages[2].senderRole, 'player', 'coach sees the player reply');
});

test('player conversations carry the canonical server id (no client recomputation needed)', async () => {
  kv.clear();
  const club = await store.createClub({ clubName: 'Chat Club 2', teamName: 'Seniors', sport: 'rugby', name: 'Coach Two', email: 'c2@chat.test', password: 'password123' });
  const token = 'TK00000002';
  kv.set('ce:invites', JSON.stringify([{ token, email: 'p2@chat.test', name: 'Player Two', role: 'player', teamId: club.team.id, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  const player = await store.claimInvite({ token, email: 'p2@chat.test', name: 'Player Two', password: 'password123' });
  const DM = dmId(club.user.id, player.user.id);
  await chatPost({ action: 'create_conv', id: DM, name: 'Player Two', type: 'DIRECT', participants: [club.user.id, player.user.id] }, ck(club.session));
  await chatPost({ action: 'send', convId: DM, text: 'hi' }, ck(club.session));

  const pConvs = await chatGet('/api/chat?action=conversations', ck(player.session));
  const directs = pConvs.body.conversations.filter(c => String(c.type).toUpperCase() === 'DIRECT' || String(c.id).startsWith('dm:'));
  assert.equal(directs.length, 1, 'exactly one DM returned to the player');
  assert.equal(directs[0].id, DM, 'and it carries the canonical coach:player id');
});
