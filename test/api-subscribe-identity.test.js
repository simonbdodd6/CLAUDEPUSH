/**
 * PUSH SUBSCRIBE IDENTITY — api/subscribe.js POST
 *
 * A push subscription row is a routing record: delivery (api/push.js club and
 * targeted sends, api/chat.js DM pushes carrying the sender's name and a
 * 200-character preview) matches a device by the row's userId / playerId /
 * legacyPlayerId, and push.js targeted sends also match by label. The POST
 * handler used to take every one of those from the request body whenever the
 * session was missing or silent, so anyone could register their own device
 * under another person's identity and receive that person's notifications —
 * without logging in at all.
 *
 * The contract these tests pin:
 *   - saving a subscription requires an authenticated, active session (401
 *     otherwise, and nothing is written)
 *   - every identity field of the stored row — userId, playerId,
 *     legacyPlayerId, label, role — comes from that session; body and query
 *     values are ignored
 *   - re-saving an endpoint another user registered is REFUSED (409) and
 *     changes nothing; ownership is never transferred by possession
 *   - a member of one club cannot become deliverable inside another club
 *   - the legitimate authenticated save is unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.subid.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: subscribeHandler } = await import('../api/subscribe.js');
const { clubMemberSubscriptions } = await import('../api/_lib.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB_A = 'club-alpha', CLUB_B = 'club-beta';
const SUBS_KEY = 'app:subscriptions';

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
  // The attacker has a profile but NO legacy id — the shape that let the old
  // handler fill legacyPlayerId from the body.
  { id: 'pp-att', teamId: CLUB_A, userId: 'u-att', displayName: 'Atty Attacker' },
  { id: 'pp-b', teamId: CLUB_B, userId: 'u-b', displayName: 'Bea Beta' },
];

// The victim's identifiers as an attacker would forge them.
const FORGED = { userId: 'u-victim', playerId: 'u-victim', legacyPlayerId: 'inv-victim', label: 'Victor Victim' };

const cookies = new Map();
async function seed() {
  kv.clear(); cookies.clear();
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
async function post({ as = null, body = {}, query = {}, headers = {} } = {}) {
  const r = res();
  const h = { ...headers };
  if (as) h.cookie = cookies.get(as);
  await subscribeHandler({ method: 'POST', query, headers: h, body }, r);
  return r.out;
}
const sub = endpoint => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
const stored = () => JSON.parse(kv.get(SUBS_KEY) || '[]');
const row = endpoint => stored().find(s => s.subscription.endpoint === endpoint);
const idsOf = r => [r?.userId, r?.playerId, r?.legacyPlayerId].filter(Boolean);
const members = () => JSON.parse(kv.get('app:identity:team_members'));

test('authenticated subscribe stores the session identity', async () => {
  await seed();
  const out = await post({ as: 'u-victim', body: { subscription: sub('ep-victim'), label: 'Browser Label' } });
  assert.equal(out.code, 201);
  const r = row('ep-victim');
  assert.equal(r.userId, 'u-victim');
  assert.equal(r.playerId, 'u-victim');
  assert.equal(r.legacyPlayerId, 'inv-victim');
  assert.equal(r.label, 'Victor Victim');
  assert.equal(r.role, 'player');
});

test('unauthenticated subscribe is refused and writes nothing', async () => {
  await seed();
  const out = await post({ body: { subscription: sub('ep-anon'), ...FORGED } });
  assert.equal(out.code, 401);
  assert.equal(kv.has(SUBS_KEY), false, 'no subscription row may be written');
});

test('an invalid session token is refused', async () => {
  await seed();
  const out = await post({ body: { subscription: sub('ep-bad'), ...FORGED }, headers: { cookie: `${SESSION_COOKIE}=not-a-real-token` } });
  assert.equal(out.code, 401);
  assert.equal(kv.has(SUBS_KEY), false);
});

test('a session without an active membership is refused', async () => {
  await seed();
  const out = await post({ as: 'u-gone', body: { subscription: sub('ep-gone'), ...FORGED } });
  assert.equal(out.code, 401);
  assert.equal(kv.has(SUBS_KEY), false);
});

test('forged body identity cannot override the session', async () => {
  await seed();
  const out = await post({ as: 'u-att', body: { subscription: sub('ep-att'), ...FORGED } });
  assert.equal(out.code, 201);
  const r = row('ep-att');
  assert.equal(r.userId, 'u-att');
  assert.equal(r.playerId, 'u-att');
  assert.equal(r.legacyPlayerId, '', 'a caller with no legacy id must not borrow one from the body');
  assert.equal(r.label, 'Atty Attacker', 'label is a delivery key in push.js and must come from the session');
  assert.ok(!idsOf(r).some(v => v === 'u-victim' || v === 'inv-victim'));
});

test('forged query identity cannot override the session', async () => {
  await seed();
  const out = await post({ as: 'u-att', body: { subscription: sub('ep-att-q') }, query: { ...FORGED } });
  assert.equal(out.code, 201);
  const r = row('ep-att-q');
  assert.deepEqual([r.userId, r.playerId, r.legacyPlayerId, r.label], ['u-att', 'u-att', '', 'Atty Attacker']);
});

test('a forged role cannot be stored', async () => {
  await seed();
  await post({ as: 'u-att', body: { subscription: sub('ep-att-r'), role: 'coach' } });
  assert.equal(row('ep-att-r').role, 'player');
});

test('the attacker device is never routed the victim\'s pushes', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-victim') } });
  await post({ as: 'u-att', body: { subscription: sub('ep-att'), ...FORGED } });
  await post({ body: { subscription: sub('ep-anon'), ...FORGED } });
  // The same matching push.js and chat.js use for a send targeted at the victim.
  const targets = new Set(['u-victim', 'inv-victim']);
  const routed = stored().filter(s => idsOf(s).some(v => targets.has(v))).map(s => s.subscription.endpoint);
  assert.deepEqual(routed, ['ep-victim']);
  const byLabel = stored().filter(s => s.label.toLowerCase() === 'victor victim').map(s => s.subscription.endpoint);
  assert.deepEqual(byLabel, ['ep-victim']);
});

/**
 * CONTRACT CHANGE. This used to assert that re-saving another user's endpoint
 * rebound the row wholly to the caller, described as shared-device support. It
 * was a takeover path: possession of an endpoint string is not ownership, and
 * a rebound row could then be deleted by the taker, silently ending the
 * victim's notifications. A device that has genuinely changed hands now gets a
 * fresh endpoint instead. Full contract in test/api-subscribe-ownership.js.
 */
