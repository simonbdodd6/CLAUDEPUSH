/**
 * A NEWLY CREATED CLUB, AND THE ONE NAME IT SHOULD HAVE.
 *
 * A club born through the wizard gets a team record and an owner membership
 * and nothing else — no club-config record, and deliberately no players,
 * fixtures, sessions or branding. That is right: every consumer of the
 * club-config treats its absence as an empty object and behaves honestly, so
 * forcing one into existence would only duplicate a value the team record
 * already owns.
 *
 * What was NOT right is that the duplicate could drift. The club name lives on
 * the team record (canonical: it is what memberships, the club switcher and
 * every session payload report) while Settings wrote only the club-config. So
 * a founder who renamed their club saw the new name in the sidebar and the old
 * one in the switcher, for ever. Proved against the real handlers before
 * changing anything:
 *
 *   created   team.name "Original Rugby Club"   club-config: null
 *   renamed   team.name "Original Rugby Club"   club-config: "Renamed Rugby Club"
 *
 * A settings save now renames the tenant with it, under the same uniqueness
 * policy club creation enforces. One name, one writer, every surface agreeing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.new-club.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
delete process.env.VERCEL; delete process.env.NODE_ENV;

const kv = new Map(), lists = new Map();
const writes = [];                                   // every key a SET touched, in order
globalThis.fetch = async (url, options = {}) => {
  const u = String(url || '');
  if (!u.startsWith(process.env.UPSTASH_REDIS_REST_URL)) throw new Error('unexpected fetch ' + u);
  let p; try { p = JSON.parse(options.body || '[]'); } catch { p = null; }
  if (!Array.isArray(p)) return { ok: true, json: async () => ({ result: null }) };
  const [cmd, ...a] = p; let result = null;
  if (cmd === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (cmd === 'SET') { writes.push(a[0]); if (String(a[2] || '').toUpperCase() === 'NX' && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; } }
  if (cmd === 'DEL') { kv.delete(a[0]); result = 1; }
  if (cmd === 'SCAN' || cmd === 'KEYS') {
    // Upstash answers SCAN with [cursor, keys] and the real kvScanKeys loops
    // until the cursor is '0'. A flat key list here made it read the first KEY
    // as the cursor and spin for ever — an infinite loop of resolved awaits
    // that starves every timer in the process, so no test timeout can fire.
    // One page, cursor '0', filtered by the MATCH glob exactly as Redis does.
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

const S = await import('../api/_identityStore.js');
const publish = (await import('../api/publish.js')).default;
const PW = 'password123';
let seq = 0;
const kkey = () => String(seq++).padStart(2, '0').repeat(10);

const found = (clubName, email, idem = kkey()) =>
  S.createClub({ clubName, teamName: 'First XV', sport: 'Rugby', name: 'Owner Person', email, password: PW, idempotencyKey: idem });

/** The real publish handler, called as a signed-in member of that club. */
function api(token, method, query, body) {
  return new Promise(res => {
    const out = { code: 200, body: null };
    const vres = { statusCode: 200, status(c) { this.statusCode = c; return this; },
      setHeader() {}, getHeader() {},
      json(d) { out.code = this.statusCode; out.body = d; res(out); },
      end(d) { out.code = this.statusCode; out.body = d; res(out); },
      send(d) { this.end(d); } };
    publish({ method, headers: { cookie: 'ce_session=' + token, 'x-forwarded-proto': 'http' },
              query, body, url: '/api/publish', socket: {} }, vres);
  });
}
const login = email => S.loginUser({ email, password: PW });
const teamNamed = async id => (await S.loadStoredTeams()).find(t => t.id === id)?.name;
/** The stored club-config. The KV client serialises values, so a stored
 *  record comes back as a JSON string rather than an object. */
const clubConfig = id => {
  const raw = kv.get('app:club:' + id);
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
};

