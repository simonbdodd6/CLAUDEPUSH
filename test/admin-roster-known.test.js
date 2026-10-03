/**
 * A ROSTER STILL LOADING IS NOT AN EMPTY CLUB (Build 122)
 *
 * operationalPlayers() fails CLOSED to [] while the operating group's
 * membership (admin data) has not landed for a coach entitled to it. Build 121
 * found, on the deployed code, what that did when the admin data was the LAST
 * thing a cold load waited for (its /api/invite answered after the board read):
 *
 *   · availabilityChaseContext() said 'ready' with an empty roster;
 *   · the Availability board printed AVAILABLE 0 · MAYBE 0 · UNAVAILABLE 0 ·
 *     NO REPLY 0 with a "No players yet" card and an Invite players button,
 *     for a club of eighteen;
 *   · the Overview lost its "N players haven't replied" prompt;
 *   · and when the admin data landed, loadAdminData repainted Club Admin /
 *     Settings / Members / Match Centre only — nothing repainted the screen on
 *     show, which stayed wrong for as long as the coach looked at it (65 s+).
 *
 * The fix, in four parts:
 *   A. operationalRosterKnown(): the fail-closed condition, stated once.
 *   B. availabilityChaseContext() is 'loading' while the roster is unknown
 *      (the Build 110 state — no new status).
 *   C. "No players yet" (board and Overview) only for a roster KNOWN empty.
 *   D. loadAdminData's landing calls render() once — the active section only
 *      (Build 118) — instead of a hand-picked list; a stale reply discarded by
 *      Build 117 renders nothing.
 *
 * SANDBOX tests run the REAL functions. BROWSER tests run the real client on
 * desktop and Pixel 5 with the admin data's /api/invite held until the board
 * read has landed — the production timing.
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
const APP = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
  return { availWeekStart, availAddDays, availToday, availabilityEventsForWeek };
`)();
const TODAY = APP.availToday(), WEEK = APP.availWeekStart(TODAY);
const inWeek = (d, today) => { const w = APP.availWeekStart(today); return APP.availabilityEventsForWeek(w, { fixtures: [{ id: 'p', opposition: 'P', date: d, status: 'scheduled' }], slots: [], currentWeekStart: w }).some(e => e.id === 'p'); };
const MATCH_DAY = (() => { let day = TODAY; for (let i = 0; i < 14; i++) { const n = APP.availAddDays(day, 1); if (!inWeek(n, TODAY)) break; day = n; } return day; })();
const SAT = 'fx_sat', GRP = 'grp_sen';

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX — the real operationalPlayers / operationalRosterKnown /
// availabilityChaseContext / renderMessageCenterV2, one coach device
// ═══════════════════════════════════════════════════════════════════════════
const P = i => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: GRP });
const RESOLVED = () => { const r = {}; for (let i = 0; i < 5; i++) r['u_p' + i] = { [SAT]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; r.u_p5 = { [SAT]: { response: 'maybe' } }; r.u_p6 = { [SAT]: { response: 'unavailable', reason: 'work' } }; return r; };
/**
 * adminLoaded — the membership has landed; members — its rows; entitled — the
 * coach may read it (manage_players); group — a group in force; players — the
 * device's roster rows.
 */
