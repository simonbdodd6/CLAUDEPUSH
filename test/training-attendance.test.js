/**
 * TRAINING ATTENDANCE — a recorded fact, not an inference from availability.
 *
 * The profile's Attendance card previously showed five figures of which NONE
 * was attendance: "Attended" counted the times a player ANSWERED an availability
 * request with "available", so a player who said yes to everything and came to
 * nothing read as 100% attended.
 *
 * Attendance is now its own server-persisted record: club from the session,
 * group asserted against the caller's staff scope, keyed by the canonical
 * player identity, and SELF-DESCRIBING — each record stores the session's own
 * date and title, captured server-side, because the group's session list holds
 * only the current week and would otherwise lose the date of everything older.
 *
 * THREE states, and the third is load-bearing: present, absent, NOT RECORDED.
 * Not-recorded is never absence.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.attendance.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
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
const strip = src => src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const AGG = new Function(`"use strict"; ${extractFn(html, 'attendanceStats')} return attendanceStats;`)();
const LABEL = new Function(`"use strict"; ${extractFn(html, 'matchDateLabel')} return matchDateLabel;`)();

const SEASON = ['2026-07-01', '2027-06-30'];
const sess = (date, marks, title = 'Tuesday training') => ({ date, title, marks });

// ───────────────────────── the three states ─────────────────────────────────

test('present, absent and NOT RECORDED are three different things', () => {
  const s = { s1: sess('2026-08-04', { 'id:u1': 'present' }),
              s2: sess('2026-08-11', { 'id:u1': 'absent' }),
              s3: sess('2026-08-18', { 'id:u2': 'present' }) };   // u1 unmarked
  const a = AGG(s, 'id:u1', ...SEASON);
  assert.deepEqual({ recorded: a.recorded, present: a.present, absent: a.absent },
    { recorded: 2, present: 1, absent: 1 });
  assert.equal(a.attendancePct, 50, 'present ÷ decisions recorded FOR THIS PLAYER');
});

test('a session nobody recorded counts for nobody', () => {
  const a = AGG({ s1: sess('2026-08-04', {}) }, 'id:u1', ...SEASON);
  assert.deepEqual({ recorded: a.recorded, present: a.present, absent: a.absent },
    { recorded: 0, present: 0, absent: 0 });
  assert.equal(a.attendancePct, null, 'no denominator means no percentage — never 0%');
});

test('an unmarked player is not absent, even when others were marked', () => {
  const s = { s1: sess('2026-08-04', { 'id:u2': 'present', 'id:u3': 'absent' }) };
  const a = AGG(s, 'id:u1', ...SEASON);
  assert.equal(a.recorded, 0);
  assert.equal(a.attendancePct, null);
});

test('a percentage is null, never zero, when nothing is recorded', () => {
  assert.equal(AGG({}, 'id:u1', ...SEASON).attendancePct, null);
  assert.equal(AGG(null, 'id:u1', ...SEASON).attendancePct, null);
  assert.equal(AGG({ s1: sess('2026-08-04', { 'id:u1': 'absent' }) }, 'id:u1', ...SEASON).attendancePct, 0,
    'a real 0% — recorded absent, genuinely attended none');
});

test('an unknown status is not a decision', () => {
  const s = { s1: sess('2026-08-04', { 'id:u1': 'maybe' }), s2: sess('2026-08-05', { 'id:u1': '' }) };
  assert.equal(AGG(s, 'id:u1', ...SEASON).recorded, 0);
});

// ───────────────────────── availability is NOT attendance ───────────────────

test('the aggregation cannot see availability at all', () => {
  const src = strip(extractFn(html, 'attendanceStats'));
  for (const forbidden of [/availab/i, /sessionRows/, /resolvedAnswer/, /no-reply/, /state\./]) {
    assert.ok(!forbidden.test(src), `attendance must not reference ${forbidden}`);
  }
});

test('the four availability/attendance combinations stay independent', () => {
  // Availability is not an input here at all, which is exactly the point: the
  // SAME attendance record produces the same answer whatever the player said.
  const cases = [
    ['A: available + present',    'present', { present: 1, absent: 0, pct: 100 }],
    ['B: available + absent',     'absent',  { present: 0, absent: 1, pct: 0 }],
    ['C: unavailable + present',  'present', { present: 1, absent: 0, pct: 100 }],
    ['D: unavailable + absent',   'absent',  { present: 0, absent: 1, pct: 0 }],
  ];
  for (const [label, mark, want] of cases) {
    const a = AGG({ s1: sess('2026-08-04', { 'id:u1': mark }) }, 'id:u1', ...SEASON);
    assert.deepEqual({ present: a.present, absent: a.absent, pct: a.attendancePct }, want, label);
  }
  // E: no availability answer + not recorded → not recorded
  const e = AGG({ s1: sess('2026-08-04', {}) }, 'id:u1', ...SEASON);
  assert.equal(e.recorded, 0, 'E: nothing said, nothing recorded, nothing claimed');
  assert.equal(e.attendancePct, null);
});

test('the profile keeps availability and attendance in separate cards', () => {
  const i = html.indexOf('<!-- ATTENDANCE CARD');
  const card = html.slice(i, html.indexOf('<!-- AVAILABILITY THIS WEEK', i));
  const code = strip(card);
  // The attendance half must not read the availability model.
  const attHalf = code.slice(0, code.indexOf('AVAILABILITY ANSWERS'));
  assert.ok(!/m\.trainingPct|m\.matchPct|m\.availabilityPct/.test(attHalf),
    'attendance figures must not come from availability');
  assert.match(attHalf, /attendanceStats\(att\.sessions, playerMatchKey\(p\)/);
  // The old mislabelled counters are gone.
  assert.ok(!/sessionsAttended|sessionsMissed/.test(code),
    '"Attended"/"Missed" counted availability ANSWERS and must not survive');
  assert.match(code, /Availability answers/, 'and what they did measure is labelled honestly');
  assert.match(code, /not whether they came/);
});

// ───────────────────────── identity ─────────────────────────────────────────

test('a rename keeps the attendance', () => {
  // Recorded under one key across two sessions; the name never enters the model.
  const s = { s1: sess('2026-08-04', { 'id:u1': 'present' }),
              s2: sess('2026-08-11', { 'id:u1': 'present' }) };
  const a = AGG(s, 'id:u1', ...SEASON);
  assert.equal(a.present, 2, 'two present sessions under one durable identity');
});

test('two players sharing a name keep separate attendance', () => {
  const s = { s1: sess('2026-08-04', { 'id:uA': 'present', 'id:uB': 'absent' }) };
  assert.equal(AGG(s, 'id:uA', ...SEASON).present, 1);
  assert.equal(AGG(s, 'id:uB', ...SEASON).present, 0);
  assert.equal(AGG(s, 'id:uB', ...SEASON).absent, 1);
});

test('an empty or unresolved identity claims nothing', () => {
  const s = { s1: sess('2026-08-04', { 'id:u1': 'present' }) };
  for (const bad of ['', null, undefined, 'nm:ana silva']) {
    assert.equal(AGG(s, bad, ...SEASON).recorded, 0, JSON.stringify(bad));
  }
});

test('an empty identity cannot claim a malformed record’s empty key', () => {
  // The server refuses a mark whose key is not id:…, but a corrupt or
  // hand-edited document could still hold one. An empty lookup must not match
  // it — otherwise "no identity" would inherit somebody's attendance.
  const s = { s1: sess('2026-08-04', { '': 'present', 'id:u1': 'absent' }) };
  assert.equal(AGG(s, '', ...SEASON).recorded, 0, 'no identity, no record');
  assert.equal(AGG(s, 'id:u1', ...SEASON).absent, 1, 'and the real player is unaffected');
});

// ───────────────────────── season, sessions, dedupe ─────────────────────────

test('a session outside the configured season is another season’s business', () => {
  const s = { s1: sess('2026-06-30', { 'id:u1': 'present' }),   // before season start
              s2: sess('2026-08-04', { 'id:u1': 'present' }),
              s3: sess('2027-07-01', { 'id:u1': 'present' }) }; // after season end
  assert.equal(AGG(s, 'id:u1', ...SEASON).recorded, 1);
});

test('with no season configured, everything dated counts', () => {
  const s = { s1: sess('2020-01-01', { 'id:u1': 'present' }), s2: sess('2030-01-01', { 'id:u1': 'present' }) };
  assert.equal(AGG(s, 'id:u1', '', '').recorded, 2);
});

test('a session with no date is left out rather than guessed into the season', () => {
  const s = { s1: sess('', { 'id:u1': 'present' }) };
  assert.equal(AGG(s, 'id:u1', ...SEASON).recorded, 0);
  assert.equal(AGG(s, 'id:u1', '', '').recorded, 1, 'but it counts when no season is configured');
});

test('one session is counted once', () => {
  const a = AGG({ s1: sess('2026-08-04', { 'id:u1': 'present' }) }, 'id:u1', ...SEASON);
  assert.equal(a.recorded, 1);
  assert.equal(a.present, 1);
});

// ───────────────────────── last training attended ───────────────────────────

test('last attended is the newest PRESENT — never absent, never unrecorded', () => {
  const s = { s1: sess('2026-08-04', { 'id:u1': 'present' }, 'Tuesday training'),
              s2: sess('2026-08-25', { 'id:u1': 'absent'  }, 'Thursday training'),
              s3: sess('2026-08-11', { 'id:u1': 'present' }, 'Skills night'),
              s4: sess('2026-09-01', {}, 'Unrecorded night') };
  const a = AGG(s, 'id:u1', ...SEASON);
  assert.equal(a.lastPresent.date, '2026-08-11', 'the later session was ABSENT, so it is not "attended"');
  assert.equal(a.lastPresent.title, 'Skills night');
});

test('a player never marked present has no last-attended', () => {
  assert.equal(AGG({ s1: sess('2026-08-04', { 'id:u1': 'absent' }) }, 'id:u1', ...SEASON).lastPresent, null);
  assert.equal(AGG({ s1: sess('2026-08-04', {}) }, 'id:u1', ...SEASON).lastPresent, null);
});

test('two present sessions on one day tie-break deterministically', () => {
  const fwd = AGG({ a1: sess('2026-08-04', { 'id:u1': 'present' }), b2: sess('2026-08-04', { 'id:u1': 'present' }) }, 'id:u1', ...SEASON);
  const rev = AGG({ b2: sess('2026-08-04', { 'id:u1': 'present' }), a1: sess('2026-08-04', { 'id:u1': 'present' }) }, 'id:u1', ...SEASON);
  assert.equal(fwd.lastPresent.sessionId, rev.lastPresent.sessionId, 'insertion order must not decide');
  assert.equal(fwd.lastPresent.sessionId, 'a1');
});

test('a training date renders on the right day west of UTC', () => {
  const out = execFileSync(process.execPath, ['-e',
    `${extractFn(html, 'matchDateLabel')}\nprocess.stdout.write(matchDateLabel('2026-08-04'));`],
    { env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' });
  assert.equal(out, '4 Aug', 'a date-only training session must not slip a day');
  assert.equal(LABEL('2026-08-04'), '4 Aug');
});

// ───────────────────────── the client read path ─────────────────────────────

test('a stale group read is unknown, never an empty attendance record', () => {
  const cur = strip(extractFn(html, 'currentAttendance'));
  assert.match(cur, /_attendanceGroup !== gid/, 'a document from another group is not this one’s data');
  assert.match(cur, /return null/);
  const failed = strip(extractFn(html, 'attendanceFailed'));
  assert.match(failed, /_attendanceFailed === \(state\.operationalGroupId \|\| ''\)/);
});

test('a failed read is recorded, and never becomes an empty season', () => {
  const load = strip(extractFn(html, 'loadAttendance'));
  assert.match(load, /if \(!res\.ok\) \{ _attendance = null; _attendanceFailed = gid; return; \}/);
  assert.match(load, /catch \{ _attendance = null; _attendanceFailed = gid; \}/);
  assert.match(load, /_attendanceFailed = null;/, 'a success clears it');
  assert.ok(!/_attendance = \{ sessions: \{\} \}/.test(load.replace(/denied: true[^\n]*/g, '')),
    'a failure must never be turned into an empty attendance document');
});

