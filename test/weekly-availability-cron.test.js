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
const { weeklyAvailabilityDue, weeklyAvailabilityDecision, runWeeklyAvailabilityCheck } = await import('../api/cron.js');
const { default: cronHandler } = await import('../api/cron.js');
const { activeMemberIdSet, subscriptionsForMembers, clubMemberSubscriptions } = await import('../api/_lib.js');

const cronSrc = readFileSync(new URL('../api/cron.js', import.meta.url), 'utf8');
const pushSrc = readFileSync(new URL('../api/push.js', import.meta.url), 'utf8');
// Test env has no LOCAL_TZ_OFFSET → the cron's default offset is +1h. A date whose
// local (UTC+1) clock reads Sunday ~13:00, so 09:00/11:50 slots have already passed.
function sundayLocalAfternoonUTC() {
  let d = new Date('2026-07-01T12:00:00.000Z');
  while (new Date(d.getTime() + 3600000).getUTCDay() !== 0) d = new Date(d.getTime() + 24 * 3600000);
  return d;
}

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

// ── The reported bug: a manual Send Now must not block a later scheduled send ──
test('a manual Send Now earlier the same day does NOT block a scheduled send', () => {
  const now = sundayLocalAfternoonUTC();                // local Sunday ~13:00
  const slot = { day: 'Sun', time: '11:50' };           // passed, not yet fired by the scheduler
  // The scheduler only ever consults the PER-SESSION fired marker (null here);
  // the club's manual lastSentAt is never passed in, so it cannot suppress this.
  assert.equal(weeklyAvailabilityDue(slot, now, null), true, 'due regardless of any manual send today');
  // Structural proof: the scheduler dedups on firedMap[firedKey], not wa.lastSentAt.
  assert.ok(cronSrc.includes('const firedMarker = firedMap[firedKey] || null'),
    'per-session fired marker is read from the dedup map');
  assert.ok(cronSrc.includes('weeklyAvailabilityDecision(slot, now, firedMarker'),
    'the due check is fed the per-session fired marker');
  assert.ok(!/weeklyAvailabilityD(ue|ecision)\([^)]*wa\.lastSentAt/.test(cronSrc),
    'the club/manual lastSentAt is never passed into the due check');
});

// ── T1 / T2 / Match track their last send independently ───────────────────────
test('Training 1, Training 2 and Match dedup independently (per team+session)', () => {
  const now = sundayLocalAfternoonUTC();
  const slot = { day: 'Sun', time: '09:00' };
  // One session already fired today (marker set) → skipped; another not fired → still due.
  assert.equal(weeklyAvailabilityDue(slot, now, now.toISOString()), false, 'a session that fired today is skipped');
  assert.equal(weeklyAvailabilityDue(slot, now, null), true, 'a sibling session that has not fired is still due');
  assert.ok(cronSrc.includes('const firedKey = `${team.id}:${sessionKey}`'),
    'the fired marker is keyed per team AND session, so the three sessions are independent');
});

// ── Sunday local time ─────────────────────────────────────────────────────────
test('a Sunday schedule fires on Sunday (local time)', () => {
  const now = sundayLocalAfternoonUTC();
  assert.equal(new Date(now.getTime() + 3600000).getUTCDay(), 0, 'fixture really is local Sunday');
  assert.equal(weeklyAvailabilityDue({ day: 'Sun', time: '11:50' }, now, null), true, 'Sunday 11:50 → due Sunday afternoon');
  assert.equal(weeklyAvailabilityDue({ day: 'Mon', time: '11:50' }, now, null), false, 'a Monday slot is not due on Sunday');
  assert.equal(weeklyAvailabilityDue({ day: 'Sat', time: '11:50' }, now, null), false, 'a Saturday slot is not due on Sunday');
});

// ── Timezone conversion drives the local day + time ───────────────────────────
test('timezone offset decides the local day and whether the time has passed', () => {
  const now = new Date('2026-07-05T23:30:00.000Z');     // crosses midnight under a +1h offset
  const dayAt = off => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(now.getTime() + off * 3600000).getUTCDay()];
  const utcDay = dayAt(0), nextDay = dayAt(1);
  assert.notEqual(utcDay, nextDay, 'the +1h offset rolls into the next local day');
  assert.equal(weeklyAvailabilityDue({ day: utcDay, time: '12:00' }, now, null, 0), true, 'offset 0 → still that day, time passed → due');
  assert.equal(weeklyAvailabilityDue({ day: utcDay, time: '12:00' }, now, null, 1), false, 'offset +1 → now the next day → that slot is not due');
  assert.equal(weeklyAvailabilityDue({ day: nextDay, time: '00:00' }, now, null, 1), true, 'offset +1 → next day 00:00 has passed → due');
});

