/**
 * Core Memory M6 — Coach Memory producer unit tests.
 *
 * Drives the REAL produceTrainingPublishMemory → M4 capture → M1 store path (mocked Upstash). Verifies:
 * a valid publish produces a fixed, PII-free training-preference memory with the documented
 * confidence/weight and a count-derived statement (singular vs plural); an empty schedule is a no-op;
 * an invalid scope reports ok:false and stores nothing; the producer never throws (even on a storage
 * failure); and the whole path is deterministic under an injected clock/id. All data is synthetic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.coach-memory-producers.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
let failWrites = false;
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  if (c === 'SET' && failWrites) return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_coachMemoryStore.js');
const { produceTrainingPublishMemory } = await import('../api/_coachMemoryProducers.js');

const SCOPE = { teamId: 'team-alpha', coachId: 'coach-1' };
const seam = (id = 'cmem-fixed', createdAt = '2026-01-10T10:00:00.000Z') => ({ idFactory: () => id, clock: () => createdAt });

test.beforeEach(() => { kv.clear(); failWrites = false; });

test('a valid publish produces a fixed training-preference memory with documented rules', async () => {
  const result = await produceTrainingPublishMemory({ ...SCOPE, sessionCount: 3 }, seam());
  assert.equal(result.ok, true);
  const m = result.memory;
  assert.equal(m.type, 'training-preference');
  assert.equal(m.statement, 'Published a training schedule of 3 sessions.');
  assert.equal(m.confidence, 0.9);
  assert.equal(m.weight, 0.3);
  assert.equal(m.source, 'assistant-derived');
  assert.deepEqual(m.tags, ['training', 'schedule', 'published']);
  assert.deepEqual(m.ontologyLinks, [{ kind: 'team', id: 'team-alpha' }]);
  assert.deepEqual(m.evidenceRefs, ['publish:sessions']);
  assert.match(m.id, /^cmem-fixed$/);
  assert.equal(m.createdAt, '2026-01-10T10:00:00.000Z');
  // persisted under the coach's own scope
  assert.deepEqual((await store.listCoachMemories(SCOPE)).map(x => x.id), ['cmem-fixed']);
});

test('the statement is singular for one session, plural otherwise', async () => {
  const one = await produceTrainingPublishMemory({ ...SCOPE, sessionCount: 1 }, seam('a'));
  const many = await produceTrainingPublishMemory({ ...SCOPE, sessionCount: 5 }, seam('b'));
  assert.equal(one.memory.statement, 'Published a training schedule of 1 session.');
  assert.equal(many.memory.statement, 'Published a training schedule of 5 sessions.');
});

test('an empty schedule (sessionCount 0) writes no memory and reports a neutral skip', async () => {
  const result = await produceTrainingPublishMemory({ ...SCOPE, sessionCount: 0 }, seam());
  assert.deepEqual(result, { ok: true, skipped: true, reason: 'empty-schedule' });
  assert.deepEqual(await store.listCoachMemories(SCOPE), []);
});

test('an invalid scope reports ok:false and stores nothing — never throws', async () => {
  for (const badScope of [{ coachId: 'coach-1' }, { teamId: 'team-alpha' }, { teamId: '', coachId: 'coach-1' }, {}]) {
    let result;
    await assert.doesNotReject(async () => { result = await produceTrainingPublishMemory({ ...badScope, sessionCount: 3 }, seam()); });
    assert.equal(result.ok, false);
    assert.match(result.error, /invalid scope/);
  }
  assert.equal(kv.size, 0);
});

test('the produced memory contains no player data, names, emails, titles or dates', async () => {
  const result = await produceTrainingPublishMemory({ ...SCOPE, sessionCount: 4 }, seam());
  const json = JSON.stringify(result.memory);
  assert.doesNotMatch(json, /player(Id|Name|s)\b/i);              // no player data anywhere
  assert.doesNotMatch(json, /[\w.+-]+@[\w-]+\.[a-z]/i);           // no emails anywhere
  // the statement itself carries no date, session title, or email (createdAt is a permitted field, not in the statement)
  assert.doesNotMatch(result.memory.statement, /\d{4}-\d{2}-\d{2}|title|@/i);
  assert.equal(result.memory.statement, 'Published a training schedule of 4 sessions.');
});

test('the producer never throws even when the storage write fails', async () => {
  failWrites = true;
  let result;
  await assert.doesNotReject(async () => { result = await produceTrainingPublishMemory({ ...SCOPE, sessionCount: 2 }, seam()); });
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === 'string' && result.error.length > 0);
  assert.equal(kv.size, 0);
});

test('the whole path is deterministic under an injected clock + id', async () => {
  await produceTrainingPublishMemory({ teamId: 't', coachId: 'c', sessionCount: 3 }, seam('fixed', '2026-01-10T10:00:00.000Z'));
  const runA = JSON.stringify(await store.listCoachMemories({ teamId: 't', coachId: 'c' }));
  kv.clear();
  await produceTrainingPublishMemory({ teamId: 't', coachId: 'c', sessionCount: 3 }, seam('fixed', '2026-01-10T10:00:00.000Z'));
  const runB = JSON.stringify(await store.listCoachMemories({ teamId: 't', coachId: 'c' }));
  assert.equal(runA, runB);
});
