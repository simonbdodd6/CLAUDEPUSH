/**
 * Knowledge Graph — Query
 *
 * Graph traversal and search. All reads go through here.
 * Every function is pure (no side-effects) and operates on the live store.
 *
 * Algorithms: BFS for traversal/path-finding, inverted index for text search.
 */

import { getAllNodes, getAllEdges, getNode, edgesOf, outEdges, inEdges, neighbourIds } from './graph-store.js'
import { NODE, EDGE } from './graph-model.js'

// ── Basic lookups ─────────────────────────────────────────────────────────────

export { getNode }

export function getEdgeById(id) {
  return getAllEdges().find(e => e.id === id) ?? null
}

export function findNodes(filter = {}) {
  let nodes = getAllNodes()
  if (filter.type)    nodes = nodes.filter(n => n.type === filter.type)
  if (filter.clubId)  nodes = nodes.filter(n => n.clubId === filter.clubId)
  if (filter.coachId) nodes = nodes.filter(n => n.coachId === filter.coachId)
  if (filter.source)  nodes = nodes.filter(n => n.source === filter.source)
  if (filter.label)   nodes = nodes.filter(n => n.label.toLowerCase().includes(filter.label.toLowerCase()))
  if (filter.types)   nodes = nodes.filter(n => filter.types.includes(n.type))
  return nodes
}

export function findEdges(filter = {}) {
  let edges = getAllEdges()
  if (filter.type)  edges = edges.filter(e => e.type  === filter.type)
  if (filter.from)  edges = edges.filter(e => e.from  === filter.from)
  if (filter.to)    edges = edges.filter(e => e.to    === filter.to)
  if (filter.types) edges = edges.filter(e => filter.types.includes(e.type))
  return edges
}

// ── Traversal ─────────────────────────────────────────────────────────────────

/**
 * BFS expansion from a node up to `depth` hops.
 * Returns { nodes: Node[], edges: Edge[] } — the induced subgraph.
 */
export function expand(nodeId, depth = 1, opts = {}) {
  const { edgeTypes, direction = 'both', limit = 200 } = opts
  const visitedNodes = new Set([nodeId])
  const visitedEdges = new Set()
  const queue = [{ id: nodeId, d: 0 }]

  while (queue.length > 0 && visitedNodes.size < limit) {
    const { id, d } = queue.shift()
    if (d >= depth) continue

    const edges = edgesOf(id).filter(e => {
      if (edgeTypes && !edgeTypes.includes(e.type)) return false
      if (direction === 'out' && e.from !== id) return false
      if (direction === 'in'  && e.to   !== id) return false
      return true
    })

    for (const e of edges) {
      visitedEdges.add(e.id)
      const otherId = e.from === id ? e.to : e.from
      if (!visitedNodes.has(otherId)) {
        visitedNodes.add(otherId)
        queue.push({ id: otherId, d: d + 1 })
      }
    }
  }

  return {
    nodes: [...visitedNodes].map(id => getNode(id)).filter(Boolean),
    edges: [...visitedEdges].map(id => getAllEdges().find(e => e.id === id)).filter(Boolean),
  }
}

/**
 * BFS shortest path between two nodes.
 * Returns array of node ids from source to target, or null if unreachable.
 */
export function shortestPath(fromId, toId) {
  if (fromId === toId) return [fromId]
  const visited = new Set([fromId])
  const parent  = new Map()
  const queue   = [fromId]

  while (queue.length > 0) {
    const curr = queue.shift()
    for (const nId of neighbourIds(curr)) {
      if (nId === toId) {
        const path = [toId]
        let c = curr
        while (c !== fromId) { path.unshift(c); c = parent.get(c) }
        path.unshift(fromId)
        return path
      }
      if (!visited.has(nId)) {
        visited.add(nId)
        parent.set(nId, curr)
        queue.push(nId)
      }
    }
  }
  return null
}

// ── Full-text search ──────────────────────────────────────────────────────────