// ── 1 + 10. what creation actually creates ────────────────────────────────
test('1 + 10. a new club is a team, an owner, and nothing invented', async () => {
  const before = new Set(kv.keys());
  const club = await found('Genesis Rugby Club', 'genesis@x.test');
  const added = [...kv.keys()].filter(k => !before.has(k));

  const team = (await S.loadStoredTeams()).find(t => t.id === club.team.id);
  assert.ok(team, 'a team record exists');
  assert.equal(team.name, 'Genesis Rugby Club', 'carrying the club name');
  assert.equal(team.teamName, 'First XV');
  assert.equal(team.signupSource, 'self_service');

  const mine = (await S.loadTeamMembers()).filter(m => m.teamId === club.team.id);
  assert.equal(mine.length, 1, 'exactly one membership: the founder');
  assert.equal(mine[0].isOwner, true);
  assert.equal(mine[0].status, 'active');
  assert.equal(mine[0].accessProfile, 'full');

  assert.equal(clubConfig(club.team.id), null, 'and NO club-config record — it is optional by design');
  // Nothing of the club's playing life is invented for it. Creation may touch
  // the identity stores and its own signup record — and nothing else.
  for (const k of added) {
    assert.match(k, /^app:(identity:(users|teams|team_members|sessions)|signup:)/,
      'creation wrote a key that is not identity or its own signup record: ' + k);
  }
  for (const k of [...kv.keys()]) {
    assert.doesNotMatch(k, new RegExp(`:${club.team.id}\\b`),
      'and nothing at all is stored under the new club id yet: ' + k);
  }
});

test('1. an absent club-config reads as absent, not as an error', async () => {
  const club = await found('Honest Empty Rugby Club', 'honest@x.test');
  const s = await login('honest@x.test');
  const r = await api(s.session.token, 'GET', { resource: 'club' });
  assert.equal(r.code, 200);
  assert.equal(r.body.club, null, 'the club simply has not been configured yet');
});

// ── 2 + 8. the name the owner sees ────────────────────────────────────────
test('2 + 8. the club name reaches every surface the moment it exists', async () => {
  const club = await found('Visible Name Rugby Club', 'visible@x.test');
  const s = await login('visible@x.test');
  const session = await S.resolveSession(s.session.token);
  assert.equal(session.memberships[0].teamName, 'Visible Name Rugby Club',
    'the switcher and the sidebar read this — before any Settings save');
  assert.equal(await teamNamed(club.team.id), 'Visible Name Rugby Club');
});

// ── 5 + 4. renaming in Settings ───────────────────────────────────────────
test('5. a settings save renames the tenant, so nothing is left saying the old name', async () => {
  const club = await found('Before Rename RC', 'rename@x.test');
  const s = await login('rename@x.test');
  const saved = await api(s.session.token, 'POST', { resource: 'club' },
    { club: { clubName: 'After Rename RC', teamName: 'First XV' } });
  assert.equal(saved.code, 200);
  assert.equal(saved.body.club.clubName, 'After Rename RC');
  assert.equal(await teamNamed(club.team.id), 'After Rename RC', 'the tenant followed');
  const session = await S.resolveSession(s.session.token);
  assert.equal(session.memberships[0].teamName, 'After Rename RC', 'and so did the membership the switcher reads');
});

test('5. a save that does not change the name changes no tenant', async () => {
  const club = await found('Steady Name RC', 'steady@x.test');
  const s = await login('steady@x.test');
  const teamsBefore = JSON.stringify(await S.loadStoredTeams());
  const teamWrites = () => writes.filter(k => k === 'app:identity:teams').length;
  const writesBefore = teamWrites();
  await api(s.session.token, 'POST', { resource: 'club' },
    { club: { clubName: 'Steady Name RC', teamName: 'Second XV', seasonName: '2026/27' } });
  assert.equal(JSON.stringify(await S.loadStoredTeams()), teamsBefore, 'the team store is untouched');
  assert.equal(teamWrites(), writesBefore, 'and was not even rewritten with the same content');
  assert.equal(clubConfig(club.team.id).seasonName, '2026/27', 'while the club-config took the edit');
});

test('5. a club with no team record is left alone — the save still lands, nothing is invented', async () => {
  // Legacy shape: a club that exists only as memberships and configuration.
  const club = await found('Recordless RC', 'recordless@x.test');
  const s = await login('recordless@x.test');
  await S.saveTeams((await S.loadStoredTeams()).filter(t => t.id !== club.team.id));
  assert.equal(await teamNamed(club.team.id), undefined, 'precondition: no team record');
  const r = await api(s.session.token, 'POST', { resource: 'club' },
    { club: { clubName: 'Recordless Renamed RC', teamName: 'First XV' } });
  assert.equal(r.code, 200, 'the settings save still succeeds');
  assert.equal(clubConfig(club.team.id).clubName, 'Recordless Renamed RC', 'the configuration took the name');
  assert.equal(await teamNamed(club.team.id), undefined, 'and no team record was invented to carry it');
});

