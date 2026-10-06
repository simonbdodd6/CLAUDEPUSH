/**
 * A CLUB SWITCH NEVER OVERWRITES THE CLUB'S ROSTER (Build 133, P0 #2)
 *
 * Build 132 reproduced, end to end against the production merge, a roster
 * overwrite: a coach who belongs to two clubs switched club; inside the next
 * board read the identity link found the new club's players in the identity
 * data before the roster read had answered, added a minimal row for each
 * (name, userId, position "TBC"), and the save queued a push. The roster
 * reply then lost to the pending-push guard, and the club-wide save replaced
 * every stored row: dates of birth, notes, guardian and emergency contacts
 * gone, positions "TBC", an unlinked trialist dropped. It happened even with a
 * HEALTHY roster read — the order was wrong, not the network.
 *
 * Two invariants, proved separately:
 *   CLIENT  authoritative roster read succeeds → identity link → push.
 *           Nothing is added from identity data, and nothing is pushed, for a
 *           roster the device has not read; a reply for a roster since wiped
 *           is discarded whole.
 *   SERVER  a blank never erases what the club holds: a submitted row that is
 *           a stored row (same id, or the same account) keeps every stored
 *           field the submission leaves blank, and a placeholder position
 *           never replaces a real one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.b133-roster.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  if (!String(u).includes('redis.b133-roster.test')) return realFetch(u, o);
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { const nx = a.includes('NX'); if (nx && kv.has(a[0])) r = null; else { kv.set(a[0], a[1]); r = 'OK'; } }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (['LPUSH', 'LRANGE', 'LTRIM', 'EXPIRE'].includes(c)) r = c === 'LRANGE' ? [] : 'OK';
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: publish } = await import('../api/publish.js');
const { preserveStoredFields } = await import('../api/_rosterProjection.js');
const { SESSION_COOKIE } = store;
const PW = 'password123';
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
function jres() { return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() {}, end() { return this; } }; }
async function roster(method, body, cookie) { const r = jres(); await publish({ method, query: { resource: 'roster' }, headers: { cookie }, body: body || {} }, r); return r; }
let _t = 0;
async function club(label) { return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Coach`, email: `c${++_t}@ri.test`, password: PW }); }
async function claimPlayer(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0'); const email = `p${_t}@ri.test`;
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return store.claimInvite({ position: '2 — Hooker', token, email, name, password: PW });
}
const DETAIL = i => ({ position: 'Prop', dateOfBirth: `2008-05-0${(i % 9) + 1}`, phone: `+3247000000${i}`, notes: `coach note ${i}`,
  parentGuardianName: `Guardian ${i}`, emergencyContact: `EC ${i}`, medical: `knee ${i}` });

// ═══ SERVER ════════════════════════════════════════════════════════════════

test('SERVER: the exact Build 132 payload — minimal rows under different ids, position TBC — no longer erases a single stored field', async () => {
  kv.clear(); _t = 0;
  const B = await club('Bravo');
  const players = [];
  for (let i = 0; i < 6; i++) players.push(await claimPlayer(B.team.id, `Bravo Player ${i}`));
  // the coach's complete roster: the server rows, enriched with coach detail, plus an unlinked trialist
  const got = await roster('GET', null, ck(B.session));
  assert.equal(got.statusCode, 200, JSON.stringify(got.body));
  const full = got.body.players.map((p, i) => ({ ...p, ...DETAIL(i) }));
  full.push({ id: 'trial_1', name: 'Trialist Kid', position: 'Wing', dateOfBirth: '2009-01-01', notes: 'trial week' });
  assert.equal((await roster('POST', { players: full }, ck(B.session))).statusCode, 200);
  // the overwrite: one minimal row per player, keyed by the user id, TBC, no detail (what the device sent in Build 132)
  const minimal = full.filter(p => p.userId).map(p => ({ id: p.userId, userId: p.userId, name: p.name, position: 'TBC', playerGroupId: p.playerGroupId }));
  const post = await roster('POST', { players: minimal }, ck(B.session));
  assert.equal(post.statusCode, 200, JSON.stringify(post.body));
  const after = (await roster('GET', null, ck(B.session))).body.players;
  for (let i = 0; i < 6; i++) {
    const row = after.find(r => r.userId === full[i].userId);
    assert.ok(row, `player ${i} still on the roster`);
    for (const [k, v] of Object.entries(DETAIL(i))) assert.equal(row[k], v, `player ${i}: ${k} kept`);
    assert.equal(row.id, full[i].id, `player ${i}: the stored id is kept (medical, appearances and availability key on it)`);
  }
});

test('SERVER: blank, null, whitespace and absent fields keep the stored value; real edits still apply; a placeholder position never replaces a real one', () => {
  const stored = [{ id: 'r1', userId: 'u1', name: 'Ana', position: 'Prop', phone: '+32', notes: 'n', dateOfBirth: '2008-01-01', email: 'a@x.test' }];
  const next = [{ id: 'r1', userId: 'u1', name: 'Ana Ruiz', position: 'TBC', phone: '', notes: null, dateOfBirth: '   ', email: 'ana@x.test' }];
  const { rows, preserved } = preserveStoredFields({ storedRows: stored, nextRows: next });
  assert.deepEqual(rows[0], { id: 'r1', userId: 'u1', name: 'Ana Ruiz', position: 'Prop', phone: '+32', notes: 'n', dateOfBirth: '2008-01-01', email: 'ana@x.test' });
  assert.equal(preserved, 4);
  // a real position change applies
  assert.equal(preserveStoredFields({ storedRows: stored, nextRows: [{ id: 'r1', name: 'Ana', position: 'Hooker' }] }).rows[0].position, 'Hooker');
  // a TBC stored position is replaced by a real one, and stays TBC when both are placeholders
  assert.equal(preserveStoredFields({ storedRows: [{ id: 'r2', name: 'B', position: 'TBC' }], nextRows: [{ id: 'r2', name: 'B', position: 'Wing' }] }).rows[0].position, 'Wing');
  // the SAME account submitted under ANOTHER id keeps the stored id (medical cases, appearances and
  // availability are keyed by it) and the stored detail — unless the submission also carries that id
  const moved = preserveStoredFields({ storedRows: stored, nextRows: [{ id: 'u1', userId: 'u1', name: 'Ana', position: 'TBC' }] }).rows[0];
  assert.equal(moved.id, 'r1', 'stored id kept');
  assert.equal(moved.dateOfBirth, '2008-01-01');
  assert.equal(moved.position, 'Prop');
  const both = preserveStoredFields({ storedRows: stored, nextRows: [{ id: 'r1', name: 'Other' }, { id: 'u1', userId: 'u1', name: 'Ana' }] }).rows;
  assert.deepEqual(both.map(r => r.id), ['r1', 'u1'], 'never two rows with one id');
});

test('SERVER: a row claimed by ANOTHER account never lends its fields; a brand-new row is untouched; another club\'s ids bring nothing across', async () => {
  const stored = [{ id: 'r1', userId: 'u_a', name: 'John Smith', dateOfBirth: '2000-01-01', notes: 'A only' }];
  const { rows } = preserveStoredFields({ storedRows: stored, nextRows: [{ id: 'r1', userId: 'u_b', name: 'John Smith', dateOfBirth: '' }, { id: 'new', name: 'New Kid' }] });
  assert.equal(rows[0].dateOfBirth, '', 'a different account under the same id gets nothing of the stored row');
  assert.equal(rows[0].notes, undefined);
  assert.deepEqual(rows[1], { id: 'new', name: 'New Kid' });
  // through the handler: Club B submits Club A's player ids/user ids — the merge only ever reads Club B's own record
  kv.clear(); _t = 0;
  const A = await club('Alpha'); const B = await club('Bravo');
  const a1 = await claimPlayer(A.team.id, 'Alpha One');
  const aRows = (await roster('GET', null, ck(A.session))).body.players.map(p => ({ ...p, ...DETAIL(1) }));
  assert.equal((await roster('POST', { players: aRows }, ck(A.session))).statusCode, 200);
  const forged = await roster('POST', { players: aRows.map(r => ({ id: r.id, userId: r.userId, name: r.name, position: 'TBC' })) }, ck(B.session));
  assert.ok([200, 400, 403].includes(forged.statusCode));
  const bAfter = (await roster('GET', null, ck(B.session))).body.players || [];
  assert.ok(!JSON.stringify(bAfter).includes('coach note 1'), 'no Club A detail reaches Club B');
  const aAfter = (await roster('GET', null, ck(A.session))).body.players;
  assert.equal(aAfter.find(r => r.userId === a1.user.id).notes, 'coach note 1', 'Club A unchanged');
});

// ═══ CLIENT ════════════════════════════════════════════════════════════════

let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* asserted below — never a silent skip */ }
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const COACH = { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' };
const mk = (id, name, grp, tag, n) => ({ id, name, grp,
  players: Array.from({ length: n }, (_, i) => ({ id: tag + i, userId: 'u_' + tag + i, name: `${name.split(' ')[0]} Player ${i}`, playerGroupId: grp, ...DETAIL(i) })) });
const CLUBS = { team_a: mk('team_a', 'Alpha RFC', 'grp_a', 'a', 8), team_b: mk('team_b', 'Bravo RFC', 'grp_b', 'b', 6), team_c: mk('team_c', 'Charlie RFC', 'grp_c', 'c', 0) };
CLUBS.team_b.players.push({ id: 'trial_b', name: 'Bravo Trialist', position: 'Wing', dateOfBirth: '2009-01-01', notes: 'trial week', playerGroupId: 'grp_b' });

function stubServer({ start = 'team_a', identityExtra = {} } = {}) {
  const ctl = { current: start, log: [], posts: [], failRoster: null, gates: {} };
  const session = () => { const c = CLUBS[ctl.current]; return { ok: true, user: { ...COACH, platformRole: '' },
    teamMember: { teamId: c.id, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
    permissions: ['reports', 'messaging', 'manage_players', 'manage_teams', 'manage_coaches', 'training', 'matchday', 'publish_training'],
    memberships: Object.values(CLUBS).map(x => ({ teamId: x.id, teamName: x.name, role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: x.id === c.id })),
    operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: c.grp, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: c.grp, mustChoose: false } } }; };
  const linked = c => c.players.filter(p => p.userId).concat(identityExtra[c.id] || []);
  const adminIdentity = c => ({ ok: true,
    users: [{ id: 'u1', displayName: 'Coach Stub', email: 'c@s.test', role: 'coach' }, ...linked(c).map(p => ({ id: p.userId, displayName: p.name, email: p.userId + '@s.test', role: 'player' }))],
    team_members: [{ teamId: c.id, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null }, ...linked(c).map(p => ({ teamId: c.id, userId: p.userId, role: 'player', status: 'active', playerGroupId: c.grp }))],
    player_profiles: linked(c).map(p => ({ id: 'pp_' + p.userId, userId: p.userId, teamId: c.id, displayName: p.name, playerGroupId: c.grp })) });
  const srv = http.createServer(async (req, res) => {
    const u = req.url || '/', c = CLUBS[ctl.current];
    let body = ''; if (req.method !== 'GET') { for await (const ch of req) body += ch; }
    const send = (o, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/')) {
      ctl.log.push({ m: req.method, u: u.split('?')[0], club: c.id });
      if (u === '/api/identity' && req.method === 'POST') {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        if (b.action === 'switch_team' && CLUBS[b.teamId]) { ctl.current = b.teamId; return send({ ok: true }); }
        return send({ ok: true });
      }
      if (u === '/api/identity' && req.method === 'GET') return send(adminIdentity(c));
      if (u.startsWith('/api/identity')) return send(session());
      if (u.startsWith('/api/roster') && req.method === 'POST') {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        ctl.posts.push({ club: c.id, players: b.players || [] });
        return send({ ok: true });
      }
      if (u.startsWith('/api/roster')) {
        if (ctl.failRoster === c.id) return send({ ok: false }, 500);
        const answer = { ok: true, players: structuredClone(c.players) };
        const gate = ctl.gates[c.id];
        if (gate) {   // headers now, BODY held (Build 125 lesson) — per club, so one club's reply can land late
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.flushHeaders();
          await gate.promise; return res.end(JSON.stringify(answer));
        }
        return send(answer);
      }
      if (u.startsWith('/api/availability')) return send({ resolved: {}, roster: c.players });
      if (u.startsWith('/api/invite')) return send({ ok: true, invites: [] });
      if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: [] });
      if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: c.grp, name: 'Seniors', status: 'active' }], teams: [] });
      if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: c.grp, canEdit: true });
      if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: c.id, name: c.name, fixtures: [] } });
      if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [], messages: [] });
      if (u.startsWith('/api/schedules')) return send({ ok: true, schedules: [] });
      if (u.startsWith('/api/templates')) return send({ ok: true, templates: [] });
      return send({ ok: true });
    }
    const f = u.split('?')[0] === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
  });
  ctl.hold = clubId => { let r; const promise = new Promise(x => { r = x; }); ctl.gates[clubId] = { promise, open: r }; };
  ctl.release = clubId => { for (const id of clubId ? [clubId] : Object.keys(ctl.gates)) { ctl.gates[id]?.open(); delete ctl.gates[id]; } };
  ctl.rosterGets = clubId => ctl.log.filter(x => x.m === 'GET' && x.u === '/api/roster' && (!clubId || x.club === clubId)).length;
  return { srv, ctl };
}
const seed = clubId => { const c = CLUBS[clubId]; return { activeView: 'coach', activeCoachSection: 'message', stateTeamId: c.id, clubName: c.name, currentUserId: 'u1',
  users: [{ ...COACH }], operationalGroupId: c.grp, players: structuredClone(c.players), fixtures: [], messages: [], onboardingDismissed: true, availabilityRequests: [] }; };
