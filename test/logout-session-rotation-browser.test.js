// CD-111 CORRECTION — a club switch replaces the session; a deliberate sign-out must still end the device's session.
//
// Real browser (two tabs of ONE context: one cookie jar, one localStorage), the REAL handlers behind a local server.
//
// THE DEFECT the independent review found (reproduced for real on 4751dda1 by journey 1, with no test-side assignment):
//   tab 1 switches club → the server ENDS the session both tabs held and starts a new one → tab 2 never learns the new
//   session's id → "Sign out" in tab 2 names the dead session → the server answers 200 {ended:false, skipped:'other-session'}
//   → the client took that for "signed out", cleared its marker → the next reload signed the device straight back in.
//
// Journey 1  the switch is learned by the other tab through storage (no reload, no poll); its sign-out names the LIVE
//            session and the device stays signed out across a reload.
// Journey 2  a tab that did NOT learn it (storage event missed — forced here by assigning the old id, said plainly): its
//            sign-out sends ONE request naming that old id, and the SERVER ends the login's current session through the
//            session lineage the switch recorded. The device stays signed out. No request ever names nothing.
// Journey 3  OFFLINE: the sign-out cannot reach the server (503) while the tab names the replaced id; the logout stays owed,
//            naming that id; the next boot sends it (before any session is asked for) and the lineage ends the live session.
// Journey 4  club creation adopts the new session's id; the sign-out names it.
// Journey 5  the lineage boundary, in a real browser: a tab left over from an EARLIER login names its id after a LATER login
//            exists; the server answers other-session, the later login is untouched, and nothing is left owed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.cd111-rotation.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
delete process.env.VERCEL; delete process.env.NODE_ENV;

