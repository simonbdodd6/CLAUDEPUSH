/**
 * Phase 25I — ONE shared availability-resolution layer consumed by BOTH the player
 * self-read (myResponse) and the coach board (resolveRoster). Records exist once;
 * resolution exists once. Both sides resolve by identity across every stored
 * session, so stale / republished / custom session ids resolve identically.
 *
 * Drives the REAL api/availability + identity store (mocked Upstash WITH SCAN).
 * Write path and storage format are NOT exercised differently — only reads.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.shared-resolver.test';
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
  const token = 'TK' + String(++_t).padStart(8, '0'); // legacyPlayerId = inv-<last8>, unique
  kv.set('ce:invites', JSON.stringify([{ token, email, name, role:'player', teamId, status:'pending', expiresAt:new Date(Date.now()+9e7).toISOString() }]));
  return store.claimInvite({ token, email, name, password: 'password123' });
}
const publish = (teamId, sessions) => kv.set(`app:publish:${teamId}:sessions`, JSON.stringify(sessions));
const playerView = r => r.body?.responses || {};
// Coach's resolved view of one player, by their userId.
const coachViewFor = (r, userId) => (r.body?.resolved || {})[String(userId).toLowerCase()] || {};
const stripTs = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { response: v.response, reason: v.reason || '' }]));

async function setup(publishSessions) {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  if (publishSessions) publish(club.team.id, publishSessions);
  const player = await reg(club.team.id, 'Beta Player', 'bp@major.test');
  return { club, player, userId: player.user.id };
}

test('player and coach consume IDENTICAL resolved availability (current session)', async () => {
  const { club, player, userId } = await setup([{ id:'tue', title:'Training session 1' }]);
  await call('POST', {}, { sessionId:'tue', response:'maybe', reason:'work' }, ck(player.session));
  const pv = playerView(await call('GET', { myResponse:'1' }, null, ck(player.session)));
  const cv = coachViewFor(await call('GET', { resolveRoster:'1' }, null, ck(club.session)), userId);
  assert.deepEqual(stripTs(cv), pv, 'coach resolves the player identically to the player self-read');
  assert.equal(pv.tue?.response, 'maybe');
});

test('stale session id: resolves identically for player and coach', async () => {
  const { club, player, userId } = await setup([{ id:'s-1', title:'Training session 1' }]);
  await call('POST', {}, { sessionId:'s-OLD', response:'unavailable', reason:'' }, ck(player.session)); // not in published list
  const pv = playerView(await call('GET', { myResponse:'1' }, null, ck(player.session)));
  const cv = coachViewFor(await call('GET', { resolveRoster:'1' }, null, ck(club.session)), userId);
  assert.equal(pv['s-OLD']?.response, 'unavailable');
  assert.deepEqual(stripTs(cv), pv);
});

test('republished sessions: old answer resolves for both sides after republish', async () => {
  const { club, player, userId } = await setup([{ id:'old-1', title:'Training session 1' }]);
  await call('POST', {}, { sessionId:'old-1', response:'available', reason:'' }, ck(player.session));
  publish(club.team.id, [{ id:'new-1', title:'Training session 1' }]); // coach republishes new id
  const pv = playerView(await call('GET', { myResponse:'1' }, null, ck(player.session)));
  const cv = coachViewFor(await call('GET', { resolveRoster:'1' }, null, ck(club.session)), userId);
  assert.equal(pv['old-1']?.response, 'available');
  assert.deepEqual(stripTs(cv), pv);
});

test('player saves BEFORE republish → both resolve it after republish', async () => {
  const { club, player, userId } = await setup([{ id:'pre-1', title:'Training session 1' }]);
  await call('POST', {}, { sessionId:'pre-1', response:'maybe', reason:'' }, ck(player.session));
  publish(club.team.id, [{ id:'post-1', title:'Training session 1' }]);
  const pv = playerView(await call('GET', { myResponse:'1' }, null, ck(player.session)));
  const cv = coachViewFor(await call('GET', { resolveRoster:'1' }, null, ck(club.session)), userId);
  assert.equal(pv['pre-1']?.response, 'maybe');
  assert.deepEqual(stripTs(cv), pv);
});

test('player saves AFTER republish → both resolve it immediately', async () => {
  const { club, player, userId } = await setup([{ id:'pre-1', title:'Training session 1' }]);
  publish(club.team.id, [{ id:'post-1', title:'Training session 1' }]);
  await call('POST', {}, { sessionId:'post-1', response:'unavailable', reason:'' }, ck(player.session));
  const pv = playerView(await call('GET', { myResponse:'1' }, null, ck(player.session)));
  const cv = coachViewFor(await call('GET', { resolveRoster:'1' }, null, ck(club.session)), userId);
  assert.equal(pv['post-1']?.response, 'unavailable');
  assert.deepEqual(stripTs(cv), pv);
});

test('coach board reflects player responses (resolveRoster indexes by userId AND legacyPlayerId)', async () => {
  const { club, player, userId } = await setup([{ id:'game', title:'Match' }]);
  const legacy = player.playerProfile.legacyPlayerId;
  await call('POST', {}, { sessionId:'game', response:'available', reason:'' }, ck(player.session));
  const resolved = (await call('GET', { resolveRoster:'1' }, null, ck(club.session))).body.resolved;
  assert.equal(resolved[String(userId).toLowerCase()]?.game?.response, 'available', 'indexed by userId');
  assert.equal(resolved[String(legacy).toLowerCase()]?.game?.response, 'available', 'indexed by legacyPlayerId');
});

test('resolveRoster requires coach auth (no session → rejected)', async () => {
  await setup([{ id:'tue', title:'T1' }]);
  const r = await call('GET', { resolveRoster:'1' }, null, null);
  assert.ok(r.statusCode >= 400 && r.body?.error, 'unauthenticated resolveRoster is rejected');
});

test('NO regression: coach single-session GET (?sessionId=) still works', async () => {
  const { club, player } = await setup([{ id:'game', title:'Match' }]);
  await call('POST', {}, { sessionId:'game', response:'available', reason:'' }, ck(player.session));
  const board = await call('GET', { sessionId:'game' }, null, ck(club.session));
  assert.equal(board.statusCode, 200);
  assert.ok((board.body.responses || []).some(e => e.label === 'Beta Player' && e.response === 'available'));
});

test('coach board client wiring: refreshLiveAvailability consumes resolveRoster', () => {
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = src.match(/async function refreshLiveAvailability[\s\S]*?\n {4}}/);
  assert.ok(m, 'refreshLiveAvailability found');
  assert.match(m[0], /resolveRoster=1/, 'fetches the shared resolver endpoint');
  assert.doesNotMatch(m[0], /availability\?sessionId=/, 'no longer fetches per published sessionId');
});