const waitFor = async (f, ms = 15000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await f(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, 50)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** A pushed row lacking stored detail, or with a placeholder position, is the Build 132 overwrite. */
const minimalRows = (posts, clubId) => posts.filter(p => p.club === clubId).flatMap(p => p.players).filter(r => r.userId && (r.position === 'TBC' || !r.dateOfBirth));

async function harness(t, view, opts = {}) {
  assert.ok(chromium, 'playwright must be installed: this data-integrity test may not skip');
  const browser = await chromium.launch();
  const { srv, ctl } = stubServer(opts);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const open = async (stateSeed) => {
    const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
    if (stateSeed) await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), stateSeed);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
    return { ctx, page, errors };
  };
  return { ctl, open, close: async () => { ctl.release(); await browser.close(); srv.close(); } };
}
const settled = (page, clubId, n) => waitFor(() => page.evaluate(([club, count]) => _clubContextId === club && _adminData.loaded === true
  && typeof rosterIsRead === 'function' && rosterIsRead() && state.players.length === count, [clubId, n]), 20000);
const look = page => page.evaluate(() => ({ club: _clubContextId, players: state.players.length, read: rosterIsRead(), awaiting: _rosterAwaitingServer,
  tbc: state.players.filter(p => p.position === 'TBC').length, alpha: state.players.filter(p => /^Alpha/.test(p.name)).length,
  withDob: state.players.filter(p => p.dateOfBirth).length }));