function device({ adminLoaded = false, entitled = true, group = GRP, players = Array.from({ length: 18 }, (_, i) => P(i)), members = null } = {}) {
  const mem = members || players.map(p => ({ userId: p.userId, playerGroupId: GRP, role: 'player' }));
  const body = `
    "use strict";
    const CFG = arguments[0], calls = { ensureAdminData: 0 };
    const painted = {};
    const document = { getElementById: id => ({ set innerHTML(v) { painted[id] = v; }, get innerHTML() { return painted[id] || ''; } }), querySelector: () => null, querySelectorAll: () => [] };
    let _clubContextId = 'team_home';
    let state = { operationalGroupId: CFG.group, players: CFG.players, fixtures: [{ id: '${SAT}', groupId: '${GRP}', opposition: 'Kituro', date: '${MATCH_DAY}', kickoffTime: '14:00', status: 'scheduled' }],
                  schedule: [], messages: [], availabilityRequests: [], matchCentre: {}, trainingBlocks: {}, activeView: 'coach', activeCoachSection: 'message',
                  selectedMessagePlayerId: null, autoSendSchedule: null, messageDetail: '${SAT}' };
    let _adminData = { members: CFG.members, loaded: CFG.adminLoaded, loading: !CFG.adminLoaded };
    let _resolvedAvailability = ${JSON.stringify(RESOLVED())}, _resolvedAvailabilityGroup = CFG.group || '';
    let _availLastSync = new Date().toISOString(), _availReadFailed = false;
    let _trainingSchedule = { slots: [] }, _trainingScheduleGroupId = CFG.group || '', _trainingScheduleAttempted = false;
    let _availTodayOverride = '';
    let availabilityBoardFilter = 'all', availabilityBoardSort = 'status';
    const BETA_SIMPLE_UI = true;
    const EMPTY_PLAYER = { id: '', name: '', position: '' };
    const REASON_LABELS = { injury: 'Injury', work: 'Work', holiday: 'Holiday', family: 'Family', other: 'Other' };
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function canI(p) { return CFG.entitled ? true : !['manage_players', 'manage_teams'].includes(p); }
    function ensureAdminData() { calls.ensureAdminData++; }
    function canonicalVisiblePlayers() { return state.players; }
    function playerGroupIdOf(p) { return p.playerGroupId || ''; }
    function operationalGroups() { return [{ id: '${GRP}', name: 'Seniors' }]; }
    function trainingGroupParam() { return state.operationalGroupId || ''; }
    function ensureTrainingSchedule() {}
    function playerIsArchived() { return false; }
    function contextFixtures() { return state.fixtures; } function normalizeFixture(f) { return f; }
    function fixturesKnown() { return true; }
    function availabilityPendingFor() { return null; }
    function coachAvailWeek() { return availWeekStart(availToday()); }
    function sortAvailabilityRows(rows) { return rows; }
    function percent(a, b) { return b ? Math.round(a / b * 100) : 0; }
    function fmtRespondedAt() { return ''; } function playerAttendancePct() { return null; } function attendanceLabel() { return '—'; } function attendanceUnknownReason() { return ''; }
    function sessionTypeIcon() { return ''; }
    function operationalGroupSwitcherHTML() { return ''; } function ceProductMarkHtml() { return ''; } function availWeekLabel() { return 'This week'; }
    function buildPlayerDetailHtml() { return ''; }
    function renderManageSessions() { return ''; }
    ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
    ${fn('availDatedWeekLabel')} ${fn('availabilitySessionLabel')} ${fn('statusLabel')}
    ${fn('sessionKey')} ${fn('sessionReasonKey')} ${fn('normalizeSessionId')} ${fn('liveAvailabilityPlayerKeys')}
    ${fn('clubUsesPlayerGroups')} ${fn('operationalPlayers')} ${fn('operationalRosterKnown')}
    ${fn('currentResolvedAvailability')} ${fn('availabilityLastReadFailed')} ${fn('availabilityReadUnknown')} ${fn('resolvedAnswerFor')} ${fn('sessionRows')}
    ${fn('availabilityNonResponders')} ${fn('availabilityWeekSessions')} ${fn('availabilityRequestMatches')} ${fn('availabilityRequestedSessions')} ${fn('availabilityChaseContext')}
    ${fn('coachAvailEvents')} ${fn('coachSelectedEvent')} ${fn('availabilityRowMatchesFilter')}
    ${fn('renderMessageCenterV2')}
    return {
      calls, known: () => operationalRosterKnown(), roster: () => operationalPlayers(), status: () => availabilityChaseContext(coachAvailWeek()).status,
      paint: () => { renderMessageCenterV2(); return painted['coach-message'] || ''; },
      land: () => { _adminData.loaded = true; _adminData.loading = false; },
    };
  `;
  return new Function(body)({ adminLoaded, entitled, group, players, members: mem });
}
const read = html => ({
  loading: /Loading availability…/.test(html),
  noPlayers: /No players yet/.test(html),
  invite: /openInvitePlayersModal\(\)/.test(html),
  kpi: [...html.matchAll(/<article class="msg-kpi ([a-z-]+)"><span>([^<]*)<\/span><strong>(\d+)<\/strong>/g)].map(m => `${m[2]} ${m[3]}`),
  rows: (html.match(/class="msg-player-row/g) || []).length,
  noReplyChips: (html.match(/class="msg-chip no-reply">No reply</g) || []).length,
});

test('A. unknown roster: the chase context is LOADING, and the board says so — no "No players yet", no Invite, no zero counts, no No-reply rows', () => {
  const d = device({ adminLoaded: false });
  assert.equal(d.known(), false, 'the roster is not known');
  assert.deepEqual(d.roster(), [], 'operationalPlayers() fails closed, as before');
  assert.equal(d.status(), 'loading', 'availabilityChaseContext() is the Build 110 loading state');
  const r = read(d.paint());
  assert.equal(r.loading, true, 'the loading block');
  assert.equal(r.noPlayers, false, 'no "No players yet"');
  assert.equal(r.invite, false, 'no Invite players');
  assert.deepEqual(r.kpi, [], 'no AVAILABLE 0 / MAYBE 0 / UNAVAILABLE 0 / NO REPLY 0');
  assert.equal(r.rows, 0); assert.equal(r.noReplyChips, 0);
});

test('A2. the same device once the admin data lands: ready, 5/1/1/11, 18 rows', () => {
  const d = device({ adminLoaded: false });
  d.land();
  assert.equal(d.known(), true);
  assert.equal(d.status(), 'ready');
  const r = read(d.paint());
  assert.deepEqual(r.kpi, ['Available 5', 'Maybe 1', 'Unavailable 1', 'No reply 11']);
  assert.equal(r.rows, 18); assert.equal(r.loading, false); assert.equal(r.noPlayers, false);
});

test('B. KNOWN empty: the admin data has landed and the group has nobody — ready, "No players yet" with Invite, no loading block', () => {
  const d = device({ adminLoaded: true, players: [], members: [{ userId: 'u_coach', playerGroupId: GRP, role: 'coach' }] });
  assert.equal(d.known(), true, 'known');
  assert.deepEqual(d.roster(), [], 'and empty');
  assert.equal(d.status(), 'ready', 'a known empty roster is not loading');
  const r = read(d.paint());
  assert.equal(r.noPlayers, true, '"No players yet" is the true thing to say');
  assert.equal(r.invite, true, 'with the way to fix it');
  assert.equal(r.loading, false);
});

test('the roster-known rule is EXACTLY operationalPlayers\' fail-closed rule, in every combination', () => {
  for (const group of [GRP, '']) for (const adminLoaded of [true, false]) for (const entitled of [true, false]) {
    const d = device({ group, adminLoaded, entitled });
    const known = d.known();
    const before = d.calls.ensureAdminData; const roster = d.roster(); const failedClosed = d.calls.ensureAdminData > before;
    assert.equal(known, !failedClosed, `group=${group || 'none'} loaded=${adminLoaded} entitled=${entitled}: known=${known}, operationalPlayers failed closed=${failedClosed}`);
    if (!known) assert.deepEqual(roster, []);
    const expected = !group || adminLoaded || !entitled;
    assert.equal(known, expected, 'unknown only with a group in force, an entitled coach, and no admin data');
  }
});

// ── Part D: loadAdminData's landing, over the real loadAdminData ─────────────
const BODY = club => ({
  '/api/identity': { users: [], team_members: [{ userId: 'm_' + club, teamId: club, role: 'player' }], player_profiles: [] },
  '/api/invite': { invites: [] }, '/api/publish?resource=club': { club: { id: club, name: 'Club ' + club } },
  '/api/publish?resource=structure': { structure: {}, counts: { groups: {} }, clubWideStaffIds: [], clubWideStaff: [] },
});
function adminApp({ club = '' } = {}) {
  const pending = []; const calls = { renders: 0, legacy: 0 };
  const fetchStub = url => new Promise((resolve, reject) => pending.push({ url, resolve, reject }));
  const body = `
    "use strict";
    const fetch = arguments[0], calls = arguments[1], CFG = arguments[2];
    let CLOCK = 1000000; const Date = { now: () => CLOCK }; const console = { warn() {} };
    let _clubContextId = CFG.club;
    let state = { activeView: 'coach', activeCoachSection: 'message', fixtures: [] };
    function canI() { return true; }
    function render() { calls.renders++; }
    function renderClubAdmin() { calls.legacy++; } function renderSettings() { calls.legacy++; } function renderPlayers() { calls.legacy++; } function renderMatchday() { calls.legacy++; }
    function applyClubConfigLocally() {} function noteFixturesSynced() {}
    ${src.match(/let _adminData = \{[^\n]*\};/)[0]}
    let _adminDataAttemptAt = 0;
    ${fn('ensureAdminData')}
    ${fn('loadAdminData')}
    return { load: () => loadAdminData(), ensure: () => ensureAdminData(), admin: () => _adminData, setClub: c => { _clubContextId = c; },
             switchTo: c => { ${fn('resetClubScopedState').match(/if \(typeof _adminData === 'object' && _adminData\) Object\.assign\(_adminData, \{[\s\S]*?\}\);/)[0]} _clubContextId = c; } };
  `;
  const api = new Function(body)(fetchStub, calls, { club });
  const land = async (n, clubData, { status = 200 } = {}) => {
    for (const p of pending.slice(n * 4, n * 4 + 4)) { const st = p.url === '/api/identity' ? status : 200; p.resolve({ ok: st < 300, status: st, json: async () => BODY(clubData)[p.url] }); }
    for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r));
  };
  return { ...api, calls, land, loads: () => pending.filter(p => p.url === '/api/identity').length };
}

