/**
 * Core Memory M6 — Training-publish → memory integration tests.
 *
 * Drives the REAL POST /api/publish { type:'sessions' } path with a real created-club coach session
 * (mocked Upstash). Verifies the best-effort producer wired into publish.js: a successful publish
 * writes exactly one training memory into the coach's own collection, visible through the unmodified
 * M3 provider; an empty publish writes none; a forced memory-write failure leaves the publish 200
 * unchanged; and tenant isolation holds. index.html is byte-guarded. All data is synthetic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.coach-memory-publish.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
let failMemoryWrites = false;
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  if (c === 'SET' && failMemoryWrites && String(a[0]).includes('coach_memory:')) return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  return { ok: true, json: async () => ({ result: r }) };
};

const identity = await import('../api/_identityStore.js');
const store = await import('../api/_coachMemoryStore.js');
const { createCoachMemoryProvider } = await import('../api/_coachMemoryProvider.js');
const { default: publish } = await import('../api/publish.js');
const { SESSION_COOKIE } = identity;

function res() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() {}, end() { return this; } };
}
async function publishSessions(session, sessions) {
  const r = res();
  await publish({ method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` }, query: {}, body: { type: 'sessions', data: sessions } }, r);
  return r;
}
let _t = 0;
async function newCoach(clubName = 'Alpha RFC') {
  return identity.createClub({ clubName, teamName: 'Seniors', sport: 'rugby', name: 'Head Coach', email: `coach${++_t}@major.test`, password: 'password123' });
}
const someSessions = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, title: `Session ${i + 1}`, type: 'Training' }));

test.beforeEach(() => { kv.clear(); _t = 0; failMemoryWrites = false; });

test('publishing training sessions returns 200 and writes exactly one training memory', async () => {
  const coach = await newCoach();
  const scope = { teamId: coach.team.id, coachId: coach.user.id };
  const r = await publishSessions(coach.session, someSessions(3));
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.sessions.length, 3);   // publish response unchanged

  const memories = await store.listCoachMemories(scope);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, 'training-preference');
  assert.equal(memories[0].source, 'assistant-derived');
  assert.equal(memories[0].statement, 'Published a training schedule of 3 sessions.');
  assert.match(memories[0].id, /^cmem_\d+_[a-z0-9]{1,8}$/);
});

test('the produced memory is visible through the unmodified M3 provider', async () => {
  const coach = await newCoach();
  const scope = { teamId: coach.team.id, coachId: coach.user.id };
  await publishSessions(coach.session, someSessions(2));
  const provider = await createCoachMemoryProvider(scope);
  const memories = provider.getCoachMemories();
  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, 'training-preference');
  assert.equal(provider.getCoachMemoryAdapterReport().neutralDna, false);
});

test('publishing an empty schedule writes no memory (neutral no-op)', async () => {
  const coach = await newCoach();
  const scope = { teamId: coach.team.id, coachId: coach.user.id };
  const r = await publishSessions(coach.session, []);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ok, true);
  assert.deepEqual(await store.listCoachMemories(scope), []);
});

test('a memory-write failure leaves the publish result completely unchanged', async () => {
  const coach = await newCoach();
  const scope = { teamId: coach.team.id, coachId: coach.user.id };
  failMemoryWrites = true;
  const r = await publishSessions(coach.session, someSessions(3));
  // publish still succeeds identically — the producer failure is swallowed
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.sessions.length, 3);
  // and the sessions were still persisted
  assert.deepEqual(JSON.parse(kv.get(`app:publish:${coach.team.id}:sessions`)).map(s => s.id), ['s1', 's2', 's3']);
  // no memory stored
  assert.deepEqual(await store.listCoachMemories(scope), []);
});

test('tenant isolation: each coach\'s publish writes only into their own memory collection', async () => {
  const alpha = await newCoach('Alpha RFC');
  const beta = await newCoach('Beta RFC');
  await publishSessions(alpha.session, someSessions(2));
  await publishSessions(beta.session, someSessions(4));

  const alphaMem = await store.listCoachMemories({ teamId: alpha.team.id, coachId: alpha.user.id });
  const betaMem = await store.listCoachMemories({ teamId: beta.team.id, coachId: beta.user.id });
  assert.equal(alphaMem.length, 1);
  assert.equal(betaMem.length, 1);
  assert.equal(alphaMem[0].statement, 'Published a training schedule of 2 sessions.');
  assert.equal(betaMem[0].statement, 'Published a training schedule of 4 sessions.');
});

test('exercising the publish path does not touch index.html', async () => {
  const before = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const coach = await newCoach();
  await publishSessions(coach.session, someSessions(1));
  const after = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(after, before);
});
