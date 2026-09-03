/**
 * BUILD AB — ONE attendance presentation.
 *
 * Training → Attendance (Build AA) is THE coach-facing player attendance
 * summary. History used to render its own competing card — "Player attendance
 * summary (all time)" — with a different framing: present ÷ decisions
 * recorded, a traffic-light percentage, players with no recorded decision
 * hidden, and a club-wide roster. Same registers, different denominator: two
 * screens one tap apart could show a coach two different-looking answers.
 *
 * History now renders NO per-player aggregation of its own. In its place a
 * small pointer card directs the coach to the canonical Attendance tab via the
 * existing navigation (setTrainingTab('summary')). Per-SESSION history — the
 * cards, their recorded counts, the openable registers — is untouched.
 *
 * These tests RUN the real History renderer against a stubbed DOM, so they
 * prove what a coach actually sees, not what the source happens to contain.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = process.env.CE_INDEX_HTML || join(__dirname, '..', 'index.html');
const html = await readFile(INDEX, 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const strip = s => s.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const SLOTS = [{ id: 'slot_tue', sessionId: 'tue', day: 'Tue', startTime: '19:00', venue: 'Club' },
               { id: 'slot_thu', sessionId: 'thu', day: 'Thu', startTime: '19:00', venue: 'Club' }];

/**
 * A world that can genuinely RUN _renderTrainingHistory: the real History
 * pipeline (session list, per-session counts, the canonical read fence) over
 * a stub DOM. attendanceStats is DELIBERATELY absent — History must no longer
 * aggregate per player, so any mutation that brings the old card back throws
 * here instead of rendering.
 */
function makeWorld(cfg = {}) {
  const { sessions = {}, denied = false, loaded = true, failed = false,
          roster = [], slots = SLOTS, operatingGroup = 'g1', loadedGroup = 'g1' } = cfg;
  const calls = { fetches: [], tabs: [] };
  const el = { innerHTML: '' };
  const w = new Function('cfg', 'calls', 'el', `
    "use strict";
    const BETA_SIMPLE_UI = true;
    const state = { seasonStart: '2026-07-01', seasonEnd: '2027-06-30',
                    operationalGroupId: cfg.operatingGroup, schedule: [],
                    trainingBlocks: {}, sessionNotes: {}, players: cfg.roster };
    let _trainingSchedule = { slots: cfg.slots };
    let _attendance = cfg.loaded ? (cfg.denied ? { denied: true, sessions: {} } : { sessions: cfg.sessions }) : null;
    let _attendanceGroup = cfg.loaded ? cfg.loadedGroup : null;
    let _attendanceFailed = cfg.failed ? cfg.operatingGroup : null;
    let _trainingHistoryMonth = '';
    let _historyOpenSession = null;
    let _availTodayOverride = '2026-09-03';
    const document = { getElementById: id => (id === 'coach-training' ? el : null) };
    const fetch = (...a) => { calls.fetches.push(a); throw new Error('History must not fetch'); };
    function loadAttendance() {}
    function ensureTrainingSchedule() {}
    function canI() { return true; }
    function esc(s) { return String(s == null ? '' : s); }
    function activeRosterPlayers(p) { return (p || []).filter(x => x && x.id); }
    function operationalPlayers() { return cfg.roster; }
    function _trainingTabBar() { return '<TABBAR>'; }
    function attendancePanelHtml() { return '<PANEL>'; }
    function setTrainingTab(tab) { calls.tabs.push(tab); }
    function render() {}
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'attendanceOccurrenceId')}
    ${extractFn(html, 'currentAttendance')}
    ${extractFn(html, 'attendanceFailed')}
    ${extractFn(html, 'availToday')}
    ${extractFn(html, 'trainingDateLabel')}
    ${extractFn(html, 'trainingMonthLabel')}
    ${extractFn(html, 'trainingDateFromSessionId')}
    ${extractFn(html, 'trainingOccurrenceTitle')}
    ${extractFn(html, 'trainingSessionHasData')}
    ${extractFn(html, 'trainingHistorySessions')}
    ${extractFn(html, 'trainingAttendanceForSession')}
    ${extractFn(html, '_renderTrainingHistory')}
    return { renderHistory: _renderTrainingHistory,
             sessionsDoc: () => _attendance && _attendance.sessions,
             clickPointer: htmlStr => {
               // Behavioural link check: pull the pointer's onclick out of the
               // RENDERED markup and run it against the recording stub.
               const m = /onclick="(setTrainingTab\\([^"]*\\))"/.exec(htmlStr);
               if (!m) return false;
               new Function('setTrainingTab', m[1].replace(/&#39;|&apos;/g, "'"))(setTrainingTab);
               return true;
             } };
  `)({ sessions, denied, loaded, failed, roster, slots, operatingGroup, loadedGroup }, calls, el);
  return { ...w, el, calls };
}

