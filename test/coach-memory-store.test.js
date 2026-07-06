/**
 * Core Memory M1 — Persisted Coach Memory store tests.
 *
 * Drives the REAL api/_coachMemoryStore.js against a mocked Upstash (same pattern as the
 * availability/identity store tests). Verifies: create + read round trip with normalisation,
 * empty store reads, invalid entries rejected with clear errors, duplicate ids rejected,
 * tenant/team isolation (no cross-team or cross-coach leakage), deterministic ordering, and
 * that returned entries are detached copies. All data is synthetic — no personal data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.coach-memory.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_coachMemoryStore.js');

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

test.beforeEach(() => kv.clear());

test('create + read round trip: the entry is stored normalised and listed back', async () => {
  const created = await store.createCoachMemory(SCOPE, entry({
    statement: '  Short high-tempo blocks hold this group\'s focus.  ',
    tags: [' tempo ', 'tempo', 'focus'],
    evidenceRefs: ['note-001', 'note-001', ' note-002 '],
    ontologyLinks: [{ kind: 'training', id: ' session-block ' }, { kind: 'training', id: 'session-block' }],
  }));
  assert.equal(created.statement, 'Short high-tempo blocks hold this group\'s focus.');
  assert.deepEqual(created.tags, ['tempo', 'focus']);
  assert.deepEqual(created.evidenceRefs, ['note-001', 'note-002']);
  assert.deepEqual(created.ontologyLinks, [{ kind: 'training', id: 'session-block' }]);
  assert.ok(Object.isFrozen(created));

  const listed = await store.listCoachMemories(SCOPE);
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0], { ...created });
  const one = await store.getCoachMemory(SCOPE, 'mem-001');
  assert.deepEqual(one, { ...created });
});

test('an empty store lists [] and gets null', async () => {
  assert.deepEqual(await store.listCoachMemories(SCOPE), []);
  assert.equal(await store.getCoachMemory(SCOPE, 'mem-001'), null);
  assert.equal(await store.getCoachMemory(SCOPE, ''), null);
});

test('invalid entries are rejected with clear TypeErrors and nothing is stored', async () => {
  const bads = [
    [entry({ id: '' }), /id must be a non-empty string/],
    [entry({ type: 'match-plan' }), /type must be one of/],
    [entry({ statement: '   ' }), /statement must be a non-empty string/],
    [entry({ confidence: 1.2 }), /confidence must be a number in \[0,1\]/],
    [entry({ weight: -0.1 }), /weight must be a number in \[0,1\]/],
    [entry({ tags: ['ok', 3] }), /tags must be an array of non-empty strings/],
    [entry({ ontologyLinks: [{ kind: 'weather', id: 'x' }] }), /ontologyLinks must be \{ kind, id \}/],
    [entry({ evidenceRefs: [42] }), /evidenceRefs must be an array of strings/],
    [entry({ source: 'scraped' }), /source must be one of/],
    [entry({ createdAt: 'yesterday' }), /createdAt must be an ISO date string/],
    [entry({ updatedAt: 'later' }), /updatedAt must be an ISO date string/],
    ['not-an-object', /entry must be an object/],
  ];
  for (const [bad, re] of bads) {
    await assert.rejects(store.createCoachMemory(SCOPE, bad), re);
  }
  assert.deepEqual(await store.listCoachMemories(SCOPE), []);
});

test('duplicate entry ids are rejected — memories are immutable records', async () => {
  await store.createCoachMemory(SCOPE, entry());
  await assert.rejects(store.createCoachMemory(SCOPE, entry({ statement: 'Edited version.' })), /'mem-001' already exists/);
  const listed = await store.listCoachMemories(SCOPE);
  assert.equal(listed.length, 1);
  assert.match(listed[0].statement, /^Short high-tempo/);
});

test('tenant/team isolation: no leakage across teams or coaches', async () => {
  await store.createCoachMemory({ teamId: 'team-alpha', coachId: 'coach-1' }, entry({ id: 'a1' }));
  await store.createCoachMemory({ teamId: 'team-beta', coachId: 'coach-1' }, entry({ id: 'b1', type: 'selection-preference' }));
  await store.createCoachMemory({ teamId: 'team-alpha', coachId: 'coach-2' }, entry({ id: 'c1', type: 'philosophy' }));

  const alpha1 = await store.listCoachMemories({ teamId: 'team-alpha', coachId: 'coach-1' });
  const beta1 = await store.listCoachMemories({ teamId: 'team-beta', coachId: 'coach-1' });
  const alpha2 = await store.listCoachMemories({ teamId: 'team-alpha', coachId: 'coach-2' });
  assert.deepEqual(alpha1.map(e => e.id), ['a1']);
  assert.deepEqual(beta1.map(e => e.id), ['b1']);
  assert.deepEqual(alpha2.map(e => e.id), ['c1']);
  assert.equal(await store.getCoachMemory({ teamId: 'team-beta', coachId: 'coach-1' }, 'a1'), null);

  // scope ids are required — a read can never fall through to another tenant's data
  await assert.rejects(store.listCoachMemories({ teamId: '', coachId: 'coach-1' }), /non-empty teamId/);
  await assert.rejects(store.listCoachMemories({ teamId: 'team-alpha', coachId: '' }), /non-empty coachId/);
});

test('listing is deterministically ordered by createdAt then id, regardless of insert order', async () => {
  await store.createCoachMemory(SCOPE, entry({ id: 'z-later', createdAt: '2026-01-12T10:00:00.000Z' }));
  await store.createCoachMemory(SCOPE, entry({ id: 'b-early', createdAt: '2026-01-08T10:00:00.000Z' }));
  await store.createCoachMemory(SCOPE, entry({ id: 'a-early', createdAt: '2026-01-08T10:00:00.000Z' }));
  const first = await store.listCoachMemories(SCOPE);
  assert.deepEqual(first.map(e => e.id), ['a-early', 'b-early', 'z-later']);
  // repeated reads are byte-identical
  assert.equal(JSON.stringify(await store.listCoachMemories(SCOPE)), JSON.stringify(first));
});

test('returned entries are detached copies — mutating them never touches storage', async () => {
  await store.createCoachMemory(SCOPE, entry());
  const listed = await store.listCoachMemories(SCOPE);
  listed[0].statement = 'tampered';
  listed[0].tags.push('tampered');
  listed[0].ontologyLinks[0].id = 'tampered';
  const fresh = await store.getCoachMemory(SCOPE, 'mem-001');
  assert.match(fresh.statement, /^Short high-tempo/);
  assert.deepEqual(fresh.tags, ['tempo']);
  assert.deepEqual(fresh.ontologyLinks, [{ kind: 'training', id: 'session-block' }]);
});

test('the caller\'s input object is never mutated by create', async () => {
  const input = entry({ tags: [' tempo ', 'focus'] });
  const before = JSON.stringify(input);
  await store.createCoachMemory(SCOPE, input);
  assert.equal(JSON.stringify(input), before);
});

test('the schema mirrors the Brain-side M108 enums exactly', () => {
  assert.deepEqual([...store.COACH_MEMORY_TYPES], [
    'philosophy', 'selection-preference', 'training-preference', 'tactical-preference',
    'player-management', 'communication-style', 'risk-warning', 'learned-pattern',
  ]);
  assert.deepEqual([...store.COACH_MEMORY_SOURCES], [
    'manual', 'session-note', 'match-note', 'selection-decision', 'player-feedback', 'assistant-derived',
  ]);
  assert.equal(store.ONTOLOGY_KINDS.length, 11);
});

test('storage keys follow the Core key convention with structural tenant scoping', () => {
  assert.equal(store.coachMemoryKey('team-alpha', 'coach-1'), 'app:coach_memory:team-alpha:coach-1');
  assert.throws(() => store.coachMemoryKey('', 'coach-1'), /non-empty teamId/);
  assert.throws(() => store.coachMemoryKey('team-alpha', null), /non-empty coachId/);
});