const kv = new Map(), lists = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (url, options = {}) => {
  const u = String(url || '');
  if (!u.startsWith(process.env.UPSTASH_REDIS_REST_URL)) throw new Error('unexpected fetch ' + u);
  let p; try { p = JSON.parse(options.body || '[]'); } catch { p = null; }
  if (!Array.isArray(p)) return { ok: true, json: async () => ({ result: null }) };
  const [cmd, ...a] = p; let result = null;
  if (cmd === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (cmd === 'SET') { if (String(a[2] || '').toUpperCase() === 'NX' && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; } }
  if (cmd === 'DEL') { kv.delete(a[0]); result = 1; }
  if (cmd === 'SCAN') { const re = globToRe(a[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (cmd === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = (lists.get(a[0]) || []).slice(Number(a[1]), Number(a[2]) + 1);
  if (cmd === 'LTRIM' || cmd === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const S = await import('../api/_identityStore.js');
const { saveClubStructure } = await import('../api/_structureStore.js');
const handlers = {};
for (const name of ['identity', 'invite', 'config', 'publish', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe']) {
  handlers[name] = (await import(`../api/${name}.js`)).default;
}
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* not installed */ }

// `log` records every logout request the server saw (what it named, what it answered) and every session read.
// `logoutPlan` answers the next logout requests, in order: 'ok' runs the real handler, a number answers that status WITHOUT running it.
const state = { logoutPlan: [], log: [], answers: [] };
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).split('/')[0];
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const isLogout = name === 'identity' && req.method === 'POST' && body?.action === 'logout';
    const isSessionGet = name === 'identity' && req.method === 'GET' && url.searchParams.get('action') === 'session';
    const entry = { kind: isLogout ? 'logout' : isSessionGet ? 'session' : (body?.action || url.searchParams.get('action') || name), named: isLogout ? (body.authSessionId ?? null) : null, answer: null, status: null };
    state.log.push(entry);
    if (isLogout) {
      const step = state.logoutPlan.shift() ?? 'ok';
      if (step !== 'ok') { entry.status = step; res.statusCode = step; res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: false, error: 'storage unavailable' })); }
    }
    const vreq = { method: req.method, headers: { ...req.headers, 'x-forwarded-proto': 'http' }, query: Object.fromEntries(url.searchParams), body, url: req.url, socket: req.socket };
    const vres = { statusCode: 200,
      status(c) { this.statusCode = c; return this; }, setHeader(k, v) { res.setHeader(k, v); }, getHeader(k) { return res.getHeader(k); },
      writeHead(c, h) { res.writeHead(c, h); return this; }, write(d) { res.write(d); },
      json(d) { entry.status = this.statusCode; if (isLogout) entry.answer = d; res.statusCode = this.statusCode; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); },
      end(d) { res.statusCode = this.statusCode; res.end(d); },
      send(d) { this.end(typeof d === 'string' ? d : JSON.stringify(d)); } };
    const h = handlers[name];
    if (!h) { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
    try { await h(vreq, vres); } catch { res.statusCode = 500; res.end('{}'); }
    return;
  }
  const f = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  try { res.setHeader('content-type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
});
const PW = 'password123';
let seq = 0;
const kkey = () => String(seq++).padStart(2, '0').repeat(10);
const structureFor = names => ({
  version: 1,
  groups: [{ id: 'grp_initial', name: 'Seniors', type: 'general', status: 'active' }],
  teams: names.map((name, i) => ({ id: i === 0 ? 'team_initial' : `team_${name.toLowerCase().replace(/\W+/g, '_')}`, groupId: 'grp_initial', name, status: 'active' })),
});
const PENDING_KEY = 'coach-eye-logout-pending';

async function world() {
  const n = seq;
  const ownerEmail = `owner${n}.rot@x.test`;
  const A = await S.createClub({ clubName: `Alpha Rugby Club ${n}`, teamName: 'Seniors', sport: 'Rugby', name: 'Alpha Owner', email: ownerEmail, password: PW, idempotencyKey: kkey() });
  const B = await S.createClub({ clubName: `Bravo Rugby Club ${n}`, teamName: 'Seniors', sport: 'Rugby', name: 'Bravo Owner', email: `bravo${n}.rot@x.test`, password: PW, idempotencyKey: kkey() });
  await saveClubStructure(A.team.id, structureFor(['Alpha Premier']));
  await saveClubStructure(B.team.id, structureFor(['Bravo Premier']));
  const list = JSON.parse(kv.get('app:identity:team_members') || '[]');          // the same person coaches at both clubs: the switcher has somewhere to go
  list.push({ id: 'tm_rot_b', teamId: B.team.id, userId: A.user.id, role: 'coach', staffLevel: 'head', status: 'active', joinedAt: new Date().toISOString() });
  kv.set('app:identity:team_members', JSON.stringify(list));
  return { A, B, ownerEmail };
}

async function twoTabs(browser, BASE, ownerEmail) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });   // ONE jar, ONE storage: two tabs
  const p1 = await ctx.newPage(), p2 = await ctx.newPage();
  const errors = []; p1.on('pageerror', e => errors.push('1: ' + e.message)); p2.on('pageerror', e => errors.push('2: ' + e.message));
  const dismissSetup = page => page.evaluate(() => { try { sessionStorage.setItem('ce-setup-skipped', '1'); } catch {} document.getElementById('first-run-modal')?.remove(); });
  await p1.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('#ce-welcome', { timeout: 20000 });
  await dismissSetup(p1);
  await p1.click('#ce-welcome button:has-text("Log in")');
  await p1.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
  await p1.fill('#identityLoginEmail', ownerEmail); await p1.fill('#identityLoginPassword', PW); await p1.click('#identityLoginBtn');
  await p1.waitForFunction(() => !sessionSignedOut() && _serverAuthState === 'authed' && !!state.stateTeamId, null, { timeout: 20000 });
  await dismissSetup(p1);
  await p2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });          // tab 2 opens on the same cookie: the session read teaches it the id
  await dismissSetup(p2);
  await p2.waitForFunction(() => _serverAuthState === 'authed' && !!_authSessionId, null, { timeout: 20000 });
  const sid = page => page.evaluate(() => _authSessionId);
  const s1 = await sid(p1);
  assert.match(s1, /^sess_/, 'tab 1 holds the id of its session');
  assert.equal(await sid(p2), s1, 'baseline: tab 2 learned the same id from its session read');
  return { ctx, p1, p2, errors, sid, s1, dismissSetup };
}
const signOutInPage = page => page.evaluate(() => { window.ceConfirm = async () => true; return settingsSignOut(); });
const waitFor = async (fn, ms = 10000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('waitFor timeout'); await new Promise(r => setTimeout(r, 25)); } };
const logoutsSince = mark => state.log.slice(mark).filter(l => l.kind === 'logout');
async function expectSignedOutAfterReload(page, why) {
  const mark = state.log.length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _serverAuthState !== 'undefined' && _serverAuthState !== 'unknown', null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const s = await page.evaluate(KEY => ({ signedOut: sessionSignedOut(), auth: _serverAuthState, uid: state.currentUserId, pending: localStorage.getItem(KEY) }), PENDING_KEY);
  assert.equal(s.signedOut, true, `${why}: the device is still signed out after a reload (the defect: the cookie's session was alive and the reload signed back in)`);
  assert.equal(s.auth, 'anon', why); assert.equal(s.uid, '', why); assert.equal(s.pending, null, `${why}: nothing left owed`);
  return state.log.slice(mark);
}

