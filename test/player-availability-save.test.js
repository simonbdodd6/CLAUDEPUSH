/**
 * Player availability SAVE path — repeated changes must always reach the server.
 *
 * Proven failing stage (pre-fix): saveAvailabilityResponseToServer awaited
 * navigator.serviceWorker.ready before POSTing; with no active SW that promise
 * never resolves, so the POST never fired — the tap updated local UI only and the
 * coach kept seeing the earlier value. Fix: race the endpoint lookup against a
 * timeout so the authenticated POST always fires.
 *
 * Mix of real-extracted client functions + the real availability API (mocked KV).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('(', start), pd = 0;
  for (; i < src.length; i++) { if (src[i] === '(') pd++; else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } } }
  let depth = 0; i = src.indexOf('{', i);
  for (let b = i; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } } }
  return src.slice(start, i + 1);
}

// ── (1) THE FIX: POST fires even when serviceWorker.ready never resolves ──────
test('saveAvailabilityResponseToServer POSTs even when serviceWorker.ready never resolves', { timeout: 4000 }, async () => {
  const run = new Function(`
    "use strict";
    let posted = null;
    const navigator = { serviceWorker: { ready: new Promise(() => {}) } }; // never resolves
    const fetch = (url, opts) => { posted = { url, body: JSON.parse(opts.body) }; return Promise.resolve({ ok: true, catch(){ return this; } }); };
    ${extractFn('saveAvailabilityResponseToServer')}
    return (async () => { await saveAvailabilityResponseToServer('tue', 'available', ''); return posted; })();
  `);
  const posted = await run();
  assert.ok(posted, 'the POST fired (did not hang on serviceWorker.ready)');
  assert.equal(posted.url, '/api/availability');
  assert.equal(posted.body.sessionId, 'tue');
  assert.equal(posted.body.response, 'available');
});

test("'injured' maps to unavailable + reason injury in the POST body", { timeout: 4000 }, async () => {
  const run = new Function(`
    "use strict";
    let posted = null;
    const navigator = { serviceWorker: { ready: new Promise(() => {}) } };
    const fetch = (url, opts) => { posted = JSON.parse(opts.body); return Promise.resolve({ ok: true, catch(){ return this; } }); };
    ${extractFn('saveAvailabilityResponseToServer')}
    return (async () => { await saveAvailabilityResponseToServer('game', 'injured', ''); return posted; })();
  `);
  const b = await run();
  assert.equal(b.response, 'unavailable');
  assert.equal(b.reason, 'injury');
});

// ── (2) No "submitted/confirmed" guard blocks later taps ─────────────────────
test('availabilityV2SetStatus saves on every tap (no confirmed-state block)', () => {
  const run = new Function(`
    "use strict";
    const calls = [];
    let _availReasonOpenByKey = {};
    function setPlayerAvailability(key, status, reason){ calls.push([key, status, reason]); }
    function renderPlayerAvailabilityV2(){}
    ${extractFn('availabilityV2SetStatus')}
    availabilityV2SetStatus('trainingTuesday', 'available');
    availabilityV2SetStatus('trainingTuesday', 'maybe');
    availabilityV2SetStatus('trainingTuesday', 'unavailable');
    availabilityV2SetStatus('trainingTuesday', 'available');
    return calls;
  `);
  const calls = run();
  assert.equal(calls.length, 4, 'every tap calls the save path');
  assert.deepEqual(calls.map(c => c[1]), ['available', 'maybe', 'unavailable', 'available']);
});

// ── (3) Static: player cards stay tappable; no locked/submitted early-return ──
test('player availability cards always render tappable buttons wired to availabilityV2SetStatus', () => {
  const card = extractFn('availabilityCardV2');
  assert.match(card, /onclick="availabilityV2SetStatus\('\$\{key\}','\$\{val\}'\)"/, 'status buttons always wired');
  assert.doesNotMatch(card, /disabled|readonly/i, 'no disabled/locked buttons');
  const render = extractFn('renderPlayerAvailabilityV2');
  assert.match(render, /sessions\.map\(s => availabilityCardV2/, 'always renders a card per session');
  assert.doesNotMatch(render, /return[^;]*All responses submitted/, 'no early-return submitted view that hides cards');
});

// ── (4) Server: reason → no-reason still overwrites (latest wins everywhere) ──
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.player-save.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';
const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};
const store = await import('../api/_identityStore.js');
const { default: availability } = await import('../api/availability.js');
const { SESSION_COOKIE } = store;
function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function call(method, query, body, cookie) { const r = res(); await availability({ method, query: query || {}, headers: cookie ? { cookie } : {}, body: body || {} }, r); return r; }
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
let _t = 0;

test('reason then no-reason POST still overwrites; self-read and coach board show latest', async () => {
  kv.clear(); _t = 0;
  const club = await store.createClub({ clubName: 'PS test club', teamName: 'Seniors', sport: 'rugby', name: 'PS Coach', email: `psc${++_t}@ps.test`, password: 'password123' });
  kv.set(`app:publish:${club.team.id}:sessions`, JSON.stringify([{ id: 'tue', title: 'Tuesday' }]));
  const token = 'TK' + String(++_t).padStart(8, '0');
  kv.set('ce:invites', JSON.stringify([{ token, email: 'psp@ps.test', name: 'PS Player', role: 'player', teamId: club.team.id, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  const player = await store.claimInvite({ token, email: 'psp@ps.test', name: 'PS Player', password: 'password123' });
  const uid = player.user.id.toLowerCase();

  // unavailable WITH reason, then available WITHOUT reason
  await call('POST', {}, { sessionId: 'tue', response: 'unavailable', reason: 'work' }, ck(player.session));
  let board = (await call('GET', { resolveRoster: '1' }, null, ck(club.session))).body.resolved[uid].tue;
  assert.equal(board.response, 'unavailable'); assert.equal(board.reason, 'work');

  await call('POST', {}, { sessionId: 'tue', response: 'available', reason: '' }, ck(player.session));
  const self = (await call('GET', { myResponse: '1' }, null, ck(player.session))).body.responses.tue;
  board = (await call('GET', { resolveRoster: '1' }, null, ck(club.session))).body.resolved[uid].tue;
  assert.equal(self.response, 'available', 'self-read latest');
  assert.equal(board.response, 'available', 'coach board latest');
  assert.equal(board.reason, '', 'reason cleared on overwrite');
});
