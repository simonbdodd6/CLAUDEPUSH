// CD-111 — the section-19 manual checks, automated. Written AFTER the deployment, against the UNMODIFIED candidate d4fbe1a3.
//
// Real browser (Chromium, two tabs of ONE context: one cookie jar, one localStorage), the REAL handlers behind a local
// server, an in-memory store. No production host, no credentials, no network beyond 127.0.0.1. Service workers are blocked,
// as in every other browser suite here.
//
//   R3   passive tab after a switch      (characterisation: records what the tab shows; asserts what CD-111 establishes)
//   R4a  passive tab on Messages         (its refresh never lists the club it left)
//   R4b  SECURITY: club A's conversation cannot be READ through the shared cookie after the switch
//   R4c  SECURITY: club A's conversation cannot be WRITTEN (send / react / delete) and its thread is left untouched
//   R5-7 sign out in the NON-switching tab, then reload BOTH tabs   (the original defect)
//   R8   sign out in the SWITCHING tab, then reload both tabs
//   R9   offline sign-out, then reconnect (Playwright's offline switch fires the page's real offline/online events)
//   R10  pageshow handler with a SYNTHETIC persisted:true. A REAL back/forward-cache restore is NOT tested: headless
//        Chromium here does not perform one (probed), so only the handler's behaviour is covered.
//   R11  "Clear this device" from a tab that names a REPLACED session
//
// What these tests do NOT cover: the DevTools Offline button itself, a real bfcache restore, Safari / iOS / installed-PWA
// storage, the real service worker, and anything about production (Vercel, the real store, real cookie flags).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.cd111-automation.test';
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
      json(d) { entry.status = this.statusCode; if (isLogout) { entry.answer = d; entry.setCookie = res.getHeader('set-cookie') ?? null; } res.statusCode = this.statusCode; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); },
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

// ─── Helpers for the nine tests below ───────────────────────────────────────────────────────────────────────────────
const unique = prefix => `${prefix} ${Date.now().toString(36)}${(seq++).toString(36)}`;
// An authenticated request made FROM a page, so it carries that browser's cookie jar (and so the jar's CURRENT session).
const call = (page, method, url, body) => page.evaluate(async ({ method, url, body }) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let json = null; let text = '';
  try { text = await r.text(); json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}, { method, url, body });
const clubView = page => page.evaluate(() => ({
  stateTeamId: (typeof state !== 'undefined' && state.stateTeamId) || null,
  clubContextId: typeof _clubContextId !== 'undefined' ? (_clubContextId || null) : null,
  currentMembership: ((typeof _myMemberships !== 'undefined' && _myMemberships) || []).find(m => m.current)?.teamId || null,
  switcher: document.getElementById('clubSwitchSelect')?.value ?? null,
  authId: typeof _authSessionId !== 'undefined' ? _authSessionId : null,
  authSeq: typeof _authSessionSeq !== 'undefined' ? _authSessionSeq : null,
}));
const shellOf = page => page.evaluate(KEY => ({ signedOut: sessionSignedOut(), auth: _serverAuthState, uid: state.currentUserId, pending: localStorage.getItem(KEY) }), PENDING_KEY);
const clearsCookie = setCookie => /max-age=0|expires=thu, 01 jan 1970/i.test(Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie || ''));
const switchAndLearn = async (p1, p2, sid, teamId, s1) => {
  await p1.evaluate(id => switchTeamTo(id), teamId);
  await p1.waitForFunction(old => _authSessionId !== old, s1, { timeout: 20000 });
  const s2 = await sid(p1);
  await p2.waitForFunction(id => _authSessionId === id, s2, { timeout: 10000 });
  return s2;
};
// ONE named logout request, answered {ok:true, ended:true}, and no Set-Cookie that would clear the browser's cookie.
function assertOneEndedLogout(outs, named, why) {
  assert.equal(outs.length, 1, `${why}: exactly one logout request`);
  assert.equal(outs[0].named, named, `${why}: it names the expected session`);
  assert.equal(outs[0].status, 200, why);
  assert.equal(outs[0].answer.ok, true, why); assert.equal(outs[0].answer.ended, true, `${why}: the session was ended`);
  assert.equal(outs[0].answer.skipped, undefined, `${why}: skipped:'other-session' would be the original defect`);
  assert.equal(clearsCookie(outs[0].setCookie), false, `${why}: the reply never clears the browser's cookie (got ${JSON.stringify(outs[0].setCookie)})`);
}

