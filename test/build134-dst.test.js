/**
 * REMINDERS FIRE AT THE CLUB'S LOCAL TIME ON BOTH SIDES OF DAYLIGHT SAVING (Build 134)
 *
 * The cron's local clock was UTC + LOCAL_TZ_OFFSET, one fixed number (default
 * +1). Belgium is +2 in summer: every scheduled reminder fired an hour late
 * from late March to late October, or an hour early in winter if someone had
 * set 2 — and the next change fell on Sunday 25 October 2026. The offset is
 * now read from the time-zone database for each instant: LOCAL_TIMEZONE (IANA)
 * or Europe/Brussels. LOCAL_TZ_OFFSET is ignored. These cases pin the actual
 * decisions the scheduler makes, not just the arithmetic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.b134-dst.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
const cron = await import('../api/cron.js');
const { zoneOffsetHours, localTimeZone, scheduledInstant, scheduleIsDue, weeklyAvailabilityDecision, weeklyAvailabilityDue } = cron;

const withZone = (zone, fn) => { const prev = process.env.LOCAL_TIMEZONE; if (zone === undefined) delete process.env.LOCAL_TIMEZONE; else process.env.LOCAL_TIMEZONE = zone; try { return fn(); } finally { if (prev === undefined) delete process.env.LOCAL_TIMEZONE; else process.env.LOCAL_TIMEZONE = prev; } };
const iso = d => new Date(d).toISOString();

test('the zone, not a number: Europe/Brussels by default; LOCAL_TZ_OFFSET is ignored; an unknown zone falls back safely', () => {
  withZone(undefined, () => {
    process.env.LOCAL_TZ_OFFSET = '5';
    try {
      assert.equal(localTimeZone(), 'Europe/Brussels');
      assert.equal(cron.localUTCOffset(new Date('2026-07-01T12:00:00Z')), 2, 'summer: +2 whatever LOCAL_TZ_OFFSET says');
      assert.equal(cron.localUTCOffset(new Date('2026-12-01T12:00:00Z')), 1, 'winter: +1');
    } finally { delete process.env.LOCAL_TZ_OFFSET; }
  });
  withZone('Not/AZone', () => assert.equal(localTimeZone(), 'Europe/Brussels'));
  withZone('America/Santiago', () => assert.equal(localTimeZone(), 'America/Santiago'));
});

test('Europe/Brussels offsets across the 25 Oct 2026 and 28 Mar 2027 transitions (UTC comparison)', () => {
  const cases = [
    ['2026-10-24T12:00:00Z', 2], ['2026-10-25T00:59:00Z', 2], ['2026-10-25T01:00:00Z', 1], ['2026-10-26T12:00:00Z', 1],
    ['2027-03-28T00:59:00Z', 1], ['2027-03-28T01:00:00Z', 2], ['2027-03-29T12:00:00Z', 2],
  ];
  for (const [t, off] of cases) assert.equal(zoneOffsetHours(new Date(t), 'Europe/Brussels'), off, t);
  assert.equal(zoneOffsetHours(new Date('2026-10-24T12:00:00Z'), 'UTC'), 0);
});

test('a 09:00 Brussels reminder is 07:00 UTC before the October change and 08:00 UTC after — on the change day too', () => {
  withZone('Europe/Brussels', () => {
    assert.equal(iso(scheduledInstant({ time: '09:00' }, new Date('2026-10-23T05:00:00Z'))), '2026-10-23T07:00:00.000Z', 'Friday before');
    assert.equal(iso(scheduledInstant({ time: '09:00' }, new Date('2026-10-25T00:30:00Z'))), '2026-10-25T08:00:00.000Z', 'asked at 02:30 CEST on change day → 09:00 CET');
    assert.equal(iso(scheduledInstant({ time: '09:00' }, new Date('2026-10-26T05:00:00Z'))), '2026-10-26T08:00:00.000Z', 'Monday after');
    assert.equal(iso(scheduledInstant({ time: '09:00' }, new Date('2027-03-28T00:30:00Z'))), '2027-03-28T07:00:00.000Z', 'spring change day → 09:00 CEST');
  });
});

test('the weekly availability decision fires at 09:00 LOCAL on both sides — where the fixed +1 fired at 10:00 in summer', () => {
  withZone('Europe/Brussels', () => {
    const slot = { day: 'Mon', time: '09:00' };
    // Monday 19 Oct 2026 (CEST, +2): 06:55Z = 08:55 local → not yet; 07:05Z = 09:05 local → due
    assert.equal(weeklyAvailabilityDue(slot, new Date('2026-10-19T06:55:00Z'), null), false);
    assert.equal(weeklyAvailabilityDue(slot, new Date('2026-10-19T07:05:00Z'), null), true);
    assert.equal(weeklyAvailabilityDue(slot, new Date('2026-10-19T07:05:00Z'), null, 1), false, 'the old fixed +1 would still be waiting (08:05 "local")');
    // Monday 26 Oct 2026 (CET, +1): 07:55Z = 08:55 local → not yet; 08:05Z → due
    assert.equal(weeklyAvailabilityDue(slot, new Date('2026-10-26T07:55:00Z'), null), false);
    assert.equal(weeklyAvailabilityDue(slot, new Date('2026-10-26T08:05:00Z'), null), true);
    // dedup by LOCAL day across the change: sent Sunday 23:30 local (CET) is not "today" on Monday
    assert.equal(weeklyAvailabilityDecision(slot, new Date('2026-10-26T08:05:00Z'), '2026-10-25T22:30:00Z').due, true);
    assert.equal(weeklyAvailabilityDecision(slot, new Date('2026-10-26T08:05:00Z'), '2026-10-26T08:00:00Z').reason, 'already sent today');
    // sent at 00:30 Monday LOCAL (23:30Z Sunday): that IS today locally — no second send
    assert.equal(weeklyAvailabilityDecision(slot, new Date('2026-10-26T08:05:00Z'), '2026-10-25T23:30:00Z').reason, 'already sent today');
  });
});

test('the ±window dispatcher (scheduled messages) follows the zone too', () => {
  withZone('Europe/Brussels', () => {
    const sched = { active: true, days: ['mon'], time: '18:30' };
    assert.equal(scheduleIsDue(sched, new Date('2026-10-19T16:31:00Z'), 6), true, 'CEST 18:31');
    assert.equal(scheduleIsDue(sched, new Date('2026-10-19T17:31:00Z'), 6), false);
    assert.equal(scheduleIsDue(sched, new Date('2026-10-26T17:31:00Z'), 6), true, 'CET 18:31');
    assert.equal(scheduleIsDue(sched, new Date('2026-10-26T16:31:00Z'), 6), false);
  });
});

test('a non-European zone keeps its own rules: America/Santiago (DST) and Asia/Kolkata (+5:30, none)', () => {
  withZone('America/Santiago', () => {
    // Chile: -4 in its winter (Jul), -3 in its summer (Dec)
    assert.equal(cron.localUTCOffset(new Date('2026-07-15T12:00:00Z')), -4);
    assert.equal(cron.localUTCOffset(new Date('2026-12-15T12:00:00Z')), -3);
    assert.equal(iso(scheduledInstant({ time: '09:00' }, new Date('2026-07-15T12:00:00Z'))), '2026-07-15T13:00:00.000Z');
    assert.equal(iso(scheduledInstant({ time: '09:00' }, new Date('2026-12-15T11:00:00Z'))), '2026-12-15T12:00:00.000Z');
  });
  withZone('Asia/Kolkata', () => {
    assert.equal(cron.localUTCOffset(new Date('2026-10-25T12:00:00Z')), 5.5);
    assert.equal(iso(scheduledInstant({ time: '09:00' }, new Date('2026-10-25T02:00:00Z'))), '2026-10-25T03:30:00.000Z');
  });
});

test('an explicit offset argument still wins (callers that know the offset; existing tests)', () => {
  withZone('Europe/Brussels', () => {
    assert.equal(iso(scheduledInstant({ time: '20:45' }, new Date('2026-05-27T15:00:00Z'), 2)), '2026-05-27T18:45:00.000Z');
    assert.equal(weeklyAvailabilityDue({ day: 'Mon', time: '09:00' }, new Date('2026-10-19T07:05:00Z'), null, 0), false);
  });
});
