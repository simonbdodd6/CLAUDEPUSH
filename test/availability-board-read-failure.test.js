/**
 * AVAILABILITY BOARD — a failed read is never an empty board.
 *
 * Verified defect (cd-104): the coach board read (GET ?resolveRoster=1)
 * resolved its roster with `listIdentityState(...).catch(() => ({ player_profiles: [] }))`.
 * Any failure reading the club's identities became an EMPTY roster and a
 * successful `200 { resolved: {} }`. The client took the success path: it
 * stamped "Synced", and availabilityDropStaleLocalAnswers deleted every
 * in-scope player's answer from the board — the whole squad read "No reply"
 * on the board, the Overview and the Members dots until the next good read.
 * (The answers themselves stayed on the server.)
 *
 * The contract pinned here:
 *   SERVER  a failure while reading the roster or the group's answers is a
 *           5xx (503 for storage, with its fixed message; 500 otherwise, with
 *           no internals) — never a 200.
 *   CLIENT  a 200 that does not carry a `resolved` object is a failed read,
 *           exactly like a 4xx/5xx, a network drop or malformed JSON: the
 *           board in force is kept, nothing is deleted, the chip says "Sync
 *           failed". A REAL 200 — with answers, or genuinely empty — keeps its
 *           existing meaning (the empty one is the authoritative "nobody has
 *           answered / the week was cleared").
 *
 * Server proofs drive the REAL handler + identity store against an in-memory
 * Upstash stand-in; client proofs run the REAL refreshLiveAvailability (and the
 * real availabilityDropStaleLocalAnswers behind a call-counting spy) extracted
 * from index.html. Nothing touches a real service.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.board-read.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

// ── Upstash stand-in. `failInside` names a function: any command issued from
// within it (V8 async stack) gets `failMode` — the outage's HTTP 401, or a
// corrupt (non-array) store value. Commands outside it — the coach's session
// check — are answered normally, so the failure lands exactly where intended.
const kv = new Map();
let failInside = null, failMode = 'storage';
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  if (failInside && new Error().stack.includes(failInside)) {
    if (failMode === 'storage') return { ok: false, status: 401, json: async () => ({ error: 'WRONGPASS invalid or missing auth token' }) };
    if (failMode === 'corrupt' && c === 'GET') return { ok: true, json: async () => ({ result: JSON.stringify({ not: 'an array' }) }) };
  }
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { const nx = a.slice(2).map(x => String(x).toUpperCase()).includes('NX'); if (nx && kv.has(a[0])) r = null; else { kv.set(a[0], a[1]); r = 'OK'; } }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
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
async function club() {
  kv.clear(); _t = 0; failInside = null; failMode = 'storage';
  const coach = await store.createClub({ clubName: 'Alpha RFC', teamName: 'Seniors', sport: 'rugby', name: 'Alpha Coach', email: `c${++_t}@board.test`, password: 'password123' });
  const token = 'TK' + String(++_t).padStart(8, '0');
  kv.set('ce:invites', JSON.stringify([{ token, email: `p${_t}@board.test`, name: 'Alpha Player', role: 'player', teamId: coach.team.id, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  const player = await store.claimInvite({ position: '2 — Hooker', token, email: `p${_t}@board.test`, name: 'Alpha Player', password: 'password123' });
  return { coach, player };
}
const BOARD = { resolveRoster: '1' };

// ─── SERVER ─────────────────────────────────────────────────────────────────

test('SV1: storage failure while reading the ROSTER → 503, never a successful empty board', async () => {
  const { coach } = await club();
  failInside = 'listIdentityState';
  const r = await call('GET', BOARD, null, ck(coach.session));
  failInside = null;
  assert.equal(r.statusCode, 503, `a roster that cannot be read is unavailable (got ${r.statusCode} ${JSON.stringify(r.body)})`);
  assert.equal(r.body?.ok, false);
  assert.equal(r.body?.error, 'Storage temporarily unavailable', 'the fixed, internals-free storage message');
  assert.equal(r.body?.resolved, undefined, 'no `resolved` the client could take for an empty week');
});

test('SV2: any other failure reading the roster → 500 with no internals, never a 200', async () => {
  const { coach } = await club();
  failInside = 'listIdentityState'; failMode = 'corrupt';
  const r = await call('GET', BOARD, null, ck(coach.session));
  failInside = null; failMode = 'storage';
  assert.equal(r.statusCode, 500, `got ${r.statusCode} ${JSON.stringify(r.body)}`);
  assert.equal(r.body?.ok, false);
  assert.equal(r.body?.resolved, undefined);
  assert.doesNotMatch(String(r.body?.error || ''), /filter|map|undefined|TypeError|not a function/i, 'no engine error text reaches the client');
});

test('SV3: storage failure while reading the GROUP\'s answers → 503 too', async () => {
  const { coach } = await club();
  failInside = 'resolveGroupAvailabilityForIdentities';
  const r = await call('GET', BOARD, null, ck(coach.session));
  failInside = null;
  assert.equal(r.statusCode, 503, `got ${r.statusCode} ${JSON.stringify(r.body)}`);
  assert.equal(r.body?.resolved, undefined);
});

test('SV4: a healthy read still returns the answers', async () => {
  const { coach, player } = await club();
  const w = await call('POST', {}, { sessionId: 'slot_tue-20261013', response: 'available', intentAt: '2026-10-13T08:00:00.000Z', intentSeq: 0 }, ck(player.session));
  assert.equal(w.statusCode, 200);
  const r = await call('GET', BOARD, null, ck(coach.session));
  assert.equal(r.statusCode, 200);
  assert.equal(r.body?.resolved?.[String(player.user.id).toLowerCase()]?.['slot_tue-20261013']?.response, 'available');
});

test('SV5: a healthy read with no answers is still the authoritative empty board', async () => {
  const { coach } = await club();
  const r = await call('GET', BOARD, null, ck(coach.session));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { resolved: {} });
});

test('SV6: authorisation on the board read is unchanged — 401 without a session, 403 for a player', async () => {
  const { player } = await club();
  const anon = await call('GET', BOARD);
  assert.equal(anon.statusCode, 401);
  const asPlayer = await call('GET', BOARD, null, ck(player.session));
  assert.equal(asPlayer.statusCode, 403, 'the coach board needs the reports permission');
  assert.equal(asPlayer.body?.resolved, undefined);
});

// ─── CLIENT: the real refreshLiveAvailability ───────────────────────────────

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  assert.ok(m, `function ${name} not found`);
  const start = m.index + 1;
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

const SID = 'slot_tue-20261013';
const KEY = 'avail_' + SID;

/** One coach device. Each queued reply is consumed by one board read:
 *  { status, body } | { status, badJson: true } | { throws: true }. */
