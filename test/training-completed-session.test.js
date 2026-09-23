/**
 * A training session becomes a read-only COMPLETED session once its
 * scheduled start has passed.
 *
 * The rule is the scheduled moment, not the calendar day:
 *
 *     completed  ⇔  scheduledDateTime < now
 *
 * so Tuesday's 19:00 session is finished by Tuesday 19:30 while Tuesday's
 * 20:30 session is still being planned. "date < today" would have locked
 * both of them at midnight and neither of them during the day.
 *
 * Nothing is stored. There is no `status: 'completed'` anywhere: the
 * scheduled time and the clock already hold the truth, and writing it back
 * would be a mutation with no reader.
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

const SLOTS = [
  { id: 'slot_tue', day: 'Tue', startTime: '19:00', venue: 'Main pitch', active: true, sessionId: 'tue' },
  { id: 'slot_thu', day: 'Thu', startTime: '20:30', venue: 'Back pitch', active: true, sessionId: 'thu' },
];

/** The predicate, with the real date/identity helpers around it. */
function scope({ slots = SLOTS, schedule = [], blocks = {}, today = '2026-09-23' } = {}) {
  return new Function(`"use strict";
    let _trainingSchedule = ${JSON.stringify({ slots })};
    let _trainingScheduleGroupId = 'g1';
    const state = { schedule: ${JSON.stringify(schedule)}, trainingBlocks: ${JSON.stringify(blocks)} };
    const AVAIL_DAY_INDEX = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
    function availToday() { return ${JSON.stringify(today)}; }
    function trainingGroupParam() { return 'g1'; }
    ${fn('esc')}
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    ${fn('availSlotDateInWeek')}
    ${fn('trainingDateLabel')}
    ${fn('trainingMonthLabel')}
    ${fn('trainingDateFromSessionId')}
    ${fn('trainingOccurrenceTitle')}
    ${fn('trainingOccurrenceLongLabel')}
    ${fn('trainingProtocolId')}
    ${fn('trainingContentKey')}
    ${fn('coachTrainingSessionLabel')}
    ${fn('isPreGameTrainingSession')}
    ${fn('trainingScheduledStartAt')}
    ${fn('isTrainingSessionCompleted')}
    ${fn('trainingEditingLocked')}
    ${fn('trainingCompletedSessionHTML')}
    return { state, trainingScheduledStartAt, isTrainingSessionCompleted, trainingEditingLocked,
             trainingCompletedSessionHTML, trainingContentKey };
  `)();
}

const at = (iso, hh, mm) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, hh, mm, 0, 0); };
const TUE = '2026-09-22', WED = '2026-09-23', THU = '2026-09-24';

// ── the rule ──────────────────────────────────────────────────────────────
test('1. a future session is not completed', () => {
  const s = scope();
  const sess = { id: 'slot_tue-20260929', date: '2026-09-29', startTime: '19:00' };
  assert.equal(s.isTrainingSessionCompleted(sess, at(WED, 12, 0)), false, 'next week is not finished');
  assert.equal(s.isTrainingSessionCompleted({ id: 'slot_thu-20260924', startTime: '20:30' }, at(WED, 23, 59)), false,
    "tomorrow's session is not finished at midnight tonight");
});

test('2. a session exactly at its scheduled start is still editable', () => {
  const s = scope();
  const sess = { id: 'slot_tue-20260922', startTime: '19:00' };
  assert.equal(s.isTrainingSessionCompleted(sess, at(TUE, 19, 0)), false, 'the rule is strictly BEFORE now');
  // One minute either side of the boundary.
  assert.equal(s.isTrainingSessionCompleted(sess, at(TUE, 18, 59)), false);
  assert.equal(s.isTrainingSessionCompleted(sess, at(TUE, 19, 1)), true);
});

test('3. a session whose start has passed is completed', () => {
  const s = scope();
  assert.equal(s.isTrainingSessionCompleted({ id: 'slot_tue-20260922', startTime: '19:00' }, at(TUE, 19, 30)), true);
});

