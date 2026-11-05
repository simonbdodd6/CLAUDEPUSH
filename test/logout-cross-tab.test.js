/**
 * CD-110 LOOP 5 — CROSS-TAB LOGOUT COORDINATION
 * CD-111 CORRECTION — SESSION IDENTITY AFTER A CLUB SWITCH, AND A SAFE DELIBERATE SIGN-OUT
 *
 * Two tabs share one cookie jar and one localStorage. The CD-110 logout
 * marker was shared (localStorage) but its generation guard was a page-local
 * counter, and the server's logout reply cleared the cookie unconditionally.
 * Reproduced on the baseline with the REAL identity handler behind a jar that
 * applies Set-Cookie like a browser:
 *   - tab A's stalled sign-out, released after tab B logged in, cleared B's
 *     cookie (B signed out at its next check);
 *   - a stale tab acting on an old marker destroyed B's session outright.
 * Now the generation lives in storage (read at every decision, so another
 * tab's login is seen), the marker carries the id of the session being ended,
 * the request names it, and the server ends only that session — never the
 * cookie's newer one — and never clears the cookie.
 *
 * The independent review of that change found the other direction: a club
 * switch ENDS the session and starts another, so a tab that missed the switch
 * kept naming a session that no longer existed. A deliberate "Sign out" there
 * was answered `skipped: 'other-session'` (200), the client took that for
 * "signed out", cleared its marker, and the next reload signed the device back
 * in. The old X2 test pinned that outcome as an accepted trade-off. Corrected:
 *   A. the switch answer carries the new session's id (never the token); the
 *      switching tab adopts it; other tabs take it from storage, ordered by a
 *      sequence that only advances, so an older answer cannot replace a newer;
 *   B. (lineage) the SERVER records, on the session a switch creates, the ids of
 *      the sessions it replaced, so an id remembered from before a switch still
 *      names the same login and a logout naming it ends the cookie's session.
 *      A genuinely new login starts with no lineage, so a stale logout from an
 *      earlier login still cannot end it. The client sends ONE request, always
 *      naming the session it holds; it never falls back to a request that names
 *      nothing (the first correction's unnamed retry, now removed because it
 *      could end a login the request was never about).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { world, identity, store, kv, members, PW } from './build134-fixture.js';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) { if (src[i] === '(') paren++; else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } } }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } } }
  const isAsync = src.slice(Math.max(0, start - 6), start) === 'async ';
  return (isAsync ? 'async ' : '') + src.slice(start, end + 1);
}
const fnOpt = name => (src.includes(`function ${name}(`) ? fn(name) : '');
// The id-adoption block of adoptIdentityPayload, as the client runs it (the rest of that function needs the whole app).
const ADOPT_START = "if (typeof authSessionAdopt === 'function' && d?.session?.id) {";
const adoptBlock = (() => {
  const a = src.indexOf(ADOPT_START);
  // (Where the ordered adoption is absent, the harness still loads with the pre-correction line, so each test can fail on its own merits.)
  if (a < 0) return "if (d?.session?.id) _authSessionId = String(d.session.id);";
  return src.slice(a, src.indexOf('if (Array.isArray(d?.permissions))', a));
})();

// ── the browser: one cookie jar, one localStorage, shared by every tab ──────
function browser() {
  const jar = { cookie: '' };                                   // ce_session=<token> or ''
  const storage = Object.create(null);
  Object.defineProperties(storage, {
    getItem:    { value(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; } },
    setItem:    { value(k, v) { this[k] = String(v); } },
    removeItem: { value(k) { delete this[k]; } },
  });
  const applySetCookie = h => {                                 // what a browser does with the header
    const m = /ce_session=([^;]*)/.exec(String(h || '')); if (!m) return;
    if (/Max-Age=0/.test(h) || m[1] === '') jar.cookie = ''; else jar.cookie = `ce_session=${m[1]}`;
  };
  // The real handler, reached like a network request: the jar's cookie goes out, Set-Cookie comes back into the jar.
  const held = [];
  const log = [];                                               // every logout request the server saw: who it named, what it answered
  async function request(body, { hold = false, method = 'POST', query = {} } = {}) {
    const r = { statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader(n, v) { this.headers[n] = v; }, end() { return this; } };
    const headers = { 'x-forwarded-for': '10.9.9.9', ...(jar.cookie ? { cookie: jar.cookie } : {}) };
    await identity({ method, query, headers, body }, r);                     // the server answers now (what it did)…
    if (body && body.action === 'logout') log.push({ named: body.authSessionId ?? null, answer: r.body });
    if (hold) await new Promise((resolve, reject) => held.push({ resolve, reject }));   // …the reply is in transit
    applySetCookie(r.headers['Set-Cookie']);                               // …and lands in the jar
    return { ok: r.statusCode < 400, status: r.statusCode, json: async () => r.body };
  }
  const release = (ok = true) => { const h = held.shift(); if (!h) throw new Error('nothing held'); ok ? h.resolve() : h.reject(new TypeError('Failed to fetch')); };
  const resolvesJar = async () => Boolean((await store.resolveSessionFromRequest({ headers: { cookie: jar.cookie } }).catch(() => null))?.user?.id);
  return { jar, storage, request, release, held, log, resolvesJar };
}

// ── a tab: the real client helpers over the shared browser ──────────────────
function tab(b, CFG = {}) {
  const body = `
    'use strict';
    const CFG = arguments[0], b = arguments[1];
    const localStorage = b.storage;
    let _logoutGen = 0, _authSessionId = '', _authSessionSeq = 0, _serverAuthState = 'unknown';
    // What each fetch does, in order: 'ok' (default), 'hold' (the server acts, the reply is in transit), 'fail' (the network drops it first).
    let plan = [];
    async function fetch(url, opts = {}) {
      const step = plan.shift() || 'ok';
      if (step === 'fail') throw new TypeError('Failed to fetch');
      return b.request(JSON.parse(opts.body || '{}'), { hold: step === 'hold' });
    }
    ${fn('logoutPending')}
    ${fn('logoutPendingSet')}
    ${fnOpt('logoutPendingAuthSessionId')}
    ${fnOpt('logoutGenRead')}
    ${fnOpt('logoutGenBump')}
    ${fnOpt('authSessionStored')}
    ${fnOpt('authSessionSeqRead')}
    ${fnOpt('authSessionAdopt')}
    ${fnOpt('authSessionFromStorage')}
    ${fn('deliverLogout')}
    function adoptSessionId(d, opts) { ${adoptBlock} }
    return {
      // What loginIdentityAccount does after a 200: a NEW session — clear the owed logout, adopt the payload (which learns the id).
      async login(email) {
        const res = await b.request({ action: 'login', email, password: ${JSON.stringify(PW)} });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'login failed');
        _serverAuthState = 'authed';
        logoutPendingSet(false);
        adoptSessionId(d);
        return d.session;
      },
      // What checkServerSession does with a 200: remember the sequence it asked under, adopt the answer under it.
      async restore({ hold = false } = {}) {
        const authSeq = authSessionSeqRead();
        const res = await b.request(null, { method: 'GET', query: { action: 'session' }, hold });
        if (!res.ok) { _serverAuthState = 'anon'; return null; }
        const d = await res.json();
        _serverAuthState = 'authed';
        adoptSessionId(d, { authSeq });
        return d.session;
      },
      // What switchTeamTo does with the switch answer: the cookie it carries is the new session's, so learn its id.
      async switchClub(teamId) {
        const res = await b.request({ action: 'switch_team', teamId });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'switch failed');
        if (d.sessionId && typeof authSessionAdopt === 'function') authSessionAdopt(d.sessionId);
        return d;
      },
      // What settingsSignOut does: capture the session being ended, forget it locally, then deliver (a deliberate sign-out).
      signOut() { const ending = _authSessionId; _authSessionId = ''; _serverAuthState = 'anon'; return deliverLogout(ending); },
      // What the boot / online retry does: deliver whatever the marker remembers.
      retry() { return logoutPending() ? deliverLogout() : Promise.resolve(true); },   // the callers (boot, reconnect) only deliver what is owed
      // The storage event another tab's write raises here (the latest value, or one handed in).
      receive(newValue) { return authSessionFromStorage({ key: 'coach-eye-auth-session', newValue: newValue === undefined ? b.storage.getItem('coach-eye-auth-session') : newValue }); },
      plan(steps) { plan = [...steps]; },
      pending: () => logoutPending(),
      pendingFor: () => (typeof logoutPendingAuthSessionId === 'function' ? logoutPendingAuthSessionId() : 'not implemented'),
      gen: () => (typeof logoutGenRead === 'function' ? logoutGenRead() : _logoutGen),
      authSessionId: () => _authSessionId,
      seq: () => _authSessionSeq,
    };
  `;
  return new Function(body)(CFG, b);
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
const sessionOf = async id => (await store.loadSessions()).find(s => s.id === id) || null;
/** The same person is a member of Club B too: the club switcher has somewhere to go. */
function joinClubB(w) {
  const list = members();
  list.push({ id: 'tm_cd111_b', teamId: w.b, userId: w.owner.user.id, role: 'coach', staffLevel: 'head', status: 'active', joinedAt: new Date().toISOString() });
  kv.set('app:identity:team_members', JSON.stringify(list));
}

