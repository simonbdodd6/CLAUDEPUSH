/**
 * Phase 25E — the coach Availability read is driven by the AUTHENTICATED session
 * (requireTenantPermission), never an unauthenticated/coach-demo fallback. Drives
 * the REAL api/availability + identity store (mocked Upstash).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.identity-auth.test';
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

function res() {
  return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader() {}, end() { return this; } };
}
async function call(method, query, body, cookie) {
  const r = res();
  await availability({ method, query: query || {}, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
let _t = 0;
async function inviteAndRegister(teamId, name, email) {
  const token = 'TOK' + (++_t) + 'ABCDEFGH';
  kv.set('ce:invites', JSON.stringify([{ token, email, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  return store.claimInvite({ token, email, name, password: 'password123' });
}

test('Availability GET requires an authenticated coach (no session → rejected)', async () => {
  kv.clear(); _t = 0;
  const noAuth = await call('GET', { sessionId: 'game' }, null, null);
  assert.equal(noAuth.statusCode >= 400, true, 'unauthenticated GET is rejected, never silently coach-demo');
  assert.ok(noAuth.body?.error, 'returns an auth error');
});

test('Availability GET uses the AUTHENTICATED coach session (real coach, not coach-demo)', async () => {
  kv.clear(); _t = 0;
  const club = await store.createClub({ clubName: 'Trial Club 4', teamName: 'Trial Club 4', sport: 'rugby', name: 'Real Coach', email: 'real@trial4.test', password: 'password123' });
  const realCoachId = club.user.id;
  assert.ok(String(realCoachId).startsWith('user_'), 'real coach is a permanent user id, not coach-demo');
  assert.notEqual(realCoachId, 'coach-demo');

  const player = await inviteAndRegister(club.team.id, 'Newest Test Player', 'newest@trial4.test');
  await call('POST', {}, { sessionId: 'game', response: 'available', reason: '' }, ck(player.session));

  // The authenticated coach reads back the reply for THEIR team.
  const board = await call('GET', { sessionId: 'game' }, null, ck(club.session));
  assert.equal(board.statusCode, 200);
  const labels = (board.body.responses || []).map(e => e.label);
  assert.ok(labels.includes('Newest Test Player'), 'authenticated coach sees their team reply');
});