test('the client asks for the training permission before it asks the server', () => {
  assert.match(strip(extractFn(html, 'loadAttendance')), /canI\('publish_training'\)/);
  assert.match(strip(extractFn(html, 'saveAttendance')), /canI\('publish_training'\)/);
});

test('the screen only claims what the server confirmed', () => {
  const save = strip(extractFn(html, 'saveAttendance'));
  assert.match(save, /if \(!res\.ok \|\| !data\.ok\) throw/);
  assert.match(save, /\[sessionId\]: data\.session/, 'the local copy comes from the SERVER’s record');
  assert.ok(save.indexOf('throw') < save.indexOf('data.session'), 'a refused write updates nothing');
});

// ───────────────────────── bulk, and what it must not do ────────────────────

test('"mark rest present" fills blanks only, and asks first', () => {
  const fn = strip(extractFn(html, 'attendanceMarkAllPresent'));
  assert.match(fn, /if \(k && !existing\[k\]\)/, 'an existing decision is never overwritten');
  // The confirm must GATE the write, not merely be called before it: the
  // early-return form is the assertion, since a call whose result is ignored
  // reads identically to one that guards.
  assert.match(fn, /if \(!\(await ceConfirm\(/, 'the answer must gate the write');
  assert.match(fn, /\{ confirmLabel: 'Mark ' \+ blanks \+ ' present' \}\)\)\) return;/,
    'declining returns without writing');
  assert.ok(fn.indexOf('ceConfirm') < fn.indexOf('saveAttendance'), 'confirm precedes the write');
  assert.match(fn, /playerIsArchived/, 'archived players are not marked');
});