async function switchTo(page, clubId) {
  const viaSelect = await page.evaluate(() => !!document.getElementById('clubSwitchSelect')?.offsetParent);
  if (viaSelect) await page.selectOption('#clubSwitchSelect', clubId); else await page.evaluate(id => { switchTeamTo(id); }, clubId);
}

for (const view of ['desktop', 'phone']) {
  for (const mode of ['healthy', 'slow', 'failed']) {
    test(`CLIENT (${view}): the Build 132 repro — switch to Bravo with the identity link due, roster ${mode}: no minimal row is ever pushed, Bravo keeps every stored field, nothing of Alpha arrives`, { timeout: 90000 }, async (t) => {
      const b = await harness(t, view);
      try {
        const h = await b.open(seed('team_a'));
        assert.ok(await settled(h.page, 'team_a', 8), 'Alpha settled');
        if (mode === 'slow') b.ctl.hold('team_b');
        if (mode === 'failed') b.ctl.failRoster = 'team_b';
        await h.page.evaluate(() => { _availRosterLinkedAt = 0; });       // more than a minute since the last link
        const p0 = b.ctl.posts.length;
        await switchTo(h.page, 'team_b');
        assert.ok(await waitFor(() => h.page.evaluate(() => _clubContextId === 'team_b' && _adminData.loaded === true)), 'Bravo in force');
        // the identity link gets every chance to run while the roster is unread
        await h.page.evaluate(() => Promise.all([ensureCoachRosterIdentityLinked(), refreshLiveAvailability({ manual: true }).catch(() => {})]));
        let s = await look(h.page);
        if (mode !== 'healthy') {
          assert.equal(s.read, false, 'Bravo\'s roster is not read yet');
          assert.equal(s.tbc, 0, 'no minimal rows were built from identity data');
        }
        if (mode === 'slow') { await sleep(1500); b.ctl.release('team_b'); }
        await sleep(3500);                                                  // past the 2 s push debounce
        s = await look(h.page);
        const posts = b.ctl.posts.slice(p0);
        assert.deepEqual(minimalRows(posts, 'team_b'), [], 'no minimal row was pushed to Bravo');
        assert.equal(posts.filter(p => p.club !== 'team_b').length, 0, 'nothing was pushed to Alpha after the switch');
        assert.equal(s.alpha, 0, 'nothing of Alpha on the device');
        if (mode === 'failed') {
          assert.equal(posts.length, 0, 'a roster the device could not read is never pushed');
          assert.equal(s.read, false);
        } else {
          assert.equal(s.read, true, 'Bravo read');
          assert.equal(s.players, 7, 'six players and the trialist');
          assert.equal(s.withDob, 7, 'every stored date of birth is on the device');
          assert.equal(s.tbc, 0);
          for (const p of posts) for (const r of p.players) if (r.userId) assert.ok(r.dateOfBirth && r.position !== 'TBC', 'any push carries the complete rows');
        }
        assert.deepEqual(h.errors, []);
        await h.ctx.close();
      } finally { await b.close(); }
    });
  }

  test(`CLIENT (${view}): a coach EDIT made while the new club's roster is still unread is never pushed over it`, { timeout: 90000 }, async (t) => {
    const b = await harness(t, view);
    try {
      const h = await b.open(seed('team_a'));
      assert.ok(await settled(h.page, 'team_a', 8));
      b.ctl.hold('team_b');
      const p0 = b.ctl.posts.length;
      await switchTo(h.page, 'team_b');
      assert.ok(await waitFor(() => h.page.evaluate(() => _clubContextId === 'team_b' && _rosterAwaitingServer === true)), 'Bravo unread');
      // the coach adds someone in the gap — through the debounced push AND the immediate one
      await h.page.evaluate(() => { state.players.push({ id: 'local_1', name: 'Gap Signing', position: 'Wing' }); saveState('edit'); queueRosterSync(); return flushRosterSync(); });
      await sleep(2800);                                                  // past the 2 s debounce
      assert.equal(b.ctl.posts.slice(p0).filter(p => p.club === 'team_b').length, 0, 'nothing pushed while the roster is unread — a one-row list would replace Bravo\'s seven');
      b.ctl.release('team_b');
      assert.ok(await settled(h.page, 'team_b', 7), 'the read lands: the device holds the club\'s real roster');
      await sleep(2800);
      const pushed = b.ctl.posts.slice(p0).filter(p => p.club === 'team_b');
      assert.ok(pushed.every(p => p.players.length >= 7), 'any later push carries the full roster: ' + JSON.stringify(pushed.map(p => p.players.length)));
      await h.ctx.close();
    } finally { await b.close(); }
  });

  test(`CLIENT (${view}): a LATE roster reply — Bravo's read still out when the coach moves on to Charlie — fills nothing and ends nothing for Charlie`, { timeout: 90000 }, async (t) => {
    const b = await harness(t, view);
    try {
      const h = await b.open(seed('team_a'));
      assert.ok(await settled(h.page, 'team_a', 8));
      b.ctl.hold('team_b');
      await switchTo(h.page, 'team_b');
      assert.ok(await waitFor(() => h.page.evaluate(() => _clubContextId === 'team_b' && _rosterAwaitingServer === true)), 'Bravo waiting on its roster');
      // Charlie's roster is held too; Bravo's is released only once Charlie is in force
      b.ctl.hold('team_c');
      await switchTo(h.page, 'team_c');
      assert.ok(await waitFor(() => h.page.evaluate(() => _clubContextId === 'team_c')), 'Charlie in force');
      b.ctl.release('team_b');                                         // Bravo's reply lands LATE
      await sleep(1500);
      let s = await look(h.page);
      assert.equal(s.players, 0, 'Bravo\'s late reply did not fill Charlie');
      assert.equal(s.read, false, 'and did not mark Charlie read');
      assert.equal(s.awaiting, true, 'and did not end Charlie\'s wait');
      b.ctl.release('team_c');
      assert.ok(await waitFor(() => h.page.evaluate(() => rosterIsRead() && _rosterAwaitingServer === false)), 'Charlie\'s own (empty) answer ends the wait');
      await sleep(2500);
      s = await look(h.page);
      assert.equal(s.players, 0, 'Charlie is a genuinely empty club');
      assert.deepEqual(b.ctl.posts.filter(p => p.club === 'team_c').flatMap(p => p.players), [], 'nothing pushed into the empty club');
      const known = await h.page.evaluate(() => operationalRosterKnown());
      assert.equal(known, true, 'the empty club is KNOWN empty (its legitimate empty state), not loading forever');
      assert.deepEqual(h.errors, []);
      await h.ctx.close();
    } finally { await b.close(); }
  });

  test(`CLIENT (${view}): repeated switching Alpha → Bravo → Alpha → Bravo never pushes a wrong or partial roster to either club`, { timeout: 90000 }, async (t) => {
    const b = await harness(t, view);
    try {
      const h = await b.open(seed('team_a'));
      assert.ok(await settled(h.page, 'team_a', 8));
      const p0 = b.ctl.posts.length;
      for (const club of ['team_b', 'team_a', 'team_b']) {
        await h.page.evaluate(() => { _availRosterLinkedAt = 0; });
        await switchTo(h.page, club);
        await waitFor(() => h.page.evaluate(id => _clubContextId === id, club));
        await h.page.evaluate(() => ensureCoachRosterIdentityLinked());
      }
      assert.ok(await settled(h.page, 'team_b', 7), 'ends on Bravo, read');
      await sleep(3000);
      const posts = b.ctl.posts.slice(p0);
      assert.deepEqual(minimalRows(posts, 'team_a'), [], 'no minimal row to Alpha');
      assert.deepEqual(minimalRows(posts, 'team_b'), [], 'no minimal row to Bravo');
      for (const p of posts) {
        const names = p.players.map(r => r.name).join(' ');
        if (p.club === 'team_a') assert.ok(!/Bravo/.test(names), 'no Bravo player pushed to Alpha');
        if (p.club === 'team_b') assert.ok(!/Alpha/.test(names), 'no Alpha player pushed to Bravo');
      }
      const s = await look(h.page);
      assert.deepEqual([s.players, s.withDob, s.tbc, s.alpha], [7, 7, 0, 0]);
      await h.ctx.close();
    } finally { await b.close(); }
  });

  test(`CLIENT (${view}): a player in the identity data but missing from the read roster is added AFTER the read — next to the complete stored rows, never instead of them`, { timeout: 90000 }, async (t) => {
    const newcomer = { id: 'u_new', userId: 'u_new', name: 'Bravo Newcomer', playerGroupId: 'grp_b' };
    const b = await harness(t, view, { identityExtra: { team_b: [newcomer] } });
    try {
      const h = await b.open(seed('team_a'));
      assert.ok(await settled(h.page, 'team_a', 8));
      await h.page.evaluate(() => { _availRosterLinkedAt = 0; });
      const p0 = b.ctl.posts.length;
      await switchTo(h.page, 'team_b');
      assert.ok(await settled(h.page, 'team_b', 7), 'Bravo read');
      await h.page.evaluate(() => { _availRosterLinkedAt = 0; return ensureCoachRosterIdentityLinked(); });
      assert.ok(await waitFor(() => h.page.evaluate(() => state.players.some(p => p.userId === 'u_new'))), 'the newcomer is linked in after the read');
      await sleep(3000);
      const pushed = b.ctl.posts.slice(p0).filter(p => p.club === 'team_b').pop();
      assert.ok(pushed, 'the addition is pushed');
      const stored = pushed.players.filter(r => r.userId !== 'u_new');
      assert.equal(stored.length, 7, 'every stored row travels with it (six players and the trialist)');
      assert.ok(stored.filter(r => r.userId).every(r => r.dateOfBirth && r.notes && r.position === 'Prop'), 'complete, as read');
      assert.ok(pushed.players.some(r => r.userId === 'u_new'), 'plus the newcomer');
      await h.ctx.close();
    } finally { await b.close(); }
  });

  test(`CLIENT (${view}): a FRESH device (no local state, a live coach session) reads the roster once the session confirms the coach — and builds nothing from identity data first`, { timeout: 90000 }, async (t) => {
    const b = await harness(t, view, { start: 'team_b' });
    try {
      const h = await b.open(null);
      assert.ok(await waitFor(() => h.page.evaluate(() => _serverAuthState === 'authed' && isCoach())), 'coach session confirmed');
      assert.ok(await waitFor(() => h.page.evaluate(() => rosterIsRead() && state.players.length === 7), 20000), 'the roster was read: ' + JSON.stringify(await look(h.page)));
      await h.page.evaluate(() => { _availRosterLinkedAt = 0; return ensureCoachRosterIdentityLinked(); });
      await sleep(3000);
      assert.deepEqual(minimalRows(b.ctl.posts, 'team_b'), [], 'no minimal row pushed');
      const s = await look(h.page);
      assert.deepEqual([s.players, s.withDob, s.tbc], [7, 7, 0]);
      await h.ctx.close();
    } finally { await b.close(); }
  });
}

test('SOURCE: the order is enforced at every door — link, sync, push, flush and the reply', () => {
  const body = name => { const i = src.indexOf(`function ${name}(`); return src.slice(i, i + 2500); };
  assert.match(body('syncIdentityStateToLocalRoster'), /rosterIsRead\(\)\) return false;/);
  assert.match(body('ensureCoachRosterIdentityLinked'), /!isCoach\(\) \|\| \(typeof rosterIsRead === 'function' && !rosterIsRead\(\)\)\) return;/);
  assert.match(body('queueRosterSync'), /!rosterIsRead\(\)\) \{ _rosterSyncDeferred = true; return; \}/);
  assert.match(body('flushRosterSync'), /!rosterIsRead\(\)\) \{ _rosterSyncDeferred = true; return; \}/);
  assert.match(body('loadRosterFromServer'), /if \(!_current\(\)\) return;[\s\S]{0,300}_rosterReadEpoch = epoch;/);
  assert.match(body('resetTeamScopedState'), /_rosterEpoch\+\+/);
});
