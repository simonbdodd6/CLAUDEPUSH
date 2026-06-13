// Executive Knowledge Graph — the facade.
//
// One object that wires the canonical registry to traversal and the derived views.
// This is the public surface a domain consumes. It owns no domain logic and stores
// no domain records — entities are canonical references into their owning engines.

import { KnowledgeRegistry } from './registry.js';
import { neighbors, bfs, shortestPath, subgraph, dependencies, dependents } from './traversal.js';
import {
  recommendationDependencyGraph, decisionDependencyGraph,
  evidenceRelationshipGraph, digitalTwinRegistry,
} from './views.js';
import { KG_SCHEMA_VERSION } from './constants.js';

export class ExecutiveKnowledgeGraph {
  constructor(opts = {}) {
    this.schemaVersion = KG_SCHEMA_VERSION;
    this.registry = new KnowledgeRegistry({ clock: opts.clock, sink: opts.sink });
  }

  // ── Mutations (deterministic, deduplicated, versioned) ────────────────────────
  addEntity(spec, opts)         { return this.registry.upsertEntity(spec, opts); }
  addRelationship(spec, opts)   { return this.registry.upsertRelationship(spec, opts); }
  amendEntity(id, changes, opts){ return this.registry.amendEntity(id, changes, opts); }
  linkApproval(id, approval, o) { return this.registry.linkApproval(id, approval, o); }
  endRelationship(id, opts)     { return this.registry.endRelationship(id, opts); }

  // Convenience: connect two specs in one call (ensures both endpoints exist).
  connect(fromSpec, type, toSpec, relOpts = {}) {
    const from = this.addEntity(fromSpec);
    const to   = this.addEntity(toSpec);
    const rel  = this.addRelationship({ from: from.id, to: to.id, type, ...relOpts });
    return { from, to, relationship: rel };
  }

  // ── Reads ─────────────────────────────────────────────────────────────────────
  getEntity(id, opts)        { return this.registry.getEntity(id, opts); }
  getRelationship(id)        { return this.registry.getRelationship(id); }
  entities()                 { return this.registry.entities(); }
  relationships()            { return this.registry.relationships(); }
  entitiesByType(t)          { return this.registry.entitiesByType(t); }
  entitiesByDomain(d)        { return this.registry.entitiesByDomain(d); }
  entityHistory(id)          { return this.registry.entityHistory(id); }
  relationshipHistory(id)    { return this.registry.relationshipHistory(id); }
  relationshipsAsOf(instant) { return this.registry.relationshipsAsOf(instant); }
  stats()                    { return this.registry.stats(); }

  // ── Traversal ───────────────────────────────────────────────────────────────
  neighbors(id, opts)        { return neighbors(this.registry, id, opts); }
  bfs(startId, opts)         { return bfs(this.registry, startId, opts); }
  shortestPath(a, b, opts)   { return shortestPath(this.registry, a, b, opts); }
  subgraph(rootId, opts)     { return subgraph(this.registry, rootId, opts); }
  dependencies(id, types)    { return dependencies(this.registry, id, types); }
  dependents(id, types)      { return dependents(this.registry, id, types); }

  // ── Derived views ─────────────────────────────────────────────────────────────
  recommendationDependencyGraph() { return recommendationDependencyGraph(this.registry); }
  decisionDependencyGraph()       { return decisionDependencyGraph(this.registry); }
  evidenceRelationshipGraph()     { return evidenceRelationshipGraph(this.registry); }
  digitalTwin()                   { return digitalTwinRegistry(this.registry); }

  /** Full serialisable snapshot (deterministic ordering by id). */
  export() {
    const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return {
      schemaVersion: this.schemaVersion,
      entities: this.entities().sort(byId),
      relationships: this.relationships().sort(byId),
      stats: this.stats(),
    };
  }
}
