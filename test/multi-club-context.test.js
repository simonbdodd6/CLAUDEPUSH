/**
 * WHICH CLUB A MULTI-CLUB ACCOUNT LOGS INTO.
 *
 * An administrator who holds memberships in two clubs — the legacy club and
 * a club he founded himself — chose the new club, set it up, came back the
 * next day and was in the legacy club again. Reproduced against the real
 * store: `switch_team` and session resolution were both sound (a refresh
 * stayed put); it was LOGIN that threw the choice away. Its first preference
 * was `input.teamId || DEFAULT_TEAM.id`, and the client sends no teamId — so
 * DEFAULT_TEAM, the hard-coded 'boitsfort-rfc', won for every account holding
 * an active membership there, whatever else they belonged to.
 *
 * Nothing about this is platform-admin specific: platform authority is a user
 * fact and never took part in the resolution. It is also not about one club —
 * the same line decides for every multi-club account.
 *
 * The club a session is opened in is now remembered on the account, so login
 * returns the account to the club it last operated. DEFAULT_TEAM remains the
 * fallback for accounts that have never chosen, so nothing changes for
 * single-club or first-time users.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.multi-club.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
delete process.env.VERCEL; delete process.env.NODE_ENV;

const kv = new Map(), lists = new Map();
globalThis.fetch = async (url, options = {}) => {
  const u = String(url || '');
  if (!u.startsWith(process.env.UPSTASH_REDIS_REST_URL)) throw new Error('unexpected fetch ' + u);
  let p; try { p = JSON.parse(options.body || '[]'); } catch { p = null; }
  if (!Array.isArray(p)) return { ok: true, json: async () => ({ result: null }) };
  const [cmd, ...a] = p; let result = null;
  if (cmd === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (cmd === 'SET') { if (String(a[2] || '').toUpperCase() === 'NX' && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; } }
  if (cmd === 'DEL') { kv.delete(a[0]); result = 1; }
  if (cmd === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = (lists.get(a[0]) || []).slice(Number(a[1]), Number(a[2]) + 1);
  if (cmd === 'LTRIM' || cmd === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const S = await import('../api/_identityStore.js');
const PW = 'password123';
let seq = 0;
const kkey = () => String(seq++).padStart(2, '0').repeat(10);

/** A club founded by this account, exactly as the wizard creates one. */
const foundClub = (clubName, email, name = 'Owner') =>
  S.createClub({ clubName, teamName: 'First XV', sport: 'Rugby', name, email, password: PW, idempotencyKey: kkey() });

/** An ACTIVE membership row in another club — the shape production's legacy club has. */
async function joinExisting(userId, teamId, role = 'coach') {
  const members = await S.loadTeamMembers();
  members.push({ id: 'tm_' + (seq++) + '_' + teamId, teamId, userId, role,
    staffLevel: role === 'coach' ? 'head' : null, status: 'active', joinedAt: '2026-01-01T00:00:00.000Z' });
  await S.saveTeamMembers(members);
}
const clubOf = r => r.teamMember.teamId;
const login = email => S.loginUser({ email, password: PW });

// ── 1. a single-club account is untouched ─────────────────────────────────
test('1. a single-club account still lands in its only club', async () => {
  const email = 'solo@x.test';
  const club = await foundClub('Solo Rugby Club', email);
  assert.equal(clubOf(await login(email)), club.team.id);
  assert.equal(clubOf(await login(email)), club.team.id, 'and again on every later login');
});

test('1. an account that has never chosen still prefers the default club', async () => {
  // The rule DEFAULT_TEAM answered for is kept: an account with no remembered
  // club, holding a membership there, still lands there. Nothing changes for
  // anyone who was working before this build.
  const email = 'legacy-only@x.test';
  const club = await foundClub('Legacy Only Club', email);
  await joinExisting(club.user.id, 'boitsfort-rfc');
  const users = await S.loadUsers();
  users.forEach(u => { if (u.id === club.user.id) delete u.lastTeamId; });
  await S.saveUsers(users);
  assert.equal(clubOf(await login(email)), 'boitsfort-rfc', 'the default club still wins when nothing was chosen');
});

