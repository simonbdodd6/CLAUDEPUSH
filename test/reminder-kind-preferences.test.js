/**
 * NOTIFICATIONS — Match reminders and Training reminders each govern their own kind.
 *
 * The preference check used to read the kind from the session id: only the
 * legacy generic `game` card was a match, so a reminder for a REAL fixture
 * (its own id) was governed by Training reminders, and the weekly round-up —
 * tagged `game` while covering the whole week — by Match reminders.
 *
 * The kind is now classified from the club's own records (_reminderKind.js):
 * a club fixture is a match, an occurrence of a club training slot is
 * training, several of one kind take that kind, and a mix or nothing named is
 * the whole week — withheld only from someone who turned BOTH off. These tests
 * run the pure classifier, the preference matrix, and the real push handler
 * against a stub store with players holding each combination of preferences.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.reminder-kind.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const lists = new Map();
const rangeList = (list, start, end) => list.slice(Number(start), (Number(end) < 0 ? list.length + Number(end) : Number(end)) + 1);
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); lists.delete(args[0]); result = 1; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = rangeList(lists.get(args[0]) || [], args[1], args[2]);
  if (command === 'LTRIM')  { lists.set(args[0], rangeList(lists.get(args[0]) || [], args[1], args[2])); result = 'OK'; }
  if (command === 'SCAN') result = ['0', []];
  return { ok: true, json: async () => ({ result }) };
};

// Throwaway VAPID keys; every endpoint is a closed local port, so nothing is delivered.
const webpush = (await import('web-push')).default;
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY  = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
// Record exactly WHO each send reaches (the handler uses this same module instance).
let sentTo = [];
webpush.sendNotification = async subscription => { sentTo.push(String(subscription.endpoint).split('/').pop()); return { statusCode: 201 }; };

const { classifyReminderKind, availabilityReminderKind } = await import('../api/_reminderKind.js');
const { notificationAllowed, createSession, SESSION_COOKIE, DEFAULT_TEAM } = await import('../api/_identityStore.js');
const { default: pushHandler } = await import('../api/push.js');

const CLUB = DEFAULT_TEAM.id;
const FIXTURE = 'fx_sat_kituro';
const SLOTS = [{ id: 'slot_tue', sessionId: 'tue', day: 'Tue', startTime: '19:00' }, { id: 'slot_thu', sessionId: 'thu', day: 'Thu', startTime: '19:00' }];
const TRAINING = 'slot_tue-20261027';

// ── 1. the pure classifier ──────────────────────────────────────────────────

const recs = { fixtureIds: [FIXTURE], slots: SLOTS };
test('classifier: a club fixture is a match; a slot occurrence (dated, own id or legacy name) is training', () => {
  assert.equal(classifyReminderKind({ ...recs, sessionIds: [FIXTURE] }), 'match');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: [TRAINING] }), 'training');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: ['slot_thu'] }), 'training');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: ['tue'] }), 'training', 'legacy name, via the slot table');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: ['tue-20261027'] }), 'training');
});

test('classifier: several of one kind keep it; a mix, or nothing named, is the whole week', () => {
  assert.equal(classifyReminderKind({ ...recs, sessionIds: [TRAINING, 'slot_thu-20261029'] }), 'training');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: [FIXTURE, TRAINING] }), 'week');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: [] }), 'week');
});

test('classifier: the records win over the sender; the declared kind is used only for an id with no record', () => {
  assert.equal(classifyReminderKind({ ...recs, sessionIds: [FIXTURE], declaredKind: 'training' }), 'match');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: ['game'], declaredKind: 'match' }), 'match', 'the generic match card');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: ['game'] }), 'week', '`game` alone is not proof of a match');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: ['fx_unknown'] }), 'week');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: ['fx_unknown'], declaredKind: 'nonsense' }), 'week');
  assert.equal(classifyReminderKind({ ...recs, sessionIds: [], declaredKind: 'training' }), 'training');
});

test('classifier: an id shaped like a slot but absent from the records is NOT assumed to be training', () => {
  assert.equal(classifyReminderKind({ ...recs, sessionIds: ['slot_fri-20261030'] }), 'week');
});

// ── 2. the preference matrix ────────────────────────────────────────────────

const P = { offMatch: { matchReminders: false }, offTraining: { trainingReminders: false },
  offBoth: { matchReminders: false, trainingReminders: false }, offPush: { pushEnabled: false } };
const allowed = (who, kind, type = 'availability') => notificationAllowed(P, who, { type, kind });

test('preferences: Match and Training each stop only their own kind, independently', () => {
  assert.equal(allowed('offMatch', 'match'), false);
  assert.equal(allowed('offMatch', 'training'), true);
  assert.equal(allowed('offTraining', 'training'), false);
  assert.equal(allowed('offTraining', 'match'), true);
});

test('preferences: the whole week stops only when both are off; push off stops everything', () => {
  assert.equal(allowed('offMatch', 'week'), true);
  assert.equal(allowed('offTraining', 'week'), true);
  assert.equal(allowed('offBoth', 'week'), false);
  for (const k of ['match', 'training', 'week']) assert.equal(allowed('offPush', k), false);
  assert.equal(allowed('offPush', '', 'message'), false);
});

test('preferences: non-availability messages ignore the reminder toggles; no stored preference allows all', () => {
  assert.equal(allowed('offBoth', '', 'message'), true);
  for (const k of ['match', 'training', 'week']) assert.equal(allowed('nobody', k), true);
});

test('preferences: a caller passing no kind keeps the old id reading (unchanged contract)', () => {
  assert.equal(notificationAllowed(P, 'offMatch', { type: 'availability', sessionId: 'game' }), false);
  assert.equal(notificationAllowed(P, 'offMatch', { type: 'availability', sessionId: 'tue' }), true);
});

// ── 3. the real push handler, against the club's records ────────────────────

const MEMBERS = [
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true, accessProfile: 'full' },
  ...['none', 'offMatch', 'offTraining', 'offBoth'].map(p => ({ id: `m-${p}`, teamId: CLUB, userId: `u-${p}`, role: 'player', status: 'active', playerGroupId: 'grp_initial' })),
];
const PREFS = { 'u-offMatch': P.offMatch, 'u-offTraining': P.offTraining, 'u-offBoth': P.offBoth };
let cookie = '';
async function seed() {
  kv.clear(); lists.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId,
    ...(PREFS[m.userId] ? { preferences: PREFS[m.userId] } : {}) }))));
  kv.set('app:identity:player_profiles', JSON.stringify(MEMBERS.filter(m => m.role === 'player').map(m => ({ teamId: CLUB, userId: m.userId }))));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [
    { id: FIXTURE, opposition: 'Kituro', date: '2026-10-31', kickoffTime: '15:00', groupId: 'grp_initial', status: 'scheduled' }] }));
  kv.set(`app:publish:${CLUB}:training_schedule`, JSON.stringify({ slots: SLOTS }));
  kv.set('app:subscriptions', JSON.stringify(MEMBERS.filter(m => m.role === 'player').map(m => (
    { userId: m.userId, label: m.userId, subscription: { endpoint: `https://127.0.0.1:9/${m.userId}`, keys: { p256dh: 'x', auth: 'y' } } }))));
  const s = await createSession({ userId: 'u-owner', teamId: CLUB, role: 'admin' });
  cookie = `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
}
async function push(body) {
  const out = { code: 0, body: null };
  const res = { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, end() { return this; }, setHeader() {} };
  const before = JSON.parse(kv.get('app:identity:users'));
  sentTo = [];
  await pushHandler({ method: 'POST', query: {}, headers: { cookie }, body: { title: 'Availability', body: 'Please answer', type: 'availability', ...body } }, res);
  assert.deepEqual(JSON.parse(kv.get('app:identity:users')), before, 'sending never writes anyone\'s preferences');
  out.to = sentTo.slice().sort();
  return out;
}
const who = r => r.to;

test('push: a reminder for a REAL fixture obeys Match reminders, not Training reminders', async () => {
  await seed();
  const r = await push({ sessionId: FIXTURE });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.deepEqual(who(r), ['u-none', 'u-offTraining'], 'offMatch and offBoth do not receive it');
});

test('push: a reminder for a training occurrence obeys Training reminders', async () => {
  await seed();
  const r = await push({ sessionId: TRAINING });
  assert.deepEqual(who(r), ['u-none', 'u-offMatch']);
});

test('push: a chase naming both kinds is the whole week — withheld only from both-off', async () => {
  await seed();
  const r = await push({ sessionIds: [FIXTURE, TRAINING] });
  assert.deepEqual(who(r), ['u-none', 'u-offMatch', 'u-offTraining'], 'everyone but offBoth');
});

test('push: the generic match card is a match because its sender says so; a declared kind never overrides a record', async () => {
  await seed();
  assert.deepEqual(who(await push({ sessionId: 'game', reminderKind: 'match' })), ['u-none', 'u-offTraining']);
  await seed();
  assert.deepEqual(who(await push({ sessionId: FIXTURE, reminderKind: 'training' })), ['u-none', 'u-offTraining'], 'still a match');
  await seed();
  assert.deepEqual(who(await push({ sessionId: 'game' })), ['u-none', 'u-offMatch', 'u-offTraining'], 'nothing proves `game` is a match → the whole week');
});

test('push: an ordinary message ignores the reminder toggles', async () => {
  await seed();
  const r = await push({ type: 'message', sessionId: FIXTURE });
  assert.deepEqual(who(r), ['u-none', 'u-offBoth', 'u-offMatch', 'u-offTraining']);
});

test('the classifier reads the stored records the scheduled-reminder path uses', async () => {
  await seed();
  assert.equal(await availabilityReminderKind(CLUB, { sessionIds: [FIXTURE] }), 'match');
  assert.equal(await availabilityReminderKind(CLUB, { sessionIds: [TRAINING] }), 'training');
  assert.equal(await availabilityReminderKind(CLUB, { sessionIds: [] }), 'week');
  assert.equal(await availabilityReminderKind('club_other', { sessionIds: [FIXTURE] }), 'week', 'another club\'s fixture is not this club\'s record');
});

// ── 4. every sender passes an explicit kind ─────────────────────────────────

test('cron: the weekly automation and the weekly chase are the whole week; a schedule is classified from its records', () => {
  const cron = fs.readFileSync(new URL('../api/cron.js', import.meta.url), 'utf8');
  const calls = [...cron.matchAll(/notificationAllowed\(([^;]*?)\)\)/g)].map(m => m[1]);
  assert.equal(calls.length, 3, 'three cron senders consult the preferences');
  assert.equal(calls.filter(c => /kind: 'week'/.test(c)).length, 2, 'weekly automation + weekly chase: the whole week');
  assert.match(cron, /availabilityReminderKind\(schedule\.teamId, \{ sessionIds: schedule\.sessionId \? \[String\(schedule\.sessionId\)\] : \[\] \}\)/);
  assert.doesNotMatch(cron, /waPrefs\[item\.userId\]\?\.pushEnabled !== false/, 'the automation no longer ignores the reminder toggles');
  const pushSrc = fs.readFileSync(new URL('../api/push.js', import.meta.url), 'utf8');
  assert.match(pushSrc, /notificationAllowed\(prefMap, item\.userId, \{ type, sessionId, kind \}\)/);
});
