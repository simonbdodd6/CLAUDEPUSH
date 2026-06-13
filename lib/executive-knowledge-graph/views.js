// Executive Knowledge Graph — derived views.
//
// These compose the canonical registry into the specialised graphs the platform
// needs. They add NO new data — they are filtered projections of what already
// exists, so there is a single source of truth.

import { ENTITY_TYPE, RELATIONSHIP_TYPE } from './constants.js';

/** Generic typed-subgraph: entities of `entityType` + the dependency edges among them. */
function dependencyGraph(registry, entityType, edgeTypes) {
  const entities = registry.entitiesByType(entityType);
  const ids = new Set(entities.map(e => e.id));
  const relationships = registry.relationships().filter(r =>
    edgeTypes.includes(r.type) && ids.has(r.from) && ids.has(r.to));
  const edges = relationships.map(r => ({ from: r.from, to: r.to, type: r.type, confidence: r.confidence }));
  return { kind: `${entityType}-dependency`, entities, relationships, edges, stats: { entities: entities.length, edges: edges.length } };
}

/** #7 Recommendation dependency graph. */
export function recommendationDependencyGraph(registry) {
  return dependencyGraph(registry, ENTITY_TYPE.RECOMMENDATION, [RELATIONSHIP_TYPE.DEPENDS_ON, RELATIONSHIP_TYPE.DERIVED_FROM]);
}

/** #8 Decision dependency graph. */
export function decisionDependencyGraph(registry) {
  return dependencyGraph(registry, ENTITY_TYPE.DECISION, [RELATIONSHIP_TYPE.DEPENDS_ON, RELATIONSHIP_TYPE.DECIDED_BY, RELATIONSHIP_TYPE.DERIVED_FROM]);
}

/** #9 Evidence relationship graph: anything connected by cites / evidenced_by. */
export function evidenceRelationshipGraph(registry) {
  const relationships = registry.relationships().filter(r =>
    r.type === RELATIONSHIP_TYPE.CITES || r.type === RELATIONSHIP_TYPE.EVIDENCED_BY);
  const ids = new Set(relationships.flatMap(r => [r.from, r.to]));
  const entities = [...ids].map(id => registry.getEntity(id)).filter(Boolean);
  return {
    kind: 'evidence',
    entities,
    relationships,
    edges: relationships.map(r => ({ from: r.from, to: r.to, type: r.type })),
    stats: { entities: entities.length, edges: relationships.length },
  };
}

/**
 * #10 Digital Twin entity registry: the canonical, grouped snapshot of everything
 * the platform currently knows — the live "twin" of the organisation/world. Pure
 * projection of the registry; references only, never copies of domain records.
 */
export function digitalTwinRegistry(registry) {
  const entities = registry.entities();
  const byType = group(entities, e => e.type);
  const byDomain = group(entities, e => e.domain);
  return {
    kind: 'digital-twin',
    generatedFrom: 'executive-knowledge-graph',
    counts: registry.stats(),
    domains: Object.keys(byDomain),
    types: Object.keys(byType),
    byDomain,
    byType,
  };
}

function group(arr, keyFn) {
  const out = {};
  for (const x of arr) {
    const k = keyFn(x);
    (out[k] ??= []).push({ id: x.id, label: x.label, status: x.status, ref: x.ref });
  }
  return out;
}
