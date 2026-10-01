/**
 * ADMIN DATA — A CLUB BECOMING KNOWN IS NOT A CLUB SWITCH (Build 117)
 *
 * The first admin-data read of a cold load often leaves before the session
 * has named the club (_clubContextId is ''). loadAdminData compared the club
 * at the reply with the club at the request strictly, so '' -> 'club' counted
 * as a switch: a perfectly good reply was thrown away, and the attempt it
 * still recorded held every retry off for 15 seconds. operationalPlayers()
 * fails closed until the admin data loads, so the Overview lost its "N
 * players haven't replied" prompt and Members sat on "Loading the squad".
 * Build 116's faster boot made the session land first about half the time
 * (9/20 loaded runs of overview-chase-integrity, against 0/20 before); with
 * the admin read forced to land after the session, ef2ccab9 fails every time.
 *
 * The rule now:
 *   unknown -> known club ............ the reply is applied
 *   known A -> anything else ......... discarded, NO attempt recorded, so the
 *                                      next ensureAdminData() asks at once
 *   store reset / replaced / taken over by a newer read meanwhile .. discarded
 *   HTTP or network failure .......... a real failure, the 15s backoff stays
 *   A's reply ........................ never applied to B, in any order
 *
 * SANDBOX tests run the REAL loadAdminData() and ensureAdminData() over a
 * fetch whose answers the test releases, a clock it controls, and the exact
 * admin reset resetClubScopedState() performs. BROWSER tests run the real
 * client on desktop and Pixel 5 with the admin read held until the session
 * has named the club.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
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
const stripComments = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
// The admin half of resetClubScopedState(), verbatim, so a club transition here is the app's own.
const RESET_ADMIN = fn('resetClubScopedState').match(/if \(typeof _adminData === 'object' && _adminData\) Object\.assign\(_adminData, \{[\s\S]*?\}\);/)[0];

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX
// ═══════════════════════════════════════════════════════════════════════════
const BODY = club => ({
  '/api/identity': { users: [{ id: 'u_' + club }], team_members: [{ userId: 'm_' + club, teamId: club, role: 'player' }], player_profiles: [] },
  '/api/invite': { invites: [{ id: 'inv_' + club }] },
  '/api/publish?resource=club': { club: { id: club, name: 'Club ' + club } },
  '/api/publish?resource=structure': { structure: { club }, counts: { groups: {} }, clubWideStaffIds: [], clubWideStaff: [] },
});
function app({ club = '' } = {}) {
  const pending = [];                       // one entry per fetch(), in call order
  const calls = { fetch: [], renders: 0, applied: [] };
  const fetchStub = url => new Promise((resolve, reject) => { calls.fetch.push(url); pending.push({ url, resolve, reject }); });
  const body = `
    "use strict";
    const fetch = arguments[0], calls = arguments[1], CFG = arguments[2];
    let CLOCK = 1000000;
    const Date = { now: () => CLOCK };
    const console = { warn() {} };
    let _clubContextId = CFG.club;
    let state = { activeView: 'coach', activeCoachSection: 'overview', fixtures: [] };
    function canI() { return true; }
    function renderClubAdmin() { calls.renders++; }
    function renderSettings() {} function renderPlayers() {} function renderMatchday() {}
    function applyClubConfigLocally(c) { calls.applied.push(c.id); }
    function noteFixturesSynced() {}
    ${src.match(/let _adminData = \{[^\n]*\};/)[0]}
    let _adminDataAttemptAt = 0;
    ${fn('ensureAdminData')}
    ${fn('loadAdminData')}
    return {
      load: (force) => loadAdminData(force),
      ensure: () => ensureAdminData(),
      admin: () => _adminData,
      setClub: c => { _clubContextId = c; },
      // A club transition exactly as the app performs it: the admin reset, then the next club adopted.
      switchTo: c => { ${RESET_ADMIN} _clubContextId = ''; if (c) _clubContextId = c; },
      signOut: () => { _adminData = { invites: [], members: [], users: [], profiles: [], structure: null, counts: null, clubWideStaff: [], loaded: false, loading: false, attempted: false, failed: false }; _clubContextId = ''; },
      advance: ms => { CLOCK += ms; },
    };
  `;
  const api = new Function(body)(fetchStub, calls, { club });
  /** Answer the four fetches of the n-th load (0-based) with `club`'s data; status/failure for the identity read. */
  const land = async (n, clubData, { status = 200, network = false } = {}) => {
    const batch = pending.slice(n * 4, n * 4 + 4);
    assert.equal(batch.length, 4, `load ${n} made its four requests`);
    for (const p of batch) {
      if (p.url === '/api/identity' && network) { p.reject(new TypeError('Failed to fetch')); continue; }
      const st = p.url === '/api/identity' ? status : 200;
      const b = BODY(clubData)[p.url];
      p.resolve({ ok: st >= 200 && st < 300, status: st, json: async () => b });
    }
    for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r));
  };
  return { ...api, calls, land, loads: () => calls.fetch.filter(u => u === '/api/identity').length };
}
const members = a => (a.admin().members || []).map(m => m.userId);

