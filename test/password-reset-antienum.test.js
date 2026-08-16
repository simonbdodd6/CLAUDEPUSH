/**
 * RC4.4B2A — Password-reset anti-enumeration.
 *
 * The public response to `request_password_reset` must be indistinguishable for known
 * vs unknown emails, whether or not delivery is configured, and whether or not the
 * provider accepts — while a real account still gets a token internally and an unknown
 * one does not, rate limiting still bites, and no raw provider error is exposed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.reset-antienum.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
// These suites exercise the founder self-signup path — explicitly opt in
// (public club creation is otherwise CLOSED behind platform provisioning).
process.env.PUBLIC_CLUB_SIGNUP = 'true';

const kv = new Map();
// Controls the mocked Resend response for the current test.
let resend = { ok: true, body: { id: 'email_mock' } };
globalThis.fetch = async (url, options = {}) => {
  const u = String(url || '');
  if (u.includes('api.resend.com')) {
    return { ok: resend.ok, status: resend.ok ? 200 : 403, json: async () => resend.body };
  }
  let parsed; try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'email_mock' }) };
  const [cmd, ...args] = parsed;
  let result = null;
  if (cmd === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (cmd === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (cmd === 'DEL') { kv.delete(args[0]); result = 1; }
  if (cmd === 'EXPIRE' || cmd === 'LPUSH' || cmd === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(d)   { this.body = d; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()     { return this; },
  };
}
async function api(body, ip = '203.0.113.9') {
  const res = buildRes();
  await identityHandler({ method: 'POST', query: {}, headers: { 'x-forwarded-for': ip }, body }, res);
  return res;
}
async function seedRealAccount(email, ip) {
  const res = await api({ action: 'create_club', clubName: 'Reef RFC', teamName: 'Seniors', sport: 'Rugby', name: 'Real Coach', email, password: 'RealPass123' }, ip);
  assert.equal(res.statusCode, 201, 'seed account created');
}
function resetRecords() {
  const raw = kv.get('app:identity:password_resets');
  if (!raw) return [];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

test('known and unknown emails return an identical public response', async () => {
  kv.clear(); resend = { ok: true, body: { id: 'ok' } };
  delete process.env.RESEND_API_KEY; // email unconfigured (the current production reality)
  await seedRealAccount('known@reef.test', '203.0.113.1');

  const known   = await api({ action: 'request_password_reset', email: 'known@reef.test' }, '203.0.113.2');
  const unknown = await api({ action: 'request_password_reset', email: 'nobody@reef.test' }, '203.0.113.3');

  assert.equal(known.statusCode, unknown.statusCode, 'same HTTP status');
  assert.equal(known.statusCode, 200);
  assert.deepEqual(Object.keys(known.body).sort(), Object.keys(unknown.body).sort(), 'same response keys');
  assert.deepEqual(known.body, unknown.body, 'byte-identical body');
  assert.deepEqual(known.body, { ok: true }, 'constant contract, no delivery/expiry fields');
  // No account-existence signal in the public body.
  for (const b of [known.body, unknown.body]) {
    assert.ok(!('emailDelivery' in b), 'no emailDelivery leaked');
    assert.ok(!('expiresAt' in b), 'no expiresAt leaked');
    assert.ok(!('reason' in b), 'no reason leaked');
  }
});

test('a real account gets a reset token internally; an unknown one does not', async () => {
  kv.clear(); delete process.env.RESEND_API_KEY;
  await seedRealAccount('real@reef.test', '203.0.113.4');

  const before = resetRecords().length;
  await api({ action: 'request_password_reset', email: 'real@reef.test' }, '203.0.113.5');
  const afterKnown = resetRecords();
  assert.ok(afterKnown.length > before, 'a reset token record is stored for a real account');
  assert.ok(afterKnown.every(r => 'tokenHash' in r && !('token' in r)), 'token stored hashed, never plaintext');

  await api({ action: 'request_password_reset', email: 'ghost@reef.test' }, '203.0.113.6');
  assert.equal(resetRecords().length, afterKnown.length, 'no token stored for an unknown account');
});

test('provider rejection does not reveal account existence (still constant 200)', async () => {
  kv.clear();
  process.env.RESEND_API_KEY = 'test-key';          // configured...
  resend = { ok: false, body: { message: 'coachseye.app domain is not verified' } }; // ...but rejects
  try {
    await seedRealAccount('rej@reef.test', '203.0.113.7');
    const known   = await api({ action: 'request_password_reset', email: 'rej@reef.test' }, '203.0.113.8');
    const unknown = await api({ action: 'request_password_reset', email: 'void@reef.test' }, '203.0.113.9');
    assert.equal(known.statusCode, 200, 'provider rejection is swallowed, not surfaced as 5xx');
    assert.deepEqual(known.body, { ok: true });
    assert.deepEqual(known.body, unknown.body, 'rejection path indistinguishable from unknown');
    // No raw provider error text anywhere in the public body.
    assert.doesNotMatch(JSON.stringify(known.body), /not verified|domain|resend/i);
  } finally { delete process.env.RESEND_API_KEY; resend = { ok: true, body: { id: 'ok' } }; }
});

test('rate limiting remains effective (6th request in the window is 429)', async () => {
  kv.clear(); delete process.env.RESEND_API_KEY;
  const ip = '203.0.113.50';
  let last;
  for (let i = 0; i < 6; i++) last = await api({ action: 'request_password_reset', email: 'rl@reef.test' }, ip);
  assert.equal(last.statusCode, 429, 'rate limit still enforced at 5/window');
});
