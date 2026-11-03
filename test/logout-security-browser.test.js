// CD-111 — LOGOUT SECURITY in a REAL browser against the REAL handlers.
//
// The journeys that failed on the CD-110 baseline, driven end to end:
//   · Sign out with the server's logout reply still in transit — the device
//     must already be signed out: no user id (in memory or on disk), no
//     sections, no nav, no verify reminder, no "Coach dashboard · Settings"
//     topbar, no club caches.
//   · A session check in flight at sign-out — its reply must not re-adopt the
//     account when it lands.
//   · A logout the server answers 503 — the device must remember it, and a
//     refresh must finish it instead of restoring the cookie's session; once
//     the server confirms, the device is cleanly signed out.
//   · A different person logging in on the device — nothing of the previous
//     person's club caches is inherited; their own session restores on reload.
//   · A club switch with Club A's conversations reply in transit — Club B
//     starts its own request and Club A's rows never become its list.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.cd111-browser.test';
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

// Replies held IN TRANSIT: the handler has answered (what the real server
// did), the bytes have not reached the browser yet. `logoutStatus` answers the
// logout call with that status WITHOUT running the handler (the server session
// survives — a storage outage).
const holds = { session: null, logout: null, conversations: null, logoutStatus: null, log: [] };
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).split('/')[0];
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const isSessionGet = name === 'identity' && req.method === 'GET' && url.searchParams.get('action') === 'session';
    const isLogout = name === 'identity' && req.method === 'POST' && body?.action === 'logout';
    const isConvs = name === 'chat' && req.method === 'GET' && url.searchParams.get('action') === 'conversations';
    holds.log.push({ m: req.method, p: url.pathname + url.search, action: body?.action || null });
    if (isLogout && holds.logoutStatus) { res.statusCode = holds.logoutStatus; res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ ok: false, error: 'storage unavailable' })); }
    const hold = isSessionGet ? holds.session : isLogout ? holds.logout : isConvs ? holds.conversations : null;
    const vreq = { method: req.method, headers: { ...req.headers, 'x-forwarded-proto': 'http' }, query: Object.fromEntries(url.searchParams), body, url: req.url, socket: req.socket };
    const vres = { statusCode: 200,
      status(c) { this.statusCode = c; return this; }, setHeader(k, v) { res.setHeader(k, v); }, getHeader(k) { return res.getHeader(k); },
      writeHead(c, h) { res.writeHead(c, h); return this; }, write(d) { res.write(d); },
      json(d) { const sc = this.statusCode; const write = () => { res.statusCode = sc; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); };
        if (hold) hold.queue.push(write); else write(); },
      end(d) { const sc = this.statusCode; const write = () => { res.statusCode = sc; res.end(d); }; if (hold) hold.queue.push(write); else write(); },
      send(d) { this.end(typeof d === 'string' ? d : JSON.stringify(d)); } };
    const h = handlers[name];
    if (!h) { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
    try { await h(vreq, vres); } catch { res.statusCode = 500; res.end('{}'); }
    return;
  }
  const f = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  try { res.setHeader('content-type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
});
const releaseAll = key => { const q = holds[key].queue.splice(0); holds[key] = null; q.forEach(w => w()); };
const waitFor = async (fn, ms = 10000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('waitFor timeout'); await new Promise(r => setTimeout(r, 25)); } };

const PW = 'password123';
let seq = 0;
const kkey = () => String(seq++).padStart(2, '0').repeat(10);
const structureFor = (names) => ({
  version: 1,
  groups: [{ id: 'grp_initial', name: 'Seniors', type: 'general', status: 'active' }],
  teams: names.map((name, i) => ({ id: i === 0 ? 'team_initial' : `team_${name.toLowerCase().replace(/\W+/g, '_')}`, groupId: 'grp_initial', name, status: 'active' })),
});
const PENDING_KEY = 'coach-eye-logout-pending';

