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
import { world, idCall, store, kv, members, PW } from './build134-fixture.js';

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

// ── CD-111 correction: the switch answer names the session the device holds now ──
const joinB = w => {
  const list = members();
  list.push({ id: 'tm_cd111_srv_b', teamId: w.b, userId: w.owner.user.id, role: 'coach', staffLevel: 'head', status: 'active', joinedAt: new Date().toISOString() });
  kv.set('app:identity:team_members', JSON.stringify(list));
};
const tokenFromCookie = h => decodeURIComponent(/ce_session=([^;]*)/.exec(String(h || ''))?.[1] || '');

test('T7 — switch_team answers with the NEW session\'s id and never its token; the old session is ended and the cookie carries the new one', async () => {
  const w = await world(); joinB(w);
  const a = await login(w.owner.email);
  const aId = await idOf(a);
  const r = await idCall({ action: 'switch_team', teamId: w.b }, { session: a });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true); assert.equal(r.body.teamId, w.b);
  assert.match(String(r.body.sessionId || ''), /^sess_/, 'the new session\'s id is exposed, as login does');
  assert.notEqual(r.body.sessionId, aId, 'and it is a NEW session');
  const newToken = tokenFromCookie(r.headers['Set-Cookie']);
  assert.ok(newToken.length > 20, 'the cookie carries the new token');
  assert.equal(JSON.stringify(r.body).includes(newToken), false, 'the token appears nowhere in the body');
  assert.equal(Object.keys(r.body).some(k => /token/i.test(k)), false, 'no token-like field either');
  assert.equal(await resolves(a), false, 'the session the device held is ended');
  const live = await store.resolveSession(newToken);
  assert.equal(live?.session?.id, r.body.sessionId, 'the id in the answer IS the id of the session the cookie holds');
  assert.equal(live?.session?.teamId, w.b);
});

test('T8 — after a switch, the OLD id still names the login: a logout naming it ends the cookie\'s CURRENT session (lineage), and only that one', async () => {
  const w = await world(); joinB(w);
  const a = await login(w.owner.email);
  const aId = await idOf(a);
  const sw = await idCall({ action: 'switch_team', teamId: w.b }, { session: a });
  const b = { token: tokenFromCookie(sw.headers['Set-Cookie']) };
  assert.equal((await store.loadSessions()).some(s => s.id === aId), false, 'the replaced session\'s record is gone: lineage cannot be found by looking it up');
  const named = await logout(b, { authSessionId: aId });             // a tab (or a remembered logout) that still names the replaced session
  assert.equal(named.statusCode, 200); assert.equal(named.body.ended, true, 'it is the same login, continued');
  assert.equal(named.body.skipped, undefined);
  assert.equal(named.headers['Set-Cookie'], undefined);
  assert.equal(await resolves(b), false, 'the cookie\'s current session is ended');
});