test('A. unknown -> known: the reply is applied, loaded, no stale discard, no backoff left behind', async () => {
  const a = app({ club: '' });
  const p = a.load();
  a.setClub('A');                              // the session names the club while the read is out
  await a.land(0, 'A'); await p;
  assert.equal(a.admin().loaded, true, 'loaded');
  assert.deepEqual(members(a), ['m_A'], 'the club\'s members applied');
  assert.deepEqual(a.admin().invites.map(i => i.id), ['inv_A']);
  assert.deepEqual(a.calls.applied, ['A'], 'the club config applied');
  assert.equal(a.admin().failed, false); assert.equal(a.admin().loading, false);
  a.ensure();
  assert.equal(a.loads(), 1, 'nothing to retry: it loaded');
});

test('B. known A -> known B: A\'s reply is discarded, never filed under B, and the next ensure asks again at once', async () => {
  const a = app({ club: 'A' });
  const p = a.load();
  a.switchTo('B');
  await a.land(0, 'A'); await p;
  assert.equal(a.admin().loaded, false, 'not loaded from A\'s reply');
  assert.deepEqual(members(a), [], 'A\'s members are not B\'s');
  assert.deepEqual(a.calls.applied, [], 'A\'s club config was not applied');
  assert.equal(a.admin().attempted, false, 'a discarded read is not an attempt');
  assert.equal(a.admin().failed, false, 'nor a failure');
  a.ensure();                                  // the clock has not moved
  assert.equal(a.loads(), 2, 'the very next ensureAdminData() fetches again');
  const q = a.admin(); await a.land(1, 'B');
  assert.equal(q.loaded, true); assert.deepEqual(members(a), ['m_B'], 'B\'s own data');
});

test('C. HTTP 500: a real failure, and the 15s backoff stays', async () => {
  const a = app({ club: 'A' });
  const p = a.load();
  await a.land(0, 'A', { status: 500 }); await p;
  assert.equal(a.admin().loaded, false); assert.equal(a.admin().failed, true); assert.equal(a.admin().attempted, true);
  a.ensure(); assert.equal(a.loads(), 1, 'no refetch inside the backoff');
  a.advance(14999); a.ensure(); assert.equal(a.loads(), 1, 'still inside it at 14.999s');
  a.advance(2); a.ensure(); assert.equal(a.loads(), 2, 'retried once it has passed');
});

test('D. network failure: a real failure, and the 15s backoff stays', async () => {
  const a = app({ club: 'A' });
  const p = a.load();
  await a.land(0, 'A', { network: true }); await p;
  assert.equal(a.admin().loaded, false); assert.equal(a.admin().failed, true); assert.equal(a.admin().attempted, true);
  a.ensure(); assert.equal(a.loads(), 1, 'no refetch inside the backoff');
  a.advance(15001); a.ensure(); assert.equal(a.loads(), 2);
});

test('E. A\'s reply landing late, after B has loaded, never replaces B\'s data', async () => {
  const a = app({ club: 'A' });
  const pa = a.load();
  a.switchTo('B');
  const pb = a.load();                         // B's own read, made while A's is still out
  await a.land(1, 'B'); await pb;
  assert.deepEqual(members(a), ['m_B']); assert.equal(a.admin().loaded, true);
  await a.land(0, 'A'); await pa;              // A answers last
  assert.deepEqual(members(a), ['m_B'], 'B\'s members stand');
  assert.deepEqual(a.admin().invites.map(i => i.id), ['inv_B']);
  assert.deepEqual(a.calls.applied, ['B'], 'only B\'s club config was ever applied');
  assert.equal(a.admin().loaded, true); assert.equal(a.admin().loading, false);
});

