import { clone, createAuditEvent } from '../platform-kernel/index.js';

/**
 * In-memory relationship-graph repository behind a stable adapter boundary.
 *
 * Deliberately DUMB: it stores edges and maintains two adjacency indexes
 * (out-by-node, in-by-node) keyed by the denormalised `fromKey`/`toKey` the
 * service stamps on each edge. It makes NO decisions about dedup, direction,
 * traversal, or ordering — all of that lives in the service. A production
 * adapter (Postgres/Neo4j/etc.) can implement the same async surface unchanged.
 */
export class InMemoryTravelRelationshipRepository {
  constructor(seed = {}) {
    this.relationships = new Map(); // relationshipId -> edge
    this.outByNode = new Map(); // nodeKey -> relationshipId[]
    this.inByNode = new Map(); // nodeKey -> relationshipId[]
    this.auditEvents = [];

    for (const edge of seed.relationships ?? []) this.#index(edge);
    for (const event of seed.auditEvents ?? []) this.auditEvents.push(clone(event));
  }

  #push(map, key, id) {
    const list = map.get(key) ?? [];
    list.push(id);
    map.set(key, list);
  }

  #index(edge) {
    this.relationships.set(edge.relationshipId, clone(edge));
    this.#push(this.outByNode, edge.fromKey, edge.relationshipId);
    this.#push(this.inByNode, edge.toKey, edge.relationshipId);
  }

  async addRelationship(edge) {
    this.#index(edge);
    return clone(edge);
  }

  async removeRelationship(relationshipId) {
    const edge = this.relationships.get(relationshipId);
    if (!edge) return null;
    this.relationships.delete(relationshipId);
    const out = (this.outByNode.get(edge.fromKey) ?? []).filter(id => id !== relationshipId);
    if (out.length) this.outByNode.set(edge.fromKey, out); else this.outByNode.delete(edge.fromKey);
    const inn = (this.inByNode.get(edge.toKey) ?? []).filter(id => id !== relationshipId);
    if (inn.length) this.inByNode.set(edge.toKey, inn); else this.inByNode.delete(edge.toKey);
    return clone(edge);
  }

  async getRelationship(relationshipId) {
    return clone(this.relationships.get(relationshipId) ?? null);
  }

  async listOutByNode(nodeKey) {
    return (this.outByNode.get(nodeKey) ?? []).map(id => clone(this.relationships.get(id)));
  }

  async listInByNode(nodeKey) {
    return (this.inByNode.get(nodeKey) ?? []).map(id => clone(this.relationships.get(id)));
  }

  async listAll() {
    return [...this.relationships.values()].map(clone);
  }

  async appendAudit(event) {
    const auditEvent = createAuditEvent(event, { idPrefix: 'graph_audit' });
    this.auditEvents.push(clone(auditEvent));
    return clone(auditEvent);
  }

  async listAuditEvents(filter = {}) {
    return this.auditEvents
      .filter(event => !filter.relationshipId || event.relationshipId === filter.relationshipId)
      .filter(event => !filter.action || event.action === filter.action)
      .map(clone);
  }
}
