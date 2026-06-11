/**
 * Knowledge Graph — Store
 *
 * In-memory labeled property graph with optional JSONL persistence.
 * Structure: nodes Map + edges Map + adjacency index for O(1) traversal.
 *
 * Multi-club aware: every node/edge carries a clubId.
 * Versioned: every mutation increments the entity's version counter.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dir  = dirname(fileURLToPath(import.meta.url))
const DATA   = resolve(__dir, 'data')
const NODES_FILE = resolve(DATA, 'nodes.jsonl')
const EDGES_FILE = resolve(DATA, 'edges.jsonl')

// ── In-memory state ───────────────────────────────────────────────────────────

let _nodes   = null  // Map<id, node>
let _edges   = null  // Map<id, edge>
let _adj     = null  // Map<nodeId, Set<edgeId>>   (adjacency index)
let _seeded  = false
let _dirty   = false

// ── Init / load ───────────────────────────────────────────────────────────────

function ensureLoaded() {
  if (_nodes) return
  _nodes = new Map()
  _edges = new Map()
  _adj   = new Map()

  if (existsSync(NODES_FILE)) {
    readFileSync(NODES_FILE, 'utf8')
      .split('\n').filter(Boolean)
      .forEach(line => { try { const n = JSON.parse(line); _nodes.set(n.id, n) } catch {} })
  }
  if (existsSync(EDGES_FILE)) {
    readFileSync(EDGES_FILE, 'utf8')
      .split('\n').filter(Boolean)
      .forEach(line => { try { const e = JSON.parse(line); _edges.set(e.id, e); _indexEdge(e) } catch {} })
  }
}

function _indexEdge(edge) {
  if (!_adj.has(edge.from)) _adj.set(edge.from, new Set())
  if (!_adj.has(edge.to))   _adj.set(edge.to,   new Set())
  _adj.get(edge.from).add(edge.id)
  _adj.get(edge.to  ).add(edge.id)
}

function _unindexEdge(edge) {
  _adj.get(edge.from)?.delete(edge.id)
  _adj.get(edge.to  )?.delete(edge.id)
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function flush() {
  if (!_dirty || !_nodes) return
  try {
    if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true })
    writeFileSync(NODES_FILE, [..._nodes.values()].map(n => JSON.stringify(n)).join('\n') + '\n')
    writeFileSync(EDGES_FILE, [..._edges.values()].map(e => JSON.stringify(e)).join('\n') + '\n')
    _dirty = false
  } catch (err) {
    console.error('[graph-store] flush error:', err.message)
  }
}

// ── Node CRUD ─────────────────────────────────────────────────────────────────

export function addNode(node) {
  ensureLoaded()
  const now = new Date().toISOString()
  const n = {
    id:         node.id         ?? `n-${randomUUID().slice(0, 8)}`,
    type:       node.type,
    label:      node.label      ?? '',
    metadata:   node.metadata   ?? {},
    confidence: node.confidence ?? 100,
    source:     node.source     ?? 'manual',
    clubId:     node.clubId     ?? 'club-001',
    coachId:    node.coachId    ?? null,
    version:    1,
    createdAt:  now,
    updatedAt:  now,
  }
  _nodes.set(n.id, n)
  if (!_adj.has(n.id)) _adj.set(n.id, new Set())
  _dirty = true
  return n
}

export function updateNode(id, patch) {
  ensureLoaded()
  const n = _nodes.get(id)
  if (!n) return null
  const updated = { ...n, ...patch, id, version: n.version + 1, updatedAt: new Date().toISOString() }
  _nodes.set(id, updated)
  _dirty = true
  return updated
}

export function removeNode(id) {
  ensureLoaded()
  const n = _nodes.get(id)
  if (!n) return false
  // Remove all connected edges
  const edgeIds = [...(_adj.get(id) ?? [])]
  edgeIds.forEach(eid => { const e = _edges.get(eid); if (e) { _unindexEdge(e); _edges.delete(eid) } })
  _adj.delete(id)
  _nodes.delete(id)
  _dirty = true
  return true
}

export function getNode(id) { ensureLoaded(); return _nodes.get(id) ?? null }
export function getAllNodes() { ensureLoaded(); return [..._nodes.values()] }
export function nodeCount() { ensureLoaded(); return _nodes.size }

// ── Edge CRUD ─────────────────────────────────────────────────────────────────

export function addEdge(edge) {
  ensureLoaded()
  const now = new Date().toISOString()
  const e = {
    id:         edge.id         ?? `e-${randomUUID().slice(0, 8)}`,
    type:       edge.type,
    from:       edge.from,
    to:         edge.to,
    weight:     edge.weight     ?? 1,
    metadata:   edge.metadata   ?? {},
    confidence: edge.confidence ?? 100,
    source:     edge.source     ?? 'manual',
    clubId:     edge.clubId     ?? 'club-001',
    version:    1,
    createdAt:  now,
    updatedAt:  now,
  }
  _edges.set(e.id, e)
  _indexEdge(e)
  _dirty = true
  return e
}

export function removeEdge(id) {
  ensureLoaded()
  const e = _edges.get(id)
  if (!e) return false
  _unindexEdge(e)
  _edges.delete(id)
  _dirty = true
  return true
}

export function getEdge(id) { ensureLoaded(); return _edges.get(id) ?? null }
export function getAllEdges() { ensureLoaded(); return [..._edges.values()] }
export function edgeCount() { ensureLoaded(); return _edges.size }

// ── Adjacency helpers ─────────────────────────────────────────────────────────

export function edgesOf(nodeId) {
  ensureLoaded()
  const ids = _adj.get(nodeId) ?? new Set()
  return [...ids].map(id => _edges.get(id)).filter(Boolean)
}

export function outEdges(nodeId, type) {
  return edgesOf(nodeId).filter(e => e.from === nodeId && (!type || e.type === type))
}

export function inEdges(nodeId, type) {
  return edgesOf(nodeId).filter(e => e.to === nodeId && (!type || e.type === type))
}

export function neighbourIds(nodeId, direction = 'both', type) {
  const edges = edgesOf(nodeId)
  const ids   = new Set()
  for (const e of edges) {
    if (type && e.type !== type) continue
    if ((direction === 'both' || direction === 'out') && e.from === nodeId) ids.add(e.to)
    if ((direction === 'both' || direction === 'in')  && e.to   === nodeId) ids.add(e.from)
  }
  return [...ids]
}

// ── Seeding interface ─────────────────────────────────────────────────────────

export function isSeeded() { ensureLoaded(); return _seeded }
export function markSeeded() { _seeded = true }

export function resetStore() {
  _nodes  = null
  _edges  = null
  _adj    = null
  _seeded = false
  _dirty  = false
}