// Row 3 — CHARACTERISATION, not a requirement. Nothing in CD-111 specifies what a tab that did not switch shows; this test
// records it (as diagnostics) and asserts only what CD-111 does establish.
test('R3 passive tab: after another tab switches clubs, it adopts the new session identity; what else it shows is recorded, and its own requests act on the NEW club', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const { A, B, ownerEmail } = await world();
    const { ctx, p1, p2, errors, sid, s1 } = await twoTabs(env.browser, env.BASE, ownerEmail);
    const before = { tab1: await clubView(p1), tab2: await clubView(p2) };
    assert.equal(before.tab1.stateTeamId, A.team.id); assert.equal(before.tab2.stateTeamId, A.team.id, 'baseline: both tabs are in the first club');
    const s2 = await switchAndLearn(p1, p2, sid, B.team.id, s1);
    await p2.waitForTimeout(600);                       // let any state/storage events settle; NO reload, NO interaction in tab 2
    const after = { tab1: await clubView(p1), tab2: await clubView(p2) };
    t.diagnostic('R3 before the switch: ' + JSON.stringify(before));
    t.diagnostic('R3 after the switch, tab 2 untouched: ' + JSON.stringify(after));
    // ESTABLISHED by CD-111
    assert.equal(after.tab2.authId, s2, 'tab 2 holds the live session id');
    assert.equal(after.tab2.authId, after.tab1.authId);
    assert.ok(after.tab2.authSeq > before.tab2.authSeq, 'the shared sequence moved forward in tab 2');
    assert.equal(after.tab1.stateTeamId, B.team.id, 'the switching tab is in the new club');
    // The server decides the club from the cookie: tab 2's OWN request is answered for the new club, whatever tab 2 displays.
    const own = await call(p2, 'GET', '/api/identity?action=session');
    assert.equal(own.status, 200); assert.equal(own.json.teamMember.teamId, B.team.id, 'tab 2\'s requests act on the NEW club');
    // Characterisation guard only: every club value tab 2 shows is one of the two clubs (or unset) — never anything else.
    const known = new Set([A.team.id, B.team.id, null]);
    for (const k of ['stateTeamId', 'clubContextId', 'currentMembership', 'switcher']) assert.ok(known.has(after.tab2[k]), `tab 2 ${k} is one of the two clubs (saw ${after.tab2[k]})`);
    t.diagnostic('R3 tab 2 still names the OLD club in: ' + ['stateTeamId', 'clubContextId', 'currentMembership', 'switcher'].filter(k => after.tab2[k] === A.team.id).join(', ') + ' (recorded, not asserted)');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});

// Rows 4 — the SECURITY property. Tab 2 sits on Messages in club A; tab 1 switches to club B. Tab 2's cookie now names B.
// A club-A conversation must be neither readable nor writable through it. A 200 anywhere below is a SECURITY DEFECT.
async function messagesWorld(env) {
  const w = await world();
  const t = await twoTabs(env.browser, env.BASE, w.ownerEmail);
  const secret = unique('alpha-secret');
  const made = await call(t.p1, 'POST', '/api/chat', { action: 'create_group', name: unique('Alpha Only Group') });
  assert.equal(made.status, 200, 'club A group created');
  const convId = made.json.conversation.id;
  const sent = await call(t.p1, 'POST', '/api/chat', { action: 'send', convId, text: secret });
  assert.equal(sent.status, 200, 'club A message sent');
  const read = await call(t.p1, 'GET', `/api/chat?action=messages&convId=${encodeURIComponent(convId)}`);
  assert.equal(read.status, 200); assert.equal(read.json.messages.length, 1, 'baseline: club A holds exactly one message');
  return { ...w, ...t, secret, convId, msgId: read.json.messages[0].id, groupName: made.json.conversation.name };
}