async function launch(t) {
  if (!chromium) { t.skip('playwright not installed'); return null; }
  let browser;
  try { browser = await chromium.launch(); } catch { t.skip('no browser available'); return null; }
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { browser, BASE: `http://127.0.0.1:${server.address().port}` };
}
const close = async ({ browser }) => { await browser.close(); await new Promise(r => server.close(r)); };

test('browser journey 1: tab 1 switches club; tab 2 learns the new session through storage; its sign-out names the live session and the device stays signed out', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const { A, B, ownerEmail } = await world();
    const { ctx, p1, p2, errors, sid, s1 } = await twoTabs(env.browser, env.BASE, ownerEmail);
    await p1.evaluate(id => switchTeamTo(id), B.team.id);
    await p1.waitForFunction(old => _authSessionId !== old, s1, { timeout: 20000 });
    const s2 = await sid(p1);
    assert.notEqual(s2, s1, 'the switch replaced the session');
    await p2.waitForFunction(id => _authSessionId === id, s2, { timeout: 10000 });        // storage event: no reload, no poll, no request of its own
    assert.equal(await sid(p2), s2, 'tab 2 now holds the LIVE session\'s id');
    const stored = JSON.parse(await p2.evaluate(() => localStorage.getItem('coach-eye-auth-session')));
    assert.equal(stored.id, s2); assert.ok(Number.isFinite(stored.seq) && stored.seq >= 2);
    const mark = state.log.length;
    await signOutInPage(p2);
    await waitFor(() => logoutsSince(mark).length >= 1, 10000);
    await p2.waitForTimeout(400);
    const outs = logoutsSince(mark);
    assert.equal(outs.length, 1, 'one logout request: it named the live session, so no retry was needed');
    assert.equal(outs[0].named, s2); assert.equal(outs[0].answer.ended, true);
    await expectSignedOutAfterReload(p2, 'journey 1');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});

