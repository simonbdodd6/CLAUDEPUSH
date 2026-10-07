/**
 * AVAILABILITY STATE INTEGRITY (Build 101).
 *
 * PRODUCTION DEFECT (read-only audit, 2026-09-26): a player's answer was
 * marked pending on the device BEFORE every send and that mark was persisted
 * — but the 2xx that confirmed the answer removed the mark in memory only.
 * Device storage kept saying "unsent", so
 *
 *   - the card said "Not sent yet — your coach cannot see this answer" while a
 *     request was simply in flight (0.85–1.2 s in production), and again on
 *     every reopen;
 *   - reopening the app re-sent the confirmed answer at boot ("Your
 *     availability has now been sent ✓" for nothing) — the 24 h / 34 h / 6-day
 *     late writes in production;
 *   - after a coach's clear_week, that re-send put the cleared answer BACK.
 *
 * THE MODEL. An entry in state.availabilityPending exists only while an answer
 * is not confirmed, and carries the state of its request:
 *
 *   SENDING     status 'sending' — the request is in flight ("· sending…")
 *   CONFIRMED   the server answered 2xx for THIS intent: the entry is removed
 *               and the removal is persisted at once. Reopening finds nothing.
 *   FAILED      status 'failed' — offline / 5xx / a page that died mid-send;
 *               the answer waits, with its ORIGINAL intent stamp, for the
 *               bounded flush (reconnect, return to the app, boot, "Send now")
 *   SUPERSEDED  the server kept a NEWER intent of this person's: the held one
 *               is acknowledged, not applied, and the server's answer is
 *               adopted locally. Nothing older is resurrected.
 *
 * Every entry is stamped with the ACCOUNT and CLUB that chose it and is shown
 * to — and sent by — no other account or club. The identity reset keeps such
 * entries (the same person signing back in still owes the answer) and drops
 * only the unattributable.
 *
 * The server guarantees of Builds 95 (ordering under a lock), 96 (authoritative
 * clear_week) and 97 (read sequencing) are exercised here through the REAL
 * handlers, not mocked success paths.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  assert.ok(m, `function ${name} not found`);
  const start = m.index + 1;
  let i = html.indexOf('{', html.indexOf(')', start)), depth = 0;
  for (let b = i; b < html.length; b++) {
    if (html[b] === '{') depth++;
    else if (html[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return html.slice(start, i + 1);
}
const decl = re => { const m = html.match(re); assert.ok(m, `declaration ${re} not found`); return m[0]; };

// ── REAL HANDLERS over an in-memory KV (Upstash REST shape; SET honours NX) ──
process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.state-integrity.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
delete process.env.VERCEL; delete process.env.NODE_ENV; delete process.env.DEV_LOGIN;

const kv = new Map(), lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [cmd, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (cmd === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (cmd === 'SET') { if (a.includes('NX') && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; } }
  if (cmd === 'DEL') { result = kv.delete(a[0]) ? 1 : 0; }
  if (cmd === 'SCAN' || cmd === 'KEYS') {
    const glob = cmd === 'SCAN' ? String(a[a.indexOf('MATCH') + 1] ?? '*') : String(a[0] ?? '*');
    const re = new RegExp('^' + glob.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    const matching = [...kv.keys()].filter(k => re.test(k));
    result = cmd === 'SCAN' ? ['0', matching] : matching;
  }
  if (cmd === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = (lists.get(a[0]) || []).slice(Number(a[1]), Number(a[2]) + 1);
  if (cmd === 'LTRIM' || cmd === 'EXPIRE') result = 1;
  if (cmd === 'INCR') { const v = Number(kv.get(a[0]) || 0) + 1; kv.set(a[0], v); result = v; }
  return { ok: true, json: async () => ({ result }) };
};

const S  = await import('../api/_identityStore.js');
const ST = await import('../api/_structureStore.js');
const AV = await import('../api/_availabilityStore.js');
const { default: availability } = await import('../api/availability.js');
const { actionsFor, NON_ACTIONABLE_SESSION_IDS } = await import('../api/push.js');
const { availabilityActions } = await import('../api/cron.js');
const { SESSION_COOKIE } = S;
const PW = 'password123';
let kseq = 0; const kkey = () => String(kseq++).padStart(2, '0').repeat(10);

function res() { return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() {}, end() { return this; } }; }
async function call(method, query, body, cookie) {
  const r = res();
  await availability({ method, query: query || {}, headers: cookie ? { cookie, host: 'test.local' } : { host: 'test.local' }, body: body || {}, on() {} }, r);
  return { status: r.statusCode, body: r.body };
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

/** A club with a U18 group, a founder coach and two U18 players, through the real store. */
async function u18Club(label) {
  const club = await S.createClub({ clubName: `${label} RFC`, teamName: 'First XV', sport: 'Rugby', name: `${label} Coach`, email: `coach.${label.toLowerCase()}@si.test`, password: PW, idempotencyKey: kkey() });
  const { group: U18 } = await ST.createGroup(club.team.id, { name: 'U18', developmentCategory: 'youth_u18' });
  const teamCode = (await S.loadStoredTeams()).find(t => t.id === club.team.id).teamCode;
  const players = [];
  for (const [first, last] of [['Ugo', 'Uno'], ['Dua', 'Dos']]) {
    const p = await S.createJoinRequest({ teamCode, firstName: first, lastName: last, email: `${first.toLowerCase()}.${label.toLowerCase()}@si.test`, password: PW });
    await S.approveJoinRequest(p.teamMember.id, club.user.id, club.team.id);
    players.push(p);
  }
  const members = await S.loadTeamMembers();
  for (const m of members) if (m.teamId === club.team.id && players.some(p => p.user.id === m.userId)) m.playerGroupId = U18.id;
  await S.withIdentityLock(() => S.saveTeamMembers(members));
  const sessions = [];
  for (const p of players) sessions.push(await S.createSession({ userId: p.user.id, teamId: club.team.id, role: 'player' }));
  const coach = await S.createSession({ userId: club.user.id, teamId: club.team.id, role: 'coach' });
  return { club, U18, players, sessions, coach };
}
const SESSION = 'slot_u18tue-20260929';
const KEY = 'avail_' + SESSION;
const SESSION_OBJ = { id: SESSION, title: 'Tuesday Training', date: 'Tue 29 Sep', type: 'training' };
const record = async (c, session = SESSION) => AV.loadGroupAvailability(c.club.team.id, c.U18.id, session);
const stored = async (c, userId, session = SESSION) => Object.values(await record(c, session)).find(v => v && v.userId === userId) || null;

// ═══════════════════════════════════════════════════════════════════════════
// THE DEVICE — the real client functions over a scripted (or REAL) transport
// ═══════════════════════════════════════════════════════════════════════════
/**
 * `script` is consumed one entry per POST, the last entry repeating:
 *   'ok' | 'hold' (resolves when released) | 'offline' | 'server-error' |
 *   'expired' | 'refused' | 'superseded' (the server kept a newer answer).
 * With `real`, every request goes to the REAL availability handler instead.
 * saveState snapshots the pending store — what device storage would hold.
 */