test('R4a passive tab on Messages: after another tab switches clubs, its next conversations refresh never lists club A\'s group; what it shows before that is recorded', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const W = await messagesWorld(env); const { B, p1, p2, errors, sid, s1, groupName } = W;
    await p2.evaluate(() => setSection('coach', 'messages'));
    await p2.evaluate(() => chatFetchConversations(true));
    await p2.waitForFunction(g => _chatConversationsLoaded === true && _chatConversations.some(c => (c.name || c.title) === g), groupName, { timeout: 20000 });
    await switchAndLearn(p1, p2, sid, B.team.id, s1);
    await p2.waitForTimeout(600);
    const stale = await p2.evaluate(g => ({ names: _chatConversations.map(c => c.name || c.title || c.id), hasAlphaGroup: _chatConversations.some(c => (c.name || c.title) === g) }), groupName);
    t.diagnostic('R4a tab 2 on Messages, BEFORE any refresh of its own: ' + JSON.stringify(stale) + ' (recorded, not asserted: in-memory list from before the switch)');
    // What its own poll / focus refresh does: ask the server again. The cookie names club B, so club A's group must be absent.
    await p2.evaluate(() => chatFetchConversations(true));
    await p2.waitForFunction(() => _chatConversationsLoaded === true, null, { timeout: 20000 });
    const afterRefresh = await p2.evaluate(g => ({ names: _chatConversations.map(c => c.name || c.title || c.id), hasAlphaGroup: _chatConversations.some(c => (c.name || c.title) === g) }), groupName);
    assert.equal(afterRefresh.hasAlphaGroup, false, `club A's group is not in the list tab 2 gets once it asks (saw ${JSON.stringify(afterRefresh.names)})`);
    const raw = await call(p2, 'GET', '/api/chat?action=conversations');
    assert.equal(raw.status, 200); assert.ok(!raw.text.includes(groupName) && !raw.text.includes(W.convId), 'the raw conversations reply names nothing of club A\'s group');
    assert.deepEqual(errors, [], 'no page errors');
    await W.ctx.close();
  } finally { await close(env); }
});

test('R4b SECURITY: after the switch, club A\'s conversation CANNOT BE READ through the shared cookie (messages, mark-read) — any 200 is a security defect', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const W = await messagesWorld(env); const { B, p1, p2, sid, s1, convId, secret } = W;
    await switchAndLearn(p1, p2, sid, B.team.id, s1);
    const enc = encodeURIComponent(convId);
    const read = await call(p2, 'GET', `/api/chat?action=messages&convId=${enc}`);
    assert.notEqual(read.status, 200, `SECURITY DEFECT if 200: club A's messages were readable under club B's session (status ${read.status})`);
    assert.ok([403, 404].includes(read.status), `refused as 403/404 (got ${read.status})`);
    assert.ok(!read.text.includes(secret), 'and the reply does not contain the message text');
    const mark = await call(p2, 'POST', '/api/chat', { action: 'read', convId });
    assert.notEqual(mark.status, 200, `SECURITY DEFECT if 200: mark-read accepted for club A's conversation (status ${mark.status})`);
    const typing = await call(p2, 'GET', `/api/chat?action=typing&convId=${enc}`);
    assert.ok(!typing.text.includes(secret), 'the typing/presence read leaks nothing of club A');
    await W.ctx.close();
  } finally { await close(env); }
});

