// Executive Knowledge Graph — tests.
// Verifies the canonical layer: deterministic identity, no-duplicate rules,
// versioning, temporal relationships, cross-domain reuse, traversal, the four
// derived dependency graphs, and the digital-twin registry.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExecutiveKnowledgeGraph, buildExampleGraph,
  entityId, relationshipId,
  ENTITY_TYPE, RELATIONSHIP_TYPE, DOMAIN, DIRECTION,
} from '../lib/executive-knowledge-graph/index.js';

const CLOCK = (t = '2026-06-13T00:00:00.000Z') => () => t;

// ── Deterministic identity (no duplicate ids) ─────────────────────────────────────

test('entity id is deterministic and content-derived', () => {
  const a = entityId('coaches-eye', 'team', 'U16');
  const b = entityId('coaches-eye', 'team', 'u16  ');   // canonicalised
  assert.equal(a, b);
  assert.ok(a.startsWith('ent_'));
  assert.notEqual(a, entityId('wedding', 'team', 'U16')); // domain matters
});

test('relationship id is deterministic from its triple', () => {
  const r = relationshipId('ent_a', 'owns', 'ent_b');
  assert.equal(r, relationshipId('ent_a', 'owns', 'ent_b'));
  assert.ok(r.startsWith('rel_'));
});

// ── No duplicate entities / relationships ─────────────────────────────────────────

test('re-adding the same entity upserts (never duplicates) and versions changes', () => {
  const kg = createExecutiveKnowledgeGraph({ clock: CLOCK() });
  const e1 = kg.addEntity({ domain: 'coaches-eye', type: 'team', externalId: 'u16', label: 'U16' });
  const e2 = kg.addEntity({ domain: 'coaches-eye', type: 'team', externalId: 'u16', label: 'U16' }); // identical → no-op
  assert.equal(kg.entities().length, 1);
  assert.equal(e1.id, e2.id);
  assert.equal(e2.version, 1);

  const e3 = kg.addEntity({ domain: 'coaches-eye', type: 'team', externalId: 'u16', confidence: 90 }); // change
  assert.equal(kg.entities().length, 1);          // still ONE entity
  assert.equal(e3.version, 2);                     // but versioned
  assert.equal(kg.entityHistory(e3.id).length, 2);
});

test('re-adding the same relationship triple never duplicates', () => {
  const kg = createExecutiveKnowledgeGraph({ clock: CLOCK() });
  const a = kg.addEntity({ domain: 'd', type: 'person', externalId: 'a' });
  const b = kg.addEntity({ domain: 'd', type: 'team', externalId: 'b' });
  kg.addRelationship({ from: a.id, to: b.id, type: 'owns' });
  kg.addRelationship({ from: a.id, to: b.id, type: 'owns' });
  assert.equal(kg.relationships().length, 1);
});

// ── Universal entity: every required field present ────────────────────────────────

test('every entity supports the required cross-cutting fields', () => {
  const kg = createExecutiveKnowledgeGraph({ clock: CLOCK() });
  const e = kg.addEntity({ domain: 'coaches-eye', type: 'recommendation', externalId: 'r1', owner: 'coach', confidence: 70, featureFlags: [{ key: 'autonomousAssistant', enabled: true }] });
  for (const f of ['id', 'type', 'owner', 'created', 'updated', 'status', 'confidence', 'relationships', 'timeline', 'citations', 'approvalHistory', 'featureFlags']) {
    assert.ok(f in kg.getEntity(e.id), `missing field: ${f}`);
  }
});

// ── Cross-domain references: exists only once, referenced everywhere ──────────────

test('a shared person entity is referenced across multiple domains', () => {
  const kg = buildExampleGraph();
  const simon = entityId(DOMAIN.PLATFORM, ENTITY_TYPE.PERSON, 'simon@coacheye.io');
  // Simon is connected into BOTH Coach's Eye (owns team) and Website Lead (works_for company).
  const out = kg.neighbors(simon, { direction: DIRECTION.OUT }).map(n => kg.getEntity(n.entityId).domain);
  assert.ok(out.includes(DOMAIN.COACHES_EYE));
  assert.ok(out.includes(DOMAIN.WEBSITE_LEAD));
  // …yet the person exists exactly once.
  assert.equal(kg.entitiesByType(ENTITY_TYPE.PERSON).filter(p => p.id === simon).length, 1);
});

// ── Temporal relationships ────────────────────────────────────────────────────────

