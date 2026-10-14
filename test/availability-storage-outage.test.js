/**
 * AVAILABILITY DURING A STORAGE OUTAGE.
 *
 * Production evidence (2026-10-12, Upstash answering HTTP 401 from 00:45Z to
 * 16:17Z): the availability API resolved the caller's session with
 * `.catch(() => null)`, so a storage failure became "no session".
 *
 *   - a save answered 401 "your session has expired" — the player's answer
 *     was put back and they were sent to log in;
 *   - a held answer RETRIED in that state was dropped from the pending store
 *     while the card kept showing it: the coach never received it and nothing
 *     would ever send it again;
 *   - the player's self-read answered 200 with no answers, and the client
 *     reconciled against that — erasing answers it had already confirmed.
 *
 * The contract pinned here:
 *   SERVER  storage unavailable while resolving the session → 503 on the save
 *           AND on the self-read; a genuinely missing session is unchanged
 *           (401 on a save; an EXPLICITLY anonymous {} on a read).
 *   CLIENT  a 503 keeps the answer and holds it as "not sent"; a retry that is
 *           refused (401/403/other 4xx) stays held as "not sent" instead of
 *           vanishing behind a card that looks saved; a refused TAP is still
 *           put back (the deliberate expired-session behaviour); only a real,
 *           identified successful read reconciles held answers.
 *
 * Every proof drives the REAL api/availability handler + identity store
 * (against an in-memory Upstash stand-in) or the REAL functions extracted
 * from index.html. Nothing touches a real service.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.storage-outage.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

// ── Upstash stand-in. `storageDown` answers every command the way Upstash did
// during the outage: HTTP 401 (WRONGPASS), no result.
const kv = new Map();
let storageDown = false;
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  if (storageDown) return { ok: false, status: 401, json: async () => ({ error: 'WRONGPASS invalid or missing auth token' }) };
  const [c, ...a] = JSON.parse(o.body || '[]');
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
async function makeClub(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Coach`, email: `c${++_t}@outage.test`, password: 'password123' });
}
async function reg(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email: `p${_t}@outage.test`, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return store.claimInvite({ position: '2 — Hooker', token, email: `p${_t}@outage.test`, name, password: 'password123' });
}
async function twoClubs() {
  kv.clear(); _t = 0; storageDown = false;
  const A = await makeClub('Alpha');
  const B = await makeClub('Bravo');
  const pa = await reg(A.team.id, 'Alpha Player');
  const pb = await reg(B.team.id, 'Bravo Player');
  return { A, B, pa, pb };
}
const keysUnder = prefix => [...kv.keys()].filter(k => k.startsWith(prefix));
const SAVE = { sessionId: 'tue', response: 'available', intentAt: '2026-10-12T09:00:00.000Z', intentSeq: 0 };

// ─── SERVER ─────────────────────────────────────────────────────────────────

test('S1: storage unavailable while resolving the SAVE session → 503, never 401', async () => {
  const { pa } = await twoClubs();
  storageDown = true;
  const r = await call('POST', {}, SAVE, ck(pa.session));
  storageDown = false;
  assert.equal(r.statusCode, 503, 'a server that cannot read the session is unavailable, not a signed-out caller');
  assert.equal(r.body?.ok, false);
  assert.equal(r.body?.error, 'Storage temporarily unavailable', 'the fixed, internals-free storage message');
  assert.notEqual(r.body?.code, 'session_required', 'never the expired-session answer');
});

test('S2: storage unavailable during the player SELF-READ → 503, not an empty successful read', async () => {
  const { pa } = await twoClubs();
  storageDown = true;
  const r = await call('GET', { myResponse: '1' }, null, ck(pa.session));
  storageDown = false;
  assert.equal(r.statusCode, 503);
  assert.equal(r.body?.responses, undefined, 'no {} the client could mistake for "you have no answers"');
});

test('S3: a genuinely missing or expired session still gets the 401 on a save, and writes nothing', async () => {
  await twoClubs();
  const before = [...kv.keys()].sort();
  const none = await call('POST', {}, SAVE);
  assert.equal(none.statusCode, 401);
  assert.equal(none.body?.code, 'session_required');
  const expired = await call('POST', {}, SAVE, `${SESSION_COOKIE}=${encodeURIComponent('sess_expired_beyond_recovery')}`);
  assert.equal(expired.statusCode, 401);
  assert.equal(expired.body?.code, 'session_required');
  assert.deepEqual([...kv.keys()].sort(), before, 'zero storage mutations');
});

test('S4: a self-read with no identity is EXPLICITLY anonymous — 200, empty, flagged', async () => {
  await twoClubs();
  const r = await call('GET', { myResponse: '1' }, null, `${SESSION_COOKIE}=${encodeURIComponent('sess_unknown')}`);
  assert.equal(r.statusCode, 200, 'the read contract for a signed-out caller is unchanged');
  assert.deepEqual(r.body, { responses: {}, anonymous: true });
});

test('S5: a valid save is stored in the player\'s OWN club and read back, identified; the other club sees nothing', async () => {
  const { A, B, pa, pb } = await twoClubs();
  const w = await call('POST', {}, { ...SAVE, teamId: B.team.id }, ck(pa.session));   // a body teamId cannot redirect
  assert.equal(w.statusCode, 200);
  assert.equal(w.body?.ok, true);
  assert.ok(keysUnder(`app:availability:${A.team.id}:`).length >= 1, 'written under the caller\'s club');
  assert.equal(keysUnder(`app:availability:${B.team.id}:`).length, 0, 'nothing in the other club');
  const mine = await call('GET', { myResponse: '1' }, null, ck(pa.session));
  assert.equal(mine.statusCode, 200);
  assert.equal(mine.body?.anonymous, undefined, 'an identified read carries no anonymous flag');
  assert.equal(mine.body?.responses?.tue?.response, 'available', 'the answer reads back');
  const theirs = await call('GET', { myResponse: '1' }, null, ck(pb.session));
  assert.deepEqual(theirs.body?.responses, {}, 'the other club\'s player does not see it');
});

test('S6: after the outage the SAME retried save lands once — the retry is safe', async () => {
  const { A, pa } = await twoClubs();
  storageDown = true;
  const during = await call('POST', {}, SAVE, ck(pa.session));
  storageDown = false;
  assert.equal(during.statusCode, 503);
  assert.equal(keysUnder(`app:availability:${A.team.id}:`).length, 0, 'nothing was half-written');
  const retry1 = await call('POST', {}, SAVE, ck(pa.session));
  const retry2 = await call('POST', {}, SAVE, ck(pa.session));
  assert.equal(retry1.statusCode, 200);
  assert.equal(retry2.statusCode, 200, 'the same intent re-sent is accepted again');
  const mine = await call('GET', { myResponse: '1' }, null, ck(pa.session));
  assert.equal(mine.body?.responses?.tue?.response, 'available');
  assert.equal(Object.keys(mine.body?.responses || {}).length, 1, 'one answer, not two');
});

// ─── CLIENT: save + retry (real functions from index.html) ─────────────────

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}
const decl = re => { const m = html.match(re); if (!m) throw new Error('declaration not found: ' + re); return m[0]; };

const ME = 'user_me';
const SESSION = 'slot_tue-20261013';
const KEY = 'avail_' + SESSION;
const SESSION_OBJ = { id: SESSION, title: 'Training', date: '2026-10-13' };

/** One device. `script` is consumed one entry per POST; the last repeats. */
function device({ script = ['ok'], currentUserId = ME } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const ME = CFG.me;
    const PLAYER = { id: ME, userId: ME, name: 'Me', lifecycleStatus: 'active', history: [] };
    let state = { players: [PLAYER], users: [], currentUserId: CFG.currentUserId,
                  messages: [], masterFeed: [], availabilityPending: {} };
    let _resolvedAvailability = {};
    let _availReasonOpenByKey = {};
    let _availAuthPromptedAt = 0;
    let toasts = [], posts = [], step = 0, authPrompts = 0;
    function showToast(t){ toasts.push(t); }
    function saveState(){}
    function render(){}
    function getPlayer(){ return PLAYER; }
    function operationalPlayers(){ return state.players; }
    function playerIsArchived(){ return false; }
    function findLiveAvailabilityRecords(players, p){ return (players||[]).filter(x => x !== p && x.id === p.id); }
    function sessionKey(id){ return 'avail_' + id; }
    function sessionReasonKey(id){ return 'avail_' + id + 'Reason'; }
    function keyToSessionId(k){ return String(k).replace(/^avail_/, ''); }
    function normalizeSessionId(id){ return String(id); }
    function liveAvailabilityPlayerKeys(p){ return [String(p.userId || p.id)]; }
    function sessionTitle(){ return 'Tuesday training'; }
    function statusLabel(s){ return s; }
    function availDayLabel(){ return '13 Oct'; }
    function addMasterFeed(){}
    function upsertAvailabilityResponseMessage(){}
    function checkServerSession(){ authPrompts++; return Promise.resolve(); }
    function setAuthTab(){}
    const REASON_LABELS = { injury:'Injury', work:'Work', holiday:'Holiday', family:'Family', other:'Other' };
    ${decl(/const AVAIL_PENDING_MAX = \d+;[^\n]*/)}
    ${decl(/const AVAIL_RESPONSES = \[[^\]]*\];/)}
    async function fetch(url, opts){
      posts.push(JSON.parse(opts.body));
      const mode = CFG.script[Math.min(step, CFG.script.length - 1)]; step++;
      if (mode === 'offline')   throw new TypeError('Load failed');
      if (mode === 'outage')    return { ok:false, status:503, json: async()=>({ ok:false, error:'Storage temporarily unavailable' }) };
      if (mode === 'expired')   return { ok:false, status:401, json: async()=>({ ok:false, code:'session_required' }) };
      if (mode === 'forbidden') return { ok:false, status:403, json: async()=>({ ok:false }) };
      if (mode === 'refused')   return { ok:false, status:400, json: async()=>({ ok:false }) };
      return { ok:true, status:200, json: async()=>({ ok:true }) };
    }
    ${fn('normalizeAvailabilityPending')}
    ${fn('availabilityMarkPending')}
    ${fn('availabilityClearPending')}
    ${fn('availabilityPendingFor')}
    ${fn('availabilityApplyToRecord')}
    ${fn('captureAvailabilityFields')}
    ${fn('resolvedAnswerFor')}
    ${fn('sessionRows')}
    ${fn('availabilityCardModel')}
    ${fn('saveAvailabilityResponseToServer')}
    ${fn('availabilityFlushPending')}
    ${decl(/let _availFlushInFlight = false;/)}
    ${fn('setPlayerAvailability')}
    return {
      get state(){ return state; }, PLAYER,
      tap: setPlayerAvailability, flush: availabilityFlushPending,
      card: s => availabilityCardModel(PLAYER, s),
      held: () => state.availabilityPending[CFG.session] || null,
      toasts: () => toasts, posts: () => posts, authPrompts: () => authPrompts,
      localField: () => PLAYER[sessionKey(CFG.session)],
      signInAs: id => { state.currentUserId = id; },
    };
  `;
  return new Function(body)({ script, me: ME, session: SESSION, currentUserId });
}

test('C1: a 503 on the tap keeps the answer, holds it as "not sent", and says so — nothing is reverted or discarded', async () => {
  const d = device({ script: ['outage'] });
  await d.tap(KEY, 'available', '');
  assert.equal(d.localField(), 'available', 'the answer the player chose is still on the card');
  assert.equal(d.held()?.status, 'failed', 'held for a retry');
  assert.equal(d.card(SESSION_OBJ).pending, true, 'the card says "not sent", not "saved"');
  assert.ok(d.toasts().some(t => /Not sent yet/.test(t)), 'told plainly: ' + JSON.stringify(d.toasts()));
  assert.equal(d.authPrompts(), 0, 'an outage is not a sign-out');
});

for (const [mode, status] of [['expired', 401], ['forbidden', 403], ['refused', 400]]) {
  test(`C2: a RETRY refused with ${status} stays held as "not sent" — never an answer that looks saved with nothing left to send it`, async () => {
    const d = device({ script: ['offline', mode] });
    await d.tap(KEY, 'available', '');                       // held after the network failure
    assert.equal(d.held()?.status, 'failed');
    const sent = await d.flush();                            // the retry is refused
    assert.equal(sent, 0, 'nothing was sent');
    assert.equal(d.posts().length, 2, 'one tap + one retry');
    assert.equal(d.localField(), 'available', 'the card still shows the choice…');
    assert.ok(d.held(), '…and it is STILL held');
    assert.equal(d.held().status, 'failed', '…as "not sent"');
    assert.equal(d.card(SESSION_OBJ).pending, true, 'so the card cannot claim "saved"');
  });
}

test('C3: once signed in again, the held answer is sent by its owner and cleared', async () => {
  const d = device({ script: ['offline', 'expired', 'ok'] });
  await d.tap(KEY, 'available', '');
  await d.flush();                                            // 401: stays held
  assert.ok(d.held());
  const sent = await d.flush();                               // session back: lands
  assert.equal(sent, 1);
  assert.equal(d.held(), null, 'nothing pending once confirmed');
  assert.equal(d.card(SESSION_OBJ).pending, false);
  assert.equal(d.posts()[2].intentAt, d.posts()[0].intentAt, 'the SAME intent was re-sent — the retry cannot reorder answers');
});

test('C4: a held answer is never sent under ANOTHER account (owner isolation unchanged)', async () => {
  const d = device({ script: ['offline', 'ok'] });
  await d.tap(KEY, 'available', '');
  d.signInAs('user_someone_else');
  const sent = await d.flush();
  assert.equal(sent, 0);
  assert.equal(d.posts().length, 1, 'no request carried this answer under the other session');
  assert.ok(d.held(), 'still held for its owner');
});

test('C5: a genuinely expired session on a TAP keeps the deliberate behaviour — put back, not held, log-in prompt', async () => {
  const d = device({ script: ['expired'] });
  await d.tap(KEY, 'available', '');
  assert.equal(d.localField(), undefined, 'the refused answer was put back');
  assert.equal(d.held(), null, 'a refused tap is not pending');
  assert.equal(d.authPrompts(), 1, 'the session is re-checked (sign-in prompt)');
  assert.ok(d.toasts().some(t => /session has expired/.test(t)));
});

test('C6: a TAP refused for any other reason (4xx) is put back too — "Couldn\'t save" no longer leaves the card looking saved', async () => {
  const d = device({ script: ['refused'] });
  await d.tap(KEY, 'available', '');
  assert.equal(d.localField(), undefined, 'put back, like the expired-session refusal');
  assert.equal(d.held(), null, 'not held: a malformed request will never succeed');
  assert.ok(d.toasts().includes("Couldn't save — please try again."), JSON.stringify(d.toasts()));
});

test('C7: a successful save is confirmed normally', async () => {
  const d = device({ script: ['ok'] });
  await d.tap(KEY, 'available', '');
  assert.equal(d.localField(), 'available');
  assert.equal(d.held(), null);
  assert.equal(d.card(SESSION_OBJ).pending, false);
  assert.ok(d.toasts().includes('Availability saved'));
});

// ─── CLIENT: self-read + reconcile ─────────────────────────────────────────

function reader({ reply, local = {}, pending = {} }) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const PLAYER = { id: 'user_me', userId: 'user_me', name: 'Me', ...CFG.local };
    let state = { players: [PLAYER], currentUserId: 'user_me', availabilityPending: CFG.pending };
    let _playerAvailFetched = false, _playerAvailKnown = false;
    let _availConfirmedAt = {};
    let readFailed = null;
    function availabilitySetReadFailed(v){ readFailed = v; }
    function getPlayer(){ return PLAYER; }
    function findLiveAvailabilityRecords(){ return []; }
    function saveState(){} function renderPlayerAvailabilityV2(){} function renderPlayerHome(){}
    function sessionKey(id){ return 'avail_' + id; }
    function normalizeSessionId(id){ return String(id); }
    ${decl(/const AVAIL_PENDING_MAX = \d+;[^\n]*/)}
    ${decl(/const AVAIL_RESPONSES = \[[^\]]*\];/)}
    async function fetch(){
      if (CFG.reply === 'network') throw new TypeError('Load failed');
      return { ok: CFG.reply.status === 200, status: CFG.reply.status, json: async () => CFG.reply.body };
    }
    ${fn('normalizeAvailabilityPending')}
    ${fn('availabilityPendingFor')}
    ${fn('mergeServerAvailabilityIntoRecord')}
    ${fn('availabilitySessionIdForKey')}
    ${fn('reconcileServerAvailabilityIntoRecord')}
    ${fn('fetchMyAvailabilityFromServer')}
    return { read: fetchMyAvailabilityFromServer, PLAYER, known: () => _playerAvailKnown, readFailed: () => readFailed };
  `;
  return new Function(body)({ reply, local, pending });
}
const ANSWERED = { avail_slot_tue: 'available', avail_slot_thu: 'unavailable', avail_slot_thuReason: 'work' };