test('E2. A\'s stale reply landing while B\'s read is still out leaves B\'s read in charge', async () => {
  const a = app({ club: 'A' });
  const pa = a.load();
  a.switchTo('B');
  const pb = a.load();
  await a.land(0, 'A'); await pa;
  assert.equal(a.admin().loading, true, 'B\'s read still holds the latch');
  assert.deepEqual(members(a), []);
  a.ensure(); assert.equal(a.loads(), 2, 'and no third read is started over it');
  await a.land(1, 'B'); await pb;
  assert.deepEqual(members(a), ['m_B']);
});

test('F. a read that left at \'\' and outlived a whole switch is discarded too, and retried at once', async () => {
  const a = app({ club: '' });
  const p = a.load();
  a.switchTo('B');                             // a club transition happened while it was out
  await a.land(0, 'A'); await p;
  assert.deepEqual(members(a), [], 'never applied to B');
  assert.equal(a.admin().attempted, false);
  a.ensure(); assert.equal(a.loads(), 2, 'retried immediately, not after 15s');
});

test('F2. sign-out replaces the store: the reply lands nowhere', async () => {
  const a = app({ club: 'A' });
  const p = a.load();
  a.signOut();
  await a.land(0, 'A'); await p;
  assert.deepEqual(members(a), []); assert.equal(a.admin().loaded, false); assert.equal(a.admin().attempted, false);
  assert.deepEqual(a.calls.applied, []);
});

test('a network failure AFTER the club was left is a stale read, not this club\'s failure: no backoff', async () => {
  const a = app({ club: 'A' });
  const p = a.load();
  a.switchTo('B');
  await a.land(0, 'A', { network: true }); await p;
  assert.equal(a.admin().failed, false); assert.equal(a.admin().attempted, false);
  a.ensure(); assert.equal(a.loads(), 2);
});

