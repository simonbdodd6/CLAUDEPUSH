import { randomUUID } from 'crypto';
import { clone } from '../platform-kernel/index.js';
import {
  DEFAULT_MAX_DEPTH,
  DEFAULT_NEIGHBOUR_LIMIT,
  GRAPH_AUDIT_ACTIONS,
  RELATIONSHIP_TYPES,
  SYMMETRIC_RELATIONSHIP_TYPES,
  TRAVERSAL_DIRECTION,
} from './constants.js';
import { InMemoryTravelRelationshipRepository } from './repository.js';
import { duplicateError, notFoundError, validationError } from './errors.js';

// NOTE (M22a): this module's shallow exact-location guard (batch fields list,
// "exact traveller location" message) differs from the kernel's deep helper, so
// it is intentionally left local and deferred to M22b for verified migration.
const EXACT_LOCATION_FIELDS = [
  'coordinates', 'coordinate', 'lat', 'lng', 'latitude', 'longitude',
  'exactLocation', 'liveLocation', 'travellerLocation', 'currentLocation', 'gps', 'geo',
];

function now() {
  return new Date().toISOString();
}

function assertNoExactLocation(input = {}, label = 'graph input') {
  if (input == null || typeof input !== 'object') return input;
  const present = EXACT_LOCATION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) {
    throw validationError(`${label} must not include exact traveller location`, { fields: present });
  }
  return input;
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw validationError(`${field} is required`, { field });
  }
  return value.trim();
}

// Entity reference: { type, id }. Type is an open slug; id is opaque (case
// preserved). The graph never stores anything else about the entity.
function assertEntity(value, label) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(`${label} must be an object with { type, id }`, { field: label });
  }
  return {
    type: assertNonEmptyString(value.type, `${label}.type`).toLowerCase(),
    id: assertNonEmptyString(value.id, `${label}.id`),
  };
}

function nodeKey(entity) {
  return `${entity.type}:${entity.id}`;
}

function assertRelationshipType(value) {
  if (!RELATIONSHIP_TYPES.includes(value)) {
    throw validationError(`relationshipType must be one of: ${RELATIONSHIP_TYPES.join(', ')}`, { relationshipType: value });
  }
  return value;
}

function normalizeMetadata(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw validationError('metadata must be an object', { metadata: value });
  }
  assertNoExactLocation(value, 'metadata');
  return clone(value);
}

function assertDirection(value) {
  const direction = value ?? TRAVERSAL_DIRECTION.BOTH;
  if (!Object.values(TRAVERSAL_DIRECTION).includes(direction)) {
    throw validationError(`direction must be one of: ${Object.values(TRAVERSAL_DIRECTION).join(', ')}`, { direction });
  }
  return direction;
}

function entityOf(edge, end) {
  return end === 'from'
    ? { type: edge.fromType, id: edge.fromId }
    : { type: edge.toType, id: edge.toId };
}

// Deterministic neighbour ordering — never depends on insertion order.
function compareNeighbours(a, b) {
  return a.entity.type.localeCompare(b.entity.type)
    || String(a.entity.id).localeCompare(String(b.entity.id))
    || a.relationshipType.localeCompare(b.relationshipType)
    || a.relationshipId.localeCompare(b.relationshipId);
}

