/**
 * AVAILABILITY GROUP RESOLUTION — no successful save without a real group.
 *
 * Verified defect (Issue 2, proven against the real handler): a player save
 * resolved the group with `groupId || INITIAL_GROUP_ID`, and the club with a
 * fallback to the session's teamId. So when the player's group could not be
 * resolved — no playerGroupId in a multi-group club, an archived/unknown
 * group, staff without a player group — or the membership was no longer
 * active while the session lived on, the save answered 200 and landed in
 * `grp_initial`. The player's own read (same derivation) showed it saved; the
 * U18 coach board never saw it. A player who had answered under U18 before
 * left their OLD answer on the U18 board, contradicting the new one. A
 * storage failure inside the lookup escaped the handler unhandled.
 *
 * The contract pinned here:
 *   - a save needs the session's ACTIVE membership → else 403 no_membership;
 *   - the group is the membership's explicit group, or the club's single
 *     active group (legacy / pre-structure clubs) → else 409
 *     group_assignment_required; a refused save writes NOTHING, anywhere;
 *   - the player's self-read follows the same rules and answers the same
 *     refusals — never an empty successful read;
 *   - a storage failure in the lookup is a 503, nothing written;
 *   - a client-supplied group id is still ignored;
 *   - the client puts a refused answer back (tap) or drops it (retry), never
 *     keeps it queued or shows it as saved, and tells the player to ask their
 *     coach; transient 5xx keep their retry; a genuinely expired session keeps
 *     its own behaviour.
 *
 * Server proofs drive the REAL api/availability handler + identity store
 * against an in-memory Upstash stand-in, and check the store byte for byte.
 * Client proofs run the REAL save/flush/tap functions extracted from
 * index.html. Nothing touches a real service.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.group-resolution.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
let failInside = null;
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  if (failInside && new Error().stack.includes(failInside)) return { ok: false, status: 401, json: async () => ({ error: 'WRONGPASS invalid or missing auth token' }) };
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
async function call(method, query, body, token) {
  const r = res();
  await availability({ method, query: query || {}, headers: token ? { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } : {}, body: body || {} }, r);
  return r;
}

// ── A two-group club, seeded in the d1b shape (direct records) ──────────────
const CLUB = 'club-grp-res', SEN = 'grp_initial', U18 = 'grp-u18', WOM = 'grp-wom';
const SID = 'slot_tue-20261020';
const SAVE = { sessionId: SID, response: 'unavailable', intentAt: '2026-10-16T08:00:00.000Z', intentSeq: 0 };
async function seed(player, { groups = null, extraMembers = [] } = {}) {
  kv.clear(); failInside = null;
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Resolution Club' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-p', email: 'p@grp.test', displayName: 'Res Player' },
    { id: 'u-admin', email: 'a@grp.test', displayName: 'Res Admin' },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([{ id: 'pp-p', teamId: CLUB, userId: 'u-p', displayName: 'Res Player', legacyPlayerId: '' }]));
  kv.set('app:identity:team_members', JSON.stringify([
    ...(player ? [{ id: 'm-p', teamId: CLUB, userId: 'u-p', ...player }] : []),
    { id: 'm-admin', teamId: CLUB, userId: 'u-admin', role: 'admin', status: 'active' },
    ...extraMembers,
  ]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups: groups || [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'archived' },
  ], teams: [] }));
  const p = await store.createSession({ userId: 'u-p', teamId: CLUB, role: 'player' });
  const a = await store.createSession({ userId: 'u-admin', teamId: CLUB, role: 'admin' });
  return { p: p.token, admin: a.token };
}
const availKeys = () => [...kv.entries()].filter(([k]) => k.startsWith('app:availability:')).sort();
const groupKey = g => `app:availability:${CLUB}:group:${g}:${SID}`;
const boardFor = async (token, group) => (await call('GET', { resolveRoster: '1', group }, null, token)).body?.resolved?.['u-p']?.[SID]?.response;

// ─── SERVER ─────────────────────────────────────────────────────────────────

test('1: an active U18 player with an explicit group saves to U18 — and the U18 coach sees it', async () => {
  const t = await seed({ role: 'player', status: 'active', playerGroupId: U18 });
  const w = await call('POST', {}, SAVE, t.p);
  assert.equal(w.statusCode, 200, JSON.stringify(w.body));
  assert.equal(JSON.stringify(w.body).includes('"member"'), false, 'the session membership is never echoed');
  assert.ok(kv.has(groupKey(U18)), 'written under U18');
  assert.equal(kv.has(groupKey(SEN)), false, 'never under the initial group');
  assert.equal(await boardFor(t.admin, U18), 'unavailable', 'the U18 board shows it');
  const self = await call('GET', { myResponse: '1' }, null, t.p);
  assert.equal(self.statusCode, 200);
  assert.equal(self.body?.responses?.[SID]?.response, 'unavailable', 'the player reads back exactly what the coach sees');
  assert.equal([...kv.values()].some(v => String(v).includes('"member"')), false, 'the membership is never stored');
});

test('2: a live session with NO membership in the club → 403 no_membership, nothing written', async () => {
  const t = await seed(null);
  const before = availKeys();
  const w = await call('POST', {}, SAVE, t.p);
  assert.equal(w.statusCode, 403, JSON.stringify(w.body));
  assert.equal(w.body?.code, 'no_membership');
  assert.deepEqual(availKeys(), before, 'no availability record created or changed');
});

for (const status of ['removed', 'pending', 'archived']) {
  test(`3: a ${status} membership with a live session → 403 no_membership, nothing written`, async () => {
    const t = await seed({ role: 'player', status, playerGroupId: U18 });
    const before = availKeys();
    const w = await call('POST', {}, SAVE, t.p);
    assert.equal(w.statusCode, 403, JSON.stringify(w.body));
    assert.equal(w.body?.code, 'no_membership');
    assert.deepEqual(availKeys(), before, 'no write to U18, grp_initial or anywhere');
  });
}

for (const [label, player] of [
  ['no playerGroupId in a multi-group club', { role: 'player', status: 'active' }],
  ['an ARCHIVED group', { role: 'player', status: 'active', playerGroupId: WOM }],
  ['an UNKNOWN group id', { role: 'player', status: 'active', playerGroupId: 'grp-does-not-exist' }],
  ['staff with no player group (multi-group club)', { role: 'head_coach', status: 'active' }],
]) {
  test(`4: ${label} → 409 group_assignment_required, nothing written anywhere`, async () => {
    const t = await seed(player);
    const before = availKeys();
    const w = await call('POST', {}, SAVE, t.p);
    assert.equal(w.statusCode, 409, JSON.stringify(w.body));
    assert.equal(w.body?.code, 'group_assignment_required');
    assert.equal(w.body?.ok, false);
    assert.deepEqual(availKeys(), before, 'no record in grp_initial or any other group');
  });
}

test('5: a coach who also plays, with an explicit player group, saves to THAT group', async () => {
  const t = await seed({ role: 'head_coach', status: 'active', playerGroupId: U18 });
  const w = await call('POST', {}, SAVE, t.p);
  assert.equal(w.statusCode, 200, JSON.stringify(w.body));
  assert.ok(kv.has(groupKey(U18)));
  assert.equal(kv.has(groupKey(SEN)), false);
  assert.equal(await boardFor(t.admin, U18), 'unavailable');
});

for (const [label, player, code, status] of [
  ['an unresolvable group', { role: 'player', status: 'active' }, 'group_assignment_required', 409],
  ['an inactive membership', { role: 'player', status: 'removed', playerGroupId: U18 }, 'no_membership', 403],
]) {
  test(`6: the self-read with ${label} is a flagged refusal (${status}), never an empty successful read`, async () => {
    const t = await seed(player);
    const r = await call('GET', { myResponse: '1' }, null, t.p);
    assert.equal(r.statusCode, status, JSON.stringify(r.body));
    assert.equal(r.body?.code, code);
    assert.equal(r.body?.ok, false);
    assert.equal(r.body?.responses, undefined, 'no {} the client could reconcile against');
  });
}

for (const [label, method, query, body] of [['save', 'POST', {}, SAVE], ['self-read', 'GET', { myResponse: '1' }, null]]) {
  test(`7: a storage failure while resolving the group on the ${label} → 503, nothing written`, async () => {
    const t = await seed({ role: 'player', status: 'active', playerGroupId: U18 });
    const before = availKeys();
    failInside = 'playerGroupForIdentity';
    const r = await call(method, query, body, t.p);
    failInside = null;
    assert.equal(r.statusCode, 503, JSON.stringify(r.body));
    assert.equal(r.body?.ok, false);
    assert.equal(r.body?.error, 'Storage temporarily unavailable', 'the fixed, internals-free storage message');
    assert.deepEqual(availKeys(), before, 'nothing written');
  });
}

test('8: a player who answered under U18 and whose group then becomes unresolvable gets a 409 — no second, contradicting record', async () => {
  const t = await seed({ role: 'player', status: 'active' });
  const prior = JSON.stringify({ 'u-p': { userId: 'u-p', playerId: 'u-p', response: 'available', respondedAt: '2026-10-15T08:00:00Z' } });
  kv.set(groupKey(U18), prior);
  const before = availKeys();
  const w = await call('POST', {}, SAVE, t.p);
  assert.equal(w.statusCode, 409, JSON.stringify(w.body));
  assert.equal(w.body?.code, 'group_assignment_required');
  assert.deepEqual(availKeys(), before, 'the U18 record is byte-identical and no grp_initial record appeared');
  assert.equal(kv.get(groupKey(U18)), prior);
  assert.equal(kv.has(groupKey(SEN)), false);
});

test('9a: a genuine single-group club keeps its legacy behaviour — a member with no playerGroupId saves to the one group', async () => {
  const t = await seed({ role: 'player', status: 'active' }, { groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }] });
  const w = await call('POST', {}, SAVE, t.p);
  assert.equal(w.statusCode, 200, JSON.stringify(w.body));
  assert.ok(kv.has(groupKey(SEN)), 'the single group IS the canonical keyspace');
  assert.equal(await boardFor(t.admin, SEN), 'unavailable');
  const self = await call('GET', { myResponse: '1' }, null, t.p);
  assert.equal(self.body?.responses?.[SID]?.response, 'unavailable');
});

test('9b: a pre-structure club (no stored structure) resolves to its synthesised initial group', async () => {
  const t = await seed({ role: 'player', status: 'active' });
  kv.delete(`app:structure:${CLUB}`);
  const w = await call('POST', {}, SAVE, t.p);
  assert.equal(w.statusCode, 200, JSON.stringify(w.body));
  assert.ok(kv.has(groupKey(SEN)), 'grp_initial — the documented owner of pre-structure data');
  const self = await call('GET', { myResponse: '1' }, null, t.p);
  assert.equal(self.body?.responses?.[SID]?.response, 'unavailable');
  // The coach board of that club reads the SAME resolved group (no ?group=:
  // a one-group club defaults to its only group).
  const board = await call('GET', { resolveRoster: '1' }, null, t.admin);
  assert.equal(board.statusCode, 200, JSON.stringify(board.body));
  assert.equal(board.body?.resolved?.['u-p']?.[SID]?.response, 'unavailable', 'the coach sees what the player saved');
});

test('9c: a real club made by createClub + invite claim keeps working end to end', async () => {
  kv.clear(); failInside = null;
  const club = await store.createClub({ clubName: 'Legacy RFC', teamName: 'Seniors', sport: 'rugby', name: 'Legacy Coach', email: 'lc@grp.test', password: 'password123' });
  kv.set('ce:invites', JSON.stringify([{ token: 'TK00000001', email: 'lp@grp.test', name: 'Legacy Player', role: 'player', teamId: club.team.id, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  const player = await store.claimInvite({ position: '2 — Hooker', token: 'TK00000001', email: 'lp@grp.test', name: 'Legacy Player', password: 'password123' });
  const w = await call('POST', {}, SAVE, player.session.token);
  assert.equal(w.statusCode, 200, JSON.stringify(w.body));
  const board = await call('GET', { resolveRoster: '1' }, null, club.session.token);
  assert.equal(board.body?.resolved?.[String(player.user.id).toLowerCase()]?.[SID]?.response, 'unavailable');
});

test('10: a forged group in the body is still ignored — the server resolves the group', async () => {
  const t = await seed({ role: 'player', status: 'active', playerGroupId: U18 });
  const w = await call('POST', {}, { ...SAVE, group: SEN, groupId: SEN, playerGroupId: SEN, teamId: 'another-club' }, t.p);
  assert.equal(w.statusCode, 200);
  assert.ok(kv.has(groupKey(U18)), 'landed in the session-derived group');
  assert.equal(kv.has(groupKey(SEN)), false, 'the forged group was untouched');
  const unresolved = await seed({ role: 'player', status: 'active' });
  const w2 = await call('POST', {}, { ...SAVE, group: U18, groupId: U18, playerGroupId: U18 }, unresolved.p);
  assert.equal(w2.statusCode, 409, 'a forged group cannot rescue an unresolvable membership either');
  assert.equal(kv.has(groupKey(U18)), false);
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
const CSID = 'slot_tue-20261020';
const KEY = 'avail_' + CSID;
const SESSION_OBJ = { id: CSID, title: 'Training', date: '2026-10-20' };

function device({ script = ['ok'] } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const ME = CFG.me;
    const PLAYER = { id: ME, userId: ME, name: 'Me', lifecycleStatus: 'active', history: [] };
    let state = { players: [PLAYER], users: [], currentUserId: ME, messages: [], masterFeed: [], availabilityPending: {} };
    let _resolvedAvailability = {};
    let _availReasonOpenByKey = {};
    let _availAuthPromptedAt = 0;
    let toasts = [], posts = [], step = 0, authPrompts = 0, loginTabs = 0;
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
    function availDayLabel(){ return '20 Oct'; }
    function addMasterFeed(){}
    function upsertAvailabilityResponseMessage(){}
    function checkServerSession(){ authPrompts++; return Promise.resolve(); }
    function setAuthTab(){ loginTabs++; }
    const REASON_LABELS = { injury:'Injury', work:'Work', holiday:'Holiday', family:'Family', other:'Other' };
    ${decl(/const AVAIL_PENDING_MAX = \d+;[^\n]*/)}
    ${decl(/const AVAIL_RESPONSES = \[[^\]]*\];/)}
    const gates = [];
    function reply(mode) {
      if (mode === 'outage')     return { ok:false, status:503, json: async()=>({ ok:false, error:'Storage temporarily unavailable' }) };
      if (mode === 'expired')    return { ok:false, status:401, json: async()=>({ ok:false, code:'session_required' }) };
      if (mode === 'forbidden')  return { ok:false, status:403, json: async()=>({ ok:false }) };
      if (mode === 'nomember')   return { ok:false, status:403, json: async()=>({ ok:false, code:'no_membership', error:'Your account is not an active member of a club' }) };
      if (mode === 'unassigned') return { ok:false, status:409, json: async()=>({ ok:false, code:'group_assignment_required', error:'x' }) };
      return { ok:true, status:200, json: async()=>({ ok:true }) };
    }
    async function fetch(url, opts){
      posts.push(JSON.parse(opts.body));
      const mode = CFG.script[Math.min(step, CFG.script.length - 1)]; step++;
      // 'gate': the request stays in flight until the test releases it with an outcome.
      if (mode === 'gate') return new Promise((resolve, reject) => gates.push(m => m === 'offline' ? reject(new TypeError('Load failed')) : resolve(reply(m))));
      if (mode === 'offline')    throw new TypeError('Load failed');
      if (mode === 'outage')     return { ok:false, status:503, json: async()=>({ ok:false, error:'Storage temporarily unavailable' }) };
      if (mode === 'expired')    return { ok:false, status:401, json: async()=>({ ok:false, code:'session_required' }) };
      if (mode === 'forbidden')  return { ok:false, status:403, json: async()=>({ ok:false }) };
      if (mode === 'nomember')   return { ok:false, status:403, json: async()=>({ ok:false, code:'no_membership', error:'Your account is not an active member of a club' }) };
      if (mode === 'unassigned') return { ok:false, status:409, json: async()=>({ ok:false, code:'group_assignment_required', error:'x' }) };
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
    ${fn('availabilityForgetLocalAnswer')}
    ${fn('saveAvailabilityResponseToServer')}
    ${fn('availabilityFlushPending')}
    ${decl(/let _availFlushInFlight = false;/)}
    ${fn('setPlayerAvailability')}
    return {
      tap: setPlayerAvailability, flush: availabilityFlushPending,
      card: s => availabilityCardModel(PLAYER, s),
      held: () => state.availabilityPending[CFG.session] || null,
      toasts: () => toasts, posts: () => posts, authPrompts: () => authPrompts, loginTabs: () => loginTabs,
      localField: () => PLAYER[sessionKey(CFG.session)],
      inFlight: () => gates.length,
      release: mode => { const g = gates.shift(); if (!g) throw new Error('no request in flight'); g(mode); },
    };
  `;
  return new Function(body)({ script, me: ME, session: CSID });
}
const COACH_HINT = /coach/i;

for (const [mode, label] of [['unassigned', '409 group_assignment_required'], ['nomember', '403 no_membership']]) {
  test(`C1: a TAP refused with ${label} is put back, not queued, and the player is told to ask their coach`, async () => {
    const d = device({ script: [mode] });
    await d.tap(KEY, 'available', '');
    assert.equal(d.localField(), undefined, 'the refused answer is put back');
    assert.equal(d.held(), null, 'not queued — it can never succeed by retrying');
    assert.equal(d.card(SESSION_OBJ).pending, false, 'no "not sent" chip either: it was refused, not delayed');
    assert.ok(d.toasts().some(t => COACH_HINT.test(t)), 'guidance to contact the coach: ' + JSON.stringify(d.toasts()));
    assert.ok(!d.toasts().some(t => /session has expired/i.test(t)), 'never the expired-session message');
    assert.equal(d.authPrompts(), 0, 'no sign-out check');
    assert.equal(d.loginTabs(), 0, 'not sent to the login screen');
  });

  test(`C2: a RETRY refused with ${label} is dropped — never left queued, never left looking saved`, async () => {
    const d = device({ script: ['offline', mode] });
    await d.tap(KEY, 'available', '');
    assert.equal(d.held()?.status, 'failed', 'precondition: held after the network failure');
    await d.flush();
    assert.equal(d.posts().length, 2);
    assert.equal(d.held(), null, 'no longer queued');
    assert.equal(d.localField(), undefined, 'the unsaved answer is no longer shown as the player\'s answer');
    assert.equal(d.card(SESSION_OBJ).pending, false);
    assert.ok(d.toasts().some(t => COACH_HINT.test(t)), JSON.stringify(d.toasts()));
    assert.equal(d.authPrompts(), 0);
  });
}

const tick = () => new Promise(r => setTimeout(r, 5));
async function heldRetryThenNewerTap() {
  const d = device({ script: ['offline', 'gate', 'gate'] });
  await d.tap(KEY, 'available', '');                         // offline: held "not sent" (available)
  assert.equal(d.held()?.status, 'failed', 'precondition: the older answer is held');
  const retry = d.flush();                                   // the retry of "available" is now in flight
  await tick();
  assert.equal(d.inFlight(), 1, 'precondition: the retry request is out');
  const tap = d.tap(KEY, 'unavailable', '');                 // the player taps a NEWER answer meanwhile
  await tick();
  assert.equal(d.localField(), 'unavailable', 'precondition: the newer answer is on the card');
  return { d, retry, tap };
}

test('C7: retry refused, then the NEWER tap refused too — nothing looks saved, nothing stale comes back', async () => {
  const { d, retry, tap } = await heldRetryThenNewerTap();
  d.release('unassigned');                                    // the OLDER request is refused…
  await tick();
  assert.equal(d.localField(), 'unavailable', 'a late refusal of the older intent never touches the newer answer');
  assert.equal(d.held()?.response, 'unavailable', 'and never clears the newer intent from the queue');
  assert.equal(d.inFlight(), 1, 'the newer tap is now being sent');
  d.release('unassigned');                                    // …and so is the newer one
  await retry; await tap; await tick();
  assert.equal(d.localField(), undefined, 'no answer is shown — in particular not the older UNSENT "available"');
  assert.equal(d.held(), null, 'no refused intent is left queued');
  assert.equal(d.card(SESSION_OBJ).pending, false);
  assert.ok(d.toasts().some(t => COACH_HINT.test(t)), 'the player is told to ask their coach: ' + JSON.stringify(d.toasts()));
});

test('C8: retry refused, but the NEWER tap succeeds — the old refusal cannot erase the saved answer', async () => {
  const { d, retry, tap } = await heldRetryThenNewerTap();
  d.release('unassigned');                                    // the OLDER request is refused
  await tick();
  assert.equal(d.localField(), 'unavailable', 'the newer answer survives the older refusal');
  d.release('ok');                                            // the newer one is saved
  await retry; await tap; await tick();
  assert.equal(d.localField(), 'unavailable', 'the saved newer answer stands');
  assert.equal(d.held(), null, 'confirmed: nothing pending');
  assert.equal(d.card(SESSION_OBJ).pending, false);
  assert.ok(d.toasts().includes('Availability saved'), JSON.stringify(d.toasts()));
  assert.ok(!d.toasts().some(t => COACH_HINT.test(t)), 'no refusal message for an answer that was replaced and then saved');
});

test('C3: a transient 503 keeps its retry — held as "not sent", the answer stays', async () => {
  const d = device({ script: ['outage'] });
  await d.tap(KEY, 'available', '');
  assert.equal(d.localField(), 'available');
  assert.equal(d.held()?.status, 'failed');
  assert.equal(d.card(SESSION_OBJ).pending, true);
});

test('C4: a genuinely expired session (401) keeps its behaviour — put back, sign-in prompt', async () => {
  const d = device({ script: ['expired'] });
  await d.tap(KEY, 'available', '');
  assert.equal(d.localField(), undefined);
  assert.equal(d.held(), null);
  assert.equal(d.authPrompts(), 1);
  assert.ok(d.toasts().some(t => /session has expired/i.test(t)));
});

test('C5: any OTHER 403 keeps the existing refused-write behaviour', async () => {
  const d = device({ script: ['forbidden'] });
  await d.tap(KEY, 'available', '');
  assert.equal(d.localField(), undefined);
  assert.equal(d.held(), null);
  assert.equal(d.authPrompts(), 1, 'unchanged: the session is re-checked');
});

test('C6: a successful save is unchanged', async () => {
  const d = device({ script: ['ok'] });
  await d.tap(KEY, 'available', '');
  assert.equal(d.localField(), 'available');
  assert.equal(d.held(), null);
  assert.ok(d.toasts().includes('Availability saved'));
});

test('SOURCE: no player path falls back to the initial group any more', () => {
  const api = readFileSync(new URL('../api/availability.js', import.meta.url), 'utf8');
  assert.doesNotMatch(api, /groupId \|\| INITIAL_GROUP_ID/, 'the silent fallback is gone');
});

// ─── CLIENT: a staff preview's self-read refusal is not a board failure ────
// A staff account previewing a player renders the player views, so the app
// asks for "my" answers with the COACH's session. In a multi-group club a
// staff-only coach now gets 409 group_assignment_required for that self-read.
// The board and the self-read share one failure flag; the refusal raised it
// and the coach's board read "Sync failed" although its own read succeeded.

function fn2(name) {
  const m = html.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = m.index + 1;
  let i = html.indexOf('{', html.indexOf(')', start)), depth = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') depth++; else if (html[b] === '}') { depth--; if (depth === 0) { i = b; break; } } }
  return html.slice(start, i + 1);
}
function coachDevice({ member }) {
  return new Function(`"use strict";
    const CFG = arguments[0];
    const SEQ = { board: [], self: [] };
    function fetch(url) {
      const q = String(url).includes('resolveRoster=1') ? SEQ.board : SEQ.self;
      const r = q.shift() || { status: 200, body: String(url).includes('resolveRoster=1') ? { resolved: {} } : { responses: {} } };
      if (r.throws) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body });
    }
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = null;
    let _availLastSync = null, _availReadFailed = false, _availRosterLinkedAt = 0, _liveAvailabilityInFlight = null;
    let _playerAvailFetched = false, _playerAvailKnown = false, _availConfirmedAt = {};
    let _myMembership = CFG.member;
    const PREVIEWED = { id: 'u1', name: 'P1', userId: 'u1' };
    const state = { operationalGroupId: 'g1', players: [PREVIEWED, { id: 'u2', name: 'P2', userId: 'u2' }], availabilityPending: {} };
    const chip = { textContent: '', className: '' };
    const document = { getElementById: () => chip };
    function operationalGroups() { return [{ id: 'g1' }]; }
    function operationalPlayers() { return state.players; }
    async function ensureCoachRosterIdentityLinked() {}
    function saveState() {} function renderMessageCenter() {}
    function renderAudiencePicker() {} function renderPushStatusCard() {}
    function loadLiveSchedules() {} function loadLiveTemplates() {} function loadLiveLog() {}
    function renderPlayerAvailabilityV2() {} function renderPlayerHome() {}
    function setTimeout() { return 1; }
    function normalizeSessionId(id) { return String(id); }
    function getPlayer() { return PREVIEWED; }                       // the previewed player
    function findLiveAvailabilityRecords() { return []; }
    ${fn2('sessionKey')}
    ${fn2('membershipPlays')}
    ${fn2('normalizeAvailabilityPending')}
    ${fn2('availabilityPendingFor')}
    ${fn2('availabilitySessionIdForKey')}
    ${fn2('mergeServerAvailabilityIntoRecord')}
    ${fn2('reconcileServerAvailabilityIntoRecord')}
    ${fn2('liveAvailabilityPlayerKeys')}
    ${fn2('currentResolvedAvailability')}
    ${fn2('availabilitySetReadFailed')}
    ${fn2('availabilityLastReadFailed')}
    ${fn2('availabilityReadUnknown')}
    ${fn2('playerAvailabilityReadUnknown')}
    ${fn2('availabilityDropStaleLocalAnswers')}
    ${fn2('refreshLiveAvailability')}
    ${fn2('fetchMyAvailabilityFromServer')}
    return { SEQ, chip, board: o => refreshLiveAvailability(o), selfRead: () => { _playerAvailFetched = false; return fetchMyAvailabilityFromServer(); },
             failed: () => availabilityLastReadFailed(), resolved: () => _resolvedAvailability };
  `)({ member });
}

const STAFF_ONLY = { teamId: 'c1', userId: 'coach', role: 'head_coach', status: 'active' };
const GOOD_BOARD = { status: 200, body: { resolved: { u1: { [CSID]: { response: 'available', respondedAt: '2026-10-20T08:00:00Z' } } } } };
const REFUSED_SELF = { status: 409, body: { ok: false, code: 'group_assignment_required' } };

test('P1: a staff-only coach\'s preview self-read refused with 409 leaves the board healthy', async () => {
  const c = coachDevice({ member: STAFF_ONLY });
  c.SEQ.board.push(GOOD_BOARD);
  await c.board({ boardOnly: true }); await tick();
  assert.equal(c.failed(), false, 'precondition: the board read succeeded');
  c.SEQ.self.push(REFUSED_SELF);
  await c.selfRead(); await tick();
  assert.equal(c.failed(), false, 'the refusal is no fact about the board — "Sync failed" is not shown');
  assert.doesNotMatch(c.chip.textContent, /Sync failed/);
  assert.equal(c.resolved().u1?.[CSID]?.response, 'available', 'the board map is untouched');
});

test('P2: a genuine board-read failure still raises the flag for that coach', async () => {
  const c = coachDevice({ member: STAFF_ONLY });
  c.SEQ.board.push(GOOD_BOARD);
  await c.board({ boardOnly: true }); await tick();
  c.SEQ.board.push({ status: 500, body: { ok: false } });
  await c.board({ boardOnly: true }); await tick();
  assert.equal(c.failed(), true, 'a real board failure is still a failure');
  assert.match(c.chip.textContent, /Sync failed/);
});

test('P3: a PLAYER\'s refused self-read is still a failed read (their banner is not hidden)', async () => {
  const c = coachDevice({ member: { teamId: 'c1', userId: 'u1', role: 'player', status: 'active' } });
  c.SEQ.self.push(REFUSED_SELF);
  await c.selfRead(); await tick();
  assert.equal(c.failed(), true, 'the player\'s own read did fail — they see the could-not-load banner');
});

test('P4: a staff preview self-read that fails for any OTHER reason keeps today\'s behaviour', async () => {
  const c = coachDevice({ member: STAFF_ONLY });
  c.SEQ.self.push({ status: 503, body: { ok: false, error: 'Storage temporarily unavailable' } });
  await c.selfRead(); await tick();
  assert.equal(c.failed(), true, 'a transient failure is not hidden');
});
