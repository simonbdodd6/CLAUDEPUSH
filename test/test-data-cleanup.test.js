/**
 * Test-data cleanup tool — unit + integration tests.
 *
 * Unit tests cover the four pure identification predicates exported from
 * api/publish.js. Integration tests exercise the delete_test_data endpoint
 * action end-to-end with a minimal Redis mock.
 *
 * Tests:
 *  1.  isTestSession: flags sessions with TEST in title
 *  2.  isTestSession: does not flag real sessions
 *  3.  isTestAvailEntry: flags test userId
 *  4.  isTestAvailEntry: flags test playerId
 *  5.  isTestAvailEntry: flags "test" label key
 *  6.  isTestAvailEntry: does not flag real entries
 *  7.  isTestChatMessage: flags test senderId
 *  8.  isTestChatMessage: does not flag real messages
 *  9.  isTestRosterPlayer: flags test player ID
 * 10.  isTestRosterPlayer: flags "test" in player name
 * 11.  isTestRosterPlayer: does not flag real players
 * 12.  Safeguard batch: no real data is flagged by any predicate
 * 13.  Endpoint: wrong phrase returns 400
 * 14.  Endpoint: correct phrase deletes test sessions, keeps real ones
 * 15.  Endpoint: correct phrase strips test availability entries
 * 16.  Endpoint: correct phrase removes test chat messages, keeps real ones
 */

import test   from 'node:test';
import assert from 'node:assert/strict';

// Must be set before any api/* imports so the KV layer can initialise.
process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.cleanup.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token-cleanup';
process.env.APP_KEY_PREFIX           = 'app';

// ── Minimal KV store mock ──────────────────────────────────────────────────────
const kv    = new Map();
const lists = new Map(); // key → message[] (index 0 = newest)

globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;

  if (command === 'GET') {
    result = kv.has(args[0]) ? kv.get(args[0]) : null;
  }
  if (command === 'SET') {
    kv.set(args[0], args[1]);
    result = 'OK';
  }
  if (command === 'DEL') {
    kv.delete(args[0]);
    lists.delete(args[0]);
    result = 1;
  }
  if (command === 'LPUSH') {
    const list = lists.get(args[0]) || [];
    list.unshift(args[1]); // newest first
    lists.set(args[0], list);
    result = list.length;
  }
  if (command === 'LRANGE') {
    const list = lists.get(args[0]) || [];
    const start = parseInt(args[1], 10);
    const end   = parseInt(args[2], 10);
    result = end === -1 ? list.slice(start) : list.slice(start, end + 1);
  }
  if (command === 'SCAN') {
    // Args: cursor, 'MATCH', pattern, 'COUNT', n  — find the pattern after MATCH
    const matchIdx = args.indexOf('MATCH');
    const glob     = matchIdx >= 0 ? String(args[matchIdx + 1] || '*') : '*';
    const pattern  = glob.replace(/\./g, '\\.').replace(/\*/g, '.*');
    const re       = new RegExp('^' + pattern + '$');
    const matched  = [...kv.keys(), ...lists.keys()].filter(k => re.test(k));
    result = ['0', [...new Set(matched)]];
  }

  return { ok: true, json: async () => ({ result }) };
};

// ── Import under test ─────────────────────────────────────────────────────────
const {
  default: publishHandler,
  isTestSession,
  isTestAvailEntry,
  isTestChatMessage,
  isTestRosterPlayer,
} = await import('../api/publish.js');

const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code)    { this.statusCode = code; return this; },
    json(data)      { this.body = data;       return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end()           { return this; },
  };
}

function buildReq(method, url, body = null, headers = {}) {
  const parsed = new URL(url, 'https://host');
  return { method, url, query: Object.fromEntries(parsed.searchParams.entries()), headers, body: body || {} };
}

async function seedCoach(id = 'coach-admin', teamId = 'boitsfort-rfc') {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email: `${id}@example.com`, firstName: id, lastName: 'User', displayName: id });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    members.push({ id: `tm_${id}`, teamId, userId: id, role: 'admin', status: 'active' });
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
  const session = await createSession({ userId: id, teamId, role: 'admin' });
  return `${SESSION_COOKIE}=${encodeURIComponent(session.token)}`;
}

async function callClub(body, cookie) {
  const res = buildRes();
  await publishHandler(
    buildReq('POST', '/api/publish?resource=club', body, { cookie }),
    res,
  );
  return res;
}

// ── 1–2. isTestSession ────────────────────────────────────────────────────────

test('isTestSession: flags sessions with TEST in title', () => {
  assert.ok(isTestSession({ title: 'TEST — Week 3' }));
  assert.ok(isTestSession({ title: 'Wednesday test session' }));
  assert.ok(isTestSession({ title: 'test' }));
  assert.ok(isTestSession({ title: 'Pre-season TEST run' }));
});

