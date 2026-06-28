/**
 * Weekly Availability automation — end-to-end wiring.
 *
 * Root cause fixed here: the schedule is now persisted server-side in the club
 * config (api/publish sanitiseClubConfig), and the cron fires it straight from
 * there, club-scoped. These tests guard persistence, club isolation, dedup and
 * the wiring. Manual /api/push send is unchanged (covered by push-system tests).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.wa.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const store = new Map();
const lists = new Map();
function rangeList(list, s, e) { s = Number(s); e = Number(e); const end = e < 0 ? list.length + e : e; return list.slice(s, end + 1); }
globalThis.fetch = async (url, options = {}) => {
  const parsed = JSON.parse(options.body || '[]');
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'x', url }) };
  const [cmd, ...args] = parsed; let result = null;
  if (cmd === 'GET')   result = store.has(args[0]) ? store.get(args[0]) : null;
  if (cmd === 'SET') { store.set(args[0], args[1]); result = 'OK'; }
  if (cmd === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = rangeList(lists.get(args[0]) || [], args[1], args[2]);
  if (cmd === 'LTRIM') { lists.set(args[0], rangeList(lists.get(args[0]) || [], args[1], args[2])); result = 'OK'; }
  if (cmd === 'DEL') { store.delete(args[0]); lists.delete(args[0]); result = 1; }
  return { ok: true, json: async () => ({ result }) };
};

const { createSession } = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { weeklyAvailabilityDue } = await import('../api/cron.js');
const { activeMemberIdSet, subscriptionsForMembers, clubMemberSubscriptions } = await import('../api/_lib.js');

function apiReq(method, { query = {}, body = {}, headers = {} } = {}) { return { method, query, body, headers }; }
function apiRes() { return { statusCode: 0, payload: null, headers: {}, setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; }, end() { return this; } }; }
async function callApi(handler, method, opts = {}) { const res = apiRes(); await handler(apiReq(method, opts), res); return res; }

async function seedCoach(teamId = 'boitsfort-rfc') {
  const users = JSON.parse(store.get('app:identity:users') || '[]');
  const members = JSON.parse(store.get('app:identity:team_members') || '[]');
  if (!users.find(u => u.id === 'coach-demo')) { users.push({ id: 'coach-demo', email: 'coach@x.com', displayName: 'Coach' }); store.set('app:identity:users', JSON.stringify(users)); }
  if (!members.find(m => m.userId === 'coach-demo')) { members.push({ id: 'tm-coach', teamId, userId: 'coach-demo', role: 'coach', status: 'active' }); store.set('app:identity:team_members', JSON.stringify(members)); }
  const session = await createSession({ userId: 'coach-demo', teamId, role: 'coach' });
  return { headers: { cookie: `ce_session=${encodeURIComponent(session.token)}` } };
}

// ── Persistence (the root-cause fix) ────────────────────────────────────────
test('weekly schedule persists server-side in the club config (sanitised)', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoach();
  const save = await callApi(publishHandler, 'POST', { headers: coach.headers, query: { resource: 'club' }, body: { club: {
    clubName: 'Northgate RFC',
    weeklyAvailability: { enabled: true, training1: { day: 'Fri', time: '07:30' }, training2: { day: 'Wed', time: '09:00' }, match: { day: 'BAD', time: '99:99' } },
  } } });
  assert.equal(save.statusCode, 200, JSON.stringify(save.payload));
  const wa = save.payload.club.weeklyAvailability;
  assert.ok(wa, 'weeklyAvailability persisted (previously stripped by sanitiseClubConfig)');
  assert.equal(wa.enabled, true);
  assert.deepEqual(wa.training1, { day: 'Fri', time: '07:30' });
  assert.deepEqual(wa.match, { day: 'Thu', time: '18:00' }, 'invalid day/time coerced to defaults');
  const got = await callApi(publishHandler, 'GET', { headers: coach.headers, query: { resource: 'club' } });
  assert.equal(got.payload.club.weeklyAvailability.training1.day, 'Fri', 'survives reload');
});

test('a later club save without a schedule keeps the existing one', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoach();
  await callApi(publishHandler, 'POST', { headers: coach.headers, query: { resource: 'club' }, body: { club: { clubName: 'Northgate RFC', weeklyAvailability: { enabled: true, training1: { day: 'Tue', time: '10:00' } } } } });
  const after = await callApi(publishHandler, 'POST', { headers: coach.headers, query: { resource: 'club' }, body: { club: { clubName: 'Northgate RFC' } } });
  assert.equal(after.payload.club.weeklyAvailability.enabled, true, 'existing schedule preserved');
  assert.equal(after.payload.club.weeklyAvailability.training1.time, '10:00');
});

// ── Club isolation — the exact targeting the cron's weekly send uses ─────────
test('weekly send targets ONLY active members of the firing club', () => {
  const members = [
    { userId: 'A1', teamId: 'clubA', status: 'active' },
    { userId: 'A2', teamId: 'clubA', status: 'active' },
    { userId: 'Aremoved', teamId: 'clubA', status: 'removed' },
    { userId: 'B1', teamId: 'clubB', status: 'active' },
  ];
  const subs = [
    { userId: 'A1', subscription: { endpoint: 'a1' } },
    { userId: 'A2', subscription: { endpoint: 'a2' } },
    { userId: 'Aremoved', subscription: { endpoint: 'ar' } },
    { userId: 'B1', subscription: { endpoint: 'b1' } },
    { userId: 'legacy-global', subscription: { endpoint: 'lg' } },
  ];
  const endpoints = subscriptionsForMembers(subs, activeMemberIdSet(members, 'clubA')).map(t => t.subscription.endpoint).sort();
  assert.deepEqual(endpoints, ['a1', 'a2'], 'only active club-A members');
  assert.ok(!endpoints.includes('ar'), 'removed player excluded');
  assert.ok(!endpoints.includes('b1'), 'other-club member excluded');
  assert.ok(!endpoints.includes('lg'), 'legacy/global subscription excluded');
  assert.deepEqual(clubMemberSubscriptions(subs, members, 'clubA').map(t => t.subscription.endpoint).sort(), ['a1', 'a2'], 'chokepoint helper agrees');
});

// ── Timing + dedup (weeklyAvailabilityDue) ──────────────────────────────────
test('weekly session fires once per day, at/after its time, on the right day', () => {
  const now = new Date('2026-07-01T12:05:00.000Z');          // local 13:05 (offset 1)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const localNow = new Date(now.getTime() + 3600000);
  const today = dayNames[localNow.getUTCDay()];
  const otherDay = dayNames[(localNow.getUTCDay() + 1) % 7];

  // scheduled earlier today (09:00 local) and not yet sent → due (fires now, possibly late)
  assert.equal(weeklyAvailabilityDue({ day: today, time: '09:00' }, now, null), true, 'time passed today, not sent → due');
  // already sent today → not due
  assert.equal(weeklyAvailabilityDue({ day: today, time: '09:00' }, now, now.toISOString()), false, 'already sent today → skip');
  // scheduled later today (time not yet reached) → not due
  assert.equal(weeklyAvailabilityDue({ day: today, time: '23:30' }, now, null), false, 'before the time → not due');
  // wrong day → not due
  assert.equal(weeklyAvailabilityDue({ day: otherDay, time: '09:00' }, now, null), false, 'wrong day → not due');
});

// ── Wiring — the cron reads the club config and is club-scoped ──────────────
test('cron fires Weekly Availability from the club config, club-scoped, deduped', () => {
  const cron = readFileSync(new URL('../api/cron.js', import.meta.url), 'utf8');
  assert.ok(/club:\$\{team\.id\}/.test(cron) && cron.includes('weeklyAvailability'), 'reads club:<teamId>.weeklyAvailability');
  assert.ok(cron.includes('activeMemberIdSet(automationMembers, team.id)'), 'delivery scoped to the firing team only');
  assert.ok(cron.includes('weekly_avail_fired'), 'per-day dedup map');
  assert.ok(cron.includes("startsWith('sch-wk-')"), 'legacy client-synced schedules skipped (no double-send)');
});