export function search(query, opts = {}) {
  const q = query.toLowerCase().trim()
  if (!q) return []

  const { types, limit = 20 } = opts
  const terms = q.split(/\s+/)

  function score(node) {
    const fields = [
      node.label,
      node.type,
      JSON.stringify(node.metadata),
    ].join(' ').toLowerCase()

    let s = 0
    for (const t of terms) {
      if (fields.includes(t)) {
        s += node.label.toLowerCase().includes(t) ? 3 : 1
      }
    }
    return s
  }

  let nodes = getAllNodes()
  if (types) nodes = nodes.filter(n => types.includes(n.type))

  return nodes
    .map(n => ({ node: n, score: score(n) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.node)
}

// ── Domain-specific queries ───────────────────────────────────────────────────

/** All drills that teach a given coaching principle */
export function drillsForPrinciple(principleId) {
  const edges = inEdges(principleId, EDGE.TEACHES)
  return edges.map(e => getNode(e.from)).filter(n => n?.type === NODE.DRILL)
}

/** All documents that cover a coaching principle */
export function docsForPrinciple(principleId) {
  const edges = inEdges(principleId, EDGE.COVERS)
  return edges.map(e => getNode(e.from)).filter(n => n?.type === NODE.DOCUMENT)
}

/** All recommendations concerning a player */
export function recsForPlayer(playerId) {
  const edges = inEdges(playerId, EDGE.CONCERNS)
  return edges.map(e => getNode(e.from)).filter(n => n?.type === NODE.RECOMMENDATION)
}

/** All documents connected (referenced/contributed) to a recommendation */
export function docsForRecommendation(recId) {
  const refEdges  = outEdges(recId, EDGE.REFERENCES)
  const docIds    = new Set(refEdges.map(e => e.to))
  // Also traverse: rec → principle → docs
  const prinEdges = inEdges(recId, EDGE.SUPPORTS)
  for (const pe of prinEdges) {
    const coverEdges = inEdges(pe.from, EDGE.COVERS)
    coverEdges.forEach(ce => docIds.add(ce.from))
  }
  return [...docIds].map(id => getNode(id)).filter(n => n?.type === NODE.DOCUMENT)
}

/** All training sessions that use an exercise or drill */
export function sessionsForExercise(exerciseId) {
  const edges = inEdges(exerciseId, EDGE.USES)
  return edges.map(e => getNode(e.from)).filter(n => n?.type === NODE.TRAINING_SESSION)
}

/** All decisions historically connected to a fixture or similar fixture */
export function decisionsForFixture(fixtureId) {
  // Direct: rec generated from fixture observation → dec
  const obsEdges = inEdges(fixtureId, EDGE.OBSERVED_IN)
  const decIds   = new Set()
  for (const oe of obsEdges) {
    const recEdges = outEdges(oe.from, EDGE.GENERATED)
    for (const re of recEdges) {
      const decEdges = outEdges(re.to, EDGE.RESULTED_IN)
      decEdges.forEach(de => decIds.add(de.to))
    }
  }
  return [...decIds].map(id => getNode(id)).filter(n => n?.type === NODE.DECISION)
}

/** All coaching principles referenced (via documents or drills) in a season */
export function principlesThisSeason(seasonId) {
  // Season → fixtures/sessions → docs/drills → principles
  const contained = expand(seasonId, 2, { direction: 'out' })
  const principleIds = new Set()
  for (const n of contained.nodes) {
    if (n.type === NODE.DOCUMENT || n.type === NODE.DRILL) {
      for (const e of outEdges(n.id).filter(e => [EDGE.COVERS, EDGE.TEACHES].includes(e.type))) {
        principleIds.add(e.to)
      }
    }
  }
  return [...principleIds].map(id => getNode(id)).filter(n => n?.type === NODE.COACHING_PRINCIPLE)
}

/** Find players in a team */
export function playersInTeam(teamId) {
  const edges = inEdges(teamId, EDGE.MEMBER_OF)
  return edges.map(e => getNode(e.from)).filter(n => n?.type === NODE.PLAYER)
}

/** Find all recommendations generated by a specific engine */
export function recsFromEngine(engineId) {
  const edges = inEdges(engineId, EDGE.GENERATED_BY)
  return edges.map(e => getNode(e.from)).filter(n => n?.type === NODE.RECOMMENDATION)
}

/** Find all documents that contribute to a knowledge base */
export function docsInKnowledgeBase(kbId) {
  const edges = inEdges(kbId, EDGE.CONTRIBUTES_TO)
  return edges.map(e => getNode(e.from)).filter(n => n?.type === NODE.DOCUMENT)
}

/** Aggregate graph statistics */
export function graphStats() {
  const nodes = getAllNodes()
  const edges = getAllEdges()
  const byType = {}
  for (const n of nodes) byType[n.type] = (byType[n.type] ?? 0) + 1
  const byEdgeType = {}
  for (const e of edges) byEdgeType[e.type] = (byEdgeType[e.type] ?? 0) + 1
  return {
    nodeCount:  nodes.length,
    edgeCount:  edges.length,
    byType,
    byEdgeType,
    avgDegree:  nodes.length ? (edges.length * 2 / nodes.length).toFixed(1) : 0,
  }
}
