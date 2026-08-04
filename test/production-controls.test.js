/**
 * RC4.9B Part 2 — production test/debug controls.
 *
 * Two halves:
 *  A. SOURCE — no destructive/diagnostic control is rendered in normal
 *     production use; the build badge and dev overlay stay dev-only.
 *  B. SERVER — the dev seed/reset endpoints are real endpoints, so hiding the
 *     buttons is not enough: they must reject players and anonymous callers
 *     even when DEV_LOGIN is enabled.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// ── A. Source guarantees ─────────────────────────────────────────────────────
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('device reset is behind the authorised-admin diagnostics mode', () => {
  const idx = src.indexOf('doFullReset()"');
  assert.ok(idx !== -1, 'reset control exists');
  const before = src.slice(Math.max(0, idx - 1200), idx);
  assert.match(before, /_diagnosticsOn\(\)\) \? `/, 'reset card is wrapped in the diagnostics gate');
});

test('test-data cleanup is behind the diagnostics mode too', () => {
  const idx = src.indexOf('settingsCleanTestData()');
  assert.ok(idx !== -1);
  const before = src.slice(Math.max(0, idx - 200), idx);
  assert.match(before, /_diagnosticsOn\(\)/, 'test-data control requires diagnostics mode');
});

test('diagnostics mode requires danger_zone AND an explicit opt-in', () => {
  const m = src.match(/function diagnosticsMode\(\)\s*\{[\s\S]{0,400}?\n    \}/);
  assert.ok(m, 'diagnosticsMode() exists');
  assert.match(m[0], /canI\('danger_zone'\)/, 'permission gate');
  assert.match(m[0], /diagnostics'\) === '1'/, 'explicit opt-in gate');
});

test('build/environment badge never renders in production', () => {
  assert.match(src, /else if \(env !== 'production'\)/, 'build pill is gated to non-production');
});

test('developer debug overlay requires the dev-login flag', () => {
  const m = src.match(/function renderDebugOverlay\(\)\s*\{[\s\S]{0,300}/);
  assert.ok(m);
  assert.match(m[0], /if \(!window\._devLoginEnabled\)/, 'overlay removed unless dev login enabled');
});

// ── B. Server enforcement (real handler, mocked Upstash) ─────────────────────
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.prodctl.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';
process.env.DEV_LOGIN = 'true'; // worst case: the flag is left ON

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
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function call(method, query, body, cookie) {
  const r = res();
  await availability({ method, query: query || {}, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
let _t = 0;
async function setup() {
  kv.clear(); _t = 0;
  const club = await store.createClub({ clubName: 'Prodctl RFC', teamName: 'Seniors', sport: 'rugby', name: 'Prod Coach', email: `pc${++_t}@pc.test`, password: 'password123' });
  const token = 'TK' + String(++_t).padStart(8, '0');
  kv.set('ce:invites', JSON.stringify([{ token, email: 'pp@pc.test', name: 'Prod Player', role: 'player', teamId: club.team.id, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  const player = await store.claimInvite({ token, email: 'pp@pc.test', name: 'Prod Player', password: 'password123' });
  return { club, player };
}

test('player cannot seed or reset availability even with DEV_LOGIN on', async () => {
  const { player } = await setup();
  assert.equal((await call('POST', {}, { action: 'seed_availability' }, ck(player.session))).statusCode, 403);
  assert.equal((await call('POST', {}, { action: 'reset_availability' }, ck(player.session))).statusCode, 403);
});

test('player cannot read the dev status diagnostic', async () => {
  const { player } = await setup();
  assert.equal((await call('GET', { _dev: 'status' }, null, ck(player.session))).statusCode, 403);
});

test('anonymous callers cannot seed or reset availability', async () => {
  await setup();
  const r = await call('POST', {}, { action: 'seed_availability' }, null);
  assert.equal(r.statusCode, 401, JSON.stringify(r.body));
});

test('an authorised club admin can still use the dev tooling', async () => {
  const { club } = await setup();
  const reset = await call('POST', {}, { action: 'reset_availability' }, ck(club.session));
  assert.equal(reset.statusCode, 200, JSON.stringify(reset.body));
  assert.equal(reset.body.ok, true);
});
