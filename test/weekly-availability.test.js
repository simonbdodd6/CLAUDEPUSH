/**
 * Weekly Availability automation (Overview card) — schedule config helpers.
 *
 * Send targeting / club isolation is enforced by /api/push and api/cron and is
 * covered by team-isolation.test.js + push-system.test.js (Send-now routes through
 * sendAvailabilityNow → /api/push, which restricts delivery to ACTIVE members of
 * the coach's team). These tests cover the schedule config + next-send logic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = start;
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — no closing brace');
}

const DEFAULT_WA = { enabled:false, reminder:{day:'Mon',time:'09:00'}, training1:{day:'Mon',time:'09:00'}, training2:{day:'Wed',time:'09:00'}, match:{day:'Thu',time:'18:00'}, lastSentAt:null, lastAutoSentAt:null, debug:null };
const scope = new Function(
  `const _WA_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
   const defaultState = { weeklyAvailability: ${JSON.stringify(DEFAULT_WA)} };` +
  extractFn(html, 'normalizeWeeklyAvailability') + '\n' + extractFn(html, 'weeklyNextSend') +
  '\nreturn { normalizeWeeklyAvailability, weeklyNextSend };'
)();
const { normalizeWeeklyAvailability, weeklyNextSend } = scope;

test('defaults to a disabled weekly schedule with sensible day/times', () => {
  assert.deepEqual(normalizeWeeklyAvailability(undefined), DEFAULT_WA);
  assert.deepEqual(normalizeWeeklyAvailability(null), DEFAULT_WA);
  assert.equal(normalizeWeeklyAvailability({}).enabled, false);
});

test('schedule values persist (valid day/time kept), invalid coerced to defaults', () => {
  const wa = normalizeWeeklyAvailability({
    enabled: true,
    training1: { day: 'Fri', time: '07:30' },   // valid → kept
    training2: { day: 'Sun', time: '20:00' },    // valid → kept
    match:     { day: 'NOPE', time: '99:99' },   // invalid → defaults
    lastSentAt: '2026-07-01T09:00:00.000Z',
  });
  assert.equal(wa.enabled, true);
  assert.deepEqual(wa.reminder, { day: 'Fri', time: '07:00' }, 'reminder migrates from training1, snapped to the hour');
  assert.deepEqual(wa.training1, { day: 'Fri', time: '07:30' });
  assert.deepEqual(wa.training2, { day: 'Sun', time: '20:00' });
  assert.deepEqual(wa.match, { day: 'Thu', time: '18:00' }, 'invalid match falls back to default');
  assert.equal(wa.lastSentAt, '2026-07-01T09:00:00.000Z');
  // round-trips stably (what persists reloads identically)
  assert.deepEqual(normalizeWeeklyAvailability(wa), wa);
});

test('the weekly reminder is hour-based: any minutes are snapped to :00', () => {
  for (const [given, expected] of [['07:30', '07:00'], ['14:59', '14:00'], ['00:01', '00:00'], ['23:45', '23:00']]) {
    const wa = normalizeWeeklyAvailability({ enabled: true, reminder: { day: 'Mon', time: given } });
    assert.equal(wa.reminder.time, expected, `${given} → ${expected}`);
  }
});

test('enabled flag toggles independently of the times', () => {
  const base = { training1:{day:'Mon',time:'09:00'}, training2:{day:'Wed',time:'09:00'}, match:{day:'Thu',time:'18:00'} };
  assert.equal(normalizeWeeklyAvailability({ ...base, enabled: true }).enabled, true);
  assert.equal(normalizeWeeklyAvailability({ ...base, enabled: false }).enabled, false);
});

test('next send is null when automation is off', () => {
  assert.equal(weeklyNextSend(normalizeWeeklyAvailability({ enabled: false })), null);
  assert.equal(weeklyNextSend(null), null);
});

test('next send is the upcoming weekly reminder', () => {
  const now = new Date(2026, 6, 1, 8, 0, 0); // 08:00 on some weekday
  const today = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
  const wa = normalizeWeeklyAvailability({ enabled: true, reminder: { day: today, time: '09:00' } });
  const next = weeklyNextSend(wa, now);
  assert.ok(next instanceof Date && next > now);
  assert.equal(next.toTimeString().slice(0, 5), '09:00', 'the reminder time');
  assert.equal(next.getDate(), now.getDate(), 'and it is today');
});

test('next send rolls to next week when the reminder already passed today', () => {
  const now = new Date(2026, 6, 1, 12, 0, 0);
  const today = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
  const wa = normalizeWeeklyAvailability({ enabled: true, reminder: { day: today, time: '09:00' } });
  const next = weeklyNextSend(wa, now);
  assert.ok(next - now >= 6 * 24 * 3600 * 1000, 'next occurrence is ~a week away');
});