test('browser: sign-out ends the local session at once, discards a stale session reply, survives a failed logout, and leaves nothing for the next person', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const ownerEmail = 'owner.cd111@x.test', coach2Email = 'coach2.cd111@x.test';
  // A self-service club: its founder is unverified, so every session answer
  // carries the verify reminder (rendered with the founder's address).
  const A = await S.createClub({ clubName: 'Alpha Rugby Club', teamName: 'Seniors', sport: 'Rugby', name: 'Alpha Owner', email: ownerEmail, password: PW, idempotencyKey: kkey() });
  await saveClubStructure(A.team.id, structureFor(['Alpha Premier', 'Alpha Development']));
  // A second coach in the same club.
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token: 'TKCOACH2CD111', email: coach2Email, name: 'Second Coach', role: 'coach', teamId: A.team.id, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  const C2 = await S.claimInvite({ token: 'TKCOACH2CD111', email: coach2Email, name: 'Second Coach', password: PW, position: '' });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const shell = () => page.evaluate((KEY) => {
      const txt = id => (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim();
      let lsUid = 'ERR'; try { lsUid = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').currentUserId ?? ''; } catch {}
      let pending = 'ERR'; try { pending = localStorage.getItem(KEY); } catch {}
      return { signedOut: sessionSignedOut(), uid: state.currentUserId, auth: _serverAuthState, lsUid, pending,
        welcome: !!document.getElementById('ce-welcome'), pageTitle: txt('pageTitle'), eyebrow: txt('eyebrow'),
        coachNavButtons: document.querySelectorAll('#coachNav button').length,
        banner: document.getElementById('verify-email-banner')?.textContent || null,
        sections: [...document.querySelectorAll('.section')].filter(s => s.innerHTML.trim()).map(s => s.id),
        caches: { attendance: _attendance === null ? null : 'held', mcTeams: _mcTeams === null ? null : 'held', epoch: _clubEpoch, perms: _myPermissions === null ? null : 'held' } };
    }, PENDING_KEY);
    const dismissSetup = () => page.evaluate(() => { try { sessionStorage.setItem('ce-setup-skipped', '1'); } catch {} document.getElementById('first-run-modal')?.remove(); });
    const login = async (email) => {
      if (await page.$('#ce-welcome')) await page.click('#ce-welcome button:has-text("Log in")');
      else await page.evaluate(() => { authTab = 'login'; renderNav(); });
      await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
      await page.fill('#identityLoginEmail', email); await page.fill('#identityLoginPassword', PW); await page.click('#identityLoginBtn');
      await page.waitForFunction(() => !sessionSignedOut() && _serverAuthState === 'authed' && !!state.stateTeamId, null, { timeout: 20000 });
      await dismissSetup();
    };
    const populate = async () => {
      await page.evaluate(() => setSection('coach', 'training')); await page.evaluate(() => loadAttendance());
      await page.waitForFunction(() => _attendance !== null, null, { timeout: 20000 });
      await page.evaluate(() => setSection('coach', 'matchday')); await page.waitForFunction(() => _mcTeams !== null, null, { timeout: 20000 });
      await page.evaluate(() => setSection('coach', 'settings'));
    };
    const overrideConfirm = () => page.evaluate(() => { window.ceConfirm = async () => true; });
    const waitSignedOut = () => page.waitForFunction(() => sessionSignedOut(), null, { timeout: 10000 });

    // ── 1. Signed in, verify reminder up (session payload), caches filled ──
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ce-welcome', { timeout: 20000 });
    await login(ownerEmail);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => _serverAuthState === 'authed' && !!document.getElementById('verify-email-banner'), null, { timeout: 20000 });
    await dismissSetup(); await populate();
    const before = await shell();
    assert.equal(before.signedOut, false); assert.equal(before.uid, A.user.id); assert.equal(before.lsUid, A.user.id);
    assert.ok(before.banner.includes(ownerEmail), 'baseline: the verify reminder shows the founder\'s address while signed in');
    assert.equal(before.caches.attendance, 'held'); assert.equal(before.caches.mcTeams, 'held'); assert.equal(before.pageTitle, 'Settings');

    // ── 2. The REAL Sign out button and the REAL confirm, the logout reply held in transit ──
    holds.logout = { queue: [] };
    await page.click('#coach-settings button:has-text("Sign out")');
    await page.waitForSelector('#ce-modal-ok', { timeout: 5000 });
    await page.click('#ce-modal-ok');
    await waitSignedOut();                                                     // BEFORE the server has answered
    await waitFor(() => holds.logout.queue.length === 1, 5000);
    let s = await shell();
    assert.equal(s.uid, '', 'no user id in memory'); assert.equal(s.lsUid, '', 'no user id on disk'); assert.equal(s.auth, 'anon');
    assert.deepEqual(s.sections, [], 'every authenticated section is empty'); assert.equal(s.coachNavButtons, 0); assert.ok(s.welcome, 'the front door is up');
    assert.equal(s.banner, null, 'the verify reminder — and the address in it — is gone');
    assert.notEqual(s.pageTitle, 'Settings', 'the topbar no longer names the authenticated screen'); assert.notEqual(s.eyebrow, 'Coach dashboard');
    assert.equal(s.caches.attendance, null, 'the register is forgotten'); assert.equal(s.caches.mcTeams, null, 'the sides are forgotten'); assert.equal(s.caches.perms, null);
    assert.ok(s.caches.epoch > before.caches.epoch, 'the club epoch advanced: replies still out for the account that left are discarded');
    assert.equal(s.pending, '1', 'the logout is remembered BEFORE the server answers (a tab closed now cannot lose it — Loop 3)');
    releaseAll('logout');
    await page.waitForTimeout(300);
    assert.equal((await shell()).pending, null, 'a confirmed logout leaves nothing to retry');

    // ── 3. A session check in flight at sign-out: its 200 for the old account lands after ──
    await login(ownerEmail);
    holds.session = { queue: [] };
    await page.evaluate(() => { checkServerSession().catch(() => {}); });
    await waitFor(() => holds.session.queue.length >= 1);
    await overrideConfirm(); await page.evaluate(() => { settingsSignOut(); }); await waitSignedOut();
    releaseAll('session');
    await page.waitForTimeout(600);
    s = await shell();
    assert.equal(s.uid, '', 'the stale session reply does not re-adopt the account'); assert.equal(s.lsUid, ''); assert.equal(s.auth, 'anon');
    assert.deepEqual(s.sections, []); assert.equal(s.banner, null); assert.ok(s.signedOut);

    // ── 4. The server cannot confirm the logout (503): remembered; a refresh finishes it instead of restoring the cookie ──
    await login(ownerEmail);
    holds.logoutStatus = 503;
    await overrideConfirm(); await page.evaluate(() => { settingsSignOut(); }); await waitSignedOut();
    await page.waitForTimeout(300);
    s = await shell();
    assert.equal(s.uid, ''); assert.equal(s.pending, '1', 'the unconfirmed logout is remembered on the device');
    let mark = holds.log.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitFor(() => holds.log.slice(mark).some(l => l.action === 'logout'), 20000);   // the boot retries the logout first
    await page.waitForTimeout(400);
    s = await shell();
    assert.ok(s.signedOut, 'still signed out after the refresh'); assert.equal(s.uid, '');
    assert.equal(holds.log.slice(mark).filter(l => /action=session/.test(l.p)).length, 0, 'no session is asked for while the logout is unconfirmed (the server would have answered 200)');
    assert.equal(s.pending, '1', 'still remembered');
    holds.logoutStatus = null; mark = holds.log.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitFor(() => holds.log.slice(mark).some(l => /action=session/.test(l.p)), 20000);
    await page.waitForFunction(() => _serverAuthState !== 'unknown', null, { timeout: 20000 });
    s = await shell();
    const since = holds.log.slice(mark);
    assert.ok(since.findIndex(l => l.action === 'logout') < since.findIndex(l => /action=session/.test(l.p)), 'the logout is confirmed BEFORE the session is asked for');
    assert.ok(s.signedOut); assert.equal(s.auth, 'anon', 'the server refuses the destroyed session'); assert.equal(s.pending, null, 'nothing left to retry');

    // ── 5. A different person on the device inherits nothing; their own session restores on reload ──
    await login(ownerEmail); await populate();
    await page.evaluate(() => { _attendance.__ownerTag = 1; _mcTeams.__ownerTag = 1; });   // mark THIS person's cached objects
    await overrideConfirm(); await page.evaluate(() => { settingsSignOut(); }); await waitSignedOut();
    assert.equal((await shell()).caches.attendance, null, 'sign-out forgot the register'); assert.equal((await shell()).caches.mcTeams, null, 'and the sides');
    await login(coach2Email);
    s = await shell();
    // Whatever coach2's own renders have read since is theirs; nothing of the owner's objects may remain.
    const inherited = await page.evaluate(() => ({ register: !!(_attendance && _attendance.__ownerTag), sides: !!(_mcTeams && _mcTeams.__ownerTag) }));
    assert.equal(s.uid, C2.user.id);
    assert.equal(inherited.register, false, 'the previous person\'s register is not inherited');
    assert.equal(inherited.sides, false, 'nor their Match Centre sides');
    assert.equal(s.banner, null, 'the founder\'s reminder is not theirs');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => _serverAuthState === 'authed', null, { timeout: 20000 });
    s = await shell();
    assert.equal(s.signedOut, false, 'legitimate restore still works'); assert.equal(s.uid, C2.user.id); assert.equal(s.pending, null);
    await overrideConfirm(); await page.evaluate(() => { settingsSignOut(); }); await waitSignedOut();

    // ── 6. "Log out & clear this device" with the logout reply held: local session ends at once, the device reloads signed out ──
    await login(ownerEmail);
    holds.logout = { queue: [] };
    mark = holds.log.length;
    await overrideConfirm(); await page.evaluate(() => { clearDeviceState(); });
    await waitSignedOut();                                                     // before the server answered, before the reload
    s = await shell();
    assert.equal(s.uid, ''); assert.deepEqual(s.sections, [], 'the shell is gone before the server answers');
    assert.equal(s.pending, '1', 'the logout is remembered before it left');
    assert.ok(holds.log.slice(mark).filter(l => l.action === 'logout').length >= 1, 'the logout request reached the server');
    // The bounded wait runs out: the device wipes, re-arms the marker and
    // reloads. The reload's boot finishes the remembered logout FIRST — its
    // request reaches the server (held as well) before any session is asked for.
    await waitFor(() => holds.log.slice(mark).filter(l => l.action === 'logout').length >= 2, 20000);
    assert.equal(holds.log.slice(mark).filter(l => /action=session/.test(l.p)).length, 0, 'no session is asked for before the logout is confirmed');
    releaseAll('logout');                                                      // both replies: the old page's (gone) and the boot's
    await page.waitForFunction(() => typeof _serverAuthState !== 'undefined' && _serverAuthState !== 'unknown', null, { timeout: 20000 });
    s = await shell();
    assert.ok(s.signedOut, 'signed out after the reload'); assert.equal(s.uid, ''); assert.equal(s.auth, 'anon', 'the server refuses the destroyed session');
    assert.equal(s.pending, null, 'the remembered logout was finished at boot');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
});