test('R1: the outage-era empty read (now explicitly anonymous) erases nothing and counts as a failed read', async () => {
  const r = reader({ reply: { status: 200, body: { responses: {}, anonymous: true } }, local: ANSWERED });
  await r.read();
  assert.equal(r.PLAYER.avail_slot_tue, 'available', 'confirmed answers survive');
  assert.equal(r.PLAYER.avail_slot_thu, 'unavailable');
  assert.equal(r.PLAYER.avail_slot_thuReason, 'work');
  assert.equal(r.known(), false, 'not treated as knowing the server state');
  assert.equal(r.readFailed(), true, 'shown as a read that did not happen');
});

for (const reply of [{ status: 503, body: { ok: false, error: 'Storage temporarily unavailable' } }, 'network']) {
  test(`R2: a ${reply === 'network' ? 'network failure' : '503'} on the self-read erases nothing`, async () => {
    const r = reader({ reply, local: ANSWERED });
    await r.read();
    assert.equal(r.PLAYER.avail_slot_tue, 'available');
    assert.equal(r.PLAYER.avail_slot_thu, 'unavailable');
    assert.equal(r.readFailed(), true);
  });
}

test('R3: a REAL identified empty read still reconciles — a week the coach cleared reads as No reply (behaviour kept)', async () => {
  const r = reader({ reply: { status: 200, body: { responses: {} } }, local: ANSWERED });
  await r.read();
  assert.equal(r.known(), true);
  assert.equal(r.readFailed(), false);
  assert.equal(r.PLAYER.avail_slot_tue, undefined, 'the server holds no answer: the stale local one is dropped');
  assert.equal(r.PLAYER.avail_slot_thu, undefined);
});