test('R4c SECURITY: after the switch, club A\'s conversation CANNOT BE WRITTEN through the shared cookie (send, react, delete) and club A\'s thread is left exactly as it was', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const W = await messagesWorld(env); const { A, B, p1, p2, sid, s1, convId, msgId, secret } = W;
    await switchAndLearn(p1, p2, sid, B.team.id, s1);
    const intruder = unique('written-under-club-B');
    const send = await call(p2, 'POST', '/api/chat', { action: 'send', convId, text: intruder });
    assert.notEqual(send.status, 200, `SECURITY DEFECT if 200: a message was written to club A's conversation under club B's session (status ${send.status})`);
    const react = await call(p2, 'POST', '/api/chat', { action: 'react', convId, msgId, emoji: '👍' });
    assert.notEqual(react.status, 200, `SECURITY DEFECT if 200: a reaction was accepted on club A's message (status ${react.status})`);
    const del = await call(p2, 'POST', '/api/chat', { action: 'delete', convId, msgId });
    assert.notEqual(del.status, 200, `SECURITY DEFECT if 200: club A's message was deletable under club B's session (status ${del.status})`);
    for (const [name, r] of [['send', send], ['react', react], ['delete', del]]) assert.ok([403, 404].includes(r.status), `${name} refused as 403/404 (got ${r.status})`);
    // Prove the thread is untouched — read it back AS CLUB A (switch the shared cookie back through the API).
    const back = await call(p1, 'POST', '/api/identity', { action: 'switch_team', teamId: A.team.id });
    assert.equal(back.status, 200);
    const read = await call(p1, 'GET', `/api/chat?action=messages&convId=${encodeURIComponent(convId)}`);
    assert.equal(read.status, 200);
    assert.equal(read.json.messages.length, 1, 'club A\'s thread still holds exactly its one message');
    assert.equal(read.json.messages[0].text, secret); assert.equal(read.json.messages[0].id, msgId, 'the original message is not deleted');
    assert.ok(!read.text.includes(intruder), 'nothing written under club B\'s session is in club A\'s thread');
    assert.ok(!JSON.stringify(read.json.messages[0].reactions || {}).includes('👍'), 'no reaction was recorded on it');
    await W.ctx.close();
  } finally { await close(env); }
});

// Rows 5, 6, 7 — the ESSENTIAL regression: sign out in the tab that did NOT switch.
test('R5-7 sign out in the NON-switching tab: one request naming the current session, answered ended:true with no cookie clearing; BOTH tabs stay signed out after a reload', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const { B, ownerEmail } = await world();
    const { ctx, p1, p2, errors, sid, s1 } = await twoTabs(env.browser, env.BASE, ownerEmail);
    const s2 = await switchAndLearn(p1, p2, sid, B.team.id, s1);
    const mark = state.log.length;
    await signOutInPage(p2);                                         // tab 2 never switched
    await waitFor(() => logoutsSince(mark).length >= 1, 10000);
    await p2.waitForTimeout(500);
    assertOneEndedLogout(logoutsSince(mark), s2, 'non-switching tab');
    const t0 = Date.now();
    const flipped = await p1.waitForFunction(() => sessionSignedOut(), null, { timeout: 5000 }).then(() => true).catch(() => false);
    t.diagnostic(`R7 tab 1 (the switching tab) ${flipped ? 'followed to signed-out by itself within ' + (Date.now() - t0) + ' ms' : 'did NOT flip by itself within 5 s'} (recorded; the asserted outcome is after the reload)`);
    await expectSignedOutAfterReload(p2, 'R5-7 tab 2');
    await expectSignedOutAfterReload(p1, 'R5-7 tab 1 (the other tab)');
    assert.equal(logoutsSince(mark).length, 1, 'still exactly one logout request after both reloads: nothing was left owed');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});

