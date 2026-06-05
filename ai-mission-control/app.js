import { createAIOpsMockAdapter } from './adapters.js';

const canvas = document.getElementById('networkCanvas');
const ctx = canvas.getContext('2d', { alpha: true });
const infoCard = document.getElementById('infoCard');
const activityLog = document.getElementById('activityLog');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const filtersEl = document.getElementById('filters');

const colors = {
  Repository: '#3ee7ff',
  Commits: '#42ff9e',
  Files: '#8be9ff',
  Tests: '#7cffcb',
  Deployments: '#a783ff',
  'AI Tasks': '#ffd166',
  Builds: '#ff5d7d',
  Structure: '#4cc9f0',
};

const filterGroups = ['Commits', 'Files', 'Tests', 'Deployments', 'AI Tasks', 'Builds'];
const activeFilters = new Set(filterGroups);
const activityPhrases = [
  ['Commits', 'indexing recent diff context for'],
  ['Files', 'refreshing dependency map around'],
  ['Tests', 'validating regression signals from'],
  ['Deployments', 'watching preview telemetry for'],
  ['AI Tasks', 'routing planning context through'],
  ['Builds', 'checking pipeline heartbeat at'],
  ['Structure', 'mapping project topology below'],
];

const state = {
  width: 0,
  height: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  pointer: { x: 0, y: 0, worldX: 0, worldY: 0 },
  hovered: null,
  selected: null,
  dragging: false,
  lastDrag: null,
  tick: 0,
  activityCount: 0,
};

function makeNode(id, label, group, x, y, size = 7, meta = {}) {
  return { id, label, group, x, y, vx: 0, vy: 0, homeX: x, homeY: y, size, pulse: Math.random() * 10, activity: Math.random(), meta };
}

function makeEdge(source, target, type = 'signal', strength = 1) {
  return { source, target, type, strength, phase: Math.random() * Math.PI * 2, activity: Math.random() };
}

const graphAdapter = createAIOpsMockAdapter({ makeNode, makeEdge });
const graph = graphAdapter.load();
const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
const adjacency = new Map();
graph.edges.forEach(edge => {
  if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
  if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
  adjacency.get(edge.source).add(edge.target);
  adjacency.get(edge.target).add(edge.source);
});

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = rect.width;
  state.height = rect.height;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!state.panX && !state.panY) {
    state.panX = rect.width / 2;
    state.panY = rect.height / 2;
  }
}

function worldToScreen(x, y) {
  return { x: x * state.zoom + state.panX, y: y * state.zoom + state.panY };
}

function screenToWorld(x, y) {
  return { x: (x - state.panX) / state.zoom, y: (y - state.panY) / state.zoom };
}

function visibleNode(node) {
  return activeFilters.has(node.group) || !filterGroups.includes(node.group);
}

function edgeVisible(edge) {
  return visibleNode(nodeById.get(edge.source)) && visibleNode(nodeById.get(edge.target));
}

function isConnected(node) {
  const focus = state.hovered || state.selected;
  if (!focus) return true;
  return node.id === focus.id || adjacency.get(focus.id)?.has(node.id);
}

function simulate() {
  const t = state.tick;
  graph.nodes.forEach((node, i) => {
    const breathe = Math.sin(t * 0.018 + node.pulse) * 0.45;
    const driftX = Math.cos(t * 0.006 + i) * 0.18;
    const driftY = Math.sin(t * 0.007 + i * 1.7) * 0.18;
    node.vx += (node.homeX + breathe * 6 - node.x) * 0.006 + driftX;
    node.vy += (node.homeY + breathe * 6 - node.y) * 0.006 + driftY;
    node.vx *= 0.84;
    node.vy *= 0.84;
    node.x += node.vx;
    node.y += node.vy;
    node.activity = Math.max(0, node.activity * 0.985);
  });
}