test('C. the admin data landing renders ONCE, through render() — no hand-picked screen list', async () => {
  const a = adminApp({ club: 'A' });
  const p = a.load(); await a.land(0, 'A'); await p;
  assert.equal(a.admin().loaded, true);
  assert.equal(a.calls.renders, 1, 'exactly one render() for the landing');
  assert.equal(a.calls.legacy, 0, 'and no direct repaint of Club Admin / Settings / Members / Match Centre');
});

test('C2. a real failure is news to the screen on show too: one render, the 15s backoff unchanged', async () => {
  const a = adminApp({ club: 'A' });
  const p = a.load(); await a.land(0, 'A', { status: 500 }); await p;
  assert.equal(a.admin().failed, true); assert.equal(a.calls.renders, 1);
  a.ensure(); assert.equal(a.loads(), 1, 'no refetch inside the backoff');
});

test('D. a stale reply (club A -> B) is discarded: never applied to B, NO render, no backoff (Build 117 intact)', async () => {
  const a = adminApp({ club: 'A' });
  const p = a.load();
  a.switchTo('B');
  await a.land(0, 'A'); await p;
  assert.deepEqual(a.admin().members, [], 'A\'s members are not B\'s');
  assert.equal(a.admin().loaded, false);
  assert.equal(a.calls.renders, 0, 'a discarded reply renders nothing');
  assert.equal(a.admin().attempted, false, 'and records no attempt');
  a.ensure(); assert.equal(a.loads(), 2, 'so the next ensure asks again at once');
});

