/**
 * Launch blocker (2026-08-05) — storage misconfiguration must degrade safely.
 *
 * Two real production incidents in one afternoon:
 *   1. UPSTASH_REDIS_REST_URL held a pasted token line (not a URL). Every
 *      request threw TypeError, the identity handler mapped it to HTTP 400 and
 *      echoed the message — WITH THE TOKEN IN IT — to unauthenticated callers.
 *   2. After rotation, the URL was valid but the token was wrong: Upstash
 *      replied 401 WRONGPASS, and that upstream text was echoed too.
 *
 * Contract pinned here: storage failures are HTTP 503 with one fixed message;
 * no env value, upstream body or internal error text ever reaches a client;
 * kvConfigured()/config report misconfiguration truthfully; ?health=1
 * distinguishes bad-url / unauthorized / unreachable / ok without secrets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_KEY_PREFIX = 'app';
process.env.VERCEL = '1';

const GARBAGE_URL = 'UPSTASH_REDIS_REST_TOKEN="fake-pasted-token-value-12345"';
const WRONGPASS_BODY = '{"error":"WRONGPASS invalid or missing auth token. See https://docs.upstash.com/redis/troubleshooting/http_unauthorized for details."}';

const { kvConfigured, kvHealthCheck } = await import('../api/_kv.js');
const { default: identityHandler } = await import('../api/identity.js');
const { default: chatHandler } = await import('../api/chat.js');
const { default: configHandler } = await import('../api/config.js');

function buildReq(overrides = {}) {
  return {
    method: 'POST', url: '/api/identity',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.99' },
    query: {}, body: { action: 'login', email: 'probe@example.com', password: 'probe-Wrong-1!' },
    on() {},
    ...overrides,
  };
}

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    getHeader(n)    { return this.headers[n]; },
    writeHead(code, h) { this.statusCode = code; Object.assign(this.headers, h || {}); return this; },
    end(data)       { if (data && this.body == null) { try { this.body = JSON.parse(data); } catch { this.body = data; } } return this; },
  };
}

/** No internals may appear in anything a client receives. */
function assertNoLeak(payload) {
  const text = JSON.stringify(payload);
  for (const banned of ['UPSTASH', 'fake-pasted-token-value', 'WRONGPASS', 'Failed to parse URL',
                        'upstash.com', 'TypeError', 'redis.']) {
    assert.equal(text.includes(banned), false, `client payload must not contain "${banned}": ${text}`);
  }
}

// Silence the deliberate server-side error logging in these scenarios.
const realError = console.error;
test.before(() => { console.error = () => {}; });
test.after(() => { console.error = realError; });

// ── Scenario 1: the pasted-token-line URL (incident #1) ─────────────────────
test('a non-URL storage value: identity returns 503 with a fixed safe message', async () => {
  process.env.UPSTASH_REDIS_REST_URL = GARBAGE_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'irrelevant';
  globalThis.fetch = async () => { throw new Error('fetch must not be called for an invalid URL'); };

  const res = buildRes();
  await identityHandler(buildReq(), res);
  assert.equal(res.statusCode, 503, JSON.stringify(res.body));
  // The handler's own kvConfigured() gate fires first with its fixed message —
  // fixed by the URL validation, since a pasted token line now reads as
  // "not configured" instead of slipping through to a TypeError. Either fixed
  // string is safe; anything else is not.
  assert.ok(['Storage temporarily unavailable', 'Identity storage not configured yet']
    .includes(res.body.error), res.body.error);
  assertNoLeak(res.body);
});

test('a non-URL storage value: kvConfigured() and /api/config report the truth', async () => {
  process.env.UPSTASH_REDIS_REST_URL = GARBAGE_URL;
  assert.equal(kvConfigured(), false, 'a pasted token line is NOT a configured URL');

  const res = buildRes();
  await configHandler(buildReq({ method: 'GET', query: {} }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.storageConfigured, false);
  assertNoLeak(res.body);

  const health = await kvHealthCheck();
  assert.deepEqual(health, { ok: false, code: 'bad-url' });
});

// ── Scenario 2: valid URL, wrong token (incident #2) ────────────────────────
test('WRONGPASS from Upstash: identity 503, upstream text never reaches the client', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.misconfig.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'rotated-but-wrong';
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => WRONGPASS_BODY,
    json: async () => JSON.parse(WRONGPASS_BODY) });

  const res = buildRes();
  await identityHandler(buildReq(), res);
  assert.equal(res.statusCode, 503, JSON.stringify(res.body));
  assert.equal(res.body.error, 'Storage temporarily unavailable');
  assertNoLeak(res.body);
});

test('WRONGPASS from Upstash: chat returns 503 instead of a 500 storm with internals', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => WRONGPASS_BODY,
    json: async () => JSON.parse(WRONGPASS_BODY) });

  const res = buildRes();
  await chatHandler(buildReq({ method: 'GET', url: '/api/chat?conv=general', query: { conv: 'general' } }), res);
  assert.equal(res.statusCode, 503, JSON.stringify(res.body));
  assertNoLeak(res.body);
});

test('WRONGPASS from Upstash: health probe says "unauthorized", nothing more', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => WRONGPASS_BODY,
    json: async () => JSON.parse(WRONGPASS_BODY) });
  assert.deepEqual(await kvHealthCheck(), { ok: false, code: 'unauthorized' });
});

// ── Scenario 3: network unreachable ─────────────────────────────────────────
test('unreachable storage: 503 + health "unreachable"', async () => {
  globalThis.fetch = async () => { const e = new TypeError('fetch failed'); throw e; };

  const res = buildRes();
  await identityHandler(buildReq(), res);
  assert.equal(res.statusCode, 503, JSON.stringify(res.body));
  assert.equal(res.body.error, 'Storage temporarily unavailable');
  assertNoLeak(res.body);
  assert.deepEqual(await kvHealthCheck(), { ok: false, code: 'unreachable' });
});

// ── Recovery: the same process with good credentials works immediately ──────
test('once credentials are fixed, the very next request succeeds (no restart needed)', async () => {
  const kv = new Map();
  globalThis.fetch = async (_url, options = {}) => {
    const [command, ...args] = JSON.parse(options.body || '[]');
    let result = null;
    if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
    if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
    return { ok: true, json: async () => ({ result }) };
  };

  assert.equal(kvConfigured(), true);
  assert.deepEqual(await kvHealthCheck(), { ok: true, code: 'ok' });

  const res = buildRes();
  await identityHandler(buildReq({ body: {
    action: 'create_club', clubName: 'Recovery RFC', teamName: 'Seniors', sport: 'Rugby',
    name: 'Recovery Coach', email: 'recovery@example.com', password: 'Recovery-2026!',
  } }), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(JSON.parse(kv.get('app:identity:teams')).length, 1);
});
