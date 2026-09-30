/**
 * TIMEZONE-SAFE DATE HANDLING (Build 106)
 *
 * The machine this suite runs on moved timezone one day and four tests went
 * red without a line of product code changing. One of them was a real defect:
 * medicalDaysOut() subtracted two LOCAL-noon instants and floored elapsed
 * hours over 24, so across a spring clock change seven calendar days were
 * 167 hours — "6 days". It counts calendar days from the date parts in UTC
 * now, like every other date-only value in the app.
 *
 * These tests run the REAL function in child processes whose TZ is set to each
 * zone, because a timezone is process-wide: the same inputs must give the same
 * answer in Brussels, UTC, Santiago and Auckland, on either side of each
 * zone's clock changes, at any time of day.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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

const ZONES = ['Europe/Brussels', 'UTC', 'America/Santiago', 'Pacific/Auckland'];
// Each zone's 2026 clock changes (the date the wall clock moves), and a pair of
// dates seven calendar days apart that straddle each one.
const CLOCK_CHANGES = {
  'Europe/Brussels':  [['2026-03-25', '2026-04-01'], ['2026-10-21', '2026-10-28']],   // forward 29 Mar, back 25 Oct
  'America/Santiago': [['2026-04-01', '2026-04-08'], ['2026-09-02', '2026-09-09']],   // back 5 Apr, forward 6 Sep
  'Pacific/Auckland': [['2026-04-01', '2026-04-08'], ['2026-09-23', '2026-09-30']],   // back 5 Apr, forward 27 Sep
  'UTC':              [['2026-03-25', '2026-04-01'], ['2026-09-23', '2026-09-30']],   // no changes: the control
};
const CASES = [
  ['2026-09-07', '2026-09-08', '1 day'],
  ['2026-09-01', '2026-09-08', '7 days'],
  ['2026-09-08', '2026-09-08', 'Today'],
  ['2026-09-08', '2026-09-08T23:59:59.000Z', 'Today'],          // a full ISO "today" is read as its date
  ['2026-09-20', '2026-09-08', '—'],                            // the future is not a duration
  ['2026-02-30', '2026-03-08', '—'],                            // an impossible date never rolls into March
  ['2026-13-40', '2026-09-08', '—'],
  ['', '2026-09-08', '—'],
  ['not-a-date', '2026-09-08', '—'],
  ['2025-12-31', '2026-01-01', '1 day'],                        // year boundary
  ['2026-01-01', '2026-12-31', '364 days'],
];

/** Run medicalDaysOut on a list of [start, today] pairs inside a child process pinned to `zone`, at `whenLocal` if given. */
function runIn(zone, pairs, { fixedNow = null } = {}) {
  const script = `
    ${fixedNow ? `const Real = Date; const FIX = Real.parse(${JSON.stringify(fixedNow)});
    globalThis.Date = class extends Real { constructor(...a) { if (a.length === 0) super(FIX); else super(...a); } static now() { return FIX; } };` : ''}
    ${fn('medicalDaysOut')}
    const pairs = ${JSON.stringify(pairs)};
    process.stdout.write(JSON.stringify({ tz: process.env.TZ, offsetMinutes: new Date().getTimezoneOffset(), out: pairs.map(([a, b]) => medicalDaysOut(a, b)) }));
  `;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8' }));
}

test('the machine really changes timezone for the child processes (or these tests prove nothing)', () => {
  const offsets = Object.fromEntries(ZONES.map(z => [z, runIn(z, [['2026-09-08', '2026-09-08']]).offsetMinutes]));
  assert.notEqual(offsets['Europe/Brussels'], offsets['America/Santiago'], 'Brussels and Santiago differ: ' + JSON.stringify(offsets));
  assert.equal(offsets['UTC'], 0);
  assert.notEqual(offsets['Pacific/Auckland'], offsets['UTC']);
});

for (const zone of ZONES) {
  test(`medicalDaysOut — ordinary durations are the same in ${zone}`, () => {
    const r = runIn(zone, CASES.map(([a, b]) => [a, b]));
    assert.deepEqual(r.out, CASES.map(c => c[2]), zone);
  });

  test(`medicalDaysOut — seven calendar days across each clock change are seven days in ${zone}`, () => {
    const pairs = CLOCK_CHANGES[zone];
    const r = runIn(zone, pairs);
    assert.deepEqual(r.out, pairs.map(() => '7 days'), `${zone}: ${JSON.stringify(pairs)} → ${JSON.stringify(r.out)}`);
    // and the week split at a day inside it: the two halves must still add up to seven
    const plus = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
    const single = pairs.flatMap(([a, b]) => { const mid = plus(a, 4); return [[a, mid], [mid, b]]; });
    const s = runIn(zone, single);
    assert.ok(s.out.every(v => /^\d+ days?$/.test(v)), zone + ' ' + JSON.stringify(s.out));
    const total = s.out.map(v => Number(v.split(' ')[0]));
    for (let i = 0; i < total.length; i += 2) assert.equal(total[i] + total[i + 1], 7, zone + ': the two halves of each week add up');
  });

  test(`medicalDaysOut — the time of day never moves the answer in ${zone}`, () => {
    // Just after local midnight, at local noon and just before the next midnight: the inputs are dates, not instants.
    for (const iso of ['2026-03-29T00:10:00', '2026-03-29T12:00:00', '2026-03-29T23:50:00', '2026-09-06T00:10:00', '2026-09-27T23:50:00']) {
      const r = runIn(zone, CASES.slice(0, 3), { fixedNow: iso + 'Z' });
      assert.deepEqual(r.out, ['1 day', '7 days', 'Today'], `${zone} at ${iso}`);
    }
  });
}

test('medicalDaysOut — counts from date parts in UTC, never from local instants or floored elapsed hours', () => {
  const body = stripComments(fn('medicalDaysOut'));
  assert.match(body, /Date\.UTC\(/, 'date parts in UTC');
  assert.doesNotMatch(body, /T12:00:00/, 'no local-noon instants');
  assert.doesNotMatch(body, /Math\.floor\(/, 'no floor of elapsed hours');
  assert.match(body, /Math\.round\(\(today - start\) \/ 86400000\)/, 'whole UTC days');
});

test('medicalDaysOut — the dashboard and the popup pass a date-only "today" that other date-only values already use', () => {
  const popup = src.slice(src.indexOf('function openMedicalDetails'), src.indexOf('function openMedicalDetails') + 4000);
  assert.match(popup, /medicalDetailsModel\([\s\S]*?new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\)/, 'the popup passes today as a UTC date-only value');
  const dash = src.slice(src.indexOf('const today   = availToday();'), src.indexOf('const today   = availToday();') + 12000);
  assert.match(dash, /medicalDashboardSummary\([^)]*\btoday\)/, 'the dashboard summary reads availToday()');
  assert.match(dash, /medicalDaysOut\(rec\.dateInjured, today\)/, 'and so does every "out N days" on the dashboard');
});
