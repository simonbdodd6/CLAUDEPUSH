/**
 * THE DEVICE NEVER MAKES ONE PLAYER TWO (2026-10-07, duplicate-player
 * investigation — client half).
 *
 * The real app in a browser against a stub server. The roster read is
 * delayed, failed and repeated; the identity link (which may add a player the
 * read did not carry) runs again and again around it. After every step the
 * Match Centre pool (mcComputeAvailable — Available Players' candidates) must
 * hold each account exactly once, and never the club's staff — including a
 * manager whose membership carries a player group but who has no player
 * profile (the production artefact the server now withholds). Synthetic data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* asserted below — never a silent skip */ }

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLUB = 'team_dup', GRP = 'grp_dup';
const COACH = { id: 'u_coach', name: 'Casey Coach', email: 'coach@dup.test', role: 'coach' };
const PLAYERS = Array.from({ length: 6 }, (_, i) => ({ id: `user_p${i}`, userId: `user_p${i}`, name: `Dup Player ${i}`, position: 'Prop', dateOfBirth: `2001-01-0${i + 1}` }));
const NEWCOMER = { userId: 'user_new', name: 'Nia Newcomer' };            // in identity, not yet in the read roster
const MANAGER = { userId: 'user_mgr', name: 'Max Manager' };              // staff, group stamped, no profile

function stub() {
  const ctl = { failRoster: false, gate: null, posts: [], gets: 0 };
  const identity = () => ({ ok: true,
    users: [{ id: COACH.id, displayName: COACH.name, email: COACH.email, role: 'coach' },
      ...PLAYERS.map(p => ({ id: p.userId, displayName: p.name, email: `${p.userId}@dup.test`, role: 'player' })),
      { id: NEWCOMER.userId, displayName: NEWCOMER.name, email: 'nia@dup.test', role: 'player' },
      { id: MANAGER.userId, displayName: MANAGER.name, email: 'max@dup.test', role: 'coach' }],
    team_members: [{ teamId: CLUB, userId: COACH.id, role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
      ...PLAYERS.map(p => ({ teamId: CLUB, userId: p.userId, role: 'player', status: 'active', playerGroupId: GRP })),
      { teamId: CLUB, userId: NEWCOMER.userId, role: 'player', status: 'active', playerGroupId: GRP },
      { teamId: CLUB, userId: MANAGER.userId, role: 'coach', staffLevel: 'manager', status: 'active', playerGroupId: GRP }],
    player_profiles: [...PLAYERS, NEWCOMER].map(p => ({ id: 'pp_' + p.userId, userId: p.userId, teamId: CLUB, displayName: p.name, position: 'Wing', playerGroupId: GRP })) });
  const session = { ok: true, user: { ...COACH, platformRole: '' },
    teamMember: { teamId: CLUB, userId: COACH.id, role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
    permissions: ['reports', 'messaging', 'manage_players', 'manage_teams', 'manage_coaches', 'training', 'matchday', 'publish_training'],
    memberships: [{ teamId: CLUB, teamName: 'Dup RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
    operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false } } };
  const srv = http.createServer(async (req, res) => {
    const u = req.url || '/';
    let body = ''; if (req.method !== 'GET') { for await (const ch of req) body += ch; }
    const send = (o, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/')) {
      if (u === '/api/identity' && req.method === 'GET') return send(identity());
      if (u.startsWith('/api/identity') && req.method === 'POST') return send({ ok: true });
      if (u.startsWith('/api/identity')) return send(session);
      if (u.startsWith('/api/roster') && req.method === 'POST') { try { ctl.posts.push(JSON.parse(body).players || []); } catch {} return send({ ok: true }); }
      if (u.startsWith('/api/roster')) {
        ctl.gets++;
        if (ctl.failRoster) return send({ ok: false }, 500);
        const answer = JSON.stringify({ ok: true, players: structuredClone(PLAYERS) });   // the server withholds the manager
        if (ctl.gate) { res.writeHead(200, { 'content-type': 'application/json' }); res.flushHeaders(); await ctl.gate.promise; return res.end(answer); }
        res.setHeader('content-type', 'application/json'); return res.end(answer);
      }
      if (u.startsWith('/api/availability')) return send({ resolved: {}, roster: PLAYERS });
      if (u.startsWith('/api/invite')) return send({ ok: true, invites: [] });
      if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: [] });
      if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: GRP, name: 'Seniors', status: 'active' }], teams: [] });
      if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: GRP, canEdit: true });
      if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: CLUB, name: 'Dup RFC', fixtures: [] } });
      if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [], messages: [] });
      return send({ ok: true });
    }
    const f = u.split('?')[0] === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
  });
  ctl.hold = () => { let r; ctl.gate = { promise: new Promise(x => { r = x; }), open: () => r() }; };
  ctl.release = () => { ctl.gate?.open(); ctl.gate = null; };
  return { srv, ctl };
}
const seed = () => ({ activeView: 'coach', activeCoachSection: 'message', stateTeamId: CLUB, clubName: 'Dup RFC', currentUserId: COACH.id,
  users: [{ ...COACH }], operationalGroupId: GRP, players: structuredClone(PLAYERS), fixtures: [], messages: [], onboardingDismissed: true, availabilityRequests: [] });