function device({ script = ['ok'], pending = {}, currentUserId = 'user_me', club = 'team_A', real = null,
                  serverResponses = {}, supersededBy = { response: 'maybe', reason: '' }, playerId = 'user_me' } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const ME = CFG.playerId, SESSION = CFG.session;
    const PLAYER = { id: ME, userId: ME, name: 'Me', lifecycleStatus: 'active', history: [] };
    const OTHER  = { id: 'user_other', userId: 'user_other', name: 'Other', lifecycleStatus: 'active', history: [] };
    let state = { players: [PLAYER, OTHER], users: [], currentUserId: CFG.currentUserId, stateTeamId: CFG.club,
                  messages: [], masterFeed: [], availabilityPending: CFG.pending, activePlayerSection: 'availability' };
    let _resolvedAvailability = {};
    let _availReasonOpenByKey = {};
    let _availAuthPromptedAt = 0;
    let _availConfirmedAt = {};
    let _playerAvailFetched = false, _playerAvailKnown = false, _availReadFailed = false;
    let toasts = [], saves = [], renders = 0, posts = [], step = 0, releases = [];
    let persisted = JSON.parse(JSON.stringify(CFG.pending || {}));
    function showToast(t){ toasts.push(t); }
    function saveState(l){ saves.push(l || ''); persisted = JSON.parse(JSON.stringify(state.availabilityPending || {})); }
    function render(){ renders++; }
    function renderPlayerAvailabilityV2(){ renders++; }
    function renderPlayerHome(){}
    function availabilitySetReadFailed(v){ _availReadFailed = Boolean(v); }
    function getPlayer(){ return PLAYER; }
    function operationalPlayers(){ return state.players; }
    function playerIsArchived(){ return false; }
    function findLiveAvailabilityRecords(players, p){ return (players||[]).filter(x => x !== p && x.id === p.id); }
    function sessionKey(id){ return 'avail_' + id; }
    function sessionReasonKey(id){ return 'avail_' + id + 'Reason'; }
    function keyToSessionId(k){ return String(k).replace(/^avail_/, ''); }
    function normalizeSessionId(id){ return String(id); }
    function availabilitySessionIdForKey(k){ return /^avail_/.test(k) && !/Reason$|RespondedAt$/.test(k) ? String(k).replace(/^avail_/, '') : null; }
    function liveAvailabilityPlayerKeys(p){ return [String(p.userId || p.id)]; }
    function sessionTitle(){ return 'Tuesday Training'; }
    function statusLabel(s){ const t = (s||'no-reply').replaceAll('-', ' '); return t.charAt(0).toUpperCase() + t.slice(1); }
    function availDayLabel(){ return '29 Sep'; }
    function addMasterFeed(){}
    function upsertAvailabilityResponseMessage(){}
    function checkServerSession(){ return Promise.resolve(); }
    function setAuthTab(){}
    function esc(s){ return String(s ?? ''); }
    function sessionTypeIcon(){ return '🏉'; }
    function availabilitySessionLabel(s){ return s.title || 'Session'; }
    function playerAvailabilityReadUnknown(){ return false; }
    ${decl(/const REASON_LABELS = \{[^\n]*\};/)}
    ${decl(/const AVAIL_PENDING_MAX = \d+;[^\n]*/)}
    ${decl(/const AVAIL_RESPONSES = \[[^\]]*\];/)}
    async function fetch(url, opts = {}){
      if (!opts.method || opts.method === 'GET') {                                   // the player's self-read
        if (CFG.real) { const r = await CFG.real('GET', url, null); return { ok: r.status < 400, status: r.status, json: async () => r.body }; }
        return { ok: true, status: 200, json: async () => ({ responses: CFG.serverResponses || {} }) };
      }
      const b = JSON.parse(opts.body); const n = posts.length; posts.push(b);
      if (CFG.real) { const r = await CFG.real('POST', url, b); return { ok: r.status < 400, status: r.status, json: async () => r.body }; }
      const mode = CFG.script[Math.min(step, CFG.script.length - 1)] || 'ok'; step++;
      if (mode === 'hold' || mode === 'hold-superseded') await new Promise(r => { releases[n] = r; });
      if (mode === 'offline') throw new TypeError('Load failed');
      if (mode === 'server-error') return { ok:false, status:503, json: async()=>({ ok:false, code:'busy' }) };
      if (mode === 'expired')     return { ok:false, status:401, json: async()=>({}) };
      if (mode === 'refused')     return { ok:false, status:400, json: async()=>({}) };
      if (mode === 'superseded' || mode === 'hold-superseded') return { ok:true, status:200, json: async()=>({ ok:true, applied:false, superseded:true, response: CFG.supersededBy.response, reason: CFG.supersededBy.reason || '', sessionId: b.sessionId }) };
      return { ok:true, status:200, json: async()=>({ ok:true, applied:true, superseded:false, response: b.response, reason: b.reason || '', sessionId: b.sessionId }) };
    }
    ${fn('normalizeAvailabilityPending')}
    ${fn('availabilityMarkPending')}
    ${fn('availabilityClearPending')}
    ${fn('availabilityPendingFor')}
    ${fn('availabilityApplyToRecord')}
    ${fn('captureAvailabilityFields')}
    ${fn('availabilityNoteConfirmed')}
    ${fn('availabilityAdoptServerAnswer')}
    ${fn('resolvedAnswerFor')}
    ${fn('sessionRows')}
    ${fn('availabilityCardModel')}
    ${fn('availabilityCardV2')}
    ${fn('mergeServerAvailabilityIntoRecord')}
    ${fn('reconcileServerAvailabilityIntoRecord')}
    ${fn('fetchMyAvailabilityFromServer')}
    ${fn('playerAvailRetryNow')}
    ${decl(/let _availSendChain = \{\};/)}
    ${fn('saveAvailabilityResponseToServer')}
    ${decl(/let _availFlushInFlight = false;/)}
    ${fn('availabilityRetryNow')}
    ${fn('availabilityFlushPending')}
    ${fn('setPlayerAvailability')}
    return {
      get state(){ return state; }, PLAYER, OTHER,
      tap: setPlayerAvailability, save: saveAvailabilityResponseToServer, flush: availabilityFlushPending, retryNow: availabilityRetryNow,
      selfRead: () => { _playerAvailFetched = false; return fetchMyAvailabilityFromServer(); },
      rows: sessionRows, card: s => availabilityCardModel(PLAYER, s), cardHtml: s => availabilityCardV2(availabilityCardModel(PLAYER, s), s),
      pendingStore: () => state.availabilityPending, persisted: () => persisted,
      pendingFor: availabilityPendingFor, normalize: normalizeAvailabilityPending, mark: availabilityMarkPending,
      toasts: () => toasts, posts: () => posts, saves: () => saves, renders: () => renders, release: n => releases[n] && releases[n](),
      localField: () => PLAYER[sessionKey(SESSION)], localReason: () => PLAYER[sessionKey(SESSION) + 'Reason'],
      setResolved: r => { _resolvedAvailability = r; },
      setUser: id => { state.currentUserId = id; }, setClub: id => { state.stateTeamId = id; },
      confirmedAt: () => _availConfirmedAt, known: () => _playerAvailKnown,
    };
  `;
  return new Function(body)({ script, pending, currentUserId, club, real, serverResponses, supersededBy, playerId, session: SESSION });
}
const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));
/** A transport that carries the device's requests to the REAL handler under one player's cookie. */
const realTransport = cookie => async (method, url, body) => {
  const q = Object.fromEntries(new URL(url, 'http://x').searchParams);
  return call(method, q, body, cookie);
};

// ═══════════════════════════════════════════════════════════════════════════
// 1–4. SENDING → CONFIRMED, persisted, never re-sent
// ═══════════════════════════════════════════════════════════════════════════
test('1. SENDING: while the request is in flight the card says sending, not "not sent"', async () => {
  const d = device({ script: ['hold'] });
  const p = d.tap(KEY, 'available', '');
  await tick();
  const entry = d.pendingStore()[SESSION];
  assert.ok(entry, 'held while in flight');
  assert.equal(entry.status, 'sending', 'the request is in flight');
  assert.equal(entry.owner, 'user_me'); assert.equal(entry.club, 'team_A', 'stamped with the account AND the club');
  const model = d.card(SESSION_OBJ);
  assert.equal(model.sending, true, 'the model says sending');
  assert.equal(model.pending, false, 'and NOT unsent');
  const cardHtml = d.cardHtml(SESSION_OBJ);
  assert.match(cardHtml, /· sending…/, 'the chip says sending');
  assert.doesNotMatch(cardHtml, /Not sent yet/, 'nothing on the card claims it was not sent');
  assert.doesNotMatch(cardHtml, /Saved ✓/, 'and nothing claims it was saved');
  // the board (dual role) still knows the device is carrying it
  assert.equal(d.rows(SESSION).find(r => r.player.id === 'user_me').pending, true);
  d.release(0); await p;
  assert.equal(d.card(SESSION_OBJ).sending, false); assert.equal(d.card(SESSION_OBJ).pending, false);
});

test('2. CONFIRMED: a 2xx for the intent that was sent removes the pending entry and says saved', async () => {
  const d = device({ script: ['ok'] });
  await d.tap(KEY, 'unavailable', 'work');
  assert.equal(d.posts().length, 1);
  assert.deepEqual(d.pendingStore(), {}, 'nothing pending');
  assert.ok(d.toasts().some(t => /^Saved — Work$/.test(t)), 'the normal success feedback: ' + JSON.stringify(d.toasts()));
  assert.equal(d.localField(), 'unavailable'); assert.equal(d.localReason(), 'work');
  assert.ok(d.confirmedAt()[SESSION] > 0, 'the confirmation moment is noted for the self-read');
  const html2 = d.cardHtml(SESSION_OBJ);
  assert.doesNotMatch(html2, /sending…|not sent/i, 'the card is clean');
});

test('3. the confirmed state is PERSISTED at the moment of the 2xx — device storage no longer holds the entry', async () => {
  const d = device({ script: ['ok'] });
  await d.tap(KEY, 'available', '');
  assert.deepEqual(d.persisted(), {}, 'what device storage holds after the success: no pending entry');
  assert.ok(d.saves().includes('Availability confirmed'), 'written through by the confirmation itself: ' + JSON.stringify(d.saves()));
  // and the write-through belongs to the transition, not to a caller that may or may not save afterwards
  assert.match(fn('saveAvailabilityResponseToServer'), /availabilityClearPending\(id\);\s*\n\s*persist\('Availability confirmed'\);/, 'clearing the entry persists the store');
});

test('4. REOPEN does not re-send a confirmed answer: the restored store is empty, the boot flush sends nothing, the card shows the answer', async () => {
  const first = device({ script: ['ok'] });
  await first.tap(KEY, 'maybe', '');
  const snapshot = JSON.parse(JSON.stringify(first.persisted()));   // localStorage after the confirmed answer
  const reopened = device({ script: ['ok'], pending: reopenedStore(first, snapshot) });
  reopened.PLAYER[KEY] = 'maybe';                                     // the persisted optimistic field
  assert.equal(await reopened.flush(), 0, 'the boot flush found nothing to send');
  assert.equal(reopened.posts().length, 0, 'no request left the device');
  assert.equal(reopened.toasts().some(t => /now been sent/.test(t)), false, 'no "has now been sent" for nothing');
  const card = reopened.card(SESSION_OBJ);
  assert.equal(card.status, 'maybe'); assert.equal(card.pending, false); assert.equal(card.sending, false);
  assert.doesNotMatch(reopened.cardHtml(SESSION_OBJ), /Not sent yet|sending…/);
});
function reopenedStore(d, snapshot) { return d.normalize(snapshot); }

// ═══════════════════════════════════════════════════════════════════════════
// 5–6. FAILED stays retryable, with the ORIGINAL intent
// ═══════════════════════════════════════════════════════════════════════════
test('5. FAILED: a genuine failure keeps the answer as an unsent entry, says so honestly, and offers Send now', async () => {
  for (const mode of ['offline', 'server-error']) {
    const d = device({ script: [mode, 'ok'] });
    await d.tap(KEY, 'available', '');
    const entry = d.pendingStore()[SESSION];
    assert.ok(entry, mode + ': held'); assert.equal(entry.status, 'failed', mode + ': marked failed, not sending');
    assert.deepEqual(d.persisted()[SESSION], entry, mode + ': the failed state is persisted');
    assert.equal(d.toasts().some(t => /Availability saved/.test(t)), false, mode + ': never called saved');
    assert.ok(d.toasts().some(t => /Not sent yet/.test(t)), mode + ': told plainly');
    const model = d.card(SESSION_OBJ);
    assert.equal(model.pending, true); assert.equal(model.sending, false);
    const cardHtml = d.cardHtml(SESSION_OBJ);
    assert.match(cardHtml, /Not sent yet — your coach cannot see this answer/, mode + ': the note');
    assert.match(cardHtml, /· not sent/, mode + ': the chip');
    assert.match(cardHtml, /onclick="availabilityRetryNow\(\)"[^>]*>Send now</, mode + ': a way to retry now');
    // Send now: the same bounded flush, the same intent
    const sent = await d.retryNow();
    assert.equal(sent, 1, mode + ': sent on retry');
    assert.deepEqual(d.pendingStore(), {}, mode + ': confirmed by the retry');
    assert.deepEqual(d.persisted(), {}, mode + ': and persisted as confirmed');
  }
});

test('6. a failed answer retries with the ORIGINAL intent stamp — never a fresh intent for an old choice', async () => {
  const d = device({ script: ['offline', 'ok'] });
  await d.tap(KEY, 'available', '');
  const held = { ...d.pendingStore()[SESSION] };
  assert.equal(await d.flush(), 1);
  assert.equal(d.posts().length, 2);
  assert.equal(d.posts()[1].intentAt, d.posts()[0].intentAt, 'same instant');
  assert.equal(d.posts()[1].intentSeq, d.posts()[0].intentSeq, 'same seq');
  assert.equal(d.posts()[1].intentAt, held.at);
  assert.ok(d.toasts().some(t => /now been sent/.test(t)));
});

test('6b. a page that dies mid-send: the restored entry is FAILED (never "sending"), and the boot flush re-sends the same intent once', async () => {
  const d = device({ script: ['hold'] });
  const p = d.tap(KEY, 'unavailable', 'injury');
  await tick();
  const midFlight = JSON.parse(JSON.stringify(d.persisted()));       // what localStorage holds while the request is in flight
  assert.equal(midFlight[SESSION].status, 'sending', 'persisted before the send, as before');
  const reopened = device({ script: ['ok'], pending: reopenedStore(d, midFlight) });
  assert.equal(reopened.pendingStore()[SESSION].status, 'failed', 'a restored entry is never in flight');
  assert.equal(reopened.card(SESSION_OBJ).pending, true, 'shown as not sent until the retry lands');
  assert.equal(await reopened.flush(), 1);
  assert.equal(reopened.posts()[0].intentAt, midFlight[SESSION].at, 'the original intent, so the server can order it');
  assert.deepEqual(reopened.pendingStore(), {});
  d.release(0); await p;
});

test('6c. a stale success for an intent no longer held changes nothing', async () => {
  const d = device({ script: ['expired'] });
  await d.tap(KEY, 'available', '');
  assert.deepEqual(d.pendingStore(), {}, 'a refused write is not held');
  assert.deepEqual(d.persisted(), {}, 'and its removal is persisted (no boot re-send of a write that will fail again)');
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. CLEAR_WEEK cannot be undone by reopening — REAL handlers
// ═══════════════════════════════════════════════════════════════════════════
test('7. REAL: confirmed answer → coach clear_week → player reopens: no answer, and NOTHING is re-sent', async () => {
  const c = await u18Club('Clear');
  const me = c.players[0].user.id;
  const d = device({ real: realTransport(ck(c.sessions[0])), playerId: me, currentUserId: me, club: c.club.team.id });
  await d.tap(KEY, 'available', '');
  assert.equal((await stored(c, me))?.response, 'available', 'the server holds it');
  assert.deepEqual(d.pendingStore(), {}); assert.deepEqual(d.persisted(), {});
  // the coach clears the week
  const cleared = await call('POST', {}, { action: 'clear_week', group: c.U18.id, sessions: [SESSION] }, ck(c.coach));
  assert.equal(cleared.status, 200); assert.deepEqual(await record(c), {}, 'cleared');
  // the player closes and reopens the app: the persisted store, the boot flush, the fresh self-read
  const reopened = device({ real: realTransport(ck(c.sessions[0])), playerId: me, currentUserId: me, club: c.club.team.id, pending: d.normalize(d.persisted()) });
  reopened.PLAYER[KEY] = 'available'; reopened.PLAYER[KEY + 'RespondedAt'] = '2026-09-25T10:00:00.000Z';
  assert.equal(await reopened.flush(), 0, 'nothing to flush');
  assert.equal(reopened.posts().length, 0, 'no POST left the device on reopen');
  await reopened.selfRead();
  assert.equal(reopened.localField(), undefined, 'the self-read (Build 96) removed the cleared answer');
  assert.equal(reopened.card(SESSION_OBJ).status, 'no-reply', 'No answer');
  assert.deepEqual(await record(c), {}, 'the server record stays cleared — the old answer was NOT resurrected');
});

test('7b. REAL: FAILED answer → coach clear_week → player reopens: still distinguishable as unsent; Build 96 keeps it and the retry lands it', async () => {
  const c = await u18Club('Keep');
  const me = c.players[0].user.id;
  let dropNext = true;
  const transport = realTransport(ck(c.sessions[0]));
  const flaky = async (method, url, body) => { if (method === 'POST' && dropNext) { dropNext = false; throw new TypeError('Load failed'); } return transport(method, url, body); };
  const d = device({ real: flaky, playerId: me, currentUserId: me, club: c.club.team.id });
  await d.tap(KEY, 'available', '');
  assert.equal(d.pendingStore()[SESSION]?.status, 'failed', 'genuinely failed');
  assert.equal(await stored(c, me), null, 'the server never got it');
  assert.equal((await call('POST', {}, { action: 'clear_week', group: c.U18.id, sessions: [SESSION] }, ck(c.coach))).status, 200);
  const reopened = device({ real: transport, playerId: me, currentUserId: me, club: c.club.team.id, pending: d.normalize(d.persisted()) });
  reopened.PLAYER[KEY] = 'available';
  assert.equal(reopened.card(SESSION_OBJ).pending, true, 'the unsent intent is still shown as unsent — not silently confirmed');
  await reopened.selfRead();
  assert.equal(reopened.localField(), 'available', 'the intent this device still carries is not the server\'s to deny (Build 96 E)');
  assert.equal(await reopened.flush(), 1, 'the bounded flush sends it');
  assert.equal((await stored(c, me))?.response, 'available', 'and the coach can now see it');
  assert.deepEqual(reopened.pendingStore(), {});
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. RAPID TAPS — the newer intent is authoritative
// ═══════════════════════════════════════════════════════════════════════════
test('8. Available then immediately Maybe: the first success does not clear the newer Maybe; Maybe is sent and wins', async () => {
  const d = device({ script: ['hold', 'hold'] });
  const first = d.tap(KEY, 'available', '');
  await tick();
  const second = d.tap(KEY, 'maybe', '');
  await tick();
  const newer = d.pendingStore()[SESSION];
  assert.equal(newer.response, 'maybe', 'the store holds the newer intent');
  assert.equal(d.card(SESSION_OBJ).status, 'maybe', 'the card shows the newer choice');
  d.release(0); await tick(); await tick();
  assert.equal(d.pendingStore()[SESSION], newer, 'the older success left the newer intent in place');
  assert.equal(d.localField(), 'maybe', 'and did not touch the local answer');
  assert.equal(d.posts().length, 2, 'the newer intent has now been sent');
  assert.ok(d.posts()[1].intentAt >= d.posts()[0].intentAt);
  d.release(1); await Promise.all([first, second]);
  assert.deepEqual(d.pendingStore(), {}, 'confirmed by ITS OWN success');
  assert.deepEqual(d.persisted(), {});
  assert.equal(d.localField(), 'maybe', 'Maybe wins');
});

test('8b. REAL: Available (success) then Unavailable: a real second intent, sent normally; the server ends on Unavailable', async () => {
  const c = await u18Club('Twice');
  const me = c.players[0].user.id;
  const d = device({ real: realTransport(ck(c.sessions[0])), playerId: me, currentUserId: me, club: c.club.team.id });
  await d.tap(KEY, 'available', '');
  assert.equal((await stored(c, me))?.response, 'available');
  await tick(2);
  await d.tap(KEY, 'unavailable', 'work');
  assert.equal(d.posts().length, 2, 'two intents, two requests');
  assert.ok(d.posts()[1].intentAt > d.posts()[0].intentAt || (d.posts()[1].intentAt === d.posts()[0].intentAt && d.posts()[1].intentSeq > d.posts()[0].intentSeq), 'the second is the later intent');
  const fin = await stored(c, me);
  assert.equal(fin.response, 'unavailable'); assert.equal(fin.reason, 'work');
  assert.deepEqual(d.pendingStore(), {});
  assert.equal(d.toasts().filter(t => /^(Availability saved|Saved — )/.test(t)).length, 2, 'both confirmed: ' + JSON.stringify(d.toasts()));
});

// ═══════════════════════════════════════════════════════════════════════════
// 9–10. SIGN-OUT / SIGN-IN and ACCOUNT isolation
// ═══════════════════════════════════════════════════════════════════════════
/** Run the REAL resetIdentityScopedState over a sink that stands in for every page global it touches. */
function runIdentityReset(globals) {
  const backing = { ...globals };
  const sink = new Proxy(backing, {
    has: (t, k) => typeof k === 'string' && k !== 'resetIdentityScopedState' && !(k in globalThis),
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const run = new Function('sink', `with (sink) { ${fn('resetIdentityScopedState')} return resetIdentityScopedState; }`)(sink);
  run();
  return backing;
}

test('9. sign-out keeps the same account\'s unsent answer; sign-in re-reads that account\'s answers afresh', async () => {
  // account A fails to send, then signs out
  const a = device({ script: ['offline', 'ok'] });
  await a.tap(KEY, 'maybe', '');
  const store = JSON.parse(JSON.stringify(a.pendingStore()));
  const after = runIdentityReset({ state: { availabilityPending: store, currentUserId: '' }, _playerAvailFetched: true, _playerAvailKnown: true, _availConfirmedAt: { [SESSION]: 123 },
                                   _availReasonOpenByKey: { [KEY]: true }, _sharedMedical: {}, _medActivePlayerId: 'x', _medActiveTab: 'cases', _medAddInjuryOpen: true });
  assert.deepEqual(Object.keys(after.state.availabilityPending), [SESSION], 'the reset KEPT the owner-stamped unsent answer');
  assert.equal(after.state.availabilityPending[SESSION].owner, 'user_me');
  assert.equal(after._playerAvailFetched, false, 'the once-per-session self-read latch is released');
  assert.equal(after._playerAvailKnown, false, 'and "answers known" no longer speaks for the next identity');
  assert.deepEqual(after._availConfirmedAt, {}, 'nor does the confirmation memo');
  assert.deepEqual(after._availReasonOpenByKey, {}, 'and no reason picker opened by this person stays open ("Saved ✓") on the next person\'s card');
  assert.match(fn('resetClubScopedState'), /_availReasonOpenByKey = \{\};/, 'the club reset closes it too (session keys are per club)');
  // A signs back in on the same device: the answer is still theirs, still unsent, and goes on the next flush
  const heldAt = after.state.availabilityPending[SESSION].at;
  const back = device({ script: ['ok'], pending: after.state.availabilityPending });
  back.PLAYER[KEY] = 'maybe';
  assert.equal(back.card(SESSION_OBJ).pending, true, 'shown as not sent — not silently gone, not silently confirmed');
  assert.equal(await back.flush(), 1, 'sent under the same account');
  assert.equal(back.posts()[0].intentAt, heldAt, 'with its original intent');
  assert.equal(back.posts()[0].response, 'maybe');
  // an unattributable entry, on the other hand, is dropped by the reset
  const dirty = runIdentityReset({ state: { availabilityPending: { [SESSION]: { response: 'available', owner: '' }, other: null }, currentUserId: '' } });
  assert.deepEqual(dirty.state.availabilityPending, {}, 'nothing without an owner survives');
});

test('10. ACCOUNT ISOLATION: account B on the same device never sees, and never sends, account A\'s answer — and a confirmed answer of A\'s is not shown to B as unsent', async () => {
  const a = device({ script: ['offline'] });
  await a.tap(KEY, 'maybe', '');
  const store = JSON.parse(JSON.stringify(a.pendingStore()));
  const b = device({ script: ['ok'], currentUserId: 'user_b', playerId: 'user_b', pending: store });
  assert.equal(b.pendingFor(SESSION, b.PLAYER), null, 'not B\'s');
  assert.equal(b.card(SESSION_OBJ).pending, false); assert.equal(b.card(SESSION_OBJ).sending, false);
  assert.equal(b.card(SESSION_OBJ).status, 'no-reply', 'B sees no answer');
  assert.equal(await b.flush(), 0, 'and nothing is sent under B\'s name');
  assert.equal(b.posts().length, 0);
  assert.equal(b.rows(SESSION).find(r => r.player.id === 'user_other').pending, false, 'no other row inherits it either');
  // switching the device to A again makes it A's once more
  b.setUser('user_me');
  assert.ok(b.pendingFor(SESSION, { id: 'user_me', userId: 'user_me' }));
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. CLUB ISOLATION
// ═══════════════════════════════════════════════════════════════════════════
test('11. CLUB ISOLATION: an answer held under club A is neither shown nor sent under club B; back in club A it is', async () => {
  const d = device({ script: ['offline', 'ok'], club: 'team_A' });
  await d.tap(KEY, 'available', '');
  assert.equal(d.pendingStore()[SESSION].club, 'team_A');
  d.setClub('team_B');
  assert.equal(d.pendingFor(SESSION, d.PLAYER), null, 'invisible under club B');
  assert.equal(d.card(SESSION_OBJ).pending, false, 'club B\'s card does not carry club A\'s answer');
  assert.equal(await d.flush(), 0, 'not sent under club B\'s session');
  assert.equal(d.posts().length, 1, 'no new request');
  d.setClub('team_A');
  assert.ok(d.pendingFor(SESSION, d.PLAYER), 'club A\'s answer again');
  assert.equal(await d.flush(), 1, 'sent under club A');
  // an entry written before this build (no club stamp) keeps the owner-only rule it was written under
  const legacy = device({ script: ['ok'], club: 'team_B', pending: { [SESSION]: { response: 'maybe', reason: '', at: '2026-09-25T10:00:00.000Z', owner: 'user_me', seq: 0 } } });
  assert.ok(legacy.pendingFor(SESSION, legacy.PLAYER), 'a pre-Build-101 entry is still the owner\'s');
  assert.equal(legacy.normalize(legacy.pendingStore())[SESSION].club, '', 'and normalises with an empty club, never an invented one');
  // the club reset releases the per-club self-read latch and confirmation memo
  const reset = fn('resetClubScopedState');
  assert.match(reset, /_playerAvailFetched = false;/); assert.match(reset, /_playerAvailKnown = false;/); assert.match(reset, /_availConfirmedAt = \{\};/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. NOTIFICATION ACTIONS — buttons only where the tap can land on a real occurrence
// ═══════════════════════════════════════════════════════════════════════════
test('12. notification answer buttons are attached only for a DATED occurrence the board reads; bare legacy ids get none', () => {
  for (const bare of ['game', 'week', 'tue', 'thu', '', undefined]) {
    assert.equal(actionsFor('availability', bare), undefined, `push: no buttons for ${JSON.stringify(bare)}`);
    assert.equal(availabilityActions('availability', bare), undefined, `cron: no buttons for ${JSON.stringify(bare)}`);
  }
  assert.deepEqual(actionsFor('availability', SESSION).map(a => a.action), ['available', 'unavailable', 'maybe'], 'push: a dated occurrence keeps the buttons');
  assert.deepEqual(availabilityActions('availability', SESSION).map(a => a.action), ['available', 'unavailable', 'maybe'], 'cron: so does a scheduled one');
  assert.equal(actionsFor('message', SESSION), undefined, 'other notification types are unchanged');
  assert.deepEqual([...NON_ACTIONABLE_SESSION_IDS].sort(), ['game', 'thu', 'tue', 'week']);
  const push = fs.readFileSync(path.join(ROOT, 'api/push.js'), 'utf8');
  const cron = fs.readFileSync(path.join(ROOT, 'api/cron.js'), 'utf8');
  assert.match(push, /actions: actionsFor\(type, sessionId\),/, 'the send passes the session it names');
  assert.match(cron, /actions: availabilityActions\('availability', 'game'\),/, 'the weekly reminder (bare "game") carries no buttons');
  assert.match(cron, /actions: availabilityActions\(notificationType, schedule\.sessionId \|\| 'game'\),/, 'schedules pass theirs');
  assert.doesNotMatch(cron, /actions: \[\s*\{ action: 'available'/, 'no literal button list remains');
  // the service worker is untouched: it still posts whatever session the payload named
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.match(sw, /recordAvailability\(action, data\.sessionId \|\| 'game'\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 13–15. The server guarantees this build stands on
// ═══════════════════════════════════════════════════════════════════════════
test('13. REAL (Build 95 ordering): an older intent is SUPERSEDED — the device adopts the server\'s newer answer, clears the entry, and resurrects nothing', async () => {
  const c = await u18Club('Order');
  const me = c.players[0].user.id;
  // the player's phone already answered Maybe (the newer intent)
  const phone = device({ real: realTransport(ck(c.sessions[0])), playerId: me, currentUserId: me, club: c.club.team.id });
  await phone.tap(KEY, 'maybe', '');
  assert.equal((await stored(c, me))?.response, 'maybe');
  // the laptop holds an OLDER unsent Available (failed earlier) and now flushes it
  const olderAt = new Date(Date.now() - 60_000).toISOString();
  const laptop = device({ real: realTransport(ck(c.sessions[0])), playerId: me, currentUserId: me, club: c.club.team.id,
                          pending: { [SESSION]: { response: 'available', reason: '', at: olderAt, owner: me, club: c.club.team.id, seq: 0, status: 'failed' } } });
  laptop.PLAYER[KEY] = 'available';
  const sent = await laptop.flush();
  assert.equal(sent, 0, 'nothing "has now been sent" — the server kept the newer answer');
  assert.equal(laptop.toasts().some(t => /now been sent/.test(t)), false);
  assert.equal((await stored(c, me))?.response, 'maybe', 'the server still holds Maybe (Build 95)');
  assert.equal(laptop.localField(), 'maybe', 'the laptop adopted the newer answer instead of showing the superseded one');
  assert.deepEqual(laptop.pendingStore(), {}, 'the older intent is gone'); assert.deepEqual(laptop.persisted(), {});
  // the same through a tap whose request is overtaken (scripted superseded reply)
  const d = device({ script: ['superseded'], supersededBy: { response: 'unavailable', reason: 'work' } });
  await d.tap(KEY, 'available', '');
  assert.equal(d.localField(), 'unavailable'); assert.equal(d.localReason(), 'work');
  assert.ok(d.toasts().some(t => /Your later answer stands — Unavailable/.test(t)), JSON.stringify(d.toasts()));
  assert.equal(d.toasts().some(t => /Availability saved/.test(t)), false);
  assert.deepEqual(d.pendingStore(), {});
});

test('13b. a superseded reply for an intent already replaced by a newer local tap does NOT overwrite the newer choice', async () => {
  const d = device({ script: ['hold-superseded', 'ok'], supersededBy: { response: 'unavailable', reason: '' } });
  const first = d.tap(KEY, 'available', '');
  await tick();
  const second = d.tap(KEY, 'maybe', '');
  await tick();
  // the first request is answered "superseded" (the server holds Unavailable from elsewhere) — but the
  // store already holds the newer Maybe, whose own request decides
  d.release(0); await tick(); await tick();
  assert.equal(d.localField(), 'maybe', 'the newer local tap stands — the superseded reply is not adopted over it');
  await Promise.all([first, second]);
  assert.equal(d.localField(), 'maybe');
  assert.equal(d.posts().length, 2); assert.equal(d.posts()[1].response, 'maybe');
  assert.deepEqual(d.pendingStore(), {});
});

test('14. REAL (Build 96): clear_week under the lock is authoritative and the self-read reconciles — asserted above in 7/7b; the flush passes the held entry unchanged', () => {
  assert.match(fn('availabilityFlushPending'), /saveAvailabilityResponseToServer\(sessionId, entry\.response, entry\.reason \|\| '', null, entry\)/);
  assert.match(fn('reconcileServerAvailabilityIntoRecord'), /if \(pendingFor\(sid\)\) continue;/, 'a pending answer is not the server\'s to deny');
  assert.match(fn('reconcileServerAvailabilityIntoRecord'), /confirmedAt\[sid\]\) \|\| 0\) > readStartedAt\) continue;/, 'a just-confirmed answer is not overruled by an older read');
});

test('15. (Build 97) the coach board\'s stale-response guard still stands', () => {
  const body = fn('refreshLiveAvailability');
  assert.match(body, /_availabilityReadSeq/); assert.match(body, /_availabilityAppliedSeq/); assert.match(body, /_ctxLeft/);
});

test('SOURCE. the wiring: statuses, club stamp, persistence on every transition, sending/failed on the card', () => {
  assert.match(fn('availabilityMarkPending'), /club: String\(state\.stateTeamId \|\| ''\), seq, status: 'sending'/);
  assert.match(fn('normalizeAvailabilityPending'), /status:\s+'failed',/, 'a restored entry is never in flight');
  assert.match(fn('availabilityPendingFor'), /if \(entry\.club && club && String\(entry\.club\) !== club\) return null;/);
  assert.match(fn('availabilityFlushPending'), /&& !\(e\.club && club && String\(e\.club\) !== club\)\)/, 'the flush applies the same club rule');
  assert.match(fn('saveAvailabilityResponseToServer'), /markFailed\(entry\); return \{ ok: false, pending: true \};/, '5xx marks failed');
  assert.match(fn('saveAvailabilityResponseToServer'), /markFailed\(entry\);\s*\n\s*return \{ ok: false, pending: true \};/, 'transport failure marks failed');
  assert.match(fn('availabilityCardModel'), /sending: held \? held\.status === 'sending' : false,/);
  assert.match(fn('availabilityCardModel'), /pending: held \? held\.status !== 'sending' : false,/);
  assert.match(fn('availabilityCardV2'), /\$\{sending \? ' · sending…' : ''\}\$\{pending \? ' · not sent' : ''\}/, 'the chip distinguishes the two');
  assert.match(fn('availabilityCardV2'), /\$\{sending \? 'Sending…' : pending \? 'Not sent yet' : 'Saved ✓'\}/, 'so does the reason picker heading');
  assert.doesNotMatch(fn('availabilityFlushPending'), /setInterval|setTimeout/, 'still no polling, no timers');
  assert.doesNotMatch(fn('availabilityRetryNow'), /setInterval|setTimeout/, 'Send now starts no timer either');
});

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER — the real client in Chromium against the real handlers (Pixel 5 player, desktop coach)
// ═══════════════════════════════════════════════════════════════════════════
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed: the browser test skips */ }
const handlers = {};
for (const name of ['identity', 'invite', 'config', 'publish', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe']) {
  try { handlers[name] = (await import(`../api/${name}.js`)).default; } catch { /* optional */ }
}
const REWRITES = { roster: { handler: 'publish', query: { resource: 'roster' } } };
const NET = { rules: [], posts: 0 };
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    let name = url.pathname.slice(5).split('/')[0];
    const query = Object.fromEntries(url.searchParams);
    if (REWRITES[name]) { Object.assign(query, REWRITES[name].query); name = REWRITES[name].handler; }
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    if (name === 'availability' && req.method === 'POST' && !body.action) NET.posts++;
    for (const rule of NET.rules) {
      if (rule.times <= 0 || (rule.method && rule.method !== req.method) || (rule.path && !url.pathname.includes(rule.path))) continue;
      if (rule.bodyMatch && !raw.includes(rule.bodyMatch)) continue;
      rule.times--;
      if (rule.hold) await rule.hold;
      if (rule.fail) { res.statusCode = rule.fail; res.setHeader('content-type', 'application/json'); return res.end('{"ok":false,"error":"injected","code":"busy"}'); }
    }
    const vreq = { method: req.method, headers: { ...req.headers, 'x-forwarded-proto': 'http' }, query, body, url: req.url, on() {} };
    const vres = { statusCode: 200, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { res.setHeader(k, v); }, getHeader(k) { return res.getHeader(k); },
      writeHead(c, h) { res.writeHead(c, h); return this; }, write(d) { res.write(d); },
      json(d) { res.statusCode = this.statusCode; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); },
      end(d) { res.statusCode = this.statusCode; res.end(d); }, send(d) { this.end(typeof d === 'string' ? d : JSON.stringify(d)); } };
    const h = handlers[name];
    if (!h) { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
    try { await h(vreq, vres); } catch { res.statusCode = 500; res.end('{}'); }
    return;
  }
  const f = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  try { res.setHeader('content-type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
});
const waitFor = async (fnc, ms, every = 60) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return { ok: true, ms: Date.now() - t0, v }; if (Date.now() - t0 > ms) return { ok: false, ms: Date.now() - t0, v }; await new Promise(r => setTimeout(r, every)); } };

test('browser: tap → confirmed → reopen (no re-send); rapid Maybe wins; failure is honest and Send now works; clear_week is not resurrected; another account sees nothing; Live Sync', { timeout: 180000 }, async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const ctxs = [];
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;
    const c = await u18Club('Browser');
    const ugo = c.players[0], dua = c.players[1];
    const TOAST_HOOK = () => {
      try { sessionStorage.setItem('ce-setup-skipped', '1'); } catch {}
      window.__toasts = [];
      const hook = () => { const el = document.getElementById('toast'); if (!el) return setTimeout(hook, 20);
        new MutationObserver(() => { const tx = el.textContent.trim(); if (tx) window.__toasts.push(tx); }).observe(el, { childList: true, characterData: true, subtree: true }); };
      document.addEventListener('DOMContentLoaded', hook);
    };
    const login = async (page, email) => {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ce-welcome', { timeout: 20000 });
      await page.click('#ce-welcome button:has-text("Log in")');
      await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
      await page.fill('#identityLoginEmail', email); await page.fill('#identityLoginPassword', PW); await page.click('#identityLoginBtn');
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId && !!state.currentUserId && !sessionSignedOut(), null, { timeout: 20000 });
    };
    const relogin = async (page, email) => {
      await page.evaluate(() => { document.getElementById('first-run-modal')?.remove(); const w = [...document.querySelectorAll('#ce-welcome button')].find(b => /Log in/.test(b.textContent)); if (w) w.click(); else setAuthTab('login'); });
      await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
      await page.fill('#identityLoginEmail', email); await page.fill('#identityLoginPassword', PW);
      await page.evaluate(() => document.getElementById('identityLoginBtn').click());
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.currentUserId && !sessionSignedOut(), null, { timeout: 20000 });
      await page.evaluate(() => document.getElementById('first-run-modal')?.remove());
    };
    const signOut = async (page) => {
      await page.evaluate(() => { settingsSignOut(); return true; });
      await page.waitForSelector('#ce-modal-ok', { state: 'attached', timeout: 10000 });
      await page.evaluate(() => document.getElementById('ce-modal-ok').click());
      await page.waitForFunction(() => sessionSignedOut(), null, { timeout: 20000 });
    };
    const errors = [];
    const coachCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); ctxs.push(coachCtx);
    await coachCtx.addInitScript(TOAST_HOOK);
    const coach = await coachCtx.newPage(); coach.on('pageerror', e => errors.push('coach: ' + e.message)); coach.on('dialog', d => d.accept().catch(() => {}));
    await login(coach, `coach.browser@si.test`);
    assert.equal(await coach.evaluate(async gid => (await fetch('/api/publish?resource=training-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', group: gid, slot: { day: 'Tue', startTime: '19:00', venue: 'U18 pitch', active: true } }) })).status, c.U18.id), 200);
    await coach.evaluate(async () => (await fetch('/api/roster', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ players: [] }) })).status);
    await coach.evaluate(gid => { setOperationalGroup(gid); setSection('coach', 'message'); }, c.U18.id);
    await coach.waitForFunction(gid => state.activeCoachSection === 'message' && state.operationalGroupId === gid, c.U18.id, { timeout: 20000 });
    await coach.waitForFunction(() => coachAvailEvents().some(e => e.type === 'training'), null, { timeout: 20000 });
    const EV = await coach.evaluate(() => coachAvailEvents().find(e => e.type === 'training')?.id);
    assert.ok(EV, 'a dated U18 training occurrence');

    const playerCtx = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' }); ctxs.push(playerCtx);
    await playerCtx.addInitScript(TOAST_HOOK);
    const player = await playerCtx.newPage(); player.on('pageerror', e => errors.push('player: ' + e.message)); player.on('dialog', d => d.accept().catch(() => {}));
    await login(player, `ugo.browser@si.test`);
    const openAvail = async (pg) => { await pg.evaluate(() => setSection('player', 'availability')); assert.ok((await waitFor(() => pg.evaluate(() => typeof _playerAvailKnown !== 'undefined' && _playerAvailKnown && !!(_trainingSchedule && _trainingSchedule.slots) && !!document.querySelector('#player-availability .avail-player-card')), 20000)).ok, 'availability open'); };
    await openAvail(player);
    const card = (pg) => pg.evaluate(id => {
      const p = getPlayer(); const k = sessionKey(id);
      const el = [...document.querySelectorAll('#player-availability .avail-player-card')].find(x => x.innerHTML.includes(`'${k}'`));
      const txt = el ? el.textContent.replace(/\s+/g, ' ') : '';
      return { local: p[k] || 'no-reply', entry: (state.availabilityPending && state.availabilityPending[id]) || null,
        chip: el?.querySelector('.avail-status-chip')?.textContent.replace(/\s+/g, ' ').trim() || null,
        note: el?.querySelector('.avail-pending-note')?.textContent.replace(/\s+/g, ' ').trim() || null,
        sendNow: !!el?.querySelector('.avail-pending-note button'), txt };
    }, EV);
    const persistedPending = pg => pg.evaluate(() => { try { return Object.keys(JSON.parse(localStorage.getItem('coach-eye-real-workflow-mvp-state-v1') || '{}').availabilityPending || {}); } catch { return ['unreadable']; } });
    const toasts = pg => pg.evaluate(() => (window.__toasts || []).slice());
    const clearToasts = pg => pg.evaluate(() => { window.__toasts = []; });
    const tapV2 = (pg, status) => pg.evaluate(([id, st]) => { availabilityV2SetStatus(sessionKey(id), st); return true; }, [EV, status]);
    const settled = (pg) => waitFor(() => pg.evaluate(id => !(state.availabilityPending && state.availabilityPending[id]), EV), 10000);
    const serverAnswer = async () => (await stored(c, ugo.user.id, EV))?.response || 'none';
    const row = () => coach.evaluate(id => { const r = (sessionRows(id) || []).find(x => x.player?.name === 'Ugo Uno'); return r ? r.status : 'ROW-MISSING'; }, EV);
    const reopen = async () => {
      await player.reload({ waitUntil: 'domcontentloaded' });
      await player.waitForFunction(() => typeof state !== 'undefined' && !!state.currentUserId && !sessionSignedOut(), null, { timeout: 20000 });
      await openAvail(player);
    };

    // A. Available → send → close → reopen: confirmed, no re-send
    let release; let hold = new Promise(r => { release = r; });
    NET.rules.push({ method: 'POST', path: '/api/availability', hold, times: 1 });
    await tapV2(player, 'available');
    const inFlight = await waitFor(async () => (await card(player)).entry?.status === 'sending', 5000);
    assert.ok(inFlight.ok, 'in flight: sending');
    const during = await card(player);
    assert.match(during.chip || '', /sending…/, 'the chip says sending while in flight: ' + during.chip);
    assert.equal(during.note, null, 'no "not sent" note while in flight');
    release(); assert.ok((await settled(player)).ok, 'confirmed');
    assert.equal(await serverAnswer(), 'available');
    const afterA = await card(player);
    assert.equal(afterA.chip, 'Available'); assert.equal(afterA.note, null); assert.equal(afterA.entry, null);
    assert.deepEqual(await persistedPending(player), [], 'device storage holds no pending entry after the confirmation');
    const postsBefore = NET.posts; await clearToasts(player);
    await reopen();
    await new Promise(r => setTimeout(r, 1500));
    assert.equal(NET.posts, postsBefore, 'reopening sent NO availability request');
    assert.equal((await toasts(player)).some(x => /now been sent/.test(x)), false, 'no "has now been sent"');
    const reopened = await card(player);
    assert.equal(reopened.chip, 'Available', 'the confirmed answer is shown'); assert.equal(reopened.note, null);

    // E. Available → immediate Maybe: Maybe wins
    hold = new Promise(r => { release = r; });
    NET.rules.push({ method: 'POST', path: '/api/availability', bodyMatch: '"response":"available"', hold, times: 1 });
    await tapV2(player, 'unavailable'); await settled(player);           // a distinct starting point
    await tapV2(player, 'available'); await new Promise(r => setTimeout(r, 80)); await tapV2(player, 'maybe');
    release(); assert.ok((await settled(player)).ok);
    assert.equal(await serverAnswer(), 'maybe', 'Maybe wins on the server'); assert.equal((await card(player)).chip, 'Maybe');
    assert.ok((await waitFor(async () => (await row()) === 'maybe', 15000)).ok, 'H. the coach board shows the newer state (Live Sync / poll)');

    // C. network failure: honest state + Send now
    await clearToasts(player);
    let dropped = false;
    await player.route('**/api/availability', route => { if (!dropped && route.request().method() === 'POST') { dropped = true; return route.abort('internetdisconnected'); } return route.continue(); });
    await tapV2(player, 'available');
    assert.ok((await waitFor(async () => (await card(player)).entry?.status === 'failed', 8000)).ok, 'marked failed');
    const failed = await card(player);
    assert.match(failed.chip || '', /Available · not sent/, failed.chip); assert.match(failed.note || '', /^⏳ Not sent yet — your coach cannot see this answer/); assert.equal(failed.sendNow, true, 'Send now offered');
    assert.ok((await toasts(player)).some(x => /Not sent yet/.test(x)));
    assert.equal(await serverAnswer(), 'maybe', 'the server still holds the previous answer');
    await player.unroute('**/api/availability');
    await player.evaluate(() => document.querySelector('#player-availability .avail-pending-note button').click());
    assert.ok((await settled(player)).ok, 'Send now delivered it');
    assert.equal(await serverAnswer(), 'available'); assert.equal((await card(player)).note, null);
    assert.ok((await toasts(player)).some(x => /now been sent/.test(x)), 'told it has now been sent: ' + JSON.stringify(await toasts(player)));

    // D. confirmed → coach clear_week → player reopens: No answer, no resurrection
    assert.equal(await coach.evaluate(async ({ gid, ev }) => (await fetch('/api/availability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_week', group: gid, sessions: [ev] }) })).status, { gid: c.U18.id, ev: EV }), 200);
    assert.equal(await serverAnswer(), 'none');
    const postsBeforeD = NET.posts; await clearToasts(player);
    await reopen();
    await new Promise(r => setTimeout(r, 1500));
    assert.equal(NET.posts, postsBeforeD, 'no re-send after the clear');
    assert.equal(await serverAnswer(), 'none', 'the cleared answer was NOT resurrected');
    const afterClear = await card(player);
    assert.equal(afterClear.local, 'no-reply'); assert.equal(afterClear.chip, 'No reply');

    // F. an unsent answer, sign out, another user signs in, the first signs back in
    dropped = false;
    await player.route('**/api/availability', route => { if (!dropped && route.request().method() === 'POST') { dropped = true; return route.abort('internetdisconnected'); } return route.continue(); });
    await tapV2(player, 'maybe');
    assert.ok((await waitFor(async () => (await card(player)).entry?.status === 'failed', 8000)).ok);
    await player.unroute('**/api/availability');
    await signOut(player);
    assert.deepEqual(await persistedPending(player), [EV], 'the unsent answer survives sign-out on the device');
    await relogin(player, 'dua.browser@si.test');
    await openAvail(player);
    const postsBeforeF = NET.posts;
    await player.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await new Promise(r => setTimeout(r, 1200));
    const asDua = await card(player);
    assert.equal(asDua.chip, 'No reply', 'Dua sees no answer of Ugo\'s'); assert.equal(asDua.note, null);
    assert.equal(NET.posts, postsBeforeF, 'and nothing was sent under Dua\'s name');
    assert.equal(await stored(c, dua.user.id, EV), null);
    await signOut(player);
    await relogin(player, 'ugo.browser@si.test');
    await openAvail(player);
    const backUgo = await card(player);
    assert.equal(backUgo.local, 'maybe'); assert.match(backUgo.note || '', /Not sent yet/, 'still Ugo\'s, still honest');
    await player.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    assert.ok((await settled(player)).ok, 'flushed on return');
    assert.equal(await serverAnswer(), 'maybe', 'sent under Ugo\'s own session');
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    for (const ctx of ctxs) { try { await ctx.close(); } catch {} }
    await browser.close(); await new Promise(r => server.close(r));
  }
});
