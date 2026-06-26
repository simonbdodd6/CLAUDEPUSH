import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';
process.env.LOCAL_TZ_OFFSET = '2';

const store = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = store.has(args[0]) ? store.get(args[0]) : null;
  if (command === 'SET') { store.set(args[0], args[1]); result = 'OK'; }
  if (command === 'SCAN') {
    const pattern = args[2] || '*';
    const prefix = pattern.replace('*', '');
    result = ['0', [...store.keys()].filter(item => item.startsWith(prefix))];
  }
  if (command === 'LPUSH') {
    const list = JSON.parse(store.get(args[0]) || '[]');
    list.unshift(args[1]);
    store.set(args[0], JSON.stringify(list));
    result = list.length;
  }
  if (command === 'LTRIM') result = 'OK';
  return { ok: true, json: async () => ({ result }) };
};

const { resolveVariables } = await import('../api/_variables.js');
const { scheduleIsDue, scheduledInstant } = await import('../api/cron.js');
const { default: schedulesHandler } = await import('../api/schedules.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');

function response() {
  return {
    statusCode: null, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test('template variables personalize a notification', () => {
  const text = resolveVariables('Hi {{first_name}} from {{coach_name}} ({{label}})', {
    label: 'Simon Dodd', coachName: 'Coach Nick',
  });
  assert.equal(text, 'Hi Simon from Coach Nick (Simon Dodd)');
});

test('local schedule converts to UTC and fires inside its window', () => {
  const schedule = { active: true, days: ['Wed'], time: '19:45', createdAt: '2026-05-20T12:00:00Z' };
  const now = new Date('2026-05-27T17:45:00Z');
  assert.equal(scheduledInstant(schedule, now, 2).toISOString(), '2026-05-27T17:45:00.000Z');
  assert.equal(scheduleIsDue(schedule, now, 6, 2), true);
  assert.equal(scheduleIsDue({ ...schedule, lastSentAt: now.toISOString() }, now, 6, 2), false);
});

test('schedule API preserves no-reply audience and multi-day selections', async () => {
  store.clear();
  store.set('app:identity:users', JSON.stringify([{ id: 'coach-demo', email: 'coach@example.com', firstName: 'Simon', lastName: 'Coach', displayName: 'Simon Coach' }]));
  store.set('app:identity:team_members', JSON.stringify([{ id: 'tm-coach-demo', teamId: 'boitsfort-rfc', userId: 'coach-demo', role: 'coach', status: 'active' }]));
  const coachSession = await createSession({ userId: 'coach-demo', teamId: 'boitsfort-rfc', role: 'coach' });
  const coachCookie = `${SESSION_COOKIE}=${encodeURIComponent(coachSession.token)}`;

  const res = response();
  await schedulesHandler({
    method: 'POST',
    headers: { cookie: coachCookie },
    body: { id: 'sch-test', name: 'Chase up', templateId: 'tpl-test', days: ['Tue', 'Thu'], time: '19:45', audience: 'no-reply' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.schedule.audience, 'no-reply');
  assert.deepEqual(res.body.schedule.days, ['Tue', 'Thu']);
  assert.ok(store.has('app:schedules'));
});

test('push send is scoped to active members of the sender club only', async () => {
  const { clubMemberSubscriptions } = await import('../api/_lib.js');
  const teamMembers = [
    { teamId: 'beta-test-club', userId: 'player-amy',  status: 'active' },   // member
    { teamId: 'beta-test-club', userId: 'coach-simon', status: 'active' },   // member (sender)
    { teamId: 'other-club',     userId: 'manon',       status: 'active' },   // member of a DIFFERENT club
    { teamId: 'beta-test-club', userId: 'player-old',  status: 'removed' },  // former member, not active
  ];
  const subscriptions = [
    { label: 'Amy',   userId: 'player-amy',  subscription: { endpoint: 'e-amy' } },
    { label: 'Manon', userId: 'manon',       subscription: { endpoint: 'e-manon' } },  // not in beta-test-club
    { label: 'Old',   userId: 'player-old',  subscription: { endpoint: 'e-old' } },    // removed member
    { label: 'Ghost', userId: 'unknown-x',   subscription: { endpoint: 'e-ghost' } },  // no membership at all
  ];
  const scoped = clubMemberSubscriptions(subscriptions, teamMembers, 'beta-test-club');
  const labels = scoped.map(s => s.label);
  assert.deepEqual(labels, ['Amy'], 'only active beta-test-club members receive the notification');
  assert.ok(!labels.includes('Manon'), 'a member of another club must NOT receive it');
  assert.ok(!labels.includes('Old'),   'a removed member must NOT receive it');
  assert.ok(!labels.includes('Ghost'), 'a subscription with no membership must NOT receive it');

  // playerId / legacyPlayerId also resolve to the member id (joined-player aliases).
  const aliasScoped = clubMemberSubscriptions(
    [{ label: 'Aliased', playerId: 'player-amy', subscription: { endpoint: 'e2' } }],
    teamMembers, 'beta-test-club');
  assert.deepEqual(aliasScoped.map(s => s.label), ['Aliased']);
});

test('scheduled automation is scoped to its club — cross-club members excluded', async () => {
  // Mirrors the api/cron.js automation path: targetSubscribers =
  // subscriptionsForMembers(subscribers, activeMemberIdSet(members, schedule.teamId))
  const { activeMemberIdSet, subscriptionsForMembers } = await import('../api/_lib.js');
  const members = [
    { teamId: 'beta-test-club', userId: 'amy',   status: 'active' },
    { teamId: 'other-club',     userId: 'manon', status: 'active' },   // active, but a DIFFERENT club
    { teamId: 'beta-test-club', userId: 'gone',  status: 'removed' },  // removed from this club
  ];
  const subs = [
    { label: 'Amy',   userId: 'amy',   subscription: { endpoint: 'a' } },
    { label: 'Manon', userId: 'manon', subscription: { endpoint: 'm' } },
    { label: 'Gone',  userId: 'gone',  subscription: { endpoint: 'g' } },
    { label: 'Ghost', userId: 'ghost', subscription: { endpoint: 'x' } },  // no membership at all
  ];
  const scoped = subscriptionsForMembers(subs, activeMemberIdSet(members, 'beta-test-club'));
  assert.deepEqual(scoped.map(s => s.label), ['Amy'],
    'a beta-test-club schedule reaches only active beta-test-club members; Manon (other club), Gone (removed) and Ghost (non-member) are excluded');
});

test('weekly reminder reaches active members only, never non-members', async () => {
  const { activeMemberIdSet, subscriptionsForMembers } = await import('../api/_lib.js');
  const members = [
    { teamId: 'beta-test-club', userId: 'amy',  status: 'active' },
    { teamId: 'other-club',     userId: 'bob',  status: 'active' },
    { teamId: 'beta-test-club', userId: 'gone', status: 'removed' },
  ];
  const subs = [
    { label: 'Amy',    userId: 'amy',      subscription: { endpoint: 'a' } },
    { label: 'Bob',    userId: 'bob',      subscription: { endpoint: 'b' } },
    { label: 'Gone',   userId: 'gone',     subscription: { endpoint: 'g' } },
    { label: 'Legacy', userId: 'legacy-x', subscription: { endpoint: 'l' } },
  ];
  const scoped = subscriptionsForMembers(subs, activeMemberIdSet(members)); // union of active members
  assert.deepEqual(scoped.map(s => s.label).sort(), ['Amy', 'Bob'],
    'every active member receives the generic reminder; removed + legacy/non-member excluded');
});

test('cron weekly reminder handler targets only active members (end-to-end)', async () => {
  store.clear();
  const webpush = (await import('web-push')).default;
  const vapid = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  process.env.CRON_SECRET = 'cron-secret';
  store.set('app:identity:team_members', JSON.stringify([
    { teamId: 'beta-test-club', userId: 'amy',  status: 'active' },   // member → targeted
    { teamId: 'beta-test-club', userId: 'gone', status: 'removed' },  // removed → excluded
  ]));
  const sub = endpoint => ({ subscription: { endpoint, keys: { p256dh: vapid.publicKey, auth: 'AAAAAAAAAAAAAAAAAAAAAA' } } });
  store.set('app:subscriptions', JSON.stringify([
    { label: 'Amy',   userId: 'amy',   ...sub('https://example.invalid/amy') },
    { label: 'Gone',  userId: 'gone',  ...sub('https://example.invalid/gone') },
    { label: 'Manon', userId: 'manon', ...sub('https://example.invalid/manon') },  // no membership → excluded
  ]));
  const { default: cronHandler } = await import('../api/cron.js');
  const res = response();
  await cronHandler({ method: 'POST', query: { job: 'reminder' }, headers: { authorization: 'Bearer cron-secret' }, body: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 1, 'only the active member (Amy) is targeted; removed + non-member subscriptions excluded');
});

test('availability saves registered player replies and rejects unknown endpoints', async () => {
  store.clear();
  store.set('app:subscriptions', JSON.stringify([
    { label: 'Simon Dodd', subscription: { endpoint: 'endpoint-1' } },
  ]));
  const good = response();
  await availabilityHandler({
    method: 'POST',
    body: { endpoint: 'endpoint-1', response: 'available', sessionId: 'tue' },
  }, good);
  assert.equal(good.statusCode, 200);
  assert.equal(JSON.parse(store.get('app:availability:tue'))['Simon Dodd'].response, 'available');

  const bad = response();
  await availabilityHandler({
    method: 'POST',
    body: { endpoint: 'not-owned', response: 'available', sessionId: 'tue' },
  }, bad);
  assert.equal(bad.statusCode, 404);
});
