/**
 * Availability stale-sync regression — repeated updates on the same player/session.
 *
 * Invariant: for the same teamId + sessionId + userId, the LATEST saved response
 * wins everywhere — player self-read (myResponse), coach board (resolveRoster, by
 * userId AND legacyPlayerId), and on every re-read. Drives the REAL api/availability
 * + identity store against a mocked Upstash (with SCAN). Plus a static check that
 * the coach board refreshes on tab return (the client half of the fix).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.repeated.test';
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
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function call(method, query, body, cookie) { const r = res(); await availability({ method, query: query || {}, headers: cookie ? { cookie } : {}, body: body || {} }, r); return r; }
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
let _t = 0;
async function cleanClub() { return store.createClub({ clubName: 'REPEAT test club', teamName: 'Seniors', sport: 'rugby', name: 'Repeat Coach', email: `rc${++_t}@repeat.test`, password: 'password123' }); }
async function reg(teamId, name, email) {
  const token = 'TK' + String(++_t).padStart(8, '0'); // legacyPlayerId = inv-<last8>, unique
  kv.set('ce:invites', JSON.stringify([{ token, email, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  return store.claimInvite({ token, email, name, password: 'password123' });
}
const publish = (teamId, sessions) => kv.set(`app:publish:${teamId}:sessions`, JSON.stringify(sessions));
const selfView = r => r.body?.responses || {};
const coachViewFor = (r, id) => (r.body?.resolved || {})[String(id).toLowerCase()] || {};

async function setup() {
  kv.clear(); _t = 0;
  const club = await cleanClub();
  publish(club.team.id, [{ id: 'tue', title: 'Tuesday' }, { id: 'thu', title: 'Thursday' }, { id: 'game', title: 'Match' }]);
  const player = await reg(club.team.id, 'Repeat Player', 'rp@repeat.test');
  return { club, player, userId: player.user.id };
}

test('repeated updates on the SAME session: latest wins in self-read AND coach board', async () => {
  const { club, player, userId } = await setup();
  for (const resp of ['available', 'maybe', 'available', 'unavailable', 'maybe']) {
    await call('POST', {}, { sessionId: 'tue', response: resp }, ck(player.session));
    const self  = selfView(await call('GET', { myResponse: '1' }, null, ck(player.session)));
    const board = coachViewFor(await call('GET', { resolveRoster: '1' }, null, ck(club.session)), userId);
    assert.equal(self.tue?.response, resp, `self-read should be latest (${resp})`);
    assert.equal(board.tue?.response, resp, `coach board should be latest (${resp})`);
  }
});

test('interleaved updates across 3 sessions: every layer reflects the latest per session', async () => {
  const { club, player, userId } = await setup();
  const seq = [['tue','available'],['thu','maybe'],['game','available'],['tue','maybe'],['thu','unavailable'],['game','unavailable'],['tue','available'],['thu','available'],['game','maybe']];
  const latest = {};
  for (const [sid, resp] of seq) {
    await call('POST', {}, { sessionId: sid, response: resp }, ck(player.session));
    latest[sid] = resp;
    const self  = selfView(await call('GET', { myResponse: '1' }, null, ck(player.session)));
    const board = coachViewFor(await call('GET', { resolveRoster: '1' }, null, ck(club.session)), userId);
    for (const s of Object.keys(latest)) {
      assert.equal(self[s]?.response, latest[s], `self ${s} latest`);
      assert.equal(board[s]?.response, latest[s], `board ${s} latest`);
    }
  }
});

test('coach board resolves by legacyPlayerId too after repeated updates', async () => {
  const { club, player } = await setup();
  const legacy = player.playerProfile.legacyPlayerId;
  await call('POST', {}, { sessionId: 'tue', response: 'maybe' }, ck(player.session));
  await call('POST', {}, { sessionId: 'tue', response: 'available' }, ck(player.session));
  const board = coachViewFor(await call('GET', { resolveRoster: '1' }, null, ck(club.session)), legacy);
  assert.equal(board.tue?.response, 'available', 'latest wins via legacyPlayerId match');
});

test('re-reading the coach board is stable (no flip-flop between stored entries)', async () => {
  const { club, player, userId } = await setup();
  await call('POST', {}, { sessionId: 'game', response: 'unavailable' }, ck(player.session));
  const reads = [];
  for (let i = 0; i < 5; i++) reads.push(coachViewFor(await call('GET', { resolveRoster: '1' }, null, ck(club.session)), userId).game?.response);
  assert.deepEqual(reads, ['unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable']);
});

test('a single stored entry per session+user — POST overwrites, never appends', async () => {
  const { club, player, userId } = await setup();
  for (const resp of ['available', 'maybe', 'unavailable']) {
    await call('POST', {}, { sessionId: 'tue', response: resp }, ck(player.session));
  }
  // The raw store for session 'tue' must hold exactly ONE entry for this player.
  const raw = JSON.parse(kv.get('app:availability:tue') || '{}');
  const mine = Object.values(raw).filter(v => v && (v.userId === userId));
  assert.equal(mine.length, 1, 'exactly one entry for the player (overwrite, not append)');
  assert.equal(mine[0].response, 'unavailable', 'and it is the latest value');
});

test('client: coach Availability board refreshes on tab return (visibility/focus)', () => {
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(src, /function refreshAvailabilityOnReturn\s*\(\)/, 'focus/visibility refresh helper exists');
  assert.match(src, /refreshAvailabilityOnReturn[\s\S]{0,220}refreshLiveAvailability\(\)/, 'helper calls refreshLiveAvailability');
  assert.match(src, /window\.addEventListener\('focus',\s*refreshAvailabilityOnReturn\)/, 'wired to window focus');
  assert.match(src, /visibilitychange[\s\S]{0,140}refreshAvailabilityOnReturn\(\)/, 'wired to visibilitychange');
});