const waitFor = async (f, ms = 20000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await f(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, 50)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pool = page => page.evaluate(() => mcComputeAvailable().map(p => ({ id: String(p.id), userId: String(p.userId || ''), name: p.name })));
function assertPool(rows, label, { newcomer }) {
  const ids = rows.map(r => r.userId || r.id);
  assert.equal(new Set(ids).size, ids.length, `${label}: every account once — ${JSON.stringify(rows)}`);
  const names = rows.map(r => r.name);
  assert.equal(new Set(names).size, names.length, `${label}: no name twice`);
  assert.equal(ids.includes(MANAGER.userId) || names.includes(MANAGER.name), false, `${label}: the manager is not a player`);
  assert.equal(ids.includes(COACH.id), false, `${label}: the coach is not a player`);
  assert.equal(rows.length, PLAYERS.length + (newcomer ? 1 : 0), `${label}: ${rows.length} players`);
}

test('CLIENT: delayed, failed and repeated roster reads with the identity link racing them — each player once, staff never', { timeout: 120000 }, async () => {
  assert.ok(chromium, 'playwright must be installed: this data-integrity test may not skip');
  const browser = await chromium.launch();
  const { srv, ctl } = stub();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), seed());
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // 1 — the first read is DELAYED while the identity link is due
    ctl.hold();
    await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
    assert.ok(await waitFor(() => page.evaluate(() => _adminData.loaded === true)), 'memberships loaded');
    await page.evaluate(() => { _availRosterLinkedAt = 0; return ensureCoachRosterIdentityLinked(); });
    ctl.release();
    assert.ok(await waitFor(() => page.evaluate(() => rosterIsRead())), 'the delayed read landed');
    await page.evaluate(() => { _availRosterLinkedAt = 0; return ensureCoachRosterIdentityLinked(); });
    assert.ok(await waitFor(async () => (await pool(page)).length === PLAYERS.length + 1), 'the newcomer was linked after the read');
    assertPool(await pool(page), 'after delayed read + link', { newcomer: true });

    // 2 — a FAILED read, links around it, then recovery
    ctl.failRoster = true;
    await page.evaluate(() => loadRosterFromServer());
    for (let i = 0; i < 2; i++) await page.evaluate(() => { _availRosterLinkedAt = 0; return ensureCoachRosterIdentityLinked(); });
    assertPool(await pool(page), 'after a failed read', { newcomer: true });
    ctl.failRoster = false;
    await page.evaluate(() => loadRosterFromServer());
    await page.evaluate(() => { _availRosterLinkedAt = 0; return ensureCoachRosterIdentityLinked(); });
    assertPool(await pool(page), 'after recovery', { newcomer: true });

    // 3 — repeated refreshes and links, a late reply overtaken by a newer one
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => loadRosterFromServer());
      await page.evaluate(() => { _availRosterLinkedAt = 0; return ensureCoachRosterIdentityLinked(); });
      await page.evaluate(() => refreshLiveAvailability({ manual: true }).catch(() => {}));
    }
    ctl.hold();
    const late = page.evaluate(() => loadRosterFromServer());
    await sleep(200); ctl.release(); await late;
    await page.evaluate(() => { _availRosterLinkedAt = 0; return ensureCoachRosterIdentityLinked(); });
    assertPool(await pool(page), 'after repeated refreshes', { newcomer: true });
    // what the device pushes never names one account twice either
    await sleep(2600);
    for (const players of ctl.posts) {
      const uids = players.map(p => p.userId).filter(Boolean);
      assert.equal(new Set(uids).size, uids.length, 'a roster push never carries an account twice');
      assert.equal(uids.includes(MANAGER.userId), false, 'nor the manager');
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { ctl.release(); await browser.close(); srv.close(); }
});

