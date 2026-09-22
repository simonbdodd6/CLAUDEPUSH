/**
 * PUSH SUBSCRIPTION OWNERSHIP — api/subscribe.js POST
 *
 * DELETE was hardened (api-subscribe-delete) to "session + stored userId is
 * yours". POST then undermined it: re-saving an endpoint another user had
 * registered rebound the row wholly to the caller. So an authenticated
 * attacker who merely knew an endpoint string could take a victim's device:
 *
 *     POST {endpoint: victimEndpoint}  → row.userId becomes the attacker
 *     DELETE {endpoint: victimEndpoint} → now "legitimately" theirs to remove
 *
 * The victim silently stops receiving notifications, and while the row is
 * rebound the device is delivered the ATTACKER's notifications instead. An
 * endpoint is unguessable but it is not a credential — the dev debug listing
 * printed it in full and every push report carries it — so possession of one
 * must never confer ownership.
 *
 * The contract these tests pin:
 *   - no row for the endpoint  → create it, owned by the session user
 *   - row owned by the caller  → update it in place (refresh, new keys)
 *   - row owned by someone else → 409, and NOTHING is written
 *   - the refusal names nobody: no userId, label, club or role leaks
 *   - a refused rebind leaves DELETE unable to remove the row either
 *   - a legacy row with an empty userId is owned by nobody and is claimed by
 *     nobody through POST (see the note on that test)
 *   - one user may still hold many devices.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.subown.test';
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
  { id: 'm-att',    teamId: CLUB_A, userId: 'u-att',    role: 'player', status: 'active' },
  { id: 'm-b',      teamId: CLUB_B, userId: 'u-b',      role: 'player', status: 'active' },
];
const USERS = [
  { id: 'u-victim', email: 'victim@c.test', displayName: 'Victor Victim' },
  { id: 'u-att',    email: 'att@c.test',    displayName: 'Atty Attacker' },
  { id: 'u-b',      email: 'b@c.test',      displayName: 'Bea Beta' },
];
const PROFILES = [
  { id: 'pp-victim', teamId: CLUB_A, userId: 'u-victim', legacyPlayerId: 'inv-victim', displayName: 'Victor Victim' },
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
  return { out, setHeader() {}, status(c) { out.code = c; return this; },
           json(b) { out.body = b; return this; }, end() { return this; } };
}
async function call(method, { as = null, body, query = {}, headers = {} } = {}) {
  const r = res();
  const h = { ...headers };
  if (as) h.cookie = cookies.get(as);
  await subscribeHandler({ method, query, headers: h, body }, r);
  return r.out;
}
const post = opts => call('POST', opts);
const del  = opts => call('DELETE', opts);
const sub  = (endpoint, keys = { p256dh: 'p', auth: 'a' }) => ({ endpoint, keys });
const stored    = () => JSON.parse(kv.get(SUBS_KEY) || '[]');
const endpoints = () => stored().map(s => s.subscription.endpoint).sort();
const row       = endpoint => stored().find(s => s.subscription.endpoint === endpoint);

/** Write a row directly, bypassing POST — for legacy shapes POST can no longer create. */
function seedRawRow(entry) { kv.set(SUBS_KEY, JSON.stringify([...stored(), entry])); subsWrites = 0; }

// ── 1. creation and self-update still work ──────────────────────────────────

test('1. a first subscription is created and owned by the session user', async () => {
  await seed();
  const out = await post({ as: 'u-victim', body: { subscription: sub('ep-1') } });
  assert.equal(out.code, 201);
  assert.equal(row('ep-1').userId, 'u-victim');
});

test('2+3. the owner may refresh the same endpoint, including new keys', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-1', { p256dh: 'old', auth: 'old' }) } });
  const before = subsWrites;
  const out = await post({ as: 'u-victim', body: { subscription: sub('ep-1', { p256dh: 'NEW', auth: 'NEW' }) } });
  assert.equal(out.code, 201, 'a refresh is still a normal save');
  assert.equal(stored().length, 1, 'still one row for the endpoint');
  assert.deepEqual(row('ep-1').subscription.keys, { p256dh: 'NEW', auth: 'NEW' }, 'the rotated keys are stored');
  assert.equal(row('ep-1').userId, 'u-victim');
  assert.ok(subsWrites > before, 'a legitimate refresh does write');
});

