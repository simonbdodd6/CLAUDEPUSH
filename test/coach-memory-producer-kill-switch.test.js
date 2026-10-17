/**
 * Core Memory — automatic-producer kill-switch tests.
 *
 * ONE environment flag, COACH_MEMORY_PRODUCERS_ENABLED, gates every automatic Coach Memory producer.
 * Covered here: explicit 'false' writes nothing; explicit 'true' writes; UNSET is safely disabled
 * (fail-safe default); a disabled producer leaves a successful training publish completely intact
 * (200, sessions persisted on the group-scoped key, groupId answered); and the deliberate
 * POST /api/coach-memory capture route (M5) is NOT governed by the switch. The flag is read at call
 * time, so each test sets it explicitly. Same mocked-Upstash harness as the other coach-memory
 * tests; all data is synthetic — no personal data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.coach-memory-kill-switch.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.APP_KEY_PREFIX = 'app';
// These tests exercise real POST /api/coach-memory writes, so the Build 129 write gate is opened.
// Its default-off behaviour is covered by test/coach-memory-write-gate.test.js.
process.env.COACH_MEMORY_WRITE_ENABLED = 'true';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  return { ok: true, json: async () => ({ result: r }) };
};

const identity = await import('../api/_identityStore.js');
const store = await import('../api/_coachMemoryStore.js');
const { produceTrainingPublishMemory, coachMemoryProducersEnabled, COACH_MEMORY_PRODUCERS_FLAG, PRODUCERS_DISABLED } =
  await import('../api/_coachMemoryProducers.js');
const { default: publish } = await import('../api/publish.js');
const { SESSION_COOKIE } = identity;

const FLAG = COACH_MEMORY_PRODUCERS_FLAG;
const setFlag = v => { if (v === undefined) delete process.env[FLAG]; else process.env[FLAG] = v; };

function res() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() {}, end() { return this; } };
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
let _t = 0;
async function newCoach(clubName = 'Alpha RFC') {
  return identity.createClub({ clubName, teamName: 'Seniors', sport: 'rugby', name: 'Head Coach', email: `coach${++_t}@major.test`, password: 'password123' });
}
const someSessions = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, title: `Session ${i + 1}`, type: 'Training' }));
async function publishSessions(session, sessions) {
  const r = res();
  await publish({ method: 'POST', headers: { cookie: ck(session) }, query: {}, body: { type: 'sessions', data: sessions } }, r);
  return r;
}
const SCOPE = { teamId: 'team-alpha', coachId: 'coach-1' };
const seam = { idFactory: () => 'cmem-fixed', clock: () => '2026-01-10T10:00:00.000Z' };

test.beforeEach(() => { kv.clear(); _t = 0; setFlag(undefined); });
test.after(() => setFlag(undefined));

test('the flag is named COACH_MEMORY_PRODUCERS_ENABLED and only the exact string "true" enables', () => {
  assert.equal(FLAG, 'COACH_MEMORY_PRODUCERS_ENABLED');
  assert.equal(coachMemoryProducersEnabled({}), false);                 // unset
  assert.equal(coachMemoryProducersEnabled({ [FLAG]: '' }), false);
  assert.equal(coachMemoryProducersEnabled({ [FLAG]: 'false' }), false);
  assert.equal(coachMemoryProducersEnabled({ [FLAG]: 'true' }), true);
  // anything that is not exactly 'true' stays OFF — no lenient parsing
  for (const v of ['1', 'yes', 'TRUE', 'True', ' true', 'true ', 'on', 'enabled']) {
    assert.equal(coachMemoryProducersEnabled({ [FLAG]: v }), false, `"${v}" must not enable`);
  }
  // the default reads process.env
  setFlag('true'); assert.equal(coachMemoryProducersEnabled(), true);
  setFlag('false'); assert.equal(coachMemoryProducersEnabled(), false);
});

test('1. explicit "false": the producer writes no memory and reports a neutral skip', async () => {
  setFlag('false');
  const result = await produceTrainingPublishMemory({ ...SCOPE, groupId: 'grp_u18', sessionCount: 3 }, seam);
  assert.deepEqual(result, { ok: true, skipped: true, reason: 'producers-disabled' });
  assert.equal(result, PRODUCERS_DISABLED);               // the one shared, frozen result
  assert.deepEqual(await store.listCoachMemories(SCOPE), []);
});

test('2. explicit "true": the producer writes exactly as before — group-aware links intact', async () => {
  setFlag('true');
  const result = await produceTrainingPublishMemory({ ...SCOPE, groupId: 'grp_u18', sessionCount: 3 }, seam);
  assert.equal(result.ok, true);
  assert.equal(result.memory.type, 'training-preference');
  assert.equal(result.memory.statement, 'Published a training schedule of 3 sessions.');
  assert.deepEqual(result.memory.ontologyLinks, [{ kind: 'club', id: 'team-alpha' }, { kind: 'team', id: 'grp_u18' }]);
  assert.deepEqual((await store.listCoachMemories(SCOPE)).map(m => m.id), ['cmem-fixed']);
});

test('3. unset: the producer is safely DISABLED by default', async () => {
  setFlag(undefined);
  assert.equal(process.env[FLAG], undefined);
  const result = await produceTrainingPublishMemory({ ...SCOPE, groupId: 'grp_u18', sessionCount: 3 }, seam);
  assert.deepEqual(result, { ok: true, skipped: true, reason: 'producers-disabled' });
  assert.deepEqual(await store.listCoachMemories(SCOPE), []);
});

test('the switch is evaluated per call — flipping it at runtime takes effect immediately', async () => {
  setFlag('false');
  assert.equal((await produceTrainingPublishMemory({ ...SCOPE, sessionCount: 2 }, seam)).skipped, true);
  setFlag('true');
  assert.equal((await produceTrainingPublishMemory({ ...SCOPE, sessionCount: 2 }, seam)).ok, true);
  assert.equal((await store.listCoachMemories(SCOPE)).length, 1);
  setFlag('false');
  assert.equal((await produceTrainingPublishMemory({ ...SCOPE, sessionCount: 2 }, { ...seam, idFactory: () => 'other' })).skipped, true);
  assert.equal((await store.listCoachMemories(SCOPE)).length, 1);   // nothing more was written
});

test('disabled takes precedence over every other producer outcome (no validation, no store access)', async () => {
  setFlag('false');
  // These would be 'empty-schedule' and 'invalid scope' when enabled; disabled wins and touches nothing.
  assert.deepEqual(await produceTrainingPublishMemory({ ...SCOPE, sessionCount: 0 }, seam), PRODUCERS_DISABLED);
  assert.deepEqual(await produceTrainingPublishMemory({ teamId: '', coachId: '', sessionCount: 3 }, seam), PRODUCERS_DISABLED);
  assert.equal(kv.size, 0);
});

test('4. a disabled producer does not break a successful publish — sessions land, groupId answered, no memory', async () => {
  for (const value of ['false', undefined]) {
    kv.clear(); _t = 0; setFlag(value);
    const coach = await newCoach();
    const scope = { teamId: coach.team.id, coachId: coach.user.id };
    const r = await publishSessions(coach.session, someSessions(3));
    assert.equal(r.statusCode, 200, `flag=${String(value)}`);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.sessions.length, 3);
    assert.equal(r.body.groupId, 'grp_initial');
    // the schedule is persisted on the group-scoped key exactly as when the producer is on
    assert.deepEqual(JSON.parse(kv.get(`app:publish:${coach.team.id}:group:${r.body.groupId}:sessions`)).map(s => s.id), ['s1', 's2', 's3']);
    // and NO automatic memory was created
    assert.deepEqual(await store.listCoachMemories(scope), []);
    assert.equal([...kv.keys()].some(k => k.includes('coach_memory:')), false);
  }
});

test('enabled publish still produces exactly one group-aware memory (regression guard for the ON path)', async () => {
  setFlag('true');
  const coach = await newCoach();
  const r = await publishSessions(coach.session, someSessions(2));
  assert.equal(r.statusCode, 200);
  const memories = await store.listCoachMemories({ teamId: coach.team.id, coachId: coach.user.id });
  assert.equal(memories.length, 1);
  assert.deepEqual(memories[0].ontologyLinks, [{ kind: 'club', id: coach.team.id }, { kind: 'team', id: r.body.groupId }]);
});

test('5. the deliberate POST /api/coach-memory capture route is NOT governed by the producer switch', async () => {
  for (const value of ['false', undefined]) {
    kv.clear(); _t = 0; setFlag(value);
    const coach = await newCoach();
    const r = res();
    await publish({
      method: 'POST', headers: { cookie: ck(coach.session) }, query: { resource: 'coach-memory' },
      body: { type: 'training-preference', statement: 'Short high-tempo blocks hold focus.', confidence: 0.8, weight: 0.5, tags: ['training'], ontologyLinks: [], evidenceRefs: [], source: 'manual' },
    }, r);
    assert.equal(r.statusCode, 200, `flag=${String(value)}`);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.memory.type, 'training-preference');
    assert.equal(r.body.memory.source, 'manual');
    const memories = await store.listCoachMemories({ teamId: coach.team.id, coachId: coach.user.id });
    assert.equal(memories.length, 1);
    assert.equal(memories[0].statement, 'Short high-tempo blocks hold focus.');
  }
});

test('the kill-switch module boundary: the route module never consults the flag; publish.js does not parse it', async () => {
  const fs = await import('node:fs');
  const route = fs.readFileSync(new URL('../api/_coachMemoryRoute.js', import.meta.url), 'utf8');
  const publishSrc = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  const capture = fs.readFileSync(new URL('../api/_coachMemoryCapture.js', import.meta.url), 'utf8');
  for (const [name, src] of [['_coachMemoryRoute.js', route], ['publish.js', publishSrc], ['_coachMemoryCapture.js', capture]]) {
    assert.ok(!src.includes('COACH_MEMORY_PRODUCERS_ENABLED'), `${name} must not read the producer flag`);
  }
  // exactly one place parses the variable (code, not comments)
  const producers = fs.readFileSync(new URL('../api/_coachMemoryProducers.js', import.meta.url), 'utf8');
  const code = producers.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.equal((code.match(/process\.env/g) || []).length, 1, 'the flag is read in one place only');
});
