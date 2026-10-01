/**
 * COACH AVAILABILITY BOARD — THE LOADING STATE (Build 110)
 *
 * Before its first read landed, the board painted "AVAILABLE 0 · MAYBE 0 ·
 * UNAVAILABLE 0 · NO REPLY 18" and eighteen "No reply" rows. None of that was
 * a result: the rows were built from local fields nobody had filled in while
 * the roster map was still null. A failed read already said so ("Availability
 * could not be loaded", Build 97). A read in flight now says so too.
 *
 * The board reads ONE state model — availabilityChaseContext (Build 104):
 *   unknown  — the read failed and no answers are held  → the error block (unchanged)
 *   loading  — the schedule, the fixture list or the first read has not landed
 *              → a loading block; no count, no row, no chip, no claim
 *   empty    — everything landed; no occurrence this week → the empty copy (unchanged)
 *   ready    — everything landed → the real counts and rows (unchanged)
 *
 * SANDBOX tests run the REAL renderer over stubs for its presentational
 * helpers, through a document shim that captures what it paints. BROWSER tests
 * run the real client in Chromium with a board read that is held until the
 * test releases it, on desktop and Pixel 5.
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
const SAT = 'fx_sat';

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX — the real renderer, painting into a captured document
// ═══════════════════════════════════════════════════════════════════════════
const P = (i, extra = {}) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', ...extra });
/**
 * One coach device looking at the board.
 *   resolved     — the roster map the board read landed (null = none landed)
 *   sync         — a read has landed (sets _availLastSync)
 *   readFailed   — the last read failed
 *   schedule     — the training schedule (null = not landed)
 *   fixtures     — the group's fixtures; fixturesKnown — the list is confirmed
 */
