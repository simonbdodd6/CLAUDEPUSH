/**
 * BUILD AG — CURRENT-WEEK ATTENDANCE RECORDING, restored.
 *
 * Build AF found the attendance store EMPTY in production — zero keys ever —
 * because the current-week planner hands the attendance panel the stored
 * session row's date, and production rows carry legacy junk: Seniors
 * {id:'tue', date:'19.45'} (a TIME in the date field), U18 {id:'tue',
 * date:''}. attendanceOccurrenceId correctly refuses to guess, so the panel
 * said "this session has no date yet" and the flagship recording flow was
 * inert for every group.
 *
 * The fix is ONE derivation at the planner boundary: when the stored row has
 * no valid ISO date, trainingAttendanceOccurrence resolves the row to its
 * canonical SLOT (by the stored sessionId link, else by the legacy tue/thu
 * weekday convention) and takes the slot's date in the CURRENT week — the
 * exact date algorithm availability already lives by (availSlotDateInWeek).
 * The occurrence stays <slot root>-<YYYYMMDD>; nothing about the resolver,
 * the states, the write path or the ledger changes. Underivable identities
 * refuse, exactly as before — a refusal, never a guess.
 *
 * U18 has a subtlety the fix must honour: its real slots carry sessionId ''
 * (they never had legacy names), so the canonical occurrence root is the
 * SLOT id — the same identity availability's dated events already use. A
 * derivation that kept the bare row id would have minted a SECOND identity
 * ('tue-…') for the same Tuesday.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = process.env.CE_INDEX_HTML || join(__dirname, '..', 'index.html');
const html = await readFile(INDEX, 'utf8');
const api = await readFile(join(__dirname, '..', 'api', 'publish.js'), 'utf8');

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

// The PRODUCTION shapes, verbatim from the Build AF read-only audit.
const U18_SLOTS = [
  { id: 'slot_msvgzozt_0', day: 'Tue', startTime: '17:45', venue: 'Artificial', active: true, sessionId: '' },
  { id: 'slot_msvh0skf_1', day: 'Thu', startTime: '17:45', venue: 'Grass', active: true, sessionId: '' },
];
const SEN_SLOTS = [
  { id: 'slot_tue', day: 'Tue', startTime: '19:45', venue: 'Foresterie', active: true, sessionId: 'tue', effectiveFrom: '2026-08-04' },
  { id: 'slot_thu', day: 'Thu', startTime: '19:45', venue: 'Foresterie', active: true, sessionId: 'thu', effectiveFrom: '2026-08-06' },
];
// A fixed clock: Friday 2026-09-04 → week starts Mon 2026-08-31,
// Tuesday = 2026-09-01, Thursday = 2026-09-03.
const TODAY = '2026-09-04';

function makeWorld({ slots = U18_SLOTS, today = TODAY, sessions = {},
                     roster = [], denied = false, loaded = true } = {}) {
  return new Function('cfg', `
    "use strict";
    const state = { seasonStart: '2026-07-01', seasonEnd: '2027-06-30', operationalGroupId: 'g1' };
    let _trainingSchedule = { slots: cfg.slots };
    let _attendance = cfg.loaded ? (cfg.denied ? { denied: true, sessions: {} } : { sessions: cfg.sessions }) : null;
    let _attendanceGroup = cfg.loaded ? 'g1' : null;
    let _attendanceFailed = null;
    let _availTodayOverride = cfg.today;
    function loadAttendance() {}
    function canI() { return true; }
    function esc(s) { return String(s == null ? '' : s); }
    function operationalPlayers() { return cfg.roster; }
    function canonicalVisiblePlayers() { return cfg.roster; }
    function playerIsArchived() { return false; }
    const AVAIL_DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    ${extractFn(html, 'availToday')}
    ${extractFn(html, 'availWeekStart')}
    ${extractFn(html, 'availAddDays')}
    ${extractFn(html, 'availSlotDateInWeek')}
    ${extractFn(html, 'trainingDateLabel')}
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'attendanceOccurrenceId')}
    ${extractFn(html, 'currentAttendance')}
    ${extractFn(html, 'attendanceFailed')}
    ${extractFn(html, 'attendanceHeldSessions')}
    ${extractFn(html, 'attendanceSeasonSummary')}
    ${extractFn(html, 'trainingAttendanceOccurrence')}
    ${extractFn(html, 'attendancePanelHtml')}
    return { trainingAttendanceOccurrence, attendanceOccurrenceId, attendancePanelHtml,
             attendanceHeldSessions, attendanceSeasonSummary };
  `)({ slots, today, sessions, roster, denied, loaded });
}

/** The planner's boundary, as one expression: row in, panel identity out. */
function resolve(w, id, storedDate) {
  const r = w.trainingAttendanceOccurrence(id, storedDate);
  return r ? { ...r, occId: w.attendanceOccurrenceId(r.id, r.date) } : null;
}

