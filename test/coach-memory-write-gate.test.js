/**
 * Build 129 — the COACH_MEMORY_WRITE_ENABLED gate on POST /api/coach-memory.
 *
 * Drives the REAL deployed path (publish function, resource=coach-memory) with real created-club
 * sessions and a mocked Upstash. Proves: writes are refused (404, nothing stored) unless the flag is
 * exactly 'true'; with it, authentication, permission, validation, size limits and session-only
 * club/coach scoping apply unchanged; OPTIONS/non-POST handling is unchanged; the automatic
 * producers are NOT governed by this gate; no API function or route was added. Synthetic data only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.coach-memory-write-gate.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'LRANGE') r = [];
  if (c === 'LPUSH' || c === 'LTRIM' || c === 'EXPIRE') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const identity = await import('../api/_identityStore.js');
const store = await import('../api/_coachMemoryStore.js');
const { coachMemoryWriteEnabled, COACH_MEMORY_WRITE_FLAG } = await import('../api/_coachMemoryRoute.js');
const { default: publish } = await import('../api/publish.js');
const { SESSION_COOKIE } = identity;

const FLAG = 'COACH_MEMORY_WRITE_ENABLED';
const setFlag = v => { if (v === undefined) delete process.env[FLAG]; else process.env[FLAG] = v; };

function res() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
    setHeader() { return this; },
    end() { return this; },
  };
}
async function call(method, body, cookie, query = { resource: 'coach-memory' }) {
  const r = res();
  await publish({ method, headers: cookie ? { cookie } : {}, body: body || undefined, query: { ...query } }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

let _t = 0;
const newCoach = (clubName = 'Alpha RFC') =>
  identity.createClub({ clubName, teamName: 'Seniors', sport: 'rugby', name: 'Head Coach', email: `coach${++_t}@gate.test`, password: 'password123' });
async function newPlayer(teamId) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  kv.set('ce:invites', JSON.stringify([{ token, email: `player${_t}@gate.test`, name: 'Test Player', role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() }]));
  return identity.claimInvite({ position: '2 — Hooker', token, email: `player${_t}@gate.test`, name: 'Test Player', password: 'password123' });
}
const memoryBody = (o = {}) => ({
  type: 'training-preference', statement: 'Short high-tempo blocks hold this group\'s focus.',
  confidence: 0.8, weight: 0.6, tags: ['tempo'], ontologyLinks: [{ kind: 'training', id: 'session-block' }],
  evidenceRefs: ['note-001'], source: 'session-note', ...o,
});
const memoriesOf = c => store.listCoachMemories({ teamId: c.team.id, coachId: c.user.id });

test.beforeEach(() => { kv.clear(); _t = 0; setFlag(undefined); delete process.env.COACH_MEMORY_PRODUCERS_ENABLED; });
test.after(() => { setFlag(undefined); delete process.env.COACH_MEMORY_PRODUCERS_ENABLED; });

test('flag semantics: only the exact string "true" enables writes (pure check)', () => {
  assert.equal(COACH_MEMORY_WRITE_FLAG, FLAG);
  assert.equal(coachMemoryWriteEnabled({}), false);
  assert.equal(coachMemoryWriteEnabled({ [FLAG]: 'true' }), true);
  for (const v of ['', 'false', '1', 'yes', 'TRUE', 'True', ' true', 'true ', 'on']) {
    assert.equal(coachMemoryWriteEnabled({ [FLAG]: v }), false, JSON.stringify(v));
  }
});

test('1. env missing → POST refused with 404 and nothing stored', async () => {
  const coach = await newCoach();
  const r = await call('POST', memoryBody(), ck(coach.session));
  assert.deepEqual([r.statusCode, r.body], [404, { ok: false, error: 'Not found' }]);
  assert.deepEqual(await memoriesOf(coach), []);
});

test('2. env set to anything other than exactly "true" → POST refused with 404', async () => {
  const coach = await newCoach();
  for (const v of ['', 'false', '1', 'yes', 'TRUE', 'True', ' true', 'true ']) {
    setFlag(v);
    const r = await call('POST', memoryBody(), ck(coach.session));
    assert.equal(r.statusCode, 404, JSON.stringify(v));
  }
  assert.deepEqual(await memoriesOf(coach), []);
});

test('3. env exactly "true" → POST persists the memory under the session scope', async () => {
  setFlag('true');
  const coach = await newCoach();
  const r = await call('POST', memoryBody(), ck(coach.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  const stored = await memoriesOf(coach);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, r.body.memory.id);
});

test('4. with writes enabled, authentication and the ai_intelligence permission still apply', async () => {
  setFlag('true');
  const coach = await newCoach();
  const player = await newPlayer(coach.team.id);
  assert.equal((await call('POST', memoryBody())).statusCode, 403, 'no session');
  assert.equal((await call('POST', memoryBody(), ck(player.session))).statusCode, 403, 'player lacks ai_intelligence');
  assert.deepEqual(await memoriesOf(coach), []);
  assert.deepEqual(await store.listCoachMemories({ teamId: coach.team.id, coachId: player.user.id }), []);
});

test('4b. with writes disabled, an unauthenticated POST learns nothing more than 404', async () => {
  const r = await call('POST', memoryBody());
  assert.deepEqual([r.statusCode, r.body], [404, { ok: false, error: 'Not found' }]);
});

test('5. with writes enabled, validation and size limits still apply', async () => {
  setFlag('true');
  const coach = await newCoach();
  for (const bad of [memoryBody({ type: 'match-plan' }), memoryBody({ source: 'scraped' }), memoryBody({ statement: '   ' })]) {
    assert.equal((await call('POST', bad, ck(coach.session))).statusCode, 400);
  }
  const long = await call('POST', memoryBody({ statement: 'x'.repeat(2001) }), ck(coach.session));
  assert.equal(long.statusCode, 400);
  assert.match(long.body.error, /statement is too long/);
  const tags = await call('POST', memoryBody({ tags: Array.from({ length: 101 }, (_, i) => `t${i}`) }), ck(coach.session));
  assert.equal(tags.statusCode, 400);
  assert.match(tags.body.error, /tags has too many items/);
  assert.deepEqual(await memoriesOf(coach), []);
});

test('6. with writes enabled, club/coach scope still comes from the session only', async () => {
  setFlag('true');
  const coach = await newCoach();
  const other = await newCoach('Beta RFC');
  const r = await call('POST', memoryBody({ teamId: other.team.id, clubId: other.team.id, coachId: other.user.id, id: 'forged' }), ck(coach.session));
  assert.equal(r.statusCode, 200);
  assert.notEqual(r.body.memory.id, 'forged');
  assert.equal((await memoriesOf(coach)).length, 1);
  assert.deepEqual(await memoriesOf(other), [], 'the forged club/coach received nothing');
});

test('OPTIONS and non-POST handling are unchanged whether the gate is open or closed', async () => {
  const coach = await newCoach();
  for (const v of [undefined, 'true']) {
    setFlag(v);
    assert.equal((await call('OPTIONS', null, ck(coach.session))).statusCode, 200);
    for (const m of ['GET', 'PUT', 'DELETE']) assert.equal((await call(m, memoryBody(), ck(coach.session))).statusCode, 405, `${m} flag=${v}`);
  }
  assert.deepEqual(await memoriesOf(coach), []);
});

test('the automatic producers are NOT governed by the write gate (their own switch is unchanged)', async () => {
  process.env.COACH_MEMORY_PRODUCERS_ENABLED = 'true';   // write gate left closed
  const coach = await newCoach();
  const r = res();
  await publish({ method: 'POST', headers: { cookie: ck(coach.session) }, query: {}, body: { type: 'sessions', data: [{ id: 's1', title: 'T', type: 'Training' }] } }, r);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const stored = await memoriesOf(coach);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].type, 'training-preference');
});

test('7. no extra API function, no new route, and no hard-coded enablement', () => {
  const fns = fs.readdirSync(new URL('../api/', import.meta.url)).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.equal(fns.length, 12);
  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(vercel.rewrites.map(r => r.source), ['/terms', '/privacy', '/api/roster', '/api/reminder', '/api/coach-memory', '/api/brain-draft']);
  assert.ok(!JSON.stringify(vercel).includes(FLAG), 'vercel.json does not set the flag');
  for (const f of fs.readdirSync(new URL('../api/', import.meta.url)).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(new URL(`../api/${f}`, import.meta.url), 'utf8');
    assert.ok(!new RegExp(`${FLAG}\\s*[:=]+\\s*['"]true`).test(src), `api/${f} must not hard-code the flag on`);
  }
});