function board({ players = Array.from({ length: 18 }, (_, i) => P(i)), resolved = null, sync = false, readFailed = false,
                 schedule = { slots: [] }, fixtures = [{ id: SAT, groupId: 'grp_sen', opposition: 'Kituro', date: MATCH_DAY, kickoffTime: '14:00', status: 'scheduled' }],
                 fixturesKnown = true, selectedPlayerId = null } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const painted = {};
    const document = { getElementById: id => ({ set innerHTML(v) { painted[id] = v; }, get innerHTML() { return painted[id] || ''; } }), querySelector: () => null, querySelectorAll: () => [] };
    let _clubContextId = 'team_home';
    let state = { operationalGroupId: 'grp_sen', players: CFG.players, fixtures: CFG.fixtures, schedule: [], messages: [], availabilityRequests: [],
                  matchCentre: {}, trainingBlocks: {}, activeView: 'coach', activeCoachSection: 'message', selectedMessagePlayerId: CFG.selectedPlayerId,
                  autoSendSchedule: null, messageDetail: '${SAT}', availWeekOffset: 0 };
    let _resolvedAvailability = CFG.resolved || {}, _resolvedAvailabilityGroup = 'grp_sen';   // the app initialises the map to {}; "landed" is the sync stamp
    let _availLastSync = CFG.sync ? new Date().toISOString() : null;
    let _availReadFailed = CFG.readFailed;
    let _trainingSchedule = CFG.schedule, _trainingScheduleGroupId = 'grp_sen', _trainingScheduleAttempted = false;
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
    function fixturesKnown() { return CFG.fixturesKnown; }
    function availabilityPendingFor() { return null; }
    function coachAvailWeek() { return availWeekStart(availToday()); }
    function sortAvailabilityRows(rows) { return rows; } function availabilityRowMatchesFilter() { return true; }
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
    ${fn('coachAvailEvents')} ${fn('coachSelectedEvent')}
    ${fn('renderMessageCenterV2')}
    return {
      paint: () => { renderMessageCenterV2(); return painted['coach-message'] || ''; },
      land: (resolved) => { _resolvedAvailability = resolved || {}; _availLastSync = new Date().toISOString(); _availReadFailed = false; },
      fail: () => { _availReadFailed = true; },
      status: () => availabilityChaseContext(coachAvailWeek()).status,
    };
  `;
  return new Function(body)({ players, resolved, sync, readFailed, schedule, fixtures, fixturesKnown, selectedPlayerId });
}
/** What the painted board claims. */
function read(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const kpi = [...html.matchAll(/<article class="msg-kpi ([a-z-]+)"><span>([^<]*)<\/span><strong>(\d+)<\/strong>/g)].map(m => `${m[2]} ${m[3]}`);
  return {
    kpi, text,
    loading: /Loading availability…/.test(html), error: /Availability could not be loaded/.test(html),
    noReplyChips: (html.match(/class="msg-chip no-reply">No reply</g) || []).length,
    rows: (html.match(/class="msg-player-row/g) || []).length,
    availableChips: (html.match(/class="msg-chip available">Available</g) || []).length,
    maybeChips: (html.match(/class="msg-chip maybe">Maybe</g) || []).length,
    unavailableChips: (html.match(/class="msg-chip unavailable">Unavailable</g) || []).length,
    shown: (html.match(/(\d+)\/(\d+) shown/) || [undefined])[0],
    sessionChip: (html.match(/<span class="msg-chip[^"]*">([^<]*)<\/span>\s*<\/div>\s*<small style="color:var\(--muted\)">/) || [])[1],
    strip: (text.match(/\d+ \/ \d+ replied to all sessions|\d+ to chase|Chase all|All replied/g) || []),
    filters: /availability-filter-group/.test(html), detail: /class="detail"/.test(html), pills: /msg-pill-row/.test(html),
    nothingScheduled: /Nothing scheduled this week/.test(html),
  };
}
const RESOLVED = () => { const r = {}; for (let i = 0; i < 5; i++) r['u_p' + i] = { [SAT]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; r.u_p5 = { [SAT]: { response: 'maybe' } }; r.u_p6 = { [SAT]: { response: 'unavailable', reason: 'work' } }; return r; };

test('LOADING — before the first read lands the board claims nothing: no count, no "No reply" row, no chip, no strip', () => {
  const b = board({ resolved: null, sync: false });
  assert.equal(b.status(), 'loading');
  const r = read(b.paint());
  assert.equal(r.loading, true, 'the loading block is on screen');
  assert.deepEqual(r.kpi, [], 'no KPI tile — not "NO REPLY 18", not "AVAILABLE 0"');
  assert.equal(r.rows, 0, 'no player rows'); assert.equal(r.noReplyChips, 0, 'no "No reply" chip anywhere');
  assert.equal(r.shown, undefined, 'no "N/18 shown"'); assert.equal(r.filters, false, 'no filter counts');
  assert.equal(r.sessionChip, '—', 'the session card shows "—", as it does for a failed read');
  assert.equal(r.pills, false, 'and no ✓ ✗ ? — pill row under it');
  assert.deepEqual(r.strip, [], 'no week strip claim');
  assert.doesNotMatch(r.text, /No reply \d|\d+ to chase/, 'nothing reads as a result');
  assert.equal(r.error, false, 'and it is not presented as an error');
});

test('LOADING — the schedule or the fixture list not having landed is loading too, even with a roster map', () => {
  for (const [why, cfg] of [['no schedule', { resolved: RESOLVED(), sync: true, schedule: null }], ['fixtures unknown', { resolved: RESOLVED(), sync: true, fixturesKnown: false }]]) {
    const b = board(cfg);
    assert.equal(b.status(), 'loading', why);
    const r = read(b.paint());
    assert.equal(r.loading, true, why + ': loading block'); assert.deepEqual(r.kpi, [], why + ': no tiles'); assert.equal(r.rows, 0, why + ': no rows');
  }
});

test('UNKNOWN — a failed read is the error block, never a fabricated empty board', () => {
  const b = board({ resolved: null, sync: false, readFailed: true });
  assert.equal(b.status(), 'unknown');
  const r = read(b.paint());
  assert.equal(r.error, true); assert.equal(r.loading, false, 'a failure is not "loading"');
  assert.deepEqual(r.kpi, []); assert.equal(r.rows, 0); assert.equal(r.noReplyChips, 0); assert.deepEqual(r.strip, []);
  assert.equal(r.nothingScheduled, false, 'and not "nothing scheduled" either');
});

test('READY — once the read lands the real counts and rows appear, confirmed answers intact, confirmed absence as No reply', () => {
  const b = board({ resolved: RESOLVED(), sync: true });
  assert.equal(b.status(), 'ready');
  const r = read(b.paint());
  assert.equal(r.loading, false); assert.equal(r.error, false);
  assert.deepEqual(r.kpi, ['Available 5', 'Maybe 1', 'Unavailable 1', 'No reply 11']);
  assert.equal(r.rows, 18); assert.equal(r.availableChips, 5); assert.equal(r.maybeChips, 1); assert.equal(r.unavailableChips, 1); assert.equal(r.noReplyChips, 11, 'confirmed absence reads No reply');
  assert.equal(r.shown, '7/18 shown'); assert.equal(r.filters, true); assert.equal(r.sessionChip, '5/18'); assert.equal(r.pills, true);
  assert.deepEqual(r.strip, ['7 / 18 replied to all sessions', '11 to chase', 'Chase all']);
});

test('READY — a cleared week (the read landed with no answers at all) is an honest No reply for everyone, not loading', () => {
  const b = board({ resolved: {}, sync: true });
  assert.equal(b.status(), 'ready');
  const r = read(b.paint());
  assert.equal(r.loading, false);
  assert.deepEqual(r.kpi, ['Available 0', 'Maybe 0', 'Unavailable 0', 'No reply 18'], 'authoritative absence, after the read (Build 96)');
  assert.equal(r.noReplyChips, 18);
});

test('EMPTY — only after everything landed: no occurrence this week paints the empty copy, not a loading block and not zero tiles from nowhere', () => {
  const b = board({ resolved: {}, sync: true, fixtures: [{ id: 'fx_next', groupId: 'grp_sen', opposition: 'Next', date: APP.availAddDays(MATCH_DAY, 7), kickoffTime: '14:00', status: 'scheduled' }] });
  assert.equal(b.status(), 'empty');
  const r = read(b.paint());
  assert.equal(r.loading, false); assert.equal(r.error, false);
  assert.equal(r.nothingScheduled, true, 'the week is genuinely empty');
  assert.equal(r.rows, 0, 'no session, no rows'); assert.equal(r.noReplyChips, 0);
  // and the same inputs BEFORE the read landed are loading, not empty
  const before = board({ resolved: null, sync: false, fixtures: [{ id: 'fx_next', groupId: 'grp_sen', opposition: 'Next', date: APP.availAddDays(MATCH_DAY, 7), kickoffTime: '14:00', status: 'scheduled' }] });
  assert.equal(before.status(), 'loading'); assert.equal(read(before.paint()).loading, true);
});

test('TRANSITION — a delayed first read: loading, then ready with the same counts a fast read gives; a failure after loading is the error block', () => {
  const b = board({ resolved: null, sync: false });
  assert.equal(read(b.paint()).loading, true);
  b.land(RESOLVED());
  const r = read(b.paint());
  assert.equal(r.loading, false); assert.deepEqual(r.kpi, ['Available 5', 'Maybe 1', 'Unavailable 1', 'No reply 11']); assert.equal(r.rows, 18);
  const f = board({ resolved: null, sync: false });
  assert.equal(read(f.paint()).loading, true);
  f.fail();
  const e = read(f.paint());
  assert.equal(e.error, true); assert.equal(e.loading, false); assert.deepEqual(e.kpi, []);
});

test('the open player panel waits too: it would state "No reply" for a player nobody has read yet', () => {
  const loading = read(board({ resolved: null, sync: false, selectedPlayerId: 'p3' }).paint());
  assert.equal(loading.detail, false, 'hidden while loading');
  const ready = read(board({ resolved: RESOLVED(), sync: true, selectedPlayerId: 'p3' }).paint());
  assert.equal(ready.detail, true, 'shown once the read landed');
});

test('ONE state model: the board reads availabilityChaseContext, the existing error path is untouched, and the loading copy matches the house style', () => {
  const body = stripComments(fn('renderMessageCenterV2'));
  assert.match(body, /const availLoading\s*=\s*!availUnknown && typeof availabilityChaseContext === 'function'\s*&& availabilityChaseContext\(coachAvailWeek\(\)\)\.status === 'loading';/, 'loading is the chase context\'s word for it');
  assert.match(body, /const availPending\s*=\s*availUnknown \|\| availLoading;/);
  assert.match(body, /const availUnknown\s*=\s*availabilityReadUnknown\(\);/, 'the error question is unchanged');
  assert.match(body, /<strong>Loading availability…<\/strong>Reading this week's replies — nobody has been marked as "no reply" yet\./);
  assert.match(body, /class="ovw-empty avail-loading"/, 'the same empty-state shape the Overview uses');
  for (const site of ['${availPending ? \'—\' : `${yes}/${total}`}', 'width:${availPending ? 0 : pct}%', '${availPending ? \'\' : `<span class="msg-chip ${boardNoReply.length', '${availPending ? \'\' : `\n                <div class="availability-board-tools">', '!availPending ? "margin-top:14px"']) {
    assert.ok(fn('renderMessageCenterV2').includes(site), 'withheld while pending: ' + site.slice(0, 40));
  }
  assert.doesNotMatch(stripComments(fn('sessionRows')), /availLoading|availabilityChaseContext/, 'sessionRows (Build 96) is untouched');
  assert.doesNotMatch(body, /fetch\(|refreshLiveAvailability\(/, 'the renderer still fetches nothing');
});

