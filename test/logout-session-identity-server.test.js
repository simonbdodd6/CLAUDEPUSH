/**
 * CD-110 LOOP 5 — A LOGOUT ENDS THE SESSION IT NAMES, AND ONLY THAT ONE
 *
 * The logout action destroyed whatever session the request's cookie named and
 * answered with `Set-Cookie: ce_session=; Max-Age=0` unconditionally. Two
 * consequences, both reproduced on the CD-110 baseline:
 *   1. A logout reply that lands AFTER a new login (a stalled sign-out, a
 *      remembered-logout retry at boot or on reconnect) made the browser apply
 *      that cookie clear to the NEW session's cookie: the person who had just
 *      logged in was signed out again at their next session check.
 *   2. A logout request dispatched after a new login carried the new cookie
 *      and destroyed the new session outright.
 * Now the server never clears the cookie on logout (destroying the session
 * record is what ends it; a dead token in the jar is refused like an expired
 * one), the client names the session it is ending (`authSessionId`, learned
 * from the login/claim/create and session payloads — the id, never the token),
 * and the server ends the cookie's session only when it is that one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, idCall, store, PW } from './build134-fixture.js';

const cookieOf = s => `${store.SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
const resolves = async s => Boolean((await store.resolveSessionFromRequest({ headers: { cookie: cookieOf(s) } }).catch(() => null))?.user?.id);
const idOf = async s => (await store.resolveSession(s.token))?.session?.id || null;
const login = async email => (await store.loginUser({ email, password: PW })).session;
const logout = (session, extra = {}) => idCall({ action: 'logout', ...extra }, session ? { session } : null);

test('T1 — a logout confirmation never clears the browser cookie; the session record is what ends', async () => {
  const w = await world();
  const a = await login(w.owner.email);
  const r = await logout(a);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.headers['Set-Cookie'], undefined, 'no Set-Cookie: a reply landing after a newer login must not clear that login\'s cookie');
  assert.equal(await resolves(a), false, 'the session itself is destroyed server-side');
});

test('T2 — a logout that names the session it ends cannot end a NEWER session the browser now holds', async () => {
  const w = await world();
  const a = await login(w.owner.email);
  const aId = await idOf(a);
  const b = await login(w.owner.email);                      // the newer login: the browser's cookie is now B's
  const r = await logout(b, { authSessionId: aId });        // the stale request: B's cookie, naming A
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.ended, false, 'nothing ended');
  assert.equal(r.body.skipped, 'other-session', 'the cookie belongs to a session the request did not name');
  assert.equal(r.headers['Set-Cookie'], undefined);
  assert.equal(await resolves(b), true, 'the newer session survives');
  assert.equal(await resolves(a), true, 'and nothing else was touched');
});

test('T3 — naming the session it ends, with that session\'s own cookie, ends it', async () => {
  const w = await world();
  const a = await login(w.owner.email);
  const r = await logout(a, { authSessionId: await idOf(a) });
  assert.equal(r.statusCode, 200); assert.equal(r.body.ended, true);
  assert.equal(await resolves(a), false);
});

test('T4 — backwards compatibility: a logout that names nothing (an older client, or a CD-110 marker) ends the cookie\'s session as before', async () => {
  const w = await world();
  const a = await login(w.owner.email);
  const r = await logout(a);
  assert.equal(r.statusCode, 200); assert.equal(r.body.ended, true);
  assert.equal(await resolves(a), false);
});

test('T5 — no cookie: nothing to end, still 200, still no Set-Cookie', async () => {
  await world();
  const r = await logout(null, { authSessionId: 'sess_whatever' });
  assert.equal(r.statusCode, 200); assert.equal(r.body.ended, false);
  assert.equal(r.headers['Set-Cookie'], undefined);
});

test('T6 — login answers carry the session id the client will name, and never the token', async () => {
  const w = await world();
  const r = await idCall({ action: 'login', email: w.owner.email, password: PW }, null);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.match(String(r.body.session?.id || ''), /^sess_/, 'the session id is exposed');
  assert.equal(r.body.session.token, undefined, 'the token is not');
  assert.equal(r.body.session.tokenHash, undefined, 'nor its hash');
  assert.match(String(r.headers['Set-Cookie'] || ''), /ce_session=/, 'the cookie is still set by the login');
});
