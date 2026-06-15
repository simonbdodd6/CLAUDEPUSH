// ─────────────────────────────────────────────────────────────────────────────
// Memory Intelligence mapper (Experience Adapter, M39)
//
// Maps the façade envelope's `data` (the Brain's knowledge graph — { nodes, edges })
// into the presentation-only `memory` slice of a VisualModel (the existing M32
// Memory Network slice; no new visual). PURE field selection guarded against
// malformed input — it reshapes nodes/edges the Brain already holds; it performs
// NO calculation, layout, ranking, reasoning or recommendation.
//
// Graph shape (read-only reference, knowledge-graph):
//   nodes: [{ id, type, label, ... }]   edges: [{ from, to, weight, ... }]
// ─────────────────────────────────────────────────────────────────────────────

import { isObj, num, str, arr } from '../shape-guards.js'

/**
 * @param {any} data       façade envelope.data ({ nodes, edges })
 * @param {object} fallback the placeholder memory slice (defaults)
 * @returns {object}        a 'live' memory slice, view-safe
 */
export function mapMemory(data, fallback) {
  const fb = isObj(fallback) ? fallback : {}
  if (!isObj(data)) return { ...fb }

  const nodes = arr(data.nodes)
    .filter(isObj)
    .map(n => ({
      id: str(n.id, ''),
      label: str(n.label, str(n.id, '')),
      cluster: str(n.cluster ?? n.group ?? n.type, 'node'),
      activated: n.activated === true,
    }))
    .filter(n => n.id)

  const nodeIds = new Set(nodes.map(n => n.id))
  const edges = arr(data.edges)
    .filter(isObj)
    .map(e => ({ from: str(e.from ?? e.source, ''), to: str(e.to ?? e.target, ''), weight: num(e.weight, 0.5, 0, 1) }))
    .filter(e => e.from && e.to && nodeIds.has(e.from) && nodeIds.has(e.to))

  if (!nodes.length) return { ...fb, state: 'live' }   // live but empty graph → keep placeholder content

  return {
    state: 'live',
    nodes,
    edges,
    recentlyActivated: arr(data.recentlyActivated).map(id => str(id, '')).filter(Boolean),
  }
}