test('isTestSession: does not flag real sessions', () => {
  assert.ok(!isTestSession({ title: 'Week 3 Lineout Training' }));
  assert.ok(!isTestSession({ title: 'Match vs Anderlecht' }));
  assert.ok(!isTestSession({ title: '' }));
  assert.ok(!isTestSession({}));
  assert.ok(!isTestSession(null));
});

// ── 3–6. isTestAvailEntry ─────────────────────────────────────────────────────

test('isTestAvailEntry: flags entry where value.userId is known test ID', () => {
  assert.ok(isTestAvailEntry('Simon Test Player', { userId: 'player-simon-test', available: true }));
});

test('isTestAvailEntry: flags entry where value.playerId is known test ID', () => {
  assert.ok(isTestAvailEntry('Test Label', { playerId: 'player-simon-test', available: false }));
});

test('isTestAvailEntry: flags entry where label key contains "test"', () => {
  assert.ok(isTestAvailEntry('QA Test Player', { userId: 'user-other', available: true }));
  assert.ok(isTestAvailEntry('test', { available: true }));
});

test('isTestAvailEntry: does not flag real player entries', () => {
  assert.ok(!isTestAvailEntry('John Murphy',   { userId: 'user-001', available: true }));
  assert.ok(!isTestAvailEntry("Cian O'Brien",  { userId: 'user-002', available: false }));
  assert.ok(!isTestAvailEntry('Marc Doyen',    { userId: 'user-003', available: true }));
});

// ── 7–8. isTestChatMessage ────────────────────────────────────────────────────

test('isTestChatMessage: flags messages from known test sender', () => {
  assert.ok(isTestChatMessage({ senderId: 'player-simon-test', text: 'hello' }));
});

test('isTestChatMessage: does not flag real messages', () => {
  assert.ok(!isTestChatMessage({ senderId: 'coach-simon',   text: 'Team talk at 7' }));
  assert.ok(!isTestChatMessage({ senderId: 'user-real-abc', text: 'Available ✓' }));
  assert.ok(!isTestChatMessage({}));
  assert.ok(!isTestChatMessage(null));
});

// ── 9–11. isTestRosterPlayer ──────────────────────────────────────────────────

test('isTestRosterPlayer: flags player with known test user ID', () => {
  assert.ok(isTestRosterPlayer({ id: 'player-simon-test', name: 'Simon Test Player' }));
});

test('isTestRosterPlayer: flags player with "test" in name', () => {
  assert.ok(isTestRosterPlayer({ id: 'user-xyz', name: 'Test Player 1' }));
  assert.ok(isTestRosterPlayer({ id: 'user-abc', name: 'QA test account' }));
});

test('isTestRosterPlayer: does not flag real players', () => {
  assert.ok(!isTestRosterPlayer({ id: 'user-001', name: 'John Murphy' }));
  assert.ok(!isTestRosterPlayer({ id: 'user-002', name: "Cian O'Brien" }));
  assert.ok(!isTestRosterPlayer(null));
  assert.ok(!isTestRosterPlayer({}));
});

// ── 12. Batch safeguard — real data never flagged ─────────────────────────────

test('safeguard: no predicate touches any real production-like records', () => {
  const realSessions = [
    { title: 'Tuesday Lineout Training' },
    { title: 'Match vs Club de Boitsfort' },
    { title: 'Pre-season strength & conditioning' },
  ];
  const realAvail = [
    ['John Murphy',   { userId: 'user-001', available: true  }],
    ["Cian O'Brien",  { userId: 'user-002', available: false }],
    ['Marc Doyen',    { userId: 'user-003', available: true  }],
  ];
  const realMessages = [
    { senderId: 'coach-simon',  text: 'Training at 7pm confirmed' },
    { senderId: 'user-001',     text: 'Available ✓' },
    { senderId: 'user-002',     text: 'Unavailable this week' },
  ];
  const realPlayers = [
    { id: 'user-001', name: 'John Murphy' },
    { id: 'user-002', name: "Cian O'Brien" },
    { id: 'user-003', name: 'Marc Doyen' },
  ];

  assert.equal(realSessions.filter(isTestSession).length,                       0, 'no real sessions flagged');
  assert.equal(realAvail.filter(([l, v]) => isTestAvailEntry(l, v)).length,     0, 'no real avail entries flagged');
  assert.equal(realMessages.filter(isTestChatMessage).length,                   0, 'no real messages flagged');
  assert.equal(realPlayers.filter(isTestRosterPlayer).length,                   0, 'no real players flagged');
});

// ── 13. Endpoint: wrong phrase → 400 ─────────────────────────────────────────