function board() {
  return new Function(`"use strict";
    const SEQ = [];
    const calls = { fetches: 0, drops: 0 };
    function fetch() {
      calls.fetches++;
      const r = SEQ.shift() || { status: 200, body: { resolved: {} } };
      if (r.throws) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status,
        json: async () => { if (r.badJson) throw new SyntaxError('Unexpected token < in JSON'); return r.body; } });
    }
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = null;
    let _availLastSync = null, _availReadFailed = false, _availRosterLinkedAt = 0;
    let _liveAvailabilityInFlight = null;
    const state = { operationalGroupId: 'g1', players: [
      { id: 'u1', name: 'P1', userId: 'u1' },
      { id: 'u2', name: 'P2', userId: 'u2' },
    ] };
    const chip = { textContent: '', className: '' };
    const document = { getElementById: () => chip };
    function operationalGroups() { return [{ id: 'g1' }]; }
    function operationalPlayers() { return state.players; }
    async function ensureCoachRosterIdentityLinked() {}
    function saveState() {}
    function renderMessageCenter() {}
    function renderAudiencePicker() {} function renderPushStatusCard() {}
    function loadLiveSchedules() {} function loadLiveTemplates() {} function loadLiveLog() {}
    function setTimeout() { return 1; }
    function normalizeSessionId(id) { return String(id); }
    function availabilityPendingFor() { return null; }
    ${fn('sessionKey')}
    ${fn('availabilitySessionIdForKey')}
    ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')}
    ${fn('availabilitySetReadFailed')}
    ${fn('availabilityLastReadFailed')}
    ${fn('availabilityReadUnknown')}
    ${fn('playerAvailabilityReadUnknown')}
    ${fn('availabilityDropStaleLocalAnswers').replace('function availabilityDropStaleLocalAnswers', 'function _realDrop')}
    function availabilityDropStaleLocalAnswers(p, mine) { calls.drops++; return _realDrop(p, mine); }
    ${fn('refreshLiveAvailability')}
    return {
      queue: r => SEQ.push(r), calls, chip, state,
      run: o => refreshLiveAvailability(o),
      failed: () => availabilityLastReadFailed(),
      resolved: () => _resolvedAvailability,
      lastSync: () => _availLastSync,
      answer: id => state.players.find(p => p.id === id)[${JSON.stringify(KEY)}],
    };
  `)();
}
const GOOD = { resolved: { u1: { [SID]: { response: 'available', reason: '', respondedAt: '2026-10-13T08:00:00Z' } },
                           u2: { [SID]: { response: 'unavailable', reason: 'work', respondedAt: '2026-10-13T09:00:00Z' } } } };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function afterGoodRead() {
  const b = board();
  b.queue({ status: 200, body: GOOD });
  await b.run({ boardOnly: true }); await wait(20);
  assert.equal(b.failed(), false);
  assert.equal(b.answer('u1'), 'available', 'precondition: the board shows the answers');
  b.calls.drops = 0;
  return b;
}
function assertBoardKept(b, label) {
  assert.equal(b.failed(), true, `${label}: recorded as a failed read`);
  assert.deepEqual(b.resolved(), GOOD.resolved, `${label}: the board in force is kept`);
  assert.equal(b.answer('u1'), 'available', `${label}: no answer was deleted`);
  assert.equal(b.answer('u2'), 'unavailable', `${label}: no answer was deleted`);
  assert.equal(b.calls.drops, 0, `${label}: stale-answer deletion never ran`);
  assert.match(b.chip.textContent, /Sync failed/, `${label}: the chip says so`);
}

