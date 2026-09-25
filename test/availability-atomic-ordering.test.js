/**
 * AVAILABILITY WRITES ARE ATOMIC AND ORDERED.
 *
 * Two P1 defects found by the U18 availability audit (2026-09-25), both
 * reproduced against the real handlers before this change:
 *
 *  1. CONCURRENT ANSWERS LOST ONE WRITE. A session's answers are one record,
 *     written by read → replace own entry → save. Two players answering within
 *     the same read→write window each read the record without the other's
 *     entry, and the second save silently dropped the first answer. The
 *     player's device still showed it; the coach board never did.
 *
 *  2. OUT-OF-ORDER TAPS KEPT THE FIRST ANSWER. A player tapping Available then
 *     Unavailable sent two concurrent requests; the server stamped respondedAt
 *     on arrival, so a slow first request landing last became the stored
 *     answer while the player's screen showed the second.
 *
 * The fix: (a) a per-session write mutex (SET NX EX) around the existing
 * read-modify-write — record format, keys and readers untouched, so existing
 * data needs no migration; (b) an intent stamp chosen on the device
 * (intentAt + intentSeq) that the server keeps per person and compares under
 * the lock — an older intent is acknowledged, never applied; (c) one request
 * in flight per session per device, so taps on one session never race.
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
const decl = re => { const m = src.match(re); assert.ok(m, `declaration ${re} not found`); return m[0]; };

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.atomic-ordering.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
delete process.env.VERCEL; delete process.env.NODE_ENV;

// ── KV stub in the Upstash REST shape. SET honours NX (the lock). A GET can be
// made to deliver the value it read LATER, so two read-modify-writes really
// overlap the way they can against a network store. ───────────────────────
const kv = new Map(), lists = new Map();
const kvHooks = { delayGetMs: 0, delayGetMatch: 'availability:' };
globalThis.fetch = async (_url, options = {}) => {
  const [cmd, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (cmd === 'GET') {
    result = kv.has(a[0]) ? kv.get(a[0]) : null;                          // read now …
    if (kvHooks.delayGetMs && String(a[0]).includes(kvHooks.delayGetMatch)) await new Promise(r => setTimeout(r, kvHooks.delayGetMs));   // … delivered later
  }
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

/** A club with a U18 group, a founder coach and two U18 players, built through the real store. */
async function u18Club(label) {
  const club = await S.createClub({ clubName: `${label} RFC`, teamName: 'First XV', sport: 'Rugby', name: `${label} Coach`, email: `coach.${label.toLowerCase()}@ao.test`, password: PW, idempotencyKey: kkey() });
  const { group: U18 } = await ST.createGroup(club.team.id, { name: 'U18', developmentCategory: 'youth_u18' });
  const teamCode = (await S.loadStoredTeams()).find(t => t.id === club.team.id).teamCode;
  const players = [];
  for (const [first, last] of [['Ugo', 'Uno'], ['Dua', 'Dos'], ['Tre', 'Tres']]) {
    const p = await S.createJoinRequest({ teamCode, firstName: first, lastName: last, email: `${first.toLowerCase()}.${label.toLowerCase()}@ao.test`, password: PW });
    await S.approveJoinRequest(p.teamMember.id, club.user.id, club.team.id);
    players.push(p);
  }
  const members = await S.loadTeamMembers();
  for (const m of members) if (m.teamId === club.team.id && players.some(p => p.user.id === m.userId)) m.playerGroupId = U18.id;
  await S.saveTeamMembers(members);
  // Minted one at a time: createSession is itself a load→push→save of the
  // session list, so concurrent mints would lose each other's tokens.
  const sessions = [];
  for (const p of players) sessions.push(await S.createSession({ userId: p.user.id, teamId: club.team.id, role: 'player' }));
  const coach = await S.createSession({ userId: club.user.id, teamId: club.team.id, role: 'coach' });
  return { club, U18, players, sessions, coach };
}
const SESSION = 'slot_u18tue-20260929';
const stamp = (msOffset, seqNo = 0) => ({ intentAt: new Date(Date.UTC(2026, 8, 25, 10, 0, 0, msOffset)).toISOString(), intentSeq: seqNo });
const stored = async (c, userId, session = SESSION) => {
  const rec = await AV.loadGroupAvailability(c.club.team.id, c.U18.id, session);
  const mine = Object.values(rec).filter(v => v && v.userId === userId);
  return mine.length === 1 ? mine[0] : (mine.length ? mine : null);
};
const board = async (c) => {
  const r = await call('GET', { resolveRoster: '1', group: c.U18.id }, null, ck(c.coach));
  assert.equal(r.status, 200);
  return r.body.resolved;
};

