/**
 * RC4.6C — Production email infrastructure hardening.
 *
 * Verifies the transactional sender contract now that CoachEasier ships with a
 * verified domain: environment-configurable sender AND reply-to, safe production
 * fallbacks (CoachEasier <noreply@coacheasier.com> / support@coacheasier.com /
 * https://www.coacheasier.com), production URL generation, the missing-key and
 * provider-failure paths, and a non-secret email-readiness diagnostic. Throughout:
 * the RESEND_API_KEY value must never appear in the request body or in logs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { sendTransactionalEmail, appBaseUrl } = await import('../api/_email.js');

const ORIG = {
  key: process.env.RESEND_API_KEY,
  from: process.env.EMAIL_FROM,
  replyTo: process.env.EMAIL_REPLY_TO,
  appUrl: process.env.APP_URL,
  fetch: globalThis.fetch,
};
function restore() {
  for (const [k, envName] of [['key','RESEND_API_KEY'],['from','EMAIL_FROM'],['replyTo','EMAIL_REPLY_TO'],['appUrl','APP_URL']]) {
    if (ORIG[k] === undefined) delete process.env[envName]; else process.env[envName] = ORIG[k];
  }
  globalThis.fetch = ORIG.fetch;
}

// Mock fetch that records exactly what would be sent to Resend.
function captureSend() {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers || {}, body: JSON.parse(options.body || '{}') });
    return { ok: true, json: async () => ({ id: 'em_captured' }) };
  };
  return calls;
}

test('reply-to: defaults to the verified support inbox in the Resend payload', async () => {
  process.env.RESEND_API_KEY = 'test-key-never-logged';
  delete process.env.EMAIL_REPLY_TO;
  const calls = captureSend();
  try {
    await sendTransactionalEmail({ to: 'coach@example.test', subject: 's', html: 'h', text: 't' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.reply_to, 'support@coacheasier.com', 'reply_to falls back to support@coacheasier.com');
  } finally { restore(); }
});

test('reply-to: EMAIL_REPLY_TO env overrides the fallback', async () => {
  process.env.RESEND_API_KEY = 'test-key-never-logged';
  process.env.EMAIL_REPLY_TO = 'help@another.test';
  const calls = captureSend();
  try {
    await sendTransactionalEmail({ to: 'coach@example.test', subject: 's', html: 'h', text: 't' });
    assert.equal(calls[0].body.reply_to, 'help@another.test');
  } finally { restore(); }
});

test('sender: defaults to CoachEasier <noreply@coacheasier.com>, EMAIL_FROM overrides', async () => {
  process.env.RESEND_API_KEY = 'test-key-never-logged';
  delete process.env.EMAIL_FROM;
  let calls = captureSend();
  try {
    await sendTransactionalEmail({ to: 'coach@example.test', subject: 's', html: 'h', text: 't' });
    assert.equal(calls[0].body.from, 'CoachEasier <noreply@coacheasier.com>');
  } finally { restore(); }

  process.env.RESEND_API_KEY = 'test-key-never-logged';
  process.env.EMAIL_FROM = 'CoachEasier <hello@coacheasier.com>';
  calls = captureSend();
  try {
    await sendTransactionalEmail({ to: 'coach@example.test', subject: 's', html: 'h', text: 't' });
    assert.equal(calls[0].body.from, 'CoachEasier <hello@coacheasier.com>');
  } finally { restore(); }
});

test('no secret leakage: the API key is in the Authorization header only, never in the JSON body', async () => {
  process.env.RESEND_API_KEY = 'test-key-never-logged';
  const calls = captureSend();
  try {
    await sendTransactionalEmail({ to: 'coach@example.test', subject: 's', html: 'h', text: 't' });
    assert.match(String(calls[0].headers.Authorization || ''), /^Bearer test-key-never-logged$/, 'key travels in the auth header');
    const bodyStr = JSON.stringify(calls[0].body);
    assert.doesNotMatch(bodyStr, /test-key-never-logged/, 'key never appears in the request body');
  } finally { restore(); }
});

test('production URL generation: appBaseUrl uses request host, then APP_URL, then www.coacheasier.com', () => {
  // 1. Forwarded host wins (real request behind Vercel proxy).
  assert.equal(
    appBaseUrl({ headers: { 'x-forwarded-host': 'www.coacheasier.com', 'x-forwarded-proto': 'https' } }),
    'https://www.coacheasier.com');
  // 2. No host header → APP_URL env.
  process.env.APP_URL = 'https://www.coacheasier.com';
  try { assert.equal(appBaseUrl({ headers: {} }), 'https://www.coacheasier.com'); } finally { restore(); }
  // 3. No host header and no APP_URL → safe production default.
  delete process.env.APP_URL;
  try { assert.equal(appBaseUrl({ headers: {} }), 'https://www.coacheasier.com'); } finally { restore(); }
});

test('missing RESEND_API_KEY: skipped, no network, unchanged return contract', async () => {
  delete process.env.RESEND_API_KEY;
  globalThis.fetch = async () => { throw new Error('network must not be called when unconfigured'); };
  try {
    const r = await sendTransactionalEmail({ to: 'coach@example.test', subject: 's', html: 'h', text: 't' });
    assert.deepEqual(r, { ok: true, sent: false, skipped: true, reason: 'email_not_configured' });
  } finally { restore(); }
});

test('provider failure: throws 502, key never surfaced', async () => {
  process.env.RESEND_API_KEY = 'test-key-never-logged';
  globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ message: 'domain not verified' }) });
  try {
    await assert.rejects(
      sendTransactionalEmail({ to: 'coach@example.test', subject: 's', html: 'h', text: 't' }),
      (e) => e.status === 502 && !/test-key-never-logged/.test(e.message));
  } finally { restore(); }
});

test('diagnostic: /api/config reports emailConfigured as a boolean, never the key value', async () => {
  const { default: configHandler } = await import('../api/config.js');
  function buildRes() {
    return { statusCode: 200, body: null, headers: {},
      status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; },
      setHeader(n,v){ this.headers[n] = v; }, end(){ return this; } };
  }
  // Configured
  process.env.RESEND_API_KEY = 'test-key-never-logged';
  let res = buildRes();
  await configHandler({ method: 'GET', query: {}, headers: {} }, res);
  assert.equal(res.body.emailConfigured, true, 'true when a key is present');
  assert.doesNotMatch(JSON.stringify(res.body), /test-key-never-logged/, 'key value never in the public config');
  // Not configured
  delete process.env.RESEND_API_KEY;
  res = buildRes();
  await configHandler({ method: 'GET', query: {}, headers: {} }, res);
  assert.equal(res.body.emailConfigured, false, 'false when no key is configured');
  restore();
});