// ─────────────────────────────────────────────────────────────────────────────
// CD-110 Loop 5: stale REPLIES and stale RETRIES stay inert (unchanged behaviour)
// ─────────────────────────────────────────────────────────────────────────────
test('X1 — tab A\'s stalled sign-out, released after tab B logged in, leaves B signed in', async () => {
  const w = await world(); const b = browser();
  const A = tab(b), B = tab(b);
  await A.login(w.owner.email);
  A.plan(['hold']);
  const out = A.signOut(); await settle();                          // A's logout: server already destroyed A's session; reply in transit
  assert.equal(b.held.length, 1); assert.equal(A.pending(), true, 'baseline: the logout is owed while in flight');
  await B.login(w.owner.email);                                     // B logs in: the jar now holds B's cookie
  assert.equal(await b.resolvesJar(), true, 'baseline: B is signed in');
  assert.equal(B.pending(), false, 'B\'s login cleared the owed logout');
  b.release(); await out;                                           // A's reply lands
  assert.equal(await b.resolvesJar(), true, 'B\'s cookie still resolves: the stale reply did not clear it');
  assert.equal(A.pending(), false, 'and nothing re-armed the marker');
  assert.equal(b.log.length, 1, 'one request: a confirmed logout is not repeated');
});

// ─────────────────────────────────────────────────────────────────────────────
// CD-111 correction B (lineage): a sign-out from a tab holding an OLD id of the SAME login
// (replaces the old X2, which pinned "the device stays signed in" as accepted)
// ─────────────────────────────────────────────────────────────────────────────
const everyRequestNamed = b => assert.ok(b.log.every(l => typeof l.named === 'string' && l.named.length > 0), 'no request ever named nothing');