// ═══════════════════════════════════════════════════════════════════════════
// A + B — CONCURRENT WRITERS BOTH PERSIST
// ═══════════════════════════════════════════════════════════════════════════
test('A. two players answering the same session concurrently both persist', async () => {
  const c = await u18Club('Alpha');
  kvHooks.delayGetMs = 120;                       // both reads deliver before either save (the lost-update window)
  const [ra, rb] = await Promise.all([
    post(ck(c.sessions[0]), { sessionId: SESSION, response: 'available', ...stamp(0) }),
    post(ck(c.sessions[1]), { sessionId: SESSION, response: 'available', ...stamp(1) }),
  ]);
  kvHooks.delayGetMs = 0;
  assert.equal(ra.status, 200); assert.equal(rb.status, 200);
  assert.equal(ra.body.applied, true); assert.equal(rb.body.applied, true);
  assert.equal((await stored(c, c.players[0].user.id))?.response, 'available', 'player A persisted');
  assert.equal((await stored(c, c.players[1].user.id))?.response, 'available', 'player B persisted');
  const b = await board(c);
  assert.equal(b[c.players[0].user.id.toLowerCase()][SESSION].response, 'available');
  assert.equal(b[c.players[1].user.id.toLowerCase()][SESSION].response, 'available');
  assert.equal(kv.has(AV.availabilityWriteLockKey(c.club.team.id, c.U18.id, SESSION)), false, 'the lock is released');
});

test('B. concurrent DIFFERENT answers from two players both persist, and a third joins the burst', async () => {
  const c = await u18Club('Bravo');
  kvHooks.delayGetMs = 120;
  const out = await Promise.all([
    post(ck(c.sessions[0]), { sessionId: SESSION, response: 'available', ...stamp(0) }),
    post(ck(c.sessions[1]), { sessionId: SESSION, response: 'unavailable', reason: 'work', ...stamp(2) }),
    post(ck(c.sessions[2]), { sessionId: SESSION, response: 'maybe', ...stamp(4) }),
  ]);
  kvHooks.delayGetMs = 0;
  out.forEach(r => { assert.equal(r.status, 200); assert.equal(r.body.applied, true); });
  assert.equal((await stored(c, c.players[0].user.id))?.response, 'available');
  assert.equal((await stored(c, c.players[1].user.id))?.response, 'unavailable');
  assert.equal((await stored(c, c.players[1].user.id))?.reason, 'work');
  assert.equal((await stored(c, c.players[2].user.id))?.response, 'maybe');
});

// ═══════════════════════════════════════════════════════════════════════════
// C, D, E — THE LAST TAP WINS, WHATEVER ORDER THE REQUESTS LAND IN
// ═══════════════════════════════════════════════════════════════════════════
test('C. the NEWER intent lands first; the older one arriving later is acknowledged, not applied', async () => {
  const c = await u18Club('Charlie');
  const me = c.sessions[0], id = c.players[0].user.id;
  const t1 = stamp(0), t2 = stamp(500);
  const r2 = await post(ck(me), { sessionId: SESSION, response: 'unavailable', reason: 'holiday', ...t2 });   // second tap, fast
  const r1 = await post(ck(me), { sessionId: SESSION, response: 'available', ...t1 });                        // first tap, slow
  assert.equal(r2.body.applied, true);
  assert.equal(r1.status, 200, 'an older intent is a success from the client\'s point of view');
  assert.equal(r1.body.applied, false); assert.equal(r1.body.superseded, true);
  assert.equal(r1.body.response, 'unavailable', 'and the reply says what the store holds');
  assert.equal(r1.body.intentAt, t2.intentAt);
  const s = await stored(c, id);
  assert.equal(s.response, 'unavailable'); assert.equal(s.reason, 'holiday'); assert.equal(s.intentAt, t2.intentAt);
  assert.equal((await board(c))[id.toLowerCase()][SESSION].response, 'unavailable', 'the coach reads the last tap');
});