test('browser journey 2: a tab that still names the replaced session — ONE request, naming it; the server ends the login\'s current session through the lineage; the device stays signed out', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const { B, ownerEmail } = await world();
    const { ctx, p1, p2, errors, sid, s1 } = await twoTabs(env.browser, env.BASE, ownerEmail);
    await p1.evaluate(id => switchTeamTo(id), B.team.id);
    await p1.waitForFunction(old => _authSessionId !== old, s1, { timeout: 20000 });
    const s2 = await sid(p1);
    await p2.waitForFunction(id => _authSessionId === id, s2, { timeout: 10000 });
    // The storage event is what normally prevents this. To exercise the SERVER's lineage for a tab that missed it (storage
    // unavailable, event lost), the old id is put back BY ASSIGNMENT in this tab. That assignment is the test's, not the app's.
    await p2.evaluate(old => { _authSessionId = old; }, s1);
    const mark = state.log.length;
    await signOutInPage(p2);
    await waitFor(() => logoutsSince(mark).length >= 1, 10000);
    await p2.waitForTimeout(500);
    const outs = logoutsSince(mark);
    assert.equal(outs.length, 1, 'exactly ONE logout request: no fallback of any kind');
    assert.equal(outs[0].named, s1, 'it names the replaced session');
    assert.equal(outs[0].answer.ended, true, 'and the server ended the login\'s current session: the old id is in its lineage'); assert.equal(outs[0].answer.skipped, undefined);
    await expectSignedOutAfterReload(p2, 'journey 2');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});