test('SOURCE: the stale rule is Build 97\'s (known club left), bodies are read before it, a discard records no attempt', () => {
  const body = stripComments(fn('loadAdminData'));
  assert.match(body, /\(!!_forClub && String\(\(typeof _clubContextId !== 'undefined' && _clubContextId\) \|\| ''\) !== _forClub\)/, 'stale only when a KNOWN club was left');
  assert.match(body, /_adminData !== _store \|\| _store\.readToken !== _readToken \|\| !_store\.loading/, 'or the store was reset, replaced or taken over');
  assert.ok(body.indexOf('identityRes.ok ? identityRes.json() : null') < body.indexOf('if (_stale()) { _discarded = true; return; }'), 'bodies first, then the check');
  assert.doesNotMatch(body.slice(body.indexOf('if (_stale())')), /await /, 'nothing after the check awaits');
  assert.match(body, /if \(!_discarded\) \{\s*_adminData\.loading = false;\s*_adminData\.attempted = true;\s*_adminDataAttemptAt = Date\.now\(\);/, 'only a real outcome is an attempt');
  assert.match(stripComments(fn('ensureAdminData')), /_adminData\.attempted && Date\.now\(\) - _adminDataAttemptAt < 15000/, 'the backoff itself is unchanged');
});

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER — the admin read held until the session has named the club
// ═══════════════════════════════════════════════════════════════════════════
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const APPW = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
  return { availWeekStart, availAddDays, availToday, availabilityEventsForWeek };
`)();
const TODAY = APPW.availToday(), WEEK = APPW.availWeekStart(TODAY);
const MATCH_DAY = (() => { let day = TODAY; for (let i = 0; i < 14; i++) { const n = APPW.availAddDays(day, 1); const inW = APPW.availabilityEventsForWeek(WEEK, { fixtures: [{ id: 'p', opposition: 'P', date: n, status: 'scheduled' }], slots: [], currentWeekStart: WEEK }).some(e => e.id === 'p'); if (!inW) break; day = n; } return day; })();
const SAT = 'fx_sat', GRP = 'grp_initial', TEAM = 'team_stub';
const PLAYERS = Array.from({ length: 18 }, (_, i) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: GRP }));
const FIXTURES = [{ id: SAT, groupId: GRP, opposition: 'Kituro', date: MATCH_DAY, kickoffTime: '14:00', status: 'scheduled' }];
const SESSION = { ok: true, user: { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
  permissions: ['reports', 'messaging', 'manage_players', 'manage_coaches', 'training', 'matchday', 'publish_training'],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
  operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false } } };
/** The plain admin read (GET /api/identity) waits on ctl.gate; the session check (?action=session) never does. */
function stubServer() {
  const ctl = { gate: null, adminReads: 0, sessionAt: 0 };
  let release = () => {};
  const srv = http.createServer(async (req, res) => {
    const u = req.url || '/';
    const send = (o, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u === '/api/identity' && req.method === 'GET') { ctl.adminReads++; if (ctl.gate) await ctl.gate; return send(SESSION); }
    if (u.startsWith('/api/identity')) return send(SESSION);
    if (u.startsWith('/api/availability')) {
      const resolved = {}; PLAYERS.slice(0, 5).forEach(p => { resolved[p.userId] = { [SAT]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; });
      resolved.u_p5 = { [SAT]: { response: 'maybe' } }; resolved.u_p6 = { [SAT]: { response: 'unavailable', reason: 'work' } };
      return send({ resolved, roster: PLAYERS });
    }
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: FIXTURES });
    if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: GRP, name: 'Seniors', status: 'active' }], teams: [] });
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: GRP, canEdit: true });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players: PLAYERS });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: TEAM, name: 'Stub RFC', fixtures: FIXTURES } });
    if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [], messages: [] });
    if (u.startsWith('/api/schedules')) return send({ ok: true, schedules: [] });
    if (u.startsWith('/api/templates')) return send({ ok: true, templates: [] });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  ctl.hold = () => { ctl.gate = new Promise(r => { release = r; }); };
  ctl.release = () => { release(); ctl.gate = null; };
  return { srv, ctl };
}
const SEED = { activeView: 'coach', activeCoachSection: 'overview', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' }], operationalGroupId: GRP, players: PLAYERS, fixtures: FIXTURES, messages: [], onboardingDismissed: true,
  availabilityRequests: [{ sessionId: SAT, status: 'sent', sentAt: '2026-09-22T09:00:00Z', groupId: GRP, clubId: TEAM, sentWeek: WEEK }] };
const waitFor = async (fnc, ms, every = 60) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, every)); } };

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): the admin read answers AFTER the session has named the club — it is applied, the Overview prompt and Members appear, no 15s stall`, { timeout: 90000 }, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, ctl } = stubServer();
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), SEED);
      const page = await ctx.newPage();
      const errors = [], consoleErrors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); });
      ctl.hold();
      await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
      // 1–2. The session names the club while the admin read is still out.
      assert.ok(await waitFor(() => ctl.adminReads >= 1, 15000), 'the admin read left');
      assert.ok(await waitFor(() => page.evaluate(c => _clubContextId === c, TEAM), 15000), 'the session named the club');
      const held = await page.evaluate(() => ({ loading: _adminData.loading, loaded: _adminData.loaded }));
      assert.deepEqual(held, { loading: true, loaded: false }, 'and the admin read is still out');
      // 3. The admin data arrives afterwards.
      ctl.release();
      assert.ok(await waitFor(() => page.evaluate(() => _adminData.loaded === true), 6000), 'the reply is applied — not discarded and held off for 15s');
      assert.equal(await page.evaluate(() => _adminData.failed), false);
      // 4. The Overview is not left without its roster.
      assert.ok(await waitFor(() => page.evaluate(() => /\d+ players? haven't replied/.test(document.getElementById('coach-overview')?.innerText || '')), 6000),
        'the Overview states its prompt: ' + (await page.evaluate(() => (document.getElementById('coach-overview')?.innerText || '').replace(/\s+/g, ' ').slice(0, 200))));
      assert.ok(await page.evaluate(() => operationalPlayers().length) > 0, 'the operating group has its players');
      // 5–6. Members is not stuck on "Loading the squad", and shows this club's squad.
      await page.evaluate(() => setSection('coach', 'players'));
      assert.ok(await waitFor(() => page.evaluate(() => /Player 1\b/.test(document.getElementById('coach-players')?.innerText || '')), 6000), 'Members shows the squad');
      assert.doesNotMatch(await page.evaluate(() => document.getElementById('coach-players')?.innerText || ''), /Loading the squad/);
      assert.equal(await page.evaluate(() => state.stateTeamId), TEAM, 'the club in force is the session\'s');
      // 7–8.
      assert.deepEqual(errors, [], 'no page errors'); assert.deepEqual(consoleErrors, [], 'no console errors');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, 'no horizontal overflow');
      await ctx.close();
    } finally { ctl.release(); await browser.close(); srv.close(); }
  });
}
