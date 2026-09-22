/**
 * PUSH SUBSCRIBE DELETION — api/subscribe.js DELETE
 *
 * A push subscription row is a routing record (see api-subscribe-identity):
 * push.js, cron.js and chat.js deliver to a device by the row's stored ids.
 * POST rebuilds that row wholly from the authenticated session, so the stored
 * userId is a trustworthy owner. The DELETE handler used to ignore all of that:
 * no session, no ownership check — any caller who knew an endpoint URL (which
 * is unguessable, but never a credential: the dev debug listing prints it and
 * every push report carries it) silently removed that device from delivery.
 *
 * The contract these tests pin:
 *   - deleting requires an authenticated, active session (401 otherwise, and
 *     the store is not written at all — not even a no-op rewrite)
 *   - only the row whose stored userId equals the session user is removed;
 *     body / query identity is ignored, and a session from another club owns
 *     nothing here
 *   - a row that is not the caller's is indistinguishable from a row that does
 *     not exist: same status, same body, nothing written (no existence oracle)
 *   - a legacy row with an empty userId has no owner and is removed by nobody
 *     through this path
 *   - a shared device rebound to another user by POST belongs to that user
 *   - the dev-only purge_empty and debug listing also require a session
 *   - the legitimate signed-in unsubscribe keeps working and is idempotent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.subdel.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const SUBS_KEY = 'app:subscriptions';
const kv = new Map();
let subsWrites = 0;
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { if (a[0] === SUBS_KEY) subsWrites += 1; kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: subscribeHandler } = await import('../api/subscribe.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB_A = 'club-alpha', CLUB_B = 'club-beta';
const MEMBERS = [
  { id: 'm-victim', teamId: CLUB_A, userId: 'u-victim', role: 'player', status: 'active' },
  { id: 'm-att', teamId: CLUB_A, userId: 'u-att', role: 'player', status: 'active' },
  { id: 'm-coach', teamId: CLUB_A, userId: 'u-coach', role: 'coach', staffLevel: 'head', status: 'active' },
  { id: 'm-b', teamId: CLUB_B, userId: 'u-b', role: 'player', status: 'active' },
  { id: 'm-gone', teamId: CLUB_A, userId: 'u-gone', role: 'player', status: 'removed' },
];
const USERS = [
  { id: 'u-victim', email: 'victim@c.test', displayName: 'Victor Victim' },
  { id: 'u-att', email: 'att@c.test', displayName: 'Atty Attacker' },
  { id: 'u-coach', email: 'coach@c.test', displayName: 'Cora Coach' },
  { id: 'u-b', email: 'b@c.test', displayName: 'Bea Beta' },
  { id: 'u-gone', email: 'gone@c.test', displayName: 'Gus Gone' },
];
const PROFILES = [
  { id: 'pp-victim', teamId: CLUB_A, userId: 'u-victim', legacyPlayerId: 'inv-victim', displayName: 'Victor Victim' },
  { id: 'pp-att', teamId: CLUB_A, userId: 'u-att', displayName: 'Atty Attacker' },
  { id: 'pp-b', teamId: CLUB_B, userId: 'u-b', displayName: 'Bea Beta' },
];

const cookies = new Map();
async function seed() {
  kv.clear(); cookies.clear(); subsWrites = 0;
  delete process.env.DEV_LOGIN;
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB_A, name: 'Alpha' }, { id: CLUB_B, name: 'Beta' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(USERS));
  kv.set('app:identity:player_profiles', JSON.stringify(PROFILES));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
    cookies.set(m.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}

function res() {
  const out = { code: 0, body: null };
  return {
    out,
    setHeader() {},
    status(c) { out.code = c; return this; },
    json(b) { out.body = b; return this; },
    end() { return this; },
  };
}
async function call(method, { as = null, body, query = {}, headers = {} } = {}) {
  const r = res();
  const h = { ...headers };
  if (as) h.cookie = cookies.get(as);
  await subscribeHandler({ method, query, headers: h, body }, r);
  return r.out;
}
const post = opts => call('POST', opts);
const del = opts => call('DELETE', opts);
const sub = endpoint => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
const stored = () => JSON.parse(kv.get(SUBS_KEY) || '[]');
const endpoints = () => stored().map(s => s.subscription.endpoint).sort();
const row = endpoint => stored().find(s => s.subscription.endpoint === endpoint);

// Two devices registered through the hardened POST, then the write counter is
// reset so each test measures only what DELETE itself writes.
async function registerVictimAndAttacker() {
  await post({ as: 'u-victim', body: { subscription: sub('ep-victim') } });
  await post({ as: 'u-att', body: { subscription: sub('ep-att') } });
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim']);
  subsWrites = 0;
}

// ── Authentication ──────────────────────────────────────────────────────────

test('unauthenticated delete is refused and writes nothing', async () => {
  await seed(); await registerVictimAndAttacker();
  const out = await del({ body: { endpoint: 'ep-victim' } });
  assert.equal(out.code, 401);
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim'], 'the victim device must still be registered');
  assert.equal(subsWrites, 0, 'an unauthenticated request must not write the store at all');
});

test('an invalid session token is refused', async () => {
  await seed(); await registerVictimAndAttacker();
  const out = await del({ body: { endpoint: 'ep-victim' }, headers: { cookie: `${SESSION_COOKIE}=not-a-real-token` } });
  assert.equal(out.code, 401);
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim']);
  assert.equal(subsWrites, 0);
});

test('a session without an active membership is refused', async () => {
  await seed(); await registerVictimAndAttacker();
  const out = await del({ as: 'u-gone', body: { endpoint: 'ep-victim' } });
  assert.equal(out.code, 401);
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim']);
  assert.equal(subsWrites, 0);
});

// ── Ownership ───────────────────────────────────────────────────────────────

test('the owner can delete their own device', async () => {
  await seed(); await registerVictimAndAttacker();
  const out = await del({ as: 'u-victim', body: { endpoint: 'ep-victim' } });
  assert.equal(out.code, 200);
  assert.equal(out.body.ok, true);
  assert.equal(out.body.removed, 1);
  assert.deepEqual(endpoints(), ['ep-att'], 'only the owner\'s row goes; the other device is untouched');
});

test('a non-owner in the same club cannot delete another member\'s device', async () => {
  await seed(); await registerVictimAndAttacker();
  const out = await del({ as: 'u-att', body: { endpoint: 'ep-victim' } });
  assert.notEqual(out.code, 401, 'the attacker is signed in; this is an ownership refusal, not an auth one');
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim'], 'the victim device must still be registered');
  assert.equal(subsWrites, 0, 'a refused delete must not rewrite the store');
});

test('spoofed body and query identity cannot claim another user\'s device', async () => {
  await seed(); await registerVictimAndAttacker();
  const forged = { userId: 'u-victim', playerId: 'u-victim', legacyPlayerId: 'inv-victim', label: 'Victor Victim', teamId: CLUB_A };
  const out = await del({ as: 'u-att', body: { endpoint: 'ep-victim', ...forged }, query: { ...forged } });
  assert.notEqual(out.code, 401);
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim']);
  assert.equal(subsWrites, 0);
});

test('a session from another club owns nothing here', async () => {
  await seed(); await registerVictimAndAttacker();
  const out = await del({ as: 'u-b', body: { endpoint: 'ep-victim', teamId: CLUB_A } });
  assert.notEqual(out.code, 401);
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim']);
  assert.equal(subsWrites, 0);
});

test('staff authority does not extend to other members\' devices', async () => {
  await seed(); await registerVictimAndAttacker();
  const out = await del({ as: 'u-coach', body: { endpoint: 'ep-victim' } });
  assert.notEqual(out.code, 401);
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim']);
  assert.equal(subsWrites, 0);
});

// ── No existence oracle ─────────────────────────────────────────────────────

test('a device that is not yours is indistinguishable from one that does not exist', async () => {
  await seed(); await registerVictimAndAttacker();
  const notMine = await del({ as: 'u-att', body: { endpoint: 'ep-victim' } });
  const missing = await del({ as: 'u-att', body: { endpoint: 'ep-nobody' } });
  assert.equal(notMine.code, missing.code);
  assert.deepEqual(notMine.body, missing.body, 'the response must not reveal whether ep-victim is registered');
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim']);
  assert.equal(subsWrites, 0, 'neither probe may write the store');
});

test('deleting a nonexistent subscription writes nothing', async () => {
  await seed(); await registerVictimAndAttacker();
  const out = await del({ as: 'u-victim', body: { endpoint: 'ep-nobody' } });
  assert.equal(out.code, 200);
  assert.equal(out.body.removed, 0);
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim']);
  assert.equal(subsWrites, 0);
});

// ── Malformed requests ──────────────────────────────────────────────────────

test('a malformed request is a 400 and writes nothing', async () => {
  await seed(); await registerVictimAndAttacker();
  for (const body of [undefined, {}, { endpoint: '' }, { endpoint: 42 }, { endpoint: { $ne: '' } }, { endpoint: ['ep-victim'] }]) {
    const out = await del({ as: 'u-victim', body });
    assert.equal(out.code, 400, `body ${JSON.stringify(body)} must be rejected`);
  }
  assert.deepEqual(endpoints(), ['ep-att', 'ep-victim']);
  assert.equal(subsWrites, 0);
});

test('a malformed unauthenticated request is refused before anything else', async () => {
  await seed(); await registerVictimAndAttacker();
  const out = await del({ body: {} });
  assert.equal(out.code, 401);
  assert.equal(subsWrites, 0);
});

// ── Legacy rows and shared devices ──────────────────────────────────────────

test('a legacy row with an empty userId has no owner and is removed by nobody', async () => {
  await seed();
  // Registered before POST was hardened, when a silent session left every id blank.
  kv.set(SUBS_KEY, JSON.stringify([
    { subscription: sub('ep-legacy'), label: 'Player', userId: '', playerId: '', legacyPlayerId: '', savedAt: null },
  ]));
  subsWrites = 0;
  for (const as of ['u-victim', 'u-att', 'u-coach', 'u-b']) {
    const out = await del({ as, body: { endpoint: 'ep-legacy', userId: '' } });
    assert.notEqual(out.code, 401);
    assert.equal(out.body?.removed, 0, `${as} must not be able to claim the ownerless row`);
  }
  assert.deepEqual(endpoints(), ['ep-legacy']);
  assert.equal(subsWrites, 0);
});

/**
 * CONTRACT CHANGE. This used to let a second user rebind a shared device by
 * re-POSTing its endpoint, and pinned that the new owner could then delete it.
 * That rebind was the takeover path (POST then DELETE), so POST now refuses it
 * — which means the device's FIRST owner keeps it until the browser issues a
 * fresh endpoint. See test/api-subscribe-ownership.js.
 */
