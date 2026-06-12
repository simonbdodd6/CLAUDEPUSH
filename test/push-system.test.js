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
const { default: schedulesHandler } = await import('../api/message-config.js');
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
    query: { resource: 'schedules' },
    body: { id: 'sch-test', name: 'Chase up', templateId: 'tpl-test', days: ['Tue', 'Thu'], time: '19:45', audience: 'no-reply' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.schedule.audience, 'no-reply');
  assert.deepEqual(res.body.schedule.days, ['Tue', 'Thu']);
  assert.ok(store.has('app:schedules'));
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