// ── No duplicate send for the same scheduled item on the same day ─────────────
test('no duplicate send for the same scheduled item on the same day', () => {
  const now = sundayLocalAfternoonUTC();
  const slot = { day: 'Sun', time: '09:00' };
  assert.equal(weeklyAvailabilityDue(slot, now, null), true, 'first check fires');
  assert.equal(weeklyAvailabilityDue(slot, now, now.toISOString()), false, 'a later check the same day does not re-send');
  assert.equal(weeklyAvailabilityDecision(slot, now, now.toISOString()).reason, 'already sent today');
});

// ── Scheduled path uses the SAME club-scoped targeting as manual Send Now ─────
test('scheduled send targets the same club-scoped recipient set as manual Send Now', () => {
  assert.ok(cronSrc.includes('subscriptionsForMembers(subscribers, activeMemberIdSet(automationMembers, team.id))'),
    'cron restricts delivery to active members of the firing club');
  assert.ok(pushSrc.includes('clubMemberSubscriptions('), 'manual /api/push uses the club-scoped chokepoint');
  // clubMemberSubscriptions IS subscriptionsForMembers ∘ activeMemberIdSet — prove identical output.
  const members = [
    { userId: 'A', teamId: 't', status: 'active' },
    { userId: 'B', teamId: 't', status: 'removed' },
    { userId: 'C', teamId: 'other', status: 'active' },
  ];
  const subs = members.map(m => ({ userId: m.userId, subscription: { endpoint: m.userId } }));
  const viaCron   = subscriptionsForMembers(subs, activeMemberIdSet(members, 't')).map(s => s.subscription.endpoint).sort();
  const viaManual = clubMemberSubscriptions(subs, members, 't').map(s => s.subscription.endpoint).sort();
  assert.deepEqual(viaCron, viaManual, 'scheduled and manual resolve the identical recipients');
  assert.deepEqual(viaCron, ['A'], 'only active members of the firing club');
});

// ── Beta diagnostics — observable scheduler state ─────────────────────────────
test('the cron records automation diagnostics (debug fields) every run', () => {
  assert.ok(cronSrc.includes('debug.lastCheck = now.toISOString()'), 'last automation check');
  assert.ok(cronSrc.includes('d.lastAttempt = now.toISOString()'), 'per-session last scheduled attempt');
  assert.ok(cronSrc.includes("d.lastResult = 'skipped'") && cronSrc.includes('d.skipReason = decision.reason'), 'last result + skip reason');
  assert.ok(cronSrc.includes('d.lastSend = now.toISOString()'), 'last scheduled send time');
  assert.ok(cronSrc.includes('wa.debug = debug; await kvSet(key(`club:${team.id}`), club)'), 'diagnostics persisted to the club config every run');
});

test('weeklyAvailabilityDecision explains why a session did/did not fire', () => {
  const now = sundayLocalAfternoonUTC();
  assert.match(weeklyAvailabilityDecision({ day: 'Mon', time: '09:00' }, now, null).reason, /not scheduled today/);
  assert.match(weeklyAvailabilityDecision({ day: 'Sun', time: '23:30' }, now, null).reason, /before send time/);
  assert.equal(weeklyAvailabilityDecision({}, now, null).reason, 'no schedule set');
  assert.match(weeklyAvailabilityDecision({ day: 'Sun', time: '09:00' }, now, null).reason, /^due/);
});

// ── A frequent trigger is configured so an arbitrary time actually fires ──────
// Vercel Hobby only allows DAILY cron frequency, so minute-level precision comes
// from an external pinger; the Vercel crons are a same-day fallback.
test('a frequent external trigger pings /api/cron, with a daily Vercel fallback', () => {
  const wf = readFileSync(new URL('../.github/workflows/availability-cron.yml', import.meta.url), 'utf8');
  assert.ok(wf.includes('/api/cron') && /cron: '\*\//.test(wf), 'external scheduler pings /api/cron frequently');
  assert.ok(wf.includes('Authorization: Bearer ${CRON_SECRET}'), 'authenticates with the cron secret');
  const vj = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const daily = vj.crons.filter(c => c.path === '/api/cron');
  assert.ok(daily.length >= 4, 'multiple daily Vercel cron runs as a same-day fallback');
  assert.ok(daily.every(c => /^0 \d+ \* \* \*$/.test(c.schedule)), 'Vercel crons stay daily-frequency (Hobby-compatible)');
});

// ── Diagnostics survive a coach schedule edit (publish.js carries debug fwd) ──
test('a coach schedule save does not wipe the cron diagnostics', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoach();
  // Seed a club whose stored config already has cron-written diagnostics.
  store.set('app:club:boitsfort-rfc', JSON.stringify({
    clubName: 'Boitsfort RFC',
    weeklyAvailability: {
      enabled: true, training1: { day: 'Sun', time: '11:50' }, training2: { day: 'Wed', time: '09:00' }, match: { day: 'Thu', time: '18:00' },
      lastSentAt: '2026-07-05T10:00:00.000Z',
      debug: { lastCheck: '2026-07-05T12:00:00.000Z', training1: { lastResult: 'sent 4/4', lastSend: '2026-07-05T12:00:00.000Z' } },
    },
  }));
  // Coach edits the schedule (no debug in the payload).
  const saved = await callApi(publishHandler, 'POST', { headers: coach.headers, query: { resource: 'club' }, body: { club: {
    clubName: 'Boitsfort RFC',
    weeklyAvailability: { enabled: true, training1: { day: 'Sun', time: '12:30' }, training2: { day: 'Wed', time: '09:00' }, match: { day: 'Thu', time: '18:00' } },
  } } });
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.payload));
  assert.equal(saved.payload.club.weeklyAvailability.training1.time, '12:30', 'edit applied');
  assert.ok(saved.payload.club.weeklyAvailability.debug, 'diagnostics preserved');
  assert.equal(saved.payload.club.weeklyAvailability.debug.training1.lastResult, 'sent 4/4', 'prior result carried forward');
});

