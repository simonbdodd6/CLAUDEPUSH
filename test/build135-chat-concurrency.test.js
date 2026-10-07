/**
 * CHAT WRITES ARE SERIALISED (Build 135)
 *
 * Two stores raced:
 *   - the conversation INDEX (one array for every club), rewritten by every
 *     create, group change and every send's lastActivity bump — a concurrent
 *     pair dropped a conversation;
 *   - each conversation's MESSAGE LIST: react / edit / delete read the list,
 *     change one message and rewrite the WHOLE list — a message sent in that
 *     window vanished, and a deleted message could come back.
 * The index now has its own lock and every message list its own lock, held by
 * sends AND rewrites. These tests drive the real chat handler over a storage
 * stand-in that interleaves every command, so the writers truly overlap.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installKv } from './build135-kv.js';

const URL_ = 'https://redis.chat-b135.test';
process.env.UPSTASH_REDIS_REST_URL = URL_;
process.env.UPSTASH_REDIS_REST_TOKEN = 'chat-b135-token';
process.env.APP_KEY_PREFIX = 'app';
delete process.env.VERCEL; delete process.env.VERCEL_ENV;

const kvStub = installKv({ maxDelayMs: 0 });
const db = kvStub.dbFor(URL_);
const S = await import('../api/_identityStore.js');
const { default: chat } = await import('../api/chat.js');

const PW = 'password-b135';
const cookie = s => `${S.SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
async function chatCall(method, url, body, actor) {
  const r = { statusCode: 0, body: '', headers: {}, setHeader(n, v) { this.headers[n] = v; }, writeHead(s) { this.statusCode = s; }, end(c = '') { this.body = String(c || ''); } };
  await chat({ method, url, headers: actor ? { cookie: cookie(actor.session) } : {}, body, async *[Symbol.asyncIterator]() {} }, r);
  let data = null; try { data = JSON.parse(r.body); } catch {}
  return { status: r.statusCode, data };
}
const send = (actor, text, convId = 'squad') => chatCall('POST', '/api/chat', { action: 'send', convId, text }, actor);
const messages = async (actor, convId = 'squad') => {
  const r = await chatCall('GET', `/api/chat?action=messages&convId=${encodeURIComponent(convId)}&since=0`, null, actor);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.messages;
};
const convs = () => JSON.parse(db.data.get('app:chat:convs') || '[]');

let n = 0;
async function addMember(teamId, { role = 'player', staffLevel, accessProfile } = {}) {
  const id = ++n;
  const { user } = await S.withIdentityLock(async () => {
    const us = await S.loadUsers();
    const u = { id: `user_chat${id}`, email: `chat${id}@b135.test`, displayName: `Chatter ${id}`, authProvider: 'password', passwordSet: true, emailVerified: true, createdAt: new Date().toISOString() };
    us.push(u); await S.saveUsers(us);
    const ms = await S.loadTeamMembers();
    ms.push({ id: `tm_chat${id}`, teamId, userId: u.id, role, status: 'active', joinedAt: new Date().toISOString(), ...(staffLevel ? { staffLevel } : {}), ...(accessProfile ? { accessProfile } : {}) });
    await S.saveTeamMembers(ms);
    return { user: u };
  });
  return { user, session: await S.createSession({ userId: user.id, teamId, role }) };
}

async function world() {
  db.data.clear(); db.lists.clear(); db.expiry.clear(); kvStub.setDelay(0); n = 0;
  const A = await S.createClub({ clubName: 'Alpha RFC', teamName: 'Seniors', sport: 'rugby', name: 'Alpha Owner', email: 'owner.a@chat-b135.test', password: PW });
  const B = await S.createClub({ clubName: 'Bravo RFC', teamName: 'Seniors', sport: 'rugby', name: 'Bravo Owner', email: 'owner.b@chat-b135.test', password: PW });
  const w = {
    a: A.team.id, b: B.team.id,
    ownerA: { user: A.user, session: A.session }, ownerB: { user: B.user, session: B.session },
    coachA: await addMember(A.team.id, { role: 'coach', staffLevel: 'head', accessProfile: 'full' }),
    pA: [], pB: [],
  };
  for (let i = 0; i < 4; i++) w.pA.push(await addMember(w.a));
  for (let i = 0; i < 3; i++) w.pB.push(await addMember(w.b));
  // the built-in channels exist before the race (as they do in a live club)
  await chatCall('GET', '/api/chat?action=conversations', null, w.ownerA);
  kvStub.setDelay(4);
  return w;
}

test('A then concurrent B and C: the list ends with A, B and C', async () => {
  for (let run = 0; run < 4; run++) {
    const w = await world();
    assert.equal((await send(w.pA[0], `A${run}`)).status, 200);
    const [b, c] = await Promise.all([send(w.pA[1], `B${run}`), send(w.pA[2], `C${run}`)]);
    assert.equal(b.status, 200); assert.equal(c.status, 200);
    const texts = (await messages(w.ownerA)).map(m => m.text);
    for (const t of [`A${run}`, `B${run}`, `C${run}`]) assert.ok(texts.includes(t), `run ${run}: ${t} kept (${texts})`);
  }
});

test('sends racing whole-list rewrites (react, edit, delete): nothing sent is lost, nothing deleted comes back', async () => {
  for (let run = 0; run < 4; run++) {
    const w = await world();
    const m1 = (await send(w.pA[0], 'first')).data.message;
    const m2 = (await send(w.pA[1], 'second')).data.message;
    const results = await Promise.all([
      chatCall('POST', '/api/chat', { action: 'edit', convId: 'squad', msgId: m1.id, text: 'first (edited)' }, w.pA[0]),
      chatCall('POST', '/api/chat', { action: 'delete', convId: 'squad', msgId: m2.id }, w.pA[1]),
      chatCall('POST', '/api/chat', { action: 'react', convId: 'squad', msgId: m1.id, emoji: '👍' }, w.pA[2]),
      send(w.pA[3], 'third'),
      send(w.ownerA, 'fourth'),
    ]);
    for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.data));
    const list = await messages(w.ownerA);
    const byId = new Map(list.map(m => [m.id, m]));
    assert.equal(byId.get(m1.id).text, 'first (edited)', `run ${run}: edit kept`);
    assert.ok(byId.get(m1.id).reactions?.['👍']?.length === 1, `run ${run}: reaction kept`);
    assert.ok(!byId.get(m2.id) || byId.get(m2.id).isDeleted === true, `run ${run}: the deleted message stays deleted`);
    assert.ok(list.some(m => m.text === 'third') && list.some(m => m.text === 'fourth'), `run ${run}: concurrent sends kept`);
    assert.equal(list.filter(m => m.text === 'second').length, 0, `run ${run}: deleted text never resurrected`);
  }
});

test('concurrent group creation and sends: every conversation survives in the index', async () => {
  const names = ['Front Row', 'Back Row', 'Kickers', 'Locks', 'Wingers', 'Centres', 'Halves'];
  for (let run = 0; run < 4; run++) {
    const w = await world();
    const results = await Promise.all([
      ...names.map((name, i) => chatCall('POST', '/api/chat', { action: 'create_group', name }, i % 2 ? w.coachA : w.ownerA)),
      chatCall('POST', '/api/chat', { action: 'create_group', name: 'Bravo Group' }, w.ownerB),
      send(w.pA[0], 'bump 1'),       // each send rewrites the index (lastActivity)
      send(w.pA[1], 'bump 2'),
    ]);
    for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.data));
    const list = convs();
    for (const name of [...names, 'Bravo Group']) assert.ok(list.some(c => c.name === name), `run ${run}: ${name} kept`);
    assert.ok(list.some(c => c.id === 'squad'), 'the built-ins kept');
    assert.equal(list.find(c => c.name === 'Bravo Group').teamId, w.b, 'and each belongs to its own club');
    assert.equal(list.find(c => c.name === 'Front Row').teamId, w.a);
  }
});

test('two clubs writing at once: each club\'s channel holds only its own messages', async () => {
  const w = await world();
  await Promise.all([
    ...w.pA.map((p, i) => send(p, `alpha ${i}`)),
    ...w.pB.map((p, i) => send(p, `bravo ${i}`)),
  ]);
  const a = (await messages(w.ownerA)).map(m => m.text);
  const b = (await messages(w.ownerB)).map(m => m.text);
  assert.deepEqual(a.filter(t => t.startsWith('alpha')).sort(), w.pA.map((_, i) => `alpha ${i}`).sort());
  assert.deepEqual(b.filter(t => t.startsWith('bravo')).sort(), w.pB.map((_, i) => `bravo ${i}`).sort());
  assert.equal(a.some(t => t.startsWith('bravo')), false, 'no Bravo message in Alpha');
  assert.equal(b.some(t => t.startsWith('alpha')), false, 'no Alpha message in Bravo');
});

test('a busy message list fails closed: the send is refused (503), nothing half-written; once free, it goes through', async () => {
  const w = await world();
  const sid = `squad@${w.a}`;
  const lockKey = `app:lock:chat:msgs:${sid}`;
  db.data.set(lockKey, JSON.stringify('another-instance'));
  const before = JSON.stringify(db.lists.get(`app:chat:msgs:${sid}`) || []);
  const refused = await send(w.pA[0], 'while busy');
  assert.equal(refused.status, 503, JSON.stringify(refused.data));
  assert.equal(JSON.stringify(db.lists.get(`app:chat:msgs:${sid}`) || []), before, 'nothing written');
  assert.equal(db.data.get(lockKey), JSON.stringify('another-instance'), 'the other holder\'s lock untouched');
  db.data.delete(lockKey);
  assert.equal((await send(w.pA[0], 'after')).status, 200, 'retry succeeds once the holder is gone');
});

test('the locks are always released', async () => {
  const w = await world();
  await Promise.all([send(w.pA[0], 'x'), chatCall('POST', '/api/chat', { action: 'create_group', name: 'G' }, w.ownerA)]);
  const m = (await send(w.pA[1], 'y')).data.message;
  await chatCall('POST', '/api/chat', { action: 'delete', convId: 'squad', msgId: m.id }, w.pA[0]);   // refused: not the author
  assert.deepEqual([...db.data.keys()].filter(k => k.includes(':lock:')), []);
});
