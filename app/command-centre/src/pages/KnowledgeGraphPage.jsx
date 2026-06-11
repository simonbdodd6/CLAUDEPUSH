/**
 * KnowledgeGraphPage — Developer-only knowledge graph explorer
 *
 * Force-directed SVG graph with:
 *   - Node type colour coding (matches graph-model NODE_META)
 *   - Click to select / expand neighbours (BFS depth-1)
 *   - Drag nodes
 *   - Pan + zoom
 *   - Search nodes by label / title
 *   - Filter by node type
 *   - Node detail panel
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useGraphStats, useGraphNodes, useGraphEdges } from '../hooks/useClubData.js'
import IntelligenceSkeleton from '../components/intelligence/IntelligenceSkeleton.jsx'

// Node type → colour (matches NODE_META in graph-model)
const NODE_COLORS = {
  Coach:              '#7c3aed',
  Club:               '#1d4ed8',
  Team:               '#0891b2',
  Player:             '#059669',
  Fixture:            '#b45309',
  TrainingSession:    '#0284c7',
  Exercise:           '#0d9488',
  Drill:              '#0d9488',
  CoachingPrinciple:  '#7c3aed',
  Theme:              '#9333ea',
  Recommendation:     '#dc2626',
  Decision:           '#16a34a',
  Observation:        '#d97706',
  Video:              '#9333ea',
  Document:           '#2563eb',
  Season:             '#92400e',
  Competition:        '#be185d',
  Position:           '#6b7280',
  MedicalEvent:       '#dc2626',
  AttendanceEvent:    '#0891b2',
  IntelligenceEngine: '#6d28d9',
  KnowledgeBase:      '#1e40af',
}

const NODE_RADIUS = { Coach: 12, Club: 14, Team: 11, Player: 9, IntelligenceEngine: 11, KnowledgeBase: 10 }
const DEFAULT_RADIUS = 8

function nodeColor(type) { return NODE_COLORS[type] ?? '#6b7280' }
function nodeRadius(type) { return NODE_RADIUS[type] ?? DEFAULT_RADIUS }

// ── Force simulation (spring-repulsion, no external lib) ─────────────────────

function initPositions(nodes, width, height) {
  const cx = width / 2, cy = height / 2
  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length
    const r = Math.min(width, height) * 0.3
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), vx: 0, vy: 0 }
  })
}

function tickForce(nodes, edges, width, height) {
  const REPULSION   = 3000
  const SPRING_K    = 0.05
  const SPRING_LEN  = 120
  const DAMPING     = 0.85
  const GRAVITY     = 0.01

  const nodeMap = {}
  for (const n of nodes) nodeMap[n.id] = n

  // repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1)
      const force = REPULSION / (dist * dist)
      const fx = (dx / dist) * force, fy = (dy / dist) * force
      a.vx -= fx; a.vy -= fy
      b.vx += fx; b.vy += fy
    }
  }

  // spring attraction
  for (const e of edges) {
    const a = nodeMap[e.from], b = nodeMap[e.to]
    if (!a || !b) continue
    const dx = b.x - a.x, dy = b.y - a.y
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1)
    const stretch = dist - SPRING_LEN
    const force = SPRING_K * stretch
    const fx = (dx / dist) * force, fy = (dy / dist) * force
    a.vx += fx; a.vy += fy
    b.vx -= fx; b.vy -= fy
  }

  // gravity toward centre
  for (const n of nodes) {
    if (n.pinned) continue
    n.vx += (width  / 2 - n.x) * GRAVITY
    n.vy += (height / 2 - n.y) * GRAVITY
    n.vx *= DAMPING; n.vy *= DAMPING
    n.x += n.vx; n.y += n.vy
    n.x = Math.max(20, Math.min(width  - 20, n.x))
    n.y = Math.max(20, Math.min(height - 20, n.y))
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KnowledgeGraphPage() {
  const { data: statsData, loading: statsLoading } = useGraphStats()
  const [typeFilter, setTypeFilter] = useState('')
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState(null)
  const [expanded,   setExpanded]   = useState(new Set())
  const [visibleTypes, setVisibleTypes] = useState(new Set(Object.keys(NODE_COLORS)))

  const nodesQ = useMemo(() => {
    const p = {}
    if (typeFilter) p.type = typeFilter
    if (search)     p.q    = search
    return p
  }, [typeFilter, search])

  const { data: nodesData, loading: nodesLoading } = useGraphNodes(nodesQ)
  const { data: edgesData, loading: edgesLoading } = useGraphEdges({})

  const svgRef    = useRef(null)
  const rafRef    = useRef(null)
  const simNodes  = useRef([])
  const simEdges  = useRef([])
  const [frame,   setFrame]   = useState(0)
  const [pan,     setPan]     = useState({ x: 0, y: 0 })
  const [zoom,    setZoom]    = useState(1)
  const panStart  = useRef(null)
  const dragNode  = useRef(null)
  const SVG_W     = 960
  const SVG_H     = 600

  // seed simulation when data loads
  useEffect(() => {
    if (!nodesData || !edgesData) return
    const filteredNodes = Array.isArray(nodesData)
      ? nodesData.filter(n => visibleTypes.has(n.type))
      : (nodesData.nodes ?? []).filter(n => visibleTypes.has(n.type))
    const rawEdges = Array.isArray(edgesData) ? edgesData : (edgesData.edges ?? [])
    simNodes.current = initPositions(filteredNodes, SVG_W, SVG_H)
    simEdges.current = rawEdges.filter(e =>
      simNodes.current.some(n => n.id === e.from) &&
      simNodes.current.some(n => n.id === e.to)
    )
    // run 100 ticks before first render
    for (let i = 0; i < 100; i++) {
      tickForce(simNodes.current, simEdges.current, SVG_W, SVG_H)
    }
    setFrame(f => f + 1)
  }, [nodesData, edgesData, visibleTypes])

  // animation loop
  useEffect(() => {
    let stopped = false
    let tick = 0
    function step() {
      if (stopped) return
      if (tick < 300) {
        tickForce(simNodes.current, simEdges.current, SVG_W, SVG_H)
        setFrame(f => f + 1)
        tick++
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { stopped = true; cancelAnimationFrame(rafRef.current) }
  }, [nodesData, edgesData, visibleTypes])

  // ── Interaction ─────────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((node, e) => {
    e.stopPropagation()
    setSelected(prev => prev?.id === node.id ? null : node)
  }, [])

  const handleNodeDblClick = useCallback((node, e) => {
    e.stopPropagation()
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(node.id)) next.delete(node.id)
      else next.add(node.id)
      return next
    })
  }, [])

  const handleNodeMouseDown = useCallback((node, e) => {
    e.stopPropagation()
    dragNode.current = { id: node.id, startX: e.clientX, startY: e.clientY }
    node.pinned = true
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (dragNode.current) {
      const n = simNodes.current.find(x => x.id === dragNode.current.id)
      if (n) {
        n.x += e.movementX / zoom
        n.y += e.movementY / zoom
        n.vx = 0; n.vy = 0
        setFrame(f => f + 1)
      }
    } else if (panStart.current) {
      setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }))
    }
  }, [zoom])

  const handleMouseUp = useCallback(() => {
    if (dragNode.current) {
      const n = simNodes.current.find(x => x.id === dragNode.current.id)
      if (n) n.pinned = false
    }
    dragNode.current = null
    panStart.current = null
  }, [])

  const handleSvgMouseDown = useCallback((e) => {
    if (e.target === svgRef.current || e.target.tagName === 'rect') {
      panStart.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    setZoom(z => Math.max(0.2, Math.min(3, z * (e.deltaY < 0 ? 1.1 : 0.9))))
  }, [])

  const toggleType = (type) => {
    setVisibleTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const nodes = simNodes.current
  const edges = simEdges.current
  const nodeMap = useMemo(() => {
    const m = {}
    for (const n of nodes) m[n.id] = n
    return m
  }, [frame])

  const selectedEdges = useMemo(() => {
    if (!selected) return new Set()
    return new Set(edges.filter(e => e.from === selected.id || e.to === selected.id).map(e => e.id ?? `${e.from}-${e.to}`))
  }, [selected, frame])

  if (statsLoading || nodesLoading) return <IntelligenceSkeleton label="Loading Knowledge Graph…" />

  const stats = statsData ?? {}
  const allTypes = Object.keys(NODE_COLORS)

  return (
    <div className="flex flex-col h-full bg-surface-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-1 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <GraphIcon />
            <h1 className="text-base font-semibold text-ink-1">Knowledge Graph</h1>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-bold uppercase tracking-wider">DEV</span>
          </div>
          <p className="text-xs text-ink-3 mt-0.5">
            {stats.nodeCount ?? '—'} nodes · {stats.edgeCount ?? '—'} edges · {stats.typeCount ?? '—'} types
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search nodes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded border border-border bg-surface-2 text-ink-1 placeholder:text-ink-3 w-44 focus:outline-none focus:border-accent"
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded border border-border bg-surface-2 text-ink-1 focus:outline-none focus:border-accent"
          >
            <option value="">All types</option>
            {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Type legend / filter sidebar */}
        <div className="w-44 flex-shrink-0 border-r border-border-subtle bg-surface-1 py-3 px-2 overflow-y-auto">
          <div className="text-[10px] text-ink-3 uppercase tracking-wider px-1 mb-2 font-semibold">Node Types</div>
          {allTypes.map(type => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-all ${
                visibleTypes.has(type) ? 'text-ink-1 bg-surface-2' : 'text-ink-4 opacity-40'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: nodeColor(type) }} />
              <span className="truncate">{type}</span>
            </button>
          ))}
          <button
            onClick={() => setVisibleTypes(new Set(allTypes))}
            className="mt-2 w-full text-[10px] text-accent hover:text-accent/80 px-2 py-1"
          >
            Show all
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden bg-surface-2">
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${SVG_W / zoom} ${SVG_H / zoom}`}
            className="cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onClick={() => setSelected(null)}
          >
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" opacity="0.6" />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map((e, i) => {
              const a = nodeMap[e.from], b = nodeMap[e.to]
              if (!a || !b) return null
              const eId  = e.id ?? `${e.from}-${e.to}`
              const isHi = selectedEdges.has(eId)
              return (
                <g key={eId ?? i}>
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={isHi ? '#7c3aed' : '#94a3b8'}
                    strokeWidth={isHi ? 1.8 : 0.8}
                    strokeOpacity={isHi ? 0.9 : 0.35}
                    markerEnd="url(#arrowhead)"
                  />
                  {isHi && (
                    <text
                      x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4}
                      fontSize="7" fill="#7c3aed" textAnchor="middle" opacity="0.9"
                    >
                      {e.type}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const r      = nodeRadius(n.type)
              const color  = nodeColor(n.type)
              const isSel  = selected?.id === n.id
              const isAdj  = selected ? edges.some(e => (e.from === selected.id && e.to === n.id) || (e.to === selected.id && e.from === n.id)) : false
              const dimmed = selected && !isSel && !isAdj
              const label  = n.label ?? n.metadata?.name ?? n.id
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  onClick={(e) => handleNodeClick(n, e)}
                  onDoubleClick={(e) => handleNodeDblClick(n, e)}
                  onMouseDown={(e) => handleNodeMouseDown(n, e)}
                  style={{ cursor: 'pointer', opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.15s' }}
                >
                  {isSel && (
                    <circle r={r + 5} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.4" />
                  )}
                  <circle
                    r={r}
                    fill={color}
                    fillOpacity={isSel ? 1 : 0.85}
                    stroke={isSel ? '#fff' : color}
                    strokeWidth={isSel ? 2 : 0.5}
                  />
                  <text
                    dy={r + 10}
                    textAnchor="middle"
                    fontSize={isSel ? 9 : 8}
                    fontWeight={isSel ? 600 : 400}
                    fill={isSel ? '#1e1b4b' : '#64748b'}
                    style={{ pointerEvents: 'none' }}
                  >
                    {label.length > 14 ? label.slice(0, 13) + '…' : label}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1">
            <button onClick={() => setZoom(z => Math.min(3, z * 1.25))} className="w-7 h-7 flex items-center justify-center rounded bg-surface-1 border border-border text-ink-2 text-sm hover:bg-surface-2 shadow-sm">+</button>
            <button onClick={() => setZoom(1)} className="w-7 h-7 flex items-center justify-center rounded bg-surface-1 border border-border text-ink-3 text-[9px] hover:bg-surface-2 shadow-sm">1:1</button>
            <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} className="w-7 h-7 flex items-center justify-center rounded bg-surface-1 border border-border text-ink-2 text-sm hover:bg-surface-2 shadow-sm">−</button>
          </div>

          {/* Empty state */}
          {nodes.length === 0 && !nodesLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-ink-3 text-sm">No nodes visible</div>
                <div className="text-ink-4 text-xs mt-1">Adjust filters or enable more node types</div>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-72 flex-shrink-0 border-l border-border-subtle bg-surface-1 overflow-y-auto">
            <NodeDetailPanel
              node={selected}
              edges={edges}
              nodeMap={nodeMap}
              onClose={() => setSelected(null)}
              onNavigate={n => setSelected(n)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Node Detail Panel ─────────────────────────────────────────────────────────

function NodeDetailPanel({ node, edges, nodeMap, onClose, onNavigate }) {
  const outgoing = edges.filter(e => e.from === node.id)
  const incoming = edges.filter(e => e.to   === node.id)
  const meta     = node.metadata ?? {}

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ background: nodeColor(node.type) }} />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-ink-1 truncate">{node.label ?? meta.name ?? node.id}</div>
            <div className="text-[10px] text-ink-3">{node.type}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-ink-3 hover:text-ink-1 flex-shrink-0 ml-2">
          <span className="text-base leading-none">×</span>
        </button>
      </div>

      {/* Metadata */}
      {Object.keys(meta).length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] text-ink-3 uppercase tracking-wider mb-1.5 font-semibold">Properties</div>
          <div className="space-y-1">
            {Object.entries(meta).filter(([k]) => !['id'].includes(k)).slice(0, 10).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-[11px]">
                <span className="text-ink-3 capitalize min-w-0 flex-shrink-0 w-20 truncate">{k}</span>
                <span className="text-ink-1 truncate">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {node.confidence != null && (
        <div className="mb-4">
          <div className="text-[10px] text-ink-3 uppercase tracking-wider mb-1 font-semibold">Confidence</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-accent" style={{ width: `${node.confidence}%` }} />
            </div>
            <span className="text-xs text-ink-2 tabular-nums">{node.confidence}%</span>
          </div>
        </div>
      )}

      {/* Outgoing edges */}
      {outgoing.length > 0 && (
        <EdgeList title="Out" edges={outgoing} nodeMap={nodeMap} onNavigate={onNavigate} direction="out" />
      )}

      {/* Incoming edges */}
      {incoming.length > 0 && (
        <EdgeList title="In" edges={incoming} nodeMap={nodeMap} onNavigate={onNavigate} direction="in" />
      )}

      <div className="mt-3 pt-3 border-t border-border-subtle">
        <div className="text-[9px] text-ink-4 font-mono break-all">{node.id}</div>
        {node.version && <div className="text-[9px] text-ink-4">v{node.version} · {node.source ?? 'graph'}</div>}
      </div>
    </div>
  )
}

function EdgeList({ title, edges, nodeMap, onNavigate, direction }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? edges : edges.slice(0, 5)

  return (
    <div className="mb-3">
      <div className="text-[10px] text-ink-3 uppercase tracking-wider mb-1.5 font-semibold">
        {title} ({edges.length})
      </div>
      <div className="space-y-1">
        {shown.map((e, i) => {
          const peerId = direction === 'out' ? e.to : e.from
          const peer   = nodeMap[peerId]
          return (
            <div key={e.id ?? i} className="flex items-center gap-1.5 group">
              <span className="text-[9px] text-ink-3 bg-surface-3 px-1 py-0.5 rounded flex-shrink-0 max-w-[80px] truncate">{e.type}</span>
              {peer ? (
                <button
                  onClick={() => onNavigate(peer)}
                  className="text-[11px] text-accent hover:underline truncate text-left"
                >
                  {peer.label ?? peer.metadata?.name ?? peerId}
                </button>
              ) : (
                <span className="text-[11px] text-ink-4 font-mono truncate">{peerId}</span>
              )}
            </div>
          )
        })}
      </div>
      {edges.length > 5 && !showAll && (
        <button onClick={() => setShowAll(true)} className="text-[10px] text-accent mt-1 hover:underline">
          +{edges.length - 5} more
        </button>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function GraphIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-purple-500">
      <circle cx="8" cy="3" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="3" cy="12" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="13" cy="12" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <line x1="8" y1="5" x2="3.8" y2="10.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="8" y1="5" x2="12.2" y2="10.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="5" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
