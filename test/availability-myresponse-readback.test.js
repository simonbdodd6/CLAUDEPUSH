/**
 * Phase 25H — the player self-read (/api/availability?myResponse=1) must return the
 * player's latest saved answer regardless of which sessionId it was stored under.
 *
 * Root cause (proven): POST stores under whatever sessionId the client sends; the
 * read constrained itself to the coach's PUBLISHED session-id list, so an answer
 * saved under a stale/custom sessionId was never read → {}.
 *
 * Fix (read path only, shared primitive): loadAvailabilityForIdentity() scans every
 * availability key and returns the player's answers by identity. POST/write and the
 * storage format are unchanged; the coach single-session GET is unchanged.
 *
 * Drives the REAL api/availability + identity store (mocked Upstash WITH SCAN).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.readback2.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
function globToRe(p) { return new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); }
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: availability } = await import('../api/availability.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(d){this.body=d;return this;}, setHeader(){}, end(){return this;} }; }
async function call(method, query, body, cookie) { const r = res(); await availability({ method, query: query||{}, headers: cookie?{cookie}:{}, body: body||{} }, r); return r; }
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
let _t = 0;
async function cleanClub() { return store.createClub({ clubName: 'MAJOR test club', teamName: 'senior mens BETA', sport: 'rugby', name: 'Beta Coach', email: `bc${++_t}@major.test`, password: 'password123' }); }
async function reg(teamId, name, email) {
  // legacyPlayerId = inv-<token.slice(-8)>, so the last 8 chars must be UNIQUE per
  // player (production invite tokens are unique); pad the counter into them.
  const token = 'TK' + String(++_t).padStart(8, '0');
  kv.set('ce:invites', JSON.stringify([{ token, email, name, role:'player', teamId, status:'pending', expiresAt:new Date(Date.now()+9e7).toISOString() }]));
  return store.claimInvite({ token, email, name, password: 'password123' });
}
function publish(teamId, sessions) { kv.set(`app:publish:${teamId}:sessions`, JSON.stringify(sessions)); }
const my = r => r.body?.responses || {};

test('3. current sessions: player saves tue/thu/game; myResponse returns all three', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  publish(club.team.id, [{id:'tue',title:'Training session 1'},{id:'thu',title:'Training session 2'},{id:'game',title:'Match'}]);
  const p = await reg(club.team.id, 'Beta Player', 'bp@major.test');
  await call('POST', {}, { sessionId:'tue',  response:'available',   reason:'' }, ck(p.session));
  await call('POST', {}, { sessionId:'thu',  response:'maybe',       reason:'work' }, ck(p.session));
  await call('POST', {}, { sessionId:'game', response:'unavailable', reason:'injury' }, ck(p.session));
  const r = my(await call('GET', { myResponse:'1' }, null, ck(p.session)));
  assert.equal(r.tue?.response, 'available');
  assert.equal(r.thu?.response, 'maybe');
  assert.equal(r.game?.response, 'unavailable');
});

test('1. stale sessionId: answer under an id NOT in the published list is still read back', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  publish(club.team.id, [{id:'s-1',title:'Training session 1'},{id:'s-2',title:'Training session 2'},{id:'game',title:'Match'}]);
  const p = await reg(club.team.id, 'Beta Player', 'bp1@major.test');
  // Player app posts under a stale/custom id the published list no longer contains.
  await call('POST', {}, { sessionId:'s-OLD', response:'maybe', reason:'' }, ck(p.session));
  const r = my(await call('GET', { myResponse:'1' }, null, ck(p.session)));
  assert.equal(r['s-OLD']?.response, 'maybe', 'read-back finds the stale-id answer (was {} before the fix)');
});

test('2. republished sessions: coach republishes new ids; old answer still read back', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  publish(club.team.id, [{id:'old-1',title:'Training session 1'}]);
  const p = await reg(club.team.id, 'Beta Player', 'bp2@major.test');
  await call('POST', {}, { sessionId:'old-1', response:'available', reason:'' }, ck(p.session));
  publish(club.team.id, [{id:'new-1',title:'Training session 1'}]);   // coach republishes with a new id
  const r = my(await call('GET', { myResponse:'1' }, null, ck(p.session)));
  assert.equal(r['old-1']?.response, 'available', 'answer saved under the old id survives republish');
});

test('4. player saves BEFORE republish → still visible after republish', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  publish(club.team.id, [{id:'pre-1',title:'Training session 1'}]);
  const p = await reg(club.team.id, 'Beta Player', 'bp4@major.test');
  await call('POST', {}, { sessionId:'pre-1', response:'maybe', reason:'' }, ck(p.session)); // save first
  publish(club.team.id, [{id:'post-1',title:'Training session 1'}]);                          // then republish
  const r = my(await call('GET', { myResponse:'1' }, null, ck(p.session)));
  assert.equal(r['pre-1']?.response, 'maybe');
});

test('5. player saves AFTER republish → visible immediately', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  publish(club.team.id, [{id:'pre-1',title:'Training session 1'}]);
  const p = await reg(club.team.id, 'Beta Player', 'bp5@major.test');
  publish(club.team.id, [{id:'post-1',title:'Training session 1'}]);                          // republish first
  await call('POST', {}, { sessionId:'post-1', response:'unavailable', reason:'' }, ck(p.session)); // then save
  const r = my(await call('GET', { myResponse:'1' }, null, ck(p.session)));
  assert.equal(r['post-1']?.response, 'unavailable');
});

test('6. coach board reflects player responses: coach GET for the answered session shows the player', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  publish(club.team.id, [{id:'tue',title:'Training session 1'},{id:'game',title:'Match'}]);
  const p = await reg(club.team.id, 'Beta Player', 'bp6@major.test');
  await call('POST', {}, { sessionId:'game', response:'available', reason:'' }, ck(p.session));
  const board = await call('GET', { sessionId:'game' }, null, ck(club.session));
  assert.equal(board.statusCode, 200);
  assert.ok((board.body.responses || []).some(e => e.label === 'Beta Player' && e.response === 'available'));
});

test('7. no regression: available → maybe → unavailable read-back tracks the latest', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  publish(club.team.id, [{id:'tue',title:'Training session 1'}]);
  const p = await reg(club.team.id, 'Beta Player', 'bp7@major.test');
  await call('POST', {}, { sessionId:'tue', response:'available', reason:'' }, ck(p.session));
  assert.equal(my(await call('GET', { myResponse:'1' }, null, ck(p.session))).tue?.response, 'available');
  await call('POST', {}, { sessionId:'tue', response:'maybe', reason:'' }, ck(p.session));
  assert.equal(my(await call('GET', { myResponse:'1' }, null, ck(p.session))).tue?.response, 'maybe');
  await call('POST', {}, { sessionId:'tue', response:'unavailable', reason:'' }, ck(p.session));
  assert.equal(my(await call('GET', { myResponse:'1' }, null, ck(p.session))).tue?.response, 'unavailable');
});

test('isolation: myResponse returns only THIS player\'s answers', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  publish(club.team.id, [{id:'tue',title:'T1'}]);
  const a = await reg(club.team.id, 'Player A', 'a@major.test');
  const b = await reg(club.team.id, 'Player B', 'b@major.test');
  await call('POST', {}, { sessionId:'tue', response:'available',   reason:'' }, ck(a.session));
  await call('POST', {}, { sessionId:'tue', response:'unavailable', reason:'' }, ck(b.session));
  assert.equal(my(await call('GET', { myResponse:'1' }, null, ck(a.session))).tue?.response, 'available');
  assert.equal(my(await call('GET', { myResponse:'1' }, null, ck(b.session))).tue?.response, 'unavailable');
});