// ── 6. an existing configuration is preserved ─────────────────────────────
test('6. an existing club-config is never wiped by a later save', async () => {
  const club = await found('Preserve RC', 'preserve@x.test');
  const s = await login('preserve@x.test');
  await api(s.session.token, 'POST', { resource: 'club' },
    { club: { clubName: 'Preserve RC', teamName: 'First XV', seasonName: '2026/27', matchDay: 'Sat' } });
  const first = clubConfig(club.team.id);
  assert.equal(first.seasonName, '2026/27');
  const setupAt = first.setupCompletedAt;
  assert.ok(setupAt, 'the first save stamps when setup happened');

  await api(s.session.token, 'POST', { resource: 'club' },
    { club: { clubName: 'Preserve RC Renamed', teamName: 'First XV', seasonName: '2027/28' } });
  const second = clubConfig(club.team.id);
  assert.equal(second.seasonName, '2027/28', 'the edit landed');
  assert.equal(second.setupCompletedAt, setupAt, 'and the original setup stamp survived the rename');
});

// ── 7. retrying creation ──────────────────────────────────────────────────
test('7. creating the same club twice creates one club, one owner, one config', async () => {
  const idem = kkey();
  const a = await found('Idempotent Rugby Club', 'idem@x.test', idem);
  const b = await found('Idempotent Rugby Club', 'idem@x.test', idem);
  assert.equal(b.team.id, a.team.id, 'the same tenant');
  assert.equal(b.resumed, true, 'and it says it resumed rather than creating again');
  assert.equal((await S.loadStoredTeams()).filter(t => t.name === 'Idempotent Rugby Club').length, 1);
  assert.equal((await S.loadTeamMembers()).filter(m => m.teamId === a.team.id).length, 1);
  assert.equal(clubConfig(a.team.id), null, 'and still no club-config from either attempt');
});

test('7. a rename applied twice is the same rename', async () => {
  const club = await found('Twice RC', 'twice@x.test');
  const s = await login('twice@x.test');
  const body = { club: { clubName: 'Twice Renamed RC', teamName: 'First XV' } };
  assert.equal((await api(s.session.token, 'POST', { resource: 'club' }, body)).code, 200);
  assert.equal((await api(s.session.token, 'POST', { resource: 'club' }, body)).code, 200, 'the retry is not a collision with itself');
  assert.equal(await teamNamed(club.team.id), 'Twice Renamed RC');
  assert.equal((await S.loadStoredTeams()).filter(t => t.name === 'Twice Renamed RC').length, 1);
});

// ── 9 + 3. one club cannot reach another ──────────────────────────────────
test('9. a club cannot rename itself into another club\'s name', async () => {
  const mine = await found('Collision Mine RC', 'collide-mine@x.test');
  await found('Collision Theirs RC', 'collide-theirs@x.test');
  const s = await login('collide-mine@x.test');
  const r = await api(s.session.token, 'POST', { resource: 'club' },
    { club: { clubName: 'Collision Theirs RC', teamName: 'First XV' } });
  assert.equal(r.code, 409, 'refused with the same policy club creation uses');
  assert.match(String(r.body?.error || ''), /already exists/i);
  assert.equal(await teamNamed(mine.team.id), 'Collision Mine RC', 'the tenant is unchanged');
  assert.equal(clubConfig(mine.team.id), null, 'and NOTHING was persisted — a refused save saves nothing');
});

test('9. a body-supplied teamId cannot configure another tenant', async () => {
  const mine = await found('Isolation Mine RC', 'iso-mine@x.test');
  const theirs = await found('Isolation Theirs RC', 'iso-theirs@x.test');
  const s = await login('iso-mine@x.test');
  await api(s.session.token, 'POST', { resource: 'club' },
    { teamId: theirs.team.id, club: { clubName: 'Hijacked RC', teamName: 'First XV', teamId: theirs.team.id } });
  assert.equal(await teamNamed(theirs.team.id), 'Isolation Theirs RC', "the other club's name is untouched");
  assert.equal(clubConfig(theirs.team.id), null, 'and it has no configuration it did not write');
  assert.equal(await teamNamed(mine.team.id), 'Hijacked RC', 'the save applied to the CALLER\'s club, as the session says');
});