test('13. one user may hold several devices', async () => {
  await seed();
  for (const e of ['ep-phone', 'ep-tablet', 'ep-laptop']) {
    assert.equal((await post({ as: 'u-victim', body: { subscription: sub(e) } })).code, 201);
  }
  assert.deepEqual(endpoints(), ['ep-laptop', 'ep-phone', 'ep-tablet']);
  assert.ok(stored().every(s => s.userId === 'u-victim'));
});

// ── 2. the takeover is refused ──────────────────────────────────────────────

test('4+5. another user cannot rebind the endpoint, and nothing is written', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-shared') } });
  const before = JSON.stringify(stored());
  subsWrites = 0;

  const out = await post({ as: 'u-att', body: { subscription: sub('ep-shared', { p256dh: 'X', auth: 'X' }) } });

  assert.equal(out.code, 409, 'the takeover is refused');
  assert.equal(subsWrites, 0, 'a refused POST must not write the store at all');
  assert.equal(JSON.stringify(stored()), before, 'the victim row is byte-identical');
  assert.equal(row('ep-shared').userId, 'u-victim', 'the victim still owns their device');
  assert.deepEqual(row('ep-shared').subscription.keys, { p256dh: 'p', auth: 'a' }, 'and their keys are untouched');
});

test('6. the refusal names nobody', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-shared') } });
  const out = await post({ as: 'u-att', body: { subscription: sub('ep-shared') } });
  const text = JSON.stringify(out.body).toLowerCase();
  for (const leak of ['u-victim', 'victor', 'victim@c.test', 'inv-victim', CLUB_A, 'player', 'alpha']) {
    assert.equal(text.includes(leak.toLowerCase()), false, `the refusal must not disclose "${leak}"`);
  }
});

test('7. a refused rebind leaves the attacker unable to delete it either', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-shared') } });
  await post({ as: 'u-att', body: { subscription: sub('ep-shared') } });   // refused
  subsWrites = 0;
  const out = await del({ as: 'u-att', body: { endpoint: 'ep-shared' } });
  assert.equal(out.body.removed, 0, 'the row is still not theirs to remove');
  assert.equal(subsWrites, 0, 'and the refused delete writes nothing');
  assert.ok(row('ep-shared'), 'the victim device survives the full attack chain');
});

test('10. a forged userId in the body cannot bypass ownership', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-shared') } });
  subsWrites = 0;
  const out = await post({ as: 'u-att', body: {
    subscription: sub('ep-shared'), userId: 'u-victim', playerId: 'u-victim',
    legacyPlayerId: 'inv-victim', label: 'Victor Victim', role: 'player',
  } });
  assert.equal(out.code, 409, 'claiming to be the owner is not being the owner');
  assert.equal(subsWrites, 0);
  assert.equal(row('ep-shared').userId, 'u-victim');
});

test('11. a member of another club cannot take the device either', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-shared') } });
  subsWrites = 0;
  const out = await post({ as: 'u-b', body: { subscription: sub('ep-shared') } });
  assert.equal(out.code, 409);
  assert.equal(subsWrites, 0);
  assert.equal(row('ep-shared').userId, 'u-victim');
});

test('the owner is still not blocked by their own row after a refused attempt', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-shared') } });
  await post({ as: 'u-att', body: { subscription: sub('ep-shared') } });   // refused
  const out = await post({ as: 'u-victim', body: { subscription: sub('ep-shared', { p256dh: 'R', auth: 'R' }) } });
  assert.equal(out.code, 201, 'the real owner can still refresh');
  assert.deepEqual(row('ep-shared').subscription.keys, { p256dh: 'R', auth: 'R' });
});

// ── 3. legacy rows ──────────────────────────────────────────────────────────