test('4. a previous-day session is completed', () => {
  const s = scope();
  assert.equal(s.isTrainingSessionCompleted({ id: 'slot_tue-20260922', startTime: '19:00' }, at(WED, 9, 0)), true);
});

test('5. a LATER session on the same day is still editable — the whole point of the rule', () => {
  const s = scope();
  const early = { id: 'slot_tue-20260922', startTime: '17:45' };
  const late  = { id: 'slot_tue-20260922', startTime: '20:30' };
  const now   = at(TUE, 18, 30);
  assert.equal(s.isTrainingSessionCompleted(early, now), true,  'the 17:45 session has started');
  assert.equal(s.isTrainingSessionCompleted(late, now),  false, 'the 20:30 session has not — "date < today" would have locked it');
});

test('the start time comes from the row, then the slot, and junk is ignored', () => {
  const s = scope();
  // No time on the row → the slot's own 19:00.
  assert.equal(s.isTrainingSessionCompleted({ id: 'slot_tue-20260922' }, at(TUE, 19, 30)), true);
  assert.equal(s.isTrainingSessionCompleted({ id: 'slot_tue-20260922' }, at(TUE, 18, 30)), false);
  // The row wins over the slot when it has a real time.
  assert.equal(s.isTrainingSessionCompleted({ id: 'slot_tue-20260922', startTime: '21:00' }, at(TUE, 19, 30)), false);
  // Junk times ("19.45" is real production data) fall back, never parse.
  assert.equal(s.isTrainingSessionCompleted({ id: 'slot_thu-20260924', startTime: '19.45' }, at(THU, 20, 0)), false,
    "junk falls back to the slot's 20:30, which has not started");
  assert.equal(s.isTrainingSessionCompleted({ id: 'slot_thu-20260924', startTime: '19.45' }, at(THU, 21, 0)), true);
});

test('with no scheduled time at all, the session stays editable until its day is over', () => {
  const s = scope({ slots: [{ id: 'slot_wed', day: 'Wed', startTime: '', venue: '', active: true }] });
  const sess = { id: 'slot_wed-20260923' };
  assert.equal(s.isTrainingSessionCompleted(sess, at(WED, 23, 59)), false, 'still its day — never locked early');
  assert.equal(s.isTrainingSessionCompleted(sess, at(THU, 0, 1)), true, 'the day it was held is over');
});

test('a session with no resolvable date is NEVER completed (fail open — editing is never taken away on a guess)', () => {
  const s = scope();
  for (const sess of [{ id: 'sess-adhoc' }, { id: 'sess-adhoc', date: '' }, { id: 'sess-adhoc', date: '19.45' },
                      { id: '' }, null, undefined]) {
    assert.equal(s.isTrainingSessionCompleted(sess, at(THU, 12, 0)), false, JSON.stringify(sess));
  }
});

test('a current-week recurring session resolves its date through the content key', () => {
  // The planner's current-week id is the bare 'tue'; the occurrence it means
  // is this week's Tuesday, which is what decides whether it is finished.
  const s = scope({ today: WED });
  assert.equal(s.trainingContentKey('tue'), 'slot_tue-20260922');
  assert.equal(s.isTrainingSessionCompleted({ id: 'tue', startTime: '19:00' }, at(WED, 9, 0)), true,
    "Tuesday's session is finished by Wednesday morning");
  assert.equal(s.isTrainingSessionCompleted({ id: 'thu', startTime: '20:30' }, at(WED, 9, 0)), false,
    'Thursday is still ahead');
});

test('the scheduled moment is the local wall clock the session was written in', () => {
  const s = scope();
  const d = s.trainingScheduledStartAt({ id: 'slot_tue-20260922', startTime: '19:00' });
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8);
  assert.equal(d.getDate(), 22);
  assert.equal(d.getHours(), 19, 'no timezone conversion is applied to a wall-clock time');
  assert.equal(d.getMinutes(), 0);
  assert.equal(s.trainingScheduledStartAt({ id: 'nope' }), null);
});

