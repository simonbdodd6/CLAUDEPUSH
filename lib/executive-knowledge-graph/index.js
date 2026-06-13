// Executive Knowledge Graph — public API.
//
// The shared, canonical relationship layer for the entire Executive Intelligence
// Platform. Every entity (person, company, project, lead, meeting, task,
// recommendation, evidence, decision, memory, event, product, customer, …) exists
// EXACTLY ONCE; everything else references it. It is domain-agnostic: Coach's Eye,
// Website Lead, Wedding, Travel, Hospitality and future products all participate
// without modifying this module.
//
// It is NOT another AI / reasoning / memory / recommendation / explanation engine.
// Entities are canonical references into their owning engines; the graph stores the
// connective tissue (relationships, temporal history, versions, citations, approval
// history, feature flags) — never the domain records themselves.

export {
  KG_SCHEMA_VERSION, ENTITY_TYPE, RELATIONSHIP_TYPE, ENTITY_STATUS,
  RELATIONSHIP_STATUS, DOMAIN, DIRECTION,
} from './constants.js';

export {
  KnowledgeGraphError, InvalidEntityError, InvalidRelationshipError, EntityNotFoundError,
} from './errors.js';

export { entityId, relationshipId } from './id.js';
export { createEntity, applyEntityUpdate, validateEntitySpec } from './entity.js';
export { createRelationship, applyRelationshipUpdate, isActiveAt, validateRelationshipSpec } from './relationship.js';
export { KnowledgeRegistry } from './registry.js';
export {
  neighbors, bfs, shortestPath, subgraph, dependencies, dependents,
} from './traversal.js';
export {
  recommendationDependencyGraph, decisionDependencyGraph,
  evidenceRelationshipGraph, digitalTwinRegistry,
} from './views.js';
export { ExecutiveKnowledgeGraph } from './graph.js';
export { createExecutiveKnowledgeGraph } from './service.js';
export { buildExampleGraph } from './example.js';
