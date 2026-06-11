/**
 * End-to-end production flow for published player-facing state.
 *
 * Simulates the real Belgium U20 beta workflow at API level, in order,
 * against ONE shared Redis store (no kv.clear() between steps — state
 * accumulates exactly as it would in production):
 *
 *  1. Coach saves + publishes a training session
 *  2. Coach builds and publishes a squad
 *  3. A player joins on a completely separate session (different device)
 *  4. Player sees the published sessions
 *  5. Player sees the published squad
 *  6. Refresh preserves state (repeat GET, same data)
 *  7. Logout/login preserves state (destroy session, new session, same data)
 *  8. Unpublished drafts never leak to players:
 *     - coach edits squad to draft → player sees null
 *     - session published flags are accurate (draft sessions report published: false)
 *  9. Redis is the single source of truth: a second "device" coach session
 *     reads back exactly what was written, with no dependency on the
 *     writing session's identity
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.publish-e2e.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();

globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const { createSession, destroySession, SESSION_COOKIE } = await import('../api/_identityStore.js');

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

function buildReq(method, url, body = null, headers = {}) {
  const parsed = new URL(url, 'https://host');
  return { method, url, query: Object.fromEntries(parsed.searchParams.entries()), headers, body: body || {} };
}

async function callPublish(method, url, body, headers) {
  const res = buildRes();
  await publishHandler(buildReq(method, url, body, headers), res);
  return res;
}

function cookieFor(token) {
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` };
}

async function seedUser(id, role) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email: `${id}@e2e.test`, firstName: id, lastName: 'E2E', displayName: id });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    members.push({ id: `tm_${id}`, teamId: 'boitsfort-rfc', userId: id, role, status: 'active' });
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
}

// One shared store across all steps — the whole point of this file.
test('full beta publish flow: coach publishes, player on separate device sees it through refresh and logout/login; drafts never leak', async (t) => {
  kv.clear();
  await seedUser('coach-e2e', 'coach');
  const coachSession = await createSession({ userId: 'coach-e2e', teamId: 'boitsfort-rfc', role: 'coach' });
  const coach = cookieFor(coachSession.token);

  // ── Step 1: coach saves the week's sessions, publishes Tuesday training ────
  await t.test('1. coach saves and publishes a training session', async () => {
    const res = await callPublish('POST', '/api/publish', {
      type: 'sessions',
      data: [
        { id: 'tue',  title: 'Tuesday Training',  type: 'Training', date: '2026-06-16 19:00', focus: 'Defensive line speed', deadline: '', published: true, publishedAt: '2026-06-11T09:00:00.000Z' },
        { id: 'thu',  title: 'Thursday Training', type: 'Training', date: '2026-06-18 19:00', focus: 'Set piece',            deadline: '', published: false },
        { id: 'game', title: 'Match vs France',   type: 'Match',    date: '2026-06-21 15:00', focus: '',                     deadline: '2026-06-19', published: false },
      ],
    }, coach);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.sessions.length, 3);
  });

  // ── Step 2: coach publishes the squad ──────────────────────────────────────
  await t.test('2. coach publishes the squad', async () => {
    const res = await callPublish('POST', '/api/publish', {
      type: 'squad',
      data: {
        published:    true,
        opposition:   'France U20',
        kickoffDate:  '2026-06-21',
        kickoffTime:  '15:00',
        venue:        'Stade Fallon',
        kit:          'Green / Black',
        announcement: 'Tight week of prep — be at the ground by 13:30.',
        formationNames: { '1': 'Arthur Lemoine', '9': 'Noah Vandamme', '10': 'Liam Peeters', '15': 'Emile Janssens' },
        benchPlayers: ['Lucas Maes', 'Milan Claes', '', '', '', '', '', ''],
      },
    }, coach);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.squad.published, true);
  });

  // ── Step 3: player joins on a completely separate session ─────────────────
  await seedUser('player-e2e', 'player');
  let playerSession = await createSession({ userId: 'player-e2e', teamId: 'boitsfort-rfc', role: 'player' });
  let player = cookieFor(playerSession.token);

  // ── Step 4: player sees published sessions ─────────────────────────────────
  await t.test('4. player sees published sessions on their own device', async () => {
    const res = await callPublish('GET', '/api/publish?type=sessions', null, player);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.sessions.length, 3);
    const tue = res.body.sessions.find(s => s.id === 'tue');
    assert.equal(tue.title, 'Tuesday Training');
    assert.equal(tue.focus, 'Defensive line speed');
    assert.equal(tue.published, true);
  });

  // ── Step 5: player sees published squad ────────────────────────────────────
  await t.test('5. player sees the published squad and full team sheet', async () => {
    const res = await callPublish('GET', '/api/publish?type=squad', null, player);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.squad.published, true);
    assert.equal(res.body.squad.opposition, 'France U20');
    assert.equal(res.body.squad.venue, 'Stade Fallon');
    assert.equal(res.body.squad.formationNames['10'], 'Liam Peeters');
    assert.equal(res.body.squad.benchPlayers[1], 'Milan Claes');
    assert.equal(res.body.squad.announcement, 'Tight week of prep — be at the ground by 13:30.');
  });

  // ── Step 6: refresh preserves state ────────────────────────────────────────
  await t.test('6. refresh preserves state — repeated GETs are identical', async () => {
    const first  = await callPublish('GET', '/api/publish?type=all', null, player);
    const second = await callPublish('GET', '/api/publish?type=all', null, player);
    assert.deepEqual(first.body, second.body);
    assert.equal(second.body.squad.published, true);
    assert.equal(second.body.sessions.length, 3);
  });

  // ── Step 7: logout/login preserves state ───────────────────────────────────
  await t.test('7. logout/login preserves state — new session token, same data', async () => {
    await destroySession(playerSession.token);
    const stale = await callPublish('GET', '/api/publish?type=all', null, player);
    assert.equal(stale.statusCode, 401, 'destroyed session must be rejected');

    playerSession = await createSession({ userId: 'player-e2e', teamId: 'boitsfort-rfc', role: 'player' });
    player = cookieFor(playerSession.token);

    const res = await callPublish('GET', '/api/publish?type=all', null, player);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.squad.opposition, 'France U20');
    assert.equal(res.body.sessions.find(s => s.id === 'tue').published, true);
  });

  // ── Step 8a: coach moves squad back to draft — player must see nothing ─────
  await t.test('8a. squad moved back to draft never leaks to players', async () => {
    await callPublish('POST', '/api/publish', { type: 'squad', data: { published: false } }, coach);
    const res = await callPublish('GET', '/api/publish?type=squad', null, player);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.squad, null, 'draft squad must be null for players');
  });

  // ── Step 8b: draft sessions report accurate published flags ────────────────
  await t.test('8b. draft sessions carry published: false so player UI can gate on it', async () => {
    const res = await callPublish('GET', '/api/publish?type=sessions', null, player);
    const thu = res.body.sessions.find(s => s.id === 'thu');
    assert.equal(thu.published, false, 'unpublished session must not claim to be published');
    assert.equal(thu.publishedAt, null);
  });

  // ── Step 9: Redis is the single source of truth ────────────────────────────
  await t.test('9. a second coach device reads exactly what Redis holds — no session-local state', async () => {
    // Re-publish from the original coach session
    await callPublish('POST', '/api/publish', {
      type: 'squad',
      data: { published: true, opposition: 'France U20', formationNames: { '9': 'Noah Vandamme' }, benchPlayers: [] },
    }, coach);

    // A brand-new coach session (different device) reads it back
    const secondDevice = await createSession({ userId: 'coach-e2e', teamId: 'boitsfort-rfc', role: 'coach' });
    const res = await callPublish('GET', '/api/publish?type=all', null, cookieFor(secondDevice.token));
    assert.equal(res.body.squad.opposition, 'France U20');
    assert.equal(res.body.squad.formationNames['9'], 'Noah Vandamme');
    assert.equal(res.body.sessions.length, 3);

    // And the raw Redis keys are the only storage involved
    assert.ok(kv.has('app:publish:squad'), 'squad must live at app:publish:squad');
    assert.ok(kv.has('app:publish:sessions'), 'sessions must live at app:publish:sessions');
    const rawSquad = JSON.parse(kv.get('app:publish:squad'));
    assert.equal(rawSquad.opposition, 'France U20');
  });
});
