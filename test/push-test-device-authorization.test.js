/**
 * PUSH DEVICE TESTING — api/push.js `action: 'test_device'`
 *
 * Every other branch of this handler goes through
 * requireTenantPermission(req, PERM.MESSAGING) and then restricts delivery to
 * ACTIVE members of the sender's club. test_device returned ABOVE all of that,
 * gated on DEV_LOGIN alone, and sent to a subscription object supplied wholly
 * in the request body.
 *
 * DEV_LOGIN is an environment flag. It names no user, names no club and grants
 * no permission — the same conclusion api/availability.js records and that
 * api/subscribe.js now applies to its own dev-only branches. A caller-supplied
 * endpoint is not authorization either: an endpoint is unguessable but it is
 * printed by the debug listing and carried in push reports.
 *
 * So wherever DEV_LOGIN was true, ANY caller — with no session at all — could
 * make the server send a push to any endpoint they had learned, using the
 * club's own VAPID identity, and read the push service's status code and body
 * back as an oracle for whether that endpoint is still alive.
 *
 * The contract these tests pin:
 *   - no session ⇒ refused, nothing sent
 *   - DEV_LOGIN alone ⇒ still refused
 *   - the target is the CALLER'S OWN registered device, looked up in the store
 *     by the session user — the body cannot choose it
 *   - another user's endpoint, and another club's endpoint, are refused
 *   - an endpoint with no stored row is refused
 *   - the legitimate diagnostics flow (test my own device) still works.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';

const VAPID = webpush.generateVAPIDKeys();
process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.testdevice.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.VAPID_PUBLIC_KEY         = VAPID.publicKey;
process.env.VAPID_PRIVATE_KEY        = VAPID.privateKey;
process.env.VAPID_CONTACT            = 'mailto:qa@coacheasier.test';

const SUBS_KEY = 'app:subscriptions';
const kv = new Map();
const lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); lists.delete(a[0]); result = 1; }
  if (command === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (command === 'LRANGE') result = (lists.get(a[0]) || []).slice(0, 50);
  if (command === 'LTRIM') result = 'OK';
  if (command === 'EXPIRE') result = 1;
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: pushHandler } = await import('../api/push.js');
const { SESSION_COOKIE, createSession } = store;

/**
 * Deliveries are counted by replacing webpush.sendNotification. A refused
 * request must not reach it at all — "nothing was sent" is the assertion that
 * matters, not the status code alone.
 */
let sent = [], sentFull = [];
webpush.sendNotification = async (subscription) => {
  sent.push(subscription?.endpoint || null);
  sentFull.push(subscription);
  return { statusCode: 201, body: '', headers: {} };
};

const CLUB_A = 'club-alpha', CLUB_B = 'club-beta';
const MEMBERS = [
  { id: 'm-dev',    teamId: CLUB_A, userId: 'u-dev',    role: 'coach',  staffLevel: 'head', status: 'active', accessProfile: 'full' },
  { id: 'm-player', teamId: CLUB_A, userId: 'u-player', role: 'player', status: 'active' },
  { id: 'm-other',  teamId: CLUB_A, userId: 'u-other',  role: 'player', status: 'active' },
  { id: 'm-b',      teamId: CLUB_B, userId: 'u-b',      role: 'player', status: 'active' },
  { id: 'm-gone',   teamId: CLUB_A, userId: 'u-gone',   role: 'player', status: 'removed' },
];
const SUBS = [
  { subscription: { endpoint: 'https://push.test/ep-dev',    keys: { p256dh: 'p', auth: 'a' } }, userId: 'u-dev',    playerId: 'u-dev',    legacyPlayerId: '', label: 'Dev Coach',  role: 'coach' },
  { subscription: { endpoint: 'https://push.test/ep-player', keys: { p256dh: 'p', auth: 'a' } }, userId: 'u-player', playerId: 'u-player', legacyPlayerId: '', label: 'A Player',   role: 'player' },
  { subscription: { endpoint: 'https://push.test/ep-other',  keys: { p256dh: 'p', auth: 'a' } }, userId: 'u-other',  playerId: 'u-other',  legacyPlayerId: '', label: 'Other',     role: 'player' },
  { subscription: { endpoint: 'https://push.test/ep-b',      keys: { p256dh: 'p', auth: 'a' } }, userId: 'u-b',      playerId: 'u-b',      legacyPlayerId: '', label: 'Beta',      role: 'player' },
  { subscription: { endpoint: 'https://push.test/ep-orphan', keys: { p256dh: 'p', auth: 'a' } }, userId: '',         playerId: '',         legacyPlayerId: '', label: 'Orphan',    role: '' },
];

const cookies = new Map();
async function seed() {
  kv.clear(); lists.clear(); cookies.clear(); sent = []; sentFull = [];
  delete process.env.DEV_LOGIN;
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB_A, name: 'Alpha' }, { id: CLUB_B, name: 'Beta' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(SUBS_KEY, JSON.stringify(SUBS));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
    cookies.set(m.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}

function res() {
  const out = { code: 0, body: null };
  return { out, setHeader() {}, status(c) { out.code = c; return this; },
           json(b) { out.body = b; return this; }, end() { return this; } };
}
/** A raw subscription object, exactly as the caller would forge one. */
const rawSub = endpoint => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
async function testDevice({ as = null, subscription, endpoint, extra = {} } = {}) {
  const r = res();
  const h = {};
  if (as) h.cookie = cookies.get(as);
  const body = { action: 'test_device', ...extra };
  if (subscription !== undefined) body.subscription = subscription;
  if (endpoint !== undefined) body.endpoint = endpoint;
  await pushHandler({ method: 'POST', query: {}, headers: h, body }, r);
  return r.out;
}
const refused = out => out.code === 401 || out.code === 403;

// ── A / B: the environment flag is not an identity ──────────────────────────

test('1. an anonymous caller is refused and nothing is sent', async () => {
  await seed();
  const out = await testDevice({ subscription: rawSub('https://push.test/ep-player') });
  assert.ok(refused(out), `expected 401/403, got ${out.code}`);
  assert.deepEqual(sent, [], 'no push may be dispatched');
});

test('2. DEV_LOGIN alone does not authorise anything', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const out = await testDevice({ subscription: rawSub('https://push.test/ep-player') });
  delete process.env.DEV_LOGIN;
  assert.ok(refused(out), `DEV_LOGIN is an environment flag, not a caller — got ${out.code}`);
  assert.deepEqual(sent, [], 'no push may be dispatched');
});

