/**
 * ATTENDANCE OCCURRENCE IDENTITY — one Tuesday, not every Tuesday.
 *
 * THE BUG THIS FIXES. A recurring slot keeps ONE id for the week being viewed:
 * availabilityEventsForWeek returns `isCurrentWeek ? slot.sessionId : dated`, so
 * the current week's training is `tue` this week and `tue` again next week. The
 * attendance register was keyed by that id, so the second Tuesday merged into
 * the first AND overwrote its stored date — the earlier session's attendance was
 * not merely unreachable, it was destroyed.
 *
 * A register now belongs to the slot PLUS the day it happened.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.occ.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');
const apiSrc = await readFile(join(__dirname, '..', 'api', 'publish.js'), 'utf8');

function extractFn(source, name, indent = '    ') {
  let start = source.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = source.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = source.indexOf('(', start), paren = 0;
  for (; i < source.length; i++) {
    if (source[i] === '(') paren++;
    else if (source[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = source.indexOf('{', i), depth = 0;
  for (let k = brace; k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (!depth) return source.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}

const CLIENT = new Function(`"use strict";
  const _trainingSchedule = { slots: [] };
  ${extractFn(html, 'attendanceOccurrenceId')} return attendanceOccurrenceId;`)();
// Build B gave the identity a SLOT TABLE, which maps a recurring slot's two
// names onto one root. These tests deliberately supply NO slots: with no
// mapping available the behaviour is exactly Build A's, which is the
// compatibility guarantee. Slot-aware resolution is covered in
// test/attendance-unified-source.test.js.
const _SERVER = new Function(`"use strict";
  const ATT_DATED_RE = /-(\\d{8})$/;
  ${extractFn(apiSrc, 'attendanceOccurrenceRoot', '')}
  ${extractFn(apiSrc, 'attendanceOccurrenceId', '')}
  return attendanceOccurrenceId;`)();
const SERVER = (id, date) => _SERVER(id, date, []);
const _MIGRATE = new Function(`"use strict";
  const ATT_DATED_RE = /-(\\d{8})$/;
  ${extractFn(apiSrc, 'attendanceOccurrenceRoot', '')}
  ${extractFn(apiSrc, 'attendanceOccurrenceId', '')}
  ${extractFn(apiSrc, 'migrateAttendanceDoc', '')}
  return migrateAttendanceDoc;`)();
const MIGRATE = doc => _MIGRATE(doc, []);

// ───────────────────────── the identity itself ──────────────────────────────

test('same slot, same date → the same register', () => {
  assert.equal(SERVER('tue', '2026-09-01'), 'tue-20260901');
  assert.equal(SERVER('tue', '2026-09-01'), SERVER('tue', '2026-09-01'));
});

test('same slot, DIFFERENT date → different registers (the bug)', () => {
  const a = SERVER('tue', '2026-09-01'), b = SERVER('tue', '2026-09-08');
  assert.equal(a, 'tue-20260901');
  assert.equal(b, 'tue-20260908');
  assert.notEqual(a, b, 'two Tuesdays must not share a register');
});

test('different slots, same date → different registers', () => {
  assert.notEqual(SERVER('tue', '2026-09-01'), SERVER('thu', '2026-09-01'));
});

test('an id that already carries its date is never dated twice', () => {
  // Non-current weeks already use slot_<id>-<YYYYMMDD>.
  assert.equal(SERVER('slot_tue-20260908', '2026-09-08'), 'slot_tue-20260908');
  assert.equal(SERVER('slot_tue-20260908', '2026-09-15'), 'slot_tue-20260908',
    'the id it carries wins — it IS the occurrence');
  assert.equal(SERVER(SERVER('tue', '2026-09-01'), '2026-09-01'), 'tue-20260901', 'idempotent');
});

test('no stable occurrence is ever invented', () => {
  for (const [id, date] of [['tue', ''], ['tue', null], ['tue', 'soon'],
                            ['tue', '2026-13-45'],   // date-SHAPED but not a real day
                            ['tue', '2026-00-10'], ['tue', '2026-09-32'],
                            ['', '2026-09-01'], [null, '2026-09-01']]) {
    assert.equal(SERVER(id, date), '', JSON.stringify([id, date]));
  }
  // The boundary is deliberately range-checking, not full calendar arithmetic:
  // 31 Sep is accepted as a stable key because deciding it is impossible would
  // need date parsing, and parsing is what shifts days across timezones.
  assert.equal(SERVER('tue', '2026-09-31'), 'tue-20260931');
});

test('the date is taken literally — no timezone, no clock', () => {
  const src = extractFn(apiSrc, 'attendanceOccurrenceId', '');
  for (const forbidden of [/new Date/, /Date\.now/, /getTime/, /toISOString/, /getTimezoneOffset/]) {
    assert.ok(!forbidden.test(src), `must not touch the clock: ${forbidden}`);
  }
  // String slicing cannot shift a day, so this holds anywhere on earth.
  const out = execFileSync(process.execPath, ['-e',
    `const ATT_DATED_RE=/-(\\\\d{8})$/;\n${extractFn(apiSrc, 'attendanceOccurrenceRoot', '')}\n${extractFn(apiSrc, 'attendanceOccurrenceId', '')}\n` +
    `process.stdout.write(attendanceOccurrenceId('tue','2026-09-01',[]));`],
    { env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' });
  assert.equal(out, 'tue-20260901', 'west of UTC the day must not slip');
});

test('the client and the server derive the SAME identity', () => {
  const table = [['tue', '2026-09-01'], ['tue', '2026-09-08'], ['thu', '2026-09-03'],
                 ['slot_tue-20260908', '2026-09-08'], ['slot_tue-20260908', '2026-01-01'],
                 ['tue', ''], ['', '2026-09-01'], ['tue', 'nonsense'], ['x', '2027-12-31']];
  for (const [id, d] of table) {
    assert.equal(CLIENT(id, d), SERVER(id, d), `client/server disagree on ${JSON.stringify([id, d])}`);
  }
});

// ───────────────────────── migration ────────────────────────────────────────

const rec = (date, marks, extra = {}) => ({ date, title: 'Tuesday training', marks, ...extra });

test('a legacy register moves onto the date it already stored', () => {
  const out = MIGRATE({ sessions: { tue: rec('2026-09-01', { 'id:ana': 'present' }) } });
  assert.deepEqual(Object.keys(out.sessions), ['tue-20260901']);
  assert.deepEqual(out.sessions['tue-20260901'].marks, { 'id:ana': 'present' });
  assert.deepEqual(out.carried, []);
});

test('migration is idempotent', () => {
  const once  = MIGRATE({ sessions: { tue: rec('2026-09-01', { 'id:ana': 'present' }) } });
  const twice = MIGRATE(once);
  assert.deepEqual(twice.sessions, once.sessions, 'running it again changes nothing');
  assert.deepEqual(MIGRATE(twice).sessions, once.sessions);
});

test('a record with no usable date is LEFT WHERE IT IS, never guessed', () => {
  const out = MIGRATE({ sessions: { tue: rec('', { 'id:ana': 'present' }),
                                    thu: rec('rubbish', { 'id:ben': 'absent' }) } });
  assert.deepEqual(Object.keys(out.sessions).sort(), ['thu', 'tue'], 'preserved under their own keys');
  assert.deepEqual(out.carried.sort(), ['thu', 'tue'], 'and reported');
  assert.deepEqual(out.sessions.tue.marks, { 'id:ana': 'present' }, 'losslessly');
});

test('two registers are never merged because their old key matched', () => {
  // The dated record already exists; the legacy one must not be folded into it.
  const out = MIGRATE({ sessions: {
    'tue-20260901': rec('2026-09-01', { 'id:ana': 'absent' }),
    'tue':          rec('2026-09-01', { 'id:ana': 'present', 'id:ben': 'present' }) } });
  assert.deepEqual(out.sessions['tue-20260901'].marks, { 'id:ana': 'absent' },
    'the dated register wins and is not overwritten or merged');
  assert.ok(out.sessions.tue, 'and the legacy one is preserved, not deleted');
  assert.deepEqual(out.carried, ['tue']);
});

test('an already-dated document passes through untouched', () => {
  const doc = { sessions: { 'tue-20260901': rec('2026-09-01', { 'id:ana': 'present' }),
                            'tue-20260908': rec('2026-09-08', { 'id:ana': 'absent' }) } };
  const out = MIGRATE(doc);
  assert.deepEqual(out.sessions, doc.sessions);
  assert.deepEqual(out.carried, []);
});

test('migration creates no duplicate and loses no marks', () => {
  const doc = { sessions: { tue: rec('2026-09-01', { 'id:ana': 'present', 'id:ben': 'absent' }),
                            thu: rec('2026-09-03', { 'id:ana': 'absent' }) } };
  const out = MIGRATE(doc);
  assert.equal(Object.keys(out.sessions).length, 2, 'two in, two out');
  assert.deepEqual(out.sessions['tue-20260901'].marks, { 'id:ana': 'present', 'id:ben': 'absent' });
  assert.deepEqual(out.sessions['thu-20260903'].marks, { 'id:ana': 'absent' });
});

test('an empty or malformed document does not throw', () => {
  for (const bad of [null, undefined, {}, { sessions: null }, { sessions: {} }]) {
    assert.deepEqual(MIGRATE(bad).sessions, {}, JSON.stringify(bad));
  }
});

// ───────────────────────── the client reads the right register ──────────────

const strip = src => src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

test('the panel looks up THIS occurrence, not the bare session id', () => {
  // The register moved into attendancePanelHtml so the Planner and History
  // render ONE implementation; the invariants below are unchanged.
  const panel = strip(extractFn(html, 'attendancePanelHtml'));
  // The session is now a PARAMETER — the Planner passes the week's session,
  // History passes a past one — so the register is derived the same way for
  // both rather than reaching for the planner's variables.
  assert.match(panel, /const occId = attendanceOccurrenceId\(sessId, sessionDate\)/);
  const planner = extractFn(html, 'renderTraining');
  assert.match(planner, /attendancePanelHtml\(sessId, sessObj && sessObj\.date\)/,
    'and the Planner still supplies the session it is showing');
  assert.match(panel, /att\.sessions\[occId\]/);
  assert.ok(!/att\.sessions\[sessId\]/.test(panel), 'the bare id would be every Tuesday at once');
  assert.match(panel, /no date yet, so attendance cannot be recorded/, 'an undated session says so');
});

test('the local copy is keyed by the id the SERVER derived', () => {
  const save = strip(extractFn(html, 'saveAttendance'));
  assert.match(save, /\[data\.occurrenceId \|\| sessionId\]: data\.session/);
});

test('the bulk action works on the occurrence too', () => {
  const fn = strip(extractFn(html, 'attendanceMarkAllPresent'));
  assert.match(fn, /attendanceOccurrenceId\(sessionId, sessionDate\)/);
  assert.match(fn, /att\.sessions\[occId\]/);
});

test('the aggregation is unchanged — it reads each record’s own date', () => {
  const agg = strip(extractFn(html, 'attendanceStats'));
  // It iterates whatever registers exist and uses rec.date, so re-keying them
  // cannot change a single figure.
  assert.match(agg, /Object\.entries\(sessions \|\| \{\}\)/);
  assert.match(agg, /String\(rec\.date \|\| ''\)/);
  assert.ok(!/attendanceOccurrenceId/.test(agg), 'no second opinion about identity');
});