test('D. the older intent lands first, the newer second — newer wins (and so does the plain order)', async () => {
  const c = await u18Club('Delta');
  const me = c.sessions[0], id = c.players[0].user.id;
  await post(ck(me), { sessionId: SESSION, response: 'available', ...stamp(0) });
  const r = await post(ck(me), { sessionId: SESSION, response: 'unavailable', ...stamp(1) });
  assert.equal(r.body.applied, true);
  assert.equal((await stored(c, id)).response, 'unavailable');
});

test('E. three rapid taps delivered in an adversarial order, sequentially AND concurrently: the last tap wins', async () => {
  const c = await u18Club('Echo');
  const me = c.sessions[0], id = c.players[0].user.id;
  const A = { sessionId: SESSION, response: 'available', ...stamp(0) };
  const U = { sessionId: SESSION, response: 'unavailable', reason: 'injury', ...stamp(10) };
  const M = { sessionId: SESSION, response: 'maybe', ...stamp(20) };
  for (const body of [M, A, U]) await post(ck(me), body);           // 3rd, 1st, 2nd
  assert.equal((await stored(c, id)).response, 'maybe', 'sequential adversarial order');
  // A fresh session, all three in flight at once with overlapping reads.
  const S2 = 'slot_u18thu-20261001';
  kvHooks.delayGetMs = 80;
  await Promise.all([U, M, A].map(b => post(ck(me), { ...b, sessionId: S2 })));
  kvHooks.delayGetMs = 0;
  const s = await stored(c, id, S2);
  assert.equal(s.response, 'maybe', 'concurrent adversarial order');
  assert.equal(Object.values(await AV.loadGroupAvailability(c.club.team.id, c.U18.id, S2)).length, 1, 'one canonical entry per person');
});

test('E2. equal instants are ordered by intentSeq; a full tie is the same intent and applies idempotently', async () => {
  const c = await u18Club('Echo2');
  const me = c.sessions[0], id = c.players[0].user.id;
  await post(ck(me), { sessionId: SESSION, response: 'maybe', ...stamp(0, 1) });          // same ms, second tap
  const older = await post(ck(me), { sessionId: SESSION, response: 'available', ...stamp(0, 0) });   // same ms, first tap, arriving late
  assert.equal(older.body.applied, false);
  assert.equal((await stored(c, id)).response, 'maybe');
  const dup = await post(ck(me), { sessionId: SESSION, response: 'maybe', ...stamp(0, 1) });          // the same intent again
  assert.equal(dup.body.applied, true, 'a duplicate of the stored intent applies (idempotent)');
  assert.equal((await stored(c, id)).response, 'maybe');
});

// ═══════════════════════════════════════════════════════════════════════════
// F + G — RETRIES AND DUPLICATES
// ═══════════════════════════════════════════════════════════════════════════
test('F. a retry of a failed OLDER intent arriving after a newer success leaves the newer answer authoritative', async () => {
  const c = await u18Club('Foxtrot');
  const me = c.sessions[0], id = c.players[0].user.id;
  const t1 = stamp(0), t2 = stamp(1000);
  // T1 never reached the store (the device was offline); the player then chose T2, which succeeded.
  await post(ck(me), { sessionId: SESSION, response: 'unavailable', reason: 'family', ...t2 });
  // Connectivity returns and the device retries T1 with ITS OWN stamp.
  const retry = await post(ck(me), { sessionId: SESSION, response: 'available', ...t1 });
  assert.equal(retry.status, 200); assert.equal(retry.body.applied, false);
  const s = await stored(c, id);
  assert.equal(s.response, 'unavailable'); assert.equal(s.reason, 'family');
  assert.equal((await board(c))[id.toLowerCase()][SESSION].response, 'unavailable');
});

