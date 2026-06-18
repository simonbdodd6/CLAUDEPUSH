/**
 * Phase 25G — a player's own /api/availability?myResponse=1 must read back every
 * answer they saved, including answers stored under a sessionId that is NOT in the
 * coach's published set.
 *
 * Root cause (proven): POST stores under whatever sessionId the client sends (the
 * player's schedule may still carry the default tue/thu/game). myResponse only
 * read activeSessionIds(teamId) — the coach's PUBLISHED ids — so an answer saved
 * under "tue" while the team publishes custom ids was never read → returned {}
 * (the player's own read-back, and the coach board, both missed it).
 *
 * Fix: myResponse reads the UNION of the published ids and the default sessions
 * (the universe the client can post under). Drives the REAL api/availability.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.readback.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') r = ['0', []];
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: availability } = await import('../api/availability.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(d){this.body=d;return this;}, setHeader(){}, end(){return this;} }; }
async function call(method, query, body, cookie) { const r = res(); await availability({ method, query: query||{}, headers: cookie?{cookie}:{}, body: body||{} }, r); return r; }
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
let _t = 0;
async function cleanClub() {
  return store.createClub({ clubName: 'MAJOR test club', teamName: 'senior mens BETA', sport: 'rugby', name: 'Beta Coach', email: `betacoach${++_t}@major.test`, password: 'password123' });
}
async function inviteAndRegister(teamId, name, email) {
  const token = 'TOK' + (++_t) + 'ABCDEFGH';
  kv.set('ce:invites', JSON.stringify([{ token, email, name, role:'player', teamId, status:'pending', expiresAt:new Date(Date.now()+9e7).toISOString() }]));
  return store.claimInvite({ token, email, name, password: 'password123' });
}
const myResponses = r => r.body?.responses || {};

test('authenticated clean-club player saves tue/thu/game; myResponse returns all three', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  const player = await inviteAndRegister(club.team.id, 'Beta Player', 'bp@major.test');
  await call('POST', {}, { sessionId: 'tue',  response: 'available',   reason: '' }, ck(player.session));
  await call('POST', {}, { sessionId: 'thu',  response: 'maybe',       reason: 'work' }, ck(player.session));
  await call('POST', {}, { sessionId: 'game', response: 'unavailable', reason: 'injury' }, ck(player.session));

  const my = myResponses(await call('GET', { myResponse: '1' }, null, ck(player.session)));
  assert.equal(my.tue?.response, 'available');
  assert.equal(my.thu?.response, 'maybe');
  assert.equal(my.game?.response, 'unavailable');
});

test('changing available → maybe updates the read-back', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  const player = await inviteAndRegister(club.team.id, 'Beta Player', 'bp2@major.test');
  await call('POST', {}, { sessionId: 'tue', response: 'available', reason: '' }, ck(player.session));
  assert.equal(myResponses(await call('GET', { myResponse: '1' }, null, ck(player.session))).tue?.response, 'available');
  await call('POST', {}, { sessionId: 'tue', response: 'maybe', reason: '' }, ck(player.session));
  assert.equal(myResponses(await call('GET', { myResponse: '1' }, null, ck(player.session))).tue?.response, 'maybe');
});

test('changing maybe → unavailable updates the read-back', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  const player = await inviteAndRegister(club.team.id, 'Beta Player', 'bp3@major.test');
  await call('POST', {}, { sessionId: 'tue', response: 'maybe', reason: '' }, ck(player.session));
  assert.equal(myResponses(await call('GET', { myResponse: '1' }, null, ck(player.session))).tue?.response, 'maybe');
  await call('POST', {}, { sessionId: 'tue', response: 'unavailable', reason: '' }, ck(player.session));
  assert.equal(myResponses(await call('GET', { myResponse: '1' }, null, ck(player.session))).tue?.response, 'unavailable');
});

test('CRITICAL: answer saved under a default id is read back even when team publishes CUSTOM ids', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  // Coach published custom-id sessions (saveSessionForm slug ids); these drive activeSessionIds.
  kv.set(`app:publish:${club.team.id}:sessions`, JSON.stringify([
    { id: 'training-1-xyz', title: 'Training session 1' },
    { id: 'training-2-abc', title: 'Training session 2' },
    { id: 'game',           title: 'Match' },
  ]));
  const player = await inviteAndRegister(club.team.id, 'Beta Player', 'bp4@major.test');
  // Player app still posts under the default 'tue' (leftover/default schedule card).
  await call('POST', {}, { sessionId: 'tue', response: 'maybe', reason: '' }, ck(player.session));

  const my = myResponses(await call('GET', { myResponse: '1' }, null, ck(player.session)));
  assert.equal(my.tue?.response, 'maybe', 'read-back finds the default-id answer (no longer {} — this failed before the fix)');
});

test('coach GET (single session) still works after the fix', async () => {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  const player = await inviteAndRegister(club.team.id, 'Beta Player', 'bp5@major.test');
  await call('POST', {}, { sessionId: 'game', response: 'available', reason: '' }, ck(player.session));
  const board = await call('GET', { sessionId: 'game' }, null, ck(club.session));
  assert.equal(board.statusCode, 200);
  assert.ok((board.body.responses || []).some(e => e.label === 'Beta Player' && e.response === 'available'));
});