test('browser: a club switch with Club A\'s conversations reply in transit — Club B asks for its own list and Club A\'s rows never become it', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const email = 'owner2.cd111@x.test';
  const A = await S.createClub({ clubName: 'Charlie Rugby Club', teamName: 'Seniors', sport: 'Rugby', name: 'Charlie Owner', email, password: PW, idempotencyKey: kkey() });
  const B = await S.createClub({ clubName: 'Delta Rugby Club', teamName: 'Seniors', sport: 'Rugby', name: 'Delta Owner', email: 'delta.cd111@x.test', password: PW, idempotencyKey: kkey() });
  const members = await S.loadTeamMembers();
  members.push({ id: 'tm_cd111_b', teamId: B.team.id, userId: A.user.id, role: 'coach', staffLevel: 'head', status: 'active', joinedAt: '2026-01-01T00:00:00.000Z' });
  await S.withIdentityLock(() => S.saveTeamMembers(members));
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ce-welcome', { timeout: 20000 });
    await page.click('#ce-welcome button:has-text("Log in")');
    await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
    await page.fill('#identityLoginEmail', email); await page.fill('#identityLoginPassword', PW); await page.click('#identityLoginBtn');
    await page.waitForFunction(() => !sessionSignedOut() && _serverAuthState === 'authed' && !!state.stateTeamId, null, { timeout: 20000 });
    await page.waitForSelector('#clubSwitchSelect', { state: 'visible', timeout: 20000 });
    if ((await page.evaluate(() => state.stateTeamId)) !== A.team.id) {
      await page.selectOption('#clubSwitchSelect', A.team.id);
      await page.waitForFunction(id => state.stateTeamId === id, A.team.id, { timeout: 20000 });
    }
    await page.evaluate(() => { try { sessionStorage.setItem('ce-setup-skipped', '1'); } catch {} document.getElementById('first-run-modal')?.remove(); });
    // A conversation that exists ONLY in Club A.
    const created = await page.evaluate(async () => (await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_group', name: 'Charlie Only Group' }) })).status);
    assert.equal(created, 200);
    await page.evaluate(() => setSection('coach', 'messages'));
    await page.evaluate(() => chatFetchConversations(true));
    await page.waitForFunction(() => _chatConversationsLoaded === true && _chatConversations.some(c => /Charlie Only/.test(c.name || c.title || '')), null, { timeout: 20000 });
    // Club A's request leaves and its reply is held in transit …
    holds.conversations = { queue: [] };
    await page.evaluate(() => { chatFetchConversations(true).catch(() => {}); });
    await waitFor(() => holds.conversations.queue.length >= 1);
    const mark = holds.log.length;
    // … the owner switches to Club B.
    await page.selectOption('#clubSwitchSelect', B.team.id);
    await page.waitForFunction(id => state.stateTeamId === id, B.team.id, { timeout: 20000 });
    // Club B asked for its own list: a NEW latch for the new context, never Club A's.
    await page.waitForFunction(() => !!_chatConversationsInFlight && _chatConversationsInFlight.epoch === _clubEpoch, null, { timeout: 10000 });
    const latch = await page.evaluate(() => ({ epoch: _chatConversationsInFlight.epoch, clubEpoch: _clubEpoch, sinceSwitch: _clubEpoch }));
    assert.equal(latch.epoch, latch.clubEpoch, 'Club B\'s request belongs to the new context (it did not join Club A\'s)');
    // Chrome parks a second GET for the IDENTICAL URL on its HTTP cache lock
    // until the first has answered, so Club B's request reaches the server
    // only once Club A's held reply is released. The queue is FIFO: the first
    // held reply is Club A's.
    const clubAReply = holds.conversations.queue.shift(); clubAReply();          // Club A's reply lands — under Club B
    await page.waitForTimeout(200);
    const afterA = await page.evaluate(() => ({ convs: _chatConversations.map(c => c.name || c.title || c.id), loaded: _chatConversationsLoaded, club: state.stateTeamId }));
    assert.equal(afterA.club, B.team.id);
    assert.ok(!afterA.convs.some(n => /Charlie Only/.test(n)), `Club A's rows are not Club B's list (saw ${JSON.stringify(afterA.convs)})`);
    assert.equal(afterA.loaded, false, 'Club A\'s reply did not "load" Club B\'s list');
    // Club B's own request now reaches the server (and is held) …
    await waitFor(() => holds.conversations.queue.length >= 1, 10000);
    assert.ok(holds.log.slice(mark).some(l => /action=conversations/.test(l.p)), 'Club B\'s own conversations request reached the server');
    // … and its reply is the list.
    releaseAll('conversations');
    await page.waitForFunction(() => _chatConversationsLoaded === true, null, { timeout: 20000 });
    const afterB = await page.evaluate(() => _chatConversations.map(c => c.name || c.title || c.id));
    assert.ok(!afterB.some(n => /Charlie Only/.test(n)), 'Club B\'s list is its own');
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
});