test('T9 — a dead cookie is answered no-session (nothing live to end), never ended:true', async () => {
  const w = await world();
  const a = await login(w.owner.email);
  await logout(a);                                                    // ended
  const again = await logout(a, { authSessionId: 'sess_x' });
  assert.equal(again.statusCode, 200); assert.equal(again.body.ended, false); assert.equal(again.body.skipped, 'no-session');
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

// ═════════════════════════════════════════════════════════════════════════════
// CD-111 SESSION LINEAGE. A club switch replaces the session; the replacement
// records the ids it replaced, so an id remembered from before a switch still
// names the same login. Nothing else does: a new login starts with no lineage.
// ═════════════════════════════════════════════════════════════════════════════
const record = async id => (await store.loadSessions()).find(s => s.id === id) || null;
/** Switch club with `from`'s cookie; returns the new session ({ token, id }). */
async function swap(from, teamId) {
  const r = await idCall({ action: 'switch_team', teamId }, { session: from });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return { token: tokenFromCookie(r.headers['Set-Cookie']), id: r.body.sessionId };
}
/** A login, then `n` club switches (A→B→A…). Returns every session id in order, and the live one. */
async function chain(w, n) {
  const first = await login(w.owner.email);
  const ids = [await idOf(first)]; let cur = first;
  for (let i = 0; i < n; i++) { cur = await swap(cur, i % 2 === 0 ? w.b : w.a); ids.push(cur.id); }
  return { ids, cur };
}

test('T10 — the immediately previous id, and ids SEVERAL switches old, all name the login; each ends only the cookie\'s current session', async () => {
  for (const n of [1, 2, 4]) {
    for (let k = 0; k < n; k++) {
      const w = await world(); joinB(w);
      const { ids, cur } = await chain(w, n);
      assert.equal(ids.length, n + 1);
      const r = await logout(cur, { authSessionId: ids[k] });
      assert.equal(r.body.ended, true, `${n} switches: the id from ${n - k} switch(es) ago names the login`);
      assert.equal(await resolves(cur), false);
      assert.equal(r.headers['Set-Cookie'], undefined);
    }
  }
});

test('T11 — a NEW login breaks the lineage: it starts with none, and a stale logout from the earlier login (any of its ids) cannot end it', async () => {
  const w = await world(); joinB(w);
  const { ids, cur } = await chain(w, 3);                            // login 1, three switches
  const login2 = await login(w.owner.email);                         // a genuinely new login on the same account
  const rec = await record(await idOf(login2));
  assert.ok(rec); assert.equal('lineage' in rec, false, 'a login records no ancestors');
  for (const old of ids) {
    const r = await logout(login2, { authSessionId: old });          // the stale request carries the NEW login's cookie
    assert.equal(r.statusCode, 200); assert.equal(r.body.ended, false, `the earlier login's id ${old} cannot end the new login`);
    assert.equal(r.body.skipped, 'other-session');
    assert.equal(await resolves(login2), true, 'the new login survives');
  }
  assert.equal(await resolves(cur), true, 'and the earlier login\'s own current session was not touched either');
  // a switch FROM the new login continues the NEW lineage only
  const moved = await swap(login2, w.b);
  const r2 = await logout(moved, { authSessionId: ids[0] });
  assert.equal(r2.body.ended, false, 'the earlier login\'s ids do not follow the new login through its own switch'); assert.equal(r2.body.skipped, 'other-session');
  const r3 = await logout(moved, { authSessionId: await idOf(login2) });
  assert.equal(r3.body.ended, true, 'but the new login\'s own previous id does');
});

test('T12 — two logins of one account are siblings, not ancestors: switching one never lends its ids to the other', async () => {
  const w = await world(); joinB(w);
  const l1 = await login(w.owner.email), l2 = await login(w.owner.email);
  const l2b = await swap(l2, w.b);                                   // l2 → l2b ; l1 untouched
  const r = await logout(l2b, { authSessionId: await idOf(l1) });
  assert.equal(r.body.ended, false); assert.equal(r.body.skipped, 'other-session');
  assert.equal(await resolves(l1), true); assert.equal(await resolves(l2b), true);
});

test('T13 — a different DEVICE, login or person can never authorise destruction: an id is only ever compared with the cookie\'s own session and its own ancestors', async () => {
  const w = await world(); joinB(w);
  const { ids, cur } = await chain(w, 2);                            // device 1: owner, with ancestors
  const other = await login(w.owner.email);                          // device 2: the SAME account, a separate login
  const person = w.admin.session;                                    // device 3: a different person entirely
  const otherId = await idOf(other), personId = await idOf(person);
  const attempts = [
    ['device 1 names device 2\'s id', cur, otherId], ['device 1 names another person\'s id', cur, personId],
    ['device 2 names device 1\'s ANCESTOR id', other, ids[0]], ['device 2 names device 1\'s CURRENT id', other, cur.id],
    ['another person names device 1\'s ancestor id', person, ids[1]], ['another person names device 1\'s current id', person, cur.id],
  ];
  for (const [label, cookie, named] of attempts) {
    const r = await logout(cookie, { authSessionId: named });
    assert.equal(r.statusCode, 200, label); assert.equal(r.body.ended, false, label); assert.equal(r.body.skipped, 'other-session', label);
  }
  for (const s of [cur, other, person]) assert.equal(await resolves(s), true, 'every session survived every attempt');
});

test('T14 — missing, expired, corrupt or oversize lineage fails SAFELY: nothing ends, and nothing reports ended', async () => {
  const w = await world(); joinB(w);
  const { ids, cur } = await chain(w, 2);
  assert.equal((await store.loadSessions()).some(s => ids.slice(0, 2).includes(s.id)), false, 'ancestor records are gone by design; lineage never depends on finding them');
  // (a) the current session expired: no-session, whatever it names
  const sessions = JSON.parse(kv.get('app:identity:sessions'));
  const live = sessions.find(s => s.id === cur.id);
  live.expiresAt = new Date(Date.now() - 1000).toISOString(); kv.set('app:identity:sessions', JSON.stringify(sessions));
  for (const named of [cur.id, ids[0], ids[1]]) {
    const r = await logout(cur, { authSessionId: named });
    assert.equal(r.body.ended, false, 'an expired session is never reported as ended by a lineage match'); assert.equal(r.body.skipped, 'no-session');
  }
  // (b) corrupt lineage values are ignored, not trusted
  live.expiresAt = new Date(Date.now() + 1e7).toISOString();
  for (const bad of ['sess_notalist', 7, null, { 0: ids[0] }, [null, 5, {}, '', 'x'.repeat(200)]]) {
    live.lineage = bad; kv.set('app:identity:sessions', JSON.stringify(sessions));
    for (const named of ['sess_notalist', 'null', '5', '[object Object]', 'undefined', ids[0]]) {
      const r = await logout(cur, { authSessionId: named });
      assert.equal(r.body.ended, false, `lineage ${JSON.stringify(bad)?.slice(0, 30)} / naming ${named}`); assert.equal(r.body.skipped, 'other-session');
    }
  }
  assert.equal(await resolves(cur), true, 'nothing ended through any of it');
});

test('T15 — lineage is bounded: only the newest 32 ancestors are kept; older ones fail safely (and a long chain does not grow the record)', async () => {
  const w = await world(); joinB(w);
  const { ids, cur } = await chain(w, 35);                           // 35 switches: 36 sessions, the live one is ids[35]
  const rec = await record(cur.id);
  assert.equal(rec.lineage.length, 32, 'capped');
  assert.deepEqual(rec.lineage, ids.slice(3, 35).reverse(), 'newest first; the three oldest ancestors fell off the end');
  for (const gone of [ids[0], ids[1], ids[2]]) {
    const r = await logout(cur, { authSessionId: gone });
    assert.equal(r.body.ended, false, 'beyond the bound: not recognised, not ended'); assert.equal(r.body.skipped, 'other-session');
  }
  const edge = await logout(cur, { authSessionId: ids[3] });
  assert.equal(edge.body.ended, true, 'the oldest ancestor still inside the bound ends it');
});

test('T16 — CONCURRENCY: a club switch and a logout from the same cookie serialise; the logout never ends a descendant it did not name, and never reports ended while a descendant lives', async () => {
  let sawSwitchFirst = 0, sawLogoutFirst = 0;
  for (let i = 0; i < 10; i++) {
    const w = await world(); joinB(w);
    const a = await login(w.owner.email); const aId = await idOf(a);
    const switchFirst = i % 2 === 0;                                 // alternate which request is started first
    const started = switchFirst
      ? [idCall({ action: 'switch_team', teamId: w.b }, { session: a }), logout(a, { authSessionId: aId })]
      : [logout(a, { authSessionId: aId }), idCall({ action: 'switch_team', teamId: w.b }, { session: a })];
    const [x, y] = await Promise.all(started);
    const [sw, lg] = switchFirst ? [x, y] : [y, x];
    const live = (await store.loadSessions()).filter(s => s.userId === w.owner.user.id && s.id !== undefined);
    if (lg.body.ended === true) {                                    // the logout ran first: the session is gone, the switch had nothing to switch
      sawLogoutFirst++;
      assert.equal(sw.statusCode, 401, 'a switch after the logout finds no session');
      assert.equal(live.some(s => s.id === aId), false);
      assert.equal(live.filter(s => (s.lineage || []).includes(aId)).length, 0, 'and no descendant was created');
    } else {                                                         // the switch ran first: the cookie\'s token no longer resolves
      sawSwitchFirst++;
      assert.equal(sw.statusCode, 200); assert.equal(lg.body.skipped, 'no-session');
      const child = live.find(s => (s.lineage || []).includes(aId));
      assert.ok(child, 'the new session exists, with the old id in its lineage');
      // …and a logout that now carries the NEW cookie and the old id finishes the job, through the lineage
      const tail = await logout({ token: tokenFromCookie(sw.headers['Set-Cookie']) }, { authSessionId: aId });
      assert.equal(tail.body.ended, true);
    }
    assert.ok([200, 401].includes(sw.statusCode), `no lock/conflict error leaked: ${sw.statusCode}`);
    assert.equal(lg.statusCode, 200);
  }
  assert.equal(sawSwitchFirst + sawLogoutFirst, 10);
  assert.ok(sawSwitchFirst > 0 && sawLogoutFirst > 0, `both serialisations were exercised (switch first ${sawSwitchFirst}, logout first ${sawLogoutFirst})`);
});

test('T17 — CONCURRENCY: a stale logout racing a new login ends only the session its own cookie holds; the new login is never touched, in any order', async () => {
  for (let i = 0; i < 10; i++) {
    const w = await world();
    const l1 = await login(w.owner.email); const l1Id = await idOf(l1);
    const [lg, l2] = await Promise.all([
      logout(l1, { authSessionId: l1Id }),
      store.loginUser({ email: w.owner.email, password: PW }),
    ]);
    assert.equal(lg.statusCode, 200); assert.equal(lg.body.ended, true, 'the cookie\'s own session ends');
    assert.equal(await resolves(l2.session), true, 'the new login survives, whichever order the lock chose');
    const rec = await record(l2.session.id); assert.equal('lineage' in rec, false);
    // the stale logout from the earlier login, now carrying the new login\'s cookie, ends nothing
    const late = await logout(l2.session, { authSessionId: l1Id });
    assert.equal(late.body.ended, false); assert.equal(late.body.skipped, 'other-session');
    assert.equal(await resolves(l2.session), true);
  }
});

test('T18 — the lineage never leaves the server: not in the switch answer, the logout answer, either session read, nor any login answer', async () => {
  const w = await world(); joinB(w);
  const first = await login(w.owner.email);
  const ancestorId = await idOf(first);
  const sw = await idCall({ action: 'switch_team', teamId: w.b }, { session: first });
  const cur = { token: tokenFromCookie(sw.headers['Set-Cookie']) };
  assert.ok((await record(sw.body.sessionId)).lineage.includes(ancestorId), 'baseline: the server holds it');
  const reads = [
    await idCall({ action: 'session' }, { session: cur }),
    await (async () => { const r = { statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader(n, v) { this.headers[n] = v; }, end() { return this; } };
      const { default: handler } = await import('../api/identity.js');
      await handler({ method: 'GET', query: { action: 'session' }, headers: { 'x-forwarded-for': '10.7.7.7', cookie: cookieOf(cur) }, body: null }, r); return r; })(),
  ];
  for (const r of reads) {
    assert.equal(r.statusCode, 200); assert.equal(r.body.ok, true);
    assert.equal('lineage' in r.body.session, false, 'the session read does not carry the ancestor list');
    assert.equal(JSON.stringify(r.body).includes(ancestorId), false, 'nor the ancestor id anywhere else');
    assert.equal(r.body.session.id, sw.body.sessionId, 'the rest of the record is as it was');
  }
  const lg = await logout(cur, { authSessionId: ancestorId });
  for (const r of [sw, lg]) assert.equal(JSON.stringify(r.body).includes(ancestorId), false);
  const fresh = await idCall({ action: 'login', email: w.owner.email, password: PW }, null);
  assert.equal(fresh.statusCode, 200); assert.equal('lineage' in fresh.body.session, false);
});

test('T19 — SOURCE: only switchTeam hands createSession a lineage, built from the authenticated record, and the handler passes nothing a client sent', async () => {
  const fs = await import('node:fs');
  const store_ = fs.readFileSync(new URL('../api/_identityStore.js', import.meta.url), 'utf8');
  const handler = fs.readFileSync(new URL('../api/identity.js', import.meta.url), 'utf8');
  const callers = [...store_.matchAll(/createSession\(\{[^}]*\}\)/g)].map(m => m[0]);
  assert.equal(callers.filter(c => /lineage/.test(c)).length, 1, 'exactly one createSession call carries a lineage');
  assert.match(store_, /const lineage = \[current\.session\.id, \.\.\.sessionLineage\(current\.session\)\]\.slice\(0, SESSION_LINEAGE_MAX\);[\s\S]{0,200}createSession\(\{ userId: current\.user\.id, teamId: membership\.teamId, role: membership\.role, lineage \}\)/, 'switchTeam builds it from the resolved session record');
  const code = handler.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  assert.equal(/lineage/.test(code.replace(/function publicSessionRead[\s\S]*?\n}\n/, '')), false, 'the handler never reads or writes a lineage except to strip it from the session read');
  assert.match(store_, /\.filter\(id => typeof id === 'string' && id\.length > 0 && id\.length <= 80\)\s*\n\s*\.slice\(0, SESSION_LINEAGE_MAX\)/, 'lineage is sanitised and bounded wherever it is read or written');
});