test('X2 — a tab that missed a club switch signs out: ONE request, naming the id it holds, and the server ends the login\'s current session through the lineage', async () => {
  const w = await world(); const b = browser(); joinClubB(w);
  const A = tab(b), B = tab(b);
  const s1 = await A.login(w.owner.email); await B.restore();
  const sw = await A.switchClub(w.b);                                // tab B never hears (no storage event delivered)
  assert.equal(B.authSessionId(), s1.id, 'baseline: tab B still holds the replaced session\'s id');
  const ok = await B.signOut();
  assert.equal(ok, true, 'confirmed by the server');
  assert.equal(await b.resolvesJar(), false, 'the device is signed out (the blocker: it used to survive, and the next reload signed the device back in)');
  assert.equal(B.pending(), false, 'nothing left owed');
  assert.equal(b.log.length, 1, 'exactly ONE logout request');
  assert.equal(b.log[0].named, s1.id); assert.equal(b.log[0].answer.ended, true, 'ended, not skipped: the id is in the cookie\'s lineage');
  assert.equal((await sessionOf(sw.sessionId)), null, 'the current session record is gone');
  everyRequestNamed(b);
});

test('X2b — sign-out is not reported successful, and the marker is not cleared, until the reply confirms', async () => {
  const w = await world(); const b = browser(); joinClubB(w);
  const A = tab(b), B = tab(b);
  const s1 = await A.login(w.owner.email); await B.restore(); await A.switchClub(w.b);
  B.plan(['hold']);                                                  // the server answers; the reply is in transit
  let settled = null;
  const out = B.signOut().then(v => { settled = v; return v; });
  await settle();
  assert.equal(b.held.length, 1); assert.equal(settled, null, 'no result is reported while the reply has not arrived');
  assert.equal(B.pending(), true, 'the logout is still owed'); assert.equal(B.pendingFor(), s1.id, 'naming the session it is for');
  b.release(); assert.equal(await out, true);
  assert.equal(B.pending(), false, 'cleared only now, on the server\'s answer');
});