// ─────────────── the two production shapes record again ─────────────────────

test('U18: a bare row with date "" derives its slot\'s date THIS week', () => {
  const w = makeWorld({ slots: U18_SLOTS });
  const r = resolve(w, 'tue', '');
  assert.ok(r, 'derivable, not refused');
  assert.equal(r.date, '2026-09-01', 'this week\'s Tuesday');
  assert.equal(r.occId, 'slot_msvgzozt_0-20260901',
    'the SLOT identity — the same dated occurrence availability already uses');
  const thu = resolve(w, 'thu', '');
  assert.equal(thu.occId, 'slot_msvh0skf_1-20260903');
});

test('Seniors: a row with the legacy time "19.45" in the date field derives its slot date', () => {
  const w = makeWorld({ slots: SEN_SLOTS });
  const r = resolve(w, 'tue', '19.45');
  assert.ok(r, 'the junk date does not kill the occurrence');
  assert.equal(r.date, '2026-09-01');
  assert.equal(r.occId, 'slot_tue-20260901', 'the canonical Build-B root');
  assert.ok(!JSON.stringify(r).includes('19.45'), 'the time string is nowhere in the identity');
});

test('a valid ISO stored date is kept exactly as before', () => {
  const w = makeWorld({ slots: SEN_SLOTS });
  const r = resolve(w, 'tue', '2026-08-25');
  assert.equal(r.date, '2026-08-25', 'no derivation when the row already knows its date');
  assert.equal(r.occId, 'slot_tue-20260825');
});

test('a dated occurrence id keeps carrying its own date', () => {
  const w = makeWorld({ slots: U18_SLOTS });
  const r = resolve(w, 'slot_msvgzozt_0-20260825', '');
  assert.equal(r.occId, 'slot_msvgzozt_0-20260825', 'past-week views are untouched');
});

test('the occurrence is exactly <slot root>-<YYYYMMDD> — never a second scheme', () => {
  const w = makeWorld({ slots: U18_SLOTS });
  for (const [id, stored] of [['tue', ''], ['thu', ''], ['tue', '19.45']]) {
    const r = resolve(w, id, stored);
    assert.match(r.occId, /^slot_[a-z0-9_]+-\d{8}$/, `${id}/${stored}`);
  }
});

// ─────────────── the panel comes back to life ───────────────────────────────