// ── 2 + 8. the reported journey ───────────────────────────────────────────
test('2 + 8. the club an account chooses is the club it comes back to', async () => {
  const email = 'multi@x.test';
  const mine = await foundClub('Club Deportivo Madrid', email, 'Multi Admin');
  await joinExisting(mine.user.id, 'boitsfort-rfc');            // …and the legacy club

  // Founding a club puts the founder IN it, and that is where login returns.
  assert.equal(clubOf(await login(email)), mine.team.id, 'the founder is not thrown back to the legacy club');

  // Choose the legacy club, and that choice is what persists.
  const a = await login(email);
  await S.switchTeam(a.session.token, 'boitsfort-rfc');
  assert.equal(clubOf(await login(email)), 'boitsfort-rfc', 'the chosen club is remembered');

  // Choose back.
  const b = await login(email);
  const sw = await S.switchTeam(b.session.token, mine.team.id);
  assert.equal(sw.teamId, mine.team.id);
  assert.equal(clubOf(await login(email)), mine.team.id, 'and so is the next choice');
});

test('8. a founder membership is owner-shaped, and it is the one that resolves', async () => {
  const email = 'founder@x.test';
  const mine = await foundClub('Founders Rugby Club', email, 'Founder Person');
  await joinExisting(mine.user.id, 'boitsfort-rfc');
  const me = (await S.loadTeamMembers()).filter(m => m.userId === mine.user.id);
  const owner = me.find(m => m.teamId === mine.team.id);
  assert.ok(owner.isOwner, 'the founder owns the club they created');
  assert.equal(owner.status, 'active');
  assert.equal(clubOf(await login(email)), mine.team.id);
});

// ── 3. platform admin ─────────────────────────────────────────────────────
async function makePlatformAdmin(userId) {
  const users = await S.loadUsers();
  const u = users.find(x => x.id === userId);
  u.platformRole = 'platform_admin';
  await S.saveUsers(users);
}

test('3. a platform admin chooses clubs the same way, and stays a platform admin', async () => {
  const email = 'platform@x.test';
  const mine = await foundClub('Platform Admin Club', email, 'Platform Person');
  await joinExisting(mine.user.id, 'boitsfort-rfc');
  await makePlatformAdmin(mine.user.id);

  const first = await login(email);
  assert.equal(clubOf(first), mine.team.id, 'platform authority does not redirect the club');
  assert.equal((await S.loadUsers()).find(u => u.id === mine.user.id).platformRole, 'platform_admin',
    'and is not touched by logging in');

  await S.switchTeam(first.session.token, 'boitsfort-rfc');
  const second = await login(email);
  assert.equal(clubOf(second), 'boitsfort-rfc', 'it can choose the legacy club');
  assert.equal((await S.loadUsers()).find(u => u.id === mine.user.id).platformRole, 'platform_admin',
    'still a platform admin after switching clubs');

  await S.switchTeam(second.session.token, mine.team.id);
  assert.equal(clubOf(await login(email)), mine.team.id, 'and its own club again');
});

test('3. platform authority never took part in the club resolution — the code says so', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../api/_identityStore.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export async function loginUser'), src.indexOf('\n}', src.indexOf('export async function loginUser')));
  assert.doesNotMatch(body, /platformRole|platform_admin|isPlatformAdmin/, 'login does not consult platform authority');
  assert.doesNotMatch(body, /@|\.test\b|gmail/i, 'and no address-specific behaviour');
});