/**
 * A row saved before POST was hardened can carry an empty userId. Such a row
 * is already undeliverable (subscriptionsForMembers needs a truthy id match)
 * and DELETE treats it as owned by nobody. POST must not become the way to
 * claim it: an empty-owner row is exactly the shape an attacker would want to
 * adopt, and claiming it would rebind a device that may be someone else's.
 * It stays unclaimable, and dev-only purge_empty remains the way to clear it.
 */
test('12. a legacy empty-userId row is claimed by nobody through POST', async () => {
  await seed();
  seedRawRow({ subscription: sub('ep-legacy'), label: 'Legacy', userId: '', playerId: '', legacyPlayerId: '', role: '' });
  const out = await post({ as: 'u-att', body: { subscription: sub('ep-legacy') } });
  assert.equal(out.code, 409, 'an ownerless row is not free to take');
  assert.equal(subsWrites, 0, 'and nothing is written');
  assert.equal(row('ep-legacy').userId, '', 'it stays ownerless');
  assert.equal(stored().length, 1, 'no duplicate row is created for the same endpoint');
});

test('12b. an ownerless row is deletable by nobody, and purge_empty still clears it', async () => {
  await seed();
  seedRawRow({ subscription: sub('ep-legacy'), label: 'Legacy', userId: '', playerId: '', legacyPlayerId: '', role: '' });
  assert.equal((await del({ as: 'u-att', body: { endpoint: 'ep-legacy' } })).body.removed, 0);
  assert.ok(row('ep-legacy'), 'still there');
  process.env.DEV_LOGIN = 'true';
  const purge = await del({ as: 'u-att', body: { action: 'purge_empty' } });
  delete process.env.DEV_LOGIN;
  assert.equal(purge.body.purged, 1, 'the dev-only purge is still the way out');
  assert.equal(stored().length, 0);
});

// ── 4. DELETE protection is unchanged ───────────────────────────────────────

test('8+9. DELETE still needs a session and still needs to be yours', async () => {
  await seed();
  await post({ as: 'u-victim', body: { subscription: sub('ep-1') } });
  subsWrites = 0;

  assert.equal((await del({ body: { endpoint: 'ep-1' } })).code, 401, 'anonymous is refused');
  assert.equal(subsWrites, 0);
  assert.equal((await del({ as: 'u-att', body: { endpoint: 'ep-1' } })).body.removed, 0, 'non-owner removes nothing');
  assert.equal(subsWrites, 0);

  const mine = await del({ as: 'u-victim', body: { endpoint: 'ep-1' } });
  assert.equal(mine.code, 200);
  assert.equal(mine.body.removed, 1, 'the owner can still unsubscribe');
  assert.deepEqual(endpoints(), []);
});

test('POST still requires a session at all', async () => {
  await seed();
  const out = await post({ body: { subscription: sub('ep-anon') } });
  assert.equal(out.code, 401);
  assert.equal(subsWrites, 0);
  assert.deepEqual(endpoints(), []);
});

// ── 5. the client resolves a conflict by rotating, never by retrying ────────

/**
 * The browser returns the SAME endpoint for the life of a push subscription,
 * so a device that changes hands still presents the previous user's endpoint
 * and is refused. These tests drive the REAL client function extracted from
 * index.html: on 409 endpoint_owned it must unsubscribe locally and subscribe
 * again (minting a fresh endpoint), then register that — never re-POST the
 * endpoint it was refused, and never touch the other user's row.
 */