test('a device stays with its owner; a second user cannot take it over', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-shared') } });
  const rebind = await post({ as: 'u-att', body: { subscription: sub('ep-shared') } });
  assert.equal(rebind.code, 409, 'the rebind is refused');
  assert.equal(row('ep-shared').userId, 'u-victim', 'ownership never moved');
  subsWrites = 0;
  // The would-be taker cannot remove it either…
  const taker = await del({ as: 'u-att', body: { endpoint: 'ep-shared' } });
  assert.equal(taker.body?.removed, 0);
  assert.equal(row('ep-shared').userId, 'u-victim');
  assert.equal(subsWrites, 0);
  // …and the real owner still can.
  const owner = await del({ as: 'u-victim', body: { endpoint: 'ep-shared' } });
  assert.equal(owner.body.removed, 1);
  assert.deepEqual(endpoints(), []);
});

// ── Dev-only branches ───────────────────────────────────────────────────────

test('purge_empty requires a session even when DEV_LOGIN is on', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  kv.set(SUBS_KEY, JSON.stringify([
    { subscription: sub('ep-empty'), userId: '', playerId: '', legacyPlayerId: '' },
    { subscription: sub('ep-victim'), userId: 'u-victim', playerId: 'u-victim', legacyPlayerId: 'inv-victim' },
  ]));
  subsWrites = 0;
  const anon = await del({ body: { action: 'purge_empty' } });
  assert.equal(anon.code, 401);
  assert.deepEqual(endpoints(), ['ep-empty', 'ep-victim']);
  assert.equal(subsWrites, 0);
  const signedIn = await del({ as: 'u-victim', body: { action: 'purge_empty' } });
  assert.equal(signedIn.code, 200);
  assert.equal(signedIn.body.purged, 1);
  assert.deepEqual(endpoints(), ['ep-victim'], 'purge removes only ownerless rows');
});