test('SOURCE: one predicate, the loading gate in the chase context, the two "No players yet" gates, and render() in loadAdminData', () => {
  const known = stripComments(fn('operationalRosterKnown'));
  assert.match(known, /if \(!state\.operationalGroupId\) return true;/);
  assert.match(known, /if \(_adminData\.loaded\) return true;/);
  assert.match(known, /return !\(canI\('manage_players'\) \|\| canI\('manage_teams'\)\);/);
  assert.match(stripComments(fn('availabilityChaseContext')), /if \(typeof operationalRosterKnown === 'function' && !operationalRosterKnown\(\)\) return context\('loading'\);/);
  const board = stripComments(fn('renderMessageCenterV2'));
  assert.match(board, /\$\{!rosterKnown \? '' : opPlayers\.length === 0 \? `/, 'the board\'s No-players card waits for a known roster');
  const ovw = stripComments(fn('renderClubCommandDashboard'));
  assert.match(ovw, /const availabilityBody = availUnknown \? availUnavailableBody : !rosterKnown \? rosterLoadingBody :/);
  assert.match(ovw, /const squadAvailBody = availUnknown \? availUnavailableBody : !rosterKnown \? rosterLoadingBody :/);
  const load = stripComments(fn('loadAdminData'));
  assert.match(load, /if \(!_discarded && typeof render === 'function'\) render\(\);/, 'the central render() path');
  for (const direct of ['renderClubAdmin()', 'renderSettings()', 'renderPlayers()', 'renderMatchday()']) assert.ok(!load.includes(direct), `no hand-picked ${direct}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER — the production timing: /api/invite (admin data) held until the
// board read has landed
// ═══════════════════════════════════════════════════════════════════════════
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const BGRP = 'grp_initial', TEAM = 'team_stub';
const PLAYERS = Array.from({ length: 18 }, (_, i) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: BGRP }));
const FIXTURES = [{ id: SAT, groupId: BGRP, opposition: 'Kituro', date: MATCH_DAY, kickoffTime: '14:00', status: 'scheduled' }];
const SESSION = { ok: true, user: { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
  permissions: ['reports', 'messaging', 'manage_players', 'manage_coaches', 'training', 'matchday', 'publish_training'],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
  operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: BGRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: BGRP, mustChoose: false } } };
function stubServer({ players = PLAYERS } = {}) {
  const ctl = { gate: null, api: [] };
  let release = () => {};
  const srv = http.createServer(async (req, res) => {
    const u = req.url || '/';
    if (u.startsWith('/api/')) ctl.api.push(req.method + ' ' + u.replace(/[?&](_t|ts|_)=\d+/g, ''));
    const send = (o, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/invite') && ctl.gate) await ctl.gate;
    if (u.startsWith('/api/availability')) {
      const resolved = {}; players.slice(0, 5).forEach(p => { resolved[p.userId] = { [SAT]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; });
      if (players[5]) resolved.u_p5 = { [SAT]: { response: 'maybe' } }; if (players[6]) resolved.u_p6 = { [SAT]: { response: 'unavailable', reason: 'work' } };
      return send({ resolved, roster: players });
    }
    if (u.startsWith('/api/identity')) return send(SESSION);
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: FIXTURES });
    if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: BGRP, name: 'Seniors', status: 'active' }], teams: [] });
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: BGRP, canEdit: true });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players });
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
const seed = (section, players = PLAYERS) => ({ activeView: 'coach', activeCoachSection: section, stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' }], operationalGroupId: BGRP, players, fixtures: FIXTURES, messages: [], onboardingDismissed: true,
  availabilityRequests: [{ sessionId: SAT, status: 'sent', sentAt: '2026-09-22T09:00:00Z', groupId: BGRP, clubId: TEAM, sentWeek: WEEK }] });
