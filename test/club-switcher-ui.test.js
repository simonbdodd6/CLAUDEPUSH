/**
 * THE CLUB SWITCHER — which club am I working in, and how do I change it.
 *
 * 04233768 made the server remember the club an account last operated. What
 * an account holding two clubs still had no way to do was CHOOSE one the
 * first time: the control existed, but as a bare unlabelled <select> sitting
 * between the login panel and the nav, indistinguishable from navigation. An
 * owner of a new club could not see that it was the thing that would take him
 * there.
 *
 * This is the same control, named: "Current club", the club in force shown as
 * the selected option, every club the SERVER says the account belongs to as
 * the alternatives, and — for a platform administrator — a line saying in as
 * many words that platform administration is not one of them.
 *
 * It is deliberately still one mechanism: the same #teamSwitcher host, the
 * same switchTeamTo(), the same server-authoritative switch_team. No second
 * team-switching path was introduced.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function fn(name) {
  const m = src.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  assert.ok(m, `function ${name} not found`);
  const start = m.index + 1;
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

const CLUB_A = { teamId: 'club-alpha', teamName: 'Alpha Rugby Club', role: 'coach', canonicalRole: 'head_coach', current: true };
const CLUB_B = { teamId: 'club-beta',  teamName: 'Beta Rugby Club',  role: 'coach', canonicalRole: 'owner',      current: false };

/** The switcher's markup, built by the real function. */
function switcher({ memberships = [], platformRole = '' } = {}) {
  return new Function(`"use strict";
    const _myMemberships = ${JSON.stringify(memberships)};
    const _myPlatformRole = ${JSON.stringify(platformRole)};
    ${fn('esc')}
    ${fn('clubSwitcherHTML')}
    return clubSwitcherHTML();
  `)();
}
const visible = html => String(html).replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ── 1. a single club needs no switcher ────────────────────────────────────
test('1. an account with one club gets no new UI at all', () => {
  assert.equal(switcher({ memberships: [CLUB_A] }), '', 'nothing is rendered');
  assert.equal(switcher({ memberships: [] }), '', 'and nothing for an account with none');
  assert.equal(switcher(), '', 'nor before the memberships have loaded');
  assert.equal(switcher({ memberships: [CLUB_A], platformRole: 'platform_admin' }), '',
    'a platform admin with ONE club has nothing to switch between either');
});

// ── 2. two clubs ──────────────────────────────────────────────────────────
test('2. both clubs are offered, and the one in force is the one shown', () => {
  const html = switcher({ memberships: [CLUB_A, CLUB_B] });
  const text = visible(html);
  assert.match(text, /Current club/i, 'the control says what it is');
  assert.match(text, /Alpha Rugby Club/);
  assert.match(text, /Beta Rugby Club/);
  assert.match(html, /<option value="club-alpha"[^>]*\bselected\b/, 'the current club is the selected option');
  assert.doesNotMatch(html, /<option value="club-beta"[^>]*\bselected\b/, 'and the other one is not');
});

test('2. the list is exactly what the server said, in its order', () => {
  const three = [CLUB_B, { ...CLUB_A, current: true }, { teamId: 'club-gamma', teamName: 'Gamma RC', current: false }];
  const html = switcher({ memberships: three });
  const ids = [...html.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ['club-beta', 'club-alpha', 'club-gamma'], 'every membership, nothing added, nothing dropped');
});

test('2. club names are escaped, not trusted', () => {
  const html = switcher({ memberships: [
    { ...CLUB_A, teamName: '<img src=x onerror=alert(1)>' },
    { ...CLUB_B, teamId: '"><script>bad()</script>' }] });
  assert.doesNotMatch(html, /<img|<script/, 'no markup from a club name or id reaches the page');
  assert.match(html, /&lt;img/, 'it is shown as text');
});

// ── 3 + 4. choosing a club ────────────────────────────────────────────────
test('3 + 4. choosing a club goes through the existing server-checked switch', () => {
  const html = switcher({ memberships: [CLUB_A, CLUB_B] });
  assert.match(html, /onchange="switchTeamTo\(this\.value\)"/, 'the same handler as before');
  const body = fn('switchTeamTo');
  assert.match(body, /action: 'switch_team'/, 'which posts the established action');
  assert.match(body, /\/api\/identity/);
  assert.match(body, /resetClubScopedState\(\)/, 'club-scoped state is dropped before the new club loads');
  assert.match(body, /checkServerSession\(\)/, 'and the SERVER is asked which club is now in force');
  assert.match(body, /hydrateClubFromServer\(\)/);
  // No second team-switching path was invented for this UI.
  assert.equal((src.match(/action: 'switch_team'/g) || []).length, 1, 'exactly one switch path exists');
  assert.equal((src.match(/function switchTeamTo/g) || []).length, 1);
});