// ── the completed view ────────────────────────────────────────────────────
const DONE = { id: 'slot_tue-20260922', title: 'Forwards session', date: TUE, startTime: '19:00',
               location: 'Main pitch', published: true };
const BLOCKS = [
  { id: 'b1', time: '19:00', activity: 'Warm-up', keyFocus: 'Ankles', coach: 'Ana' },
  { id: 'b2', time: '19:20', activity: 'Scrum shape', keyFocus: 'Body height', coach: 'Ben' },
  { id: 'b3', time: '19:50', activity: 'Lineout', tag: 'Set piece', coach: '' },
];
const vis = html => String(html).replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('6. the completed view shows what the session WAS', () => {
  const s = scope({ blocks: { 'slot_tue-20260922': BLOCKS } });
  const t = vis(s.trainingCompletedSessionHTML(DONE, 'slot_tue-20260922'));
  assert.match(t, /Completed session/i, 'it says what it is');
  assert.match(t, /Forwards session/, 'title');
  assert.match(t, /Tuesday 22 September 2026/, 'the date it was held');
  assert.match(t, /19:00/, 'start time');
  assert.match(t, /Main pitch/, 'venue');
  assert.match(t, /Published/, 'whether it had been published');
});

test('9 + 10. every block, focus and coach survives into the completed view', () => {
  const s = scope({ blocks: { 'slot_tue-20260922': BLOCKS } });
  const t = vis(s.trainingCompletedSessionHTML(DONE, 'slot_tue-20260922'));
  for (const b of BLOCKS) {
    assert.match(t, new RegExp(b.activity), 'activity ' + b.activity);
    assert.match(t, new RegExp(b.time), 'time ' + b.time);
  }
  assert.match(t, /Ankles/); assert.match(t, /Body height/); assert.match(t, /Set piece/,
    'a block carrying only the legacy tag still shows its focus');
  assert.match(t, /Ana/); assert.match(t, /Ben/);
  assert.match(t, /3 blocks/, 'and it summarises the session at a glance');
});