// ── 4 + 5. refresh and navigation ─────────────────────────────────────────
test('4. a refresh of the switched session stays in the chosen club', async () => {
  const email = 'refresh@x.test';
  const mine = await foundClub('Refresh Rugby Club', email);
  await joinExisting(mine.user.id, 'boitsfort-rfc');
  const s = await login(email);
  const sw = await S.switchTeam(s.session.token, 'boitsfort-rfc');
  for (let i = 0; i < 3; i++) {                       // every later page load reads the same session
    const again = await S.resolveSession(sw.session.token);
    assert.equal(again.teamMember.teamId, 'boitsfort-rfc');
    assert.equal(again.memberships.find(m => m.current).teamId, 'boitsfort-rfc');
  }
});

test('5. the club is a session fact, so no amount of reading moves it', async () => {
  const email = 'nav@x.test';
  const mine = await foundClub('Navigation Rugby Club', email);
  await joinExisting(mine.user.id, 'boitsfort-rfc');
  const s = await login(email);
  const sw = await S.switchTeam(s.session.token, mine.team.id);
  const reads = await Promise.all(Array.from({ length: 5 }, () => S.resolveSession(sw.session.token)));
  assert.deepEqual([...new Set(reads.map(r => r.teamMember.teamId))], [mine.team.id],
    'every read of the session names the same club');
});

// ── 6 + 7. a club the account does not belong to ──────────────────────────
test('6. an account cannot select a club it has no membership in', async () => {
  const mineEmail = 'outsider@x.test';
  const mine = await foundClub('Outsider Rugby Club', mineEmail);
  const theirs = await foundClub('Private Rugby Club', 'private@x.test');
  const s = await login(mineEmail);
  await assert.rejects(() => S.switchTeam(s.session.token, theirs.team.id),
    e => e.status === 403 && /membership/i.test(e.message), 'refused');
  const still = await S.resolveSession(s.session.token);
  assert.equal(still.teamMember.teamId, mine.team.id, 'and the refusal did not destroy the session it already had');
  assert.equal(clubOf(await login(mineEmail)), mine.team.id, 'nor change where login goes');
});

test('6. a platform admin is NOT a member of every club', async () => {
  const email = 'platform2@x.test';
  const mine = await foundClub('Platform Two Club', email);
  const theirs = await foundClub('Someone Elses Club', 'elses@x.test');
  await makePlatformAdmin(mine.user.id);
  const s = await login(email);
  await assert.rejects(() => S.switchTeam(s.session.token, theirs.team.id), e => e.status === 403,
    'platform authority is not club membership');
  const me = await S.resolveSession(s.session.token);
  assert.deepEqual(me.memberships.map(m => m.teamId), [mine.team.id], 'and it lists only the clubs it belongs to');
});

test('7. the session carries ONE club, and its permissions belong to that club', async () => {
  const email = 'isolation@x.test';
  const mine = await foundClub('Isolation Rugby Club', email);
  await joinExisting(mine.user.id, 'boitsfort-rfc', 'player');
  const s = await login(email);

  const inMine = await S.resolveSession(s.session.token);
  assert.equal(inMine.teamMember.teamId, mine.team.id);
  assert.equal(inMine.teamMember.role, 'coach', 'the owner role in his own club');
  assert.equal(inMine.memberships.filter(m => m.current).length, 1, 'exactly one club is current');

  const sw = await S.switchTeam(s.session.token, 'boitsfort-rfc');
  const inLegacy = await S.resolveSession(sw.session.token);
  assert.equal(inLegacy.teamMember.teamId, 'boitsfort-rfc');
  assert.equal(inLegacy.teamMember.role, 'player', 'and the PLAYER role in the club he only plays for');
  assert.ok(!inLegacy.permissions.includes('manage_players'),
    'a coach in one club does not carry coach permissions into another');
  assert.equal(inLegacy.memberships.filter(m => m.current).length, 1);
  // The old session is gone: switching re-issues it rather than holding two.
  assert.equal(await S.resolveSession(s.session.token), null, 'the pre-switch token no longer resolves');
});