// Row 8 — the other order.
test('R8 sign out in the SWITCHING tab: one request naming its own current session, ended:true, no cookie clearing; both tabs stay signed out after a reload', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const { B, ownerEmail } = await world();
    const { ctx, p1, p2, errors, sid, s1 } = await twoTabs(env.browser, env.BASE, ownerEmail);
    const s2 = await switchAndLearn(p1, p2, sid, B.team.id, s1);
    const mark = state.log.length;
    await signOutInPage(p1);                                         // the tab that switched
    await waitFor(() => logoutsSince(mark).length >= 1, 10000);
    await p1.waitForTimeout(500);
    assertOneEndedLogout(logoutsSince(mark), s2, 'switching tab');
    const flipped = await p2.waitForFunction(() => sessionSignedOut(), null, { timeout: 5000 }).then(() => true).catch(() => false);
    t.diagnostic(`R8 tab 2 (the other tab) ${flipped ? 'followed to signed-out by itself' : 'did NOT flip by itself within 5 s'} (recorded; the asserted outcome is after the reload)`);
    await expectSignedOutAfterReload(p1, 'R8 tab 1');
    await expectSignedOutAfterReload(p2, 'R8 tab 2 (the other tab)');
    assert.equal(logoutsSince(mark).length, 1, 'nothing was left owed');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});

// Row 9 — offline, then reconnect, using Playwright's offline switch (which fires the page's real offline/online events).
test('R9 offline sign-out: the marker names the session and nothing reaches the server; going online delivers the named logout by itself (ends it once; a second open tab\'s duplicate finds nothing) and clears the marker; a reload stays signed out', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const { ownerEmail } = await world();
    const { ctx, p1, errors, s1 } = await twoTabs(env.browser, env.BASE, ownerEmail);
    await p1.evaluate(() => { window.__onlineEvents = 0; addEventListener('online', () => { window.__onlineEvents++; }); });
    await ctx.setOffline(true);
    assert.equal(await p1.evaluate(() => navigator.onLine), false, 'the page is offline');
    const mark = state.log.length;
    await signOutInPage(p1);
    await p1.waitForTimeout(400);
    assert.equal(logoutsSince(mark).length, 0, 'offline: no logout request reached the server');
    assert.equal(await p1.evaluate(KEY => localStorage.getItem(KEY), PENDING_KEY), s1, 'the owed logout is remembered, naming the session');
    const offlineShell = await shellOf(p1);
    assert.equal(offlineShell.signedOut, true, 'the device is signed out locally at once');
    await ctx.setOffline(false);                                     // fires the page's 'online' event → the reconnect listener
    await waitFor(() => logoutsSince(mark).length >= 1, 10000);
    await p1.waitForFunction(KEY => !localStorage.getItem(KEY), PENDING_KEY, { timeout: 10000 });
    assert.ok(await p1.evaluate(() => window.__onlineEvents) >= 1, 'the page saw a real online event');
    // The owed-logout marker is shared storage and EVERY open tab runs the 'online' listener, so with two tabs open each may
    // deliver it (observed on the first run: the second request landed on an already-ended session). That is benign and is
    // what is asserted: all requests name the owed session, exactly ONE ends it, every other is answered no-session, none
    // is other-session, none clears the cookie, and at most one request per open tab is sent.
    await p1.waitForTimeout(500);
    const outs = logoutsSince(mark);
    t.diagnostic('R9 logout requests after reconnect (2 tabs open): ' + JSON.stringify(outs.map(l => ({ named: l.named === s1 ? 's1' : l.named, status: l.status, answer: l.answer }))));
    assert.ok(outs.length >= 1 && outs.length <= 2, `one request per open tab at most (saw ${outs.length})`);
    for (const l of outs) {
      assert.equal(l.named, s1, 'every request names the owed session'); assert.equal(l.status, 200);
      assert.equal(l.answer.ok, true); assert.notEqual(l.answer.skipped, 'other-session', 'never other-session');
      assert.equal(clearsCookie(l.setCookie), false, 'no reply clears the browser\'s cookie');
    }
    assert.equal(outs.filter(l => l.answer.ended === true).length, 1, 'exactly one request ended the session');
    assert.ok(outs.every(l => l.answer.ended === true || l.answer.skipped === 'no-session'), 'the others found nothing left to end');
    const slice = await expectSignedOutAfterReload(p1, 'R9');
    assert.equal(slice.filter(l => l.kind === 'logout').length, 0, 'the reload sent no further logout: nothing was left owed');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});

