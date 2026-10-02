/**
 * COACH AVAILABILITY BOARD — PAINTED ONCE PER CHANGE, NOT ONCE PER RENDER (Build 112)
 *
 * render() runs whenever any loader lands: six passes inside the first 250ms
 * of a cold load, plus the settle of the shared board read (Build 111). Every
 * pass rebuilt the Availability hub (#coach-message) from scratch. Measured
 * at 2927b440, desktop and Pixel 5: a direct cold load rewrote the hub eight
 * times (116–129KB of markup), three of them byte-identical to what the
 * section already held; a load that landed on the Overview rewrote the HIDDEN
 * hub ten times (five identical) before the coach opened it, then twice more
 * on entry — both identical, the boot read having landed the same map.
 *
 * An identical rewrite re-parses the markup, re-creates the <details open>
 * (whose toggle re-runs loadLiveSchedulesOnToggle) and discards whatever
 * transient state the DOM held: focus, scroll, a value being typed.
 *
 * The rule, the one the login panel / group switcher / nav hosts already use:
 * the renderer keeps the SOURCE it last applied on the host and skips the
 * paint when the new markup is identical — but only while the host still
 * holds the hub it painted. An emptied section (sign-out clears every one)
 * or safeRender's error card repaints, whatever the marker says.
 *
 * SANDBOX tests run the REAL renderer over one persistent host. BROWSER
 * tests run the real client in Chromium on desktop and Pixel 5: a cold load
 * makes no identical hub rewrite, nothing-changed renders paint nothing, a
 * change paints once, and the loading / failure / Live Sync / polling
 * behaviours of Builds 97, 110 and 111 are unchanged.
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
const APP = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
  return { availWeekStart, availAddDays, availToday, availabilityEventsForWeek };
`)();
const TODAY = APP.availToday(), WEEK = APP.availWeekStart(TODAY);
const inWeek = (d, today) => { const w = APP.availWeekStart(today); return APP.availabilityEventsForWeek(w, { fixtures: [{ id: 'p', opposition: 'P', date: d, status: 'scheduled' }], slots: [], currentWeekStart: w }).some(e => e.id === 'p'); };
const MATCH_DAY = (() => { let day = TODAY; for (let i = 0; i < 14; i++) { const n = APP.availAddDays(day, 1); if (!inWeek(n, TODAY)) break; day = n; } return day; })();
const SAT = 'fx_sat';

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX — the real renderer painting into ONE persistent host
// ═══════════════════════════════════════════════════════════════════════════
const P = (i, extra = {}) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', ...extra });
const RESOLVED = () => { const r = {}; for (let i = 0; i < 5; i++) r['u_p' + i] = { [SAT]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; r.u_p5 = { [SAT]: { response: 'maybe' } }; r.u_p6 = { [SAT]: { response: 'unavailable', reason: 'work' } }; return r; };
/**
 * One coach device looking at the board. The host behaves like a DOM element
 * for what the renderer reads: innerHTML (every set is counted) and
 * firstElementChild (the class of the first element of what was last set).
 */
