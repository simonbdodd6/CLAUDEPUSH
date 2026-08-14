/**
 * RC4.7A — Availability tenant isolation.
 *
 * Storage is team-scoped at app:availability:<teamId>:<sessionId>. These tests
 * drive the REAL api/availability handler with TWO independent clubs against a
 * mocked Upstash (with SCAN) and prove:
 *
 *  1. A player's POST writes into their OWN club's scoped key only.
 *  2. A coach's raw ?sessionId= read NEVER returns another club's responses,
 *     even for an identical session id ('tue').
 *  3. resolveRoster and myResponse stay correct per club.
 *  4. clear_week blanks only the caller's club for shared session ids.
 *  5. Legacy flat keys (pre-scoping beta data) are readable by the DEFAULT
 *     club only, and are masked once the default club writes scoped data.
 *  6. A non-default club gets NO legacy fallback — the old global bucket is
 *     unreachable from its context.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.tenant-isolation.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: availability } = await import('../api/availability.js');
const { SESSION_COOKIE, DEFAULT_TEAM } = store;

function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function call(method, query, body, cookie) { const r = res(); await availability({ method, query: query || {}, headers: cookie ? { cookie } : {}, body: body || {} }, r); return r; }
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
let _t = 0;
async function makeClub(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Coach`, email: `c${++_t}@iso.test`, password: 'password123' });
}
async function reg(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email: `p${_t}@iso.test`, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return store.claimInvite({ token, email: `p${_t}@iso.test`, name, password: 'password123' });
}
const publish = (teamId, sessions) => kv.set(`app:publish:${teamId}:sessions`, JSON.stringify(sessions));
const rawRows = r => (r.body?.responses || []);

async function twoClubs() {
  kv.clear(); _t = 0;
  const A = await makeClub('Alpha');
  const B = await makeClub('Bravo');
  publish(A.team.id, [{ id: 'tue', title: 'Tuesday' }, { id: 'game', title: 'Match' }]);
  publish(B.team.id, [{ id: 'tue', title: 'Tuesday' }, { id: 'game', title: 'Match' }]);
  const pa = await reg(A.team.id, 'Alpha Player');
  const pb = await reg(B.team.id, 'Bravo Player');
  return { A, B, pa, pb };
}

test('player POST lands in their own club\'s GROUP key only', async () => {
  const { A, B, pa } = await twoClubs();
  await call('POST', {}, { sessionId: 'tue', response: 'available' }, ck(pa.session));
  // D1b Pass 3 storage split: the write lands on the writer's own club AND
  // group keyspace (a pre-structure club resolves to its initial group).
  const groupKeyA = [...kv.keys()].find(k =>
    k.startsWith(`app:availability:${A.team.id}:group:`) && k.endsWith(':tue'));
  assert.ok(groupKeyA, 'entry in club A group-scoped key');
  const scopedA = JSON.parse(kv.get(groupKeyA) || '{}');
  assert.equal(Object.values(scopedA).some(v => v.userId === pa.user.id), true, 'the answer is there');
  assert.equal([...kv.keys()].some(k => k.startsWith(`app:availability:${B.team.id}:`)), false,
    'nothing written for club B');
  assert.equal(kv.has('app:availability:tue'), false, 'nothing written to the flat global key');
});

test('coach raw ?sessionId= read never sees another club (shared session id)', async () => {
  const { A, B, pa, pb } = await twoClubs();
  await call('POST', {}, { sessionId: 'tue', response: 'available' }, ck(pa.session));
  await call('POST', {}, { sessionId: 'tue', response: 'unavailable' }, ck(pb.session));

  const seenByA = rawRows(await call('GET', { sessionId: 'tue' }, null, ck(A.session)));
  const seenByB = rawRows(await call('GET', { sessionId: 'tue' }, null, ck(B.session)));
  assert.equal(seenByA.length, 1, 'club A sees exactly its own response');
  assert.equal(seenByA[0].userId, pa.user.id);
  assert.equal(seenByB.length, 1, 'club B sees exactly its own response');
  assert.equal(seenByB[0].userId, pb.user.id);
});

test('resolveRoster and myResponse stay per-club', async () => {
  const { A, B, pa, pb } = await twoClubs();
  await call('POST', {}, { sessionId: 'game', response: 'maybe' }, ck(pa.session));
  await call('POST', {}, { sessionId: 'game', response: 'available' }, ck(pb.session));

  const boardA = (await call('GET', { resolveRoster: '1' }, null, ck(A.session))).body?.resolved || {};
  assert.equal(boardA[String(pa.user.id).toLowerCase()]?.game?.response, 'maybe');
  assert.equal(boardA[String(pb.user.id).toLowerCase()], undefined, 'club B player never on club A board');

  const selfB = (await call('GET', { myResponse: '1' }, null, ck(pb.session))).body?.responses || {};
  assert.equal(selfB.game?.response, 'available');
});

test('clear_week blanks only the calling club for a shared session id', async () => {
  const { A, B, pa, pb } = await twoClubs();
  await call('POST', {}, { sessionId: 'tue', response: 'available' }, ck(pa.session));
  await call('POST', {}, { sessionId: 'tue', response: 'available' }, ck(pb.session));

  const cleared = await call('POST', {}, { action: 'clear_week' }, ck(A.session));
  assert.equal(cleared.body?.ok, true);

  assert.equal(rawRows(await call('GET', { sessionId: 'tue' }, null, ck(A.session))).length, 0, 'club A cleared');
  const stillB = rawRows(await call('GET', { sessionId: 'tue' }, null, ck(B.session)));
  assert.equal(stillB.length, 1, 'club B untouched');
  assert.equal(stillB[0].userId, pb.user.id);
});

test('legacy flat beta data: readable by the default club only, masked after a scoped write', async () => {
  kv.clear(); _t = 0;
  const B = await makeClub('Bravo');
  publish(B.team.id, [{ id: 'tue', title: 'Tuesday' }]);
  // Pre-scoping beta record in the flat global bucket (belongs to the default club).
  kv.set('app:availability:tue', JSON.stringify({
    'legacy-user': { response: 'available', label: 'Legacy Beta Player', userId: 'legacy-user', playerId: 'legacy-user', legacyPlayerId: '' },
  }));

  // Default-club coach still sees the legacy record (fallback preserved) —
  // seed a default-team coach membership + session directly.
  const session = await store.createSession({ userId: 'coach-demo', teamId: DEFAULT_TEAM.id, role: 'coach' });
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.push({ id: 'tm-cd', teamId: DEFAULT_TEAM.id, userId: 'coach-demo', role: 'coach', status: 'active' });
  kv.set('app:identity:team_members', JSON.stringify(members));
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  users.push({ id: 'coach-demo', email: 'cd@iso.test', displayName: 'Coach Demo' });
  kv.set('app:identity:users', JSON.stringify(users));

  const seenDefault = rawRows(await call('GET', { sessionId: 'tue' }, null, `${SESSION_COOKIE}=${encodeURIComponent(session.token)}`));
  assert.equal(seenDefault.length, 1, 'default club reads its legacy beta data');
  assert.equal(seenDefault[0].userId, 'legacy-user');

  // …but another club NEVER falls back to the global bucket.
  const seenB = rawRows(await call('GET', { sessionId: 'tue' }, null, ck(B.session)));
  assert.equal(seenB.length, 0, 'non-default club gets no legacy fallback');

  // After the default club writes (scoped), the scoped key masks legacy on reads.
  kv.set(`app:availability:${DEFAULT_TEAM.id}:tue`, JSON.stringify({}));
  const afterMask = rawRows(await call('GET', { sessionId: 'tue' }, null, `${SESSION_COOKIE}=${encodeURIComponent(session.token)}`));
  assert.equal(afterMask.length, 0, 'scoped store masks the flat legacy key');
});