// ── Shared scheduler path (used by both cron and "Run scheduler check now") ───
// subscribers:[] → no real web-push calls; the due-check + dedup + diagnostics
// path runs end-to-end. DEFAULT_TEAM (boitsfort-rfc) is always in loadTeams().
function seedClub(teamId, wa) {
  store.set(`app:club:${teamId}`, JSON.stringify({ clubName: teamId, weeklyAvailability: wa }));
}
const DUE_SCHEDULE = { enabled: true, training1: { day: 'Sun', time: '09:00' }, training2: { day: 'Wed', time: '09:00' }, match: { day: 'Thu', time: '18:00' } };

test('runWeeklyAvailabilityCheck fires a due session and records rich diagnostics', async () => {
  store.clear(); lists.clear();
  const now = sundayLocalAfternoonUTC();
  seedClub('boitsfort-rfc', { ...DUE_SCHEDULE });
  const report = await runWeeklyAvailabilityCheck({ now, source: 'test', onlyTeamId: 'boitsfort-rfc', subscribers: [], automationMembers: [] });
  assert.ok(report.results.some(r => r.weeklyAvailability === 'boitsfort-rfc:training1'), 'training1 (Sun, passed) fired via the scheduler');
  assert.ok('nextWindow' in report, 'reports the next expected cron window');
  const wa = JSON.parse(store.get('app:club:boitsfort-rfc')).weeklyAvailability;
  assert.ok(/^sent/.test(wa.debug.training1.lastResult), 'training1 result recorded');
  assert.ok(wa.debug.training1.lastSend, 'training1 last send recorded');
  assert.equal(wa.debug.lastCheckSource, 'test', 'records the check source');
  assert.ok(wa.lastAutoSentAt, 'last sent BY AUTOMATION recorded separately from manual');
  assert.match(wa.debug.training2.skipReason, /not scheduled today/, 'Wed session skipped on Sunday, with reason');
});

test('runWeeklyAvailabilityCheck does not re-send the same session the same day (dedup)', async () => {
  store.clear(); lists.clear();
  const now = sundayLocalAfternoonUTC();
  seedClub('boitsfort-rfc', { ...DUE_SCHEDULE });
  const first = await runWeeklyAvailabilityCheck({ now, source: 'test', onlyTeamId: 'boitsfort-rfc', subscribers: [], automationMembers: [] });
  assert.ok(first.results.some(r => r.weeklyAvailability === 'boitsfort-rfc:training1'), 'fired the first time');
  const second = await runWeeklyAvailabilityCheck({ now, source: 'test', onlyTeamId: 'boitsfort-rfc', subscribers: [], automationMembers: [] });
  assert.ok(!second.results.some(r => r.weeklyAvailability === 'boitsfort-rfc:training1'), 'not fired again the same day');
  const dbg = JSON.parse(store.get('app:club:boitsfort-rfc')).weeklyAvailability.debug;
  assert.equal(dbg.training1.blockedByDedup, true, 'dedup-blocked flag surfaced');
  assert.match(dbg.training1.skipReason, /already sent today/);
  assert.equal(dbg.manualSentToday, false, 'an automatic send is NOT counted as a manual send');
});