function board({ players = Array.from({ length: 18 }, (_, i) => P(i)), resolved = null, sync = false } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const host = {
      writes: 0, held: '', firstElementChild: null,
      set innerHTML(v) {
        this.writes++; this.held = String(v);
        const m = this.held.match(/<([a-z]+)[^>]*class="([^"]*)"/i);
        this.firstElementChild = this.held.trim() ? { classList: { contains: c => !!m && m[2].split(/\\s+/).includes(c) } } : null;
      },
      get innerHTML() { return this.held; },
    };
    const other = { set innerHTML(v) {}, get innerHTML() { return ''; } };
    const document = { getElementById: id => id === 'coach-message' ? host : other, querySelector: () => null, querySelectorAll: () => [] };
    let _clubContextId = 'team_home';
    let state = { operationalGroupId: 'grp_sen', players: CFG.players, fixtures: [{ id: '${SAT}', groupId: 'grp_sen', opposition: 'Kituro', date: '${MATCH_DAY}', kickoffTime: '14:00', status: 'scheduled' }],
                  schedule: [], messages: [], availabilityRequests: [], matchCentre: {}, trainingBlocks: {}, activeView: 'coach', activeCoachSection: 'message',
                  selectedMessagePlayerId: null, autoSendSchedule: null, messageDetail: '${SAT}', availWeekOffset: 0 };
    let _resolvedAvailability = CFG.resolved || {}, _resolvedAvailabilityGroup = 'grp_sen';
    let _availLastSync = CFG.sync ? new Date().toISOString() : null;
    let _availReadFailed = false;
    let _trainingSchedule = { slots: [] }, _trainingScheduleGroupId = 'grp_sen', _trainingScheduleAttempted = false;
    let _availTodayOverride = '';
    let availabilityBoardFilter = 'all', availabilityBoardSort = 'status';
    const BETA_SIMPLE_UI = true;
    const EMPTY_PLAYER = { id: '', name: '', position: '' };
    const REASON_LABELS = { injury: 'Injury', work: 'Work', holiday: 'Holiday', family: 'Family', other: 'Other' };
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function operationalPlayers() { return state.players; }
    function operationalGroups() { return [{ id: 'grp_sen', name: 'Seniors' }]; }
    function trainingGroupParam() { return 'grp_sen'; }
    function ensureTrainingSchedule() {}
    function playerIsArchived() { return false; }
    function contextFixtures() { return state.fixtures; } function normalizeFixture(f) { return f; }
    function fixturesKnown() { return true; }
    function availabilityPendingFor() { return null; }
    function coachAvailWeek() { return availWeekStart(availToday()); }
    function sortAvailabilityRows(rows) { return rows; }
    function percent(a, b) { return b ? Math.round(a / b * 100) : 0; }
    function fmtRespondedAt() { return ''; } function playerAttendancePct() { return null; } function attendanceLabel() { return '—'; } function attendanceUnknownReason() { return ''; }
    function sessionTypeIcon() { return ''; } function canI() { return true; }
    function operationalGroupSwitcherHTML() { return ''; } function ceProductMarkHtml() { return ''; } function availWeekLabel() { return 'This week'; }
    function buildPlayerDetailHtml(p, status) { return '<div class="detail">' + esc(p.name) + ': ' + esc(status) + '</div>'; }
    function renderManageSessions() { return ''; }
    ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
    ${fn('availDatedWeekLabel')} ${fn('availabilitySessionLabel')} ${fn('statusLabel')}
    ${fn('sessionKey')} ${fn('sessionReasonKey')} ${fn('normalizeSessionId')} ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')} ${fn('availabilityLastReadFailed')} ${fn('availabilityReadUnknown')} ${fn('resolvedAnswerFor')} ${fn('sessionRows')}
    ${fn('availabilityNonResponders')} ${fn('availabilityWeekSessions')} ${fn('availabilityRequestMatches')} ${fn('availabilityRequestedSessions')} ${fn('availabilityChaseContext')}
    ${fn('coachAvailEvents')} ${fn('coachSelectedEvent')} ${fn('availabilityRowMatchesFilter')}
    ${fn('renderMessageCenterV2')}
    return {
      paint: () => { renderMessageCenterV2(); return host.held; },
      writes: () => host.writes,
      held: () => host.held,
      holds: () => host.firstElementChild ? (host.held.match(/<[a-z]+[^>]*class="([^"]*)"/i) || [])[1] : null,
      land: (resolved) => { _resolvedAvailability = resolved || {}; _availLastSync = new Date().toISOString(); _availReadFailed = false; },
      fail: () => { _availReadFailed = true; },
      filter: f => { availabilityBoardFilter = f; },
      clear: () => { host.innerHTML = ''; },                       // what clearAuthenticatedSections does to every section
      foreign: () => { host.innerHTML = '<div class="card" style="text-align:center"><p>This section failed to load</p></div>'; },   // safeRender's error card
    };
  `;
  return new Function(body)({ players, resolved, sync });
}
const kpi = html => [...html.matchAll(/<article class="msg-kpi ([a-z-]+)"><span>([^<]*)<\/span><strong>(\d+)<\/strong>/g)].map(m => `${m[2]} ${m[3]}`);
const rows = html => (html.match(/class="msg-player-row/g) || []).length;

test('IDENTICAL — a second render with nothing changed paints nothing: one write, and the host keeps the hub it holds', () => {
  const b = board({ resolved: RESOLVED(), sync: true });
  const first = b.paint();
  assert.equal(b.writes(), 1, 'the first render paints');
  assert.equal(b.holds(), 'msg-hub', 'the host holds the hub');
  for (let i = 0; i < 5; i++) b.paint();
  assert.equal(b.writes(), 1, 'five more renders with nothing changed paint nothing');
  assert.equal(b.held(), first, 'the host still holds exactly the first paint');
  assert.deepEqual(kpi(first), ['Available 5', 'Maybe 1', 'Unavailable 1', 'No reply 11'], 'and it is the real board');
});

test('CHANGE — a landed read repaints once; the next identical render does not; a filter change repaints again', () => {
  const b = board({ resolved: null, sync: false });
  assert.match(b.paint(), /Loading availability…/, 'loading first (Build 110)');
  assert.equal(b.writes(), 1);
  b.paint(); b.paint();
  assert.equal(b.writes(), 1, 'still loading: no repaint');
  b.land(RESOLVED());
  const ready = b.paint();
  assert.equal(b.writes(), 2, 'the landed read repaints');
  assert.deepEqual(kpi(ready), ['Available 5', 'Maybe 1', 'Unavailable 1', 'No reply 11']);
  assert.equal(rows(ready), 18);
  b.paint();
  assert.equal(b.writes(), 2, 'identical again: nothing');
  b.filter('available');
  const filtered = b.paint();
  assert.equal(b.writes(), 3, 'a filter change is a change');
  assert.equal(rows(filtered), 5);
  b.fail();
  assert.equal(b.writes(), 3);
  // A failed read with a map in force keeps the board (Build 97): the chip changes, so it repaints.
  const failed = b.paint();
  assert.equal(b.writes(), 4, 'the failure chip is a change');
  assert.match(failed, /Sync failed — retry/);
});

test('EMPTIED — a section cleared (sign-out clears every section) repaints the same markup', () => {
  const b = board({ resolved: RESOLVED(), sync: true });
  const first = b.paint();
  b.clear();
  assert.equal(b.holds(), null, 'the host is empty');
  b.paint();
  assert.equal(b.writes(), 3, 'identical markup is painted again into the emptied host (1 paint + 1 clear + 1 paint)');
  assert.equal(b.held(), first);
  assert.equal(b.holds(), 'msg-hub');
});

test('FOREIGN — a host holding something else (safeRender\'s error card) repaints the same markup', () => {
  const b = board({ resolved: RESOLVED(), sync: true });
  const first = b.paint();
  b.foreign();
  assert.equal(b.holds(), 'card', 'the host holds the error card');
  b.paint();
  assert.equal(b.writes(), 3, 'the hub replaces the card even though the marker matches');
  assert.equal(b.held(), first);
  assert.equal(b.holds(), 'msg-hub');
});

test('UNCHANGED OUTPUT — the paint is exactly what the renderer builds, and the renderer has one host write, guarded by the applied-source marker', () => {
  const body = fn('renderMessageCenterV2');
  assert.match(body, /const hub = `\n\s*<div class="msg-hub">/, 'the hub is built into a string first');
  assert.equal((body.match(/\.innerHTML\s*=/g) || []).length, 1, 'exactly one innerHTML write in the renderer');
  assert.match(body, /const host = document\.getElementById\("coach-message"\);/);
  assert.match(body, /host\.firstElementChild\.classList\.contains\('msg-hub'\)/, 'the skip requires the host to still hold the hub');
  assert.match(body, /if \(holdsHub && host\._ceAppliedMarkup === hub\) return;/, 'the skip: same source, hub still there');
  assert.match(body, /host\.innerHTML = hub;\s*host\._ceAppliedMarkup = hub;/, 'paint, then remember the source painted');
  // The same marker name the login panel, the group switcher and the nav hosts use.
  assert.match(fn('renderNav'), /_ceAppliedMarkup/);
});

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER — the real client, desktop and Pixel 5
// ═══════════════════════════════════════════════════════════════════════════
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const GRP = 'grp_initial', TEAM = 'team_stub';
const PLAYERS = Array.from({ length: 18 }, (_, i) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: GRP }));
const SESSION = { ok: true, user: { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
  permissions: ['reports', 'messaging', 'manage_players', 'manage_coaches', 'training', 'matchday', 'publish_training'],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
  operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false } } };