test('X2c — a request that cannot be confirmed leaves the marker armed, naming the session; nothing else is sent', async () => {
  const w = await world(); const b = browser(); joinClubB(w);
  const A = tab(b), B = tab(b);
  const s1 = await A.login(w.owner.email); await B.restore(); await A.switchClub(w.b);
  B.plan(['fail']);
  assert.equal(await B.signOut(), false, 'not confirmed, so not reported as done');
  assert.equal(B.pending(), true); assert.equal(B.pendingFor(), s1.id);
  assert.equal(await b.resolvesJar(), true, 'honestly: the server session is still alive, because the logout never arrived');
  assert.equal(b.log.length, 0, 'nothing reached the server, and nothing else was tried');
});

test('X2d — a tab left over from an EARLIER LOGIN cannot end a LATER login (the lineage boundary): nothing is ended, nothing is owed, no second request', async () => {
  const w = await world(); const b = browser();
  const A = tab(b), B = tab(b);
  const sa = await A.login(w.owner.email);
  const sb = await B.login(w.owner.email);                           // a new login: the jar holds it; tab A has not heard
  assert.equal(A.authSessionId(), sa.id);
  const ok = await A.signOut();
  assert.equal(ok, true, 'the owed logout is resolved: it was about a login that is not the cookie\'s');
  assert.equal(await b.resolvesJar(), true, 'the later login is alive: a stale logout from an earlier login must never end it');
  assert.ok(await sessionOf(sb.id));
  assert.equal(b.log.length, 1, 'ONE request, and no unnamed fallback'); assert.equal(b.log[0].named, sa.id); assert.equal(b.log[0].answer.skipped, 'other-session'); assert.equal(b.log[0].answer.ended, false);
  assert.equal(A.pending(), false, 'and the marker is not left armed (it would block the next boot\'s session read for ever)');
  everyRequestNamed(b);
});

test('X3 — a reload while the logout is in flight: the new tab remembers WHICH session is owed and finishes it', async () => {
  const w = await world(); const b = browser();
  const A = tab(b);
  const sa = await A.login(w.owner.email);
  A.plan(['hold']);
  const out = A.signOut(); await settle();
  const C = tab(b);                                                 // the reloaded page: fresh memory, same storage
  assert.equal(C.pending(), true, 'the boot sees the owed logout');
  assert.equal(C.pendingFor(), sa.id, 'and which session it is for');
  const ok = await C.retry(); assert.equal(ok, true);
  assert.equal(await b.resolvesJar(), false, 'A\'s session is gone');
  b.release(); await out;
  assert.equal(C.pending(), false); assert.equal(A.pending(), false);
});

test('X4 — offline sign-out, then a login: the owed logout is cleared for EVERY tab, and a late failure elsewhere cannot re-arm it', async () => {
  const w = await world(); const b = browser();
  const A = tab(b), B = tab(b);
  await A.login(w.owner.email);
  A.plan(['hold']);
  const late = A.signOut(); await settle();                         // A's attempt is out…
  const genBefore = B.gen();
  await B.login(w.owner.email);                                     // …B logs in meanwhile
  assert.ok(B.gen() > genBefore, 'the login advanced the SHARED generation');
  assert.equal(A.gen(), B.gen(), 'tab A sees the same generation without any message passing');
  b.release(false); await late;                                     // A's attempt fails late (network)
  assert.equal(A.pending(), false, 'the late failure does not re-arm the marker: B\'s session is not owed a logout');
  assert.equal(await b.resolvesJar(), true, 'B stays signed in');
});