// ── the remembered club is a club the account still belongs to ────────────
test('a remembered club that is no longer valid is ignored, not obeyed', async () => {
  const email = 'stale@x.test';
  const mine = await foundClub('Stale Memory Club', email);
  await joinExisting(mine.user.id, 'boitsfort-rfc');
  const s = await login(email);
  await S.switchTeam(s.session.token, 'boitsfort-rfc');        // remembered: the legacy club

  // The membership is then withdrawn (the account left that club).
  const members = await S.loadTeamMembers();
  members.forEach(m => { if (m.userId === mine.user.id && m.teamId === 'boitsfort-rfc') m.status = 'removed'; });
  await S.saveTeamMembers(members);

  assert.equal(clubOf(await login(email)), mine.team.id,
    'login falls through to a club the account really belongs to');
});

test('an explicitly requested club outranks the remembered one', async () => {
  // No caller asks for a club by name today, but the order is the contract:
  // what this login asked for beats what the last one happened to do.
  const email = 'explicit@x.test';
  const mine = await foundClub('Explicit Rugby Club', email);
  await joinExisting(mine.user.id, 'boitsfort-rfc');
  const s = await login(email);
  await S.switchTeam(s.session.token, 'boitsfort-rfc');          // remembered: the legacy club
  const asked = await S.loginUser({ email, password: PW, teamId: mine.team.id });
  assert.equal(asked.teamMember.teamId, mine.team.id, 'the requested club wins');
  // …and only ever a club the account is really active in.
  const other = await foundClub('Unrelated Rugby Club', 'unrelated@x.test');
  const fallback = await S.loginUser({ email, password: PW, teamId: other.team.id });
  assert.notEqual(fallback.teamMember.teamId, other.team.id, 'asking for a club you do not belong to grants nothing');
});

test('login records the club it opened, so the record cannot drift from reality', async () => {
  const email = 'record@x.test';
  const mine = await foundClub('Recording Rugby Club', email);
  await joinExisting(mine.user.id, 'boitsfort-rfc');
  // Forget everything: an account created before this field existed.
  let users = await S.loadUsers();
  users.forEach(u => { if (u.id === mine.user.id) delete u.lastTeamId; });
  await S.saveUsers(users);

  const first = await login(email);                     // resolves through the default club
  assert.equal(first.teamMember.teamId, 'boitsfort-rfc');
  users = await S.loadUsers();
  assert.equal(users.find(u => u.id === mine.user.id).lastTeamId, 'boitsfort-rfc',
    'the club this login opened is the club it records');

  // An explicitly requested club is recorded as the choice it is.
  await S.loginUser({ email, password: PW, teamId: mine.team.id });
  users = await S.loadUsers();
  assert.equal(users.find(u => u.id === mine.user.id).lastTeamId, mine.team.id);
});

test('no path ever records a blank club', async () => {
  const stored = (await S.loadUsers()).map(u => u.lastTeamId).filter(v => v !== undefined);
  assert.ok(stored.length > 0, 'the field is in use by now');
  for (const v of stored) {
    assert.equal(typeof v, 'string');
    assert.ok(v.trim().length > 0, 'a blank club is not a choice: ' + JSON.stringify(v));
  }
});

test('the remembered club is stored on the account, and only ever a club id', async () => {
  const email = 'shape@x.test';
  const mine = await foundClub('Shape Rugby Club', email);
  await joinExisting(mine.user.id, 'boitsfort-rfc');
  const s = await login(email);
  await S.switchTeam(s.session.token, 'boitsfort-rfc');
  const u = (await S.loadUsers()).find(x => x.id === mine.user.id);
  assert.equal(u.lastTeamId, 'boitsfort-rfc');
  assert.equal(typeof u.lastTeamId, 'string');
  // It is not a credential and never leaves as one.
  const pub = S.publicUser(u);
  assert.equal(pub.passwordHash, undefined);
  assert.equal(pub.lastTeamId, 'boitsfort-rfc', 'it is ordinary account data');
});

// ── the real app ──────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