test('11. an empty or partial session does not crash the completed view', () => {
  const s = scope();
  const empty = vis(s.trainingCompletedSessionHTML(DONE, 'slot_tue-20260922'));
  assert.match(empty, /No session plan was recorded/i, 'an honest empty state, not a blank card');
  assert.match(empty, /Forwards session/, 'the session is still named');
  // Missing everything a block could be missing.
  const s2 = scope({ blocks: { k: [{ id: 'b1' }, {}, null] } });
  const bare = s2.trainingCompletedSessionHTML({ id: 'k' }, 'k');
  assert.ok(bare.length > 0, 'it renders');
  assert.doesNotMatch(vis(bare), /undefined|null|NaN|\[object/, 'and never paints a placeholder value');
  // No session object at all.
  assert.ok(s.trainingCompletedSessionHTML(null, '').length > 0, 'even with nothing to show');
});

test('7. the completed view carries no editable control whatsoever', () => {
  const s = scope({ blocks: { 'slot_tue-20260922': BLOCKS } });
  const html = s.trainingCompletedSessionHTML(DONE, 'slot_tue-20260922');
  for (const tag of [/<input/i, /<textarea/i, /<select/i, /contenteditable/i]) {
    assert.doesNotMatch(html, tag, `no ${tag} in a completed session`);
  }
  for (const handler of ['addTimeBlock', 'updateTimeBlock', 'removeTimeBlock', 'trainingMoveBlock',
                         'trainingInsertBlockAt', 'trainingPublishTo', 'autopilotDuplicateSession',
                         'trainingImportPanel', 'trainingScheduleUpdateField', 'tpSavePing']) {
    assert.ok(!html.includes(handler), `no route to ${handler}()`);
  }
  // The one action it may offer is reading the plan back out.
  assert.match(html, /trainingDownloadPdf/, 'the PDF of a finished session is still useful');
});

// ── the planner gate ──────────────────────────────────────────────────────
test('7 + 12. renderTraining picks the completed view, and leaves the editable one alone', () => {
  const r = fn('renderTraining');
  assert.match(r, /isTrainingSessionCompleted\(/, 'the planner asks the one predicate');
  assert.match(r, /trainingCompletedSessionHTML\(/, 'and renders the completed view from it');
  // The editable planner is still there, behind the gate — not deleted.
  assert.match(r, /addTimeBlock\('\$\{ck\}'\)/, 'the editable planner is unchanged for a live session');
  assert.match(r, /trainingImportPanelHTML\(ck\)/);
  assert.match(r, /trainingPublishTo\('\$\{sessId\}'/);
  // Nothing is WRITTEN to say "completed" — the schedule and the clock say it.
  // Every function this build owns is a pure read.
  for (const name of ['trainingScheduledStartAt', 'isTrainingSessionCompleted',
                      'trainingEditingLocked', 'trainingCompletedSessionHTML']) {
    const body = fn(name);
    for (const write of [/saveState\s*\(/, /syncSessionsToServer/, /fetch\s*\(/, /\bstate\.[A-Za-z]+\s*=/, /localStorage/]) {
      assert.doesNotMatch(body, write, `${name} must not write anything (${write})`);
    }
  }
  assert.doesNotMatch(r, /\.completed\s*=|completed:\s*true|status\s*=\s*'completed'/,
    'the planner stores no completion flag on a session');
});

// ── 8. mutations refuse a completed occurrence ────────────────────────────
function mutScope({ today = WED, blocks, schedule = [] } = {}) {
  return new Function(`"use strict";
    let _trainingSchedule = ${JSON.stringify({ slots: SLOTS })};
    let _trainingScheduleGroupId = 'g1';
    let saved = 0, toasts = [], rendered = 0;
    const state = { schedule: ${JSON.stringify(schedule)}, trainingBlocks: ${JSON.stringify(blocks)} };
    const AVAIL_DAY_INDEX = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
    const document = { querySelector: () => null };
    const CSS = { escape: s => s };
    function availToday() { return ${JSON.stringify(today)}; }
    function trainingGroupParam() { return 'g1'; }
    function saveState() { saved++; }
    function showToast(m) { toasts.push(m); }
    function renderTraining() { rendered++; }
    function trainingRefreshMoveButtons() {}
    function trainingAutosizeBlocks() {}
    function trainingFocusBlock() {}
    function syncPublishedSessionEdit() {}
    function trainingNewBlock(id, prev) { return { id: 'new', time: '', activity: '' }; }
    function trainingInsertRowHTML() { return ''; }
    function trainingBlockRowHTML() { return ''; }
    ${fn('trainingDateLabel')}
    ${fn('trainingDateFromSessionId')}
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    ${fn('availSlotDateInWeek')}
    ${fn('trainingProtocolId')}
    ${fn('trainingContentKey')}
    ${fn('trainingScheduledStartAt')}
    ${fn('isTrainingSessionCompleted')}
    ${fn('trainingEditingLocked')}
    ${fn('addTimeBlock')}
    ${fn('updateTimeBlock')}
    ${fn('removeTimeBlock')}
    ${fn('trainingMoveBlock')}
    return { state, addTimeBlock, updateTimeBlock, removeTimeBlock, trainingMoveBlock,
             counts: () => ({ saved, toasts, rendered }) };
  `)();
}

test('8. a completed occurrence refuses every planner mutation', () => {
  const PAST = 'slot_tue-20260922';                       // Tuesday, and today is Wednesday
  const m = mutScope({ blocks: { [PAST]: JSON.parse(JSON.stringify(BLOCKS)) } });
  const before = JSON.stringify(m.state.trainingBlocks[PAST]);

  m.addTimeBlock(PAST);
  m.updateTimeBlock(PAST, 'b1', 'activity', 'HACKED');
  m.removeTimeBlock(PAST, 'b2');
  const moved = m.trainingMoveBlock(PAST, 'b1', 1);

  assert.equal(JSON.stringify(m.state.trainingBlocks[PAST]), before, 'the recorded plan is untouched');
  assert.equal(moved, false, 'a move reports that it did not happen');
  assert.equal(m.counts().saved, 0, 'nothing was written to the device');
});

test('12. a live session saves exactly as before', () => {
  const FUT = 'slot_thu-20260924';                        // Thursday 20:30, today is Wednesday
  const m = mutScope({ blocks: { [FUT]: JSON.parse(JSON.stringify(BLOCKS)) } });

  m.addTimeBlock(FUT);
  assert.equal(m.state.trainingBlocks[FUT].length, 4, 'a block is added');
  m.updateTimeBlock(FUT, 'b1', 'activity', 'Warm-up (long)');
  assert.equal(m.state.trainingBlocks[FUT][0].activity, 'Warm-up (long)', 'an edit lands');
  m.removeTimeBlock(FUT, 'b2');
  assert.equal(m.state.trainingBlocks[FUT].length, 3, 'a block is removed');
  assert.equal(m.trainingMoveBlock(FUT, 'b1', 1), true, 'and blocks reorder');
  assert.ok(m.counts().saved >= 3, 'each change is saved');

  // An undated ad-hoc session is unaffected too — it has no scheduled moment.
  const a = mutScope({ blocks: { 'sess-1': [] } });
  a.addTimeBlock('sess-1');
  assert.equal(a.state.trainingBlocks['sess-1'].length, 1);
});

test('8. the lock is asked about the occurrence, never the calendar day', () => {
  const m = mutScope({ blocks: {} });
  // Same Tuesday, two sessions: only the one that has started is locked.
  const s = scope({ today: TUE });
  assert.equal(s.trainingEditingLocked('slot_tue-20260922'), true, 'resolved against the real clock, past date');
  assert.equal(s.trainingEditingLocked('slot_tue-20270922'), false, 'a future occurrence is open');
  assert.equal(s.trainingEditingLocked(''), false);
  assert.equal(s.trainingEditingLocked('sess-adhoc'), false, 'no date, no lock');
});

// ── the real planner ──────────────────────────────────────────────────────
// The clock is installed by Playwright, so "has this session started?" is
// asked against a time the test chose rather than whenever it happens to run.
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

const GRP = 'grp_tp', TEAM = 'team_stub';
const B_TUE = '2026-09-22', B_WED = '2026-09-23', B_THU = '2026-09-24';
const B_SLOTS = [
  { id: 'slot_tue', day: 'Tue', startTime: '19:00', venue: 'Main pitch', active: true, sessionId: 'tue' },
  { id: 'slot_thu', day: 'Thu', startTime: '20:30', venue: 'Back pitch', active: true, sessionId: 'thu' },
];
const B_SESSION = { ok: true, user: { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
  permissions: ['reports', 'messaging', 'manage_players', 'manage_coaches', 'training', 'matchday', 'publish_training'],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
  operational: { player: { groups: [], defaultGroupId: null, mustChoose: false },
                 staff: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false } } };

function plannerServer() {
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    const send = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/identity')) return send(B_SESSION);
    if (u.startsWith('/api/availability')) return send({ resolved: {}, roster: [] });
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: [] });
    if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: GRP, name: 'Seniors', status: 'active' }], teams: [] });
    // Slots at the TOP level — the shape the real handler answers with.
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: B_SLOTS, groupId: GRP, canEdit: true });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players: [] });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: TEAM, name: 'Stub RFC' } });
    if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [] });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  return srv;
}