test('3 + 11. platform authority is not club authority here either', async () => {
  const mine = await found('Platform Own RC', 'plat-own@x.test');
  const theirs = await found('Platform Other RC', 'plat-other@x.test');
  const users = await S.loadUsers();
  users.find(u => u.id === mine.user.id).platformRole = 'platform_admin';
  await S.saveUsers(users);
  const s = await login('plat-own@x.test');
  // The session is scoped to the club it belongs to; platform status adds nothing.
  const session = await S.resolveSession(s.session.token);
  assert.deepEqual(session.memberships.map(m => m.teamId), [mine.team.id]);
  await assert.rejects(() => S.switchTeam(s.session.token, theirs.team.id), e => e.status === 403);
  assert.equal(await teamNamed(theirs.team.id), 'Platform Other RC', 'and it never renamed a club it does not belong to');
  assert.equal((await S.loadUsers()).find(u => u.id === mine.user.id).platformRole, 'platform_admin', 'still a platform admin');
});

// ── 12. the multi-club work still holds ───────────────────────────────────
test('12. renaming a club keeps the multi-club context intact', async () => {
  const home = await found('Context Home RC', 'ctx@x.test');
  const other = await found('Context Other RC', 'ctx-other@x.test');
  const members = await S.loadTeamMembers();
  members.push({ id: 'tm_ctx', teamId: other.team.id, userId: home.user.id, role: 'coach',
    staffLevel: 'head', status: 'active', joinedAt: '2026-01-01T00:00:00.000Z' });
  await S.saveTeamMembers(members);

  const s = await login('ctx@x.test');
  await api(s.session.token, 'POST', { resource: 'club' },
    { club: { clubName: 'Context Home Renamed RC', teamName: 'First XV' } });
  const session = await S.resolveSession(s.session.token);
  const byId = Object.fromEntries(session.memberships.map(m => [m.teamId, m.teamName]));
  assert.equal(byId[home.team.id], 'Context Home Renamed RC', 'the switcher shows the new name');
  assert.equal(byId[other.team.id], 'Context Other RC', 'and the other club is untouched');
  // 04233768 still decides where a login lands.
  const sw = await S.switchTeam(s.session.token, other.team.id);
  assert.equal(sw.teamId, other.team.id);
  assert.equal((await login('ctx@x.test')).teamMember.teamId, other.team.id, 'the remembered club still wins');
});

