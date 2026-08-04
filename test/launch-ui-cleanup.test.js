/**
 * RC4.10D — launch UI cleanup.
 *
 *  1. Forgot password is visible on the normal login screen and uses the
 *     existing secure reset endpoint (no second implementation).
 *  2. Build / environment / hostname information never appears in normal UI —
 *     in ANY environment — and survives only behind authorised diagnostics.
 *  3. The RC4.9B reset/test protections are intact: hidden in normal use and
 *     enforced server-side, with DEV_LOGIN alone granting nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// ── Forgot password ─────────────────────────────────────────────────────────
test('the login screen renders a visible Forgot password control', () => {
  const panel = src.slice(src.indexOf("authTab === 'login' ?"), src.indexOf("Players can sign in once"));
  assert.match(panel, /Forgot password\?/, 'control is present on the login panel');
  assert.match(panel, /onclick="requestPasswordReset\(\)"/, 'wired to the reset flow');
  // Reachable before authentication: it lives in the pre-login auth panel.
  assert.match(panel, /id="identityLoginEmail"/, 'sits alongside the login email field');
});

test('the Forgot password control meets the mobile tap-target size', () => {
  const btn = src.match(/<button id="identityResetBtn"[^>]*>/)[0];
  const min = Number((btn.match(/min-height:(\d+)px/) || [])[1] || 0);
  assert.ok(min >= 44, `tap target is ${min}px, expected >= 44px`);
});

test('reset uses the existing secure endpoint — there is no second implementation', () => {
  const fn = src.slice(src.indexOf('async function requestPasswordReset'), src.indexOf('function loginAs('));
  assert.match(fn, /action: 'request_password_reset'/, 'calls the existing identity action');
  assert.match(fn, /'\/api\/identity'/, 'uses the identity endpoint');
  // Exactly one place issues a reset request.
  const requests = src.match(/action: 'request_password_reset'/g) || [];
  assert.equal(requests.length, 1, 'only one reset request implementation exists');
  // …and exactly one place completes a reset.
  const completes = src.match(/action: 'reset_password'/g) || [];
  assert.equal(completes.length, 1, 'only one reset completion implementation exists');
});

test('the reset response is identical for known and unknown emails (no enumeration)', () => {
  const fn = src.slice(src.indexOf('async function requestPasswordReset'), src.indexOf('function loginAs('));
  // The client must not branch on whether the account exists.
  assert.doesNotMatch(fn, /no account|not found|unknown email|doesn't exist/i,
    'client never reveals whether an account exists');
  assert.match(fn, /If that email has an account/i, 'a single neutral confirmation for every address');
});

test('a completed reset returns the user to login', () => {
  const start = src.indexOf('async function completePasswordReset');
  const fn = src.slice(start, start + 2000);
  assert.ok(start > 0, 'reset submission handler exists');
  assert.match(fn, /authTab = 'login'/, 'sends the user back to the login form');
  assert.match(fn, /reset-modal'\)\?\.remove\(\)/, 'closes the reset modal');
  assert.match(fn, /You can log in now/i, 'tells the user they can sign in');
});

// ── Production build information ────────────────────────────────────────────
test('the build pill requires authorised diagnostics, not merely a non-production build', () => {
  const fn = src.slice(src.indexOf('function renderBuildDomainBanner'), src.indexOf('render();\n    applyClubBranding'));
  assert.match(fn, /_diagnosticsOn\(\)/, 'pill is gated on the diagnostics mode');
  assert.doesNotMatch(fn, /else if \(env !== 'production'\)/, 'the old environment-only gate is gone');
});

test('build, environment and branch rows are not emitted outside diagnostics', () => {
  // The Settings "Build" block and the Beta Readiness card are rendered
  // conditionally — not merely CSS-hidden — so no markup or spacing remains.
  const settings = src.slice(src.indexOf('function renderSettings()'), src.indexOf('function renderClubAdmin'));
  const buildBlock = settings.indexOf('>Build</div>');
  assert.ok(buildBlock > 0, 'build block exists');
  const before = settings.slice(Math.max(0, buildBlock - 400), buildBlock);
  assert.match(before, /_diagnosticsOn\(\)\) \? `/, 'build block only rendered in diagnostics mode');

  const readiness = settings.indexOf('>Beta Readiness</h2>');
  assert.ok(readiness > 0, 'Beta Readiness card exists');
  const beforeReadiness = settings.slice(Math.max(0, readiness - 300), readiness);
  assert.match(beforeReadiness, /_diagnosticsOn\(\)\) \? `/, 'readiness card only rendered in diagnostics mode');
});

test('the diagnostics gate itself still requires danger_zone AND an explicit opt-in', () => {
  const fn = src.match(/function diagnosticsMode\(\)\s*\{[\s\S]{0,400}?\n    \}/)[0];
  assert.match(fn, /canI\('danger_zone'\)/, 'permission gate');
  assert.match(fn, /diagnostics'\) === '1'/, 'explicit opt-in gate');
  // The guarded wrapper fails CLOSED when it cannot be resolved.
  assert.match(src, /typeof diagnosticsMode === 'function' \? diagnosticsMode\(\) : false/, 'fails closed');
});

// ── Reset / test controls (RC4.9B protection must not weaken) ───────────────
test('reset and test-data controls remain behind the diagnostics gate', () => {
  const resetIdx = src.indexOf('doFullReset()"');
  assert.ok(resetIdx > 0, 'device reset control exists');
  assert.match(src.slice(Math.max(0, resetIdx - 1200), resetIdx), /_diagnosticsOn\(\)\) \? `/,
    'device reset requires diagnostics mode');

  const testDataIdx = src.indexOf('settingsCleanTestData()');
  assert.ok(testDataIdx > 0, 'test-data control exists');
  assert.match(src.slice(Math.max(0, testDataIdx - 200), testDataIdx), /_diagnosticsOn\(\)/,
    'test-data cleanup requires diagnostics mode');
});

test('the developer debug overlay still requires the dev-login flag', () => {
  const fn = src.match(/function renderDebugOverlay\(\)\s*\{[\s\S]{0,300}/)[0];
  assert.match(fn, /if \(!window\._devLoginEnabled\)/, 'overlay removed unless dev login is enabled');
});

// ── Server enforcement: DEV_LOGIN alone grants nothing ──────────────────────
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.launchcleanup.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';
process.env.DEV_LOGIN = 'true';           // worst case: the flag is left ON

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: availability } = await import('../api/availability.js');
const { default: identity } = await import('../api/identity.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function callAvail(method, query, body, cookie) {
  const r = res();
  await availability({ method, query: query || {}, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
async function callIdentity(body) {
  const r = res();
  await identity({ method: 'POST', query: {}, headers: {}, body }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

let _t = 0;
async function setup() {
  kv.clear(); _t = 0;
  const club = await store.createClub({ clubName: 'Cleanup RFC', teamName: 'Seniors', sport: 'rugby', name: 'Cleanup Coach', email: `c${++_t}@lc.test`, password: 'password123' });
  const token = 'TK' + String(++_t).padStart(8, '0');
  kv.set('ce:invites', JSON.stringify([{ token, email: 'p@lc.test', name: 'Cleanup Player', role: 'player', teamId: club.team.id, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  const player = await store.claimInvite({ token, email: 'p@lc.test', name: 'Cleanup Player', password: 'password123' });
  return { club, player };
}

test('players cannot reach reset or test endpoints even with DEV_LOGIN enabled', async () => {
  const { player } = await setup();
  assert.equal((await callAvail('POST', {}, { action: 'reset_availability' }, ck(player.session))).statusCode, 403);
  assert.equal((await callAvail('POST', {}, { action: 'seed_availability' }, ck(player.session))).statusCode, 403);
  assert.equal((await callAvail('GET', { _dev: 'status' }, null, ck(player.session))).statusCode, 403);
});

test('anonymous callers get 401 on reset and test endpoints', async () => {
  await setup();
  assert.equal((await callAvail('POST', {}, { action: 'reset_availability' }, null)).statusCode, 401);
  assert.equal((await callAvail('GET', { _dev: 'status' }, null, null)).statusCode, 401);
});

test('password reset gives an identical response for known and unknown emails', async () => {
  const { club } = await setup();
  const known = await callIdentity({ action: 'request_password_reset', email: `c1@lc.test` });
  const unknown = await callIdentity({ action: 'request_password_reset', email: 'nobody-at-all@lc.test' });
  assert.equal(known.statusCode, unknown.statusCode, 'same status');
  assert.deepEqual(known.body, unknown.body, 'byte-identical body — no enumeration');
  assert.equal(known.body.ok, true);
  assert.ok(club.user.id, 'a real account existed for the known address');
});

test('invalid and expired reset links fail safely without revealing anything', async () => {
  await setup();
  const bad = await callIdentity({ action: 'reset_password', token: 'not-a-real-token', password: 'brand-New-1!' });
  assert.equal(bad.statusCode, 410);
  assert.match(bad.body.error, /invalid or expired/i);
  assert.doesNotMatch(JSON.stringify(bad.body), /user|account|email/i, 'no account detail leaked');
});