test('CLIENT: joining under a name the club already has asks first — "Sign in instead" sends nothing more; "I\'m a different person" resends once, confirmed', { timeout: 90000 }, async () => {
  assert.ok(chromium, 'playwright must be installed: this data-integrity test may not skip');
  const browser = await chromium.launch();
  const claims = [];
  const srv = http.createServer(async (req, res) => {
    const u = req.url || '/';
    let body = ''; if (req.method !== 'GET') { for await (const ch of req) body += ch; }
    const send = (o, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/invite?token=')) return send({ valid: true, group: true, role: 'player', status: 'pending', teamName: 'Dup RFC', playerGroupId: GRP });
    if (u === '/api/identity' && req.method === 'POST') {
      const b = JSON.parse(body || '{}');
      if (b.action === 'claim_invite') {
        claims.push(b);
        if (!b.confirmDifferentPerson) return send({ ok: false, error: 'Gaëtan Example is already registered in this club. If that\'s you, sign in…', code: 'possible_duplicate_player' }, 409);
        return send({ ok: false, error: 'stub stop' }, 400);
      }
      return send({ ok: true });
    }
    if (u.startsWith('/api/identity')) return send({ ok: false }, 401);
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u.split('?')[0] === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.address().port}/?inv=tok_dup`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#invite-first-input', { timeout: 30000 });
    await page.fill('#invite-first-input', 'Gaëtan');
    await page.fill('#invite-last-input', 'Example');
    await page.fill('#invite-email-input', 'second@dup.test');
    await page.fill('#invite-password-input', 'password-dup1');
    await page.selectOption('#invite-position-input', { index: 1 });
    const form = () => page.evaluate(() => ({ first: document.getElementById('invite-first-input')?.value, last: document.getElementById('invite-last-input')?.value,
      email: document.getElementById('invite-email-input')?.value, position: document.getElementById('invite-position-input')?.value,
      btn: document.getElementById('invite-accept-btn')?.textContent, toast: document.querySelector('.toast, #toast')?.textContent || '' }));
    await page.click('#invite-accept-btn');
    assert.ok(await waitFor(() => claims.length === 1, 30000), `the claim left: ${JSON.stringify(await form())}`);
    await page.waitForSelector('#ce-modal-overlay', { timeout: 30000 });
    assert.match(await page.textContent('#ce-modal-title'), /Already registered/);
    assert.match(await page.textContent('#ce-modal-cancel'), /Sign in instead/);
    await page.click('#ce-modal-cancel');
    await sleep(500);
    assert.equal(claims.length, 1, 'declining sends nothing more');
    assert.ok(await page.$('#invite-modal'), 'the join form stays open for the person to sign in instead');
    await page.click('#invite-accept-btn');
    await page.waitForSelector('#ce-modal-overlay', { timeout: 30000 });
    await page.click('#ce-modal-ok');
    assert.ok(await waitFor(() => claims.length === 3, 30000), `claims: ${claims.length}`);
    assert.equal(claims[1].confirmDifferentPerson, undefined, 'the second plain attempt is not confirmed');
    assert.equal(claims[2].confirmDifferentPerson, true, 'only the explicit choice confirms');
    assert.equal(claims.filter(c => c.confirmDifferentPerson).length, 1, 'exactly once');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