test('relationships are temporal: asOf filters by validity window', () => {
  const kg = createExecutiveKnowledgeGraph({ clock: CLOCK() });
  const a = kg.addEntity({ domain: 'd', type: 'player', externalId: 'a' });
  const b = kg.addEntity({ domain: 'd', type: 'team', externalId: 'b' });
  kg.addRelationship({ from: a.id, to: b.id, type: 'member_of', validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2026-06-01T00:00:00.000Z' });
  assert.equal(kg.relationshipsAsOf('2026-03-01T00:00:00.000Z').length, 1);
  assert.equal(kg.relationshipsAsOf('2026-09-01T00:00:00.000Z').length, 0);
});

test('ending a relationship versions it and closes its validity', () => {
  const kg = createExecutiveKnowledgeGraph({ clock: CLOCK() });
  const a = kg.addEntity({ domain: 'd', type: 'person', externalId: 'a' });
  const b = kg.addEntity({ domain: 'd', type: 'company', externalId: 'b' });
  const rel = kg.addRelationship({ from: a.id, to: b.id, type: 'works_for' });
  kg.endRelationship(rel.id, { at: '2026-07-01T00:00:00.000Z' });
  assert.equal(kg.getRelationship(rel.id).status, 'ended');
  assert.equal(kg.relationshipHistory(rel.id).length, 2);
});

// ── Traversal engine ──────────────────────────────────────────────────────────────

test('bfs, neighbors and shortestPath traverse the graph', () => {
  const kg = buildExampleGraph();
  const simon = entityId(DOMAIN.PLATFORM, ENTITY_TYPE.PERSON, 'simon@coacheye.io');
  const evidence = entityId(DOMAIN.COACHES_EYE, ENTITY_TYPE.EVIDENCE, 'attendance-3wk');

  const reached = kg.bfs(simon, { direction: DIRECTION.BOTH, maxDepth: 4 }).map(r => r.entityId);
  assert.ok(reached.includes(evidence));                      // simon → team ← rec → evidence

  const path = kg.shortestPath(simon, evidence, { direction: DIRECTION.BOTH });
  assert.ok(path && path.path[0] === simon && path.path.at(-1) === evidence);
});

// ── Derived views: the four dependency/twin graphs ────────────────────────────────

test('recommendation, decision and evidence dependency graphs project correctly', () => {
  const kg = buildExampleGraph();

  const recDep = kg.recommendationDependencyGraph();
  assert.ok(recDep.entities.length >= 2);                     // coach rec + lead rec
  assert.ok(recDep.edges.some(e => e.type === RELATIONSHIP_TYPE.DEPENDS_ON || e.type === RELATIONSHIP_TYPE.DERIVED_FROM));

  const evGraph = kg.evidenceRelationshipGraph();
  assert.ok(evGraph.edges.some(e => e.type === RELATIONSHIP_TYPE.CITES));

  const decGraph = kg.decisionDependencyGraph();
  assert.ok('entities' in decGraph && 'edges' in decGraph);
});

test('digital twin registry groups every entity by domain and type', () => {
  const kg = buildExampleGraph();
  const twin = kg.digitalTwin();
  assert.ok(twin.domains.includes(DOMAIN.COACHES_EYE));
  assert.ok(twin.domains.includes(DOMAIN.WEBSITE_LEAD));
  assert.ok(twin.domains.includes(DOMAIN.WEDDING));
  assert.ok(twin.domains.includes(DOMAIN.TRAVEL));
  assert.equal(twin.counts.entities, kg.entities().length);
});

// ── Approval history + feature flags + citations on entities ──────────────────────

test('entities carry approval history, citations and feature flags', () => {
  const kg = buildExampleGraph();
  const rec = kg.getEntity(entityId(DOMAIN.COACHES_EYE, ENTITY_TYPE.RECOMMENDATION, 'rec-attendance-1'));
  assert.equal(rec.approvalHistory.length, 1);
  assert.equal(rec.approvalHistory[0].state, 'approved');
  assert.ok(rec.featureFlags.some(f => f.key === 'autonomousAssistant'));
});

// ── Determinism + durability sink ─────────────────────────────────────────────────

test('the example graph is fully deterministic', () => {
  const a = buildExampleGraph().export();
  const b = buildExampleGraph().export();
  assert.deepEqual(a, b);
});

test('graph mirrors change events to an injected journal sink (no I/O of its own)', () => {
  const journal = [];
  const kg = createExecutiveKnowledgeGraph({ clock: CLOCK(), sink: { append: (r) => journal.push(r) } });
  const a = kg.addEntity({ domain: 'd', type: 'person', externalId: 'a' });
  const b = kg.addEntity({ domain: 'd', type: 'team', externalId: 'b' });
  kg.addRelationship({ from: a.id, to: b.id, type: 'owns' });
  assert.ok(journal.some(r => r.event === 'entity.created'));
  assert.ok(journal.some(r => r.event === 'relationship.created'));
});

test('never throws on bad specs — validation is explicit', () => {
  const kg = createExecutiveKnowledgeGraph({ clock: CLOCK() });
  assert.throws(() => kg.addEntity({ type: 'person' }), /domain/);          // missing domain
  assert.throws(() => kg.addEntity({ domain: 'd', type: 'person' }), /natural key/);
  const a = kg.addEntity({ domain: 'd', type: 'person', externalId: 'a' });
  assert.throws(() => kg.addRelationship({ from: a.id, to: a.id, type: 'owns' }), /itself/);
});