function drawEdge(edge) {
  if (!edgeVisible(edge)) return;
  const a = nodeById.get(edge.source);
  const b = nodeById.get(edge.target);
  const focus = state.hovered || state.selected;
  const connected = !focus || a.id === focus.id || b.id === focus.id || (adjacency.get(focus.id)?.has(a.id) && adjacency.get(focus.id)?.has(b.id));
  const pa = worldToScreen(a.x, a.y);
  const pb = worldToScreen(b.x, b.y);
  const alpha = connected ? 0.42 : 0.045;
  const pulse = (Math.sin(state.tick * 0.055 + edge.phase) + 1) / 2;
  const color = colors[b.group] || colors[a.group] || '#3ee7ff';
  ctx.save();
  ctx.globalAlpha = alpha + pulse * 0.18 * edge.strength;
  ctx.strokeStyle = color;
  ctx.lineWidth = connected ? Math.max(0.7, edge.strength * state.zoom) : 0.5;
  ctx.shadowBlur = connected ? 12 : 0;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  const cx = (pa.x + pb.x) / 2 + Math.sin(edge.phase) * 18 * state.zoom;
  const cy = (pa.y + pb.y) / 2 + Math.cos(edge.phase) * 18 * state.zoom;
  ctx.quadraticCurveTo(cx, cy, pb.x, pb.y);
  ctx.stroke();

  if (connected) {
    const p = (state.tick * 0.008 * edge.strength + edge.phase) % 1;
    const x = (1 - p) * (1 - p) * pa.x + 2 * (1 - p) * p * cx + p * p * pb.x;
    const y = (1 - p) * (1 - p) * pa.y + 2 * (1 - p) * p * cy + p * p * pb.y;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(x, y, 2.2 + pulse * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawNode(node) {
  if (!visibleNode(node)) return;
  const p = worldToScreen(node.x, node.y);
  const connected = isConnected(node);
  const color = colors[node.group] || '#3ee7ff';
  const active = node.activity > 0.05;
  const radius = (node.size + (active ? node.activity * 8 : 0)) * state.zoom;
  ctx.save();
  ctx.globalAlpha = connected ? 1 : 0.12;
  ctx.shadowBlur = connected ? 26 + node.activity * 28 : 2;
  ctx.shadowColor = color;
  const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, radius * 3.4);
  glow.addColorStop(0, `${color}88`);
  glow.addColorStop(0.38, `${color}22`);
  glow.addColorStop(1, `${color}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius * 3.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(3.5, radius), 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = state.hovered?.id === node.id || state.selected?.id === node.id ? 2.4 : 1;
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = connected ? 0.9 : 0.18;
  ctx.stroke();

  if ((node.size > 13 || state.zoom > 0.82 || state.hovered?.id === node.id || state.selected?.id === node.id) && connected) {
    ctx.shadowBlur = 10;
    ctx.font = `${Math.max(10, 11 * state.zoom)}px Inter, sans-serif`;
    ctx.fillStyle = '#e6f7ff';
    ctx.globalAlpha = 0.92;
    ctx.fillText(node.label, p.x + radius + 7, p.y + 4);
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (let i = 0; i < 90; i++) {
    const x = (Math.sin(state.tick * 0.003 + i * 14.7) * 0.5 + 0.5) * state.width;
    const y = (Math.cos(state.tick * 0.0025 + i * 9.1) * 0.5 + 0.5) * state.height;
    ctx.globalAlpha = 0.08 + (i % 5) * 0.015;
    ctx.fillStyle = i % 3 ? '#3ee7ff' : '#42ff9e';
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + (i % 4) * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function render() {
  state.tick++;
  simulate();
  ctx.clearRect(0, 0, state.width, state.height);
  drawParticles();
  graph.edges.forEach(drawEdge);
  graph.nodes.forEach(drawNode);
  requestAnimationFrame(render);
}

function nearestNode(event) {
  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const world = screenToWorld(sx, sy);
  state.pointer = { x: sx, y: sy, worldX: world.x, worldY: world.y };
  let best = null;
  let bestDist = Infinity;
  graph.nodes.forEach(node => {
    if (!visibleNode(node)) return;
    const d = Math.hypot(node.x - world.x, node.y - world.y);
    if (d < bestDist && d < Math.max(18, node.size + 12) / state.zoom) {
      best = node;
      bestDist = d;
    }
  });
  return best;
}

function updateInfoCard(node) {
  if (!node) {
    infoCard.innerHTML = `<span class="eyebrow">Node telemetry</span><h2>Hover the graph</h2><p>Connected operations signals will highlight as the AI network routes work across the project.</p>`;
    return;
  }
  const connected = adjacency.get(node.id)?.size || 0;
  infoCard.innerHTML = `
    <span class="eyebrow">${node.group}</span>
    <h2>${node.label}</h2>
    <p>${node.meta.status || node.meta.branch || node.meta.path || node.meta.mode || 'Network entity'} · ${connected} connected signals</p>
    <div class="metric-row">
      <div class="metric"><b>${node.meta.load || node.meta.checks || 'Live'}</b><small>AI load</small></div>
      <div class="metric"><b>${connected}</b><small>Links</small></div>
      <div class="metric"><b>${Math.round((node.activity || 0.24) * 100)}%</b><small>Pulse</small></div>
    </div>`;
}

function addActivity() {
  const [group, text] = activityPhrases[Math.floor(Math.random() * activityPhrases.length)];
  const candidates = graph.nodes.filter(n => n.group === group || (group === 'Builds' && n.group === 'Tests'));
  const node = candidates[Math.floor(Math.random() * candidates.length)] || graph.nodes[0];
  node.activity = 1;
  state.activityCount++;
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `<strong>${group}</strong> ${text} <span style="color:${colors[group] || '#3ee7ff'}">${node.label}</span>`;
  activityLog.prepend(item);
  while (activityLog.children.length > 9) activityLog.lastChild.remove();
  document.getElementById('activityCount').textContent = String(state.activityCount);
}

function buildFilters() {
  filtersEl.innerHTML = filterGroups.map(group => `<button class="filter active" data-filter="${group}" type="button">${group}</button>`).join('');
  filtersEl.querySelectorAll('.filter').forEach(button => {
    button.addEventListener('click', () => {
      const group = button.dataset.filter;
      if (activeFilters.has(group)) activeFilters.delete(group);
      else activeFilters.add(group);
      button.classList.toggle('active', activeFilters.has(group));
    });
  });
}

function runSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    searchResults.classList.remove('active');
    searchResults.innerHTML = '';
    state.selected = null;
    return;
  }
  const matches = graph.nodes.filter(n => `${n.label} ${n.group}`.toLowerCase().includes(q)).slice(0, 9);
  searchResults.innerHTML = matches.map(n => `<button type="button" data-node="${n.id}"><strong>${n.label}</strong><br><span style="color:${colors[n.group]}">${n.group}</span></button>`).join('');
  searchResults.classList.toggle('active', matches.length > 0);
  searchResults.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const node = nodeById.get(btn.dataset.node);
      state.selected = node;
      state.panX = state.width / 2 - node.x * state.zoom;
      state.panY = state.height / 2 - node.y * state.zoom;
      node.activity = 1;
      updateInfoCard(node);
      searchResults.classList.remove('active');
    });
  });
}

canvas.addEventListener('mousemove', event => {
  if (state.dragging) {
    const dx = event.clientX - state.lastDrag.x;
    const dy = event.clientY - state.lastDrag.y;
    state.panX += dx;
    state.panY += dy;
    state.lastDrag = { x: event.clientX, y: event.clientY };
    return;
  }
  const node = nearestNode(event);
  if (node !== state.hovered) {
    state.hovered = node;
    updateInfoCard(node || state.selected);
  }
});
canvas.addEventListener('mousedown', event => { state.dragging = true; state.lastDrag = { x: event.clientX, y: event.clientY }; });
window.addEventListener('mouseup', () => { state.dragging = false; });
canvas.addEventListener('mouseleave', () => { state.hovered = null; updateInfoCard(state.selected); });
canvas.addEventListener('click', event => {
  const node = nearestNode(event);
  if (node) { state.selected = node; node.activity = 1; updateInfoCard(node); }
});
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const before = screenToWorld(sx, sy);
  const nextZoom = Math.min(2.6, Math.max(0.35, state.zoom * Math.exp(-event.deltaY * 0.0012)));
  state.zoom = nextZoom;
  state.panX = sx - before.x * state.zoom;
  state.panY = sy - before.y * state.zoom;
}, { passive: false });
searchInput.addEventListener('input', runSearch);
window.addEventListener('resize', resize);

document.getElementById('nodeCount').textContent = String(graph.nodes.length);
document.getElementById('edgeCount').textContent = String(graph.edges.length);
buildFilters();
resize();
render();
for (let i = 0; i < 5; i++) setTimeout(addActivity, i * 380);
setInterval(addActivity, 2100);