test('the tenant rename is its own function, applied only to the caller\'s club', async () => {
  const fs = await import('node:fs');
  const store = fs.readFileSync(new URL('../api/_identityStore.js', import.meta.url), 'utf8');
  const pub = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  assert.match(store, /export async function setTenantClubName/, 'one named place renames a tenant');
  assert.match(pub, /setTenantClubName\(session\.teamId/, "and it is only ever called with the SESSION's club");
  assert.doesNotMatch(pub, /setTenantClubName\(\s*(req|body|club)\./, 'never with anything from the request body');
  // No club or person is named anywhere in it.
  const body = store.slice(store.indexOf('export async function setTenantClubName'));
  assert.doesNotMatch(body.slice(0, 1200), /boitsfort|nick|madrid|@/i);
});

// ── the real app, on a club created minutes ago ───────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

const handlers = { publish };
for (const name of ['identity', 'invite', 'config', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe']) {
  handlers[name] = (await import(`../api/${name}.js`)).default;
}
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
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
  test(`browser (${view}): a brand-new club is named correctly everywhere, before any setup`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    // Nothing that can throw lives outside this try: an early failure once
    // left the server listening and the browser open, and the process hung
    // instead of reporting the failure.
    try {
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      const BASE = `http://127.0.0.1:${server.address().port}`;
      const email = `fresh.${view}@x.test`;
      const NAME = `Fresh ${view} Rugby Club`;
      const fresh = await found(NAME, email);                 // created minutes ago; no club-config
      assert.equal(clubConfig(fresh.team.id), null, 'precondition: it has not been configured');
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const named = () => page.evaluate(() => ({
        sidebar: document.getElementById('sidebarClubName')?.textContent || '',
        title: document.title,
        stateName: state.clubName || '',
        membership: (_myMemberships || []).find(m => m.current)?.teamName || '',
      }));

      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ce-welcome', { timeout: 20000 });
      await page.click('#ce-welcome button:has-text("Log in")');
      await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
      await page.fill('#identityLoginEmail', email);
      await page.fill('#identityLoginPassword', PW);
      await page.click('#identityLoginBtn');
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId, null, { timeout: 20000 });
      await page.waitForTimeout(800);

      // The club is named from the moment it exists — no placeholder anywhere.
      let n = await named();
      assert.equal(n.membership, NAME, 'the server names it');
      assert.equal(n.sidebar, NAME, 'and the sidebar shows that name, not a placeholder');
      assert.match(n.title, new RegExp(NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'as does the page title');
      assert.doesNotMatch(n.sidebar, /My Team/);

      // Every section opens, and none of them starts calling it something else.
      for (const section of ['overview', 'members', 'training', 'matchday', 'settings', 'overview']) {
        await page.evaluate(s => setSection('coach', s), section);
        await page.waitForTimeout(200);
        const after = await named();
        assert.equal(after.sidebar, NAME, `still named after opening ${section}`);
        const body = await page.evaluate(() => document.querySelector('.workspace')?.innerText || '');
        assert.doesNotMatch(body, /\bMy Team\b/, `no "My Team" placeholder in ${section}`);
      }

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId, null, { timeout: 20000 });
      await page.waitForTimeout(800);
      assert.equal((await named()).sidebar, NAME, 'and after a refresh');

      assert.deepEqual(errors, [], 'no page errors');
      assert.ok(await page.evaluate(() => (document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0),
        'no horizontal overflow');
      await ctx.close();
    } finally { await browser.close(); await new Promise(r => server.close(r)); }
  });
}

test('browser: renaming the club in Settings moves every surface together', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;
    const email = 'rename.browser@x.test';
    const home = await found('Rename Browser Home RC', email);
    const other = await found('Rename Browser Other RC', 'rename.other@x.test');
    const members = await S.loadTeamMembers();
    members.push({ id: 'tm_rn', teamId: other.team.id, userId: home.user.id, role: 'coach',
      staffLevel: 'head', status: 'active', joinedAt: '2026-01-01T00:00:00.000Z' });
    await S.saveTeamMembers(members);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ce-welcome', { timeout: 20000 });
    await page.click('#ce-welcome button:has-text("Log in")');
    await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
    await page.fill('#identityLoginEmail', email);
    await page.fill('#identityLoginPassword', PW);
    await page.click('#identityLoginBtn');
    await page.waitForSelector('#clubSwitchSelect', { state: 'visible', timeout: 20000 });

    const optionText = () => page.evaluate(id => [...document.querySelectorAll('#clubSwitchSelect option')]
      .find(o => o.value === id)?.textContent || '', home.team.id);
    assert.equal(await optionText(), 'Rename Browser Home RC', 'the switcher starts with the created name');

    // Rename through the real client path.
    const saved = await page.evaluate(async () => {
      state.clubName = 'Renamed In Browser RC';
      const club = await saveClubConfigToServer();
      return club && club.clubName;
    });
    assert.equal(saved, 'Renamed In Browser RC', 'the save succeeded');
    await page.waitForFunction(() => [...document.querySelectorAll('#clubSwitchSelect option')]
      .some(o => o.textContent === 'Renamed In Browser RC'), null, { timeout: 20000 });
    assert.equal(await optionText(), 'Renamed In Browser RC', 'the switcher followed without a reload');
    assert.equal(await page.evaluate(() => document.getElementById('sidebarClubName')?.textContent || ''),
      'Renamed In Browser RC', 'and so did the sidebar — the two never disagree');

    // A name another club holds is refused, and the coach is told.
    const refused = await page.evaluate(async () => {
      state.clubName = 'Rename Browser Other RC';
      const club = await saveClubConfigToServer();
      return { club, toast: document.getElementById('toast')?.textContent || '' };
    });
    assert.equal(refused.club, null, 'nothing was saved');
    assert.match(refused.toast, /already exists/i, 'and the coach is told why');
    assert.equal(await S.loadStoredTeams().then(t => t.find(x => x.id === home.team.id).name),
      'Renamed In Browser RC', 'the club keeps the name it had');

    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
});