test('3 + 4. the switcher never decides anything itself', () => {
  const body = fn('clubSwitcherHTML');
  for (const forbidden of [/fetch\s*\(/, /state\.stateTeamId\s*=/, /adoptClubContext/, /localStorage/, /saveState/]) {
    assert.doesNotMatch(body, forbidden, `the control only renders: ${forbidden}`);
  }
  assert.doesNotMatch(body, /permissions|canI\(/, 'and grants nothing');
});

// ── 9. platform admin is not a club ───────────────────────────────────────
test('9. a platform admin is told, in the switcher, that it is not a club role', () => {
  const asAdmin = visible(switcher({ memberships: [CLUB_A, CLUB_B], platformRole: 'platform_admin' }));
  assert.match(asAdmin, /Platform admin/i, 'the distinction is on screen beside the club');
  assert.match(asAdmin, /not a club role|separate from/i, 'and said plainly');
  const asCoach = visible(switcher({ memberships: [CLUB_A, CLUB_B] }));
  assert.doesNotMatch(asCoach, /Platform admin/i, 'an ordinary multi-club coach is told nothing about it');
  // The clubs offered are identical either way: platform authority adds none.
  const ids = h => [...String(h).matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids(switcher({ memberships: [CLUB_A, CLUB_B], platformRole: 'platform_admin' })),
                   ids(switcher({ memberships: [CLUB_A, CLUB_B] })),
                   'a platform admin is offered exactly the clubs it belongs to');
});

// ── 11 + 12. nothing named, nobody special ────────────────────────────────
test('11 + 12. the switcher hard-codes no club and knows no account', () => {
  const body = fn('clubSwitcherHTML');
  assert.doesNotMatch(body, /boitsfort|madrid|deportivo|spanish|nick/i, 'no club and no person is named in the control');
  assert.doesNotMatch(body, /@/, 'and no address decides anything');
  // It reads the server's list and nothing else.
  assert.match(body, /_myMemberships/);
  assert.doesNotMatch(body, /DEFAULT_TEAM|'boitsfort-rfc'/);
});

test('renderNav uses the named control, and only when there is a choice', () => {
  const nav = fn('renderNav');
  assert.match(nav, /clubSwitcherHTML\(\)/, 'renderNav renders it');
  // Asserted as BEHAVIOUR, not as a literal: the rule is "only when there is
  // a choice", however it comes to be spelled.
  assert.equal(switcher({ memberships: [CLUB_A] }), '', 'and it answers empty below two clubs');
  assert.notEqual(switcher({ memberships: [CLUB_A, CLUB_B] }), '');
  assert.match(nav, /getElementById\('teamSwitcher'\)/, 'in the host that already existed — not a new one');
});

// ── the real app ──────────────────────────────────────────────────────────
import http from 'node:http';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.club-switcher.test';
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
const handlers = {};
for (const name of ['identity', 'invite', 'config', 'publish', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe']) {
  handlers[name] = (await import(`../api/${name}.js`)).default;
}
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

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

const PW = 'password123';
let seq = 0;
const kkey = () => String(seq++).padStart(2, '0').repeat(10);

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): an account with two clubs can see and choose which one it is in`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;
    const email = `switcher.${view}@x.test`;
    // Two real clubs, both founded through the wizard, plus platform authority.
    const home  = await S.createClub({ clubName: `Switcher ${view} Home Rugby Club`, teamName: 'First XV', sport: 'Rugby', name: 'Switch Admin', email, password: PW, idempotencyKey: kkey() });
    const other = await S.createClub({ clubName: `Switcher ${view} Other Rugby Club`, teamName: 'First XV', sport: 'Rugby', name: 'Other Owner', email: `other.${view}@x.test`, password: PW, idempotencyKey: kkey() });
    const members = await S.loadTeamMembers();
    members.push({ id: 'tm_sw_' + view, teamId: other.team.id, userId: home.user.id, role: 'coach',
      staffLevel: 'head', status: 'active', joinedAt: '2026-01-01T00:00:00.000Z' });
    await S.saveTeamMembers(members);
    const users = await S.loadUsers();
    users.find(u => u.id === home.user.id).platformRole = 'platform_admin';
    await S.saveUsers(users);
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const club = () => page.evaluate(() => ({
        state: state.stateTeamId,
        current: (_myMemberships || []).find(m => m.current)?.teamId || null,
        shown: document.getElementById('sidebarClubName')?.textContent || '',
        selected: document.getElementById('clubSwitchSelect')?.value || null,
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
      await page.waitForSelector('#clubSwitchSelect', { state: 'visible', timeout: 20000 });

      // The control names itself, and lists exactly the two clubs.
      const label = await page.evaluate(() => {
        const el = document.querySelector('.club-switch-label');
        const r = el?.getBoundingClientRect();
        return { text: el?.textContent.trim(), visible: !!r && r.width > 0 && r.height > 0 };
      });
      assert.equal(label.text, 'Current club');
      assert.ok(label.visible, 'and the label is actually on screen');
      const options = await page.evaluate(() => [...document.querySelectorAll('#clubSwitchSelect option')].map(o => ({ v: o.value, t: o.textContent })));
      assert.equal(options.length, 2, 'both memberships, and only those');
      assert.deepEqual(options.map(o => o.v).sort(), [home.team.id, other.team.id].sort());
      assert.ok(options.some(o => /Home Rugby Club/.test(o.t)) && options.some(o => /Other Rugby Club/.test(o.t)),
        'named by their real club names');

      let c = await club();
      assert.equal(c.selected, home.team.id, 'the club in force is the one displayed');
      assert.equal(c.platform, 'platform_admin');
      assert.match(await page.evaluate(() => document.querySelector('.club-switch-note')?.textContent || ''),
        /Platform admin/, 'and platform authority is shown as the separate thing it is');

      // Choose the other club.
      await page.selectOption('#clubSwitchSelect', other.team.id);
      await page.waitForFunction(id => state.stateTeamId === id, other.team.id, { timeout: 20000 });
      await page.waitForTimeout(400);
      c = await club();
      assert.equal(c.current, other.team.id, 'the server agrees');
      assert.equal(c.selected, other.team.id, 'the control shows it');
      assert.match(c.shown, /Other Rugby Club/, 'and the sidebar names the club now in force');

      // It survives every section, and a refresh.
      for (const section of ['overview', 'members', 'training', 'matchday', 'medical', 'settings', 'overview']) {
        await page.evaluate(s => setSection('coach', s), section);
        await page.waitForTimeout(200);
        const after = await club();
        assert.equal(after.state, other.team.id, `still the chosen club after ${section}`);
        assert.equal(after.current, other.team.id, `and the server still says so after ${section}`);
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId, null, { timeout: 20000 });
      await page.waitForSelector('#clubSwitchSelect', { state: 'visible', timeout: 20000 });
      c = await club();
      assert.equal(c.current, other.team.id, 'a refresh does not revert it');
      assert.equal(c.selected, other.team.id);

      // Back, and back again.
      await page.selectOption('#clubSwitchSelect', home.team.id);
      await page.waitForFunction(id => state.stateTeamId === id, home.team.id, { timeout: 20000 });
      assert.match((await club()).shown, /Home Rugby Club/);
      await page.selectOption('#clubSwitchSelect', other.team.id);
      await page.waitForFunction(id => state.stateTeamId === id, other.team.id, { timeout: 20000 });
      assert.equal((await club()).current, other.team.id);
      assert.equal((await club()).platform, 'platform_admin', 'platform authority survived every switch');

      assert.deepEqual(errors, [], 'no page errors');
      assert.ok(await page.evaluate(() => (document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0),
        'no horizontal overflow');
      const box = await page.evaluate(() => {
        const el = document.getElementById('clubSwitchSelect');
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, right: r.right, vw: document.documentElement.clientWidth };
      });
      assert.ok(box.h >= 36, 'the control is a real touch target');
      assert.ok(box.right <= box.vw + 1, 'and does not run off the side of the screen');
      assert.ok(await page.isVisible('#coachNav'), 'navigation is still usable');
      await ctx.close();
    } finally { await browser.close(); await new Promise(r => server.close(r)); }
  });
}