import fs from 'node:fs';
const clientSrc = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function clientFn(name) {
  const s = clientSrc.search(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  assert.ok(s > 0, `${name} exists in index.html`);
  let i = clientSrc.indexOf('(', s), p = 0;
  for (; i < clientSrc.length; i++) { if (clientSrc[i] === '(') p++; else if (clientSrc[i] === ')') { p--; if (!p) { i++; break; } } }
  let b = clientSrc.indexOf('{', i), d = 0, e = b;
  for (let k = b; k < clientSrc.length; k++) { if (clientSrc[k] === '{') d++; else if (clientSrc[k] === '}') { d--; if (!d) { e = k; break; } } }
  return clientSrc.slice(s, e + 1);
}

/** Run the real refreshPushSubscriptionMetadata against a scripted server. */
function runClient({ responses }) {
  const body = `"use strict";
    const posted = [], minted = [];
    let unsubscribed = 0, n = 0;
    let vapidPublicKey = 'k', pushSubscription = {
      endpoint: 'ep-previous-owner',
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p', auth: 'a' } }; },
      unsubscribe: async () => { unsubscribed++; return true; },
    };
    const swRegistration = { pushManager: { subscribe: async () => {
      const ep = 'ep-fresh-' + (++n);
      minted.push(ep);
      return { endpoint: ep, toJSON() { return { endpoint: ep, keys: { p256dh: 'p2', auth: 'a2' } }; },
               unsubscribe: async () => true };
    } } };
    function urlBase64ToUint8Array() { return new Uint8Array([1]); }
    function currentUser() { return { id: 'u-new', name: 'New User', role: 'player' }; }
    function getPlayer() { return null; }
    const scripted = ${JSON.stringify(responses)};
    async function fetch(_url, opts) {
      const parsed = JSON.parse(opts.body);
      posted.push(parsed.subscription.endpoint);
      const r = scripted[posted.length - 1] || { status: 201, body: { ok: true } };
      return { status: r.status, ok: r.status < 400,
               clone() { return this; }, json: async () => r.body };
    }
    ${clientFn('_pushRegistrationBody')}
    ${clientFn('_postPushRegistration')}
    ${clientFn('refreshPushSubscriptionMetadata')}
    return (async () => {
      const res = await refreshPushSubscriptionMetadata('New User');
      return { posted, minted, unsubscribed, status: res && res.status,
               finalEndpoint: pushSubscription.endpoint };
    })();`;
  return new Function(body)();
}
const OWNED = { status: 409, body: { error: 'This device is registered to another account', code: 'endpoint_owned' } };
const OK    = { status: 201, body: { ok: true, count: 1 } };

test('14. a clean registration posts once and rotates nothing', async () => {
  const r = await runClient({ responses: [OK] });
  assert.deepEqual(r.posted, ['ep-previous-owner']);
  assert.equal(r.unsubscribed, 0, 'no rotation when there is no conflict');
  assert.equal(r.status, 201);
});

test('15. a conflict rotates the endpoint and registers the FRESH one', async () => {
  const r = await runClient({ responses: [OWNED, OK] });
  assert.equal(r.unsubscribed, 1, 'the local subscription is dropped');
  assert.deepEqual(r.minted, ['ep-fresh-1'], 'a new endpoint is minted');
  assert.deepEqual(r.posted, ['ep-previous-owner', 'ep-fresh-1'],
    'the retry registers the NEW endpoint, never the refused one');
  assert.equal(r.finalEndpoint, 'ep-fresh-1');
  assert.equal(r.status, 201, 'the device ends up registered to the new account');
});

test('16. it retries once only — a second conflict is reported, not looped', async () => {
  const r = await runClient({ responses: [OWNED, OWNED, OK] });
  assert.equal(r.posted.length, 2, 'exactly one retry');
  assert.equal(r.unsubscribed, 1);
  assert.equal(r.status, 409, 'the honest answer is returned rather than looping');
});

test('17. a non-conflict error is never rotated away', async () => {
  const r = await runClient({ responses: [{ status: 401, body: { error: 'Authentication required' } }] });
  assert.deepEqual(r.posted, ['ep-previous-owner']);
  assert.equal(r.unsubscribed, 0, 'a 401 must not silently destroy the subscription');
  assert.equal(r.status, 401);
});

test('18. a 409 without the conflict code is not treated as one', async () => {
  const r = await runClient({ responses: [{ status: 409, body: { error: 'something else' } }] });
  assert.equal(r.unsubscribed, 0);
  assert.equal(r.posted.length, 1);
});