test('X5 — two tabs log in and out concurrently: generations only advance, markers end clear, the last login stands', async () => {
  const w = await world(); const b = browser();
  const A = tab(b), B = tab(b);
  await A.login(w.owner.email); const g1 = A.gen();
  await B.login(w.owner.email); const g2 = B.gen(); assert.ok(g2 > g1);
  A.plan(['hold']); const outA = A.signOut(); await settle();       // A signs out (ending the first session, by id)
  B.plan(['hold']); const outB = B.signOut(); await settle();       // B signs out too (ending the second)
  assert.equal(A.pending(), true);
  const sc = await A.login(w.owner.email);                          // a third login in tab A
  assert.equal(A.pending(), false); assert.ok(A.gen() > g2);
  b.release(); b.release(); await outA; await outB;                 // both stale replies land
  assert.equal(await b.resolvesJar(), true, 'the newest session stands');
  assert.equal(A.pending(), false); assert.equal(B.pending(), false);
  assert.equal(A.authSessionId(), sc.id);
});

test('X6 — backwards compatibility: a CD-110 marker ("1", no session id) still ends the cookie\'s session at the next boot', async () => {
  const w = await world(); const b = browser();
  const A = tab(b);
  await A.login(w.owner.email);
  b.storage.setItem('coach-eye-logout-pending', '1');               // left by the previous build
  const ok = await A.retry();
  assert.equal(ok, true);
  assert.equal(await b.resolvesJar(), false, 'the cookie\'s session is ended as before');
  assert.equal(A.pending(), false, 'and the marker is cleared');
});

test('X6b — OFFLINE: a sign-out that could not reach the server is finished at the next boot even though a club switch replaced the session meanwhile (the marker\'s old id is in the lineage)', async () => {
  const w = await world(); const b = browser(); joinClubB(w);
  const A = tab(b), B = tab(b);
  const sa = await A.login(w.owner.email);
  A.plan(['fail']);                                                  // the sign-out cannot reach the server: owed, naming A's session
  assert.equal(await A.signOut(), false);
  assert.equal(A.pendingFor(), sa.id);
  const rotated = await B.switchClub(w.b);                           // the session is replaced (a club switch) without any login clearing the marker
  assert.notEqual(rotated.sessionId, sa.id);
  assert.equal(await b.resolvesJar(), true, 'baseline: the replacement is alive');
  const ok = await A.retry();                                        // boot / reconnect: names the OLD session, as the marker says
  assert.equal(ok, true);
  assert.equal(await b.resolvesJar(), false, 'the device ends signed out: the old id is in the replacement\'s lineage');
  assert.equal(b.log.length, 1); assert.equal(b.log[0].named, sa.id); assert.equal(b.log[0].answer.ended, true);
  assert.equal(A.pending(), false);
  everyRequestNamed(b);
});

test('X6c — OFFLINE then a NEW LOGIN: the remembered logout is cleared by the login and can never end it', async () => {
  const w = await world(); const b = browser();
  const A = tab(b), B = tab(b);
  await A.login(w.owner.email);
  A.plan(['fail']); assert.equal(await A.signOut(), false); assert.equal(A.pending(), true);
  const sb = await B.login(w.owner.email);
  assert.equal(A.pending(), false, 'the login cleared the marker for every tab');
  assert.equal(await A.retry(), true, 'a boot with nothing owed sends nothing');
  assert.equal(b.log.length, 0); assert.equal(await b.resolvesJar(), true); assert.ok(await sessionOf(sb.id));
});

test('X8 — a login lands while a sign-out is in flight: the new login survives, the old marker is not re-armed, and no second request is ever sent', async () => {
  const w = await world(); const b = browser(); joinClubB(w);
  const A = tab(b), B = tab(b);
  const sa = await A.login(w.owner.email);
  await B.switchClub(w.b);                                           // tab A is behind (holds the replaced id)
  A.plan(['hold']);                                                  // the server answers (through the lineage); the reply is in transit
  const out = A.signOut(); await settle();
  assert.equal(b.log.length, 1); assert.equal(b.log[0].answer.ended, true);
  const sc = await B.login(w.owner.email);                           // a NEW login lands before the reply does
  b.release(); const ok = await out;
  assert.equal(ok, true);
  assert.equal(b.log.length, 1, 'no second request: the lineage made one unnecessary, and nothing may end the new login');
  assert.equal(await b.resolvesJar(), true, 'the new login is alive'); assert.ok(await sessionOf(sc.id));
  assert.equal(A.pending(), false, 'and no logout is owed against it');
  everyRequestNamed(b);
});

