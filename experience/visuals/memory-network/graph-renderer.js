// ─────────────────────────────────────────────────────────────────────────────
// Memory Network — 2D project-graph renderer (Experience Layer, M32)
//
// Salvaged from the retired mission-control/app.js canvas renderer. Everything
// data-coupled was DROPPED: no fetch('/api/mission-control'), no telemetry/HUD
// DOM overlays, no demo payload, no service-worker registration, no sparklines.
//
// What remains is a pure, framework-agnostic force-graph renderer:
//   createGraphRenderer(canvas, graph) → { setGraph, start, stop, destroy }
// where `graph` is a VisualModel `memory` slice: { nodes:[{id,label,cluster,
// activated}], edges:[{from,to,weight}] }. No domain knowledge, no business logic.
// ─────────────────────────────────────────────────────────────────────────────

const CLUSTER_COLORS = {
  core:     '#22d3ee',
  identity: '#a78bfa',
  match:    '#38bdf8',
  plan:     '#34d399',
  season:   '#fbbf24',
  default:  '#7dd3fc',
}

function hashValue(value = '') {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

function colorFor(node) {
  return CLUSTER_COLORS[node.cluster] || CLUSTER_COLORS.default
}

export function createGraphRenderer(canvas, graph = { nodes: [], edges: [] }) {
  const ctx = canvas.getContext('2d', { alpha: true })

  const state = {
    nodes: [], links: [], nodeById: new Map(), adjacency: new Map(),
    width: 0, height: 0, dpr: 1, zoom: 0.86, panX: 0, panY: 0, tick: 0,
    hovered: null, dragging: false, lastPointer: null, raf: 0,
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  function assignLayout(g) {
    const nodes = (g.nodes || []).map((node, index) => {
      const h = hashValue(node.id)
      const isCore = node.cluster === 'core'
      const ring = isCore ? 0 : 150 + (h % 360)
      const angle = (index / Math.max(1, g.nodes.length)) * Math.PI * 2 + (h % 90) / 90
      const homeX = isCore ? 0 : Math.cos(angle) * ring
      const homeY = isCore ? 0 : Math.sin(angle) * ring * 0.62
      return {
        ...node, x: homeX, y: homeY, vx: 0, vy: 0, homeX, homeY,
        size: isCore ? 22 : node.activated ? 13 : 9,
        pulse: (h % 100) / 100 * Math.PI * 2,
        activity: node.activated ? 0.8 : 0.15,
      }
    })
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    const links = (g.edges || [])
      .filter(e => nodeById.has(e.from) && nodeById.has(e.to))
      .map(e => ({
        source: e.from, target: e.to,
        phase: (hashValue(`${e.from}:${e.to}`) % 628) / 100,
        strength: 0.5 + (e.weight ?? 0.5) * 0.6,
      }))
    const adjacency = new Map(nodes.map(n => [n.id, new Set()]))
    links.forEach(l => { adjacency.get(l.source)?.add(l.target); adjacency.get(l.target)?.add(l.source) })
    state.nodes = nodes; state.links = links; state.nodeById = nodeById; state.adjacency = adjacency
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    state.width = rect.width
    state.height = rect.height
    state.dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(rect.width * state.dpr)
    canvas.height = Math.floor(rect.height * state.dpr)
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0)
    if (!state.panX && !state.panY) {
      state.panX = rect.width / 2
      state.panY = rect.height / 2
    }
  }

  const worldToScreen = (x, y) => ({ x: x * state.zoom + state.panX, y: y * state.zoom + state.panY })
  const screenToWorld = (x, y) => ({ x: (x - state.panX) / state.zoom, y: (y - state.panY) / state.zoom })

  function connectedToFocus(node) {
    const focus = state.hovered
    if (!focus) return true
    return node.id === focus.id || state.adjacency.get(focus.id)?.has(node.id)
  }

  // ── Simulation ───────────────────────────────────────────────────────────────
  function simulate() {
    for (const link of state.links) {
      const a = state.nodeById.get(link.source)
      const b = state.nodeById.get(link.target)
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.max(1, Math.hypot(dx, dy))
      const force = (d - 120) * 0.0009 * link.strength
      a.vx += dx / d * force; a.vy += dy / d * force
      b.vx -= dx / d * force; b.vy -= dy / d * force
    }
    state.nodes.forEach((node, index) => {
      const homePull = node.cluster === 'core' ? 0.012 : 0.004
      node.vx += (node.homeX - node.x) * homePull + Math.cos(state.tick * 0.006 + index) * 0.025
      node.vy += (node.homeY - node.y) * homePull + Math.sin(state.tick * 0.007 + index) * 0.025
      node.activity = Math.max(node.activated ? 0.35 : 0.02, node.activity * 0.988)
      node.vx *= 0.86; node.vy *= 0.86
      node.x += node.vx; node.y += node.vy
    })
  }

  // ── Drawing ──────────────────────────────────────────────────────────────────
  function drawBackground() {
    const grid = 56 * state.zoom
    ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1
    const ox = state.panX % grid, oy = state.panY % grid
    for (let x = ox; x < state.width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, state.height); ctx.stroke() }
    for (let y = oy; y < state.height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(state.width, y); ctx.stroke() }
    ctx.restore()
  }

  function drawParticles() {
    ctx.save()
    for (let i = 0; i < 60; i++) {
      const x = (Math.sin(state.tick * 0.003 + i * 8.71) * 0.5 + 0.5) * state.width
      const y = (Math.cos(state.tick * 0.002 + i * 13.37) * 0.5 + 0.5) * state.height
      ctx.globalAlpha = 0.08 + (i % 4) * 0.015
      ctx.fillStyle = i % 2 ? '#22d3ee' : '#60a5fa'
      ctx.beginPath(); ctx.arc(x, y, 0.7 + (i % 3) * 0.35, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  function drawLink(link) {
    const a = state.nodeById.get(link.source)
    const b = state.nodeById.get(link.target)
    if (!a || !b) return
    const pa = worldToScreen(a.x, a.y), pb = worldToScreen(b.x, b.y)
    const focus = state.hovered
    const connected = !focus || a.id === focus.id || b.id === focus.id
    const color = colorFor(b) || colorFor(a)
    const pulse = (Math.sin(state.tick * 0.055 + link.phase) + 1) / 2
    const alpha = connected ? 0.26 + pulse * 0.2 : 0.035
    const cx = (pa.x + pb.x) / 2 + Math.sin(link.phase) * 24 * state.zoom
    const cy = (pa.y + pb.y) / 2 + Math.cos(link.phase) * 24 * state.zoom
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color
    ctx.lineWidth = connected ? 1.2 : 0.6
    ctx.shadowBlur = connected ? 16 : 0; ctx.shadowColor = color
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.quadraticCurveTo(cx, cy, pb.x, pb.y); ctx.stroke()
    if (connected) {
      const t = (state.tick * 0.006 * link.strength + link.phase) % 1
      const x = (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * cx + t * t * pb.x
      const y = (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * cy + t * t * pb.y
      ctx.globalAlpha = 0.8; ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(x, y, 2.2 + pulse * 1.8, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  function drawNode(node) {
    const p = worldToScreen(node.x, node.y)
    const connected = connectedToFocus(node)
    const color = colorFor(node)
    const hovered = state.hovered?.id === node.id
    const pulse = (Math.sin(state.tick * 0.05 + node.pulse) + 1) / 2
    const radius = Math.max(3.8, (node.size + node.activity * 5 + pulse * 1.2) * state.zoom)
    ctx.save()
    ctx.globalAlpha = connected ? 1 : 0.12
    ctx.shadowColor = color
    ctx.shadowBlur = connected ? 24 + node.activity * 36 : 0
    const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, radius * 4.2)
    glow.addColorStop(0, `${color}aa`); glow.addColorStop(0.34, `${color}28`); glow.addColorStop(1, `${color}00`)
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(p.x, p.y, radius * 4.2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = color
    ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = hovered ? 2.5 : 1
    ctx.strokeStyle = hovered ? '#f8fafc' : 'rgba(240,249,255,0.72)'
    ctx.stroke()
    if ((hovered || node.cluster === 'core' || state.zoom > 0.88) && connected) {
      ctx.shadowBlur = 12; ctx.fillStyle = '#e0f2fe'
      ctx.font = `${Math.max(10, 11 * state.zoom)}px Inter, sans-serif`
      ctx.fillText(node.label, p.x + radius + 8, p.y + 4)
    }
    ctx.restore()
  }

  function render() {
    state.tick++
    simulate()
    ctx.clearRect(0, 0, state.width, state.height)
    drawBackground(); drawParticles()
    state.links.forEach(drawLink)
    state.nodes.forEach(drawNode)
    state.raf = requestAnimationFrame(render)
  }

  // ── Pointer interaction (scoped to the canvas, not window/document) ───────────
  function nearestNode(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    const world = screenToWorld(clientX - rect.left, clientY - rect.top)
    let best = null, bestD = Infinity
    for (const node of state.nodes) {
      const d = Math.hypot(node.x - world.x, node.y - world.y)
      if (d < bestD && d < Math.max(18, node.size + 12) / state.zoom) { best = node; bestD = d }
    }
    return best
  }

  const onPointerDown = e => { state.dragging = true; state.lastPointer = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId) }
  const onPointerMove = e => {
    state.hovered = nearestNode(e.clientX, e.clientY)
    if (state.dragging && state.lastPointer) {
      state.panX += e.clientX - state.lastPointer.x
      state.panY += e.clientY - state.lastPointer.y
      state.lastPointer = { x: e.clientX, y: e.clientY }
    }
  }
  const onPointerUp = () => { state.dragging = false; state.lastPointer = null }
  const onWheel = e => {
    e.preventDefault()
    const before = screenToWorld(e.clientX, e.clientY)
    state.zoom = Math.min(2.2, Math.max(0.32, state.zoom * (e.deltaY < 0 ? 1.08 : 0.92)))
    const after = screenToWorld(e.clientX, e.clientY)
    state.panX += (after.x - before.x) * state.zoom
    state.panY += (after.y - before.y) * state.zoom
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('resize', resize)

  // ── Public API ────────────────────────────────────────────────────────────────
  function setGraph(g) { assignLayout(g || { nodes: [], edges: [] }) }
  function start() { if (!state.raf) { resize(); state.raf = requestAnimationFrame(render) } }
  function stop() { if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0 } }
  function destroy() {
    stop()
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('wheel', onWheel)
    window.removeEventListener('resize', resize)
  }

  assignLayout(graph)
  return { setGraph, start, stop, destroy }
}