// ═══════════════════════════════════════════════════════════════════════════
// BROWSER — the real client, a board read held until released
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
/** A stub server whose board read waits on a gate the test controls: hold() → release() | fail(). */
function boardServer() {
  const ctl = { gate: null, mode: 'ok', reads: [] };
  const srv = http.createServer(async (req, res) => {
    const u = req.url || '/';
    const send = (o, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/availability')) {
      ctl.reads.push(Date.now());
      if (ctl.gate) await ctl.gate;
      if (ctl.mode === 'fail') return send({ error: 'boom' }, 500);
      const resolved = {}; PLAYERS.slice(0, 5).forEach(p => { resolved[p.userId] = { [SAT]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; });
      resolved.u_p5 = { [SAT]: { response: 'maybe' } }; resolved.u_p6 = { [SAT]: { response: 'unavailable', reason: 'work' } };
      return send({ resolved, roster: PLAYERS });
    }
    if (u.startsWith('/api/identity')) return send(SESSION);
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: FIXTURES });
    if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: GRP, name: 'Seniors', status: 'active' }], teams: [] });
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: GRP, canEdit: true });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players: PLAYERS });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: TEAM, name: 'Stub RFC', fixtures: FIXTURES } });
    if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [] });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  let release = () => {};
  ctl.hold = () => { ctl.gate = new Promise(r => { release = r; }); };
  ctl.release = () => { release(); ctl.gate = null; };
  return { srv, ctl };
}
const SEED = { activeView: 'coach', activeCoachSection: 'message', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' }], operationalGroupId: GRP, players: PLAYERS, fixtures: FIXTURES, messages: [], onboardingDismissed: true,
  availabilityRequests: [{ sessionId: SAT, status: 'sent', sentAt: '2026-09-22T09:00:00Z', groupId: GRP, clubId: TEAM, sentWeek: WEEK }] };
