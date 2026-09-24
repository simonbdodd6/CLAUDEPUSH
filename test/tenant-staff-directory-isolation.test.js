/**
 * THE STAFF DIRECTORY IS PER-CLUB — a switch must not carry it over.
 *
 * Production, 2026-09-24: an administrator of two clubs switched from the
 * first to the second and Members → Coaches & staff listed the FIRST club's
 * coaches, with their emails, inside the second. The server was right — its
 * reply for the second club named one member — the client was not:
 *
 *   · the list renders from state.users, the persisted user directory;
 *   · loadStaffDirectory() only ever ADDED to it;
 *   · the club-switch reset never touched it;
 *   · _adminData kept the old club's members/invites/structure (only `loaded`
 *     was flipped), and the 30 s directory throttle was never reset.
 *
 * Three layers, each pinned here: the switch reset empties what is per-club
 * while keeping the signed-in account; the directory is REPLACED by the
 * server's reply and every row is stamped with the club it came from; and
 * the renderers fail closed — no stamp, or another club's, is never shown.
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

const ME    = { id: 'u_me',    role: 'coach',  name: 'Nick Admin',   email: 'nick@x.test' };
const A_COACH = { id: 'u_a1', role: 'coach',  name: 'Simon Alpha',  email: 'simon@alpha.test', _staff: true, teamId: 'club-a' };
const A_MED   = { id: 'u_a2', role: 'medical', name: 'Alice Physio', email: 'alice@alpha.test', _staff: true, teamId: 'club-a' };
const A_LEGACY = { id: 'u_a3', role: 'admin', name: 'Old Row',      email: 'old@alpha.test', _staff: true };       // written before rows were stamped
const A_PLAYER_ROW = { id: 'local-p1', role: 'player', name: 'Bo Alpha', playerId: 'p1' };                          // roster-derived local row
const DEMO = { id: 'coach-demo', role: 'coach', name: 'Simon Coach' };                                               // a non-directory account row

// ── 1. the switch reset ───────────────────────────────────────────────────
function resetScope({ users, currentUserId = 'u_me' }) {
  return new Function(`"use strict";
    const defaultState = { matchCentre: {}, schedule: [], trainingBlocks: {} };
    let saves = 0; function saveState() { saves++; }
    let _rosterSyncTimer = 0, _rosterSyncPending = true, _rosterSyncDeferred = true, _rosterLastSyncedFp = 'x';
    let _appearanceAdjustments = {}, _seasonSheets = [], _seasonSheetsGroup = 'g', _trainingPubState = { a: 1 }, _trainingPubLoadedAt = 9;
    let _trainingSchedule = { slots: [] }, _trainingScheduleAttempted = true, _groupRecipients = { g: [] }, _clubConfigChecked = true, _publishedStateLoadedAt = 9;
    let _autopilotEnsured = true, _autopilotLogAt = 9, _autopilotLog = [1];
    let _staffDirLoadedAt = 123456, _staffDetailUserId = 'u_a1', _clubContextId = 'club-a';
    let _adminData = { invites: [{ token: 't' }], members: [{ userId: 'u_a1' }], users: [{ id: 'u_a1' }], profiles: [{}],
      structure: { groups: [] }, structureAccess: { clubWideStaffIds: ['u_a1'], groupStaffIds: {} }, counts: { x: 1 },
      clubWideStaff: [{ id: 'u_a1' }], loaded: true, loading: false, attempted: true, failed: false };
    function rosterFingerprint() { return 'fp'; }
    function clearTimeout() {}
    const state = { stateTeamId: 'club-a', currentUserId: ${JSON.stringify(currentUserId)}, users: ${JSON.stringify(users)},
      players: [{ id: 'p1' }], fixtures: [], operationalGroupId: 'g' };
    ${fn('resetTeamScopedState')}
    ${fn('resetClubScopedState')}
    resetClubScopedState();
    return { users: state.users, adminData: _adminData, staffDirLoadedAt: _staffDirLoadedAt, staffDetailUserId: _staffDetailUserId, clubContextId: _clubContextId, saves };
  `)();
}

test('1. a club switch drops the previous club\'s directory and roster rows, and keeps the signed-in account', () => {
  const r = resetScope({ users: [ME, A_COACH, A_MED, A_LEGACY, A_PLAYER_ROW, DEMO] });
  const ids = r.users.map(u => u.id);
  assert.ok(ids.includes('u_me'), 'the signed-in account survives');
  assert.ok(!ids.includes('u_a1') && !ids.includes('u_a2'), 'stamped directory rows are gone');
  assert.ok(!ids.includes('u_a3'), 'an unstamped legacy directory row is gone too');
  assert.ok(!ids.includes('local-p1'), 'a roster-derived local player row is gone — the new roster re-derives its own');
  assert.ok(ids.includes('coach-demo'), 'an ordinary account row that is neither is untouched');
  assert.ok(r.saves >= 1, 'the wipe is persisted, so it survives a reload');
});

test('1. a dual-role account keeps its own player-shaped record', () => {
  const me = { id: 'u_me', role: 'player', name: 'Nick Player', playerId: 'p-nick' };
  const r = resetScope({ users: [me, A_PLAYER_ROW, A_COACH] });
  assert.deepEqual(r.users.map(u => u.id), ['u_me'], 'only the signed-in account remains, even though it looks like a roster row');
});

test('1. a directory row that happens to be the signed-in account is never dropped', () => {
  const me = { ...ME, _staff: true, teamId: 'club-a' };
  const r = resetScope({ users: [me, A_COACH] });
  assert.deepEqual(r.users.map(u => u.id), ['u_me']);
});

test('1. the Members data is emptied, not merely marked unloaded; the throttle and the open editor are reset', () => {
  const r = resetScope({ users: [ME] });
  assert.deepEqual(r.adminData.members, []); assert.deepEqual(r.adminData.users, []); assert.deepEqual(r.adminData.invites, []);
  assert.deepEqual(r.adminData.profiles, []); assert.equal(r.adminData.structure, null); assert.equal(r.adminData.structureAccess, null);
  assert.equal(r.adminData.loaded, false); assert.equal(r.adminData.loading, false); assert.equal(r.adminData.failed, false);
  assert.equal(r.staffDirLoadedAt, 0, 'the next Members render fetches the new club\'s directory immediately');
  assert.equal(r.staffDetailUserId, null, 'no editor stays open on another club\'s member');
  assert.equal(r.clubContextId, '', 'no club is in force until the server names the next one');
});

// ── 2. the directory is REPLACED and STAMPED ──────────────────────────────
function directoryScope({ users, stateTeamId, currentUserId = 'u_me', replies }) {
  return new Function(`"use strict";
    const STAFF_ROLES = ['coach', 'admin', 'medical', 'snc', 'analyst'];
    function isCoach() { return true; }
    const replies = ${JSON.stringify(replies)};
    let call = 0;
    async function fetch() { const r = replies[Math.min(call++, replies.length - 1)]; return { ok: r.ok !== false, json: async () => r.body || {} }; }
    let _clubContextId = ${JSON.stringify(stateTeamId)}, _staffDirLoadedAt = 555;
    const state = { stateTeamId: ${JSON.stringify(stateTeamId)}, currentUserId: ${JSON.stringify(currentUserId)}, users: ${JSON.stringify(users)} };
    ${fn('loadStaffDirectory')}
    return { load: () => loadStaffDirectory(), state, throttle: () => _staffDirLoadedAt };
  `)();
}
const reply = (teamId, staff) => ({ body: {
  teams: [{ id: teamId, name: teamId }],
  team_members: staff.map(s => ({ userId: s.id, role: s.role, status: 'active' })),
  users: staff.map(s => ({ id: s.id, displayName: s.name, email: s.email })),
} });

test('2. club A\'s reply stamps every row with club A; club B\'s reply replaces the directory with club B\'s', async () => {
  const A = [ME, A_COACH, A_MED];
  const B = [ME, { id: 'u_b1', role: 'coach', name: 'Beto Navarra', email: 'beto@beta.test' }];
  const s = directoryScope({ users: [ME], stateTeamId: 'club-a', replies: [reply('club-a', A)] });
  await s.load();
  const a = s.state.users;
  assert.deepEqual(a.map(u => u.id).sort(), ['u_a1', 'u_a2', 'u_me'].sort(), 'club A staff loaded');
  assert.ok(a.filter(u => u._staff).every(u => u.teamId === 'club-a'), 'every directory row is stamped with club A');
  assert.equal(a.find(u => u.id === 'u_me').teamId, 'club-a', 'the signed-in account\'s own row is stamped too');

  // The switch happened (state.stateTeamId is now club B) and the reset already ran; even if it had NOT, the reply replaces.
  const s2 = directoryScope({ users: a, stateTeamId: 'club-b', replies: [reply('club-b', B)] });
  await s2.load();
  const b = s2.state.users;
  assert.deepEqual(b.map(u => u.id).sort(), ['u_b1', 'u_me'].sort(), 'club A\'s staff are removed; club B\'s are present');
  assert.ok(b.filter(u => u._staff).every(u => u.teamId === 'club-b'));
  assert.equal(b.find(u => u.id === 'u_me').teamId, 'club-b', 'the signed-in row is re-stamped for club B');
});

test('2. a reply for a club this device has since left is discarded, not filed under the current club', async () => {
  const s = directoryScope({ users: [ME], stateTeamId: 'club-b', replies: [reply('club-a', [ME, A_COACH])] });
  await s.load();
  assert.deepEqual(s.state.users.map(u => u.id), ['u_me'], 'nothing from club A was applied');
  assert.equal(s.state.users[0].teamId, undefined, 'and nothing was stamped');
  assert.equal(s.throttle(), 0, 'and the directory throttle is released so the next render asks again');
});

test('2. a reply that names no club applies nothing; a failed read changes nothing', async () => {
  const noTeam = { body: { team_members: [{ userId: 'u_a1', role: 'coach', status: 'active' }], users: [{ id: 'u_a1', displayName: 'X' }] } };
  const s = directoryScope({ users: [ME, A_COACH], stateTeamId: 'club-a', replies: [noTeam] });
  await s.load();
  assert.deepEqual(s.state.users.map(u => u.id), ['u_me', 'u_a1'], 'unchanged');
  const s2 = directoryScope({ users: [ME, A_COACH], stateTeamId: 'club-a', replies: [{ ok: false }] });
  await s2.load();
  assert.deepEqual(s2.state.users.map(u => u.id), ['u_me', 'u_a1'], 'unchanged on a non-OK read');
});

test('2. a staff member the server no longer lists is removed on the next read', async () => {
  const s = directoryScope({ users: [ME, A_COACH, A_MED], stateTeamId: 'club-a', replies: [reply('club-a', [ME, A_COACH])] });
  await s.load();
  assert.deepEqual(s.state.users.map(u => u.id).sort(), ['u_a1', 'u_me'].sort(), 'the removed medic is gone');
});

test('2. the player-side DM candidates follow the same rules', async () => {
  const s = new Function(`"use strict";
    const replies = [{ candidates: [{ userId: 'u_b1', role: 'coach', name: 'Beto Navarra' }] }];
    async function fetch() { return { ok: true, json: async () => replies[0] }; }
    let _clubContextId = 'club-b';
    const state = { stateTeamId: 'club-b', currentUserId: 'u_me', users: ${JSON.stringify([ME, A_COACH])} };
    ${fn('chatLoadDmCandidates')}
    return { load: () => chatLoadDmCandidates(), state };
  `)();
  await s.load();
  assert.deepEqual(s.state.users.map(u => u.id).sort(), ['u_b1', 'u_me'].sort(), 'club A\'s stale candidate is gone, club B\'s is in');
  assert.equal(s.state.users.find(u => u.id === 'u_b1').teamId, 'club-b', 'stamped with the club in force');
  const none = new Function(`"use strict";
    async function fetch() { return { ok: true, json: async () => ({ candidates: [{ userId: 'u_x', role: 'coach', name: 'X' }] }) }; }
    let _clubContextId = '';
    const state = { stateTeamId: '', currentUserId: 'u_me', users: ${JSON.stringify([ME])} };
    ${fn('chatLoadDmCandidates')}
    return { load: () => chatLoadDmCandidates(), state };
  `)();
  await none.load();
  assert.deepEqual(none.state.users.map(u => u.id), ['u_me'], 'with no club in force nothing is added');
});

// ── 3. the boundary, fail closed ──────────────────────────────────────────
test('3. a staff row renders only with THIS club\'s stamp — missing or foreign fails closed', () => {
  const scope = new Function(`"use strict";
    let _clubContextId = 'club-b';
    ${fn('staffRowInCurrentClub')}
    return staffRowInCurrentClub;
  `)();
  assert.equal(scope({ id: 'x', teamId: 'club-b' }), true, 'this club\'s row shows');
  assert.equal(scope({ id: 'x', teamId: 'club-a' }), false, 'another club\'s row does not');
  assert.equal(scope({ id: 'x' }), false, 'a row with no stamp does not');
  assert.equal(scope(null), false);
  const noClub = new Function(`"use strict"; let _clubContextId = ''; ${fn('staffRowInCurrentClub')} return staffRowInCurrentClub;`)();
  assert.equal(noClub({ id: 'x', teamId: 'club-b' }), false, 'with no club in force nothing shows');
});

test('3. every staff consumer applies the boundary', () => {
  const players = fn('renderPlayers');
  assert.match(players, /\.filter\(u => !!_clubInForce && !!u && String\(u\.teamId \|\| ''\) === _clubInForce\)\s*\n\s*\.filter\(u => isStaffRole\(u\.role\) && u\.name\)/,
    'the Coaches & staff list is bounded before anything else');
  assert.match(players, /const _clubInForce = String\(\(typeof _clubContextId !== 'undefined' && _clubContextId\) \|\| ''\);/,
    'and the club in force is the session-proven id, never the persisted marker');
  assert.match(fn('chatStaffDmCandidates'), /\.filter\(staffRowInCurrentClub\)/, 'staff DM discovery is bounded');
  assert.match(fn('chatStartCoachDm'), /staffRowInCurrentClub\(u\) && isStaffRole\(u\.role\)/, 'the staff DM lookup is bounded');
  // No permissive fallback anywhere the boundary is stated.
  assert.doesNotMatch(fn('staffRowInCurrentClub'), /return true/, 'the helper has no unconditional true');
});

test('3. Members: a stale reply for a club that has been left is never applied', async () => {
  const s = new Function(`"use strict";
    let resolveIdentity; const pending = new Promise(r => { resolveIdentity = r; });
    async function fetch(url) {
      if (String(url).startsWith('/api/identity')) return pending;
      return { ok: false, json: async () => ({}) };
    }
    let _adminData = { invites: [], members: [], users: [], profiles: [], structure: null, counts: null, clubWideStaff: [], loaded: false, loading: false, attempted: false, failed: false };
    let _adminDataAttemptAt = 0;
    let _clubContextId = 'club-a';
    const state = { stateTeamId: 'club-a', activeView: 'coach', activeCoachSection: 'players' };
    function renderClubAdmin() {} function renderPlayers() {} function applyClubConfigLocally() {}
    ${fn('loadAdminData')}
    const p = loadAdminData();
    _clubContextId = 'club-b';                            // the switch lands while club A's read is in flight
    resolveIdentity({ ok: true, json: async () => ({ users: [{ id: 'u_a1' }], team_members: [{ userId: 'u_a1', teamId: 'club-a' }], player_profiles: [] }) });
    return p.then(() => _adminData);
  `)();
  const d = await s;
  assert.deepEqual(d.members, [], 'club A\'s members were not filed under club B');
  assert.equal(d.loaded, false, 'and the next render will fetch club B\'s own');
  assert.equal(d.loading, false, 'the loader is free to run again');
});

// ── 4 + 5. the real app: the exact production journey ─────────────────────
process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.staff-isolation.test';
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
  if (cmd === 'SCAN' || cmd === 'KEYS') {
    // Upstash shape: [cursor, keys] — a flat list makes kvScanKeys loop for ever.
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
  test(`browser (${view}): switching clubs never shows the previous club's staff — on screen, after a reload, or as DM candidates`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    try {
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      const BASE = `http://127.0.0.1:${server.address().port}`;
      const email = `nick.${view}@x.test`;
      // Club A with two staff of its own (the "Boitsfort" role); club B founded by Nick (the "Navarra" role).
      const A = await S.createClub({ clubName: `Alpha ${view} RC`, teamName: 'First XV', sport: 'Rugby', name: 'Simon Alpha', email: `simon.${view}@alpha.test`, password: PW, idempotencyKey: kkey() });
      const B = await S.createClub({ clubName: `Beta ${view} RC`,  teamName: 'First XV', sport: 'Rugby', name: 'Nick Admin', email, password: PW, idempotencyKey: kkey() });
      const teamCode = (await S.loadStoredTeams()).find(t => t.id === A.team.id).teamCode;
      const alice = await S.createJoinRequest({ teamCode, firstName: 'Alice', lastName: 'Physio', email: `alice.${view}@alpha.test`, password: PW });
      const members = await S.loadTeamMembers();
      members.forEach(m => { if (m.userId === alice.user.id && m.teamId === A.team.id) { m.role = 'medical'; m.status = 'active'; } });
      members.push({ id: 'tm_nick_a_' + view, teamId: A.team.id, userId: B.user.id, role: 'coach', staffLevel: 'head', status: 'active', accessProfile: 'full', joinedAt: '2026-01-01T00:00:00.000Z' });
      await S.saveTeamMembers(members);
      const users = await S.loadUsers(); users.find(u => u.id === B.user.id).lastTeamId = A.team.id; await S.saveUsers(users);  // Nick's history: a long time in club A

      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const staffOnScreen = () => page.evaluate(() => {
        const el = document.getElementById('members-staff-title');
        const box = el?.closest('div.card') || el?.parentElement?.parentElement;
        return (box?.innerText || '').replace(/\s+/g, ' ');
      });
      const dmCandidates = () => page.evaluate(() => chatStaffDmCandidates(state.currentUserId).map(c => c.name));
      const openMembers = async () => { await page.evaluate(() => setSection('coach', 'players')); await page.waitForTimeout(600); };

      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ce-welcome', { timeout: 20000 });
      await page.click('#ce-welcome button:has-text("Log in")');
      await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
      await page.fill('#identityLoginEmail', email); await page.fill('#identityLoginPassword', PW); await page.click('#identityLoginBtn');
      await page.waitForFunction(id => typeof state !== 'undefined' && state.stateTeamId === id, A.team.id, { timeout: 20000 });
      await page.waitForSelector('#clubSwitchSelect', { timeout: 20000 });

      // Club A: its staff load and show (three: Nick, Simon, Alice).
      await openMembers();
      await page.waitForFunction(() => /Alice Physio/.test(document.getElementById('players')?.innerText || document.body.innerText), null, { timeout: 20000 });
      let text = await staffOnScreen();
      assert.match(text, /Simon Alpha/); assert.match(text, /Alice Physio/); assert.match(text, /Nick Admin/);
      assert.deepEqual((await dmCandidates()).sort(), ['Alice Physio', 'Simon Alpha'], 'club A DM candidates');

      // Switch to club B, open Members.
      await page.selectOption('#clubSwitchSelect', B.team.id);
      await page.waitForFunction(id => state.stateTeamId === id, B.team.id, { timeout: 20000 });
      await openMembers();
      await page.waitForFunction(() => /Nick Admin/.test(document.body.innerText), null, { timeout: 20000 });
      await page.waitForTimeout(600);
      text = await staffOnScreen();
      assert.doesNotMatch(text, /Simon Alpha|Alice Physio|alpha\.test/, 'club A\'s staff are not shown under club B');
      assert.match(text, /Nick Admin/, 'club B\'s own staff are');
      assert.deepEqual(await dmCandidates(), [], 'no DM candidate from club A remains');
      assert.equal(await page.evaluate(() => (state.users || []).filter(u => u._staff && u.teamId !== state.stateTeamId).length), 0,
        'no directory row of another club is held in state');

      // Reload while in club B: the persisted state must not bring them back.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId, null, { timeout: 20000 });
      await openMembers();
      await page.waitForTimeout(800);
      text = await staffOnScreen();
      assert.doesNotMatch(text, /Simon Alpha|Alice Physio/, 'still not after a reload');
      assert.match(text, /Nick Admin/);

      // Switch back to club A: its own staff, all of them, and nothing else.
      await page.selectOption('#clubSwitchSelect', A.team.id);
      await page.waitForFunction(id => state.stateTeamId === id, A.team.id, { timeout: 20000 });
      await openMembers();
      await page.waitForFunction(() => /Alice Physio/.test(document.body.innerText), null, { timeout: 20000 });
      text = await staffOnScreen();
      assert.match(text, /Simon Alpha/); assert.match(text, /Alice Physio/); assert.match(text, /Nick Admin/);
      assert.deepEqual((await dmCandidates()).sort(), ['Alice Physio', 'Simon Alpha']);

      assert.deepEqual(errors, [], 'no page errors');
      assert.ok(await page.evaluate(() => (document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0), 'no horizontal overflow');
      await ctx.close();
    } finally { await browser.close(); await new Promise(r => server.close(r)); }
  });
}
