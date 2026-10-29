/**
 * WHERE A CLAIM LANDS — in a real browser (Nick onboarding loop 1).
 *
 * The real app on a fresh device opens an invite link against a loopback
 * stub that plays the server. A player who completes the form must land in
 * the PLAYER view with the player setup and request their own published
 * state; a coach who completes a staff link must land in the coach view and
 * request the roster and the coach draft. The branch's own fields
 * (activePlayerSection, selectedChatId, selectedPlayerId) are asserted, not
 * just activeView — showSection() repairs the view, never those.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const BOOT_MS = 60000;
const CLUB = 'club_landing', GRP = 'grp_initial';

/** A stub server for one claimer of `role`; `api` records every API request in order. */
function stub(role) {
  const api = [];
  const ctl = { claimed: false };
  const isStaff = role !== 'player';
  const user = { id: 'u_new', role, displayName: 'Nia Newcomer', email: 'nia@landing.test', platformRole: '', preferences: {} };
  const teamMember = { id: 'tm_new', teamId: CLUB, userId: 'u_new', role, status: 'active',
    ...(isStaff ? { staffLevel: 'head' } : { playerGroupId: GRP }) };
  const session = () => ({ ok: true, user, teamMember,
    playerProfile: isStaff ? null : { id: 'pp_new', userId: 'u_new', teamId: CLUB, displayName: 'Nia Newcomer', position: '9 — Scrum half' },
    permissions: isStaff ? ['manage_players', 'manage_teams', 'manage_coaches', 'publish_training', 'publish_squads', 'messaging', 'reports', 'manage_fixtures'] : [],
    memberships: [{ teamId: CLUB, teamName: 'Landing RFC', role, current: true }],
    operational: { player: isStaff ? { groups: [], defaultGroupId: null, mustChoose: false } : { groups: [{ id: GRP, name: 'Landing RFC' }], defaultGroupId: GRP, mustChoose: false },
                   staff: isStaff ? { groups: [{ id: GRP, name: 'Landing RFC' }], defaultGroupId: GRP, mustChoose: false } : { groups: [], defaultGroupId: null, mustChoose: false } } });
  const srv = http.createServer(async (req, res) => {
    const u = req.url || '/';
    let body = ''; if (req.method !== 'GET') { for await (const ch of req) body += ch; }
    const send = (o, s = 200) => { res.statusCode = s; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/')) {
      api.push(`${req.method} ${u}`);
      if (u.startsWith('/api/invite?token=')) return send({ valid: true, group: true, role, status: 'pending', teamName: 'Landing RFC' });
      if (u === '/api/identity' && req.method === 'POST') {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
        if (b.action === 'claim_invite') { ctl.claimed = true; return send({ ...session(), invite: { status: 'pending' } }, 201); }
        if (b.action === 'session') return ctl.claimed ? send(session()) : send({ ok: false, error: 'No active session' }, 401);
        return send({ ok: true });
      }
      if (u.startsWith('/api/identity?action=session')) return ctl.claimed ? send(session()) : send({ ok: false, error: 'No active session' }, 401);
      if (u.startsWith('/api/identity')) return ctl.claimed && isStaff ? send({ ok: true, users: [user], team_members: [teamMember], player_profiles: [] }) : send({ ok: false }, 401);
      if (u.startsWith('/api/config')) return send({ version: 'local', devLogin: false });
      if (u.startsWith('/api/roster')) return send({ ok: true, players: [] });
      if (u.startsWith('/api/publish?type=draft')) return send({ ok: true, draft: null });
      if (u.startsWith('/api/publish?type=all')) return send({ ok: true, sessions: [], squad: null, fixtures: [] });
      if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: GRP, canEdit: isStaff });
      if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: GRP, name: 'Landing RFC', status: 'active' }], teams: [] });
      if (u.startsWith('/api/publish')) return send({ ok: true, club: { clubName: 'Landing RFC', fixtures: [] } });
      if (u.startsWith('/api/availability')) return send({ ok: true, resolved: {}, roster: [], slots: [] });
      if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [], messages: [] });
      return send({ ok: true });
    }
    const f = u.split('?')[0] === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try {
      res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
      res.end(fs.readFileSync(f));
    } catch { res.statusCode = 404; res.end(); }
  });
  return { srv, api, ctl };
}

const waitFor = async (f, ms = 30000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await f(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, 50)); } };
const landing = page => page.evaluate(() => ({ view: state.activeView, playerSection: state.activePlayerSection, chat: state.selectedChatId,
  selectedPlayerId: state.selectedPlayerId, coachSection: state.activeCoachSection, user: state.currentUserId }));

async function claimInBrowser(t, role) {
  if (!chromium) { t.skip('playwright not installed'); return null; }
  let browser;
  try { browser = await chromium.launch(); } catch { t.skip('no browser available'); return null; }
  const { srv, api, ctl } = stub(role);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/?inv=tok_landing`, { waitUntil: 'domcontentloaded', timeout: BOOT_MS });
  await page.waitForSelector('#invite-first-input', { timeout: BOOT_MS });
  await page.fill('#invite-first-input', 'Nia');
  await page.fill('#invite-last-input', 'Newcomer');
  await page.fill('#invite-email-input', 'nia@landing.test');
  await page.fill('#invite-password-input', 'password-landing1');
  if (role === 'player') await page.selectOption('#invite-position-input', { index: 1 });
  else assert.equal(await page.$('#invite-position-input'), null, 'a staff link asks no position');
  const before = api.length;
  await page.click('#invite-accept-btn');
  assert.ok(await waitFor(() => ctl.claimed), 'the claim reached the server');
  await page.waitForSelector('#invite-modal', { state: 'detached', timeout: 30000 });
  return { page, api, errors, before, close: async () => { await browser.close(); srv.close(); } };
}

test('browser: a player who claims a squad link lands in the player view, with the player setup, and reads their published state', { timeout: 120000 }, async t => {
  const h = await claimInBrowser(t, 'player'); if (!h) return;
  try {
    const got = await landing(h.page);
    assert.equal(got.view, 'player');
    assert.equal(got.playerSection, 'messages', 'the player branch ran (showSection never sets this)');
    // selectedChatId is set to the coach thread by the branch and then owned by
    // the Messages render, so it is pinned in the sandbox test, not here.
    assert.equal(got.selectedPlayerId, 'u_new');
    assert.equal(got.user, 'u_new');
    assert.ok(await waitFor(() => h.api.slice(h.before).some(x => x === 'GET /api/publish?type=all')), `the player's own loader ran: ${JSON.stringify(h.api.slice(h.before))}`);
    assert.equal(h.api.slice(h.before).some(x => x.startsWith('GET /api/publish?type=draft')), false, 'no coach draft read for a player');
    assert.equal(await h.page.$('#invite-modal'), null, 'the form is gone');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('browser: a coach who claims a staff link lands in the coach view and reads the roster and the coach draft', { timeout: 120000 }, async t => {
  const h = await claimInBrowser(t, 'coach'); if (!h) return;
  try {
    const got = await landing(h.page);
    assert.equal(got.view, 'coach');
    assert.equal(got.coachSection, 'overview');
    assert.equal(got.chat, 'squad');
    assert.notEqual(got.playerSection, 'messages', 'the player branch did not run for staff (a fresh device defaults to home)');
    assert.ok(await waitFor(() => h.api.slice(h.before).some(x => x.startsWith('GET /api/roster'))), `roster read: ${JSON.stringify(h.api.slice(h.before))}`);
    assert.ok(await waitFor(() => h.api.slice(h.before).some(x => x.startsWith('GET /api/publish?type=draft'))), 'coach draft read');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});