test('re-saving another user\'s endpoint is refused, not rebound', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-shared') } });
  const out = await post({ as: 'u-att', body: { subscription: sub('ep-shared') } });
  assert.equal(out.code, 409, 'the caller does not own this endpoint');
  assert.equal(stored().length, 1, 'one row per endpoint');
  const r = row('ep-shared');
  assert.deepEqual([r.userId, r.playerId, r.legacyPlayerId, r.label],
    ['u-victim', 'u-victim', 'inv-victim', 'Victor Victim'],
    'every id of the real owner survives the attempt');
});

test('a member of another club cannot become deliverable in this club', async () => {
  await seed();
  const out = await post({ as: 'u-b', body: { subscription: sub('ep-b'), ...FORGED } });
  assert.equal(out.code, 201);
  const r = row('ep-b');
  assert.deepEqual([r.userId, r.playerId, r.legacyPlayerId], ['u-b', 'u-b', '']);
  const alpha = clubMemberSubscriptions(stored(), members(), CLUB_A).map(s => s.subscription.endpoint);
  const beta = clubMemberSubscriptions(stored(), members(), CLUB_B).map(s => s.subscription.endpoint);
  assert.deepEqual(alpha, [], 'a club-beta device must never be in club-alpha\'s audience');
  assert.deepEqual(beta, ['ep-b']);
});

test('the endpoint is still required', async () => {
  await seed();
  const out = await post({ as: 'u-victim', body: { subscription: {} } });
  assert.equal(out.code, 400);
});

test('staff subscribe keeps working with the session role', async () => {
  await seed();
  const out = await post({ as: 'u-coach', body: { subscription: sub('ep-coach') } });
  assert.equal(out.code, 201);
  const r = row('ep-coach');
  assert.deepEqual([r.userId, r.playerId, r.label, r.role], ['u-coach', 'u-coach', 'Cora Coach', 'coach']);
});
