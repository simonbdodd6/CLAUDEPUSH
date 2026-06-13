// Executive Knowledge Graph — traversal engine.
//
// Pure graph algorithms over a KnowledgeRegistry. All traversal honours direction,
// optional edge-type filters, and an optional temporal instant (`at`) so callers
// can walk the graph "as it was" on a given date.

import { DIRECTION } from './constants.js';
import { isActiveAt } from './relationship.js';

function edgePasses(rel, { types, at }) {
  if (types && types.length && !types.includes(rel.type)) return false;
  if (at && !isActiveAt(rel, at)) return false;
  return true;
}

/**
 * Direct neighbours of an entity.
 * @returns {Array<{ entityId, relationship, direction }>}
 */
export function neighbors(registry, entityId, opts = {}) {
  const direction = opts.direction ?? DIRECTION.OUT;
  const out = [];
  for (const rel of registry.incident(entityId)) {
    if (!edgePasses(rel, opts)) continue;
    const undirected = rel.directed === false || direction === DIRECTION.BOTH;
    if ((direction === DIRECTION.OUT || undirected) && rel.from === entityId) {
      out.push({ entityId: rel.to, relationship: rel, direction: 'out' });
    }
    if ((direction === DIRECTION.IN || undirected) && rel.to === entityId) {
      out.push({ entityId: rel.from, relationship: rel, direction: 'in' });
    }
  }
  return out;
}

/**
 * Breadth-first traversal from a start entity.
 * @returns {Array<{ entityId, depth }>} in visit order (start first)
 */
export function bfs(registry, startId, opts = {}) {
  const maxDepth = opts.maxDepth ?? Infinity;
  const seen = new Set([startId]);
  const order = [{ entityId: startId, depth: 0 }];
  const queue = [{ id: startId, depth: 0 }];
  while (queue.length) {
    const { id, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    for (const n of neighbors(registry, id, opts)) {
      if (seen.has(n.entityId)) continue;
      seen.add(n.entityId);
      order.push({ entityId: n.entityId, depth: depth + 1 });
      queue.push({ id: n.entityId, depth: depth + 1 });
    }
  }
  return order;
}

/**
 * Shortest path (fewest hops) between two entities, or null if unreachable.
 * @returns {{ path: string[], relationships: object[] } | null}
 */
export function shortestPath(registry, fromId, toId, opts = {}) {
  if (fromId === toId) return { path: [fromId], relationships: [] };
  const prev = new Map();          // entityId → { via: relationship, from }
  const seen = new Set([fromId]);
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    for (const n of neighbors(registry, id, opts)) {
      if (seen.has(n.entityId)) continue;
      seen.add(n.entityId);
      prev.set(n.entityId, { via: n.relationship, from: id });
      if (n.entityId === toId) return reconstruct(prev, fromId, toId);
      queue.push(n.entityId);
    }
  }
  return null;
}

function reconstruct(prev, fromId, toId) {
  const path = [toId];
  const rels = [];
  let cur = toId;
  while (cur !== fromId) {
    const step = prev.get(cur);
    if (!step) break;
    rels.unshift(step.via);
    path.unshift(step.from);
    cur = step.from;
  }
  return { path, relationships: rels };
}

/**
 * Extract the connected subgraph around a root up to a depth.
 * @returns {{ rootId, entities: object[], relationships: object[], depth }}
 */
export function subgraph(registry, rootId, opts = {}) {
  const depth = opts.maxDepth ?? 2;
  const reached = bfs(registry, rootId, { ...opts, maxDepth: depth });
  const entityIds = new Set(reached.map(r => r.entityId));
  const entities = [...entityIds].map(id => registry.getEntity(id)).filter(Boolean);
  const relationships = registry.relationships().filter(r =>
    entityIds.has(r.from) && entityIds.has(r.to) && edgePasses(r, opts));
  return { rootId, entities, relationships, depth };
}

/**
 * Dependencies / dependents via directed edges of the given type(s).
 * dependencies = what this entity points TO; dependents = what points to it.
 */
export function dependencies(registry, entityId, types) {
  return neighbors(registry, entityId, { direction: DIRECTION.OUT, types })
    .map(n => ({ entityId: n.entityId, via: n.relationship.type }));
}
export function dependents(registry, entityId, types) {
  return neighbors(registry, entityId, { direction: DIRECTION.IN, types })
    .map(n => ({ entityId: n.entityId, via: n.relationship.type }));
}