const handlers = {};
for (const name of ['identity', 'invite', 'config', 'publish', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe']) {
  handlers[name] = (await import(`../api/${name}.js`)).default;
}
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
/** Vercel-style req/res over node's http, so the handlers run unmodified. */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).split('/')[0];
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const vreq = { method: req.method, headers: { ...req.headers, 'x-forwarded-proto': 'http' }, query: Object.fromEntries(url.searchParams), body, url: req.url, socket: req.socket };
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

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): an admin of two clubs works in the one they chose`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;
    const email = `browser.${view}@x.test`;
    // Two clubs: one founded here, plus an active membership in the legacy club.
    const home = await foundClub(`Browser ${view} Home Club`, email, 'Browser Admin');
    await joinExisting(home.user.id, 'boitsfort-rfc');
    await makePlatformAdmin(home.user.id);
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const ctxOf = () => page.evaluate(() => ({
        state: state.stateTeamId,
        current: (_myMemberships || []).find(m => m.current)?.teamId || null,
        options: (_myMemberships || []).map(m => m.teamId),
        platform: _myPlatformRole || '',
      }));

      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ce-welcome', { timeout: 20000 });
      await page.click('#ce-welcome button:has-text("Log in")');
      await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
      await page.fill('#identityLoginEmail', email);
      await page.fill('#identityLoginPassword', PW);
      await page.click('#identityLoginBtn');
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId, null, { timeout: 20000 });
      await page.waitForTimeout(700);

      // 1-2. logged in, and BOTH clubs are on offer.
      let c = await ctxOf();
      assert.equal(c.state, home.team.id, 'login opens the club the account last operated — the one it founded');
      assert.equal(c.current, home.team.id);
      assert.deepEqual([...c.options].sort(), [home.team.id, 'boitsfort-rfc'].sort(), 'both memberships are listed');
      assert.equal(c.platform, 'platform_admin', 'and the account is still a platform admin');
      const switcher = await page.$('#teamSwitcher select');
      assert.ok(switcher, 'the club switcher is on screen for a multi-club account');
      assert.equal(await page.evaluate(() => document.querySelector('#teamSwitcher select').value), home.team.id,
        'showing the club actually in force');

      // 3-4. choose the OTHER club.
      await page.selectOption('#teamSwitcher select', 'boitsfort-rfc');
      await page.waitForFunction(() => state.stateTeamId === 'boitsfort-rfc', null, { timeout: 20000 });
      c = await ctxOf();
      assert.equal(c.current, 'boitsfort-rfc', 'the server agrees which club is current');

      // 5. navigate. The club must survive every section and every render.
      for (const section of ['overview', 'members', 'training', 'settings', 'overview']) {
        await page.evaluate(s => setSection('coach', s), section);
        await page.waitForTimeout(220);
        const after = await ctxOf();
        assert.equal(after.state, 'boitsfort-rfc', `still the chosen club after opening ${section}`);
        assert.equal(after.current, 'boitsfort-rfc', `and the server still says so after ${section}`);
      }

      // 6. refresh.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId, null, { timeout: 20000 });
      await page.waitForTimeout(700);
      c = await ctxOf();
      assert.equal(c.state, 'boitsfort-rfc', 'a refresh does not revert the club');
      assert.equal(c.current, 'boitsfort-rfc');

      // 7. choose back, and the app follows.
      await page.selectOption('#teamSwitcher select', home.team.id);
      await page.waitForFunction(id => state.stateTeamId === id, home.team.id, { timeout: 20000 });
      c = await ctxOf();
      assert.equal(c.current, home.team.id, 'and back again');
      assert.equal(c.platform, 'platform_admin', 'platform authority survived both switches');

      assert.deepEqual(errors, [], 'no page errors');
      assert.ok(await page.evaluate(() => (document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0),
        'no horizontal overflow');
      assert.ok(await page.isVisible('#coachNav'), 'navigation is intact');
      await ctx.close();
    } finally { await browser.close(); await new Promise(r => server.close(r)); }
  });
}