test('G. the same intent sent twice is idempotent: one entry, same content, no churn', async () => {
  const c = await u18Club('Golf');
  const me = c.sessions[0], id = c.players[0].user.id;
  const body = { sessionId: SESSION, response: 'available', ...stamp(0) };
  const r1 = await post(ck(me), body); const r2 = await post(ck(me), body);
  assert.equal(r1.body.applied, true); assert.equal(r2.body.applied, true);
  const rec = await AV.loadGroupAvailability(c.club.team.id, c.U18.id, SESSION);
  assert.equal(Object.keys(rec).length, 1, 'one entry');
  assert.equal(rec[id].response, 'available'); assert.equal(rec[id].intentAt, body.intentAt);
});

// ═══════════════════════════════════════════════════════════════════════════
// H — EXISTING DATA STAYS READABLE; UNSTAMPED WRITES KEEP THEIR OLD SEMANTICS
// ═══════════════════════════════════════════════════════════════════════════
test('H. a pre-ordering record (no intent stamp) is read as before, and a stamped write over it applies', async () => {
  const c = await u18Club('Hotel');
  const me = c.sessions[0], id = c.players[0].user.id;
  // Seed the exact pre-change record shape under the real group key.
  await AV.saveGroupAvailability(c.club.team.id, c.U18.id, SESSION, {
    [id]: { response: 'maybe', reason: '', respondedAt: '2026-09-20T10:00:00.000Z', label: 'Ugo Uno', userId: id, playerId: id, legacyPlayerId: '' },
    'inv-legacy': { response: 'unavailable', reason: 'work', respondedAt: '2026-09-19T10:00:00.000Z', label: 'Ugo Uno', userId: id, playerId: id, legacyPlayerId: 'inv-legacy' },
  });
  assert.equal((await board(c))[id.toLowerCase()][SESSION].response, 'maybe', 'legacy entries resolve exactly as before (newest respondedAt)');
  const self = await call('GET', { myResponse: '1' }, null, ck(me));
  assert.equal(self.body.responses[SESSION].response, 'maybe', 'the player self-read too');
  // A stamped write is never "older" than an unstamped record — it applies and heals the alias.
  const r = await post(ck(me), { sessionId: SESSION, response: 'available', ...stamp(0) });
  assert.equal(r.body.applied, true);
  const rec = await AV.loadGroupAvailability(c.club.team.id, c.U18.id, SESSION);
  assert.deepEqual(Object.keys(rec), [id], 'one canonical entry, alias healed');
  assert.equal(rec[id].response, 'available'); assert.equal(rec[id].intentAt, stamp(0).intentAt);
});

test('H2. an UNSTAMPED write (older client, notification action) keeps arrival-order semantics', async () => {
  const c = await u18Club('Hotel2');
  const me = c.sessions[0], id = c.players[0].user.id;
  await post(ck(me), { sessionId: SESSION, response: 'unavailable', ...stamp(5000) });   // a stamped answer
  const legacy = await post(ck(me), { sessionId: SESSION, response: 'available' });        // no stamp at all
  assert.equal(legacy.status, 200); assert.equal(legacy.body.applied, true, 'nothing that could answer before this change is refused by it');
  const s = await stored(c, id);
  assert.equal(s.response, 'available');
  assert.match(String(s.intentAt), /^\d{4}-\d{2}-\d{2}T/, 'the arrival moment becomes its intent, so a later stamped tap orders after it');
});

test('H3. a clock running far ahead is stamped with the arrival moment, so correctly clocked devices are never locked out', async () => {
  const c = await u18Club('Hotel3');
  const me = c.sessions[0], id = c.players[0].user.id;
  const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await post(ck(me), { sessionId: SESSION, response: 'available', intentAt: farFuture, intentSeq: 0 });
  const s1 = await stored(c, id);
  assert.ok(new Date(s1.intentAt).getTime() <= Date.now() + 5000, 'clamped to now, not an hour ahead');
  const later = await post(ck(me), { sessionId: SESSION, response: 'maybe', intentAt: new Date(Date.now() + 1000).toISOString(), intentSeq: 0 });
  assert.equal(later.body.applied, true, 'a later, correctly clocked tap still wins');
});