test('a manual Send Now the same day is reported and does not block the scheduled send', async () => {
  store.clear(); lists.clear();
  const now = sundayLocalAfternoonUTC();
  // Manual send earlier today writes lastSentAt only (no lastAutoSentAt).
  seedClub('boitsfort-rfc', { ...DUE_SCHEDULE, lastSentAt: now.toISOString() });
  const report = await runWeeklyAvailabilityCheck({ now, source: 'test', onlyTeamId: 'boitsfort-rfc', subscribers: [], automationMembers: [] });
  assert.ok(report.results.some(r => r.weeklyAvailability === 'boitsfort-rfc:training1'), 'scheduled send still fires despite the manual send');
  assert.equal(JSON.parse(store.get('app:club:boitsfort-rfc')).weeklyAvailability.debug.manualSentToday, true, 'manual send today is detected + reported');
});

test('runWeeklyAvailabilityCheck only touches the requested club (onlyTeamId)', async () => {
  store.clear(); lists.clear();
  const now = sundayLocalAfternoonUTC();
  store.set('app:identity:teams', JSON.stringify([{ id: 'other-club', name: 'Other' }]));
  seedClub('boitsfort-rfc', { ...DUE_SCHEDULE });
  seedClub('other-club', { ...DUE_SCHEDULE });
  await runWeeklyAvailabilityCheck({ now, source: 'test', onlyTeamId: 'boitsfort-rfc', subscribers: [], automationMembers: [] });
  assert.ok(JSON.parse(store.get('app:club:boitsfort-rfc')).weeklyAvailability.debug, 'requested club checked');
  assert.ok(!JSON.parse(store.get('app:club:other-club')).weeklyAvailability.debug, 'other club untouched');
});

// ── Coach-only "Run scheduler check now" endpoint ────────────────────────────
test('POST resource=availability-check is coach-gated and runs the scheduler path', async () => {
  store.clear(); lists.clear();
  const noauth = await callApi(publishHandler, 'POST', { query: { resource: 'availability-check' }, body: {} });
  assert.ok([401, 403].includes(noauth.statusCode), 'rejects unauthenticated callers');

  const coach = await seedCoach();
  seedClub('boitsfort-rfc', { enabled: true, training1: { day: 'Mon', time: '09:00' }, training2: { day: 'Wed', time: '09:00' }, match: { day: 'Thu', time: '18:00' } });
  const res = await callApi(publishHandler, 'POST', { headers: coach.headers, query: { resource: 'availability-check' }, body: {} });
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.ok(res.payload.report && res.payload.report.checkedAt, 'returns a scheduler report');
  assert.ok('nextWindow' in res.payload.report, 'report includes the next expected cron window');
  assert.ok(res.payload.weeklyAvailability?.debug?.lastCheck, 'the automation check is recorded on the club config');
  assert.equal(res.payload.weeklyAvailability.debug.lastCheckSource, 'coach: Run check now', 'source attributed to the coach action');
});

test('the on-demand check uses the scheduler path, not manual Send Now', () => {
  const pub = readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  assert.ok(pub.includes('runWeeklyAvailabilityCheck('), 'endpoint calls the shared scheduler');
  assert.ok(pub.includes('requireTenantPermission(req, PERM.MANAGE_TEAMS)'), 'coach-gated');
  assert.ok(!pub.includes('/api/push'), 'never routes through the manual Send Now endpoint');
  assert.ok(cronSrc.includes('runWeeklyAvailabilityCheck({'), 'the cron delegates to the same shared scheduler');
});

// ── Unattended path: /api/cron auth (what the GitHub Actions pinger calls) ────
test('/api/cron rejects unauthenticated requests and accepts the CRON_SECRET', async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'unit-test-secret';
  try {
    assert.equal((await callApi(cronHandler, 'POST', {})).statusCode, 401, 'missing secret → 401');
    assert.equal((await callApi(cronHandler, 'POST', { headers: { authorization: 'Bearer nope' } })).statusCode, 401, 'wrong secret → 401');
    const ok = await callApi(cronHandler, 'POST', { headers: { authorization: 'Bearer unit-test-secret' } });
    assert.notEqual(ok.statusCode, 401, 'correct CRON_SECRET → past auth (runs with no coach/UI)');
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev;
  }
});

test('the unattended pinger is wired: 5-minute GitHub Actions cron that tags its source', () => {
  const wf = readFileSync(new URL('../.github/workflows/availability-cron.yml', import.meta.url), 'utf8');
  assert.ok(/cron: '\*\/5 /.test(wf), 'runs every 5 minutes');
  assert.ok(wf.includes('/api/cron?source=github-actions'), 'pings the scheduler endpoint, tagged github-actions');
  assert.ok(wf.includes('Authorization: Bearer ${CRON_SECRET}'), 'authenticates with the CRON_SECRET repo secret');
  assert.ok(/default branch \(main\)/i.test(wf), 'documents the GitHub default-branch requirement');
  // the cron records "Last check source" from the request hint
  assert.ok(/req\.query\?\.source/.test(cronSrc), 'cron labels the diagnostics source from the request');
});