test('the attendance panel renders the register, not "no date yet"', () => {
  const ANA = { id: 'p1', name: 'Ana Silva', userId: 'u1' };
  const w = makeWorld({ slots: U18_SLOTS, roster: [ANA] });
  const r = w.trainingAttendanceOccurrence('tue', '');
  const panel = w.attendancePanelHtml(r.id, r.date);
  assert.ok(!panel.includes('no date yet'), 'the refusal message is gone for derivable rows');
  assert.match(panel, /att-btn/, 'Present/Absent buttons render');
  assert.match(panel, /attendanceMark\('slot_msvgzozt_0-20260901'|attendanceMark\('slot_msvgzozt_0'/,
    'the write is wired to the DERIVED identity');
  assert.match(panel, /'2026-09-01'/, 'and to the derived date');
});

test('an underivable identity still refuses honestly — never a guess', () => {
  const w = makeWorld({ slots: U18_SLOTS, roster: [{ id: 'p1', name: 'A', userId: 'u1' }] });
  assert.equal(w.trainingAttendanceOccurrence('mystery_row', ''), null, 'unknown id: refused');
  assert.equal(w.trainingAttendanceOccurrence('game', ''), null, 'the legacy match row is not training');
  // TWO Tuesday slots: the weekday convention is ambiguous, so refuse.
  const two = makeWorld({ slots: [...U18_SLOTS,
    { id: 'slot_extra', day: 'Tue', active: true, sessionId: '' }] });
  assert.equal(two.trainingAttendanceOccurrence('tue', ''), null, 'ambiguous weekday: refused');
  // and the refused case renders the existing honest panel message
  const panel = w.attendancePanelHtml('mystery_row', '');
  assert.match(panel, /no date yet/, 'the honest refusal copy survives for the truly unknowable');
});

// ─────────────── group isolation ────────────────────────────────────────────

test('each group derives from its OWN slot table, never the other\'s', () => {
  const u18 = makeWorld({ slots: U18_SLOTS });
  const sen = makeWorld({ slots: SEN_SLOTS });
  assert.equal(resolve(u18, 'tue', '').occId, 'slot_msvgzozt_0-20260901');
  assert.equal(resolve(sen, 'tue', '19.45').occId, 'slot_tue-20260901');
  assert.ok(!JSON.stringify(resolve(u18, 'tue', '')).includes('slot_tue'),
    'U18 cannot mint a Seniors occurrence');
  assert.ok(!JSON.stringify(resolve(sen, 'tue', '19.45')).includes('msvgzozt'),
    'Seniors cannot mint a U18 occurrence');
});

test('the derivation reads only the group-scoped slot cache', () => {
  const src = strip(extractFn(html, 'trainingAttendanceOccurrence'));
  assert.match(src, /_trainingSchedule/, 'the per-group schedule cache is the only slot source');
  assert.ok(!/state\.players|_adminData|sessionRows|resolvedAnswerFor/.test(src),
    'no club-wide or availability source is consulted');
});

// ─────────────── future / past safety ───────────────────────────────────────

test('a derived future session is still not a session HELD', () => {
  // Viewed on Tuesday, this week's Thursday derives (the planner may show its
  // register), but the canonical held-set excludes it until its day arrives.
  const w = makeWorld({ slots: U18_SLOTS, today: '2026-09-01' });
  const thu = resolve(w, 'thu', '');
  assert.equal(thu.occId, 'slot_msvh0skf_1-20260903', 'derivable ahead of time');
  const held = w.attendanceHeldSessions(
    { [thu.occId]: { date: thu.date, title: 'T', marks: {} } }, '2026-09-01', '', '');
  assert.equal(held.length, 0, 'the future is planning, not history');
});

test('History performs no derivation — a past card can never claim this week', () => {
  // The planner is the ONLY derivation site. History hands the panel the
  // stored id/date untouched, so a legacy undated History card cannot be
  // re-addressed to the current week.
  const hist = strip(extractFn(html, '_renderTrainingHistory'));
  assert.ok(!/trainingAttendanceOccurrence/.test(hist), 'History passes s.id/s.date directly');
  assert.match(hist, /attendancePanelHtml\(s\.id, s\.date\)/);
  const planner = strip(extractFn(html, 'renderTraining'));
  assert.match(planner, /trainingAttendanceOccurrence/, 'the planner derives');
});

test('bare and dated twins stay ONE session after derivation', () => {
  const w = makeWorld({ slots: SEN_SLOTS });
  const derived = resolve(w, 'tue', '19.45');
  assert.equal(derived.occId, w.attendanceOccurrenceId('tue', '2026-09-01'),
    'the derived id and the classic bare+date id are the same occurrence');
  assert.equal(w.attendanceOccurrenceId(derived.occId, ''), derived.occId, 'and idempotent');
});

// ─────────────── the write, the ledger, the summary agree ───────────────────

test('the attendance write sends the derived canonical occurrence', async () => {
  const sent = [];
  const w = new Function('cfg', 'sent', `
    "use strict";
    const state = { operationalGroupId: 'g1' };
    let _trainingSchedule = { slots: cfg.slots };
    let _attendance = { sessions: {} }, _attendanceGroup = 'g1';
    function canI() { return true; }
    function showToast() {}
    const fetch = async (url, opts) => { sent.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ ok: true, occurrenceId: 'x', session: {} }) }; };
    ${extractFn(html, 'attendanceOccurrenceId')}
    ${extractFn(html, 'saveAttendance')}
    return { saveAttendance };
  `)({ slots: U18_SLOTS }, sent);
  await w.saveAttendance('slot_msvgzozt_0-20260901', { 'id:u1': 'present' }, '2026-09-01');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].sessionId, 'slot_msvgzozt_0-20260901', 'the canonical dated occurrence travels');
  assert.deepEqual(sent[0].marks, { 'id:u1': 'present' }, 'states unchanged: present/absent/null');
});