const ANA = { id: 'p1', name: 'Ana Silva', userId: 'u1' };
const BEN = { id: 'p2', name: 'Ben Okafor', userId: 'u2' };
const reg = (date, marks, title = 'Training') => ({ date, title, marks });
const U18_DOC = {
  'slot_tue-20260825': reg('2026-08-25', { 'id:u1': 'present', 'id:u2': 'absent' }),
  'slot_tue-20260901': reg('2026-09-01', { 'id:u1': 'present' }),
};

// ─────────────── the competing summary is gone from History ────────────────

test('History renders NO per-player attendance summary of its own', () => {
  const w = makeWorld({ roster: [ANA, BEN], sessions: U18_DOC });
  w.renderHistory();
  const out = w.el.innerHTML;
  assert.ok(out.length > 200, 'History rendered');
  assert.ok(!out.includes('Player attendance summary (all time)'), 'the old card title is gone');
  assert.ok(!/\d+\/\d+ sessions/.test(out), 'the present/decisions denominator is gone');
  // The old card's traffic-light percentage row is gone. Per-SESSION recorded
  // figures are History's own business and stay.
  assert.ok(!/min-width:40px;text-align:right..\d+%/.test(out), 'no per-player percentage row');
});

test('History never aggregates per player — the aggregation is not even in scope', () => {
  // The world defines no attendanceStats; rendering would THROW if History
  // still called it. This is the behavioural proof the card cannot come back
  // by reintroducing the old code.
  const w = makeWorld({ roster: [ANA, BEN], sessions: U18_DOC });
  assert.doesNotThrow(() => w.renderHistory());
  assert.ok(!/attendanceStats\(/.test(strip(extractFn(html, '_renderTrainingHistory'))),
    'History does not reference the per-player aggregation');
});

test('the pointer card directs to the canonical Attendance tab — behaviourally', () => {
  const w = makeWorld({ roster: [ANA, BEN], sessions: U18_DOC });
  w.renderHistory();
  const out = w.el.innerHTML;
  assert.match(out, /Player attendance summary/, 'the coach is still told where the summary lives');
  assert.match(out, /Attendance tab/i, 'and where it moved to');
  assert.equal(w.clickPointer(out), true, 'the pointer has a working onclick');
  assert.deepEqual(w.calls.tabs, ['summary'], 'clicking it opens Training → Attendance');
  assert.ok(!/\d+%/.test(out.slice(out.indexOf('Player attendance summary'))),
    'the pointer itself shows no percentage');
});

// ─────────────── History keeps everything that is its own ──────────────────

test('per-session History functionality is untouched', () => {
  const w = makeWorld({ roster: [ANA, BEN], sessions: U18_DOC });
  w.renderHistory();
  const out = w.el.innerHTML;
  assert.match(out, /Tuesday Training|Training/, 'session cards render');
  assert.match(out, /1 present of 1 recorded|2 present of 2 recorded|present of/, 'per-session recorded counts stay');
  assert.match(out, /25 Aug 2026/, 'dates stay');
  assert.match(out, /<TABBAR>/, 'tab bar stays');
  assert.match(out, /trainingHistoryToggle/, 'registers can still be opened');
});

test('empty, loading, failed and denied states cannot resurrect the old card', () => {
  const cases = {
    empty:   makeWorld({ roster: [ANA], sessions: {} }),
    loading: makeWorld({ roster: [ANA], loaded: false }),
    failed:  makeWorld({ roster: [ANA], loaded: false, failed: true }),
    denied:  makeWorld({ roster: [ANA], denied: true }),
  };
  for (const [name, w] of Object.entries(cases)) {
    w.renderHistory();
    const out = w.el.innerHTML;
    assert.ok(!out.includes('(all time)'), `${name}: no all-time claim`);
    assert.ok(!/\d+\/\d+ sessions/.test(out), `${name}: no present/decisions row`);
    assert.ok(!/\d+%/.test(out), `${name}: no percentage at all`);
  }
  // and the three honest empty-state answers are still distinguishable
  cases.loading.renderHistory();
  assert.match(cases.loading.el.innerHTML, /Loading history/);
  cases.failed.renderHistory();
  assert.match(cases.failed.el.innerHTML, /History unavailable/);
  cases.empty.renderHistory();
  assert.match(cases.empty.el.innerHTML, /No session history yet/);
});

// ─────────────── read-only, group-fenced, data untouched ───────────────────

test('opening History performs no fetch and no attendance write', () => {
  const w = makeWorld({ roster: [ANA, BEN], sessions: U18_DOC });
  const frozen = JSON.stringify(w.sessionsDoc());
  w.renderHistory();
  assert.deepEqual(w.calls.fetches, [], 'no network call of any kind');
  assert.equal(JSON.stringify(w.sessionsDoc()), frozen, 'the register document is unchanged');
});

test('History still refuses to serve another group\'s document', () => {
  // Operating as U18 while the cached document belongs to Seniors: the render
  // must show the honest loading state, never the Seniors sessions.
  const w = makeWorld({ roster: [ANA], sessions: U18_DOC,
                        operatingGroup: 'g_u18', loadedGroup: 'g_seniors' });
  w.renderHistory();
  assert.match(w.el.innerHTML, /Loading history/, 'a cross-group doc is our ignorance, not our data');
  assert.ok(!w.el.innerHTML.includes('25 Aug 2026'), 'no Seniors-loaded session leaks into U18');
});

test('each group\'s History stands on its own document', () => {
  const u18 = makeWorld({ roster: [ANA], sessions: U18_DOC,
                          operatingGroup: 'g_u18', loadedGroup: 'g_u18' });
  u18.renderHistory();
  assert.match(u18.el.innerHTML, /25 Aug 2026/);
  const sen = makeWorld({ roster: [BEN],
    sessions: { 'slot_thu-20260827': reg('2026-08-27', { 'id:u2': 'present' }) },
    operatingGroup: 'g_sen', loadedGroup: 'g_sen' });
  sen.renderHistory();
  assert.match(sen.el.innerHTML, /27 Aug 2026/);
  assert.ok(!sen.el.innerHTML.includes('25 Aug 2026'), 'no U18 session under Seniors');
});

// ─────────────── the canonical surface remains the one summary ─────────────

test('Training → Attendance is still present and canonical', () => {
  const bar = strip(extractFn(html, '_trainingTabBar'));
  assert.match(bar, /\['summary','Attendance'\]/, 'the tab is still offered');
  const dispatch = strip(extractFn(html, 'renderTraining'));
  assert.match(dispatch, /_tab === 'summary'.*_renderTrainingAttendanceSummary/);
  const fn = strip(extractFn(html, '_renderTrainingAttendanceSummary'));
  assert.match(fn, /attendanceSeasonSummary\(/, 'and still renders the canonical aggregation');
});

test('exactly one per-player summary presentation exists in the product', () => {
  assert.equal(html.split('Player attendance summary').length - 1, 1,
    'the phrase appears once: the History pointer to the canonical tab');
  assert.equal(html.split('function attendanceSeasonSummary(').length - 1, 1);
  assert.equal(html.split('function attendanceStats(').length - 1, 1,
    'the per-player aggregation itself is untouched for its other consumers');
});