// Row 10 — the pageshow handler, driven by a SYNTHETIC persisted pageshow. Headless Chromium here does not restore pages from the
// back/forward cache (probed: persisted stayed false), so a REAL restore is NOT tested; this tests the handler's behaviour only.
test('R10 pageshow (synthetic, persisted:true): a frozen tab whose session ended meanwhile re-asks the server and becomes signed out; a non-persisted pageshow does nothing', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const { ownerEmail } = await world();
    const { ctx, p1, p2, errors } = await twoTabs(env.browser, env.BASE, ownerEmail);
    // End the session WITHOUT the app's help (no settingsSignOut, so no storage event reaches tab 2): what a tab frozen in the
    // back/forward cache would have missed. An unnamed logout is the legacy request; it ends the cookie's session.
    const ended = await call(p1, 'POST', '/api/identity', { action: 'logout' });
    assert.equal(ended.status, 200); assert.equal(ended.json.ended, true);
    assert.equal(await p2.evaluate(() => !sessionSignedOut() && _serverAuthState === 'authed'), true, 'premise: tab 2 still believes it is signed in');
    const mark = state.log.length;
    await p2.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })));
    await p2.waitForTimeout(500);
    assert.equal(state.log.slice(mark).filter(l => l.kind === 'session').length, 0, 'a NON-persisted pageshow asks nothing');
    assert.equal(await p2.evaluate(() => _serverAuthState), 'authed', '…and changes nothing');
    await p2.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await p2.waitForFunction(() => _serverAuthState === 'anon', null, { timeout: 10000 });
    const sessionReads = state.log.slice(mark).filter(l => l.kind === 'session');
    assert.ok(sessionReads.length >= 1, 'a persisted pageshow re-asked the server for the session');
    assert.equal(sessionReads[sessionReads.length - 1].status, 401, 'and the server refused the ended session');
    const shell = await shellOf(p2);
    assert.equal(shell.signedOut, true, 'the restored page is signed out; the ended account is not shown');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});

// Row 11 — Clear this device from a tab that names a REPLACED session (the old id is put back by assignment, as journey 2 does,
// said plainly: that assignment is the test's, not the app's).
test('R11 "Clear this device" from a stale tab: ONE logout request naming the replaced session; the server ends the login through the lineage; the device ends signed out in both tabs', async (t) => {
  const env = await launch(t); if (!env) return;
  try {
    const { B, ownerEmail } = await world();
    const { ctx, p1, p2, errors, sid, s1 } = await twoTabs(env.browser, env.BASE, ownerEmail);
    await switchAndLearn(p1, p2, sid, B.team.id, s1);
    await p2.evaluate(old => { _authSessionId = old; window.ceConfirm = async () => true; window.__beforeReload = 1; }, s1);   // the test's assignment
    const mark = state.log.length;
    await p2.evaluate(() => { clearDeviceState(); });
    await waitFor(() => logoutsSince(mark).length >= 1, 10000);
    // clearDeviceState waits briefly for the reply, wipes, and reloads: wait for the NEW document.
    await p2.waitForFunction(() => window.__beforeReload === undefined && typeof _serverAuthState !== 'undefined' && _serverAuthState !== 'unknown', null, { timeout: 20000 });
    const outs = logoutsSince(mark);
    assertOneEndedLogout(outs, s1, 'clear this device, stale tab (named the REPLACED session; ended through the lineage)');
    const shell = await shellOf(p2);
    assert.equal(shell.signedOut, true); assert.equal(shell.auth, 'anon'); assert.equal(shell.uid, ''); assert.equal(shell.pending, null, 'nothing left owed');
    await expectSignedOutAfterReload(p1, 'R11 tab 1 (the other tab)');
    assert.equal(logoutsSince(mark).length, 1, 'still exactly one logout request');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await close(env); }
});