test('3. an invalid session token is refused', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const r = res();
  await pushHandler({ method: 'POST', query: {}, headers: { cookie: `${SESSION_COOKIE}=nope` },
                      body: { action: 'test_device', subscription: rawSub('https://push.test/ep-dev') } }, r);
  delete process.env.DEV_LOGIN;
  assert.ok(refused(r.out));
  assert.deepEqual(sent, []);
});

test('4. a session whose membership is no longer active is refused', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const out = await testDevice({ as: 'u-gone', subscription: rawSub('https://push.test/ep-dev') });
  delete process.env.DEV_LOGIN;
  assert.ok(refused(out));
  assert.deepEqual(sent, []);
});

// ── F / G: the endpoint cannot be chosen by the caller ──────────────────────

test('5. a caller cannot test ANOTHER user\'s device in their own club', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const out = await testDevice({ as: 'u-player', subscription: rawSub('https://push.test/ep-other') });
  delete process.env.DEV_LOGIN;
  assert.ok(refused(out), `expected a refusal, got ${out.code}`);
  assert.deepEqual(sent, [], 'another member\'s device must never be woken');
});

test('6. a caller cannot test a device in another club', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const out = await testDevice({ as: 'u-player', subscription: rawSub('https://push.test/ep-b') });
  delete process.env.DEV_LOGIN;
  assert.ok(refused(out));
  assert.deepEqual(sent, []);
});

test('7. an endpoint with no stored row is refused, not sent to', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const out = await testDevice({ as: 'u-player', subscription: rawSub('https://push.test/ep-never-registered') });
  delete process.env.DEV_LOGIN;
  assert.ok(refused(out), 'possession of an endpoint string is not authorization');
  assert.deepEqual(sent, [], 'an arbitrary endpoint must never receive a push');
});

test('8. an ownerless legacy row cannot be adopted as a test target', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const out = await testDevice({ as: 'u-player', subscription: rawSub('https://push.test/ep-orphan') });
  delete process.env.DEV_LOGIN;
  assert.ok(refused(out));
  assert.deepEqual(sent, []);
});

test('9. forged body identity cannot redirect the test', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const out = await testDevice({
    as: 'u-player',
    subscription: rawSub('https://push.test/ep-other'),
    extra: { userId: 'u-other', targetUserId: 'u-other', teamId: CLUB_B, label: 'Other' },
  });
  delete process.env.DEV_LOGIN;
  assert.ok(refused(out));
  assert.deepEqual(sent, [], 'no caller-supplied identity may select the target');
});

test('10. the stored keys are used, not the ones the caller supplies', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  await testDevice({ as: 'u-dev', subscription: { endpoint: 'https://push.test/ep-dev', keys: { p256dh: 'ATTACKER', auth: 'ATTACKER' } } });
  delete process.env.DEV_LOGIN;
  // Whatever was sent must be the row the server holds for this user — the
  // caller's key pair is ignored, so it cannot reshape or redirect the push.
  assert.deepEqual(sent, ['https://push.test/ep-dev']);
  assert.deepEqual(sentFull[0].keys, { p256dh: 'p', auth: 'a' }, 'the STORED keys are used');
  assert.equal(JSON.stringify(sentFull[0]).includes('ATTACKER'), false,
    'nothing the caller supplied reaches the push service');
});

// ── I: the legitimate diagnostics flow ──────────────────────────────────────

test('11. the owner can test their own registered device', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const out = await testDevice({ as: 'u-dev', subscription: rawSub('https://push.test/ep-dev') });
  delete process.env.DEV_LOGIN;
  assert.equal(out.code, 200, `the legitimate flow must keep working (got ${out.code})`);
  assert.equal(out.body?.ok, true);
  assert.deepEqual(sent, ['https://push.test/ep-dev'], 'exactly one push, to the caller\'s own device');
});

test('12. an ordinary player may also test their OWN device', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const out = await testDevice({ as: 'u-player', subscription: rawSub('https://push.test/ep-player') });
  delete process.env.DEV_LOGIN;
  assert.equal(out.code, 200, 'testing your own device is not a staff privilege');
  assert.deepEqual(sent, ['https://push.test/ep-player']);
});

test('13. with DEV_LOGIN off the diagnostics branch stays closed', async () => {
  await seed();
  const out = await testDevice({ as: 'u-dev', subscription: rawSub('https://push.test/ep-dev') });
  assert.ok(refused(out), 'the dev-only tool stays dev-only, now in addition to the session');
  assert.deepEqual(sent, []);
});

test('14. a missing subscription is handled without sending', async () => {
  await seed();
  process.env.DEV_LOGIN = 'true';
  const out = await testDevice({ as: 'u-dev' });
  delete process.env.DEV_LOGIN;
  assert.ok(out.code >= 400, 'a malformed request is an error, not a send');
  assert.deepEqual(sent, []);
});
