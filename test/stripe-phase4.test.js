/**
 * Stripe Phase 4 — Real checkout and billing portal with Stripe SDK.
 *
 * This file sets STRIPE_SECRET_KEY and mocks globalThis.fetch BEFORE importing
 * identity.js. The makeStripe() factory calls Stripe.createFetchHttpClient()
 * with no arguments — that constructor captures globalThis.fetch at the time
 * identity.js is loaded, so all Stripe API calls flow through our mock.
 *
 * Tests:
 *  1. Checkout creates a new Stripe customer when none exists
 *  2. Checkout reuses an existing stripeCustomerId (no duplicate customer)
 *  3. Checkout persists stripeCustomerId to Redis after creating a customer
 *  4. Checkout session includes automatic_tax: {enabled: true}
 *  5. Checkout success returns ok:true with a real-looking checkoutUrl
 *  6. Missing STRIPE_PRO_PRICE_ID → 503
 *  7. Billing portal with a stripeCustomerId → 200, portalUrl present
 *  8. Billing portal without a stripeCustomerId → 409
 *  9. Active Pro team → 409 (already subscribed, no Stripe call made)
 * 10. Stripe API error propagates as 400/500 (not a crash)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.stripe-phase4.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.STRIPE_SECRET_KEY        = 'sk_test_placeholder_for_mocked_tests';
process.env.STRIPE_PRO_PRICE_ID      = 'price_test_pro_mock';

// Recorded Stripe API calls for assertion in each test.
let stripeCallLog = [];
// Set to { urlPattern, status } to force a Stripe error in test 10.
// The Stripe client captures globalThis.fetch at import time, so we use a
// mutable flag closed over by the original function rather than replacing fetch.
let forceStripeError = null;

// Mock fetch handles both Redis (array-body) and Stripe (URL contains stripe.com).
const kv = new Map();

function makeStripeMockResponse(url) {
  let body;
  if (url.includes('/v1/customers')) {
    body = { id: 'cus_mock123', object: 'customer', email: 'x@x.com' };
  } else if (url.includes('/v1/checkout/sessions')) {
    body = { id: 'cs_mock123', object: 'checkout.session', url: 'https://checkout.stripe.com/pay/cs_mock123' };
  } else if (url.includes('/v1/billing_portal/sessions')) {
    body = { id: 'bps_mock123', object: 'billing_portal.session', url: 'https://billing.stripe.com/session/bps_mock123' };
  } else {
    body = {};
  }
  const text = JSON.stringify(body);
  return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => JSON.parse(text), text: async () => text };
}

globalThis.fetch = async (url, options = {}) => {
  const urlStr = String(url || '');

  // Stripe calls go to api.stripe.com
  if (urlStr.includes('stripe.com')) {
    stripeCallLog.push({ url: urlStr, body: options.body });
    if (forceStripeError && urlStr.includes(forceStripeError.urlPattern)) {
      const body = JSON.stringify({ error: { type: 'api_error', message: 'Stripe is down' } });
      return { ok: false, status: forceStripeError.status || 500, headers: new Headers({ 'content-type': 'application/json' }), json: async () => JSON.parse(body), text: async () => body };
    }
    return makeStripeMockResponse(urlStr);
  }

  // Redis pipeline calls (array body)
  let parsed;
  try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'email_mock' }) };
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'EXPIRE' || command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

// Imports AFTER globalThis.fetch is set — Stripe.createFetchHttpClient()
// captures globalThis.fetch at this point.
const { default: identityHandler } = await import('../api/identity.js');
const {
  createClub,
  createSession,
  loadTeams,
  saveTeams,
  loadTeamMembers,
  saveTeamMembers,
  SESSION_COOKIE,
} = await import('../api/_identityStore.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

function cookieHeader(token) {
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` };
}

async function callIdentity(action, token) {
  const res = buildRes();
  await identityHandler({
    method: 'POST',
    query: {},
    headers: { 'x-forwarded-for': '198.51.100.1', ...cookieHeader(token) },
    body: { action },
  }, res);
  return res;
}

// Helper: create a head_coach (club creator) session.
async function makeHeadCoachSession(suffix = '') {
  const created = await createClub({
    clubName: `Phase4 Club ${suffix}`,
    name: `Coach ${suffix}`,
    email: `coach${suffix}@phase4.test`,
    password: 'Phase4Pass1!',
  });
  return { session: created.session, team: created.team, user: created.user };
}

// ── 1. Checkout creates a Stripe customer when none exists ───────────────────

test('create_checkout: creates Stripe customer when stripeCustomerId is null', async () => {
  kv.clear(); stripeCallLog = [];
  const { session, team } = await makeHeadCoachSession('new-cus');
  assert.equal(team.stripeCustomerId, null, 'precondition: new club has no customer');

  const res = await callIdentity('create_checkout', session.token);
  assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true);

  const customerCall = stripeCallLog.find(c => c.url.includes('/v1/customers') && !c.url.includes('/v1/checkout'));
  assert.ok(customerCall, 'Should have called /v1/customers to create a customer');
});

// ── 2. Checkout reuses existing stripeCustomerId ─────────────────────────────

test('create_checkout: reuses existing stripeCustomerId without creating another', async () => {
  kv.clear(); stripeCallLog = [];
  const { session, team } = await makeHeadCoachSession('reuse-cus');
  // Pre-set a customer ID.
  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  stored.stripeCustomerId = 'cus_existing_abc';
  await saveTeams(teams);

  const res = await callIdentity('create_checkout', session.token);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);

  const customerCreates = stripeCallLog.filter(c =>
    c.url.includes('/v1/customers') && !c.url.includes('/v1/checkout') && c.body,
  );
  assert.equal(customerCreates.length, 0, 'Should NOT call POST /v1/customers when customerId is already set');
});

// ── 3. Checkout persists stripeCustomerId to Redis ───────────────────────────

test('create_checkout: persists new stripeCustomerId to team record after creation', async () => {
  kv.clear(); stripeCallLog = [];
  const { session, team } = await makeHeadCoachSession('persist-cus');

  await callIdentity('create_checkout', session.token);

  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  assert.equal(stored.stripeCustomerId, 'cus_mock123', 'stripeCustomerId should be persisted from Stripe response');
});

// ── 4. Checkout includes automatic_tax in session creation ───────────────────

test('create_checkout: sends automatic_tax:{enabled:true} to Stripe', async () => {
  kv.clear(); stripeCallLog = [];
  const { session } = await makeHeadCoachSession('auto-tax');

  await callIdentity('create_checkout', session.token);

  const sessionCall = stripeCallLog.find(c => c.url.includes('/v1/checkout/sessions'));
  assert.ok(sessionCall, 'Should have called /v1/checkout/sessions');
  // The Stripe SDK form-encodes the body; automatic_tax[enabled]=true
  const body = String(sessionCall.body || '');
  assert.ok(
    body.includes('automatic_tax') && body.includes('enabled') && body.includes('true'),
    `Expected automatic_tax[enabled]=true in request body, got: ${body.slice(0, 200)}`,
  );
});

// ── 5. Checkout success returns checkoutUrl ──────────────────────────────────

test('create_checkout: returns ok:true with checkout.stripe.com URL', async () => {
  kv.clear(); stripeCallLog = [];
  const { session } = await makeHeadCoachSession('url-check');

  const res = await callIdentity('create_checkout', session.token);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.checkoutUrl, 'checkoutUrl must be truthy');
  assert.ok(res.body.checkoutUrl.includes('checkout.stripe.com'), `URL should be a Stripe checkout URL: ${res.body.checkoutUrl}`);
});

// ── 6. Missing STRIPE_PRO_PRICE_ID → 503 ────────────────────────────────────

test('create_checkout: missing STRIPE_PRO_PRICE_ID → 503', async () => {
  kv.clear(); stripeCallLog = [];
  const { session } = await makeHeadCoachSession('no-price');
  const saved = process.env.STRIPE_PRO_PRICE_ID;
  delete process.env.STRIPE_PRO_PRICE_ID;

  try {
    const res = await callIdentity('create_checkout', session.token);
    assert.equal(res.statusCode, 503, `Expected 503, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.ok, false);
  } finally {
    process.env.STRIPE_PRO_PRICE_ID = saved;
  }
});

// ── 7. Billing portal with stripeCustomerId → 200, portalUrl present ─────────

test('create_billing_portal: with stripeCustomerId → 200, portalUrl present', async () => {
  kv.clear(); stripeCallLog = [];
  const { session, team } = await makeHeadCoachSession('portal-ok');
  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  stored.stripeCustomerId = 'cus_portal_test';
  await saveTeams(teams);

  const res = await callIdentity('create_billing_portal', session.token);
  assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.portalUrl, 'portalUrl must be truthy');
  assert.ok(res.body.portalUrl.includes('billing.stripe.com'), `URL should be a Stripe billing URL: ${res.body.portalUrl}`);
});

// ── 8. Billing portal without stripeCustomerId → 409 ─────────────────────────

test('create_billing_portal: no stripeCustomerId → 409 (no billing account)', async () => {
  kv.clear(); stripeCallLog = [];
  const { session, team } = await makeHeadCoachSession('portal-no-cus');
  assert.equal(team.stripeCustomerId, null, 'precondition: new club has no customer');

  const res = await callIdentity('create_billing_portal', session.token);
  assert.equal(res.statusCode, 409, `Expected 409, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /no billing account/i);

  const portalCalls = stripeCallLog.filter(c => c.url.includes('/v1/billing_portal'));
  assert.equal(portalCalls.length, 0, 'Should not call Stripe billing portal API when customerId is missing');
});

// ── 9. Already-Pro team → 409 before any Stripe call ────────────────────────

test('create_checkout: active Pro team → 409, no Stripe call made', async () => {
  kv.clear(); stripeCallLog = [];
  const { session, team } = await makeHeadCoachSession('already-pro');
  const teams = await loadTeams();
  const stored = teams.find(t => t.id === team.id);
  stored.plan = 'pro'; stored.planStatus = 'active';
  stored.stripeCustomerId = 'cus_already'; stored.stripeSubscriptionId = 'sub_already';
  await saveTeams(teams);

  const res = await callIdentity('create_checkout', session.token);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.ok, false);
  assert.match(res.body.error, /already has an active Pro/i);

  assert.equal(stripeCallLog.length, 0, 'Should not call Stripe at all when team is already Pro');
});

// ── 10. Stripe API error propagates cleanly ──────────────────────────────────
// The Stripe client captured globalThis.fetch at import time, so we control
// error injection via the `forceStripeError` flag closed over by the mock.

test('create_checkout: Stripe API error returns non-2xx without crashing', async () => {
  kv.clear(); stripeCallLog = [];
  const { session } = await makeHeadCoachSession('stripe-err');

  forceStripeError = { urlPattern: '/v1/customers', status: 500 };
  try {
    const res = await callIdentity('create_checkout', session.token);
    assert.ok(res.statusCode >= 400, `Expected an error status, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  } finally {
    forceStripeError = null;
  }
});
