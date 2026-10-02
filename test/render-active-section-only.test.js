/**
 * render() PAINTS THE SECTION ON SHOW, NOT EVERY SECTION (Build 116)
 *
 * render() runs whenever any loader lands: six passes on a direct cold load,
 * nine on an Overview landing. Every pass called every section renderer,
 * hidden ones included. Measured at ef2ccab9 (desktop, median of 5):
 * render() took 116ms per direct cold load and 189ms per Overview landing,
 * 75–85% of it building markup behind display:none.
 *
 * Now a section renderer runs only when its section is the one on show for
 * the active view. showSection() coerces the view and section FIRST and
 * returns the id it actually showed; the gate decides on that id. The nav,
 * the aside, the auth banner and the debug overlay always run. The shared-ID
 * shell rules (chat, medical) are unchanged.
 *
 * A few hidden renderers started loads as a side effect of painting, and
 * other screens consume what those loads bring. Those invocations moved,
 * unchanged, into ensureHiddenSectionData(), which render() calls on every
 * pass before the gate: the Match Centre teams, the admin data, the training
 * schedule, the Overview's board read (ensureRecentActivity), the player's own
 * self-read and published state, and one conversations read per sign-in so
 * the nav's unread badge is current at boot. Each keeps its own latch.
 *
 * SANDBOX tests run the REAL render(), showSection() and
 * ensureHiddenSectionData() over counting stubs. BROWSER tests run the real
 * client on desktop and Pixel 5 through the section journey.
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

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX — the real render(), showSection() and ensureHiddenSectionData()
// ═══════════════════════════════════════════════════════════════════════════
// The coach sections and render()'s registrations are READ FROM THE APP, not
// listed here. A literal list pinned the Tactics section, which exists on the
// development branch and, by the tactics-mount exclusion, on no production
// branch — so this suite could never pass on a release candidate. Same rule as
// test/core-beta-nav (a1d7f003): Tactics is expected if and only if mounted.
const COACH = [...src.slice(src.indexOf('const coachSections = ['), src.indexOf('];', src.indexOf('const coachSections = ['))).matchAll(/^\s*\[\s*"([a-z-]+)"\s*,/gm)].map(m => m[1]);
const PLAYER = ['home', 'week', 'availability', 'fixtures', 'messages', 'medical', 'performance'];
/** The renderer render() registers for each section id: the last render…() its safeRender('<id>', …) calls. */
const RENDERER_OF = Object.fromEntries(fn('render').split('\n')
  .map(l => l.match(/safeRender\('((?:coach|player)-[a-z-]+)',\s*\(\) =>(.*)$/)).filter(Boolean)
  .map(m => [m[1], ([...m[2].matchAll(/\b(render[A-Z]\w*)\(/g)].pop() || [])[1]]));
const TACTICS_MOUNTED = COACH.includes('tactics');
const SECTION_RENDERERS = [...new Set(Object.values(RENDERER_OF))];
const ALWAYS = ['renderNav', 'renderAuthBanner', 'renderDebugOverlay'];
const ENSURE = ['ensureMatchCentreTeams', 'ensureAdminData', 'ensureTrainingSchedule', 'ensureRecentActivity', 'fetchMyAvailabilityFromServer', 'loadPublishedStateForPlayer', 'chatFetchConversations'];

/**
 * One device. `real` names ensure* functions to run for real (with their own
 * latches) instead of as counters; fetches they make are counted in calls.fetch.
 */
function app({ view = 'coach', coachSection = 'message', playerSection = 'home', coach = true, playerId = '', features = {}, auth = 'authed', real = [] } = {}) {
  const sections = {};
  for (const id of [...COACH.map(s => 'coach-' + s), ...PLAYER.map(s => 'player-' + s)]) {
    const cls = new Set(['section']);
    sections[id] = { id, innerHTML: '', classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } };
  }
  const misc = { pageTitle: { textContent: '' }, eyebrow: { textContent: '' } };
  const calls = {};
  const counter = n => function () { calls[n] = (calls[n] || 0) + 1; calls.order = (calls.order || []).concat(n); return Promise.resolve(); };   // the loaders return promises
  const stubs = {};
  for (const n of [...SECTION_RENDERERS, ...ALWAYS, ...ENSURE, 'clearInactiveMedicalShell', 'chatStopPolling', 'loadLiveMessaging', 'liveMessagingArmReload',
    'renderAudiencePicker', 'renderOperationalGroupSwitcher', 'clearAuthenticatedSections', 'loadAdminData']) stubs[n] = counter(n);
  const body = `
    "use strict";
    const S = arguments[0], CFG = arguments[1], calls = arguments[2], sections = arguments[3], misc = arguments[4];
    const document = {
      getElementById: id => sections[id] || misc[id] || null,
      querySelectorAll: sel => sel === '.section' ? Object.values(sections) : [],
    };
    const setTimeout = (f) => { calls.timeouts = (calls.timeouts || 0) + 1; };
    const fetch = () => { calls.fetch = (calls.fetch || 0) + 1; return new Promise(() => {}); };
    let state = { activeView: CFG.view, activeCoachSection: CFG.coachSection, activePlayerSection: CFG.playerSection, features: CFG.features, operationalGroupId: 'grp' };
    let _chatShellRendered = null, _serverAuthState = CFG.auth;
    let _mcTeams = null, _mcTeamsAttempted = false;
    let _adminData = { loaded: false, loading: false, attempted: false }, _adminDataAttemptAt = 0;
    const coachSections = ${JSON.stringify(COACH)}.map(id => [id, id]);
    function playerSectionsFor() { return ${JSON.stringify(PLAYER)}.map(id => [id, id]); }
    function isCoach() { return CFG.coach; }
    function canI() { return true; }
    function sessionSignedOut() { return false; }
    function pageTitle() { return 'T'; }
    function getPlayer() { return { id: CFG.playerId, name: 'P' }; }
    ${Object.keys(stubs).filter(n => !real.includes(n)).map(n => `const ${n} = S.${n};`).join('\n')}
    ${real.includes('ensureMatchCentreTeams') ? fn('ensureMatchCentreTeams') : ''}
    ${real.includes('ensureAdminData') ? fn('ensureAdminData').replace('loadAdminData();', 'loadAdminData(); _adminData.loading = true;') : ''}
    ${src.match(/let _hiddenDataChatAuthSeen = '';/)[0]}
    ${fn('ensureHiddenSectionData')}
    ${fn('showSection')}
    ${fn('render')}
    return { render, state, setAuth: a => { _serverAuthState = a; }, active: () => Object.values(sections).filter(s => s.classList.contains('active')).map(s => s.id) };
  `;
  const api = new Function(body)(stubs, { view, coachSection, playerSection, coach, playerId, features, auth, real }, calls, sections, misc);
  return { ...api, calls, sections, reset: () => { for (const k of Object.keys(calls)) delete calls[k]; } };
}
const sectionCalls = calls => Object.fromEntries(SECTION_RENDERERS.map(n => [n, calls[n] || 0]).filter(([, v]) => v));

test('A/B. a coach on Availability: the board renders, no hidden section renderer is called, the nav and shared UI still render', () => {
  const a = app({ coachSection: 'message' });
  a.render();
  assert.deepEqual(sectionCalls(a.calls), { renderMessageCenter: 1 }, 'only the section on show');
  for (const n of ALWAYS) assert.equal(a.calls[n], 1, `${n} still runs`);
  assert.deepEqual(a.active(), ['coach-message']);
  assert.equal(a.calls.loadLiveMessaging, 1, 'the live cycle still starts on Availability');
});

test('the section lists are the app\'s own: every coach section is registered, Tactics if and only if mounted, each renderer as before', () => {
  assert.ok(COACH.length >= 18, `coachSections parsed (${COACH.length})`);
  for (const s of COACH) assert.ok(RENDERER_OF['coach-' + s], `coach-${s} has a render() registration`);
  for (const s of PLAYER) assert.ok(RENDERER_OF['player-' + s], `player-${s} has a render() registration`);
  for (const id of Object.keys(RENDERER_OF)) {
    const [view, ...rest] = id.split('-'); const s = rest.join('-');
    assert.ok((view === 'coach' ? COACH : PLAYER).includes(s), `${id} is registered and is a real ${view} section`);
  }
  assert.equal('coach-tactics' in RENDERER_OF, TACTICS_MOUNTED, 'Tactics is registered if and only if it is mounted');
  assert.equal(/id="coach-tactics"/.test(src), TACTICS_MOUNTED, 'and has a section element if and only if it is mounted');
  // The renderer each section has always had (Build 116); tactics only where it exists.
  const EXPECTED = {
    'coach-overview': 'renderCoachOverview', 'coach-message': 'renderMessageCenter', 'coach-messages': 'renderCoachMessages', 'coach-training': 'renderTraining',
    'coach-performance': 'renderPerformance', 'coach-matchday': 'renderMatchday', 'coach-medical': 'renderMedical',
    'coach-players': 'renderPlayers', 'coach-admin': 'renderClubAdmin', 'coach-club': 'renderClubSection', 'coach-settings': 'renderSettings',
    'coach-fixtures': 'renderCoachFixtures', 'coach-selection': 'renderCoachSelection', 'coach-reports': 'renderReports', 'coach-calendar': 'renderCalendar',
    'coach-qa': 'renderBetaQA', 'coach-beta': 'renderBetaLaunch', 'coach-search': 'renderSearch',
    'player-medical': 'renderMedical', 'player-home': 'renderPlayerHome', 'player-week': 'renderPlayerWeek', 'player-availability': 'renderPlayerAvailabilityV2',
    'player-fixtures': 'renderPlayerFixtures', 'player-messages': 'renderPlayerMessages', 'player-performance': 'renderPerformance',
    ...(TACTICS_MOUNTED ? { 'coach-tactics': 'renderTactics' } : {}),
  };
  assert.deepEqual(RENDERER_OF, EXPECTED);
});

test('B. every section a coach or player can be on renders exactly its own renderer', () => {
  for (const s of COACH) {
    const a = app({ coachSection: s }); a.render();
    const want = { [RENDERER_OF['coach-' + s]]: 1 };
    assert.deepEqual(sectionCalls(a.calls), want, `coach on ${s}`);
  }
  for (const s of PLAYER) {
    const a = app({ view: 'player', playerSection: s, coach: false, playerId: 'p0' }); a.render();
    assert.deepEqual(sectionCalls(a.calls), { [RENDERER_OF['player-' + s]]: 1 }, `player on ${s}`);
  }
});

test('D. entering a section paints it on the next pass, and the one left stops painting', () => {
  const a = app({ coachSection: 'overview' });
  a.render();
  assert.deepEqual(sectionCalls(a.calls), { renderCoachOverview: 1 });
  for (const [s, r] of [['message', 'renderMessageCenter'], ['players', 'renderPlayers'], ['training', 'renderTraining'], ['matchday', 'renderMatchday'], ['medical', 'renderMedical'], ['messages', 'renderCoachMessages'], ['overview', 'renderCoachOverview']]) {
    a.reset(); a.state.activeCoachSection = s; a.render();
    assert.deepEqual(sectionCalls(a.calls), { [r]: 1 }, `entering ${s}`);
    assert.deepEqual(a.active(), ['coach-' + s]);
  }
});

test('the gate decides AFTER showSection\'s coercions: an unknown section paints the Overview it falls back to; a player on a revoked section paints Home', () => {
  const a = app({ coachSection: 'no-such-section' });
  a.render();
  assert.equal(a.state.activeCoachSection, 'overview', 'coerced');
  assert.deepEqual(sectionCalls(a.calls), { renderCoachOverview: 1 }, 'and the coerced section is the one painted');
  const p = app({ view: 'player', playerSection: 'gone', coach: false, playerId: 'p0' });
  p.render();
  assert.deepEqual(sectionCalls(p.calls), { renderPlayerHome: 1 });
  const v = app({ view: 'player', coach: true, playerSection: 'home', playerId: 'p0' });
  v.state.activeView = 'nonsense'; v.render();
  assert.equal(v.state.activeView, 'coach', 'an unknown view is coerced to the account\'s capacity');
  assert.deepEqual(sectionCalls(v.calls), { [RENDERER_OF['coach-message']]: 1 });
});

test('G. the shared-ID shell rules hold: the opposing chat shell is cleared, the medical shell is cleared before the active one renders', () => {
  const a = app({ coachSection: 'overview' });
  a.sections['player-messages'].innerHTML = '<div id="chatFeed"></div>';
  a.render();
  assert.equal(a.sections['player-messages'].innerHTML, '', 'a coach pass clears the player chat shell even when Messages is not on show');
  assert.equal(a.calls.chatStopPolling, 1, 'and stops chat polling off Messages');
  const m = app({ coachSection: 'medical' });
  m.render();
  const order = m.calls.order.filter(n => n === 'clearInactiveMedicalShell' || n === 'renderMedical');
  assert.deepEqual(order, ['clearInactiveMedicalShell', 'renderMedical'], 'medical: clear the other shell, then render');
  const p = app({ view: 'player', playerSection: 'medical', coach: false, playerId: 'p0' });
  p.sections['coach-messages'].innerHTML = '<div id="chatFeed"></div>';
  p.render();
  assert.equal(p.sections['coach-messages'].innerHTML, '', 'a player pass clears the coach chat shell');
  assert.deepEqual(p.calls.order.filter(n => n === 'clearInactiveMedicalShell' || n === 'renderMedical'), ['clearInactiveMedicalShell', 'renderMedical']);
});

test('E. the loads hidden renderers used to start still start on every pass, whatever section is on show', () => {
  for (const s of ['message', 'overview', 'players', 'settings']) {
    const a = app({ coachSection: s, playerId: '' });
    a.render();
    for (const n of ['ensureMatchCentreTeams', 'ensureAdminData', 'ensureTrainingSchedule', 'ensureRecentActivity'])
      assert.equal(a.calls[n], 1, `coach on ${s}: ${n}`);
    assert.equal(a.calls.fetchMyAvailabilityFromServer || 0, 0, 'a coach with no player record makes no self-read');
  }
  // A dual-role member in the player view: the board read AND the self-read.
  const d = app({ view: 'player', playerSection: 'home', coach: true, playerId: 'p0' });
  d.render();
  for (const n of ['ensureMatchCentreTeams', 'ensureAdminData', 'ensureRecentActivity', 'fetchMyAvailabilityFromServer', 'loadPublishedStateForPlayer'])
    assert.equal(d.calls[n], 1, `dual role on player Home: ${n}`);
  // A pure player: the self-read and published state, nothing coach-side.
  const p = app({ view: 'player', playerSection: 'home', coach: false, playerId: 'p0' });
  p.render();
  assert.equal(p.calls.fetchMyAvailabilityFromServer, 1); assert.equal(p.calls.loadPublishedStateForPlayer, 1);
  for (const n of ['ensureMatchCentreTeams', 'ensureAdminData', 'ensureRecentActivity']) assert.equal(p.calls[n] || 0, 0, `player: no ${n}`);
  // The Overview's feature dashboards never asked for the board read; they still do not.
  for (const f of ['coachTimeline', 'executiveDashboard', 'matchReadiness']) {
    const x = app({ coachSection: 'overview', features: { [f]: true } }); x.render();
    assert.equal(x.calls.ensureRecentActivity || 0, 0, `${f}: no recent-activity read`);
  }
});

test('F. each relocated load keeps its own latch: five passes, one teams fetch, one admin load', () => {
  const a = app({ coachSection: 'message', real: ['ensureMatchCentreTeams', 'ensureAdminData'] });
  for (let i = 0; i < 5; i++) a.render();
  assert.equal(a.calls.fetch, 1, 'ensureMatchCentreTeams fetched once across five passes');
  assert.equal(a.calls.loadAdminData, 1, 'ensureAdminData loaded once across five passes');
});

test('the nav badge: one conversations read per transition into a signed-in session, none while signed out or unknown', () => {
  const a = app({ coachSection: 'message', auth: 'unknown' });
  a.render(); a.render();
  assert.equal(a.calls.chatFetchConversations || 0, 0, 'no session yet: nothing');
  a.setAuth('authed'); a.render(); a.render(); a.render();
  assert.equal(a.calls.chatFetchConversations, 1, 'signed in: one read, not one per pass');
  a.setAuth('anon'); a.render();
  assert.equal(a.calls.chatFetchConversations, 1, 'signed out: nothing');
  a.setAuth('authed'); a.render();
  assert.equal(a.calls.chatFetchConversations, 2, 'signed in again: one more');
});

test('SOURCE: one gate inside safeRender, decided on showSection\'s answer, the loads called before the gate', () => {
  const body = stripComments(fn('render'));
  assert.match(body, /if \(sectionId && activeId && sectionId !== activeId\) return;/, 'the gate');
  assert.match(body, /safeRender\(null,\s*\(\) => \{ activeId = showSection\(\); \}\);/, 'the active id comes from showSection');
  assert.ok(body.indexOf('activeId = showSection()') < body.indexOf('ensureHiddenSectionData()'), 'coerce first');
  assert.ok(body.indexOf('ensureHiddenSectionData()') < body.indexOf("safeRender('coach-overview'"), 'loads before any section renderer');
  assert.match(body, /safeRender\('coach-message',\s*\(\) => renderMessageCenter\(\)\)/, 'the Availability hub is registered under its section');
  assert.match(stripComments(fn('showSection')), /return shown \? shown\.id : null;/);
  // Renderer bodies untouched: the loads still live where they did, too (latched, harmless when entered).
  assert.match(fn('renderMatchday'), /ensureMatchCentreTeams\(\)/);
  assert.match(fn('renderTraining'), /ensureTrainingSchedule\(\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER — the real client, desktop and Pixel 5
// ═══════════════════════════════════════════════════════════════════════════
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const APP = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availToday')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
  return { availWeekStart, availAddDays, availToday, availabilityEventsForWeek };
`)();
const TODAY = APP.availToday(), WEEK = APP.availWeekStart(TODAY);
const MATCH_DAY = (() => { let day = TODAY; for (let i = 0; i < 14; i++) { const n = APP.availAddDays(day, 1); const inW = APP.availabilityEventsForWeek(WEEK, { fixtures: [{ id: 'p', opposition: 'P', date: n, status: 'scheduled' }], slots: [], currentWeekStart: WEEK }).some(e => e.id === 'p'); if (!inW) break; day = n; } return day; })();
const SAT = 'fx_sat', GRP = 'grp_initial', TEAM = 'team_stub';
const PLAYERS = Array.from({ length: 18 }, (_, i) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: GRP }));
const FIXTURES = [{ id: SAT, groupId: GRP, opposition: 'Kituro', date: MATCH_DAY, kickoffTime: '14:00', status: 'scheduled' }];
const sessionFor = dual => ({ ok: true, user: { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: dual ? GRP : null },
  permissions: ['reports', 'messaging', 'manage_players', 'manage_coaches', 'training', 'matchday', 'publish_training'],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
  operational: { player: { groups: dual ? [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }] : [], defaultGroupId: dual ? GRP : null, mustChoose: false },
                 staff: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false } } });
/** ctl.teamsDelay: ms the Match Centre teams answer is held. ctl.api: every API path asked. */
function stubServer({ dual = false } = {}) {
  const ctl = { teamsDelay: 0, api: [] };
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    if (u.startsWith('/api/')) ctl.api.push(u.replace(/[?&](_t|ts|_)=\d+/g, ''));
    const send = (o, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/availability')) {
      if (u.includes('myResponse=1')) return send({ responses: { [SAT]: { response: 'available', reason: '' } } });
      const resolved = {}; PLAYERS.slice(0, 5).forEach(p => { resolved[p.userId] = { [SAT]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; });
      resolved.u_p5 = { [SAT]: { response: 'maybe' } }; resolved.u_p6 = { [SAT]: { response: 'unavailable', reason: 'work' } };
      return send({ resolved, roster: PLAYERS });
    }
    if (u.startsWith('/api/identity')) return send(sessionFor(dual));
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: FIXTURES });
    if (u.startsWith('/api/publish?resource=matchday-teams')) { const a = () => send({ ok: true, groups: [{ id: GRP, name: 'Seniors', status: 'active', developmentCategory: 'adult' }], teams: [{ id: 'team_1st', name: 'First XV', groupId: GRP }] }); return ctl.teamsDelay ? setTimeout(a, ctl.teamsDelay) : a(); }
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: GRP, canEdit: true });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players: PLAYERS });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: TEAM, name: 'Stub RFC', fixtures: FIXTURES } });
    if (u.startsWith('/api/chat?action=conversations')) return send({ ok: true, conversations: [{ id: 'dm_u1_u_p3', type: 'dm', participants: ['u1', 'u_p3'], otherUserId: 'u_p3', name: 'Player 3', lastMessage: { text: 'hi coach', at: new Date().toISOString(), from: 'u_p3' }, unread: 2, unreadCount: 2, updatedAt: new Date().toISOString() }] });
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
const seed = (extra) => ({ activeView: 'coach', activeCoachSection: 'overview', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' }], operationalGroupId: GRP, players: PLAYERS, fixtures: FIXTURES, messages: [], onboardingDismissed: true,
  availabilityRequests: [{ sessionId: SAT, status: 'sent', sentAt: '2026-09-22T09:00:00Z', groupId: GRP, clubId: TEAM, sentWeek: WEEK }], ...extra });
/**
 * Paint counts per section host, made DURING render() — what the gate decides.
 * (A loader that repaints its own screen directly when it lands, such as
 * loadAdminData → renderClubAdmin, is outside render() and outside this build.)
 */
const paintCounter = () => {
  window.__paints = {}; let depth = 0;
  const wrap = () => {
    if (typeof window.render !== 'function') { setTimeout(wrap, 0); return; }
    const orig = window.render;
    window.render = function () { depth++; try { return orig.apply(this, arguments); } finally { depth--; } };
  };
  wrap();
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get: d.get, set(v) {
    if (depth > 0 && this.classList && this.classList.contains('section')) window.__paints[this.id] = (window.__paints[this.id] || 0) + 1;
    return d.set.call(this, v);
  } });
};
const waitFor = async (fnc, ms, every = 60) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, every)); } };
const settled = page => waitFor(async () => { const a = JSON.stringify(await page.evaluate(() => window.__paints)); await new Promise(r => setTimeout(r, 500)); return a === JSON.stringify(await page.evaluate(() => window.__paints)); }, 15000, 40);
const JOURNEY = [['message', 'Availability'], ['players', 'Members'], ['training', 'Training'], ['matchday', 'Match Centre'], ['medical', 'Medical'], ['messages', 'Messages'], ['overview', 'Overview']];

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): Overview → Availability → Members → Training → Match Centre → Medical → Messages → back; only the section on show paints; loads, badge, board, Live Sync and late Match Centre data intact`, { timeout: 150000 }, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, ctl } = stubServer();
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    const open = async (s) => {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(x => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(x)), s);
      await ctx.addInitScript(paintCounter);
      const page = await ctx.newPage();
      const errors = [], consoleErrors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); });
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      return { ctx, page, errors, consoleErrors };
    };
    try {
      // ── Boot on the Overview, Match Centre teams answered late ──
      ctl.teamsDelay = 1500;
      let h = await open(seed({ activeCoachSection: 'overview' }));
      assert.ok(await waitFor(() => h.page.evaluate(() => (document.getElementById('coach-overview')?.innerHTML || '').length > 0), 15000), 'the Overview paints');
      assert.ok(await waitFor(() => h.page.evaluate(() => typeof _mcTeams !== 'undefined' && !!_mcTeams), 15000), 'the Match Centre teams load at boot though Match Centre is hidden');
      assert.ok(await settled(h.page));
      let paints = await h.page.evaluate(() => window.__paints);
      const hiddenPainted = Object.keys(paints).filter(id => !['coach-overview', 'coach-message', 'coach-messages', 'player-messages'].includes(id));
      assert.deepEqual(hiddenPainted, [], `no hidden section painted at boot (${JSON.stringify(paints)})`);
      assert.ok(ctl.api.some(u => u.startsWith('/api/availability?resolveRoster=1')), 'the Overview\'s board read happened');
      assert.equal(ctl.api.filter(u => u.startsWith('/api/availability?resolveRoster=1')).length, 1, 'once');
      assert.ok(ctl.api.some(u => u.startsWith('/api/publish?resource=training-schedule')), 'the training schedule loaded');
      assert.ok(await waitFor(() => h.page.evaluate(() => (document.querySelector('#coachNav .nav-badge') || {}).textContent === '2'), 6000), 'the Messages unread badge is shown at boot');
      // ── The journey ──
      for (const [s, label] of JOURNEY) {
        const before = await h.page.evaluate(() => ({ ...window.__paints }));
        await h.page.evaluate(x => setSection('coach', x), s);
        assert.ok(await waitFor(() => h.page.evaluate(x => document.getElementById('coach-' + x)?.classList.contains('active') && (document.getElementById('coach-' + x).innerHTML || '').length > 0, s), 10000), `${label}: on screen and painted`);
        assert.ok(await settled(h.page), `${label}: settles`);
        const st = await h.page.evaluate(x => ({ active: [...document.querySelectorAll('.section.active')].map(e => e.id), paints: window.__paints, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }), s);
        assert.deepEqual(st.active, ['coach-' + s], `${label}: the one active section`);
        const others = Object.keys(st.paints).filter(id => id !== 'coach-' + s && (st.paints[id] || 0) !== (before[id] || 0) && !['coach-messages', 'player-messages', 'coach-message', 'player-medical'].includes(id));
        assert.deepEqual(others, [], `${label}: no other section repainted while it was on show`);
        assert.equal(st.overflow, false, `${label}: no horizontal overflow`);
        if (s === 'message') {
          assert.ok(await waitFor(() => h.page.evaluate(() => document.querySelectorAll('#coach-message .msg-kpi').length === 4), 10000), 'Availability: the board');
          assert.deepEqual(await h.page.evaluate(() => [...document.querySelectorAll('#coach-message .msg-kpi')].map(e => e.innerText.replace(/\s+/g, ' ').trim())), ['AVAILABLE 5', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 11']);
          const reads = ctl.api.filter(u => u.startsWith('/api/availability?resolveRoster=1')).length;
          await h.page.evaluate(() => availRefreshNow());
          assert.ok(await waitFor(() => ctl.api.filter(u => u.startsWith('/api/availability?resolveRoster=1')).length === reads + 1, 10000), 'Live Sync: one read');
        }
        if (s === 'players') assert.ok(await h.page.evaluate(() => /Player 1\b/.test(document.getElementById('coach-players').innerText)), 'Members: the roster');
        if (s === 'matchday') assert.ok(await h.page.evaluate(() => typeof _mcTeams !== 'undefined' && !!_mcTeams && (document.getElementById('coach-matchday').innerHTML || '').length > 1000), 'Match Centre: painted with its teams');
        if (s === 'messages') {
          assert.ok(await waitFor(() => h.page.evaluate(() => !!document.getElementById('chatContactList') && /Player 3/.test(document.getElementById('chatContactList').innerText)), 10000), 'Messages: the conversation list, fetched on entry');
          assert.equal(await h.page.evaluate(() => document.getElementById('player-messages').innerHTML), '', 'the player chat shell stays empty');
        }
      }
      assert.deepEqual(h.errors, [], 'no page errors'); assert.deepEqual(h.consoleErrors, [], 'no console errors');
      await h.ctx.close();
      // ── A direct cold load into Availability: loading first (Build 110), one board read (Build 111) ──
      ctl.teamsDelay = 0; ctl.api.length = 0;
      h = await open(seed({ activeCoachSection: 'message' }));
      assert.ok(await waitFor(() => h.page.evaluate(() => document.querySelectorAll('#coach-message .msg-kpi').length === 4), 15000), 'the board');
      assert.ok(await settled(h.page));
      assert.equal(ctl.api.filter(u => u.startsWith('/api/availability?resolveRoster=1')).length, 1, 'one board read at boot');
      paints = await h.page.evaluate(() => window.__paints);
      assert.deepEqual(Object.keys(paints).filter(id => !['coach-message', 'coach-messages', 'player-messages'].includes(id)), [], `nothing else painted (${JSON.stringify(paints)})`);
      assert.deepEqual(h.errors, []); assert.deepEqual(h.consoleErrors, []);
      await h.ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}

test('browser (desktop): a dual-role member landing on player Home still gets the self-read and the board read at boot', { timeout: 90000 }, async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const { srv, ctl } = stubServer({ dual: true });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const players = PLAYERS.map((p, i) => i === 0 ? { ...p, userId: 'u1', name: 'Coach Player' } : p);
    await ctx.addInitScript(x => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(x)),
      seed({ activeView: 'player', activePlayerSection: 'home', players, users: [{ id: 'u1', name: 'Coach Player', email: 'c@s.test', role: 'coach', playerId: 'p0' }] }));
    await ctx.addInitScript(paintCounter);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
    assert.ok(await waitFor(() => ctl.api.some(u => u.includes('myResponse=1')), 15000), 'the player\'s own self-read, though Availability is hidden');
    assert.ok(await waitFor(() => ctl.api.some(u => u.startsWith('/api/availability?resolveRoster=1')), 15000), 'the board read, though the coach Overview is hidden');
    assert.ok(await waitFor(() => page.evaluate(() => _playerAvailKnown === true), 15000), 'the self-read landed');
    assert.ok(await settled(page));
    const p = await page.evaluate(() => window.__paints);
    assert.ok((p['player-home'] || 0) > 0, 'Home painted');
    assert.equal(p['player-availability'] || 0, 0, 'the hidden Availability screen did not');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
