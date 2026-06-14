import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTITY_TYPE,
  GRAPH_AUDIT_ACTIONS,
  RELATIONSHIP_TYPE,
  TRAVERSAL_DIRECTION,
  createTravelRelationshipGraph,
} from '../lib/travel-relationship-graph/index.js';

const traveller = { type: ENTITY_TYPE.TRAVELLER, id: 'idn_1' };
const trip = { type: ENTITY_TYPE.TRIP, id: 'trip_1' };
const country = { type: ENTITY_TYPE.COUNTRY, id: 'ID' };
const city = { type: ENTITY_TYPE.CITY, id: 'denpasar' };

test('creates a reference-only relationship with safe defaults', async () => {
  const graph = createTravelRelationshipGraph();
  const edge = await graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED });

  assert.ok(edge.relationshipId.startsWith('rel_'));
  assert.equal(edge.fromType, 'traveller');
  assert.equal(edge.fromId, 'idn_1');
  assert.equal(edge.toType, 'trip');
  assert.equal(edge.toId, 'trip_1');
  assert.equal(edge.relationshipType, RELATIONSHIP_TYPE.PLANNED);
  assert.equal(edge.directed, true);
  assert.deepEqual(edge.metadata, {});
  assert.equal(edge.deterministic, true);
  assert.equal(edge.aiUsed, false);
  // Reference-only: no business data fields leaked onto the edge.
  for (const banned of ['name', 'tripName', 'displayName', 'data', 'payload']) {
    assert.ok(!(banned in edge), `edge must not carry ${banned}`);
  }
});

test('symmetric relationship types default to undirected', async () => {
  const graph = createTravelRelationshipGraph();
  const edge = await graph.createRelationship({
    from: traveller, to: { type: ENTITY_TYPE.TRAVELLER, id: 'idn_2' }, relationshipType: RELATIONSHIP_TYPE.TRAVELLED_WITH,
  });
  assert.equal(edge.directed, false);
});

test('prevents duplicate relationships (including undirected reverse)', async () => {
  const graph = createTravelRelationshipGraph();
  await graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED });
  await assert.rejects(
    () => graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED }),
    err => err.code === 'DUPLICATE_RELATIONSHIP',
  );

  const a = { type: ENTITY_TYPE.TRAVELLER, id: 'idn_a' };
  const b = { type: ENTITY_TYPE.TRAVELLER, id: 'idn_b' };
  await graph.createRelationship({ from: a, to: b, relationshipType: RELATIONSHIP_TYPE.CONNECTED_TO });
  await assert.rejects( // reverse of an undirected edge is the same edge
    () => graph.createRelationship({ from: b, to: a, relationshipType: RELATIONSHIP_TYPE.CONNECTED_TO }),
    err => err.code === 'DUPLICATE_RELATIONSHIP',
  );

  // Different relationship type between the same nodes is allowed.
  const other = await graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.OWNS });
  assert.ok(other.relationshipId);
});

test('queries neighbours by direction and relationship type', async () => {
  const graph = createTravelRelationshipGraph();
  await graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED });
  await graph.createRelationship({ from: trip, to: city, relationshipType: RELATIONSHIP_TYPE.LOCATED_IN });

  const out = await graph.queryNeighbours(trip, { direction: TRAVERSAL_DIRECTION.OUT });
  assert.deepEqual(out.map(n => n.entity.id), ['denpasar']);

  const inbound = await graph.queryNeighbours(trip, { direction: TRAVERSAL_DIRECTION.IN });
  assert.deepEqual(inbound.map(n => n.entity.id), ['idn_1']);

  const both = await graph.queryNeighbours(trip, { direction: TRAVERSAL_DIRECTION.BOTH });
  assert.deepEqual(both.map(n => n.entity.id).sort(), ['denpasar', 'idn_1']);

  const filtered = await graph.queryNeighbours(trip, { relationshipType: RELATIONSHIP_TYPE.LOCATED_IN });
  assert.deepEqual(filtered.map(n => n.entity.id), ['denpasar']);
});

test('queries by relationship type', async () => {
  const graph = createTravelRelationshipGraph();
  await graph.createRelationship({ from: traveller, to: country, relationshipType: RELATIONSHIP_TYPE.VISITED });
  await graph.createRelationship({ from: { type: ENTITY_TYPE.TRAVELLER, id: 'idn_2' }, to: country, relationshipType: RELATIONSHIP_TYPE.VISITED });
  await graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED });

  const visits = await graph.queryByRelationshipType(RELATIONSHIP_TYPE.VISITED);
  assert.equal(visits.length, 2);
  assert.ok(visits.every(e => e.relationshipType === RELATIONSHIP_TYPE.VISITED));
});