/** Every render(), with what started it. */
const renderLog = () => { window.__r = []; const w = () => { if (typeof window.render !== 'function') { setTimeout(w, 0); return; } const o = window.render; window.render = function () { window.__r.push({ t: Math.round(performance.now()), from: new Error().stack.split('\n')[2].trim().replace(/\(.*\)/, '').replace(/^at /, '').replace(/^async /, '').trim() }); return o.apply(this, arguments); }; }; w(); };
const look = () => {
  const hub = document.getElementById('coach-message'), ov = document.getElementById('coach-overview');
  const t = (hub?.innerText || '').replace(/\s+/g, ' '), o = (ov?.innerText || '').replace(/\s+/g, ' ');
  return { status: availabilityChaseContext().status, admin: _adminData.loaded,
    kpi: [...(hub?.querySelectorAll('.msg-kpi') || [])].map(e => e.innerText.replace(/\s+/g, ' ').trim()),
    loading: !!hub?.querySelector('.avail-loading'), noPlayers: /No players yet/.test(t), invite: !!hub?.querySelector('[onclick*="openInvitePlayersModal"]'),
    rows: hub?.querySelectorAll('.msg-player-row').length || 0,
    prompt: (o.match(/\d+ players? haven't replied/) || [null])[0], ovwNoPlayers: /No players yet/.test(o), ovwLoadingSquad: /Loading the squad/.test(o),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
};
const waitFor = async (fnc, ms, every = 40) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, every)); } };

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): admin data lands LAST — Availability says loading (not an empty club), then the real board within 1 s, one render, no extra reads; the Overview prompt the same way`, { timeout: 120000 }, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, ctl } = stubServer();
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const open = async (section, players) => {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), seed(section, players));
      await ctx.addInitScript(renderLog);
      const page = await ctx.newPage();
      const errors = [], consoleErrors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); });
      await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
      return { ctx, page, errors, consoleErrors };
    };
    const count = re => ctl.api.filter(x => re.test(x)).length;
    try {
      // ── Availability on show ──
      ctl.api.length = 0; ctl.hold();
      let h = await open('message');
      assert.ok(await waitFor(() => h.page.evaluate(() => typeof currentResolvedAvailability === 'function' && currentResolvedAvailability() !== null), 15000), 'the board read landed first');
      await new Promise(r => setTimeout(r, 1500));
      let s = await h.page.evaluate(look);
      assert.equal(s.admin, false, 'the admin data is still out');
      assert.equal(s.status, 'loading');
      assert.equal(s.loading, true, '"Loading availability…"');
      assert.equal(s.noPlayers, false, 'not "No players yet"'); assert.equal(s.invite, false, 'no Invite players');
      assert.deepEqual(s.kpi, [], 'not AVAILABLE 0 / MAYBE 0 / UNAVAILABLE 0 / NO REPLY 0');
      assert.equal(s.rows, 0);
      const before = await h.page.evaluate(() => window.__r.length);
      ctl.release();
      const t0 = Date.now();
      assert.ok(await waitFor(() => h.page.evaluate(() => document.querySelectorAll('#coach-message .msg-player-row').length === 18), 1000), 'the real board within 1 s');
      const ms = Date.now() - t0;
      await new Promise(r => setTimeout(r, 1200));
      s = await h.page.evaluate(look);
      assert.deepEqual(s.kpi, ['AVAILABLE 5', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 11'], `5/1/1/11 (${ms} ms after release)`);
      assert.equal(s.loading, false); assert.equal(s.noPlayers, false);
      const after = (await h.page.evaluate(() => window.__r)).slice(before);
      assert.equal(after.filter(r => r.from === 'loadAdminData').length, 1, 'exactly one render() from the admin landing: ' + JSON.stringify(after.map(r => r.from)));
      assert.equal(count(/^GET \/api\/availability\?resolveRoster=1/), 1, 'one board read');
      assert.equal(count(/^GET \/api\/publish\?resource=structure/), 1, 'one admin read');
      assert.equal(s.overflow, false);
      assert.deepEqual(h.errors, []); assert.deepEqual(h.consoleErrors, []);
      await h.ctx.close();
      // ── Overview on show ──
      ctl.api.length = 0; ctl.hold();
      h = await open('overview');
      assert.ok(await waitFor(() => h.page.evaluate(() => typeof currentResolvedAvailability === 'function' && currentResolvedAvailability() !== null), 15000));
      await new Promise(r => setTimeout(r, 1500));
      s = await h.page.evaluate(look);
      assert.equal(s.status, 'loading', 'the prompt is withheld because the roster is unknown');
      assert.equal(s.prompt, null); assert.equal(s.ovwNoPlayers, false, 'the Overview cards do not say "No players yet"');
      assert.equal(s.ovwLoadingSquad, true, 'they say the squad is loading');
      const ob = await h.page.evaluate(() => window.__r.length);
      ctl.release();
      assert.ok(await waitFor(() => h.page.evaluate(() => /\d+ players? haven't replied/.test(document.getElementById('coach-overview')?.innerText || '')), 1000), 'the prompt within 1 s, with no action');
      await new Promise(r => setTimeout(r, 1200));
      s = await h.page.evaluate(look);
      assert.equal(s.prompt, "11 players haven't replied"); assert.equal(s.ovwLoadingSquad, false);
      const oa = (await h.page.evaluate(() => window.__r)).slice(ob);
      assert.equal(oa.filter(r => r.from === 'loadAdminData').length, 1, 'one render() from the admin landing');
      assert.equal(count(/^GET \/api\/publish\?resource=structure/), 1, 'one admin read');
      assert.equal(s.overflow, false);
      assert.deepEqual(h.errors, []); assert.deepEqual(h.consoleErrors, []);
      await h.ctx.close();
    } finally { ctl.release(); await browser.close(); srv.close(); }
  });
}

test('browser (desktop): a club that is KNOWN empty still says "No players yet" with Invite players', { timeout: 60000 }, async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const { srv } = stubServer({ players: [] });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), seed('message', []));
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
    // Settled: the roster known (empty) AND every other availability source landed — under suite load
    // the training schedule can still be out when the roster lands, and that is honestly 'loading'.
    assert.ok(await waitFor(() => page.evaluate(() => _adminData.loaded === true && availabilityChaseContext().status === 'ready'
      && /No players yet/.test(document.getElementById('coach-message')?.innerText || '')), 15000), '"No players yet" once the empty roster is known');
    const s = await page.evaluate(look);
    assert.equal(s.loading, false, 'not loading'); assert.equal(s.invite, true, 'Invite players offered');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