test('delete_test_data: wrong confirmation phrase returns 400', async () => {
  kv.clear(); lists.clear();
  const cookie = await seedCoach('admin-phrase');
  const res = await callClub({ action: 'delete_test_data', confirmPhrase: 'yes please' }, cookie);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body?.error?.includes('DELETE TEST DATA'));
});

test('delete_test_data: empty confirmation phrase returns 400', async () => {
  kv.clear(); lists.clear();
  const cookie = await seedCoach('admin-empty');
  const res = await callClub({ action: 'delete_test_data', confirmPhrase: '' }, cookie);
  assert.equal(res.statusCode, 400);
});

// ── 14. Endpoint: deletes test sessions, keeps real ones ──────────────────────

test('delete_test_data: removes TEST sessions, preserves real sessions', async () => {
  kv.clear(); lists.clear();
  const cookie  = await seedCoach('admin-sessions');
  const teamId  = 'boitsfort-rfc';

  // Seed: 1 test session + 2 real sessions
  const initialSessions = [
    { id: 's1', title: 'TEST — Preseason Run',    type: 'Training', date: '2026-07-01', focus: '', deadline: '', published: false },
    { id: 's2', title: 'Tuesday Lineout Training', type: 'Training', date: '2026-07-08', focus: '', deadline: '', published: true },
    { id: 's3', title: 'Match vs Anderlecht',      type: 'Match',    date: '2026-07-15', focus: '', deadline: '', published: true },
  ];
  kv.set(`app:publish:${teamId}:sessions`, JSON.stringify(initialSessions));

  const res = await callClub({ action: 'delete_test_data', confirmPhrase: 'DELETE TEST DATA' }, cookie);
  assert.equal(res.statusCode, 200, `expected 200 got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.deleted.sessions, 1, 'one test session removed');

  const stored = JSON.parse(kv.get(`app:publish:${teamId}:sessions`) || '[]');
  assert.equal(stored.length, 2, 'two real sessions remain');
  assert.ok(stored.every(s => !s.title.toLowerCase().includes('test')), 'no TEST titles remain');
});

// ── 15. Endpoint: strips test availability entries ────────────────────────────

test('delete_test_data: strips test player availability, keeps real entries', async () => {
  kv.clear(); lists.clear();
  const cookie = await seedCoach('admin-avail');

  // Seed an availability record with one test entry + two real entries
  const avKey = 'app:availability:session-week1';
  kv.set(avKey, JSON.stringify({
    'player-simon-test':      { userId: 'player-simon-test', available: true,  respondedAt: '2026-07-01T10:00:00Z' },
    'John Murphy':            { userId: 'user-001',          available: true,  respondedAt: '2026-07-01T09:00:00Z' },
    "Cian O'Brien":           { userId: 'user-002',          available: false, respondedAt: '2026-07-01T08:00:00Z' },
  }));

  const res = await callClub({ action: 'delete_test_data', confirmPhrase: 'DELETE TEST DATA' }, cookie);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deleted.availability, 1, 'one test entry removed');

  const cleaned = JSON.parse(kv.get(avKey));
  assert.ok(!cleaned['player-simon-test'],         'test player entry removed');
  assert.ok(cleaned['John Murphy'],                'real player kept');
  assert.ok(cleaned["Cian O'Brien"],               'real player kept');
});

// ── 16. Endpoint: removes test chat messages, keeps real ones ─────────────────

test('delete_test_data: removes test messages from conversations', async () => {
  kv.clear(); lists.clear();
  const cookie = await seedCoach('admin-chat');

  // Seed conversations list
  kv.set('app:chat:convs', JSON.stringify([
    { id: 'squad', name: 'Squad', type: 'GROUP', teamId: 'boitsfort-rfc' },
  ]));

  // Seed messages: 1 from test sender, 2 from real senders (newest first in list)
  const msgsKey = 'app:chat:conv:squad:msgs';
  const realMsg1 = JSON.stringify({ id: 'm1', senderId: 'coach-simon', text: 'Training 7pm', ts: 1 });
  const realMsg2 = JSON.stringify({ id: 'm2', senderId: 'user-001',    text: 'Available',    ts: 2 });
  const testMsg  = JSON.stringify({ id: 'm3', senderId: 'player-simon-test', text: 'hello',  ts: 3 });
  // Simulate LPUSH (newest first): testMsg, realMsg2, realMsg1
  lists.set(msgsKey, [testMsg, realMsg2, realMsg1]);

  const res = await callClub({ action: 'delete_test_data', confirmPhrase: 'DELETE TEST DATA' }, cookie);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deleted.messages, 1, 'one test message removed');

  // After cleanup the list should have only the two real messages
  const remaining = (lists.get(msgsKey) || []).map(m => JSON.parse(m));
  assert.equal(remaining.length, 2, 'two real messages remain');
  assert.ok(remaining.every(m => m.senderId !== 'player-simon-test'), 'no test messages remain');
});