test('opening a session records nothing', () => {
  const i = html.indexOf('<!-- ATTENDANCE — who actually turned up');
  const panel = html.slice(i, html.indexOf('<!-- Printable coach summary', i));
  const code = strip(panel);
  assert.ok(!/saveAttendance\(|attendanceMark\(/.test(code.replace(/onclick="[^"]*"/g, '')),
    'attendance is written only from a click, never while rendering');
  assert.match(code, /onclick="attendanceMark\(/, 'and a click is how it is written');
});

test('the panel shows three states and never pre-fills from availability', () => {
  const i = html.indexOf('<!-- ATTENDANCE — who actually turned up');
  const panel = strip(html.slice(i, html.indexOf('<!-- Printable coach summary', i)));
  assert.match(panel, /not recorded/);
  assert.match(panel, /Loading attendance…/);
  assert.match(panel, /could not be loaded/);
  // Ban the DATA, not the word: the panel's own copy says "Separate from
  // availability", which is the point of it and must stay.
  for (const src of [/sessionRows\(/, /resolvedAnswerFor\(/, /trainingTuesday/, /p\[key\]/, /\bp\.game\b/,
                     /availabilityWeekSessions/, /playerAvailabilityWeek/]) {
    assert.ok(!src.test(panel), `the panel must not read availability via ${src}`);
  }
  assert.match(panel, /Separate from availability/, 'and it says so to the coach');
});
