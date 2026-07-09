/**
 * Core Memory M4 — First Coach Memory capture path tests.
 *
 * Drives the REAL capture → store → provider path (mocked Upstash, same pattern as the store
 * tests). Verifies: a valid manual write persists a normalised M108 entry with server-minted
 * id/createdAt; invalid entries and missing/invalid scope are rejected safely with nothing stored;
 * tenant isolation holds; duplicate ids are rejected; reads are deterministic; the written memory
 * is visible through the UNMODIFIED M3 provider; caller input is never mutated; caller-supplied
 * id/timestamp fields are ignored (server owns them); injected clock/id make the path deterministic;
 * the production defaults mint a Core-convention id + ISO timestamp; and exercising the path never
 * touches index.html. All data is synthetic — no personal data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.coach-memory-capture.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_coachMemoryStore.js');
const { createCoachMemoryProvider } = await import('../api/_coachMemoryProvider.js');
const { captureCoachMemory, defaultCoachMemoryId, defaultCoachMemoryTimestamp } = await import('../api/_coachMemoryCapture.js');

const SCOPE = { teamId: 'team-alpha', coachId: 'coach-1' };

// A deterministic mint seam for tests.
function seam(id = 'cmem-fixed-1', createdAt = '2026-01-10T10:00:00.000Z') {
  return { idFactory: () => id, clock: () => createdAt };
}

// The eight M108 content fields a coach would supply — no id, no timestamp.
function input(overrides = {}) {
  return {
    type: 'training-preference',
    statement: 'Short high-tempo blocks hold this group\'s focus.',
    confidence: 0.8,
    weight: 0.6,
    tags: ['tempo'],
    ontologyLinks: [{ kind: 'training', id: 'session-block' }],
    evidenceRefs: ['note-001'],
    source: 'session-note',
    ...overrides,
  };
}

test.beforeEach(() => kv.clear());

test('a valid manual write persists a normalised M108 entry with server-minted id + createdAt', async () => {
  const stored = await captureCoachMemory(SCOPE, input(), seam('cmem-abc', '2026-01-10T10:00:00.000Z'));
  assert.equal(stored.id, 'cmem-abc');
  assert.equal(stored.createdAt, '2026-01-10T10:00:00.000Z');
  assert.equal(stored.type, 'training-preference');
  assert.equal(stored.confidence, 0.8);
  assert.equal(stored.weight, 0.6);
  assert.equal(stored.source, 'session-note');
  assert.deepEqual(stored.ontologyLinks, [{ kind: 'training', id: 'session-block' }]);
  assert.deepEqual(stored.evidenceRefs, ['note-001']);
  assert.deepEqual(Object.keys(stored).sort(), ['confidence', 'createdAt', 'evidenceRefs', 'id', 'ontologyLinks', 'source', 'statement', 'tags', 'type', 'weight']);
  assert.ok(Object.isFrozen(stored));
  // and it is actually in the store
  assert.deepEqual((await store.listCoachMemories(SCOPE)).map(m => m.id), ['cmem-abc']);
});

test('caller-supplied id / createdAt / updatedAt are ignored — the server owns them', async () => {
  const stored = await captureCoachMemory(SCOPE, input({ id: 'forged-id', createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z', bogus: true }), seam('cmem-server', '2026-02-02T09:00:00.000Z'));
  assert.equal(stored.id, 'cmem-server');
  assert.equal(stored.createdAt, '2026-02-02T09:00:00.000Z');
  assert.equal('updatedAt' in stored, false);
  assert.equal('bogus' in stored, false);
});

test('confidence and weight are required from the caller — never invented', async () => {
  await assert.rejects(captureCoachMemory(SCOPE, input({ confidence: undefined }), seam()), /confidence must be a number in \[0,1\]/);
  await assert.rejects(captureCoachMemory(SCOPE, input({ weight: undefined }), seam('cmem-2')), /weight must be a number in \[0,1\]/);
  assert.deepEqual(await store.listCoachMemories(SCOPE), []);
});

test('invalid entries are rejected safely with nothing stored', async () => {
  await assert.rejects(captureCoachMemory(SCOPE, input({ type: 'match-plan' }), seam('c1')), /type must be one of/);
  await assert.rejects(captureCoachMemory(SCOPE, input({ source: 'scraped' }), seam('c2')), /source must be one of/);
  await assert.rejects(captureCoachMemory(SCOPE, input({ statement: '   ' }), seam('c3')), /statement must be a non-empty string/);
  await assert.rejects(captureCoachMemory(SCOPE, input({ ontologyLinks: [{ kind: 'weather', id: 'x' }] }), seam('c4')), /ontologyLinks must be \{ kind, id \}/);
  await assert.rejects(captureCoachMemory(SCOPE, 'not-an-object', seam('c5')), /requires an input object/);
  assert.deepEqual(await store.listCoachMemories(SCOPE), []);
});

test('missing or invalid scope is rejected before any store access', async () => {
  for (const badScope of [null, undefined, {}, { teamId: 'team-alpha' }, { coachId: 'coach-1' }, { teamId: '', coachId: 'coach-1' }, { teamId: 'team-alpha', coachId: '  ' }]) {
    await assert.rejects(captureCoachMemory(badScope, input(), seam()), /requires a non-empty scope\.(teamId|coachId)/);
  }
  assert.equal(kv.size, 0);   // nothing was written under any key
});

test('tenant isolation: a write is only ever visible to its own team + coach', async () => {
  await captureCoachMemory({ teamId: 'team-alpha', coachId: 'coach-1' }, input(), seam('a1'));
  await captureCoachMemory({ teamId: 'team-beta', coachId: 'coach-1' }, input({ type: 'selection-preference' }), seam('b1'));
  await captureCoachMemory({ teamId: 'team-alpha', coachId: 'coach-2' }, input({ type: 'philosophy' }), seam('c1'));

  assert.deepEqual((await store.listCoachMemories({ teamId: 'team-alpha', coachId: 'coach-1' })).map(m => m.id), ['a1']);
  assert.deepEqual((await store.listCoachMemories({ teamId: 'team-beta', coachId: 'coach-1' })).map(m => m.id), ['b1']);
  assert.deepEqual((await store.listCoachMemories({ teamId: 'team-alpha', coachId: 'coach-2' })).map(m => m.id), ['c1']);
});

test('a duplicate id is rejected — first write wins', async () => {
  await captureCoachMemory(SCOPE, input(), seam('dup-1', '2026-01-10T10:00:00.000Z'));
  await assert.rejects(captureCoachMemory(SCOPE, input({ statement: 'Second version.' }), seam('dup-1', '2026-01-11T10:00:00.000Z')), /'dup-1' already exists/);
  const listed = await store.listCoachMemories(SCOPE);
  assert.equal(listed.length, 1);
  assert.match(listed[0].statement, /^Short high-tempo/);
});

test('reads after write are deterministic (createdAt then id)', async () => {
  await captureCoachMemory(SCOPE, input(), seam('z-later', '2026-01-12T10:00:00.000Z'));
  await captureCoachMemory(SCOPE, input(), seam('a-early', '2026-01-08T10:00:00.000Z'));
  const first = await store.listCoachMemories(SCOPE);
  assert.deepEqual(first.map(m => m.id), ['a-early', 'z-later']);
  assert.equal(JSON.stringify(await store.listCoachMemories(SCOPE)), JSON.stringify(first));
});

test('the written memory is visible through the unmodified M3 provider, adapted', async () => {
  await captureCoachMemory(SCOPE, input(), seam('prov-1'));
  const provider = await createCoachMemoryProvider(SCOPE);
  const memories = provider.getCoachMemories();
  assert.deepEqual(memories.map(m => m.id), ['prov-1']);
  assert.equal(memories[0].type, 'training-preference');
  const report = provider.getCoachMemoryAdapterReport();
  assert.equal(report.adaptedCount, 1);
  assert.equal(report.neutralDna, false);
});

test('the caller input object and its arrays are never mutated', async () => {
  const supplied = input({ tags: ['tempo', 'focus'], evidenceRefs: ['note-001'], ontologyLinks: [{ kind: 'training', id: 'session-block' }] });
  const before = JSON.stringify(supplied);
  await captureCoachMemory(SCOPE, supplied, seam());
  assert.equal(JSON.stringify(supplied), before);
});

test('injected clock + idFactory make the whole path deterministic', async () => {
  await captureCoachMemory({ teamId: 't', coachId: 'c' }, input(), seam('fixed', '2026-01-10T10:00:00.000Z'));
  const runA = JSON.stringify(await store.listCoachMemories({ teamId: 't', coachId: 'c' }));
  kv.clear();
  await captureCoachMemory({ teamId: 't', coachId: 'c' }, input(), seam('fixed', '2026-01-10T10:00:00.000Z'));
  const runB = JSON.stringify(await store.listCoachMemories({ teamId: 't', coachId: 'c' }));
  assert.equal(runA, runB);
});

test('the production defaults mint a Core-convention id and an ISO timestamp', async () => {
  // default seam (real Date.now/random) — assert shape, not value
  const stored = await captureCoachMemory(SCOPE, input());
  assert.match(stored.id, /^cmem_\d+_[a-z0-9]{1,8}$/);
  assert.match(stored.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.match(defaultCoachMemoryId(), /^cmem_\d+_[a-z0-9]{1,8}$/);
  assert.match(defaultCoachMemoryTimestamp(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('exercising the capture path does not touch index.html', async () => {
  const before = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  await captureCoachMemory(SCOPE, input(), seam());
  await createCoachMemoryProvider(SCOPE);
  const after = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(after, before);
});