test('R4: a real read with answers is adopted normally, and a held answer is never overruled', async () => {
  const pending = { slot_thu: { response: 'unavailable', reason: 'work', at: '2026-10-13T08:00:00.000Z', seq: 0, owner: 'user_me', status: 'failed' } };
  const r = reader({
    reply: { status: 200, body: { responses: { slot_tue: { response: 'maybe', reason: '' } } } },
    local: { avail_slot_thu: 'unavailable', avail_slot_thuReason: 'work' },
    pending,
  });
  await r.read();
  assert.equal(r.PLAYER.avail_slot_tue, 'maybe', 'the server answer is adopted');
  assert.equal(r.PLAYER.avail_slot_thu, 'unavailable', 'the held (unsent) answer is untouched');
});

test('SOURCE: both availability session reads go through the storage-aware resolver; no blanket catch remains', () => {
  const api = readFileSync(new URL('../api/availability.js', import.meta.url), 'utf8');
  assert.doesNotMatch(api, /resolveSessionFromRequest\(req\)\.catch\(\(\) => null\)/, 'no storage failure can become "no session"');
  assert.equal((api.match(/sessionContext = await availabilitySession\(req\); \}\s*\n\s*catch \(error\) \{ return sendAuthError\(res, error\); \}/g) || []).length, 2,
    'the save and the self-read both answer a storage failure with its 503');
  assert.match(api, /if \(error\?\.code === 'STORAGE_UNAVAILABLE'\) throw error;\s*\n\s*return null;/, 'only storage unavailability is rethrown');
});