test('the ledger and the client agree wherever the ledger can fire', () => {
  const LEDGER = new Function(`"use strict";
    const ATT_DATED_RE = /-(\\d{8})$/;
    ${extractFn(api, 'attendanceOccurrenceRoot', '')}
    ${extractFn(api, 'attendanceOccurrenceId', '')}
    ${extractFn(api, 'attendanceLedgerAdditions', '')}
    return attendanceLedgerAdditions;`)();
  // A DATED session row: ledger notes it under exactly the client's identity.
  const out = LEDGER([{ id: 'tue', date: '2026-09-01', type: 'Training', title: 'T' }], {}, SEN_SLOTS);
  const w = makeWorld({ slots: SEN_SLOTS });
  assert.deepEqual(Object.keys(out), [w.attendanceOccurrenceId('tue', '2026-09-01')],
    'one occurrence, one name, both sides');
  // The production junk rows: the ledger refuses, exactly like the resolver —
  // no entry is ever minted from an unprovable date. Recording is the entry
  // point for those sessions, under the SAME derived identity.
  assert.deepEqual(LEDGER([{ id: 'tue', date: '19.45', type: 'Training', title: 'T' }], {}, SEN_SLOTS), {});
  assert.deepEqual(LEDGER([{ id: 'tue', date: '', type: 'Training', title: 'T' }], {}, U18_SLOTS), {});
});

test('a register recorded under the derived occurrence feeds the whole summary chain', () => {
  const ANA = { id: 'p1', name: 'Ana Silva', userId: 'u1' };
  const BEN = { id: 'p2', name: 'Ben Okafor', userId: 'u2' };
  const CAL = { id: 'p3', name: 'Cal Reid', userId: 'u3' };
  const w = makeWorld({ slots: U18_SLOTS });
  const r = resolve(w, 'tue', '');
  const sessions = { [r.occId]: { date: r.date, title: 'Tuesday Training',
    marks: { 'id:u1': 'present', 'id:u2': 'absent' } } };
  const summary = w.attendanceSeasonSummary(sessions, [ANA, BEN, CAL], TODAY, '2026-07-01', '2027-06-30');
  assert.equal(summary.held.length, 1, 'one session held');
  const row = id => summary.rows.find(x => x.id === id);
  assert.equal(row('p1').present, 1);
  assert.equal(row('p1').attendanceRate, 100, 'attended ÷ sessions held');
  assert.equal(row('p2').absent, 1);
  assert.equal(row('p2').attendanceRate, 0);
  assert.equal(row('p3').notRecorded, 1, 'unmarked stays not-recorded, never fabricated');
});

test('recording is idempotent — the same session resolves to the same occurrence every time', () => {
  const w = makeWorld({ slots: U18_SLOTS });
  const a = resolve(w, 'tue', '');
  const b = resolve(w, 'tue', '');
  const c = resolve(w, a.occId, '');
  assert.equal(a.occId, b.occId);
  assert.equal(a.occId, c.occId, 'the derived id round-trips through the resolver unchanged');
});

test('availability plays no part in the derivation or the panel', () => {
  for (const fn of ['trainingAttendanceOccurrence', 'attendancePanelHtml']) {
    const src = strip(extractFn(html, fn));
    for (const bad of [/sessionRows\(/, /resolvedAnswerFor\(/, /no-reply/, /'available'/, /trainingTuesday/]) {
      assert.ok(!bad.test(src), `${fn} must not read availability (${bad})`);
    }
  }
});