const B_BLOCKS = [
  { id: 'b1', time: '19:00', activity: 'Warm-up', keyFocus: 'Ankles', coach: 'Ana', tag: 'Warm-up' },
  { id: 'b2', time: '19:20', activity: 'Scrum shape', keyFocus: 'Body height', coach: 'Ben', tag: 'Set piece' },
];
const B_SEED = {
  activeView: 'coach', activeSection: 'training', activeTrainingTab: 'planner',
  stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1', operationalGroupId: GRP,
  users: [{ id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' }],
  players: [], fixtures: [], messages: [], onboardingDismissed: true,
};
// Applied AFTER boot: the app seeds its own default schedule over whatever
// localStorage held, so a fixture planted there never survives to the planner.
const B_SCHEDULE = [
  { id: 'tue', type: 'Training', title: 'Forwards session', date: B_TUE, startTime: '19:00', location: 'Main pitch', published: true },
  { id: 'thu', type: 'Training', title: 'Backs session',    date: B_THU, startTime: '20:30', location: 'Back pitch', published: false },
];
const B_PLANS = { 'slot_tue-20260922': B_BLOCKS, 'slot_thu-20260924': B_BLOCKS };

/** Every context/server opened, so a failed assertion still releases them. */
const OPEN = [];
async function closeAll() { while (OPEN.length) { const o = OPEN.pop(); try { await o.ctx.close(); } catch {} try { o.srv.close(); } catch {} } }

/** Open the planner with the clock fixed at `when`, on the session `sessId`. */
async function planner(browser, view, when, sessId) {
  const srv = plannerServer();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const ctx = await browser.newContext({
    ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }),
    serviceWorkers: 'block', timezoneId: 'Europe/Brussels' });
  await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)), B_SEED);
  const page = await ctx.newPage();
  // setFixedTime, not install(): only Date/now is overridden, so the app's
  // own timers and Playwright's polling keep running.
  await page.clock.setFixedTime(when);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const requests = []; page.on('request', r => requests.push(r.url()));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /Training/.test(document.getElementById('coach-training')?.innerText || ''), null, { timeout: 20000 });
  await page.evaluate(d => { state.schedule = d.sched; state.trainingBlocks = d.plans; saveState(); },
                      { sched: B_SCHEDULE, plans: B_PLANS });
  if (sessId) await page.evaluate(id => setTrainingSession(id), sessId);
  await page.evaluate(() => renderTraining());
  await page.waitForTimeout(250);
  const text = () => page.evaluate(() => (document.getElementById('coach-training')?.innerText || '').replace(/\s+/g, ' '));
  const handle = { page, ctx, srv, errors, requests, text,
                   close: async () => { await ctx.close(); srv.close(); OPEN.splice(OPEN.indexOf(handle), 1); } };
  OPEN.push(handle);
  return handle;
}
/** Is the EDITABLE planner on screen? Its controls, not its words.
 *  Scoped to the session-planning card: the page also carries the video and
 *  coaching-link forms (Beta-hidden furniture), which are not the planner. */