// ═══════════════════════════════════════════════════════════════════════════
// I — AUTHORITY IS UNCHANGED: SESSION CLUB, MEMBERSHIP GROUP, SESSION IDENTITY
// ═══════════════════════════════════════════════════════════════════════════
test('I. intent fields ride beside forged identity fields, and none of the forged ones is honoured', async () => {
  const c = await u18Club('India');
  const other = await u18Club('Indigo');
  const me = c.sessions[0], id = c.players[0].user.id;
  const r = await post(ck(me), { sessionId: SESSION, response: 'available', ...stamp(0),
    teamId: other.club.team.id, group: 'grp_initial', playerId: c.players[1].user.id, userId: other.players[0].user.id, legacyPlayerId: 'inv-forged' });
  assert.equal(r.status, 200); assert.equal(r.body.userId, id, 'identity is the session\'s');
  assert.equal((await stored(c, id)).response, 'available', 'written under the session player, in the session club and membership group');
  assert.equal(await stored(c, c.players[1].user.id), null, 'not under the forged playerId');
  assert.equal(Object.keys(await AV.loadGroupAvailability(c.club.team.id, 'grp_initial', SESSION)).length, 0, 'not in the forged group');
  assert.equal(Object.keys(await AV.loadGroupAvailability(other.club.team.id, other.U18.id, SESSION)).length, 0, 'not in the forged club');
  const foreign = await post(ck(other.sessions[0]), { sessionId: SESSION, response: 'maybe', ...stamp(9) });
  assert.equal(foreign.status, 200);
  assert.equal((await stored(c, id)).response, 'available', 'another club\'s player cannot touch this record');
  const anon = await post(null, { sessionId: SESSION, response: 'maybe', ...stamp(9), userId: id });
  assert.equal(anon.status, 401, 'no session, no write');
});

// ═══════════════════════════════════════════════════════════════════════════
// J — THE LOCK: bounded wait, fail closed, released, outside the scan namespace
// ═══════════════════════════════════════════════════════════════════════════
test('J. a held lock makes the write wait and then fail closed with 503 busy — nothing written unserialised', async () => {
  const c = await u18Club('Juliet');
  const me = c.sessions[0], id = c.players[0].user.id;
  const lockKey = AV.availabilityWriteLockKey(c.club.team.id, c.U18.id, SESSION);
  kv.set(lockKey, JSON.stringify('someone-else'));
  const t0 = Date.now();
  const r = await post(ck(me), { sessionId: SESSION, response: 'available', ...stamp(0) });
  assert.equal(r.status, 503); assert.equal(r.body.code, 'busy');
  assert.ok(Date.now() - t0 >= 3500, 'waited for the lock before giving up');
  assert.equal(await stored(c, id), null, 'nothing was written');
  assert.equal(kv.get(lockKey), JSON.stringify('someone-else'), 'and the other holder\'s lock is untouched');
  kv.delete(lockKey);
  const ok = await post(ck(me), { sessionId: SESSION, response: 'available', ...stamp(1) });
  assert.equal(ok.status, 200); assert.equal(kv.has(lockKey), false, 'released after the write');
});