export function createTravelRelationshipGraph(options = {}) {
  const repository = options.repository ?? new InMemoryTravelRelationshipRepository();

  async function audit(action, edge, details = {}) {
    return repository.appendAudit({ action, relationshipId: edge.relationshipId, details });
  }

  // Expand a node into its directly-connected neighbours, honouring direction
  // and undirected edges. Returns deterministic, sorted neighbour descriptors.
  async function expand(key, direction, relationshipType) {
    const out = await repository.listOutByNode(key);
    const inn = await repository.listInByNode(key);
    const neighbours = [];

    for (const edge of out) {
      const traversable = direction === TRAVERSAL_DIRECTION.OUT
        || direction === TRAVERSAL_DIRECTION.BOTH
        || !edge.directed;
      if (!traversable) continue;
      if (relationshipType && edge.relationshipType !== relationshipType) continue;
      neighbours.push({ entity: entityOf(edge, 'to'), key: edge.toKey, relationshipType: edge.relationshipType, relationshipId: edge.relationshipId, edge });
    }
    for (const edge of inn) {
      const traversable = direction === TRAVERSAL_DIRECTION.IN
        || direction === TRAVERSAL_DIRECTION.BOTH
        || !edge.directed;
      if (!traversable) continue;
      if (relationshipType && edge.relationshipType !== relationshipType) continue;
      neighbours.push({ entity: entityOf(edge, 'from'), key: edge.fromKey, relationshipType: edge.relationshipType, relationshipId: edge.relationshipId, edge });
    }
    return neighbours.sort(compareNeighbours);
  }

  async function existsRelationship(fromKey, toKey, relationshipType, directed) {
    const out = await repository.listOutByNode(fromKey);
    if (out.some(edge => edge.toKey === toKey && edge.relationshipType === relationshipType)) return true;
    if (!directed) {
      // Undirected A↔B equals B↔A.
      const reverse = await repository.listOutByNode(toKey);
      if (reverse.some(edge => edge.toKey === fromKey && edge.relationshipType === relationshipType && !edge.directed)) return true;
    }
    return false;
  }

  /**
   * Create a relationship (edge) between two entity references. Stores only the
   * reference + relationship metadata — never business data. Symmetric types
   * default to undirected. Equivalent relationships are rejected as duplicates.
   */
  async function createRelationship(input = {}) {
    assertNoExactLocation(input, 'createRelationship input');
    const from = assertEntity(input.from, 'from');
    const to = assertEntity(input.to, 'to');
    const relationshipType = assertRelationshipType(input.relationshipType);
    const directed = input.directed != null
      ? input.directed === true
      : !SYMMETRIC_RELATIONSHIP_TYPES.includes(relationshipType);

    const fromKey = nodeKey(from);
    const toKey = nodeKey(to);
    if (await existsRelationship(fromKey, toKey, relationshipType, directed)) {
      throw duplicateError({ from, to, relationshipType });
    }

    const edge = {
      relationshipId: `rel_${randomUUID()}`,
      fromType: from.type,
      fromId: from.id,
      toType: to.type,
      toId: to.id,
      fromKey,
      toKey,
      relationshipType,
      directed,
      metadata: normalizeMetadata(input.metadata),
      createdAt: now(),
      deterministic: true,
      aiUsed: false,
    };
    await repository.addRelationship(edge);
    await audit(GRAPH_AUDIT_ACTIONS.RELATIONSHIP_CREATED, edge, { relationshipType, directed });
    return clone(edge);
  }

  async function getRelationship(relationshipId) {
    const edge = await repository.getRelationship(assertNonEmptyString(relationshipId, 'relationshipId'));
    if (!edge) throw notFoundError(relationshipId);
    return edge;
  }

  async function deleteRelationship(relationshipId) {
    const removed = await repository.removeRelationship(assertNonEmptyString(relationshipId, 'relationshipId'));
    if (!removed) throw notFoundError(relationshipId);
    await audit(GRAPH_AUDIT_ACTIONS.RELATIONSHIP_DELETED, removed, {});
    return clone(removed);
  }

  async function queryNeighbours(entityRef, queryOptions = {}) {
    const entity = assertEntity(entityRef, 'entity');
    const direction = assertDirection(queryOptions.direction);
    const limit = Number.isInteger(queryOptions.limit) && queryOptions.limit > 0 ? queryOptions.limit : DEFAULT_NEIGHBOUR_LIMIT;
    const neighbours = await expand(nodeKey(entity), direction, queryOptions.relationshipType);
    return neighbours.slice(0, limit).map(n => ({
      entity: n.entity,
      relationshipType: n.relationshipType,
      relationshipId: n.relationshipId,
      directed: n.edge.directed,
      metadata: clone(n.edge.metadata),
    }));
  }

  async function queryByRelationshipType(relationshipType, queryOptions = {}) {
    const type = assertRelationshipType(relationshipType);
    const all = await repository.listAll();
    const rows = all.filter(edge => edge.relationshipType === type);
    rows.sort((a, b) => a.relationshipId.localeCompare(b.relationshipId));
    const limit = Number.isInteger(queryOptions.limit) && queryOptions.limit > 0 ? queryOptions.limit : DEFAULT_NEIGHBOUR_LIMIT;
    return rows.slice(0, limit);
  }

  // Cycle-safe BFS. Returns Map(nodeKey -> { depth, entity, parentKey, edge }).
  async function bfs(rootKey, rootEntity, { direction, relationshipType, maxDepth }) {
    const visited = new Map();
    visited.set(rootKey, { depth: 0, entity: rootEntity, parentKey: null, edge: null });
    let frontier = [{ key: rootKey, entity: rootEntity }];
    let depth = 0;
    while (frontier.length && depth < maxDepth) {
      depth += 1;
      const next = [];
      for (const node of frontier) {
        const neighbours = await expand(node.key, direction, relationshipType);
        for (const n of neighbours) {
          if (visited.has(n.key)) continue; // cycle / already-seen guard
          visited.set(n.key, { depth, entity: n.entity, parentKey: node.key, edge: n.edge });
          next.push({ key: n.key, entity: n.entity });
        }
      }
      frontier = next;
    }
    return visited;
  }

  /**
   * Reachable subgraph around an entity within `depth`. Returns the reached
   * nodes (with their BFS depth) and the induced relationships among them.
   */
  async function queryEntityGraph(entityRef, queryOptions = {}) {
    const entity = assertEntity(entityRef, 'entity');
    const direction = assertDirection(queryOptions.direction);
    const relationshipType = queryOptions.relationshipType ? assertRelationshipType(queryOptions.relationshipType) : null;
    const maxDepth = Number.isInteger(queryOptions.depth) && queryOptions.depth >= 0 ? queryOptions.depth : 1;

    const visited = await bfs(nodeKey(entity), entity, { direction, relationshipType, maxDepth });
    const nodeKeys = new Set(visited.keys());
    const nodes = [...visited.values()]
      .map(v => ({ entity: v.entity, depth: v.depth }))
      .sort((a, b) => a.depth - b.depth
        || a.entity.type.localeCompare(b.entity.type)
        || String(a.entity.id).localeCompare(String(b.entity.id)));

    // Induced subgraph: edges with both endpoints inside the reached node set.
    const all = await repository.listAll();
    const relationships = all
      .filter(edge => nodeKeys.has(edge.fromKey) && nodeKeys.has(edge.toKey))
      .filter(edge => !relationshipType || edge.relationshipType === relationshipType)
      .sort((a, b) => a.relationshipId.localeCompare(b.relationshipId));

    return { root: entity, depth: maxDepth, nodes, relationships };
  }

  /**
   * Nodes grouped by their BFS distance from an entity, plus the maximum
   * reachable depth.
   */
  async function queryGraphDepth(entityRef, queryOptions = {}) {
    const entity = assertEntity(entityRef, 'entity');
    const direction = assertDirection(queryOptions.direction);
    const relationshipType = queryOptions.relationshipType ? assertRelationshipType(queryOptions.relationshipType) : null;
    const maxDepth = Number.isInteger(queryOptions.maxDepth) && queryOptions.maxDepth >= 0 ? queryOptions.maxDepth : DEFAULT_MAX_DEPTH;

    const visited = await bfs(nodeKey(entity), entity, { direction, relationshipType, maxDepth });
    const byDepth = new Map();
    let reached = 0;
    for (const v of visited.values()) {
      reached = Math.max(reached, v.depth);
      if (!byDepth.has(v.depth)) byDepth.set(v.depth, []);
      byDepth.get(v.depth).push(v.entity);
    }
    const levels = [...byDepth.keys()].sort((a, b) => a - b).map(depth => ({
      depth,
      entities: byDepth.get(depth).sort((a, b) => a.type.localeCompare(b.type) || String(a.id).localeCompare(String(b.id))),
    }));
    return { root: entity, maxDepth: reached, levels };
  }

  /**
   * Deterministic shortest path (fewest hops) between two entities. Returns
   * { found, length, path, relationships }. Cycle-safe via BFS visited-set.
   */
  async function queryShortestPath(fromRef, toRef, queryOptions = {}) {
    const from = assertEntity(fromRef, 'from');
    const to = assertEntity(toRef, 'to');
    const direction = assertDirection(queryOptions.direction);
    const relationshipType = queryOptions.relationshipType ? assertRelationshipType(queryOptions.relationshipType) : null;
    const maxDepth = Number.isInteger(queryOptions.maxDepth) && queryOptions.maxDepth >= 0 ? queryOptions.maxDepth : DEFAULT_MAX_DEPTH;

    const fromKey = nodeKey(from);
    const toKey = nodeKey(to);
    if (fromKey === toKey) return { found: true, length: 0, path: [from], relationships: [] };

    const visited = await bfs(fromKey, from, { direction, relationshipType, maxDepth });
    if (!visited.has(toKey)) return { found: false, length: null, path: [], relationships: [] };

    // Backtrack from target to root.
    const path = [];
    const relationships = [];
    let cursor = toKey;
    while (cursor) {
      const node = visited.get(cursor);
      path.unshift(node.entity);
      if (node.edge) relationships.unshift(node.edge);
      cursor = node.parentKey;
    }
    return { found: true, length: path.length - 1, path, relationships };
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    createRelationship,
    deleteRelationship,
    getRelationship,
    queryNeighbours,
    queryByRelationshipType,
    queryEntityGraph,
    queryGraphDepth,
    queryShortestPath,
    getAuditEvents,
  };
}
