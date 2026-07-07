/**
 * Core Memory M3 — Coach Memory provider wiring tests.
 *
 * Drives the REAL store → adapter → provider path (mocked Upstash, same pattern as the store
 * tests). Verifies: empty store yields [] (neutral DNA preserved), stored valid memories reach
 * getCoachMemories() in deterministic order, malformed stored records are excluded safely by the
 * adapter, tenant isolation holds end-to-end, the adapter is demonstrably used, a broken store
 * fails safe to [], nothing is mutated, and index.html is untouched by exercising the path.
 * All data is synthetic — no personal data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.coach-memory-provider.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
let failNextGet = false;
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  if (c === 'GET' && failNextGet) { failNextGet = false; return { ok: false, text: async () => 'boom', json: async () => ({}) }; }
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_coachMemoryStore.js');
const { loadCoachMemoriesForBrain, createCoachMemoryProvider } = await import('../api/_coachMemoryProvider.js');

const SCOPE = { teamId: 'team-alpha', coachId: 'coach-1' };

function entry(overrides = {}) {
  return {
    id: 'mem-001',
    type: 'training-preference',
    statement: 'Short high-tempo blocks hold this group\'s focus.',
    confidence: 0.8,
    weight: 0.6,
    tags: ['tempo'],
    ontologyLinks: [{ kind: 'training', id: 'session-block' }],
    evidenceRefs: ['note-001'],
    source: 'session-note',
    createdAt: '2026-01-10T10:00:00.000Z',
    ...overrides,
  };
}

test.beforeEach(() => { kv.clear(); failNextGet = false; });

test('an empty store yields [] — the neutral-DNA path is preserved', async () => {
  const provider = await createCoachMemoryProvider(SCOPE);
  assert.deepEqual([...provider.getCoachMemories()], []);
  const report = provider.getCoachMemoryAdapterReport();
  assert.equal(report.storeAvailable, true);
  assert.equal(report.adapterUsed, true);
  assert.equal(report.neutralDna, true);
  assert.deepEqual(await loadCoachMemoriesForBrain(SCOPE), []);
});

test('stored valid memories reach getCoachMemories() adapted and in deterministic order', async () => {
  await store.createCoachMemory(SCOPE, entry({ id: 'z-later', createdAt: '2026-01-12T10:00:00.000Z' }));
  await store.createCoachMemory(SCOPE, entry({ id: 'a-early', createdAt: '2026-01-08T10:00:00.000Z', statement: '  Early insight, padded.  ' }));
  const provider = await createCoachMemoryProvider(SCOPE);
  const memories = provider.getCoachMemories();
  assert.deepEqual(memories.map(m => m.id), ['a-early', 'z-later']);
  // adapted M108 shape: fields preserved verbatim, statement trimmed by the normalisation contract
  assert.equal(memories[0].statement, 'Early insight, padded.');
  assert.equal(memories[0].confidence, 0.8);
  assert.equal(memories[0].source, 'session-note');
  assert.deepEqual(memories[0].ontologyLinks, [{ kind: 'training', id: 'session-block' }]);
  assert.deepEqual(memories[0].evidenceRefs, ['note-001']);
  assert.deepEqual(Object.keys(memories[0]).sort(), ['confidence', 'createdAt', 'evidenceRefs', 'id', 'ontologyLinks', 'source', 'statement', 'tags', 'type', 'weight']);
  // repeated loads are byte-identical, and repeated calls return the same frozen result
  assert.equal(JSON.stringify(await loadCoachMemoriesForBrain(SCOPE)), JSON.stringify([...memories]));
  assert.equal(provider.getCoachMemories(), memories);
});

test('malformed stored records are excluded safely — valid records still flow', async () => {
  await store.createCoachMemory(SCOPE, entry());
  // simulate corruption written around the store's validation (e.g. a bad manual write)
  const key = store.coachMemoryKey(SCOPE.teamId, SCOPE.coachId);
  const collection = JSON.parse(kv.get(key));
  collection['mem-corrupt'] = { id: 'mem-corrupt', type: 'not-a-real-type', statement: 'x' };
  kv.set(key, JSON.stringify(collection));

  const provider = await createCoachMemoryProvider(SCOPE);
  assert.deepEqual(provider.getCoachMemories().map(m => m.id), ['mem-001']);
  const report = provider.getCoachMemoryAdapterReport();
  assert.equal(report.adaptedCount, 1);
  assert.equal(report.rejectedCount, 1);
  assert.equal(report.rejected[0].id, 'mem-corrupt');
  assert.match(report.rejected[0].reason, /type must be one of/);
});

test('tenant isolation holds end-to-end — providers never see another team or coach', async () => {
  await store.createCoachMemory({ teamId: 'team-alpha', coachId: 'coach-1' }, entry({ id: 'a1' }));
  await store.createCoachMemory({ teamId: 'team-beta', coachId: 'coach-1' }, entry({ id: 'b1' }));
  await store.createCoachMemory({ teamId: 'team-alpha', coachId: 'coach-2' }, entry({ id: 'c1' }));

  assert.deepEqual((await loadCoachMemoriesForBrain({ teamId: 'team-alpha', coachId: 'coach-1' })).map(m => m.id), ['a1']);
  assert.deepEqual((await loadCoachMemoriesForBrain({ teamId: 'team-beta', coachId: 'coach-1' })).map(m => m.id), ['b1']);
  assert.deepEqual((await loadCoachMemoriesForBrain({ teamId: 'team-alpha', coachId: 'coach-2' })).map(m => m.id), ['c1']);
});

test('an invalid scope fails safe to [] — it can never fall through to another tenant', async () => {
  await store.createCoachMemory(SCOPE, entry());
  for (const badScope of [null, undefined, {}, { teamId: 'team-alpha' }, { teamId: '', coachId: 'coach-1' }]) {
    const provider = await createCoachMemoryProvider(badScope);
    assert.deepEqual([...provider.getCoachMemories()], []);
    const report = provider.getCoachMemoryAdapterReport();
    assert.equal(report.storeAvailable, false);
    assert.equal(report.adapterUsed, false);
    assert.equal(report.neutralDna, true);
    assert.equal(report.issues.length, 1);
  }
});

test('a broken store fails safe to [] with the reason recorded', async () => {
  await store.createCoachMemory(SCOPE, entry());
  failNextGet = true;
  const provider = await createCoachMemoryProvider(SCOPE);
  assert.deepEqual([...provider.getCoachMemories()], []);
  const report = provider.getCoachMemoryAdapterReport();
  assert.equal(report.storeAvailable, false);
  assert.match(report.issues[0], /Upstash HTTP/);
});

test('the adapter is demonstrably used: report carries its fingerprint and counts', async () => {
  await store.createCoachMemory(SCOPE, entry());
  const provider = await createCoachMemoryProvider(SCOPE);
  const report = provider.getCoachMemoryAdapterReport();
  assert.equal(report.adapterUsed, true);
  assert.match(report.adapterFingerprint, /^fnv1a32:[0-9a-f]{8}$/);
  assert.equal(report.adaptedCount, 1);
  assert.equal(report.neutralDna, false);
});

test('provider output is frozen and the store is never mutated through it', async () => {
  await store.createCoachMemory(SCOPE, entry());
  const provider = await createCoachMemoryProvider(SCOPE);
  const memories = provider.getCoachMemories();
  assert.ok(Object.isFrozen(provider));
  assert.ok(Object.isFrozen(memories));
  assert.ok(Object.isFrozen(memories[0]));
  assert.ok(Object.isFrozen(memories[0].ontologyLinks));
  assert.throws(() => { memories[0].statement = 'tampered'; }, TypeError);
  // storage unchanged after provider use
  const fresh = await store.getCoachMemory(SCOPE, 'mem-001');
  assert.match(fresh.statement, /^Short high-tempo/);
});

test('exercising the provider path does not touch index.html', async () => {
  const before = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  await store.createCoachMemory(SCOPE, entry());
  await createCoachMemoryProvider(SCOPE);
  await loadCoachMemoriesForBrain(SCOPE);
  const after = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(after, before);
});