test('J2. the lock key sits outside every availability scan, so no reader mistakes it for a record', () => {
  const k = AV.availabilityWriteLockKey('club-x', 'grp-y', 'slot-z');
  assert.equal(k, 'app:availability_lock:club-x:grp-y:slot-z');
  assert.doesNotMatch(k, /^app:availability:/, 'not under app:availability:*');
});

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT — one request in flight per session; a stale success never clears a newer intent
// ═══════════════════════════════════════════════════════════════════════════
function device({ script = [] } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const ME = 'user_me';
    const PLAYER = { id: ME, userId: ME, name: 'Me', history: [] };
    let state = { players: [PLAYER], users: [], currentUserId: ME, messages: [], masterFeed: [], availabilityPending: {} };
    let _availReasonOpenByKey = {}, _availAuthPromptedAt = 0;
    let toasts = [], posts = [], releases = [], step = 0;
    function showToast(t){ toasts.push(t); } function saveState(){} function render(){}
    function getPlayer(){ return PLAYER; } function findLiveAvailabilityRecords(){ return []; }
    function sessionKey(id){ return 'avail_' + id; } function keyToSessionId(k){ return String(k).replace(/^avail_/, ''); }
    function sessionTitle(){ return 'Tuesday'; } function statusLabel(s){ return s; } function addMasterFeed(){} function upsertAvailabilityResponseMessage(){}
    function checkServerSession(){ return Promise.resolve(); } function setAuthTab(){}
    const REASON_LABELS = {};
    ${decl(/const AVAIL_PENDING_MAX = \d+;[^\n]*/)}
    ${decl(/const AVAIL_RESPONSES = \[[^\]]*\];/)}
    // Each POST resolves only when the test releases it (or at once when the script says 'ok').
    async function fetch(url, opts){
      const b = JSON.parse(opts.body); const n = posts.length; posts.push({ ...b, t: Date.now() });
      const mode = CFG.script[Math.min(step, CFG.script.length - 1)] || 'ok'; step++;
      if (mode === 'hold') await new Promise(r => { releases[n] = r; });
      if (mode === 'offline') throw new TypeError('Load failed');
      if (mode === 'server-error') return { ok:false, status:503, json: async()=>({}) };
      return { ok:true, status:200, json: async()=>({ ok:true, applied:true }) };
    }
    ${fn('normalizeAvailabilityPending')}
    ${fn('availabilityMarkPending')}
    ${fn('availabilityClearPending')}
    ${fn('availabilityPendingFor')}
    ${fn('availabilityApplyToRecord')}
    ${fn('captureAvailabilityFields')}
    ${decl(/let _availSendChain = \{\};/)}
    ${fn('saveAvailabilityResponseToServer')}
    ${decl(/let _availFlushInFlight = false;/)}
    ${fn('availabilityFlushPending')}
    ${fn('setPlayerAvailability')}
    return { tap: setPlayerAvailability, save: saveAvailabilityResponseToServer, flush: availabilityFlushPending,
             posts: () => posts, release: n => releases[n] && releases[n](), pending: () => state.availabilityPending,
             toasts: () => toasts, normalize: normalizeAvailabilityPending, mark: availabilityMarkPending };
  `;
  return new Function(body)({ script });
}
const KEY = 'avail_' + SESSION;
const tick = () => new Promise(r => setTimeout(r, 15));

test('CLIENT 1. two quick taps on one session send two requests in ORDER, never side by side', async () => {
  const d = device({ script: ['hold', 'ok'] });
  const first = d.tap(KEY, 'available', '');
  await tick();
  const second = d.tap(KEY, 'unavailable', 'work');
  await tick();
  assert.equal(d.posts().length, 1, 'the second tap waits: only one request is in flight');
  d.release(0);
  await Promise.all([first, second]);
  assert.equal(d.posts().length, 2, 'then the latest intent is sent');
  assert.equal(d.posts()[1].response, 'unavailable');
  assert.ok(d.posts()[1].intentAt >= d.posts()[0].intentAt, 'stamped no earlier than the first');
  assert.deepEqual(d.pending(), {}, 'nothing left pending once the latest is confirmed');
});

test('CLIENT 2. a success for an OLDER intent does not clear a NEWER pending intent', async () => {
  const d = device({ script: ['hold', 'hold'] });
  const first = d.tap(KEY, 'available', '');
  await tick();
  const second = d.tap(KEY, 'maybe', '');
  await tick();
  const newer = d.pending()[SESSION];
  assert.equal(newer.response, 'maybe', 'the store holds the latest choice');
  d.release(0); await tick(); await tick();
  assert.deepEqual(d.pending()[SESSION], newer, 'the older success left the newer intent pending');
  assert.equal(d.posts().length, 2, 'and the newer intent has now been sent');
  d.release(1); await Promise.all([first, second]);
  assert.deepEqual(d.pending(), {}, 'confirmed by ITS OWN success');
});

test('CLIENT 3. the intent stamp: same-millisecond taps get increasing seq, and seq survives normalisation', async () => {
  const d = device();
  const RealDate = Date;
  const frozen = '2026-09-25T10:00:00.000Z';
  const e1 = d.mark(SESSION, 'available', '');
  assert.equal(e1.seq, 0);
  // Two intents inside one millisecond: only possible with a frozen clock.
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [frozen])); } static now() { return new RealDate(frozen).getTime(); } };
  try {
    const a = d.mark(SESSION, 'maybe', ''); const b = d.mark(SESSION, 'unavailable', '');
    assert.equal(a.at, frozen); assert.equal(b.at, frozen);
    assert.equal(b.seq, a.seq + 1, 'ordered within the millisecond');
  } finally { global.Date = RealDate; }
  const n = d.normalize({ [SESSION]: { response: 'unavailable', reason: '', at: frozen, owner: 'user_me', seq: 7 } });
  assert.equal(n[SESSION].seq, 7, 'seq is part of the persisted intent');
  assert.equal(d.normalize({ [SESSION]: { response: 'maybe', reason: '', at: frozen, owner: 'user_me' } })[SESSION].seq, 0, 'absent → 0');
});

test('CLIENT 4. the flush retries the HELD entry with its original stamp, and stops at the first unreachable answer', async () => {
  const d = device({ script: ['offline', 'ok'] });
  await d.tap(KEY, 'available', '');
  const held = d.pending()[SESSION];
  assert.ok(held, 'kept pending while offline');
  const sent = await d.flush();
  assert.equal(sent, 1);
  assert.equal(d.posts()[1].intentAt, held.at, 'the same intent, not a re-stamped copy');
  assert.equal(d.posts()[1].intentSeq, held.seq);
  assert.deepEqual(d.pending(), {});
});

test('SOURCE. the POST carries the intent, the server orders under the lock, the client keeps one worker per session', () => {
  assert.match(fn('saveAvailabilityResponseToServer'), /intentAt: entry\.at, intentSeq: Number\(entry\.seq\) \|\| 0/, 'the wire carries the stamp');
  assert.match(fn('saveAvailabilityResponseToServer'), /chains\[id\] = run\.catch/, 'one chain per session');
  assert.match(fn('availabilityFlushPending'), /saveAvailabilityResponseToServer\(sessionId, entry\.response, entry\.reason \|\| '', null, entry\)/, 'the flush passes the held entry');
  const server = fs.readFileSync(path.join(ROOT, 'api/availability.js'), 'utf8');
  assert.match(server, /withAvailabilityWriteLock\(writeTeamId, writeGroup, sessionId, async \(\) => \{/, 'the write runs under the lock');
  assert.match(server, /if \(intent && stored && intentOlderThan\(intent, stored\.stamp\)\) \{/, 'older intents are refused');
  assert.match(server, /if \(at > now \+ INTENT_CLOCK_SLACK_MS\) at = now;/, 'clock slack');
});

// ═══════════════════════════════════════════════════════════════════════════
// THE REAL APP — two U18 players, a coach on the board, Chromium
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
      if (rule.hold) await rule.hold;
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

test('browser: two U18 players tap at once, one rapid change, and an offline change — player, server and coach agree', async (t) => {
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
    await login(coach, 'coach.browser@ao.test');
    const add = await coach.evaluate(async gid => (await fetch('/api/publish?resource=training-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', group: gid, slot: { day: 'Tue', startTime: '19:00', venue: 'U18 pitch', active: true } }) })).status, c.U18.id);
    assert.equal(add, 200);
    await coach.evaluate(gid => { setOperationalGroup(gid); setSection('coach', 'message'); }, c.U18.id);
    await coach.waitForFunction(gid => state.activeCoachSection === 'message' && state.operationalGroupId === gid, c.U18.id, { timeout: 20000 });
    const EV = await coach.evaluate(() => coachAvailEvents().find(e => e.type === 'training')?.id);
    assert.ok(EV);
    const players = [];
    for (const email of ['ugo.browser@ao.test', 'dua.browser@ao.test']) {
      const ctx = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' }); ctxs.push(ctx);
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push('player: ' + e.message));
      await login(page, email);
      await page.evaluate(() => setSection('player', 'availability'));
      await waitFor(() => page.evaluate(() => typeof _playerAvailKnown !== 'undefined' && _playerAvailKnown && !!(_trainingSchedule && _trainingSchedule.slots)), 15000);
      players.push(page);
    }
    const row = (name) => coach.evaluate(([n, id]) => { const r = (sessionRows(id) || []).find(x => x.player?.name === n); return r ? r.status : 'ROW-MISSING'; }, [name, EV]);
    const settled = (page) => waitFor(() => page.evaluate(id => !(state.availabilityPending && state.availabilityPending[id]), EV), 10000);
    const tap = (page, status, reason = '') => page.evaluate(([id, st, rs]) => { setPlayerAvailability(sessionKey(id), st, rs); return true; }, [EV, status, reason]);
    const local = (page) => page.evaluate(id => getPlayer()[sessionKey(id)] || 'no-reply', EV);

    // 1. two players at the same instant, with the store's reads overlapping
    kvHooks.delayGetMs = 150;
    await Promise.all([tap(players[0], 'available'), tap(players[1], 'maybe')]);
    await settled(players[0]); await settled(players[1]);
    kvHooks.delayGetMs = 0;
    assert.equal((await stored(c, c.players[0].user.id, EV))?.response, 'available', 'server holds Ugo');
    assert.equal((await stored(c, c.players[1].user.id, EV))?.response, 'maybe', 'server holds Dua');
    const seen = await waitFor(async () => (await row('Ugo Uno')) === 'available' && (await row('Dua Dos')) === 'maybe', 15000);
    assert.ok(seen.ok, 'the coach board (5 s poll) shows BOTH answers');

    // 2. one player, rapid change, the FIRST request held so it lands last
    let release; const hold = new Promise(r => { release = r; });
    NET.rules.push({ method: 'POST', path: '/api/availability', bodyMatch: '"response":"unavailable"', hold, times: 1 });
    await tap(players[0], 'unavailable', 'work');
    await new Promise(r => setTimeout(r, 120));
    await tap(players[0], 'maybe');
    await new Promise(r => setTimeout(r, 400));
    release();
    await settled(players[0]);
    assert.equal(await local(players[0]), 'maybe', 'player sees the last tap');
    assert.equal((await stored(c, c.players[0].user.id, EV))?.response, 'maybe', 'server holds the last tap');
    const seen2 = await waitFor(async () => (await row('Ugo Uno')) === 'maybe', 15000);
    assert.ok(seen2.ok, 'coach shows the last tap');
    // Live Sync agrees too
    await coach.evaluate(() => availRefreshNow());
    assert.equal(await row('Ugo Uno'), 'maybe');

    // 3. offline for the first intent, changed before reconnecting
    NET.rules.push({ method: 'POST', path: '/api/availability', fail: 503, times: 1 });
    await tap(players[1], 'available');
    await waitFor(() => players[1].evaluate(id => !!(state.availabilityPending && state.availabilityPending[id]), EV), 5000);
    await tap(players[1], 'unavailable', 'injury');
    await settled(players[1]);
    assert.equal((await stored(c, c.players[1].user.id, EV))?.response, 'unavailable', 'the changed answer is what reached the server');
    await players[1].evaluate(() => window.dispatchEvent(new Event('online')));
    await new Promise(r => setTimeout(r, 300));
    assert.equal((await stored(c, c.players[1].user.id, EV))?.response, 'unavailable', 'reconnecting resurrects nothing older');
    const seen3 = await waitFor(async () => (await row('Dua Dos')) === 'unavailable', 15000);
    assert.ok(seen3.ok, 'coach shows Dua\'s last answer');
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    for (const ctx of ctxs) { try { await ctx.close(); } catch {} }
    await browser.close(); await new Promise(r => server.close(r));
  }
});