const editable = p => p.evaluate(() => {
  const root = document.getElementById('coach-training');
  const done = root.querySelector('.tp-done');
  const q = sel => root.querySelectorAll(sel).length;
  return {
    done: !!done,
    saveChip: !!root.querySelector('#tp-save-chip'),   // only the editable planner has one
    addBtn: q('button[onclick^="addTimeBlock"]'),
    table: q('.training-gs-table'),
    publish: q('button[onclick^="trainingPublishTo"]'),
    blockFields: q('.training-gs-table input, .training-gs-table textarea, .training-gs-table select'),
    fileInputs: q('input[type=file]'),
    doneFields: done ? done.querySelectorAll('input, textarea, select').length : -1,
    doneHandlers: done ? [...done.querySelectorAll('[onclick]')].map(e => e.getAttribute('onclick')) : [],
  };
});

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): a session flips to the completed view when its start passes`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    try {
      // A. FUTURE — Thursday's session, seen on Wednesday.
      let p = await planner(browser, view, new Date(`${B_WED}T09:00:00`), 'thu');
      let e = await editable(p.page);
      assert.ok(e.addBtn && e.table && e.blockFields > 0 && e.saveChip, 'the editable planner is on screen');
      assert.ok(!e.done, 'and no completed view');
      assert.deepEqual(p.errors, []);
      await p.close();

      // B. SAME DAY, BEFORE THE START — Thursday 20:30, seen at 18:00.
      p = await planner(browser, view, new Date(`${B_THU}T18:00:00`), 'thu');
      e = await editable(p.page);
      assert.ok(e.addBtn && e.blockFields > 0, 'still being planned right up to kick-off');
      assert.ok(!e.done);
      await p.close();

      // C. SAME DAY, AFTER THE START — the same session at 20:31.
      p = await planner(browser, view, new Date(`${B_THU}T20:31:00`), 'thu');
      e = await editable(p.page);
      assert.ok(e.done, 'the completed view has taken over');
      assert.equal(e.addBtn, 0, 'no Add block');
      assert.equal(e.table, 0, 'no editable block table');
      assert.equal(e.publish, 0, 'no publish action');
      assert.equal(e.fileInputs, 0, 'no plan import');
      assert.equal(e.saveChip, false, "and no save chip — nothing is being saved");
      assert.equal(e.doneFields, 0, 'the completed card holds no field of any kind');
      assert.ok(e.doneHandlers.every(h => /trainingDownloadPdf/.test(h)),
        'the only action it offers is reading the plan back out: ' + JSON.stringify(e.doneHandlers));
      await p.close();

      // D. PREVIOUS DAY — Tuesday's session, seen on Wednesday morning.
      p = await planner(browser, view, new Date(`${B_WED}T09:00:00`), 'tue');
      e = await editable(p.page);
      assert.ok(e.done && e.addBtn === 0 && e.doneFields === 0 && !e.saveChip, 'a past session is read-only');

      // E. CONTENT — the record is complete.
      const txt = await p.text();
      assert.match(txt, /Completed session/i);
      assert.match(txt, /Forwards session/, 'title');
      assert.match(txt, /Tuesday 22 September 2026/, 'date');
      assert.match(txt, /19:00/, 'start time');
      assert.match(txt, /Main pitch/, 'venue');
      assert.match(txt, /Published/, 'publication state');
      assert.match(txt, /Warm-up/); assert.match(txt, /Scrum shape/, 'activities');
      assert.match(txt, /Ankles/); assert.match(txt, /Body height/, 'key focus');
      assert.match(txt, /Ana/); assert.match(txt, /Ben/, 'lead coaches');
      assert.match(txt, /2 blocks/, 'the summary line');

      // F. NOTHING IN IT CAN MUTATE THE PLAN.
      const before = await p.page.evaluate(() => JSON.stringify(state.trainingBlocks));
      const clicked = await p.page.evaluate(async () => {
        const root = document.getElementById('coach-training');
        const done = root.querySelector('.tp-done');
        let n = 0;
        for (const el of done.querySelectorAll('button, a, [onclick]')) {
          if ((el.id || '') === 'tp-pdf-btn') continue;        // opens a download, not an edit
          el.click(); n++;
        }
        done.click();
        return n;
      });
      await p.page.waitForTimeout(300);
      assert.equal(await p.page.evaluate(() => JSON.stringify(state.trainingBlocks)), before,
        `clicking everything in the completed view (${clicked} elements) changed nothing`);
      // And the handlers themselves refuse, whatever calls them.
      await p.page.evaluate(() => { addTimeBlock('slot_tue-20260922');
                                    updateTimeBlock('slot_tue-20260922', 'b1', 'activity', 'HACKED');
                                    removeTimeBlock('slot_tue-20260922', 'b2'); });
      assert.equal(await p.page.evaluate(() => JSON.stringify(state.trainingBlocks)), before,
        'and the planner mutators refuse a completed occurrence outright');

      assert.deepEqual(p.errors, [], 'no page errors');
      assert.ok(await p.page.evaluate(() => (document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0),
        'no horizontal overflow');
      // No render loop, no network churn: re-rendering is idempotent.
      const html1 = await p.page.evaluate(() => document.getElementById('coach-training').innerHTML);
      const reqBefore = p.requests.length;
      await p.page.evaluate(() => { renderTraining(); renderTraining(); });
      await p.page.waitForTimeout(300);
      assert.equal(await p.page.evaluate(() => document.getElementById('coach-training').innerHTML), html1,
        'the completed view repaints identically');
      assert.ok(p.requests.length - reqBefore <= 1, `no network loop (${p.requests.length - reqBefore} requests)`);
      await p.close();
    } finally { await closeAll(); await browser.close(); }
  });
}
