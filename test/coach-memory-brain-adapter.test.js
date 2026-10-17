/**
 * M286 — Coach Memory → Brain adapter tests.
 *
 * Drives the REAL api/_coachMemoryBrainAdapter.js (pure — no Redis, no mocks needed). Verifies:
 * valid records adapt into the exact M108 shape with input order and every field (ids, timestamps,
 * confidence, weight, source, ontology links, evidence refs) preserved verbatim; empty and
 * malformed inputs fail safe with reasons; optional fields stay absent (never invented); duplicate
 * ids are rejected with first-occurrence-wins; nothing is mutated; output is deeply frozen and
 * byte-deterministic; and the adapter's own vocabulary carries no recommendation or player-
 * evaluation language. All data is synthetic — no personal data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptCoachMemoriesForBrain,
  validateCoachMemoryAdapter,
  summarizeCoachMemoryAdapter,
  COACH_MEMORY_TYPES,
  COACH_MEMORY_SOURCES,
  ONTOLOGY_KINDS,
} from '../api/_coachMemoryBrainAdapter.js';

const FORBIDDEN_LANG = /\b(you should|recommend(ation|ed|s)?|advis\w+|advice|must (start|bench|do)|drop him|pick him|best xv|predict|forecast|ranking|ranked|scored|rate[sd]? (the )?player|training plan|session plan|do this drill|run this session|session analysis|better|worse|stronger|weaker)\b/i;

function record(overrides = {}) {
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

test('valid records adapt into the exact M108 shape with every field preserved verbatim', () => {
  const input = [
    record({ id: 'mem-002', type: 'selection-preference', updatedAt: '2026-01-11T09:00:00.000Z', confidence: 0.55, weight: 0.4, source: 'selection-decision' }),
    record(),
  ];
  const result = adaptCoachMemoriesForBrain(input);
  assert.equal(result.type, 'coach-memory-brain-adapter-result');
  assert.equal(result.valid, true);
  assert.equal(result.adaptedCount, 2);
  assert.equal(result.rejectedCount, 0);

  const [first, second] = result.memories;
  // input order preserved — the adapter imposes no ordering of its own
  assert.equal(first.id, 'mem-002');
  assert.equal(second.id, 'mem-001');
  // ids, timestamps, confidence, weight, source preserved verbatim
  assert.equal(first.confidence, 0.55);
  assert.equal(first.weight, 0.4);
  assert.equal(first.source, 'selection-decision');
  assert.equal(first.createdAt, '2026-01-10T10:00:00.000Z');
  assert.equal(first.updatedAt, '2026-01-11T09:00:00.000Z');
  // ontology links + evidence refs preserved
  assert.deepEqual(second.ontologyLinks, [{ kind: 'training', id: 'session-block' }]);
  assert.deepEqual(second.evidenceRefs, ['note-001']);
  // exact M108 field set — nothing added
  assert.deepEqual(Object.keys(second).sort(), ['confidence', 'createdAt', 'evidenceRefs', 'id', 'ontologyLinks', 'source', 'statement', 'tags', 'type', 'weight']);
  assert.match(result.adapterFingerprint, /^fnv1a32:[0-9a-f]{8}$/);
});

test('normalisation is trim + de-duplicate ONLY', () => {
  const result = adaptCoachMemoriesForBrain([record({
    id: '  mem-003  ',
    statement: '  Keep transitions brief between drills.  ',
    tags: [' tempo ', 'tempo', 'focus'],
    evidenceRefs: ['note-001', 'note-001', ' note-002 '],
    ontologyLinks: [{ kind: 'training', id: ' block ' }, { kind: 'training', id: 'block' }],
  })]);
  const entry = result.memories[0];
  assert.equal(entry.id, 'mem-003');
  assert.equal(entry.statement, 'Keep transitions brief between drills.');
  assert.deepEqual(entry.tags, ['tempo', 'focus']);
  assert.deepEqual(entry.evidenceRefs, ['note-001', 'note-002']);
  assert.deepEqual(entry.ontologyLinks, [{ kind: 'training', id: 'block' }]);
});

test('missing optional fields stay absent — the adapter never invents', () => {
  const result = adaptCoachMemoriesForBrain([record()]);   // no updatedAt supplied
  assert.equal('updatedAt' in result.memories[0], false);
});

test('empty input adapts to an empty, valid result', () => {
  const result = adaptCoachMemoriesForBrain([]);
  assert.equal(result.valid, true);
  assert.deepEqual([...result.memories], []);
  assert.equal(result.adaptedCount, 0);
  assert.equal(result.rejectedCount, 0);
  assert.equal(validateCoachMemoryAdapter([]).valid, true);
});

test('malformed records are rejected with index, id and reason — and never adapted', () => {
  const input = [
    record(),                                             // valid
    record({ id: 'mem-bad-1', type: 'match-plan' }),      // bad type
    record({ id: 'mem-bad-2', confidence: 2 }),           // bad confidence
    'not-an-object',                                      // not an object
    record({ id: 'mem-bad-3', createdAt: 'yesterday' }),  // bad timestamp
  ];
  const result = adaptCoachMemoriesForBrain(input);
  assert.equal(result.adaptedCount, 1);
  assert.equal(result.rejectedCount, 4);
  assert.deepEqual(result.rejected.map(r => [r.index, r.id]), [[1, 'mem-bad-1'], [2, 'mem-bad-2'], [3, null], [4, 'mem-bad-3']]);
  assert.match(result.rejected[0].reason, /type must be one of/);
  assert.match(result.rejected[1].reason, /confidence must be a number in \[0,1\]/);
  assert.match(result.rejected[2].reason, /record must be an object/);
  assert.match(result.rejected[3].reason, /createdAt must be an ISO date string/);
});

test('non-array input fails safe — unusable, empty, never throws', () => {
  for (const bad of [null, undefined, {}, 'x', 7, true]) {
    let result;
    assert.doesNotThrow(() => { result = adaptCoachMemoriesForBrain(bad); });
    assert.equal(result.valid, false);
    assert.equal(result.adaptedCount, 0);
    assert.deepEqual(result.validationState.issues, ['memories must be an array of coach memory records']);
    assert.equal(validateCoachMemoryAdapter(bad).valid, false);
  }
});

test('duplicate ids are rejected — first occurrence wins', () => {
  const result = adaptCoachMemoriesForBrain([record(), record({ statement: 'Second version of the same memory.' })]);
  assert.equal(result.adaptedCount, 1);
  assert.match(result.memories[0].statement, /^Short high-tempo/);
  assert.deepEqual(result.rejected, [{ index: 1, id: 'mem-001', reason: 'duplicate id (first occurrence kept)' }]);
  assert.deepEqual(validateCoachMemoryAdapter([record(), record()]).duplicateIds, ['mem-001']);
});

test('the validation report matches the adaptation', () => {
  const input = [record(), record({ id: 'mem-bad', weight: 9 })];
  const v = validateCoachMemoryAdapter(input);
  assert.equal(v.type, 'coach-memory-brain-adapter-validation');
  assert.equal(v.valid, false);
  assert.equal(v.totalRecords, 2);
  assert.equal(v.validRecords, 1);
  assert.equal(v.invalidRecords, 1);
  assert.deepEqual(v.issues.map(i => i.id), ['mem-bad']);
  assert.match(v.validationFingerprint, /^fnv1a32:[0-9a-f]{8}$/);
});

test('provenance records the source, target schema and Brain consumers', () => {
  const result = adaptCoachMemoriesForBrain([record()]);
  assert.equal(result.provenance.source, 'supplied-coach-memory-records');
  assert.equal(result.provenance.targetSchema, 'M108 coach memory entry');
  assert.deepEqual(result.provenance.consumedBy, ['M113 extractCoachDnaSignals', 'M230 buildCoachDnaCoachView']);
  assert.equal(result.provenance.inputOrderPreserved, true);
  assert.equal(result.derivationMetadata.adapterOnly, true);
  assert.equal(result.derivationMetadata.performsReasoning, false);
  assert.equal(result.derivationMetadata.classifiesRecords, false);
  assert.equal(result.derivationMetadata.infersMissingData, false);
  assert.equal(result.derivationMetadata.dormant, true);
});

test('repeated execution is byte-identical (deterministic)', () => {
  const input = [record({ id: 'a' }), record({ id: 'b', updatedAt: '2026-01-12T08:00:00.000Z' })];
  const a = adaptCoachMemoriesForBrain(input);
  const b = adaptCoachMemoriesForBrain(input);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.adapterFingerprint, b.adapterFingerprint);
  assert.equal(JSON.stringify(validateCoachMemoryAdapter(input)), JSON.stringify(validateCoachMemoryAdapter(input)));
  assert.equal(summarizeCoachMemoryAdapter(input), summarizeCoachMemoryAdapter(input));
});

test('the fingerprint tracks the input', () => {
  const a = adaptCoachMemoriesForBrain([record()]).adapterFingerprint;
  const b = adaptCoachMemoriesForBrain([record({ confidence: 0.81 })]).adapterFingerprint;
  assert.notEqual(a, b);
});

test('input records are never mutated', () => {
  const input = [record({ tags: [' tempo ', 'focus'], statement: '  padded  ' })];
  const before = JSON.stringify(input);
  adaptCoachMemoriesForBrain(input);
  validateCoachMemoryAdapter(input);
  assert.equal(JSON.stringify(input), before);
});

test('the result is deeply frozen', () => {
  const result = adaptCoachMemoriesForBrain([record()]);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.memories));
  assert.ok(Object.isFrozen(result.memories[0]));
  assert.ok(Object.isFrozen(result.memories[0].ontologyLinks));
  assert.ok(Object.isFrozen(result.memories[0].ontologyLinks[0]));
  assert.ok(Object.isFrozen(result.rejected));
  assert.ok(Object.isFrozen(result.provenance));
  assert.ok(Object.isFrozen(result.derivationMetadata));
  assert.ok(Object.isFrozen(validateCoachMemoryAdapter([record()])));
});

test('serialization is consistent and the fingerprint is stable within a result', () => {
  const input = [record()];
  const result = adaptCoachMemoriesForBrain(input);
  assert.equal(JSON.stringify(result), JSON.stringify(adaptCoachMemoriesForBrain(input)));
  const summary = summarizeCoachMemoryAdapter(input);
  assert.match(summary, /Coach memory brain adapter: all records adapted/);
  assert.match(summary, /Adapted: 1\/1 · Rejected: 0/);
  assert.match(summary, new RegExp(result.adapterFingerprint.replace(':', '\\:')));
});

test('the adapter vocabulary carries no recommendation or player-evaluation language', () => {
  const outputs = [
    JSON.stringify(adaptCoachMemoriesForBrain([record()])),
    JSON.stringify(adaptCoachMemoriesForBrain(null)),
    JSON.stringify(validateCoachMemoryAdapter([record(), record({ id: 'x', type: 'bad' })])),
    summarizeCoachMemoryAdapter([record()]),
    summarizeCoachMemoryAdapter('nope'),
  ].join('\n');
  assert.doesNotMatch(outputs, FORBIDDEN_LANG);
  assert.doesNotMatch(outputs, /player(Id|Name|s)\b/i);
});

test('the schema enums mirror M108 exactly', () => {
  assert.deepEqual([...COACH_MEMORY_TYPES], [
    'philosophy', 'selection-preference', 'training-preference', 'tactical-preference',
    'player-management', 'communication-style', 'risk-warning', 'learned-pattern',
  ]);
  assert.deepEqual([...COACH_MEMORY_SOURCES], [
    'manual', 'session-note', 'match-note', 'selection-decision', 'player-feedback', 'assistant-derived',
  ]);
  assert.equal(ONTOLOGY_KINDS.length, 11);
});
