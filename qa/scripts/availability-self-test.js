#!/usr/bin/env node
/**
 * Availability Centre — API Self-Test (no browser required)
 *
 * Tests the full data flow:
 *   seed reset → POST responses → GET coach view → GET player self-view → push endpoint
 *
 * Usage:
 *   QA_BASE_URL=https://... node qa/scripts/availability-self-test.js
 *   node qa/scripts/availability-self-test.js          # uses http://127.0.0.1:3000
 *
 * Requires: DEV_LOGIN=true on the target server
 *           COOKIE env var for authenticated session (optional — player self-GET test needs it)
 */

const BASE   = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
const COOKIE = process.env.QA_SESSION_COOKIE || '';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const INFO = '\x1b[34m···\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(COOKIE ? { Cookie: COOKIE } : {}) },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, ok: res.ok };
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS}  ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL}  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    failures.push(label + (detail ? `: ${detail}` : ''));
  }
}

async function run() {
  console.log(`\n${INFO}  Availability Centre Self-Test`);
  console.log(`${INFO}  Target: ${BASE}\n`);

  // ── Step 1: Reset ─────────────────────────────────────────────────────────
  console.log('Step 1 — Reset availability data');
  const reset = await api('POST', '/api/seed', { action: 'reset_availability' });
  assert('seed API accessible (DEV_LOGIN=true)',    reset.status !== 403, `Got ${reset.status} — is DEV_LOGIN=true set?`);
  assert('reset_availability returns ok:true',      reset.data?.ok === true, JSON.stringify(reset.data));
  assert('reset clears all sessions',               Array.isArray(reset.data?.cleared) && reset.data.cleared.length >= 3, JSON.stringify(reset.data?.cleared));

  if (reset.status === 403) {
    console.log('\n  Cannot continue — server must be running with DEV_LOGIN=true\n');
    process.exit(1);
  }

  // ── Step 2: GET coach view (empty state) ──────────────────────────────────
  console.log('\nStep 2 — Coach GET (empty after reset)');
  const coachGetEmpty = await api('GET', '/api/availability?sessionId=game');
  // Coach GET requires auth — may return 403 if no session cookie
  if (coachGetEmpty.status === 403) {
    console.log(`  ${INFO}  Coach GET requires auth (no session cookie) — skipping authenticated checks`);
  } else {
    assert('coach GET returns 200',  coachGetEmpty.status === 200, `Got ${coachGetEmpty.status}`);
    assert('responses array is empty after reset', Array.isArray(coachGetEmpty.data?.responses) && coachGetEmpty.data.responses.length === 0, `Got ${coachGetEmpty.data?.responses?.length} entries`);
  }

  // ── Step 3: Seed demo data ────────────────────────────────────────────────
  console.log('\nStep 3 — Seed demo availability data');
  const seed = await api('POST', '/api/seed', { action: 'seed_availability' });
  assert('seed_availability returns ok:true',       seed.data?.ok === true, JSON.stringify(seed.data));
  assert('seed returns session counts',             typeof seed.data?.sessions === 'object', JSON.stringify(seed.data?.sessions));
  const gameSeed = seed.data?.sessions?.game;
  assert('game session seeded with ≥1 response',    typeof gameSeed === 'number' && gameSeed >= 1, `game count = ${gameSeed}`);

  // ── Step 4: GET seeded state (coach) ──────────────────────────────────────
  console.log('\nStep 4 — Coach GET after seeding');
  if (coachGetEmpty.status === 403) {
    console.log(`  ${INFO}  Skipped (no auth cookie)`);
  } else {
    const coachGet = await api('GET', '/api/availability?sessionId=game');
    assert('coach GET returns 200 after seed',      coachGet.status === 200, `Got ${coachGet.status}`);
    assert('seeded responses visible to coach',     Array.isArray(coachGet.data?.responses) && coachGet.data.responses.length >= 1, `Got ${coachGet.data?.responses?.length}`);
    const injuredRow = coachGet.data?.responses?.find(r => r.reason === 'injury');
    assert('injury reason persisted in coach GET',  injuredRow != null, `No injury entry found in ${JSON.stringify(coachGet.data?.responses?.map(r => ({ label: r.label, reason: r.reason })))}`);
    const workRow = coachGet.data?.responses?.find(r => r.reason === 'work');
    assert('work reason persisted in coach GET',    workRow != null, `No work entry found`);
  }

  // ── Step 5: POST player response ─────────────────────────────────────────
  console.log('\nStep 5 — POST player availability response');
  // Without an auth session, endpoint is required
  const fakeEndpoint = 'https://fcm.googleapis.com/fake-endpoint-for-selftest';
  const postNoSession = await api('POST', '/api/availability', {
    sessionId: 'game', response: 'available', reason: '', endpoint: fakeEndpoint,
  });
  // Should fail with 404 (endpoint not registered) — this is correct behaviour
  assert('POST without known endpoint returns 404', postNoSession.status === 404, `Got ${postNoSession.status}: ${JSON.stringify(postNoSession.data)}`);

  // POST with invalid response is rejected
  const postBadResponse = await api('POST', '/api/availability', {
    sessionId: 'game', response: 'yes-please', reason: '', endpoint: fakeEndpoint,
  });
  assert('POST with invalid response returns 400', postBadResponse.status === 400, `Got ${postBadResponse.status}`);

  // POST with invalid reason is sanitised (not rejected — unknown reason stored as '')
  // This is tested implicitly by the seeding flow above.

  // POST missing sessionId is rejected
  const postNoSessionId = await api('POST', '/api/availability', {
    response: 'available', reason: '', endpoint: fakeEndpoint,
  });
  assert('POST without sessionId returns 400',      postNoSessionId.status === 400, `Got ${postNoSessionId.status}`);

  // ── Step 6: Player self-GET ───────────────────────────────────────────────
  console.log('\nStep 6 — Player self-GET');
  const selfGet = await api('GET', '/api/availability?myResponse=1');
  // Without an auth session cookie, should return empty responses (not an error)
  assert('player self-GET returns 200',             selfGet.status === 200, `Got ${selfGet.status}: ${JSON.stringify(selfGet.data)}`);
  assert('player self-GET returns responses object', typeof selfGet.data?.responses === 'object', JSON.stringify(selfGet.data));
  if (COOKIE) {
    // With a valid session, should return the player's own responses
    const hasResponse = Object.keys(selfGet.data?.responses || {}).length > 0;
    assert('authenticated player sees own responses', hasResponse, JSON.stringify(selfGet.data?.responses));
  } else {
    console.log(`  ${INFO}  No QA_SESSION_COOKIE set — skipping auth response check`);
  }

  // ── Step 7: Push reminder endpoint ───────────────────────────────────────
  console.log('\nStep 7 — Push reminder endpoint');
  const push = await api('POST', '/api/push', {
    title: 'Availability reminder (self-test)',
    body: 'Please confirm your availability.',
    tag: `selftest-remind-${Date.now()}`,
    type: 'availability',
    sessionId: 'game',
    url: '/?to=availability',
    audience: 'no-reply',
  });
  assert('push API returns 200',                    push.status === 200, `Got ${push.status}: ${JSON.stringify(push.data)}`);
  assert('push API returns ok:true',                push.data?.ok === true, JSON.stringify(push.data));
  assert('push response has sent count',            typeof push.data?.sent === 'number', JSON.stringify(push.data));

  // ── Step 8: Seed API GET status ───────────────────────────────────────────
  console.log('\nStep 8 — Seed API GET status check');
  const seedStatus = await api('GET', '/api/seed?sessions=tue,thu,game');
  assert('seed GET status returns 200',             seedStatus.status === 200, `Got ${seedStatus.status}`);
  assert('seed GET returns sessions object',        typeof seedStatus.data?.sessions === 'object', JSON.stringify(seedStatus.data));

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  const total = passed + failed;
  if (failed === 0) {
    console.log(`\n${PASS}  All ${total} checks passed\n`);
    process.exit(0);
  } else {
    console.log(`\n${FAIL}  ${failed}/${total} checks failed`);
    failures.forEach(f => console.log(`       • ${f}`));
    console.log();
    process.exit(1);
  }
}

run().catch(err => {
  console.error(`\n${FAIL}  Unhandled error: ${err.message}\n`);
  process.exit(1);
});
