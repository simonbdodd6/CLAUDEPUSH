/**
 * SETTINGS — the club data export, end to end in a real browser.
 *
 * The real app against a loopback stub that plays the server: an owner opens
 * Settings, sees the Club data export card, presses Download, and the browser
 * receives ONE file — the stub's export, under the stub's filename — through
 * one request to /api/publish?resource=club-data-export and nothing to the
 * reads the old browser-side assembly used. Medical staff see no card.
 * Desktop and phone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { permissionsFor } from '../api/_permissions.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const BOOT_MS = 60000;
const TEAM = 'team_stub', GRP = 'grp_initial';

const EXPORT = { schema: 'coacheasier.club-data-export.v1', exportedAt: '2026-10-27T09:00:00.000Z', exportedBy: 'u1', clubId: TEAM,
  club: { clubName: 'Stub RFC' }, counts: { members: 1 }, medical: { included: false, reason: 'Medical records are not part of the club data export.' } };
const FILENAME = 'coacheasier-club-data-team-stub-2026-10-27.json';

function stub(member) {
  const permissions = [...permissionsFor({ status: 'active', ...member })];
  const SESSION = { ok: true, user: { id: 'u1', name: 'Olive Owner', email: 'o@x.test', role: member.role, platformRole: '', preferences: {} },
    teamMember: { id: 'tm1', teamId: TEAM, userId: 'u1', status: 'active', ...member },
    permissions,
    memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: member.role, current: true }],
    operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: GRP, name: 'Seniors' }], defaultGroupId: GRP, mustChoose: false } } };
  const api = [];
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    if (u.startsWith('/api/')) api.push(`${req.method} ${u}`);
    const send = (o, s = 200) => { res.statusCode = s; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/publish?resource=club-data-export')) {
      if (req.method !== 'GET') return send({ ok: false }, 405);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${FILENAME}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end(JSON.stringify(EXPORT));
    }
    if (u.startsWith('/api/identity')) return send(SESSION);
    if (u.startsWith('/api/config')) return send({ version: 'local', devLogin: false });
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: GRP, canEdit: true });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { clubName: 'Stub RFC', fixtures: [] } });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u.split('?')[0] === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try {
      res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
      res.end(fs.readFileSync(f));
    } catch { res.statusCode = 404; res.end(); }
  });
  return { srv, api };
}

async function openSettings(t, view, member) {
  if (!chromium) { t.skip('playwright not installed'); return null; }
  let browser;
  try { browser = await chromium.launch(); } catch { t.skip('no browser available'); return null; }
  const { srv, api } = stub(member);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }),
    serviceWorkers: 'block', acceptDownloads: true });
  await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), {
    activeView: 'coach', activeCoachSection: 'settings', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
    users: [{ id: 'u1', name: 'Olive Owner', email: 'o@x.test', role: member.role }], operationalGroupId: GRP,
    players: [], fixtures: [], messages: [], onboardingDismissed: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded', timeout: BOOT_MS });
  await page.waitForFunction(() => Array.isArray(_myPermissions) && _myMembership !== null && !!document.querySelector('#coach-settings .set-group'),
    null, { timeout: BOOT_MS });
  await page.waitForTimeout(300);
  return { page, errors, api, close: async () => { await browser.close(); srv.close(); } };
}
const CARD_SEL = '#coach-settings button[onclick="settingsExportClub(this)"]';

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): the owner sees the Club data export card and the Download button saves the server's file, under its filename, through one request`, { timeout: 120000 }, async t => {
    const h = await openSettings(t, view, { role: 'admin', isOwner: true, accessProfile: 'full' }); if (!h) return;
    try {
      const card = await h.page.evaluate(() => {
        const h2 = [...document.querySelectorAll('#coach-settings .card h2')].find(x => x.textContent.trim() === 'Club data export');
        const group = h2 && h2.closest('.set-group')?.querySelector('.set-group-title')?.textContent.trim();
        return { present: !!h2, group, visible: !!h2 && h2.offsetParent !== null,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
      });
      assert.deepEqual(card, { present: true, group: 'General', visible: true, overflow: false });
      const before = h.api.length;
      const [download] = await Promise.all([
        h.page.waitForEvent('download', { timeout: 30000 }),
        h.page.click(CARD_SEL),
      ]);
      assert.equal(download.suggestedFilename(), FILENAME, 'the server\'s filename');
      const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
      assert.deepEqual(saved, EXPORT, 'the server\'s file, byte for byte');
      await h.page.waitForFunction(() => /Club data downloaded/.test(document.body.innerText), null, { timeout: 10000 });
      const since = h.api.slice(before);
      assert.deepEqual(since.filter(x => x.includes('club-data-export')), ['GET /api/publish?resource=club-data-export'], 'exactly one export request');
      assert.equal(since.some(x => /\/api\/(invite|roster)|type=all/.test(x)), false, 'none of the old assembly\'s reads');
      const btn = await h.page.evaluate(sel => { const b = document.querySelector(sel); return { disabled: b.disabled, text: b.textContent }; }, CARD_SEL);
      assert.deepEqual(btn, { disabled: false, text: 'Download club data (JSON)' }, 'the button is restored');
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });

  test(`browser (${view}): medical staff see no Club data export card and no Download button`, { timeout: 120000 }, async t => {
    const h = await openSettings(t, view, { role: 'medical' }); if (!h) return;
    try {
      const seen = await h.page.evaluate(sel => ({
        button: !!document.querySelector(sel),
        card: [...document.querySelectorAll('#coach-settings .card h2')].some(x => x.textContent.trim() === 'Club data export'),
        settings: !!document.querySelector('#coach-settings .set-group'),
      }), CARD_SEL);
      assert.deepEqual(seen, { button: false, card: false, settings: true });
      assert.equal(h.api.some(x => x.includes('club-data-export')), false, 'nothing was requested');
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });
}
