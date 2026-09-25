/**
 * CLEAR-WEEK IS AUTHORITATIVE — and takes the availability write lock.
 *
 * Two P2 defects from the U18 availability audit (2026-09-25), both
 * reproduced against the real handlers before this change:
 *
 *  1. COACH BOARD KEPT A CLEARED ANSWER. sessionRows fell back to the local
 *     per-session field whenever the resolved group map held nothing for a
 *     player — so after clear_week (server empty, read successful) the board
 *     kept painting the pre-clear answer, poll after poll.
 *
 *  2. PLAYER DEVICE KEPT A CLEARED ANSWER. mergeServerAvailabilityIntoRecord
 *     never overwrote a local answer and the self-read ran once per page
 *     lifetime, so the player's card said Available for a week the coach had
 *     cleared — on the open screen and after a reload.
 *
 * Also: clear_week wrote each session record without the Build 95 write
 * lock, so a clear could land between another writer's read and save.
 *
 * The contract now: a SUCCESSFUL authoritative read that holds nothing for a
 * player/session means No reply — on the board (sessionRows) and in the
 * coach's local roster fields (the patch loop drops them); a successful
 * player self-read reconciles CONFIRMED local answers to the server (adopt a
 * different one, drop an absent one), while an UNSENT pending answer and an
 * answer confirmed after the read left are never touched; a failed read
 * changes nothing; clear_week runs under withAvailabilityWriteLock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
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

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.clear-week.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
delete process.env.VERCEL; delete process.env.NODE_ENV;

// KV stub (Upstash REST shape). SET honours NX (the lock). A GET can deliver
// the value it read LATER, and a SET can be held before it lands, so a clear
// and an answer can be made to overlap either way round.
const kv = new Map(), lists = new Map();
const kvHooks = { delayGetMs: 0, delayGetMatch: 'availability:', delaySetMs: 0, delaySetMatch: null };
globalThis.fetch = async (_url, options = {}) => {
  const [cmd, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (cmd === 'GET') {
    result = kv.has(a[0]) ? kv.get(a[0]) : null;
    if (kvHooks.delayGetMs && String(a[0]).includes(kvHooks.delayGetMatch)) await new Promise(r => setTimeout(r, kvHooks.delayGetMs));
  }
  if (cmd === 'SET') {
    if (kvHooks.delaySetMs && kvHooks.delaySetMatch && String(a[0]).includes(kvHooks.delaySetMatch)) await new Promise(r => setTimeout(r, kvHooks.delaySetMs));
    if (a.includes('NX') && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; }
  }
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
  return { ok: true, json: async () => ({ result }) };
};

const S  = await import('../api/_identityStore.js');
const ST = await import('../api/_structureStore.js');
const AV = await import('../api/_availabilityStore.js');
const { default: availability } = await import('../api/availability.js');
const { SESSION_COOKIE } = S;
const PW = 'password123';
let seq = 0; const kkey = () => String(seq++).padStart(2, '0').repeat(10);

function res() { return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() {}, end() { return this; } }; }
async function call(method, query, body, cookie) {
  const r = res();
  await availability({ method, query: query || {}, headers: cookie ? { cookie, host: 'test.local' } : { host: 'test.local' }, body: body || {}, on() {} }, r);
  return { status: r.statusCode, body: r.body };
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
const post = (cookie, body) => call('POST', {}, body, cookie);

async function u18Club(label) {
  const club = await S.createClub({ clubName: `${label} RFC`, teamName: 'First XV', sport: 'Rugby', name: `${label} Coach`, email: `coach.${label.toLowerCase()}@cw.test`, password: PW, idempotencyKey: kkey() });
  const { group: U18 } = await ST.createGroup(club.team.id, { name: 'U18', developmentCategory: 'youth_u18' });
  const teamCode = (await S.loadStoredTeams()).find(t => t.id === club.team.id).teamCode;
  const players = [];
  for (const [first, last] of [['Ugo', 'Uno'], ['Dua', 'Dos']]) {
    const p = await S.createJoinRequest({ teamCode, firstName: first, lastName: last, email: `${first.toLowerCase()}.${label.toLowerCase()}@cw.test`, password: PW });
    await S.approveJoinRequest(p.teamMember.id, club.user.id, club.team.id);
    players.push(p);
  }
  const members = await S.loadTeamMembers();
  for (const m of members) if (m.teamId === club.team.id && players.some(p => p.user.id === m.userId)) m.playerGroupId = U18.id;
  await S.saveTeamMembers(members);
  const sessions = [];
  for (const p of players) sessions.push(await S.createSession({ userId: p.user.id, teamId: club.team.id, role: 'player' }));   // one at a time (createSession is itself a load→save)
  const coach = await S.createSession({ userId: club.user.id, teamId: club.team.id, role: 'coach' });
  return { club, U18, players, sessions, coach };
}
const SESSION = 'slot_u18tue-20260929';
const stamp = (ms, seqNo = 0) => ({ intentAt: new Date(Date.UTC(2026, 8, 25, 10, 0, 0, ms)).toISOString(), intentSeq: seqNo });
const record = (c, session = SESSION) => AV.loadGroupAvailability(c.club.team.id, c.U18.id, session);
const stored = async (c, userId, session = SESSION) => { const v = Object.values(await record(c, session)).find(x => x && x.userId === userId); return v || null; };
const board = async (c) => { const r = await call('GET', { resolveRoster: '1', group: c.U18.id }, null, ck(c.coach)); assert.equal(r.status, 200); return r.body.resolved; };
const clearWeek = (c, sessions = [SESSION], cookie = null, extra = {}) => post(cookie || ck(c.coach), { action: 'clear_week', group: c.U18.id, sessions, ...extra });

// ═══════════════════════════════════════════════════════════════════════════
// A — a clear removes the answer, and the authoritative reads say so
// ═══════════════════════════════════════════════════════════════════════════
test('A. an answer exists; clear_week; the authoritative coach read and the player self-read both hold nothing', async () => {
  const c = await u18Club('Alpha');
  const me = c.sessions[0], id = c.players[0].user.id;
  await post(ck(me), { sessionId: SESSION, response: 'available', ...stamp(0) });
  assert.equal((await board(c))[id.toLowerCase()][SESSION].response, 'available');
  const r = await clearWeek(c);
  assert.equal(r.status, 200); assert.deepEqual(r.body.cleared, [SESSION]);
  assert.deepEqual(await record(c), {}, 'the session record is empty');
  assert.equal((await board(c))[id.toLowerCase()], undefined, 'the coach read holds nothing for the player');
  const self = await call('GET', { myResponse: '1' }, null, ck(me));
  assert.equal(self.body.responses[SESSION], undefined, 'the player self-read holds nothing either');
  assert.equal(kv.has(AV.availabilityWriteLockKey(c.club.team.id, c.U18.id, SESSION)), false, 'the lock is released');
});

// ═══════════════════════════════════════════════════════════════════════════
// F — clear and answer overlap: serialised, never interleaved
// ═══════════════════════════════════════════════════════════════════════════
test('F1. an answer holds the lock (slow read) while a clear arrives: the clear waits, and the serial order write→clear leaves the record EMPTY', async () => {
  const c = await u18Club('Foxtrot1');
  const me = c.sessions[0], id = c.players[0].user.id;
  kvHooks.delayGetMs = 250;                                        // the answer's read→save window, inside its lock
  const write = post(ck(me), { sessionId: SESSION, response: 'available', ...stamp(0) });
  await new Promise(r => setTimeout(r, 60));                       // the clear arrives mid-window
  const clear = clearWeek(c);
  const [w, cl] = await Promise.all([write, clear]);
  kvHooks.delayGetMs = 0;
  assert.equal(w.status, 200); assert.equal(w.body.applied, true, 'the answer was written first');
  assert.equal(cl.status, 200);
  assert.deepEqual(await record(c), {}, 'then cleared: the serial order is write → clear (without the lock the clear lands inside the window and the answer survives it)');
  assert.equal(await stored(c, id), null);
});

test('F2. a clear holds the lock (slow save) while an answer arrives: the answer waits, and the serial order clear→write leaves the ANSWER', async () => {
  const c = await u18Club('Foxtrot2');
  const me = c.sessions[0], id = c.players[0].user.id;
  await post(ck(me), { sessionId: SESSION, response: 'maybe', ...stamp(0) });   // something to clear
  kvHooks.delaySetMs = 250; kvHooks.delaySetMatch = `:${SESSION}`;              // the clear's save, inside its lock
  const clear = clearWeek(c);
  await new Promise(r => setTimeout(r, 60));
  const write = post(ck(me), { sessionId: SESSION, response: 'available', ...stamp(1000) });
  const [cl, w] = await Promise.all([clear, write]);
  kvHooks.delaySetMs = 0; kvHooks.delaySetMatch = null;
  assert.equal(cl.status, 200); assert.equal(w.status, 200); assert.equal(w.body.applied, true);
  const s = await stored(c, id);
  assert.equal(s?.response, 'available', 'clear → write: the answer written after the clear stands (without the lock the clear\'s late save would wipe it)');
  assert.equal(Object.keys(await record(c)).length, 1, 'exactly one entry — nothing corrupt or half-cleared');
});

test('G. two clears overlap: both succeed, the record is empty, the lock is released', async () => {
  const c = await u18Club('Golf');
  await post(ck(c.sessions[0]), { sessionId: SESSION, response: 'available', ...stamp(0) });
  kvHooks.delaySetMs = 120; kvHooks.delaySetMatch = `:${SESSION}`;
  const [a, b] = await Promise.all([clearWeek(c), clearWeek(c)]);
  kvHooks.delaySetMs = 0; kvHooks.delaySetMatch = null;
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.deepEqual(await record(c), {});
  assert.equal(kv.has(AV.availabilityWriteLockKey(c.club.team.id, c.U18.id, SESSION)), false);
});

test('J. a held lock makes the clear wait and then fail closed — nothing half-cleared', async () => {
  const c = await u18Club('Juliet');
  await post(ck(c.sessions[0]), { sessionId: SESSION, response: 'available', ...stamp(0) });
  const lockKey = AV.availabilityWriteLockKey(c.club.team.id, c.U18.id, SESSION);
  kv.set(lockKey, JSON.stringify('someone-else'));
  const t0 = Date.now();
  const r = await clearWeek(c);
  assert.equal(r.status, 503); assert.equal(r.body.code, 'busy');
  assert.ok(Date.now() - t0 >= 3500, 'waited for the lock');
  assert.equal((await stored(c, c.players[0].user.id))?.response, 'available', 'the answer is untouched');
  kv.delete(lockKey);
});

// ═══════════════════════════════════════════════════════════════════════════
// H + I — legacy records; authority unchanged
// ═══════════════════════════════════════════════════════════════════════════
test('H. a pre-ordering (legacy) record clears exactly as a stamped one, and reads as before until then', async () => {
  const c = await u18Club('Hotel');
  const me = c.sessions[0], id = c.players[0].user.id;
  await AV.saveGroupAvailability(c.club.team.id, c.U18.id, SESSION, {
    [id]: { response: 'maybe', reason: '', respondedAt: '2026-09-20T10:00:00.000Z', label: 'Ugo Uno', userId: id, playerId: id, legacyPlayerId: '' },
  });
  assert.equal((await board(c))[id.toLowerCase()][SESSION].response, 'maybe', 'legacy entry resolves as before');
  assert.equal((await call('GET', { myResponse: '1' }, null, ck(me))).body.responses[SESSION].response, 'maybe');
  assert.equal((await clearWeek(c)).status, 200);
  assert.deepEqual(await record(c), {});
  assert.equal((await board(c))[id.toLowerCase()], undefined);
});

test('I. clear_week authority is unchanged: session club, asserted group, coach permission — forged fields ignored', async () => {
  const c = await u18Club('India');
  const other = await u18Club('Indigo');
  const me = c.sessions[0], id = c.players[0].user.id;
  await post(ck(me), { sessionId: SESSION, response: 'available', ...stamp(0) });
  const before = JSON.stringify(await record(c));
  const asPlayer = await clearWeek(c, [SESSION], ck(me));
  assert.equal(asPlayer.status, 403, 'a player cannot clear');
  const foreign = await post(ck(other.coach), { action: 'clear_week', group: c.U18.id, sessions: [SESSION], teamId: c.club.team.id });
  assert.ok([403, 404].includes(foreign.status), 'another club\'s coach cannot name this group: ' + foreign.status);
  const anon = await post(null, { action: 'clear_week', group: c.U18.id, sessions: [SESSION] });
  assert.equal(anon.status, 401);
  assert.equal(JSON.stringify(await record(c)), before, 'every refusal leaves the record byte-identical');
  // The coach's own clear with a forged teamId/playerId still clears ONLY the session club's U18 record.
  await post(ck(other.sessions[0]), { sessionId: SESSION, response: 'maybe', ...stamp(0) });   // the other club has its own answer
  const own = await post(ck(c.coach), { action: 'clear_week', group: c.U18.id, sessions: [SESSION], teamId: other.club.team.id, playerId: other.players[0].user.id });
  assert.equal(own.status, 200);
  assert.deepEqual(await record(c), {}, 'own club cleared');
  assert.equal((await stored(other, other.players[0].user.id))?.response, 'maybe', 'the other club is untouched');
});

// ═══════════════════════════════════════════════════════════════════════════
// B + C — the COACH board: authoritative absence is No reply; a failed read changes nothing
// ═══════════════════════════════════════════════════════════════════════════
function boardScope({ players, resolved = {}, sync = true, group = 'grp_u18', pending = {}, me = 'coach_me', readFailed = false } = {}) {
  return new Function(`"use strict";
    const state = { operationalGroupId: ${JSON.stringify(group)}, players: ${JSON.stringify(players)}, currentUserId: ${JSON.stringify(me)}, availabilityPending: ${JSON.stringify(pending)} };
    function operationalPlayers() { return state.players; }
    let _resolvedAvailability = ${JSON.stringify(resolved)};
    let _resolvedAvailabilityGroup = ${JSON.stringify(group)};
    let _availLastSync = ${JSON.stringify(sync ? '2026-09-25T10:00:00.000Z' : null)};
    let _availReadFailed = ${JSON.stringify(readFailed)};
    ${fn('sessionKey')}
    ${fn('sessionReasonKey')}
    ${fn('normalizeSessionId')}
    ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')}
    ${fn('availabilityLastReadFailed')}
    ${fn('availabilityReadUnknown')}
    ${fn('resolvedAnswerFor')}
    ${fn('availabilityPendingFor')}
    ${fn('sessionRows')}
    return { rows: id => sessionRows(id), unknown: () => availabilityReadUnknown() };
  `)();
}
const P = (id, extra = {}) => ({ id, name: 'Player ' + id, userId: id, ...extra });
const KEY = 'avail_' + SESSION;

test('B. coach board: a confirmed local answer the successful read no longer holds is No reply — no fallback', () => {
  const w = boardScope({ players: [P('p', { [KEY]: 'maybe', [KEY + 'Reason']: 'work', [KEY + 'RespondedAt']: '2026-09-24T10:00:00.000Z' })], resolved: {} });
  const [row] = w.rows(SESSION);
  assert.equal(row.status, 'no-reply'); assert.equal(row.reason, ''); assert.equal(row.respondedAt, null);
  assert.equal(row.confirmed, false); assert.equal(row.pending, false);
});

test('B2. …but with NO authoritative read in force the local field still stands, and the resolved answer still wins over it', () => {
  const none = boardScope({ players: [P('p', { [KEY]: 'maybe' })], resolved: {}, sync: false });
  assert.equal(none.rows(SESSION)[0].status, 'maybe', 'never read: the local field is the honest best');
  const other = boardScope({ players: [P('p', { [KEY]: 'maybe' })], resolved: {}, group: 'grp_u18' });
  assert.equal(other.rows(SESSION)[0].status, 'no-reply');
  const live = boardScope({ players: [P('p', { [KEY]: 'maybe' })], resolved: { p: { [SESSION]: { response: 'available', reason: '', respondedAt: '2026-09-25T09:00:00.000Z' } } } });
  assert.equal(live.rows(SESSION)[0].status, 'available'); assert.equal(live.rows(SESSION)[0].confirmed, true);
});

test('B3. the coach\'s OWN unsent answer (dual role) is never denied by the server\'s absence', () => {
  const w = boardScope({ players: [P('coach_me', { [KEY]: 'available' })], resolved: {},
    pending: { [SESSION]: { response: 'available', reason: '', at: '2026-09-25T10:00:00.000Z', owner: 'coach_me', seq: 0 } } });
  const [row] = w.rows(SESSION);
  assert.equal(row.status, 'available'); assert.equal(row.pending, true); assert.equal(row.confirmed, false);
});

test('C. a FAILED read after a good one changes nothing: known answers stay, absence stays No reply, and the board is not "unknown"', () => {
  const w = boardScope({ players: [P('p', { [KEY]: 'maybe' }), P('q', { [KEY]: 'available' })],
    resolved: { p: { [SESSION]: { response: 'maybe', reason: '', respondedAt: '2026-09-25T09:00:00.000Z' } } }, readFailed: true });
  const by = Object.fromEntries(w.rows(SESSION).map(r => [r.player.id, r]));
  assert.equal(by.p.status, 'maybe', 'the last good read\'s answer is kept'); assert.equal(by.p.confirmed, true);
  assert.equal(by.q.status, 'no-reply', 'and its absence still means No reply — the failure did not resurrect the stale local field');
  assert.equal(w.unknown(), false, 'a failure AFTER a good read is not the failure STATE');
  const cold = boardScope({ players: [P('q', { [KEY]: 'available' })], resolved: {}, sync: false, readFailed: true });
  assert.equal(cold.unknown(), true, 'with no knowledge at all the board is unknown, as before');
  assert.equal(cold.rows(SESSION)[0].status, 'available', 'and the local field is not erased by a failed read');
});

test('C2. the coach roster patch drops stale local fields only on a SUCCESSFUL read, only for the operating group, never a pending one', () => {
  const drop = new Function(`"use strict";
    const state = { currentUserId: 'coach_me', availabilityPending: { 'slot_x': { response: 'maybe', reason: '', at: 't', owner: 'coach_me', seq: 0 } } };
    ${fn('sessionKey')} ${fn('normalizeSessionId')} ${fn('availabilityPendingFor')} ${fn('availabilitySessionIdForKey')} ${fn('availabilityDropStaleLocalAnswers')}
    return availabilityDropStaleLocalAnswers;
  `)();
  const p = { id: 'p', userId: 'p', avail_a: 'available', avail_aReason: 'work', avail_aRespondedAt: 'x', avail_b: 'maybe', trainingTuesday: 'unavailable', name: 'P' };
  assert.equal(drop(p, { a: { response: 'available' }, tue: { response: 'unavailable' } }), true);
  assert.deepEqual(Object.keys(p).sort(), ['avail_a', 'avail_aReason', 'avail_aRespondedAt', 'id', 'name', 'trainingTuesday', 'userId'].sort(), 'only the session the server no longer holds was dropped; aliases (tue/trainingTuesday) matched');
  const mine = { id: 'coach_me', userId: 'coach_me', avail_slot_x: 'maybe' };
  assert.equal(drop(mine, {}), false, 'an unsent (pending) answer is kept');
  assert.equal(mine.avail_slot_x, 'maybe');
  // the patch loop: after the success path only, scoped to the operating group
  const body = fn('refreshLiveAvailability');
  assert.ok(body.indexOf('if (!reply) {') < body.indexOf('availabilityDropStaleLocalAnswers'), 'the drop sits after the failed-read return');
  assert.match(body, /_inScope && _inScope\.has\(String\(p && p\.id \|\| ''\)\) && typeof availabilityDropStaleLocalAnswers === 'function'/, 'operating group only');
  assert.match(body, /&& availabilityDropStaleLocalAnswers\(p, mine \|\| \{\}\)\) changed = true;/, 'and the drop is actually applied');
});

// ═══════════════════════════════════════════════════════════════════════════
// D + E — the PLAYER device: a successful self-read reconciles confirmed answers; pending survives
// ═══════════════════════════════════════════════════════════════════════════
function playerScope({ player, responses, ok = true, pending = {}, confirmedAt = {}, me = 'user_me' } = {}) {
  return new Function(`"use strict";
    const CFG = arguments[0];
    const PLAYER = CFG.player;
    let state = { players: [PLAYER], users: [], currentUserId: CFG.me, availabilityPending: CFG.pending, activePlayerSection: 'availability' };
    let _playerAvailFetched = false, _playerAvailKnown = false, _availReadFailed = false;
    let _availConfirmedAt = CFG.confirmedAt;
    let saves = 0, renders = 0, homeRenders = 0, failedFlag = null;
    function saveState() { saves++; } function renderPlayerAvailabilityV2() { renders++; } function renderPlayerHome() { homeRenders++; }
    function availabilitySetReadFailed(v) { failedFlag = v; _availReadFailed = v; }
    function getPlayer() { return PLAYER; }
    function findLiveAvailabilityRecords() { return []; }
    async function fetch() { if (!CFG.ok) return { ok: false, status: 500, json: async () => ({}) }; return { ok: true, status: 200, json: async () => ({ responses: CFG.responses }) }; }
    ${fn('sessionKey')} ${fn('keyToSessionId')} ${fn('normalizeSessionId')} ${fn('availabilityPendingFor')}
    ${fn('availabilitySessionIdForKey')} ${fn('mergeServerAvailabilityIntoRecord')} ${fn('reconcileServerAvailabilityIntoRecord')}
    ${fn('fetchMyAvailabilityFromServer')} ${fn('playerAvailRetryNow')}
    return { fetch: fetchMyAvailabilityFromServer, retry: playerAvailRetryNow, player: PLAYER, state,
             counts: () => ({ saves, renders, homeRenders, failedFlag, known: _playerAvailKnown, fetched: _playerAvailFetched }) };
  `)({ player, responses, ok, pending, confirmedAt, me });
}

test('D. player device: a confirmed Available the server no longer holds becomes No reply after a successful self-read', async () => {
  const p = playerScope({ player: { id: 'user_me', userId: 'user_me', name: 'Me', [KEY]: 'available', [KEY + 'Reason']: '', [KEY + 'RespondedAt']: '2026-09-24T10:00:00.000Z' }, responses: {} });
  await p.fetch();
  assert.equal(p.player[KEY], undefined, 'the cleared answer is gone');
  assert.equal(p.player[KEY + 'RespondedAt'], undefined);
  assert.equal(p.counts().renders, 1, 'repainted'); assert.equal(p.counts().saves, 1, 'persisted'); assert.equal(p.counts().known, true);
});

test('D2. …and a different confirmed answer on the server (given on another device) is adopted', async () => {
  const p = playerScope({ player: { id: 'user_me', userId: 'user_me', name: 'Me', [KEY]: 'available' }, responses: { [SESSION]: { response: 'unavailable', reason: 'work' } } });
  await p.fetch();
  assert.equal(p.player[KEY], 'unavailable'); assert.equal(p.player[KEY + 'Reason'], 'work');
});

test('E. an UNSENT pending answer survives a self-read that holds nothing for it', async () => {
  const p = playerScope({ player: { id: 'user_me', userId: 'user_me', name: 'Me', [KEY]: 'available' }, responses: {},
    pending: { [SESSION]: { response: 'available', reason: '', at: '2026-09-25T10:00:00.000Z', owner: 'user_me', seq: 0 } } });
  await p.fetch();
  assert.equal(p.player[KEY], 'available', 'the intent this device still carries is not the server\'s to deny');
  assert.deepEqual(Object.keys(p.state.availabilityPending), [SESSION], 'and the pending entry is untouched');
});

test('E2. an answer confirmed AFTER the read left is not overruled by that read', async () => {
  const later = Date.now() + 60_000;   // "confirmed" a minute from now — i.e. after any read that starts now
  const p = playerScope({ player: { id: 'user_me', userId: 'user_me', name: 'Me', [KEY]: 'available' }, responses: {}, confirmedAt: { [SESSION]: later } });
  await p.fetch();
  assert.equal(p.player[KEY], 'available', 'kept: the read predates the confirmation');
});

test('E3. a FAILED self-read changes nothing on the device', async () => {
  const p = playerScope({ player: { id: 'user_me', userId: 'user_me', name: 'Me', [KEY]: 'available' }, responses: {}, ok: false });
  await p.fetch();
  assert.equal(p.player[KEY], 'available'); assert.equal(p.counts().failedFlag, true); assert.equal(p.counts().renders, 0);
});

test('E4. returning to the app re-reads ONCE (no loop), and the retry helper is unchanged', () => {
  const ret = fn('refreshAvailabilityOnReturn');
  assert.match(ret, /if \(state\.activeView === 'player' && typeof playerAvailRetryNow === 'function'\) playerAvailRetryNow\(\);/);
  assert.match(ret, /availabilityFlushPending\(\)/, 'the flush is still there');
  assert.doesNotMatch(ret, /setInterval|setTimeout/, 'no timer, no polling');
  assert.match(fn('playerAvailRetryNow'), /_playerAvailFetched = false;\s*\n\s*fetchMyAvailabilityFromServer\(\);/);
  assert.doesNotMatch(fn('fetchMyAvailabilityFromServer'), /_playerAvailFetched = false/, 'the latch is released by the return hook, never by the read itself');
  assert.match(fn('saveAvailabilityResponseToServer'), /availabilityNoteConfirmed\(id\)/, 'a 2xx notes the confirmation moment');
});

// ═══════════════════════════════════════════════════════════════════════════
// THE REAL APP — coach on the U18 board, Pixel 5 player, Chromium
// ═══════════════════════════════════════════════════════════════════════════
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }
const handlers = { availability };
for (const name of ['identity', 'invite', 'config', 'publish', 'chat', 'push', 'schedules', 'templates', 'subscribe']) {
  handlers[name] = (await import(`../api/${name}.js`)).default;
}
const NET = { rules: [] };
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).split('/')[0];
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    for (const rule of NET.rules) {
      if (rule.times <= 0 || (rule.method && rule.method !== req.method) || (rule.path && !url.pathname.includes(rule.path))) continue;
      if (rule.bodyMatch && !JSON.stringify(body).includes(rule.bodyMatch)) continue;
      rule.times--;
      if (rule.fail) { res.statusCode = rule.fail; res.setHeader('content-type', 'application/json'); return res.end('{"error":"injected"}'); }
    }
    const vreq = { method: req.method, headers: { ...req.headers, 'x-forwarded-proto': 'http' }, query: Object.fromEntries(url.searchParams), body, url: req.url, on() {} };
    const vres = { statusCode: 200,
      status(c) { this.statusCode = c; return this; }, setHeader(k, v) { res.setHeader(k, v); }, getHeader(k) { return res.getHeader(k); },
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
const waitFor = async (fnc, ms, every = 60) => { const t0 = Date.now(); for (;;) { const v = await fnc(); if (v) return { ok: true, ms: Date.now() - t0, v }; if (Date.now() - t0 > ms) return { ok: false, ms: Date.now() - t0, v }; await new Promise(r => setTimeout(r, every)); } };

test('browser: answer → clear → coach No reply → player returns/reloads No reply; pending survives a clear and flushes; clear/write overlap stays consistent', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const ctxs = [];
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;
    const c = await u18Club('Browser');
    const login = async (page, email) => {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ce-welcome', { timeout: 20000 });
      await page.click('#ce-welcome button:has-text("Log in")');
      await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
      await page.fill('#identityLoginEmail', email); await page.fill('#identityLoginPassword', PW); await page.click('#identityLoginBtn');
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId && !!state.currentUserId, null, { timeout: 20000 });
    };
    const coachCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); ctxs.push(coachCtx);
    const coach = await coachCtx.newPage();
    const errors = []; coach.on('pageerror', e => errors.push('coach: ' + e.message));
    await login(coach, 'coach.browser@cw.test');
    assert.equal(await coach.evaluate(async gid => (await fetch('/api/publish?resource=training-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', group: gid, slot: { day: 'Tue', startTime: '19:00', venue: 'U18 pitch', active: true } }) })).status, c.U18.id), 200);
    await coach.evaluate(gid => { setOperationalGroup(gid); setSection('coach', 'message'); }, c.U18.id);
    await coach.waitForFunction(gid => state.activeCoachSection === 'message' && state.operationalGroupId === gid, c.U18.id, { timeout: 20000 });
    const EV = await coach.evaluate(() => coachAvailEvents().find(e => e.type === 'training')?.id);
    assert.ok(EV);
    const playerCtx = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' }); ctxs.push(playerCtx);
    let player = await playerCtx.newPage(); player.on('pageerror', e => errors.push('player: ' + e.message));
    await login(player, 'ugo.browser@cw.test');
    const openAvail = async (pg) => { await pg.evaluate(() => setSection('player', 'availability')); await waitFor(() => pg.evaluate(() => typeof _playerAvailKnown !== 'undefined' && _playerAvailKnown && !!(_trainingSchedule && _trainingSchedule.slots)), 15000); };
    await openAvail(player);
    const row = (name) => coach.evaluate(([n, id]) => { const r = (sessionRows(id) || []).find(x => x.player?.name === n); return r ? r.status : 'ROW-MISSING'; }, [name, EV]);
    const chip = (name) => coach.evaluate(n => { const el = [...document.querySelectorAll('#coach-message .msg-player-row')].find(b => b.textContent.includes(n)); return el ? (el.querySelector('.msg-chip')?.textContent || '').trim() : null; }, name);
    const settled = (pg) => waitFor(() => pg.evaluate(id => !(state.availabilityPending && state.availabilityPending[id]), EV), 10000);
    const tap = (pg, status, reason = '') => pg.evaluate(([id, st, rs]) => { setPlayerAvailability(sessionKey(id), st, rs); return true; }, [EV, status, reason]);
    const local = (pg) => pg.evaluate(id => getPlayer()[sessionKey(id)] || 'no-reply', EV);
    const cardText = (pg) => pg.evaluate(() => (document.getElementById('player-availability')?.innerText || '').replace(/\s+/g, ' '));
    const clearViaApi = () => coach.evaluate(async ({ gid, ev }) => (await fetch('/api/availability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_week', group: gid, sessions: [ev] }) })).status, { gid: c.U18.id, ev: EV });
    const returnToApp = (pg) => pg.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });

    // 1–2. the player answers, the coach sees it
    await tap(player, 'available'); await settled(player);
    assert.ok((await waitFor(async () => (await row('Ugo Uno')) === 'available', 15000)).ok, 'coach sees Available');
    // 3–4. another admin/device clears the week (the API, not this coach's own client action) → this board says No reply
    assert.equal(await clearViaApi(), 200);
    const cleared = await waitFor(async () => (await row('Ugo Uno')) === 'no-reply' && /No reply/i.test(await chip('Ugo Uno') || ''), 15000);
    assert.ok(cleared.ok, 'coach board reads No reply after the clear (was the stale local answer)');
    assert.equal(await coach.evaluate(id => { const p = operationalPlayers().find(x => x.name === 'Ugo Uno'); return p ? (p[sessionKey(id)] || 'gone') : 'no-player'; }, EV), 'gone', 'and the stale local field was dropped');
    // 5–6. the player returns to the app → their screen says No reply; and so after a reload
    await returnToApp(player);
    const back = await waitFor(async () => (await local(player)) === 'no-reply', 10000);
    assert.ok(back.ok, 'player sees No reply on return');
    assert.doesNotMatch(await cardText(player), /All sessions confirmed/i);
    await player.reload({ waitUntil: 'domcontentloaded' });
    await player.waitForFunction(() => typeof state !== 'undefined' && !!state.currentUserId, null, { timeout: 20000 });
    await openAvail(player);
    assert.equal(await local(player), 'no-reply', 'and after a reload');

    // 7–10. a PENDING (unsent) answer survives a clear and is flushed on reconnect
    NET.rules.push({ method: 'POST', path: '/api/availability', bodyMatch: '"response":"maybe"', fail: 503, times: 1 });
    await tap(player, 'maybe');
    assert.ok((await waitFor(() => player.evaluate(id => !!(state.availabilityPending && state.availabilityPending[id]), EV), 5000)).ok, 'held pending');
    assert.equal(await clearViaApi(), 200);
    await returnToApp(player);                                   // re-read (server: nothing) + flush (sends the pending maybe)
    await settled(player);
    assert.equal(await local(player), 'maybe', 'the pending intent was never erased');
    assert.equal((await stored(c, c.players[0].user.id, EV))?.response, 'maybe', 'and reached the server on reconnect');
    assert.ok((await waitFor(async () => (await row('Ugo Uno')) === 'maybe', 15000)).ok, 'the coach sees the flushed answer');

    // 11–12. clear and write overlap: the record is one of the two serial outcomes, never corrupt
    kvHooks.delayGetMs = 200;
    const clearP = clearViaApi();
    await new Promise(r => setTimeout(r, 40));
    await tap(player, 'unavailable', 'work');
    await clearP; await settled(player);
    kvHooks.delayGetMs = 0;
    const rec = await record(c, EV);
    const entries = Object.values(rec);
    assert.ok(entries.length === 0 || (entries.length === 1 && entries[0].userId === c.players[0].user.id && entries[0].response === 'unavailable'),
      'serial: either cleared then answered (one clean entry) or answered then cleared (empty) — got ' + JSON.stringify(rec));
    const coachFinal = await waitFor(async () => { const s = await row('Ugo Uno'); return entries.length ? s === 'unavailable' : s === 'no-reply'; }, 15000);
    assert.ok(coachFinal.ok, 'the coach board agrees with the record');
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    for (const ctx of ctxs) { try { await ctx.close(); } catch {} }
    await browser.close(); await new Promise(r => server.close(r));
  }
});