for (const status of [401, 403, 400, 500, 503]) {
  test(`CL1: an HTTP ${status} board read keeps the board and deletes nothing`, async () => {
    const b = await afterGoodRead();
    b.queue({ status, body: { ok: false, error: 'x' } });
    await b.run({ boardOnly: true }); await wait(20);
    assertBoardKept(b, `HTTP ${status}`);
  });
}

test('CL2: malformed JSON on a 200 keeps the board and deletes nothing', async () => {
  const b = await afterGoodRead();
  b.queue({ status: 200, badJson: true });
  await b.run({ boardOnly: true }); await wait(20);
  assertBoardKept(b, 'malformed JSON');
});

test('CL3: a network failure keeps the board and deletes nothing', async () => {
  const b = await afterGoodRead();
  b.queue({ throws: true });
  await b.run({ boardOnly: true }); await wait(20);
  assertBoardKept(b, 'network');
});

for (const [label, body] of [['no `resolved` field', {}], ['`resolved: null`', { resolved: null }], ['`resolved` not an object', { resolved: 'x' }], ['an array', { resolved: [] }], ['a null body', null]]) {
  test(`CL4: a 200 with ${label} is a FAILED read — never an empty board`, async () => {
    const b = await afterGoodRead();
    b.queue({ status: 200, body });
    await b.run({ boardOnly: true }); await wait(20);
    assertBoardKept(b, label);
  });
}

test('CL5: a genuine 200 with answers updates the board normally', async () => {
  const b = board();
  b.queue({ status: 200, body: GOOD });
  await b.run({ boardOnly: true }); await wait(20);
  assert.equal(b.failed(), false);
  assert.ok(b.lastSync(), 'stamped as synced');
  assert.equal(b.answer('u1'), 'available');
  assert.equal(b.answer('u2'), 'unavailable');
  assert.match(b.chip.textContent, /^Synced /);
});

test('CL6: a genuine 200 with an EMPTY `resolved` keeps its authoritative meaning — stale local answers are dropped', async () => {
  const b = await afterGoodRead();
  b.queue({ status: 200, body: { resolved: {} } });
  await b.run({ boardOnly: true }); await wait(20);
  assert.equal(b.failed(), false, 'a real read, not a failure');
  assert.deepEqual(b.resolved(), {}, 'the empty map is applied');
  assert.ok(b.calls.drops >= 2, 'the deletion runs for each in-scope player, as before');
  assert.equal(b.answer('u1'), undefined, 'a week the coach cleared reads as No reply');
  assert.equal(b.answer('u2'), undefined);
});

test('SOURCE: the board read has no blanket catch on the roster, and the client checks the shape of `resolved`', () => {
  const api = fs.readFileSync(new URL('../api/availability.js', import.meta.url), 'utf8');
  assert.doesNotMatch(api, /listIdentityState\([^)]*\)\.catch\(/, 'a roster failure can no longer become an empty roster');
  assert.doesNotMatch(fn('refreshLiveAvailability'), /reply\.resolved \|\| \{\}/, 'a missing `resolved` is no longer read as {}');
});
