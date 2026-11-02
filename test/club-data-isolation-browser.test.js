// CD-110 LOOP 1 — the club switch in a REAL browser against the REAL handlers.
//
// The same owner is in two clubs. Visiting Training, Availability and Match
// Centre under Club A fills the attendance register, the live answers map and
// the Match Centre sides. Switching to Club B must leave none of it behind: the
// sides shown are Club B's (read, not inherited), the register and the answers
// are unknown until Club B's own reads land, and the Availability cycle is
// re-armed. Switching back restores Club A's sides — nothing legitimate is lost.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.cd110-browser.test';
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
const structureFor = (names) => ({
  version: 1,
  groups: [{ id: 'grp_initial', name: 'Seniors', type: 'general', status: 'active' }],
  teams: names.map((name, i) => ({ id: i === 0 ? 'team_initial' : `team_${name.toLowerCase().replace(/\W+/g, '_')}`, groupId: 'grp_initial', name, status: 'active' })),
});

test('browser: switching club leaves no Match Centre sides, register or answers of the club being left', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const email = 'owner.cd110@x.test';
  const A = await S.createClub({ clubName: 'Alpha Rugby Club', teamName: 'Seniors', sport: 'Rugby', name: 'Owner', email, password: PW, idempotencyKey: kkey() });
  const B = await S.createClub({ clubName: 'Bravo Rugby Club', teamName: 'Seniors', sport: 'Rugby', name: 'Bravo Owner', email: 'bravo.cd110@x.test', password: PW, idempotencyKey: kkey() });
  const members = await S.loadTeamMembers();
  members.push({ id: 'tm_cd110_b', teamId: B.team.id, userId: A.user.id, role: 'coach', staffLevel: 'head', status: 'active', joinedAt: '2026-01-01T00:00:00.000Z' });
  await S.withIdentityLock(() => S.saveTeamMembers(members));
  await saveClubStructure(A.team.id, structureFor(['Alpha Premier', 'Alpha Development']));
  await saveClubStructure(B.team.id, structureFor(['Bravo First XV', 'Bravo Seconds']));
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const snap = () => page.evaluate(() => ({
      club: state.stateTeamId,
      sides: matchCentreSides().map(x => x.name),
      mcTeams: _mcTeams === null ? null : 'held',
      attendance: _attendance === null ? null : 'held',
      attendanceGroup: _attendanceGroup,
      resolved: currentResolvedAvailability() === null ? null : 'known',
      lastSync: _availLastSync,
      liveArmed: _liveMessagingLoadedAt === 0,
      section: state.activeCoachSection,
    }));

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ce-welcome', { timeout: 20000 });
    await page.click('#ce-welcome button:has-text("Log in")');
    await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
    await page.fill('#identityLoginEmail', email);
    await page.fill('#identityLoginPassword', PW);
    await page.click('#identityLoginBtn');
    await page.waitForFunction(id => typeof state !== 'undefined' && state.stateTeamId === id, A.team.id, { timeout: 20000 });
    await page.waitForSelector('#clubSwitchSelect', { state: 'visible', timeout: 20000 });

    // Fill the caches under Club A. The register is read by a session's
    // attendance panel (loadAttendance, via currentAttendance); the live
    // answers by the Availability screen's cycle (coach section 'message').
    await page.evaluate(() => setSection('coach', 'training'));
    await page.evaluate(() => loadAttendance());
    await page.waitForFunction(() => _attendance !== null, null, { timeout: 20000 });
    await page.evaluate(() => setSection('coach', 'message'));
    await page.waitForFunction(() => _availLastSync !== null, null, { timeout: 20000 });
    await page.evaluate(() => setSection('coach', 'matchday'));
    await page.waitForFunction(() => _mcTeams !== null, null, { timeout: 20000 });
    let s = await snap();
    assert.equal(s.club, A.team.id);
    assert.deepEqual(s.sides, ['Alpha Premier', 'Alpha Development'], 'baseline: Club A\'s sides are in force');
    assert.equal(s.attendance, 'held'); assert.equal(s.attendanceGroup, 'grp_initial');
    assert.equal(s.resolved, 'known', 'baseline: Club A\'s answers are resolved for grp_initial');
    const lastSyncA = s.lastSync;

    // Switch to Club B — same owner, same group id.
    await page.selectOption('#clubSwitchSelect', B.team.id);
    await page.waitForFunction(id => state.stateTeamId === id, B.team.id, { timeout: 20000 });
    s = await snap();
    assert.equal(s.club, B.team.id);
    assert.ok(!s.sides.some(n => /Alpha/.test(n)), `no Club A side survives the switch (saw ${JSON.stringify(s.sides)})`);
    assert.equal(s.attendance, null, 'Club A\'s register is forgotten (Training is not open, so nothing re-read it)');
    assert.equal(s.attendanceGroup, null);
    // Club B's own board read may already have landed (ensureHiddenSectionData →
    // ensureRecentActivity runs on the hydration renders): unknown, or re-read
    // since the switch — never Club A's answers standing as Club B's knowledge.
    assert.ok(s.resolved === null || s.lastSync !== lastSyncA,
      `Club A's answers are not Club B's knowledge of grp_initial (saw resolved=${s.resolved} lastSync=${s.lastSync}, Club A's was ${lastSyncA})`);
    assert.ok(s.liveArmed, 'the Availability cycle is re-armed for Club B');
    // Match Centre is open, so Club B's sides are READ for it.
    await page.waitForFunction(() => matchCentreSides().length === 2, null, { timeout: 20000 });
    assert.deepEqual((await snap()).sides, ['Bravo First XV', 'Bravo Seconds'], 'the sides shown are Club B\'s own');

    // And back: Club A's sides return by being read again — nothing legitimate was lost.
    await page.selectOption('#clubSwitchSelect', A.team.id);
    await page.waitForFunction(id => state.stateTeamId === id, A.team.id, { timeout: 20000 });
    await page.waitForFunction(() => matchCentreSides().length === 2, null, { timeout: 20000 });
    assert.deepEqual((await snap()).sides, ['Alpha Premier', 'Alpha Development']);
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
});