test('T20 — a lineage a CLIENT sends is ignored: no request field can write, extend or forge one', async () => {
  const w = await world(); joinB(w);
  const victim = await login(w.owner.email); const victimId = await idOf(victim);
  const attacker = w.admin.session; const attackerOwnId = await idOf(attacker);
  // switch_team with a forged lineage (top level, nested in teamId, in a header-ish field)
  const r = await idCall({ action: 'switch_team', teamId: w.a, lineage: [victimId], sessionLineage: [victimId], replaces: victimId }, { session: attacker });
  assert.ok([200, 403].includes(r.statusCode), `status ${r.statusCode}`);
  if (r.statusCode === 200) {
    const rec = await record(r.body.sessionId);
    assert.equal((rec.lineage || []).includes(victimId), false, 'the forged ancestor never reached the record');
    assert.deepEqual(rec.lineage || [], [attackerOwnId], 'only the attacker\'s OWN replaced session may appear');
  }
  // login and create_club likewise
  const fresh = await idCall({ action: 'login', email: w.owner.email, password: PW, lineage: [victimId] }, null);
  assert.equal(fresh.statusCode, 200);
  assert.equal('lineage' in (await record(fresh.body.session.id)), false, 'a login records no lineage whatever the body says');
  // and the attacker's cookie still cannot end the victim's session by naming it, with or without a forged lineage
  const out = await logout(attacker, { authSessionId: victimId, lineage: [victimId] });
  assert.equal(out.body.ended, false);
  assert.equal(await resolves(victim), true);
});