const boardState = () => ({
  kpi: [...document.querySelectorAll('#coach-message .msg-kpi')].map(e => e.innerText.replace(/\s+/g, ' ').trim()),
  rows: document.querySelectorAll('#coach-message .msg-player-row').length,
  noReplyChips: [...document.querySelectorAll('#coach-message .msg-chip.no-reply')].filter(e => /No reply/.test(e.innerText)).length,
  loading: !!document.querySelector('#coach-message .avail-loading'),
  error: /Availability could not be loaded/.test(document.getElementById('coach-message')?.innerText || ''),
  claims: [...document.querySelectorAll('#coach-message *')].filter(e => e.children.length === 0 && e.offsetParent !== null && /No reply \d|\d+ to chase|Chase all|replied to all/i.test(e.innerText || '')).map(e => (e.innerText || '').trim().slice(0, 30)),
  status: typeof availabilityChaseContext === 'function' ? availabilityChaseContext().status : '?',
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
});
const waitFor = async (fnc, ms, every = 80) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await fnc(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, every)); } };

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): a held first read paints the loading block and no claim; released, the real board; a fast read is unchanged; a failed read is the error block`, { timeout: 120000 }, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, ctl } = boardServer();
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    const open = async () => {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)), SEED);
      const page = await ctx.newPage();
      const errors = [], consoleErrors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 160)); });
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      return { ctx, page, errors, consoleErrors };
    };
    try {
      // 1–4. The first read is HELD: the board must say it is loading and claim nothing.
      ctl.hold();
      let h = await open();
      assert.ok(await waitFor(() => h.page.evaluate(() => !!document.querySelector('#coach-message .avail-loading')), 15000), 'the loading block appears');
      // The loading block is the hub's FIRST paint, before any read has left:
      // the board read leaves only after the identity link's own fetch. Under
      // suite load that gap outlasted the check, so wait for the request to
      // reach the stub (the server-side signal) before asserting it left.
      assert.ok(await waitFor(() => ctl.reads.length >= 1, 15000), 'the board read reaches the stub');
      assert.ok(ctl.reads.length >= 1, 'the board read left');
      assert.ok(await h.page.evaluate(() => !!document.querySelector('#coach-message .avail-loading')), 'and the board is still loading while the read is held');
      let s = await h.page.evaluate(boardState);
      assert.equal(s.status, 'loading');
      assert.deepEqual(s.kpi, [], 'no KPI tiles while loading: ' + JSON.stringify(s.kpi));
      assert.equal(s.rows, 0, 'no roster rows'); assert.equal(s.noReplyChips, 0, 'no "No reply" chip');
      assert.deepEqual(s.claims, [], 'no claim of any kind');
      assert.equal(s.error, false);
      // 5–7. Released: the real KPI values and roster states.
      ctl.release();
      assert.ok(await waitFor(() => h.page.evaluate(() => document.querySelectorAll('#coach-message .msg-kpi').length === 4), 15000), 'the real board arrives');
      s = await h.page.evaluate(boardState);
      assert.deepEqual(s.kpi, ['AVAILABLE 5', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 11']);
      assert.equal(s.rows, 18); assert.equal(s.noReplyChips, 11); assert.equal(s.loading, false);
      assert.ok(s.claims.includes('11 to chase') && s.claims.includes('Chase all'), 'the week strip returns with the read: ' + JSON.stringify(s.claims));
      assert.equal(s.overflow, false, 'no horizontal overflow');
      assert.deepEqual(h.errors, [], 'no page errors'); assert.deepEqual(h.consoleErrors, [], 'no console errors');
      await h.ctx.close();
      // 8. The normal fast path: the same final board, with no loading block left behind.
      const before = ctl.reads.length;
      h = await open();
      assert.ok(await waitFor(() => h.page.evaluate(() => document.querySelectorAll('#coach-message .msg-kpi').length === 4), 15000), 'fast path: the real board');
      s = await h.page.evaluate(boardState);
      assert.deepEqual(s.kpi, ['AVAILABLE 5', 'MAYBE 1', 'UNAVAILABLE 1', 'NO REPLY 11']); assert.equal(s.loading, false); assert.equal(s.rows, 18);
      assert.ok(ctl.reads.length - before <= 2, `no extra board reads from the loading state (${ctl.reads.length - before})`);
      assert.deepEqual(h.errors, []); assert.deepEqual(h.consoleErrors, []);
      await h.ctx.close();
      // A failed first read is the error block — not loading, not an empty board.
      ctl.mode = 'fail';
      h = await open();
      assert.ok(await waitFor(() => h.page.evaluate(() => /Availability could not be loaded/.test(document.getElementById('coach-message')?.innerText || '')), 15000), 'the error block');
      s = await h.page.evaluate(boardState);
      assert.equal(s.loading, false); assert.deepEqual(s.kpi, []); assert.equal(s.rows, 0); assert.deepEqual(s.claims, []);
      assert.deepEqual(h.errors, []);
      await h.ctx.close();
    } finally { ctl.release(); await browser.close(); srv.close(); }
  });
}