test('purge_empty is inert when DEV_LOGIN is off', async () => {
  await seed();
  kv.set(SUBS_KEY, JSON.stringify([{ subscription: sub('ep-empty'), userId: '', playerId: '', legacyPlayerId: '' }]));
  subsWrites = 0;
  const out = await del({ as: 'u-victim', body: { action: 'purge_empty' } });
  assert.equal(out.code, 400, 'without the dev gate it is an ordinary delete with no endpoint');
  assert.deepEqual(endpoints(), ['ep-empty']);
  assert.equal(subsWrites, 0);
});

test('the debug listing never reaches an anonymous caller', async () => {
  await seed(); await registerVictimAndAttacker();
  process.env.DEV_LOGIN = 'true';
  const anon = await call('GET', { query: { debug: '1' } });
  assert.equal(anon.code, 200);
  assert.deepEqual(anon.body, { count: 2 }, 'only the count; no endpoints, ids or labels');
  const signedIn = await call('GET', { as: 'u-victim', query: { debug: '1' } });
  assert.equal(signedIn.code, 200);
  assert.equal(signedIn.body.subscriptions.length, 2);
  delete process.env.DEV_LOGIN;
  const prodShaped = await call('GET', { as: 'u-victim', query: { debug: '1' } });
  assert.deepEqual(prodShaped.body, { count: 2 });
});

// ── The legitimate flow ─────────────────────────────────────────────────────

test('the signed-in unsubscribe (exactly what index.html sends) works and is idempotent', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-victim') } });
  // unsubscribePush(): DELETE with a JSON body of only { endpoint }, cookies
  // sent by the browser on the same-origin fetch.
  const first = await del({ as: 'u-victim', body: { endpoint: 'ep-victim' } });
  assert.equal(first.code, 200);
  assert.deepEqual(first.body, { ok: true, removed: 1, count: 0 });
  assert.deepEqual(endpoints(), []);
  subsWrites = 0;
  // Turning off a device that push.js already pruned (410 Gone) is not an error.
  const again = await del({ as: 'u-victim', body: { endpoint: 'ep-victim' } });
  assert.equal(again.code, 200);
  assert.deepEqual(again.body, { ok: true, removed: 0, count: 0 });
  assert.equal(subsWrites, 0);
});

test('staff unsubscribe keeps working', async () => {
  await seed();
  await post({ as: 'u-coach', body: { subscription: sub('ep-coach') } });
  const out = await del({ as: 'u-coach', body: { endpoint: 'ep-coach' } });
  assert.equal(out.code, 200);
  assert.equal(out.body.removed, 1);
  assert.deepEqual(endpoints(), []);
});
