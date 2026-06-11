/**
 * VAPID push configuration hardening tests.
 *
 *  1. vapidKeyStatus reports missing / malformed / valid keys precisely
 *  2. /api/config reports pushConfigured + actionable pushConfigError
 *  3. /api/config never leaks the private key
 *  4. POST /api/push with broken VAPID returns 500 with the real reason
 *     (and pushConfigured: false so the UI can distinguish it from offline)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.push-config.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

// Valid-format dummy keys (87 / 43 base64url chars).
const VALID_PUBLIC  = 'B'.repeat(87);
const VALID_PRIVATE = 'a'.repeat(43);

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'LPUSH') result = 1;
  if (command === 'LTRIM') result = 'OK';
  if (command === 'SCAN')  result = ['0', []];
  return { ok: true, json: async () => ({ result }) };
};

const { vapidKeyStatus } = await import('../api/_http.js');
const { default: configHandler } = await import('../api/config.js');
const { default: pushHandler } = await import('../api/push.js');
const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

function withVapidEnv(publicKey, privateKey, fn) {
  const prevPub = process.env.VAPID_PUBLIC_KEY;
  const prevPriv = process.env.VAPID_PRIVATE_KEY;
  if (publicKey === undefined) delete process.env.VAPID_PUBLIC_KEY; else process.env.VAPID_PUBLIC_KEY = publicKey;
  if (privateKey === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = privateKey;
  const restore = () => {
    if (prevPub === undefined) delete process.env.VAPID_PUBLIC_KEY; else process.env.VAPID_PUBLIC_KEY = prevPub;
    if (prevPriv === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = prevPriv;
  };
  return Promise.resolve(fn()).finally(restore);
}

async function seedCoach() {
  kv.set('app:identity:users', JSON.stringify([
    { id: 'coach-vapid', email: 'coach@vapid.test', firstName: 'Coach', lastName: 'Vapid', displayName: 'Coach Vapid' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-coach-vapid', teamId: 'boitsfort-rfc', userId: 'coach-vapid', role: 'coach', status: 'active' },
  ]));
  const session = await createSession({ userId: 'coach-vapid', teamId: 'boitsfort-rfc', role: 'coach' });
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` };
}

// ─── 1. vapidKeyStatus precision ──────────────────────────────────────────────

test('vapidKeyStatus: both keys missing', async () => {
  await withVapidEnv(undefined, undefined, () => {
    const s = vapidKeyStatus();
    assert.equal(s.ok, false);
    assert.match(s.error, /VAPID keys not configured/);
  });
});

test('vapidKeyStatus: private key missing', async () => {
  await withVapidEnv(VALID_PUBLIC, undefined, () => {
    const s = vapidKeyStatus();
    assert.equal(s.ok, false);
    assert.match(s.error, /VAPID_PRIVATE_KEY is missing/);
  });
});

test('vapidKeyStatus: public key missing', async () => {
  await withVapidEnv(undefined, VALID_PRIVATE, () => {
    const s = vapidKeyStatus();
    assert.equal(s.ok, false);
    assert.match(s.error, /VAPID_PUBLIC_KEY is missing/);
  });
});

test('vapidKeyStatus: malformed public key reports actual length', async () => {
  await withVapidEnv('too-short', VALID_PRIVATE, () => {
    const s = vapidKeyStatus();
    assert.equal(s.ok, false);
    assert.match(s.error, /VAPID_PUBLIC_KEY malformed/);
    assert.match(s.error, /got 9/);
  });
});

test('vapidKeyStatus: malformed private key detected', async () => {
  await withVapidEnv(VALID_PUBLIC, 'not+base64url/chars=' , () => {
    const s = vapidKeyStatus();
    assert.equal(s.ok, false);
    assert.match(s.error, /VAPID_PRIVATE_KEY malformed/);
  });
});

test('vapidKeyStatus: valid-format keys pass', async () => {
  await withVapidEnv(VALID_PUBLIC, VALID_PRIVATE, () => {
    assert.equal(vapidKeyStatus().ok, true);
  });
});

test('vapidKeyStatus: surrounding whitespace is tolerated', async () => {
  await withVapidEnv(`  ${VALID_PUBLIC}  `, `\n${VALID_PRIVATE}\n`, () => {
    assert.equal(vapidKeyStatus().ok, true);
  });
});

// ─── 2 + 3. /api/config reporting ─────────────────────────────────────────────

test('GET /api/config reports pushConfigured: true with valid keys and never leaks the private key', async () => {
  await withVapidEnv(VALID_PUBLIC, VALID_PRIVATE, async () => {
    const res = buildRes();
    await configHandler({ method: 'GET', query: {}, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.pushConfigured, true);
    assert.equal(res.body.pushConfigError, null);
    assert.equal(res.body.vapidPublicKey, VALID_PUBLIC);
    assert.equal(JSON.stringify(res.body).includes(VALID_PRIVATE), false, 'private key must never appear in config output');
  });
});

test('GET /api/config reports actionable pushConfigError when keys are missing', async () => {
  await withVapidEnv(undefined, undefined, async () => {
    const res = buildRes();
    await configHandler({ method: 'GET', query: {}, headers: {} }, res);
    assert.equal(res.body.pushConfigured, false);
    assert.match(res.body.pushConfigError, /VAPID keys not configured/);
  });
});

test('GET /api/config reports malformed key as the config error', async () => {
  await withVapidEnv('bad-key', VALID_PRIVATE, async () => {
    const res = buildRes();
    await configHandler({ method: 'GET', query: {}, headers: {} }, res);
    assert.equal(res.body.pushConfigured, false);
    assert.match(res.body.pushConfigError, /VAPID_PUBLIC_KEY malformed/);
  });
});

// ─── 4. /api/push returns the real reason, flagged for the UI ────────────────

test('POST /api/push with missing VAPID keys returns 500 with reason and pushConfigured: false', async () => {
  kv.clear();
  const coach = await seedCoach();
  await withVapidEnv(undefined, undefined, async () => {
    const res = buildRes();
    await pushHandler({
      method: 'POST',
      headers: { cookie: coach.cookie },
      body: { title: 'Test', body: 'Hello squad' },
    }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.pushConfigured, false);
    assert.match(res.body.error, /VAPID keys not configured/);
  });
});

test('POST /api/push with malformed private key returns the specific malformation error', async () => {
  kv.clear();
  const coach = await seedCoach();
  await withVapidEnv(VALID_PUBLIC, 'short', async () => {
    const res = buildRes();
    await pushHandler({
      method: 'POST',
      headers: { cookie: coach.cookie },
      body: { title: 'Test', body: 'Hello squad' },
    }, res);
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /VAPID_PRIVATE_KEY malformed/);
  });
});
