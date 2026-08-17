/**
 * AVAILABILITY WRITE TENANT WALL — the session-less / default-club write
 * fallback is CLOSED.
 *
 * Real production evidence (Loic Potier investigation): a stale client with an
 * expired session POSTed an availability answer carrying only its push
 * endpoint, and the handler resolved identity from the subscription and wrote
 * into the DEFAULT club's keyspace. In a multi-club world that is a
 * cross-tenant write. The contract these tests pin:
 *
 *   EVERY availability WRITE requires an authenticated session; club AND
 *   group derive from the caller's own server-side membership; a missing or
 *   expired session gets a clear 401 and writes NOTHING anywhere; no body
 *   field (endpoint / teamId / group) can redirect a write; reads keep their
 *   documented legacy fallbacks unchanged.
 *
 * All sixteen proofs drive the REAL api/availability handler and the REAL
 * identity store against a mocked Upstash (with SCAN) — no security logic is
 * reimplemented in test code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.tenant-wall.test';
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
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Coach`, email: `c${++_t}@wall.test`, password: 'password123' });
}
async function reg(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email: `p${_t}@wall.test`, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return store.claimInvite({ token, email: `p${_t}@wall.test`, name, password: 'password123' });
}
const snapshot = () => new Map([...kv.entries()]);
const assertUnchanged = (before, label) => assert.deepEqual([...kv.entries()].sort(), [...before.entries()].sort(), label);
const keysUnder = prefix => [...kv.keys()].filter(k => k.startsWith(prefix));

async function twoClubs() {
  kv.clear(); _t = 0;
  const A = await makeClub('Alpha');
  const B = await makeClub('Bravo');
  const pa = await reg(A.team.id, 'Alpha Player');
  const pb = await reg(B.team.id, 'Bravo Player');
  return { A, B, pa, pb };
}

// ── A three-group club, seeded in the d1b shape (direct records) ────────────
const MG = 'club-wall-mg';
const SEN = 'grp-sen', U18 = 'grp-u18', WOM = 'grp-wom';
async function multiGroupClub() {
  kv.set('app:identity:teams', JSON.stringify([...JSON.parse(kv.get('app:identity:teams') || '[]'),
    { id: MG, name: 'Wall MG Club' }]));
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.push(
    { id: 'm-w-sen', teamId: MG, userId: 'u-w-sen', role: 'player', status: 'active', playerGroupId: SEN },
    { id: 'm-w-u18', teamId: MG, userId: 'u-w-u18', role: 'player', status: 'active', playerGroupId: U18 },
    { id: 'm-w-wom', teamId: MG, userId: 'u-w-wom', role: 'player', status: 'active', playerGroupId: WOM },
  );
  kv.set('app:identity:team_members', JSON.stringify(members));
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  users.push(
    { id: 'u-w-sen', email: 'wsen@wall.test', displayName: 'Wall Sen' },
    { id: 'u-w-u18', email: 'wu18@wall.test', displayName: 'Wall U18' },
    { id: 'u-w-wom', email: 'wwom@wall.test', displayName: 'Wall Wom' },
  );
  kv.set('app:identity:users', JSON.stringify(users));
  kv.set(`app:structure:${MG}`, JSON.stringify({
    version: 1,
    groups: [
      { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
      { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
      { id: WOM, name: "Women's", type: 'general', status: 'active' },
    ],
    teams: [
      { id: 't-w-sen', groupId: SEN, name: 'Premier', status: 'active' },
      { id: 't-w-u18', groupId: U18, name: 'U18 Premier', status: 'active' },
      { id: 't-w-wom', groupId: WOM, name: "Women's Premier", status: 'active' },
    ],
  }));
  const mk = (userId) => store.createSession({ userId, teamId: MG, role: 'player' });
  return { sen: await mk('u-w-sen'), u18: await mk('u-w-u18'), wom: await mk('u-w-wom') };
}

// ─── 1 + 2 — authenticated writes land in the writer's OWN club only ────────
test('1+2: Club A and Club B players each write into their own club keyspace only', async () => {
  const { A, B, pa, pb } = await twoClubs();
  const ra = await call('POST', {}, { sessionId: 'tue', response: 'available' }, ck(pa.session));
  const rb = await call('POST', {}, { sessionId: 'tue', response: 'maybe' }, ck(pb.session));
  assert.equal(ra.statusCode, 200); assert.equal(rb.statusCode, 200);

  const aKeys = keysUnder(`app:availability:${A.team.id}:`);
  const bKeys = keysUnder(`app:availability:${B.team.id}:`);
  assert.equal(aKeys.length, 1, 'exactly one scoped record for club A');
  assert.equal(bKeys.length, 1, 'exactly one scoped record for club B');
  assert.ok(Object.values(JSON.parse(kv.get(aKeys[0]))).some(v => v.userId === pa.user.id), 'A\'s answer under A');
  assert.ok(Object.values(JSON.parse(kv.get(bKeys[0]))).some(v => v.userId === pb.user.id), 'B\'s answer under B');
  assert.equal(kv.has('app:availability:tue'), false, 'flat global key untouched');
  assert.equal(keysUnder(`app:availability:${DEFAULT_TEAM.id}:`).length, 0, 'default club untouched');
});

// ─── 3 + 4 — missing session: refused, and the OLD fallback shape is dead ───
test('3+4: no session cannot write to any club — even with a registered push endpoint (the exact Loic shape)', async () => {
  const { pa } = await twoClubs();
  // Arm the OLD path as strongly as possible: the endpoint IS registered.
  kv.set('app:subscriptions', JSON.stringify([{
    subscription: { endpoint: 'e-stale-client' },
    userId: pa.user.id, playerId: pa.user.id, legacyPlayerId: '', label: 'Stale Client',
  }]));
  const before = snapshot();
  const r = await call('POST', {}, { endpoint: 'e-stale-client', sessionId: 'game', response: 'available' });
  assert.equal(r.statusCode, 401, 'clear auth failure, not a silent fallback');
  assert.equal(r.body?.code, 'session_required');
  assertUnchanged(before, 'ZERO storage mutations');
  assert.equal(keysUnder(`app:availability:${DEFAULT_TEAM.id}:`).length, 0, 'default club got nothing');
  assert.equal(keysUnder('app:availability:').length, 0, 'no club got anything');
});

// ─── 5 — expired/invalid session cannot write anywhere ──────────────────────
test('5: an invalid/expired session token is a 401 with zero mutations', async () => {
  await twoClubs();
  const before = snapshot();
  const r = await call('POST', {}, { sessionId: 'tue', response: 'available' },
    `${SESSION_COOKIE}=${encodeURIComponent('sess_expired_beyond_recovery')}`);
  assert.equal(r.statusCode, 401);
  assertUnchanged(before, 'expired session writes nothing');
});

// ─── 6 — forged teamId in the body is inert ─────────────────────────────────
test('6: a Club A session posting a forged Club B teamId still writes only to Club A', async () => {
  const { A, B, pa } = await twoClubs();
  const r = await call('POST', {}, { sessionId: 'tue', response: 'available', teamId: B.team.id, clubId: B.team.id }, ck(pa.session));
  assert.equal(r.statusCode, 200);
  assert.equal(keysUnder(`app:availability:${B.team.id}:`).length, 0, 'club B untouched');
  assert.equal(keysUnder(`app:availability:${A.team.id}:`).length, 1, 'write landed in the session club');
});

// ─── 7 — forged group id in the body is inert ───────────────────────────────
test('7: a forged group id cannot move a write out of the player\'s own group', async () => {
  kv.clear(); _t = 0;
  const s = await multiGroupClub();
  const r = await call('POST', {}, { sessionId: 'tue', response: 'available', group: U18, groupId: U18 }, ck(s.sen));
  assert.equal(r.statusCode, 200);
  assert.equal(kv.has(`app:availability:${MG}:group:${SEN}:tue`), true, 'landed in the SESSION-derived group');
  assert.equal(kv.has(`app:availability:${MG}:group:${U18}:tue`), false, 'forged group untouched');
});

// ─── 8 + 9 + 10 — each group's answers stay within that group ───────────────
test('8+9+10: Seniors, U18 and Women\'s answers each live only in their own group key', async () => {
  kv.clear(); _t = 0;
  const s = await multiGroupClub();
  await call('POST', {}, { sessionId: 'slot_1-20260818', response: 'available' }, ck(s.sen));
  await call('POST', {}, { sessionId: 'slot_1-20260818', response: 'maybe' }, ck(s.u18));
  await call('POST', {}, { sessionId: 'slot_1-20260818', response: 'unavailable' }, ck(s.wom));

  const read = gid => JSON.parse(kv.get(`app:availability:${MG}:group:${gid}:slot_1-20260818`) || '{}');
  const ids = rec => Object.values(rec).map(v => v.userId);
  assert.deepEqual(ids(read(SEN)), ['u-w-sen'], 'Seniors key holds exactly the Seniors answer');
  assert.deepEqual(ids(read(U18)), ['u-w-u18'], 'U18 key holds exactly the U18 answer');
  assert.deepEqual(ids(read(WOM)), ['u-w-wom'], 'Women\'s key holds exactly the Women\'s answer');
});

// ─── 11 + 12 — dated training and fixture answers still work end-to-end ─────
test('11+12: dated training and game answers save and resolve onto the coach board', async () => {
  const { A, pa } = await twoClubs();
  const dated = await call('POST', {}, { sessionId: 'slot_2-20260819', response: 'available' }, ck(pa.session));
  const game  = await call('POST', {}, { sessionId: 'game-20260822', response: 'maybe', reason: '' }, ck(pa.session));
  assert.equal(dated.statusCode, 200); assert.equal(game.statusCode, 200);

  const board = (await call('GET', { resolveRoster: '1' }, null, ck(A.session))).body?.resolved || {};
  const mine = board[String(pa.user.id).toLowerCase()];
  assert.equal(mine?.['slot_2-20260819']?.response, 'available', 'dated training answer on the board');
  assert.equal(mine?.['game-20260822']?.response, 'maybe', 'fixture answer on the board');
});

// ─── 13 — bulk "available to all" is N authenticated writes that all land ───
test('13: bulk availability through the authenticated path saves every session', async () => {
  const { A, pa } = await twoClubs();
  const sessions = ['slot_1-20260818', 'slot_2-20260819', 'game-20260822'];
  for (const sid of sessions) {
    const r = await call('POST', {}, { sessionId: sid, response: 'available' }, ck(pa.session));
    assert.equal(r.statusCode, 200, `bulk save ${sid}`);
  }
  const self = (await call('GET', { myResponse: '1' }, null, ck(pa.session))).body?.responses || {};
  assert.deepEqual(Object.keys(self).sort(), sessions.sort(), 'all bulk answers readable back');
});

// ─── 14 — legacy records stay readable exactly where they always were ───────
test('14: legacy flat beta data remains readable by the default club, and a rejected write never touches it', async () => {
  kv.clear(); _t = 0;
  kv.set('app:availability:tue', JSON.stringify({
    'legacy-user': { response: 'available', label: 'Legacy Beta Player', userId: 'legacy-user', playerId: 'legacy-user', legacyPlayerId: '' },
  }));
  const session = await store.createSession({ userId: 'coach-demo', teamId: DEFAULT_TEAM.id, role: 'coach' });
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-cd', teamId: DEFAULT_TEAM.id, userId: 'coach-demo', role: 'coach', status: 'active' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'coach-demo', email: 'cd@wall.test', displayName: 'Coach Demo' }]));

  const before = snapshot();
  const rejected = await call('POST', {}, { endpoint: 'e-any', sessionId: 'tue', response: 'unavailable' });
  assert.equal(rejected.statusCode, 401);
  assertUnchanged(before, 'stray/legacy records untouched by the refusal');

  const rows = (await call('GET', { sessionId: 'tue' }, null, `${SESSION_COOKIE}=${encodeURIComponent(session.token)}`)).body?.responses || [];
  assert.equal(rows.length, 1, 'default club still reads its legacy beta data');
  assert.equal(rows[0].userId, 'legacy-user');
});

// ─── 15 — a rejected write is ZERO mutations, byte for byte ─────────────────
test('15: every refused write shape leaves storage byte-identical', async () => {
  const { B, pa } = await twoClubs();
  await call('POST', {}, { sessionId: 'tue', response: 'available' }, ck(pa.session)); // some real data first
  const before = snapshot();
  await call('POST', {}, { sessionId: 'tue', response: 'maybe' });                                  // no session
  await call('POST', {}, { endpoint: 'e-x', sessionId: 'tue', response: 'maybe' });                 // old client shape
  await call('POST', {}, { sessionId: 'tue', response: 'maybe' }, `${SESSION_COOKIE}=zzz`);         // garbage token
  await call('POST', {}, { sessionId: 'bad id!', response: 'maybe' }, ck(pa.session));              // invalid session id
  await call('POST', {}, { sessionId: 'tue', response: 'not-a-response' }, ck(pa.session));         // invalid response
  await call('POST', {}, { action: 'clear_week' }, ck(pa.session));                                 // player forging a coach action
  assertUnchanged(before, 'no refused shape mutated anything');
  assert.equal(keysUnder(`app:availability:${B.team.id}:`).length, 0, 'club B never gained a record');
});

// ─── 16 — coach-board identity matching is unchanged ────────────────────────
test('16: the coach board still matches answers by userId AND legacyPlayerId', async () => {
  const { A, pa } = await twoClubs();
  await call('POST', {}, { sessionId: 'tue', response: 'available' }, ck(pa.session));
  const board = (await call('GET', { resolveRoster: '1' }, null, ck(A.session))).body?.resolved || {};
  const byUser = board[String(pa.user.id).toLowerCase()];
  assert.equal(byUser?.tue?.response, 'available', 'keyed by permanent userId');
  const legacy = String(pa.playerProfile?.legacyPlayerId || '').toLowerCase();
  assert.ok(legacy.startsWith('inv-'), 'claimed player has an invite-era id');
  assert.equal(board[legacy]?.tue?.response, 'available', 'ALSO keyed by legacyPlayerId — roster rows keyed by invite id still match');
});