test('traverses an entity graph and groups by depth, cycle-safe', async () => {
  const graph = createTravelRelationshipGraph();
  // traveller -> trip -> city -> country  (chain, depth 3)
  await graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED });
  await graph.createRelationship({ from: trip, to: city, relationshipType: RELATIONSHIP_TYPE.LOCATED_IN });
  await graph.createRelationship({ from: city, to: country, relationshipType: RELATIONSHIP_TYPE.LOCATED_IN });
  // Cycle back to the traveller.
  await graph.createRelationship({ from: country, to: traveller, relationshipType: RELATIONSHIP_TYPE.RELATED_TO });

  const depth = await graph.queryGraphDepth(traveller, { direction: TRAVERSAL_DIRECTION.OUT, maxDepth: 10 });
  assert.equal(depth.levels[0].entities[0].id, 'idn_1');
  // BFS terminates despite the cycle.
  assert.ok(depth.maxDepth >= 1);

  const sub = await graph.queryEntityGraph(traveller, { depth: 2, direction: TRAVERSAL_DIRECTION.OUT });
  const ids = sub.nodes.map(n => n.entity.id);
  assert.ok(ids.includes('idn_1') && ids.includes('trip_1') && ids.includes('denpasar'));
});

test('finds a deterministic shortest path and handles unreachable + self', async () => {
  const graph = createTravelRelationshipGraph();
  await graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED });
  await graph.createRelationship({ from: trip, to: city, relationshipType: RELATIONSHIP_TYPE.LOCATED_IN });
  await graph.createRelationship({ from: city, to: country, relationshipType: RELATIONSHIP_TYPE.LOCATED_IN });

  const path = await graph.queryShortestPath(traveller, country, { direction: TRAVERSAL_DIRECTION.OUT });
  assert.equal(path.found, true);
  assert.equal(path.length, 3);
  assert.deepEqual(path.path.map(e => e.id), ['idn_1', 'trip_1', 'denpasar', 'ID']);
  assert.equal(path.relationships.length, 3);

  const self = await graph.queryShortestPath(traveller, traveller);
  assert.equal(self.found, true);
  assert.equal(self.length, 0);

  const unreachable = await graph.queryShortestPath(country, traveller, { direction: TRAVERSAL_DIRECTION.OUT });
  assert.equal(unreachable.found, false);
});

test('deletes a relationship and removes it from traversal', async () => {
  const graph = createTravelRelationshipGraph();
  const edge = await graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED });

  await graph.deleteRelationship(edge.relationshipId);
  const neighbours = await graph.queryNeighbours(traveller);
  assert.equal(neighbours.length, 0);
  await assert.rejects(() => graph.getRelationship(edge.relationshipId), /Relationship not found/);
  await assert.rejects(() => graph.deleteRelationship(edge.relationshipId), /Relationship not found/);

  const audit = await graph.getAuditEvents({ relationshipId: edge.relationshipId });
  assert.deepEqual(audit.map(a => a.action), [GRAPH_AUDIT_ACTIONS.RELATIONSHIP_CREATED, GRAPH_AUDIT_ACTIONS.RELATIONSHIP_DELETED]);
});

test('neighbour ordering is deterministic regardless of insertion order', async () => {
  async function build(order) {
    const graph = createTravelRelationshipGraph();
    const targets = [
      { type: ENTITY_TYPE.CITY, id: 'c' },
      { type: ENTITY_TYPE.CITY, id: 'a' },
      { type: ENTITY_TYPE.CITY, id: 'b' },
    ];
    for (const i of order) {
      await graph.createRelationship({ from: traveller, to: targets[i], relationshipType: RELATIONSHIP_TYPE.VISITED });
    }
    return (await graph.queryNeighbours(traveller)).map(n => n.entity.id);
  }
  const a = await build([0, 1, 2]);
  const b = await build([2, 1, 0]);
  assert.deepEqual(a, ['a', 'b', 'c']);
  assert.deepEqual(b, ['a', 'b', 'c']);
});

test('supports future entity types not in the known enum', async () => {
  const graph = createTravelRelationshipGraph();
  const futureEntity = { type: 'hot_air_balloon_experience', id: 'hab_1' };
  const edge = await graph.createRelationship({ from: traveller, to: futureEntity, relationshipType: RELATIONSHIP_TYPE.BOOKED });
  assert.equal(edge.toType, 'hot_air_balloon_experience');

  const neighbours = await graph.queryNeighbours(traveller);
  assert.deepEqual(neighbours.map(n => n.entity.type), ['hot_air_balloon_experience']);
});

test('validates entities, relationship type, and rejects exact location', async () => {
  const graph = createTravelRelationshipGraph();

  await assert.rejects(() => graph.createRelationship({ from: { type: '', id: 'x' }, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED }),
    /from.type is required/);
  await assert.rejects(() => graph.createRelationship({ from: traveller, to: trip, relationshipType: 'teleported' }),
    /relationshipType must be one of/);
  await assert.rejects(() => graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED, metadata: { gps: '1,2' } }),
    /must not include exact traveller location/);
  await assert.rejects(() => graph.createRelationship({ from: traveller, to: trip, relationshipType: RELATIONSHIP_TYPE.PLANNED, latitude: -8 }),
    /must not include exact traveller location/);
});