test('browser journey 3: OFFLINE — the sign-out cannot reach the server, a switch has replaced the session meanwhile; the next boot finishes it through the lineage, before any session is asked for', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const { B, ownerEmail } = await world();
    const { ctx, p1, p2, errors, sid, s1 } = await twoTabs(env.browser, env.BASE, ownerEmail);
    await p2.evaluate(old => { _authSessionId = old; }, s1);               // tab 2 names s1 (it is the current id here; the switch comes AFTER the sign-out, below)
    state.logoutPlan = [503];                                               // the sign-out is refused (a storage outage): not confirmed
    const mark = state.log.length;
    await signOutInPage(p2);
    await waitFor(() => logoutsSince(mark).length >= 1, 10000);
    await p2.waitForTimeout(400);
    assert.equal(logoutsSince(mark)[0].status, 503);
    assert.equal(await p2.evaluate(KEY => localStorage.getItem(KEY), PENDING_KEY), s1, 'still owed, naming the session it is for');
    // The session is replaced while the logout is still owed (the same login, another club). Its cookie lands in the shared jar.
    const switched = await p1.evaluate(async id => { const r = await fetch('/api/identity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'switch_team', teamId: id }) }); return { status: r.status, body: await r.json() }; }, B.team.id);
    assert.equal(switched.status, 200); assert.notEqual(switched.body.sessionId, s1);
    assert.equal(await p2.evaluate(async () => (await fetch('/api/identity?action=session', { cache: 'no-store' })).status), 200, 'baseline: the replacement session is alive');
    state.logoutPlan = [];
    const m = state.log.length;
    await p2.reload({ waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => typeof _serverAuthState !== 'undefined' && _serverAuthState !== 'unknown', null, { timeout: 20000 });
    await p2.waitForTimeout(500);
    const since = state.log.slice(m);
    const iLogout = since.findIndex(l => l.kind === 'logout'), iSession = since.findIndex(l => l.kind === 'session');
    assert.ok(iLogout >= 0, 'the boot delivered the owed logout');
    assert.equal(since[iLogout].named, s1, 'naming the session it was owed for (the OLD one)');
    assert.equal(since[iLogout].answer.ended, true, 'and the server ended the live session through the lineage');
    assert.ok(iSession < 0 || iLogout < iSession, 'before any session was asked for');
    assert.equal(since.filter(l => l.kind === 'logout').length, 1, 'one request');
    const s = await p2.evaluate(KEY => ({ signedOut: sessionSignedOut(), auth: _serverAuthState, pending: localStorage.getItem(KEY) }), PENDING_KEY);
    assert.equal(s.signedOut, true); assert.equal(s.auth, 'anon', 'the device is signed out: the cookie\'s session is gone'); assert.equal(s.pending, null);
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});

test('browser journey 4: club creation adopts the NEW session\'s id (this tab and storage), and the sign-out then names that session', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const n = ++seq;
    const email = `cee${n}.rot@x.test`;
    const ctx = await env.browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(env.BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ce-welcome', { timeout: 20000 });
    await page.evaluate(() => { try { sessionStorage.setItem('ce-setup-skipped', '1'); } catch {} });
    // The REAL wizard submit, fed the wizard's data directly (the steps before it are not what is under test).
    await page.evaluate(d => { _clubWiz = { data: d }; _cwFinishing = false; return clubWizFinish(); },
      { clubName: `Charlie Rugby Club ${n}`, teamName: 'Seniors', sport: 'Rugby', name: 'Cee Owner', email, password: PW });
    await page.waitForFunction(() => _serverAuthState === 'authed' && !!_authSessionId, null, { timeout: 20000 });
    const id = await page.evaluate(() => _authSessionId);
    const created = (await S.loadSessions()).find(s => s.id === id);
    assert.ok(created, 'the id this tab holds IS a live session on the server');
    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('coach-eye-auth-session')));
    assert.equal(stored.id, id, 'and it is shared through storage');
    const mark = state.log.length;
    await signOutInPage(page);
    await waitFor(() => logoutsSince(mark).length >= 1, 10000);
    await page.waitForTimeout(400);
    const outs = logoutsSince(mark);
    assert.equal(outs.length, 1, 'one request: the right session was named');
    assert.equal(outs[0].named, id); assert.equal(outs[0].answer.ended, true);
    assert.equal((await S.loadSessions()).some(s => s.id === id), false, 'the session is ended');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});

test('browser journey 5: a tab left over from an EARLIER login cannot end a LATER login — the server answers other-session, the later login is untouched, nothing is left owed', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const { ownerEmail } = await world();
    const { ctx, p1, p2, errors, sid, s1 } = await twoTabs(env.browser, env.BASE, ownerEmail);
    await p1.evaluate(() => { window.ceConfirm = async () => true; return settingsSignOut(); });      // login 1 ends
    await p1.waitForFunction(() => sessionSignedOut(), null, { timeout: 10000 });
    await p1.waitForTimeout(500);
    await p1.reload({ waitUntil: 'domcontentloaded' });
    await p1.waitForSelector('#ce-welcome', { timeout: 20000 });
    await p1.click('#ce-welcome button:has-text("Log in")');
    await p1.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
    await p1.fill('#identityLoginEmail', ownerEmail); await p1.fill('#identityLoginPassword', PW); await p1.click('#identityLoginBtn');
    await p1.waitForFunction(() => !sessionSignedOut() && _serverAuthState === 'authed' && !!_authSessionId, null, { timeout: 20000 });
    const s3 = await sid(p1);
    assert.notEqual(s3, s1, 'a NEW login, a new session, no lineage');
    // Tab 2 is a leftover from login 1. Its storage events blanked it; to stand in for a tab that never heard, login 1's id is
    // put back BY ASSIGNMENT (the test's, not the app's) and the REAL Sign out is used.
    await p2.evaluate(old => { _authSessionId = old; }, s1);
    const mark = state.log.length;
    await signOutInPage(p2);
    await waitFor(() => logoutsSince(mark).length >= 1, 10000);
    await p2.waitForTimeout(500);
    const outs = logoutsSince(mark);
    assert.equal(outs.length, 1, 'ONE request, and nothing else is ever sent');
    assert.equal(outs[0].named, s1); assert.equal(outs[0].answer.ended, false); assert.equal(outs[0].answer.skipped, 'other-session');
    assert.equal(await p1.evaluate(async () => (await fetch('/api/identity?action=session', { cache: 'no-store' })).status), 200, 'login 3 is alive: a stale logout from an earlier login did not end it');
    assert.equal(await p2.evaluate(KEY => localStorage.getItem(KEY), PENDING_KEY), null, 'and nothing is left owed (it would block the next boot for ever)');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});