test('X8b — the same race when the first answer is "other-session": still one request, still nothing ended', async () => {
  const w = await world(); const b = browser();
  const A = tab(b), B = tab(b);
  const sa = await A.login(w.owner.email); const sb = await B.login(w.owner.email);   // A holds an earlier login\'s id
  A.plan(['hold']);
  const out = A.signOut(); await settle();
  assert.equal(b.log[0].answer.skipped, 'other-session');
  const sc = await B.login(w.owner.email);                           // yet another login lands
  b.release(); assert.equal(await out, true);
  assert.equal(b.log.length, 1);
  assert.equal(await b.resolvesJar(), true); assert.ok(await sessionOf(sb.id)); assert.ok(await sessionOf(sc.id));
  assert.equal(A.pending(), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// CD-111 correction A: the session id follows a club switch, in every tab, in order
// ─────────────────────────────────────────────────────────────────────────────
test('X9 — tab A switches clubs; the answer carries the new session id (never the token); tab B takes it from storage and its sign-out then names the live session', async () => {
  const w = await world(); const b = browser(); joinClubB(w);
  const A = tab(b), B = tab(b);
  const s1 = await A.login(w.owner.email);
  const r = await B.restore();                                       // tab B opened on the same cookie: learns the id from the session read
  assert.equal(r.id, s1.id); assert.equal(B.authSessionId(), s1.id);
  const sw = await A.switchClub(w.b);                                // tab A switches club
  assert.match(sw.sessionId, /^sess_/); assert.notEqual(sw.sessionId, s1.id);
  assert.equal(A.authSessionId(), sw.sessionId, 'the switching tab adopts the new id from the answer itself');
  assert.equal(Object.keys(sw).includes('token'), false, 'the answer has no token field');
  assert.equal(JSON.stringify(sw).includes(b.jar.cookie.split('=')[1]), false, 'and the cookie\'s token appears nowhere in the body');
  assert.equal(B.authSessionId(), s1.id, 'baseline: tab B has not heard yet');
  assert.equal(B.receive(), true, 'the storage event reaches tab B');
  assert.equal(B.authSessionId(), sw.sessionId, 'tab B now holds the live session\'s id');
  const ok = await B.signOut();
  assert.equal(ok, true);
  assert.equal(b.log.length, 1, 'one request: it named the live session, so no retry was needed');
  assert.equal(b.log[0].named, sw.sessionId); assert.equal(b.log[0].answer.ended, true);
  assert.equal(await b.resolvesJar(), false, 'the device is signed out');
});

test('X10 — an older answer can never replace a newer session id: in the same tab, across tabs, and in a tab that holds no session', async () => {
  const w = await world(); const b = browser(); joinClubB(w);
  const A = tab(b), B = tab(b);
  const s1 = await A.login(w.owner.email);
  // (a) a session READ issued before the switch lands after it, in the SAME tab.
  const read = A.restore({ hold: true }); await settle();           // the server answered with the OLD session; the reply is in transit
  const sw = await A.switchClub(w.b);
  assert.equal(A.authSessionId(), sw.sessionId);
  b.release(); await read;
  assert.equal(A.authSessionId(), sw.sessionId, 'the stale read (which still describes the ended session) did not overwrite the new id');
  // (b) another tab's OLDER write arrives after a newer one was adopted.
  await B.restore();                                                 // B adopts the cookie's session (the new one)
  const seqBefore = B.seq();
  assert.equal(B.receive(JSON.stringify({ id: s1.id, seq: seqBefore - 1 })), false, 'a lower sequence is ignored');
  assert.equal(B.receive(JSON.stringify({ id: s1.id, seq: seqBefore })), false, 'an equal sequence is ignored');
  assert.equal(B.authSessionId(), sw.sessionId);
  assert.equal(B.receive(JSON.stringify({ id: 'sess_newer', seq: seqBefore + 1 })), true, 'a higher sequence is taken');
  // (c) a tab that holds no session takes nothing from storage.
  const C = tab(b);
  assert.equal(C.receive(), false); assert.equal(C.authSessionId(), '');
  // (d) the sequence only moves forward.
  assert.ok(A.seq() >= 2); const q = A.seq(); await A.switchClub(w.a); assert.ok(A.seq() > q);
});

test('X11 — a tab that was away through SEVERAL switches (and missed every storage event) still signs out the login: one request, through the lineage', async () => {
  const w = await world(); const b = browser(); joinClubB(w);
  const A = tab(b), B = tab(b);
  const s1 = await A.login(w.owner.email); await B.restore();
  let last; for (const t of [w.b, w.a, w.b, w.a]) last = await A.switchClub(t);   // B hears none of them
  assert.equal(B.authSessionId(), s1.id);
  assert.equal(await B.signOut(), true);
  assert.equal(await b.resolvesJar(), false);
  assert.equal(b.log.length, 1); assert.equal(b.log[0].named, s1.id); assert.equal(b.log[0].answer.ended, true);
  assert.equal(await sessionOf(last.sessionId), null);
  everyRequestNamed(b);
});

test('X12 — SOURCE: every path that receives a NEW session learns its id through the ordered adoption (claim and club creation included)', () => {
  assert.ok(src.includes(ADOPT_START), 'adoptIdentityPayload adopts the session id through authSessionAdopt');
  // login and dev login adopt the payload (adoptIdentityPayload learns the id); the claim and the wizard do not call it, so they learn it themselves.
  const adopt = fn('adoptIdentityPayload');
  assert.match(adopt, /authSessionAdopt\(d\.session\.id\)/, 'adoptIdentityPayload');
  assert.match(adopt, /superseded/, 'a read made before another adoption is not allowed to replace the id');
  for (const f of ['acceptInvite', 'clubWizFinish']) {
    const body = fn(f);
    assert.match(body, /logoutPendingSet\(false\)/, `${f} clears the owed logout`);
    assert.match(body, /authSessionAdopt\(data\.session\?\.id \|\| ''\)/, `${f} learns the new session's id (a stale id would make Sign out name the wrong session)`);
  }
  // the switch adopts the id from its own answer, before the club transition runs
  const sw = fn('switchTeamTo');
  assert.match(sw, /authSessionAdopt\(data\.sessionId\)/, 'switchTeamTo adopts the id the switch answer carries');
  assert.ok(sw.indexOf('authSessionAdopt(data.sessionId)') < sw.indexOf('resetClubScopedState()'), 'and does so first');
  // the session read says which sequence it asked under
  const chk = fn('checkServerSession');
  assert.match(chk, /authSessionSeqRead\(\)/); assert.match(chk, /adoptIdentityPayload\(d, \{ authSeq \}\)/);
  assert.ok(chk.indexOf('authSessionSeqRead()') < chk.indexOf("fetch('/api/identity?action=session'"), 'the sequence is captured BEFORE the request leaves');
  // the storage event reaches the id adoption
  assert.match(src, /try \{ authSessionFromStorage\(event\); \} catch \{\}/, 'the storage listener passes events to authSessionFromStorage');
  // clearDeviceState wipes the device but keeps the shared generation AND the shared sequence
  const cds = fn('clearDeviceState');
  assert.match(cds, /k !== 'coach-eye-logout-gen' && k !== 'coach-eye-auth-session'/, 'the wipe keeps both shared counters');
  assert.match(cds, /authSessionAdopt\(''\)/, 'and moves the sequence forward past the wipe');
});

test('X13 — SOURCE: deliverLogout sends ONE request, always naming the session it holds; there is no unnamed fallback and no "deliberate" mode', () => {
  const d = fn('deliverLogout');
  assert.equal((d.match(/fetch\(/g) || []).length, 1, 'one fetch call');
  assert.match(d, /\.\.\.\(sid \? \{ authSessionId: sid \} : \{\}\)/, 'the name is sent whenever there is one');
  assert.doesNotMatch(d, /deliberate/, 'no deliberate mode');
  assert.doesNotMatch(d, /\b(while|for)\s*\(/, 'no loop');
  for (const m of src.matchAll(/deliverLogout\(([^)]*)\)/g)) assert.doesNotMatch(m[1], /deliberate|\{/, `no call passes options: deliverLogout(${m[1]})`);
  assert.match(fn('checkServerSession'), /await deliverLogout\(\)/, 'the boot retry delivers what the marker remembers');
  assert.match(src, /logoutPending\(\) && typeof deliverLogout === 'function'\) deliverLogout\(\)\.catch/, 'and so does the reconnect retry');
  const cds = fn('clearDeviceState');
  assert.match(cds, /logoutPendingSet\(true, endingSession\)/, 'clear-device re-arms the marker with the session it was ending');
});

// ─────────────────────────────────────────────────────────────────────────────
// The response-shape table, executable: the REAL deliverLogout against a stubbed fetch.
// ─────────────────────────────────────────────────────────────────────────────
function stubbed(answers) {
  const store_ = Object.create(null);
  Object.defineProperties(store_, {
    getItem: { value(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; } },
    setItem: { value(k, v) { this[k] = String(v); } },
    removeItem: { value(k) { delete this[k]; } },
  });
  const calls = [];
  const body = `
    'use strict';
    const localStorage = arguments[0], answers = arguments[1], calls = arguments[2];
    let _logoutGen = 0, _authSessionId = '';
    async function fetch(url, opts) {
      calls.push(JSON.parse(opts.body));
      const a = answers.shift();
      if (a === 'throw') throw new TypeError('Failed to fetch');
      return a;
    }
    ${fn('logoutPending')} ${fn('logoutPendingSet')} ${fnOpt('logoutPendingAuthSessionId')} ${fnOpt('logoutGenRead')} ${fnOpt('logoutGenBump')} ${fn('deliverLogout')}
    return { deliver: sid => deliverLogout(sid), pending: () => logoutPending(), pendingFor: () => logoutPendingAuthSessionId() };
  `;
  return { api: new Function(body)(store_, answers, calls), calls };
}
const json = (d, ok = true, status = 200) => ({ ok, status, json: async () => d });
const badJson = { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };

test('X14 — the response-shape table: what each answer to the ONE logout request means, and what is left owed', async () => {
  // [label, the answer, expected result, marker armed after]
  const rows = [
    ['network failure',                              'throw',                                                           false, true],
    ['HTTP 503',                                     json({ ok: false }, false, 503),                                   false, true],
    ['HTTP 401',                                     json({ ok: false }, false, 401),                                   false, true],
    ['200 with an unparsable body (not the server)', badJson,                                                           false, true],
    ['200 with ok:false',                            json({ ok: false }),                                               false, true],
    ['200 ended:false and no reason',                json({ ok: true, ended: false }),                                  false, true],
    ['200 with an unknown reason',                   json({ ok: true, ended: false, skipped: 'something-new' }),        false, true],
    ['ended:true',                                   json({ ok: true, ended: true }),                                   true,  false],
    ['skipped:no-session (a dead cookie)',           json({ ok: true, ended: false, skipped: 'no-session' }),           true,  false],
    ['legacy { ok: true } (pre-CD-111 server)',      json({ ok: true }),                                                true,  false],
    ['skipped:other-session (another login: nothing of ours to end)', json({ ok: true, ended: false, skipped: 'other-session' }), true, false],
  ];
  for (const [label, answer, expected, armed] of rows) {
    const { api, calls } = stubbed([answer]);
    const got = await api.deliver('sess_old');
    assert.equal(got, expected, `${label}: result`);
    assert.equal(calls.length, 1, `${label}: exactly one request`);
    assert.equal(calls[0].authSessionId, 'sess_old', `${label}: and it names the session`);
    assert.equal(api.pending(), armed, `${label}: marker armed`);
    if (armed) assert.equal(api.pendingFor(), 'sess_old', `${label}: the marker still names the session`);
  }
  // a device that holds no id sends the legacy request (no name): the only unnamed request there is
  const { api, calls } = stubbed([json({ ok: true, ended: true })]);
  await api.deliver('');
  assert.equal('authSessionId' in calls[0], false, 'no id held, no name sent (a CD-110 marker, or before the first session read)');
});
