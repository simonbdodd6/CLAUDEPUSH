/**
 * RC4.9A — Built-in channel tenant isolation (squad / coaching / announce).
 *
 * BEFORE: the three built-in conversations carried no teamId, so
 * sessionMatchesConversationTeam() allowed every authenticated session through
 * and all clubs shared ONE global squad room — any club's members could read
 * and write every other club's squad messages.
 *
 * AFTER: the client protocol still uses the plain ids, but STORAGE (messages,
 * read markers, typing) is scoped per club via `<id>@<teamId>`. The default
 * club keeps the legacy flat keys so existing beta messages survive.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.builtin-isolation.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const lists = new Map();
const range = (list, s, e) => { const end = Number(e) < 0 ? list.length + Number(e) : Number(e); return list.slice(Number(s), end + 1); };
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); lists.delete(a[0]); r = 1; }
  if (c === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); r = l.length; }
  if (c === 'LRANGE') r = range(lists.get(a[0]) || [], a[1], a[2]);
  if (c === 'LTRIM') { lists.set(a[0], range(lists.get(a[0]) || [], a[1], a[2])); r = 'OK'; }
  if (c === 'SCAN') r = ['0', [...kv.keys()]];
  if (c === 'EXPIRE') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: chatHandler } = await import('../api/chat.js');
const { SESSION_COOKIE, DEFAULT_TEAM } = store;

function res() {
  return { statusCode: 0, headers: {}, body: '',
    setHeader(n, v) { this.headers[n] = v; },
    writeHead(s, h = {}) { this.statusCode = s; this.headers = { ...this.headers, ...h }; },
    end(c = '') { this.body = String(c || ''); } };
}
async function call(method, url, body, headers = {}) {
  const r = res();
  await chatHandler({ method, url, headers, body, async *[Symbol.asyncIterator]() {} }, r);
  return { status: r.statusCode, data: (() => { try { return JSON.parse(r.body); } catch { return null; } })() };
}
const ck = s => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(s.token)}` });

let _t = 0;
async function club(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Coach`, email: `c${++_t}@bi.test`, password: 'password123' });
}
const squadTexts = d => (d?.messages || []).map(m => m.text);

test('two clubs do not share the built-in squad channel', async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const B = await club('Bravo');

  const sendA = await call('POST', '/api/chat', { action: 'send', convId: 'squad', text: 'alpha only' }, ck(A.session));
  assert.equal(sendA.status, 200, JSON.stringify(sendA.data));
  const sendB = await call('POST', '/api/chat', { action: 'send', convId: 'squad', text: 'bravo only' }, ck(B.session));
  assert.equal(sendB.status, 200);

  const readA = await call('GET', '/api/chat?action=messages&convId=squad&since=0', null, ck(A.session));
  const readB = await call('GET', '/api/chat?action=messages&convId=squad&since=0', null, ck(B.session));
  assert.deepEqual(squadTexts(readA.data), ['alpha only'], 'club A sees only its own squad message');
  assert.deepEqual(squadTexts(readB.data), ['bravo only'], 'club B sees only its own squad message');
});

test('announce and coaching channels are per-club too', async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const B = await club('Bravo');
  for (const conv of ['announce', 'coaching']) {
    await call('POST', '/api/chat', { action: 'send', convId: conv, text: `alpha ${conv}` }, ck(A.session));
    const seenB = await call('GET', `/api/chat?action=messages&convId=${conv}&since=0`, null, ck(B.session));
    assert.deepEqual(squadTexts(seenB.data), [], `club B sees nothing in ${conv}`);
  }
});

test('unread counts on built-ins do not bleed across clubs', async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const B = await club('Bravo');
  await call('POST', '/api/chat', { action: 'send', convId: 'squad', text: 'alpha ping' }, ck(A.session));
  const convsB = await call('GET', '/api/chat?action=conversations', null, ck(B.session));
  const squadB = (convsB.data?.conversations || []).find(c => c.id === 'squad');
  assert.equal(squadB?.unread || 0, 0, 'club B has no unread from club A traffic');
});

test('default club keeps the legacy flat storage key (existing beta data survives)', async () => {
  kv.clear(); lists.clear(); _t = 0;
  // Seed a pre-scoping message in the flat key, then read it as a default-club coach.
  lists.set('app:chat:conv:squad:msgs', [JSON.stringify({
    id: 'msg_legacy', convId: 'squad', senderId: 'coach-demo', senderName: 'Simon Coach',
    senderRole: 'coach', text: 'legacy beta message', ts: Date.now(),
  })]);
  const users = [{ id: 'coach-demo', email: 'cd@bi.test', displayName: 'Coach Demo' }];
  kv.set('app:identity:users', JSON.stringify(users));
  kv.set('app:identity:team_members', JSON.stringify([{ id: 'tm-cd', teamId: DEFAULT_TEAM.id, userId: 'coach-demo', role: 'coach', status: 'active' }]));
  const session = await store.createSession({ userId: 'coach-demo', teamId: DEFAULT_TEAM.id, role: 'coach' });

  const read = await call('GET', '/api/chat?action=messages&convId=squad&since=0', null, ck(session));
  assert.deepEqual(squadTexts(read.data), ['legacy beta message'], 'default club still reads flat legacy key');
});

test("a forged '@' conversation id cannot be created", async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const B = await club('Bravo');
  const forged = await call('POST', '/api/chat', {
    action: 'create_conv', id: `squad@${B.team.id}`, name: 'spoof', type: 'GROUP', participants: [A.user.id],
  }, ck(A.session));
  assert.equal(forged.status, 400, 'ids containing @ are rejected');
});