const FIXTURES = [{ id: SAT, groupId: GRP, opposition: 'Kituro', date: MATCH_DAY, kickoffTime: '14:00', status: 'scheduled' }];
/** A stub server: ctl.extra = how many more players answer 'available'; ctl.mode = 'fail' fails the board read. */
function boardServer() {
  const ctl = { mode: 'ok', extra: 0, reads: 0, api: [] };
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    if (u.startsWith('/api/')) ctl.api.push(u.replace(/[?&](_t|ts|_)=\d+/g, ''));
    const send = (o, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/availability')) {
      ctl.reads++;
      if (ctl.mode === 'fail') return send({ error: 'boom' }, 500);
      const resolved = {}; [...PLAYERS.slice(0, 5), ...PLAYERS.slice(7, 7 + ctl.extra)].forEach(p => { resolved[p.userId] = { [SAT]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; });
      resolved.u_p5 = { [SAT]: { response: 'maybe' } }; resolved.u_p6 = { [SAT]: { response: 'unavailable', reason: 'work' } };
      return send({ resolved, roster: PLAYERS });
    }
    if (u.startsWith('/api/identity')) return send(SESSION);
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
  return { srv, ctl };
}
const seed = section => ({ activeView: 'coach', activeCoachSection: section, stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' }], operationalGroupId: GRP, players: PLAYERS, fixtures: FIXTURES, messages: [], onboardingDismissed: true,
  availabilityRequests: [{ sessionId: SAT, status: 'sent', sentAt: '2026-09-22T09:00:00Z', groupId: GRP, clubId: TEAM, sentWeek: WEEK }] });
/** Every innerHTML set on #coach-message, with whether it equalled the previous one. */
const hubCounter = () => {
  window.__hub = [];
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get: d.get, set(v) {
    if (this.id === 'coach-message') { const s = String(v); window.__hub.push({ t: Math.round(performance.now()), same: this.__ceLast === s, len: s.length, loading: /Loading availability…/.test(s) }); this.__ceLast = s; }
    return d.set.call(this, v);
  } });
};
const boardState = () => ({
  kpi: [...document.querySelectorAll('#coach-message .msg-kpi')].map(e => e.innerText.replace(/\s+/g, ' ').trim()),
  rows: document.querySelectorAll('#coach-message .msg-player-row').length,
  loading: !!document.querySelector('#coach-message .avail-loading'),
  error: /Availability could not be loaded/.test(document.getElementById('coach-message')?.innerText || ''),
  chip: (document.getElementById('avail-refresh-ts') || {}).textContent || '',
  chipClass: (document.getElementById('avail-refresh-ts') || {}).className || '',
  visible: !!document.getElementById('coach-message')?.offsetParent,
  hub: window.__hub.length, identical: window.__hub.filter(h => h.same).length,
  inFlight: typeof _liveAvailabilityInFlight !== 'undefined' && _liveAvailabilityInFlight !== null,
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
});
const waitFor = async (fnc, ms, every = 80) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, every)); } };
const settled = page => waitFor(async () => { const a = await page.evaluate(() => window.__hub.length); await new Promise(r => setTimeout(r, 700)); return a === await page.evaluate(() => window.__hub.length) && !(await page.evaluate(() => typeof _liveAvailabilityInFlight !== 'undefined' && _liveAvailabilityInFlight !== null)); }, 15000, 50);

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): a cold load never rewrites the hub with identical markup; nothing-changed renders paint nothing; a change paints once; loading, Live Sync, polling and the failed read are unchanged`, { timeout: 150000 }, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, ctl } = boardServer();
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    const open = async (section) => {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), seed(section));
      await ctx.addInitScript(hubCounter);
      const page = await ctx.newPage();
      const errors = [], consoleErrors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); });
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      return { ctx, page, errors, consoleErrors };
    };
    try {
      // ── A. A direct cold load into Availability ──
      let h = await open('message');
      assert.ok(await waitFor(() => h.page.evaluate(() => document.querySelectorAll('#coach-message .msg-kpi').length === 4), 15000), 'the real board arrives');
      assert.ok(await settled(h.page), 'the boot settles');
      let s = await h.page.evaluate(boardState);
      assert.deepEqual(s.kpi, ['AVAILABLE 5', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 11']);
      assert.equal(s.rows, 18); assert.equal(s.loading, false); assert.equal(s.overflow, false, 'no horizontal overflow');
      assert.equal(s.identical, 0, `no hub rewrite was identical to the one before it (${s.hub} paints)`);
      assert.ok(s.hub <= 6, `the boot painted the hub at most six times, once per change (${s.hub})`);
      assert.ok(await h.page.evaluate(() => window.__hub[0].loading), 'the first paint was the loading block (Build 110)');
      assert.equal(ctl.reads, 1, 'one board read at boot (Build 111)');
      assert.match(s.chip, /^Synced \d\d:\d\d$/); assert.match(s.chipClass, /\bavailable\b/);
      // ── B. Renders with nothing changed paint nothing, and the DOM keeps what it held ──
      const before = s.hub;
      await h.page.evaluate(() => { document.getElementById('tplName').value = 'typed by the coach'; for (let i = 0; i < 3; i++) render(); renderMessageCenter(); });
      s = await h.page.evaluate(boardState);
      assert.equal(s.hub, before, 'three render() passes and a direct renderMessageCenter() painted nothing');
      assert.equal(await h.page.evaluate(() => document.getElementById('tplName').value), 'typed by the coach', 'a value in the hub survived them');
      assert.deepEqual(s.kpi, ['AVAILABLE 5', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 11'], 'and the board is still right');
      // ── C. A change paints exactly once ──
      await h.page.evaluate(() => setAvailabilityBoardFilter('available'));
      s = await h.page.evaluate(boardState);
      assert.equal(s.hub, before + 1, 'a filter change painted once'); assert.equal(s.rows, 5);
      await h.page.evaluate(() => setAvailabilityBoardFilter('all'));
      s = await h.page.evaluate(boardState);
      assert.equal(s.hub, before + 2); assert.equal(s.rows, 18);
      // ── D. Live Sync: its own read (Build 111), the chip updates in place, identical data paints nothing ──
      const readsBefore = ctl.reads, hubBefore = s.hub;
      await h.page.evaluate(() => availRefreshNow());
      assert.ok(await waitFor(() => ctl.reads === readsBefore + 1, 10000), 'Live Sync made exactly one read');
      assert.ok(await settled(h.page));
      s = await h.page.evaluate(boardState);
      assert.match(s.chip, /^Synced \d\d:\d\d$/, 'the chip reports the sync'); assert.equal(s.identical, 0);
      assert.ok(s.hub - hubBefore <= 1, `an unchanged answer set painted at most once (${s.hub - hubBefore})`);
      // ── E. Polling: a changed answer lands on the next tick and paints once ──
      ctl.extra = 1;
      const hubPoll = s.hub;
      assert.ok(await waitFor(() => h.page.evaluate(() => (document.querySelector('#coach-message .msg-kpi')?.innerText || '').replace(/\s+/g, ' ').trim() === 'AVAILABLE 6'), 12000), 'the poll tick painted the new answer');
      s = await h.page.evaluate(boardState);
      assert.deepEqual(s.kpi, ['AVAILABLE 6', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 10']);
      assert.equal(s.hub, hubPoll + 1, 'exactly one paint for the change'); assert.equal(s.identical, 0);
      // ── F. A failed read is the failure state (Build 97): one paint, the error chip ──
      ctl.mode = 'fail';
      await h.page.evaluate(() => availRefreshNow());
      assert.ok(await waitFor(() => h.page.evaluate(() => /Sync failed/.test(document.getElementById('avail-refresh-ts')?.textContent || '')), 10000), 'the chip says the sync failed');
      ctl.mode = 'ok';
      // ── G. An emptied section (sign-out clears every section) is repainted by the next render ──
      await h.page.evaluate(() => { clearAuthenticatedSections(); });
      assert.equal(await h.page.evaluate(() => document.getElementById('coach-message').children.length), 0, 'the host is empty');
      await h.page.evaluate(() => render());
      s = await h.page.evaluate(boardState);
      assert.equal(s.rows, 18, 'the hub is back after a render into the emptied host');
      assert.deepEqual(h.errors, [], 'no page errors'); assert.deepEqual(h.consoleErrors, [], 'no console errors');
      await h.ctx.close();
      // ── H. A load that lands on the Overview, then enters Availability ──
      // Since Build 116 render() paints only the section on show, so the hidden
      // hub is no longer kept current at boot (the board read's own settle may
      // still paint it once). What must hold: the Overview's boot read happens,
      // the hub is never rewritten with identical markup, and entering paints
      // the real board. A loader landing AFTER entry (attendance: "Loading
      // attendance…" → "No attendance recorded yet") is a real change and may
      // add a paint; the shared read's unchanged repaint is still skipped.
      ctl.extra = 0; ctl.reads = 0;
      h = await open('overview');
      assert.ok(await waitFor(() => h.page.evaluate(() => typeof currentResolvedAvailability === 'function' && currentResolvedAvailability() !== null), 15000), 'the Overview\'s boot read landed');
      assert.ok(await settled(h.page));
      s = await h.page.evaluate(boardState);
      assert.equal(s.visible, false, 'Availability is not on screen yet');
      assert.equal(ctl.reads, 1, 'one board read at boot');
      assert.equal(s.identical, 0, `no identical rewrite of the hidden hub at boot (${s.hub} paints)`);
      const bootPaints = s.hub, bootReads = ctl.reads;
      await h.page.evaluate(() => setSection('coach', 'message'));
      assert.ok(await waitFor(() => ctl.reads === bootReads + 1, 10000), 'entering Availability reads the board once');
      assert.ok(await settled(h.page));
      s = await h.page.evaluate(boardState);
      assert.equal(s.visible, true, 'Availability is on screen');
      assert.deepEqual(s.kpi, ['AVAILABLE 5', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 11']); assert.equal(s.rows, 18);
      assert.ok(s.hub - bootPaints >= 1, `entry painted the board (${s.hub - bootPaints})`);
      assert.equal(s.identical, 0, 'every paint on entry was a change');
      assert.equal(s.overflow, false);
      assert.deepEqual(h.errors, []); assert.deepEqual(h.consoleErrors, []);
      await h.ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}
