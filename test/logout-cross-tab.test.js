/**
 * CD-110 LOOP 5 — CROSS-TAB LOGOUT COORDINATION
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
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { world, identity, store, PW } from './build134-fixture.js';

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
  async function request(body, { hold = false } = {}) {
    const r = { statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader(n, v) { this.headers[n] = v; }, end() { return this; } };
    const headers = { 'x-forwarded-for': '10.9.9.9', ...(jar.cookie ? { cookie: jar.cookie } : {}) };
    await identity({ method: 'POST', query: {}, headers, body }, r);     // the server answers now (what it did)…
    if (hold) await new Promise((resolve, reject) => held.push({ resolve, reject }));   // …the reply is in transit
    applySetCookie(r.headers['Set-Cookie']);                               // …and lands in the jar
    return { ok: r.statusCode < 400, status: r.statusCode, json: async () => r.body };
  }
  const release = (ok = true) => { const h = held.shift(); if (!h) throw new Error('nothing held'); ok ? h.resolve() : h.reject(new TypeError('Failed to fetch')); };
  const resolvesJar = async () => Boolean((await store.resolveSessionFromRequest({ headers: { cookie: jar.cookie } }).catch(() => null))?.user?.id);
  return { jar, storage, request, release, held, resolvesJar };
}

// ── a tab: the real client helpers over the shared browser ──────────────────
function tab(b, CFG = {}) {
  const body = `
    'use strict';
    const CFG = arguments[0], b = arguments[1];
    const localStorage = b.storage;
    let _logoutGen = 0, _authSessionId = '';
    let holdNext = false, offline = false;
    async function fetch(url, opts = {}) {
      if (offline) throw new TypeError('Failed to fetch');
      const h = holdNext; holdNext = false;
      return b.request(JSON.parse(opts.body || '{}'), { hold: h });
    }
    ${fn('logoutPending')}
    ${fn('logoutPendingSet')}
    ${fnOpt('logoutPendingAuthSessionId')}
    ${fnOpt('logoutGenRead')}
    ${fnOpt('logoutGenBump')}
    ${fn('deliverLogout')}
    return {
      // What loginIdentityAccount does after a 200: a NEW session — clear the owed logout, remember the session id.
      async login(email) {
        const res = await b.request({ action: 'login', email, password: ${JSON.stringify(PW)} });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'login failed');
        logoutPendingSet(false);
        _authSessionId = String(d.session && d.session.id || '');
        return d.session;
      },
      // What settingsSignOut does: capture the session being ended, forget it locally, then deliver.
      signOut({ hold = false } = {}) { const ending = _authSessionId; _authSessionId = ''; holdNext = hold; return deliverLogout(ending); },
      // What the boot / online retry does: deliver whatever the marker remembers.
      retry({ hold = false } = {}) { holdNext = hold; return deliverLogout(); },
      setOffline(v) { offline = v; },
      pending: () => logoutPending(),
      pendingFor: () => (typeof logoutPendingAuthSessionId === 'function' ? logoutPendingAuthSessionId() : 'not implemented'),
      gen: () => (typeof logoutGenRead === 'function' ? logoutGenRead() : _logoutGen),
      authSessionId: () => _authSessionId,
    };
  `;
  return new Function(body)(CFG, b);
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

test('X1 — tab A\'s stalled sign-out, released after tab B logged in, leaves B signed in', async () => {
  const w = await world(); const b = browser();
  const A = tab(b), B = tab(b);
  await A.login(w.owner.email);
  const out = A.signOut({ hold: true }); await settle();           // A's logout: server already destroyed A's session; reply in transit
  assert.equal(b.held.length, 1); assert.equal(A.pending(), true, 'baseline: the logout is owed while in flight');
  await B.login(w.owner.email);                                     // B logs in: the jar now holds B's cookie
  assert.equal(await b.resolvesJar(), true, 'baseline: B is signed in');
  assert.equal(B.pending(), false, 'B\'s login cleared the owed logout');
  b.release(); await out;                                           // A's reply lands
  assert.equal(await b.resolvesJar(), true, 'B\'s cookie still resolves: the stale reply did not clear it');
  assert.equal(A.pending(), false, 'and nothing re-armed the marker');
});

test('X2 — a stale tab that still believes in the OLD session signs out after another tab logged in: the newer session survives', async () => {
  const w = await world(); const b = browser();
  const A = tab(b), B = tab(b);
  const sa = await A.login(w.owner.email);
  assert.match(String(sa.id || ''), /^sess_/, 'the login answer names the session');
  const sb = await B.login(w.owner.email);                          // B logs in on this device: the jar now holds B's cookie
  assert.notEqual(sb.id, sa.id);
  // Tab A never processed B's login (no storage event reached it yet) and the person signs out THERE:
  // the request carries B's cookie but names A's session.
  const ok = await A.signOut();
  assert.equal(ok, true, 'the server answered');
  assert.equal(await b.resolvesJar(), true, 'B\'s session survives: the request named A, the cookie was B\'s, so nothing was ended');
  assert.equal(A.pending(), false, 'no marker is left armed against B');
  // The trade-off, stated: A's session is orphaned but alive (no browser holds its token any more; it expires with its
  // TTL). A deliberate sign-out from a stale tab therefore leaves the DEVICE signed in as the newer login — the
  // alternative (ending whatever the cookie names) is the cross-tab defect this change removes.
  assert.equal((await store.loadSessions()).some(s => s.id === sa.id), true, 'A\'s session record still exists, orphaned');
});

test('X3 — a reload while the logout is in flight: the new tab remembers WHICH session is owed and finishes it', async () => {
  const w = await world(); const b = browser();
  const A = tab(b);
  const sa = await A.login(w.owner.email);
  const out = A.signOut({ hold: true }); await settle();
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
  const late = A.signOut({ hold: true }); await settle();           // A's attempt is out…
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
  const outA = A.signOut({ hold: true }); await settle();           // A signs out (ending the first session, by id)
  const outB = B.signOut({ hold: true }); await settle();           // B signs out too (ending the second)
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

test('X7 — SOURCE: every path that receives a NEW session learns its id, so a later sign-out names the right one (claim and club creation included)', () => {
  // login and dev login adopt the payload (adoptIdentityPayload learns the id); the claim and the wizard do not call it, so they learn it themselves.
  assert.match(fn('adoptIdentityPayload'), /_authSessionId = String\(d\.session\.id\)/, 'adoptIdentityPayload');
  for (const f of ['acceptInvite', 'clubWizFinish']) {
    const body = fn(f);
    assert.match(body, /logoutPendingSet\(false\)/, `${f} clears the owed logout`);
    assert.match(body, /_authSessionId = String\(data\.session\?\.id \|\| ''\)/, `${f} learns the new session's id (a stale id would make Sign out name the wrong session and leave this one alive)`);
  }
  // clearDeviceState wipes the device but keeps the shared generation, so a tab with an older in-memory counter cannot mistake an old capture for current.
  assert.match(fn('clearDeviceState'), /k !== 'coach-eye-logout-gen'/, 'the wipe keeps the shared generation');
});
