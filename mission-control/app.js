const canvas = document.getElementById('missionCanvas');
const ctx = canvas.getContext('2d', { alpha: true });
const panel = document.getElementById('nodePanel');
const agentOrbit = document.getElementById('agentOrbit');
const stageShell = document.querySelector('.stage-shell');
const dashboard = {
  activeAgentCount: document.getElementById('activeAgentCount'),
  agentHealthSummary: document.getElementById('agentHealthSummary'),
  currentBranch: document.getElementById('currentBranch'),
  githubStatus: document.getElementById('githubStatus'),
  bugsOpen: document.getElementById('bugsOpen'),
  latestDeployment: document.getElementById('latestDeployment'),
  currentBuild: document.getElementById('currentBuild'),
  qaProgress: document.getElementById('qaProgress'),
  sprintStatus: document.getElementById('sprintStatus'),
  missionText: document.getElementById('missionText'),
  nextAction: document.getElementById('nextAction'),
};

const colors = {
  Core: '#22d3ee',
  Agent: '#67e8f9',
  System: '#38bdf8',
  Commit: '#34d399',
  Branch: '#2dd4bf',
  'Pull Request': '#fbbf24',
  Deployment: '#a78bfa',
  Test: '#4ade80',
  API: '#60a5fa',
  'API File': '#7dd3fc',
  'Test File': '#86efac',
  File: '#93c5fd',
  User: '#f472b6',
  Message: '#fb7185',
  Notification: '#f59e0b',
  Conversation: '#fda4af',
};

const lucidePaths = {
  'bot': '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  'brain-circuit': '<path d="M12 5a3 3 0 0 0-5.5-1.7A3.5 3.5 0 0 0 3 6.8c0 .7.2 1.4.6 2A4 4 0 0 0 5 16.5"/><path d="M12 5a3 3 0 0 1 5.5-1.7A3.5 3.5 0 0 1 21 6.8c0 .7-.2 1.4-.6 2a4 4 0 0 1-1.4 7.7"/><path d="M12 5v14"/><path d="M8 13H6a2 2 0 1 0 0 4h1"/><path d="M16 13h2a2 2 0 1 1 0 4h-1"/><path d="M9 9H7"/><path d="M17 9h-2"/><circle cx="8" cy="9" r="1"/><circle cx="16" cy="9" r="1"/>',
  'bug': '<path d="m8 2 1.9 1.9"/><path d="M14.1 3.9 16 2"/><path d="M9 7.5V6a3 3 0 0 1 6 0v1.5"/><rect width="10" height="12" x="7" y="8" rx="4"/><path d="M5 13h2"/><path d="M17 13h2"/><path d="M5 17h2"/><path d="M17 17h2"/><path d="M12 8v12"/>',
  'chevrons-left': '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
  'git-branch': '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  'rocket': '<path d="M4.5 16.5c-1.5 1.26-2 4-2 4s2.74-.5 4-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.9 12.9 0 0 1 22 2c0 2.72-.78 7.5-6 11a22 22 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.4a1.4 1.4 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  'terminal-square': '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2"/>',
};

function installIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const path = lucidePaths[el.dataset.icon];
    if (!path) return;
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  });
}

const state = {
  graph: { nodes: [], links: [] },
  nodes: [],
  links: [],
  nodeById: new Map(),
  adjacency: new Map(),
  width: 0,
  height: 0,
  dpr: 1,
  zoom: 0.86,
  panX: 0,
  panY: 0,
  tick: 0,
  selected: null,
  hovered: null,
  dragging: false,
  lastPointer: null,
  mode: 'demo',
  events: [],
};

const missionAgents = [
  { id: 'agent-coach-eye', label: "Coach's Eye Core", task: 'Product telemetry', health: 'Nominal', tone: 'hot' },
  { id: 'agent-ai-brain', label: 'AI Brain', task: 'Routing company context', health: 'Optimal', tone: 'hot' },
  { id: 'agent-claude', label: 'Claude Builder', task: 'Planning product changes', health: 'Nominal', tone: '' },
  { id: 'agent-codex', label: 'Codex Engineer', task: 'Implementing V2 surface', health: 'Active', tone: 'hot' },
  { id: 'agent-qa', label: 'QA Agent', task: 'Regression monitoring', health: 'Watching', tone: 'warn' },
  { id: 'agent-github', label: 'GitHub', task: 'Branch intelligence', health: 'Online', tone: '' },
  { id: 'agent-vercel', label: 'Vercel', task: 'Deployment radar', health: 'Online', tone: '' },
  { id: 'agent-deploy', label: 'Deployments', task: 'Release readiness', health: 'Stable', tone: '' },
  { id: 'agent-analytics', label: 'Analytics', task: 'Usage signals', health: 'Learning', tone: '' },
  { id: 'agent-rugby', label: 'Rugby Intelligence', task: 'Knowledge synthesis', health: 'Ready', tone: '' },
  { id: 'agent-notifications', label: 'Notifications', task: 'Push delivery watch', health: 'Watching', tone: 'warn' },
  { id: 'agent-memory', label: 'Memory', task: 'Context retention', health: 'Synced', tone: '' },
];

function demoPayload() {
  const now = new Date().toISOString();
  return {
    ok: true,
    generatedAt: now,
    mode: 'demo',
    metrics: {
      branch: 'feature/ai-mission-control-live',
      latestCommit: 'local-demo',
      latestCommitMessage: 'Mission Control offline telemetry',
      deploymentStatus: 'DEMO',
      activeUsers: 5,
      messagesToday: 34,
      notificationsToday: 7,
    },
    graph: {
      nodes: [
        { id: 'project', label: 'Coach’s Eye', type: 'Core', meta: { status: 'Demo mode' } },
        { id: 'api', label: 'API Surface', type: 'API', meta: { endpoints: 14 } },
        { id: 'tests', label: 'Test Matrix', type: 'Test', meta: { cases: 92 } },
        { id: 'deployment', label: 'Preview Radar', type: 'Deployment', meta: { status: 'Simulated' } },
        { id: 'users', label: 'Users', type: 'User', meta: { activeUsers: 5 } },
        { id: 'messages', label: 'Messaging', type: 'Message', meta: { messagesToday: 34 } },
        { id: 'notifications', label: 'Notifications', type: 'Notification', meta: { notificationsToday: 7 } },
        { id: 'file:index', label: 'index.html', type: 'File', meta: { path: 'index.html' } },
        { id: 'file:chat', label: 'chat-state.js', type: 'File', meta: { path: 'src/chat-state.js' } },
        { id: 'file:identity', label: 'identity.js', type: 'API File', meta: { path: 'api/identity.js' } },
      ],
      links: [
        { source: 'project', target: 'api', type: 'serves' },
        { source: 'project', target: 'tests', type: 'validated by' },
        { source: 'project', target: 'deployment', type: 'deployed through' },
        { source: 'api', target: 'users', type: 'identity' },
        { source: 'api', target: 'messages', type: 'chat' },
        { source: 'messages', target: 'notifications', type: 'triggers' },
        { source: 'file:index', target: 'project', type: 'surface' },
        { source: 'file:chat', target: 'messages', type: 'state' },
        { source: 'file:identity', target: 'users', type: 'auth' },
      ],
    },
  };
}

function withMissionAgents(graph = { nodes: [], links: [] }) {
  const nodes = [...(graph.nodes || [])];
  const links = [...(graph.links || [])];
  const ids = new Set(nodes.map(node => node.id));
  const coreId = ids.has('project') ? 'project' : ids.has('repo-main') ? 'repo-main' : nodes.find(node => node.type === 'Core')?.id;

  missionAgents.forEach((agent, index) => {
    if (!ids.has(agent.id)) {
      nodes.push({
        id: agent.id,
        label: agent.label,
        type: agent.id === 'agent-ai-brain' ? 'Core' : 'Agent',
        meta: {
          status: agent.health,
          task: agent.task,
          activity: index % 3 === 0 ? 'high' : 'steady',
        },
      });
    }
  });

  const brainId = ids.has('agent-ai-brain') ? 'agent-ai-brain' : 'agent-ai-brain';
  if (coreId) links.push({ source: coreId, target: brainId, type: 'coordinates' });
  missionAgents
    .filter(agent => agent.id !== brainId)
    .forEach(agent => links.push({ source: agent.id, target: brainId, type: 'neural signal' }));

  links.push(
    { source: 'agent-claude', target: 'agent-ai-brain', type: 'plan' },
    { source: 'agent-codex', target: 'agent-ai-brain', type: 'build' },
    { source: 'agent-github', target: 'agent-deploy', type: 'release' },
    { source: 'agent-qa', target: 'agent-deploy', type: 'gate' },
    { source: 'agent-vercel', target: 'agent-deploy', type: 'ship' },
    { source: 'agent-rugby', target: 'agent-memory', type: 'knowledge' },
    { source: 'agent-notifications', target: 'agent-analytics', type: 'feedback' },
  );

  return { ...graph, nodes, links };
}

async function loadTelemetry() {
  try {
    const res = await fetch('/api/mission-control', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return demoPayload();
  }
}

function hashValue(value = '') {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function assignLayout(graph) {
  const nodes = graph.nodes.map((node, index) => {
    const h = hashValue(node.id);
    const agentIndex = missionAgents.findIndex(agent => agent.id === node.id);
    const isAgent = agentIndex >= 0;
    const isBrain = node.id === 'agent-ai-brain';
    const ring = node.type === 'Core' || isBrain ? 0 : isAgent ? 360 : 220 + (h % 440);
    const angle = isAgent
      ? (agentIndex / missionAgents.length) * Math.PI * 2 - Math.PI / 2
      : (index / Math.max(1, graph.nodes.length)) * Math.PI * 2 + (h % 90) / 90;
    const squash = isAgent ? 0.72 : 0.62;
    return {
      ...node,
      x: node.type === 'Core' || isBrain ? 0 : Math.cos(angle) * ring,
      y: node.type === 'Core' || isBrain ? 0 : Math.sin(angle) * ring * squash,
      vx: 0,
      vy: 0,
      homeX: node.type === 'Core' || isBrain ? 0 : Math.cos(angle) * ring,
      homeY: node.type === 'Core' || isBrain ? 0 : Math.sin(angle) * ring * squash,
      size: isBrain ? 34 : node.type === 'Core' ? 25 : isAgent ? 15 : node.type === 'System' ? 16 : node.type === 'Conversation' ? 8 : 10,
      pulse: (h % 100) / 100 * Math.PI * 2,
      activity: Math.random(),
    };
  });
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const links = graph.links.filter(link => nodeById.has(link.source) && nodeById.has(link.target)).map(link => ({
    ...link,
    phase: Math.random() * Math.PI * 2,
    strength: 0.8 + (hashValue(`${link.source}:${link.target}`) % 70) / 100,
  }));
  const adjacency = new Map(nodes.map(node => [node.id, new Set()]));
  links.forEach(link => {
    adjacency.get(link.source)?.add(link.target);
    adjacency.get(link.target)?.add(link.source);
  });
  state.nodes = nodes;
  state.links = links;
  state.nodeById = nodeById;
  state.adjacency = adjacency;
}

function updateOverlays(payload) {
  const metrics = payload.metrics || {};
  state.mode = payload.mode || 'demo';
  document.getElementById('deploymentStatus').textContent = metrics.deploymentStatus || 'UNKNOWN';
  document.getElementById('branchStatus').textContent = `branch: ${metrics.branch || 'unknown'}`;
  document.getElementById('commitStatus').textContent = `commit: ${metrics.latestCommit || 'unknown'} · ${metrics.latestCommitMessage || ''}`;
  document.getElementById('activeUsers').textContent = metrics.activeUsers ?? 0;
  document.getElementById('messagesToday').textContent = metrics.messagesToday ?? 0;
  document.getElementById('notificationsToday').textContent = metrics.notificationsToday ?? 0;
  document.getElementById('modePill').textContent = state.mode === 'live' ? 'LIVE MODE' : 'DEMO FALLBACK';

  const graph = payload.graph || { nodes: [], links: [] };
  const tests = graph.nodes.filter(node => node.type === 'Test' || node.type === 'Test File');
  const apiNodes = graph.nodes.filter(node => node.type === 'API' || node.type === 'API File');
  const deploymentNodes = graph.nodes.filter(node => node.type === 'Deployment');
  const warningSignals = Math.max(0, (metrics.notificationsToday ?? 0) - 3);
  const qaScore = Math.min(99, Math.max(82, 88 + tests.length + (state.mode === 'live' ? 3 : 0)));

  dashboard.activeAgentCount.textContent = String(missionAgents.length);
  dashboard.agentHealthSummary.textContent = warningSignals ? `${warningSignals} signals need review` : 'All critical systems online';
  dashboard.currentBranch.textContent = metrics.branch || 'unknown';
  dashboard.githubStatus.textContent = `${payload.mode === 'live' ? 'Live' : 'Demo'} graph · ${graph.links.length} links`;
  dashboard.bugsOpen.textContent = String(warningSignals);
  dashboard.latestDeployment.textContent = metrics.deploymentStatus || (deploymentNodes.length ? 'READY' : 'DEMO');
  dashboard.currentBuild.textContent = metrics.latestCommit || 'local-demo';
  dashboard.qaProgress.textContent = `${qaScore}%`;
  dashboard.sprintStatus.textContent = `${tests.length || 1} QA surfaces · ${apiNodes.length || 1} API systems`;
  dashboard.missionText.textContent = state.mode === 'live' ? 'Run the AI company from one neural command surface' : 'Demo the company operating system safely';
  dashboard.nextAction.textContent = warningSignals
    ? 'Review notifications and QA signals before the next deploy.'
    : 'Ship the Mission Control V2 visual foundation, then connect richer agent telemetry.';

  const latest = [
    `${new Date(payload.generatedAt || Date.now()).toLocaleTimeString()} telemetry sync`,
    `${graph.nodes.length} nodes`,
    `${graph.links.length} links`,
    `${metrics.branch || 'unknown branch'}`,
    `${metrics.latestCommit || 'unknown commit'}`,
    `${metrics.activeUsers || 0} users`,
    `${metrics.messagesToday || 0} messages today`,
  ];
  state.events = latest;
  document.getElementById('eventTicker').textContent = latest.join('  //  ');
}

function installGraph(payload) {
  state.graph = withMissionAgents(payload.graph || demoPayload().graph);
  assignLayout(state.graph);
  updateOverlays({ ...payload, graph: state.graph });
  renderAgentOrbit();
}

function renderAgentOrbit() {
  if (!agentOrbit) return;
  const width = agentOrbit.clientWidth || 900;
  const height = agentOrbit.clientHeight || 620;
  const rx = Math.min(width * 0.38, 380);
  const ry = Math.min(height * 0.32, 240);
  agentOrbit.innerHTML = missionAgents
    .filter(agent => agent.id !== 'agent-ai-brain')
    .map((agent, index, agents) => {
      const angle = (index / agents.length) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + (Math.cos(angle) * rx / width) * 100;
      const y = 50 + (Math.sin(angle) * ry / height) * 100;
      const delay = (index * 0.19).toFixed(2);
      return `
        <div class="agent-node ${agent.tone}" style="left:${x}%;top:${y}%;animation-delay:${delay}s">
          <strong>${escapeHtml(agent.label)}</strong>
          <span>${escapeHtml(agent.health)}</span>
          <small>${escapeHtml(agent.task)}</small>
        </div>`;
    })
    .join('');
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const stageRect = stageShell?.getBoundingClientRect();
  state.width = rect.width;
  state.height = rect.height;
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * state.dpr);
  canvas.height = Math.floor(rect.height * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  if (!state.panX && !state.panY) {
    state.panX = stageRect ? stageRect.left + stageRect.width / 2 : rect.width / 2;
    state.panY = stageRect ? stageRect.top + stageRect.height / 2 - 10 : rect.height / 2;
  }
  renderAgentOrbit();
}

function worldToScreen(x, y) {
  return { x: x * state.zoom + state.panX, y: y * state.zoom + state.panY };
}

function screenToWorld(x, y) {
  return { x: (x - state.panX) / state.zoom, y: (y - state.panY) / state.zoom };
}

function connectedToFocus(node) {
  const focus = state.selected || state.hovered;
  if (!focus) return true;
  return node.id === focus.id || state.adjacency.get(focus.id)?.has(node.id);
}

function simulate() {
  const focus = state.selected;
  for (const link of state.links) {
    const a = state.nodeById.get(link.source);
    const b = state.nodeById.get(link.target);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const target = 120;
    const force = (d - target) * 0.0009 * link.strength;
    a.vx += dx / d * force;
    a.vy += dy / d * force;
    b.vx -= dx / d * force;
    b.vy -= dy / d * force;
  }
  state.nodes.forEach((node, index) => {
    const homePull = node.type === 'Core' ? 0.012 : 0.004;
    node.vx += (node.homeX - node.x) * homePull + Math.cos(state.tick * 0.006 + index) * 0.025;
    node.vy += (node.homeY - node.y) * homePull + Math.sin(state.tick * 0.007 + index) * 0.025;
    if (focus && state.adjacency.get(focus.id)?.has(node.id)) node.activity = Math.max(node.activity, 0.55);
    node.activity = Math.max(0.02, node.activity * 0.988);
    node.vx *= 0.86;
    node.vy *= 0.86;
    node.x += node.vx;
    node.y += node.vy;
  });
}

function drawBackground() {
  const grid = 56 * state.zoom;
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  const ox = state.panX % grid;
  const oy = state.panY % grid;
  for (let x = ox; x < state.width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.height);
    ctx.stroke();
  }
  for (let y = oy; y < state.height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (let i = 0; i < 96; i++) {
    const x = (Math.sin(state.tick * 0.0022 + i * 8.71) * 0.5 + 0.5) * state.width;
    const y = (Math.cos(state.tick * 0.0018 + i * 13.37) * 0.5 + 0.5) * state.height;
    ctx.globalAlpha = 0.045 + (i % 4) * 0.014;
    ctx.fillStyle = i % 3 ? '#67e8f9' : '#c4b5fd';
    ctx.beginPath();
    ctx.arc(x, y, 0.65 + (i % 3) * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBrainCore() {
  const center = worldToScreen(0, 0);
  const base = Math.min(state.width, state.height) * 0.16 * state.zoom;
  const radius = Math.max(96, Math.min(190, base));
  const pulse = (Math.sin(state.tick * 0.035) + 1) / 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const aura = ctx.createRadialGradient(center.x, center.y, 4, center.x, center.y, radius * 2.45);
  aura.addColorStop(0, `rgba(255,255,255,${0.2 + pulse * 0.08})`);
  aura.addColorStop(0.24, 'rgba(103,232,249,0.2)');
  aura.addColorStop(0.52, 'rgba(196,181,253,0.09)');
  aura.addColorStop(1, 'rgba(103,232,249,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius * 2.45, 0, Math.PI * 2);
  ctx.fill();

  for (let ring = 0; ring < 4; ring++) {
    const ringRadius = radius * (0.72 + ring * 0.23 + pulse * 0.025);
    ctx.globalAlpha = 0.24 - ring * 0.035;
    ctx.strokeStyle = ring % 2 ? '#c4b5fd' : '#67e8f9';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([12 + ring * 4, 10 + ring * 2]);
    ctx.lineDashOffset = -state.tick * (0.22 + ring * 0.08);
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, ringRadius * (1.18 - ring * 0.04), ringRadius * (0.52 + ring * 0.07), state.tick * 0.003 + ring * 0.42, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const neurons = 34;
  for (let i = 0; i < neurons; i++) {
    const a = i * Math.PI * 2 / neurons + Math.sin(state.tick * 0.006 + i) * 0.18;
    const r = radius * (0.24 + ((i * 17) % 64) / 100);
    const x = center.x + Math.cos(a) * r * 1.12;
    const y = center.y + Math.sin(a) * r * 0.72;
    const nextA = a + 0.65 + (i % 4) * 0.13;
    const nextR = radius * (0.24 + (((i + 5) * 17) % 64) / 100);
    const nx = center.x + Math.cos(nextA) * nextR * 1.12;
    const ny = center.y + Math.sin(nextA) * nextR * 0.72;
    const active = (Math.sin(state.tick * 0.05 + i * 0.9) + 1) / 2;

    ctx.globalAlpha = 0.08 + active * 0.28;
    ctx.strokeStyle = i % 3 ? '#67e8f9' : '#c4b5fd';
    ctx.lineWidth = 0.7 + active * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(center.x + Math.cos(a + 0.4) * r * 0.42, center.y + Math.sin(a + 0.4) * r * 0.26, nx, ny);
    ctx.stroke();

    ctx.globalAlpha = 0.45 + active * 0.44;
    ctx.fillStyle = i % 4 ? '#e8fbff' : '#86efac';
    ctx.shadowBlur = 14 + active * 16;
    ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + active * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.88;
  ctx.shadowBlur = 40;
  ctx.shadowColor = '#67e8f9';
  const core = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius * 0.42);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.28, '#a7f3ff');
  core.addColorStop(0.66, 'rgba(103,232,249,0.42)');
  core.addColorStop(1, 'rgba(103,232,249,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius * (0.38 + pulse * 0.04), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLink(link) {
  const a = state.nodeById.get(link.source);
  const b = state.nodeById.get(link.target);
  if (!a || !b) return;
  const pa = worldToScreen(a.x, a.y);
  const pb = worldToScreen(b.x, b.y);
  const focus = state.selected || state.hovered;
  const connected = !focus || a.id === focus.id || b.id === focus.id;
  const color = colors[b.type] || colors[a.type] || '#22d3ee';
  const pulse = (Math.sin(state.tick * 0.055 + link.phase) + 1) / 2;
  const alpha = connected ? 0.26 + pulse * 0.2 : 0.035;
  const cx = (pa.x + pb.x) / 2 + Math.sin(link.phase) * 24 * state.zoom;
  const cy = (pa.y + pb.y) / 2 + Math.cos(link.phase) * 24 * state.zoom;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = connected ? 1.2 : 0.6;
  ctx.shadowBlur = connected ? 16 : 0;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.quadraticCurveTo(cx, cy, pb.x, pb.y);
  ctx.stroke();

  if (connected) {
    const t = (state.tick * 0.006 * link.strength + link.phase) % 1;
    const x = (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * cx + t * t * pb.x;
    const y = (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * cy + t * t * pb.y;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 2.2 + pulse * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawNode(node) {
  if (node.type === 'Core') return;
  const p = worldToScreen(node.x, node.y);
  const connected = connectedToFocus(node);
  const color = colors[node.type] || '#22d3ee';
  const selected = state.selected?.id === node.id;
  const hovered = state.hovered?.id === node.id;
  const pulse = (Math.sin(state.tick * 0.05 + node.pulse) + 1) / 2;
  const radius = Math.max(3.8, (node.size + node.activity * 5 + pulse * 1.2) * state.zoom);

  ctx.save();
  ctx.globalAlpha = connected ? 1 : 0.12;
  ctx.shadowColor = color;
  ctx.shadowBlur = connected ? 24 + node.activity * 36 : 0;
  const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, radius * 4.2);
  glow.addColorStop(0, `${color}aa`);
  glow.addColorStop(0.34, `${color}28`);
  glow.addColorStop(1, `${color}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius * 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = selected || hovered ? 2.5 : 1;
  ctx.strokeStyle = selected ? '#f8fafc' : 'rgba(240,249,255,0.72)';
  ctx.stroke();

  if ((selected || hovered || node.type === 'Core' || state.zoom > 0.88) && connected) {
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#e0f2fe';
    ctx.font = `${Math.max(10, 11 * state.zoom)}px Inter, sans-serif`;
    ctx.fillText(node.label, p.x + radius + 8, p.y + 4);
  }
  ctx.restore();
}

function render() {
  state.tick++;
  simulate();
  ctx.clearRect(0, 0, state.width, state.height);
  drawBackground();
  drawParticles();
  drawBrainCore();
  state.links.forEach(drawLink);
  state.nodes.forEach(drawNode);
  requestAnimationFrame(render);
}

function nearestNode(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const world = screenToWorld(sx, sy);
  let best = null;
  let bestD = Infinity;
  for (const node of state.nodes) {
    const d = Math.hypot(node.x - world.x, node.y - world.y);
    if (d < bestD && d < Math.max(18, node.size + 12) / state.zoom) {
      best = node;
      bestD = d;
    }
  }
  return best;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function showPanel(node) {
  if (!node) {
    panel.classList.add('hidden');
    return;
  }
  const meta = node.meta || {};
  const rows = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 8)
    .map(([key, value]) => `<div><span>${escapeHtml(key)}</span><strong>${escapeHtml(Array.isArray(value) ? value.join(', ') : String(value))}</strong></div>`)
    .join('');
  const path = meta.path || meta.source || '';
  panel.innerHTML = `
    <span class="kicker">${escapeHtml(node.type)}</span>
    <h2>${escapeHtml(node.label)}</h2>
    <p>${escapeHtml(meta.status || meta.subject || meta.route || meta.path || 'Connected project node')}</p>
    <div class="meta-grid">${rows || '<div><span>id</span><strong>' + escapeHtml(node.id) + '</strong></div>'}</div>
    ${path ? `<button class="source-button" type="button" data-source="${escapeHtml(path)}">Open Source Location</button>` : ''}
  `;
  panel.querySelector('[data-source]')?.addEventListener('click', event => {
    const source = event.currentTarget.dataset.source;
    window.open(`/${source}`, '_blank', 'noopener,noreferrer');
  });
  panel.classList.remove('hidden');
}

canvas.addEventListener('pointerdown', event => {
  state.dragging = true;
  state.lastPointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  const near = nearestNode(event.clientX, event.clientY);
  state.hovered = near;
  if (state.dragging && state.lastPointer) {
    state.panX += event.clientX - state.lastPointer.x;
    state.panY += event.clientY - state.lastPointer.y;
    state.lastPointer = { x: event.clientX, y: event.clientY };
  }
});

canvas.addEventListener('pointerup', event => {
  const moved = state.lastPointer && Math.hypot(event.clientX - state.lastPointer.x, event.clientY - state.lastPointer.y) > 4;
  state.dragging = false;
  state.lastPointer = null;
  if (!moved) {
    state.selected = nearestNode(event.clientX, event.clientY);
    showPanel(state.selected);
  }
});

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const before = screenToWorld(event.clientX, event.clientY);
  const nextZoom = Math.min(2.2, Math.max(0.32, state.zoom * (event.deltaY < 0 ? 1.08 : 0.92)));
  state.zoom = nextZoom;
  const after = screenToWorld(event.clientX, event.clientY);
  state.panX += (after.x - before.x) * state.zoom;
  state.panY += (after.y - before.y) * state.zoom;
}, { passive: false });

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    state.selected = null;
    showPanel(null);
    closeMarketPanel();
  }
});

window.addEventListener('resize', resize);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/mission-control/sw.js').catch(() => {});
}

// ─── Market Intelligence panel ────────────────────────────────────────────────

const marketPanel  = document.getElementById('marketPanel');
const marketToggle = document.getElementById('miToggle');
const miDot        = document.getElementById('miDot');

let miData = null;
let miOpen = false;

function scoreClass(score) {
  if (score >= 8) return 'high';
  if (score >= 6) return 'mid';
  return 'low';
}

function renderMarketPanel(data) {
  const content = document.getElementById('marketPanelContent');
  if (!content) return;

  if (!data || data.clubsReviewed === 0 && data.competitorsReviewed === 0) {
    content.innerHTML = `
      <p class="mi-empty">
        No market data yet.<br>
        Add club or competitor files to<br>
        <code>qa/market-input/clubs/</code><br>
        then run: <code>node qa/market-intel-agent.js</code>
      </p>`;
    return;
  }

  const topCountries = (data.topCountries ?? []).slice(0, 5);
  const maxCount = Math.max(1, ...topCountries.map(c => c.count));

  const countryBars = topCountries.map(({ country, count }) => `
    <div class="mi-bar-row">
      <span class="mi-bar-label">${escapeHtml(country)}</span>
      <div class="mi-bar-track"><div class="mi-bar-fill" style="width:${Math.round(count / maxCount * 100)}%"></div></div>
      <span class="mi-bar-count">${count}</span>
    </div>`).join('') || '<p style="color:rgba(251,191,36,.4);font-size:12px">No country data</p>';

  const leads = (data.topLeads ?? []).slice(0, 5).map(lead => `
    <div class="mi-lead-row">
      <div>
        <div class="mi-lead-name">${escapeHtml(lead.name)}</div>
        <div class="mi-lead-country">${escapeHtml(lead.country)} · ${escapeHtml(lead.contact)}</div>
      </div>
      <span class="mi-score ${scoreClass(lead.fitScore)}">${lead.fitScore}</span>
      <span style="font-size:10px;color:rgba(224,242,254,.5)">${escapeHtml(lead.badge ?? '')}</span>
    </div>`).join('') || '<p style="color:rgba(251,191,36,.4);font-size:12px">No leads yet</p>';

  const competitors = (data.competitorSummary ?? []).slice(0, 6).map(c => `
    <div class="mi-comp-row">
      <div>
        <div class="mi-comp-name">${escapeHtml(c.name)}</div>
        <div class="mi-comp-meta">${c.rugbySpecific ? 'Rugby-specific' : 'Generic sports'}${c.freeTier ? ' · Free tier' : ''}</div>
      </div>
      <span class="mi-comp-price">${escapeHtml(c.pricing || 'unknown')}</span>
    </div>`).join('') || '<p style="color:rgba(251,191,36,.4);font-size:12px">No competitor data</p>';

  const ts = data.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'unknown';

  const arrFormatted = data.totalExpectedARR
    ? `€${Number(data.totalExpectedARR).toLocaleString()}`
    : '€0';

  const topContacts = (data.topContacts ?? []).slice(0, 5).map(c => `
    <div class="mi-contact-row">
      <div>
        <div class="mi-lead-name">${escapeHtml(c.name)}</div>
        <div class="mi-lead-country">${escapeHtml(c.country)} · <a class="mi-email-link" href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>
      </div>
      <span class="mi-score ${scoreClass(c.fitScore)}">${c.fitScore}</span>
    </div>`).join('') || '<p style="color:rgba(251,191,36,.4);font-size:12px">No contacts with email found yet</p>';

  content.innerHTML = `
    <div class="mi-stat-row">
      <div class="mi-stat"><strong>${data.clubsReviewed ?? 0}</strong><span>Clubs</span></div>
      <div class="mi-stat"><strong>${data.hotLeads ?? data.strongLeads ?? 0}</strong><span>Hot Leads</span></div>
      <div class="mi-stat mi-stat-arr"><strong>${arrFormatted}</strong><span>Pipeline ARR</span></div>
    </div>

    <div class="mi-section">
      <div class="mi-section-title">Top Clubs to Contact</div>
      ${topContacts}
    </div>

    <div class="mi-section">
      <div class="mi-section-title">Clubs by Country</div>
      ${countryBars}
    </div>

    <div class="mi-section">
      <div class="mi-section-title">Top Scored Leads</div>
      ${leads}
    </div>

    <div class="mi-section">
      <div class="mi-section-title">Competitor Pricing</div>
      ${competitors}
    </div>

    ${data.nextAction ? `
    <div class="mi-action">
      <div class="mi-action-label">Recommended Next Action</div>
      ${escapeHtml(data.nextAction)}
    </div>` : ''}

    <div class="mi-ts">Last run: ${escapeHtml(ts)} · Mode: ${escapeHtml(data.analysisMode ?? 'unknown')}</div>
  `;
}

async function loadMarketData() {
  try {
    const res = await fetch('/api/mission-control?action=market-intel', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    miData = json.marketIntel ?? null;
  } catch {
    miData = null;
  }
  renderMarketPanel(miData);

  // Update dot state
  const hasData = miData && (miData.clubsReviewed > 0 || miData.competitorsReviewed > 0);
  miDot.className = `dot${hasData ? '' : ' empty'}`;
}

function openMarketPanel() {
  miOpen = true;
  marketPanel.classList.remove('hidden');
  marketToggle.classList.add('active');
  marketToggle.setAttribute('aria-expanded', 'true');
  // Close node panel to avoid overlap
  panel.classList.add('hidden');
  if (!miData) loadMarketData();
}

function closeMarketPanel() {
  miOpen = false;
  marketPanel.classList.add('hidden');
  marketToggle.classList.remove('active');
  marketToggle.setAttribute('aria-expanded', 'false');
}

marketToggle.addEventListener('click', () => {
  if (miOpen) closeMarketPanel();
  else openMarketPanel();
});

// Refresh market data every 5 minutes while panel is open
setInterval(() => {
  if (miOpen) loadMarketData();
}, 5 * 60 * 1000);

// Initial dot state check (non-blocking)
loadMarketData();

// ─── Discovery Card ───────────────────────────────────────────────────────────

const discoveryCard = document.getElementById('discoveryCard');

function renderDiscoveryCard(data) {
  if (!data || !data.todayDiscovered) {
    discoveryCard.classList.add('hidden');
    return;
  }

  const dupPct = data.duplicateRate != null ? `${Math.round(data.duplicateRate * 100)}%` : '—';
  const healthIcon = data.health === 'green' ? 'Healthy' : data.health === 'yellow' ? 'Watch' : 'Idle';
  const newCountries = (data.newCountries || []).slice(0, 4);

  document.getElementById('discToday').textContent = data.todayDiscovered ?? 0;
  document.getElementById('discReady').textContent = data.readyForScoring ?? 0;
  document.getElementById('discDupRate').textContent = dupPct;
  document.getElementById('discProviders').textContent = (data.providers || []).join(', ');
  document.getElementById('discHealth').textContent = healthIcon;
  document.getElementById('discCountries').textContent = newCountries.length
    ? `New: ${newCountries.join(', ')}`
    : '';

  discoveryCard.classList.remove('hidden');
}

async function loadDiscoveryData() {
  try {
    const res = await fetch('/api/mission-control?action=discovery', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    renderDiscoveryCard(json.discovery ?? null);
  } catch {
    discoveryCard.classList.add('hidden');
  }
}

loadDiscoveryData();

// ─── Rugby Intelligence Panel ─────────────────────────────────────────────────

const rugbyPanel  = document.getElementById('rugbyPanel');
const rugbyToggle = document.getElementById('riToggle');
const riDot       = document.getElementById('riDot');

let riData = null;
let riAssistantData = null;
let riOpen = false;

function renderAssistantSection(a) {
  if (!a || !a.totalEvents) return '';
  const searches = (a.recentSearches ?? []).slice(0, 5).map(s =>
    `<div class="ri-search-row"><span class="ri-search-query">${escapeHtml(s.query)}</span>${s.ageGroup ? `<span class="ri-cat">${escapeHtml(s.ageGroup)}</span>` : ''}</div>`
  ).join('') || '<div style="color:rgba(100,220,140,.4);font-size:12px">No recent searches</div>';

  const topics = (a.popularTopics ?? []).slice(0, 5).map(t =>
    `<div class="ri-topic-row"><span class="ri-topic-name">${escapeHtml(t.query)}</span><span class="ri-topic-count">${t.count}×</span></div>`
  ).join('') || '<div style="color:rgba(100,220,140,.4);font-size:12px">No data yet</div>';

  return `
    <div class="mi-divider"></div>

    <span class="kicker" style="color:#4ade80">Coaching Assistant</span>

    <div class="mi-stat-row" style="margin-top:8px">
      <div class="mi-stat"><strong>${a.searchCount ?? 0}</strong><span>Queries</span></div>
      <div class="mi-stat"><strong>${a.sessionCount ?? 0}</strong><span>Sessions</span></div>
      <div class="mi-stat"><strong>${a.lawQueryCount ?? 0}</strong><span>Law Qs</span></div>
    </div>

    <div class="mi-section">
      <div class="mi-section-title">Recent Searches</div>
      ${searches}
    </div>

    <div class="mi-section">
      <div class="mi-section-title">Popular Topics</div>
      ${topics}
    </div>`;
}

function renderRugbyPanel(intelData, assistantData) {
  const content = document.getElementById('rugbyPanelContent');
  if (!content) return;

  if (!intelData || !intelData.totalItems) {
    content.innerHTML = `
      <p class="mi-empty">
        No rugby knowledge yet.<br>
        Add content to <code>qa/rugby-input/</code><br>
        then run: <code>npm run rugby:intel</code>
      </p>
      ${renderAssistantSection(assistantData)}`;
    return;
  }

  const data = intelData;

  const safetyBadge = data.safetyAlerts > 0
    ? `<span class="ri-badge ri-badge-alert">${data.safetyAlerts} safety alert${data.safetyAlerts > 1 ? 's' : ''}</span>`
    : '';
  const lawBadge = data.recentLawUpdates?.length
    ? `<span class="ri-badge ri-badge-law">${data.lawUpdates} law update${data.lawUpdates > 1 ? 's' : ''}</span>`
    : '';

  const topIdeas = (data.topCoachingIdeas ?? []).slice(0, 4).map(i => `
    <div class="ri-idea-row">
      <div class="ri-idea-title">${escapeHtml(i.title)}</div>
      <div class="ri-idea-takeaway">${escapeHtml(i.takeaway || '')}</div>
      <div class="ri-idea-cats">${(i.categories || []).slice(0, 3).map(c => `<span class="ri-cat">${escapeHtml(c)}</span>`).join('')}</div>
    </div>`).join('') || '<p style="color:rgba(100,220,140,.4);font-size:12px">No coaching ideas yet</p>';

  const lawUpdates = (data.recentLawUpdates ?? []).slice(0, 3).map(i => `
    <div class="ri-law-row">
      <div class="ri-law-title">${escapeHtml(i.title)}</div>
      <div class="ri-law-meta">${escapeHtml(i.summary?.slice(0, 100) || '')}…</div>
    </div>`).join('') || '<p style="color:rgba(100,220,140,.4);font-size:12px">No law updates</p>';

  const safetyRows = (data.recentSafetyAlerts ?? []).slice(0, 2).map(i => `
    <div class="ri-safety-row">
      <div class="ri-safety-title">${escapeHtml(i.title)}</div>
      <div class="ri-safety-action">${escapeHtml(i.takeaway || '')}</div>
    </div>`).join('') || '';

  const catBars = (data.topCategories ?? []).filter(c => c.count > 0).slice(0, 5).map(c => {
    const maxCount = data.topCategories[0]?.count || 1;
    return `<div class="mi-bar-row">
      <span class="mi-bar-label">${escapeHtml(c.category)}</span>
      <div class="mi-bar-track"><div class="mi-bar-fill ri-bar-fill" style="width:${Math.round(c.count/maxCount*100)}%"></div></div>
      <span class="mi-bar-count">${c.count}</span>
    </div>`;
  }).join('');

  const ts = data.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'unknown';

  content.innerHTML = `
    <div class="ri-badges">${safetyBadge}${lawBadge}</div>

    <div class="mi-stat-row">
      <div class="mi-stat"><strong>${data.totalItems ?? 0}</strong><span>Items</span></div>
      <div class="mi-stat"><strong>${data.itemsThisWeek ?? 0}</strong><span>This Week</span></div>
      <div class="mi-stat"><strong>${data.drills ?? 0}</strong><span>Drills</span></div>
    </div>

    ${safetyRows ? `<div class="ri-safety-section">${safetyRows}</div>` : ''}

    <div class="mi-section">
      <div class="mi-section-title">Top Coaching Ideas</div>
      ${topIdeas}
    </div>

    <div class="mi-section">
      <div class="mi-section-title">Knowledge by Category</div>
      ${catBars || '<p style="color:rgba(100,220,140,.4);font-size:12px">Add content to populate</p>'}
    </div>

    <div class="mi-section">
      <div class="mi-section-title">Recent Law Updates</div>
      ${lawUpdates}
    </div>

    ${data.recommendedFocus ? `
    <div class="mi-action">
      <div class="mi-action-label">Recommended Training Focus</div>
      ${escapeHtml(data.recommendedFocus)}
    </div>` : ''}

    <div class="mi-ts">Last run: ${escapeHtml(ts)} · ${escapeHtml(data.analysisMode ?? 'heuristic')}</div>

    ${renderAssistantSection(assistantData)}
  `;
}

async function loadRugbyIntelData() {
  try {
    const res = await fetch('/api/mission-control?action=rugby-assistant', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    riData = json.rugbyIntel ?? null;
    riAssistantData = json.assistantData ?? null;
  } catch {
    riData = null;
    riAssistantData = null;
  }
  renderRugbyPanel(riData, riAssistantData);

  const hasData = (riData && riData.totalItems > 0) || (riAssistantData && riAssistantData.totalEvents > 0);
  riDot.className = `dot${hasData ? ' ri-dot' : ' empty'}`;
}

function openRugbyPanel() {
  riOpen = true;
  rugbyPanel.classList.remove('hidden');
  rugbyToggle.classList.add('active');
  rugbyToggle.setAttribute('aria-expanded', 'true');
  panel.classList.add('hidden');
  if (!riData) loadRugbyIntelData();
}

function closeRugbyPanel() {
  riOpen = false;
  rugbyPanel.classList.add('hidden');
  rugbyToggle.classList.remove('active');
  rugbyToggle.setAttribute('aria-expanded', 'false');
}

rugbyToggle.addEventListener('click', () => {
  if (riOpen) closeRugbyPanel();
  else openRugbyPanel();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && riOpen) closeRugbyPanel();
});

setInterval(() => { if (riOpen) loadRugbyIntelData(); }, 5 * 60 * 1000);
loadRugbyIntelData();

// ─── Lead Personalisation Panel ──────────────────────────────────────────────

const lpPanel  = document.getElementById('lpPanel');
const lpToggle = document.getElementById('lpToggle');
const lpDot    = document.getElementById('lpDot');

let lpData = null;
let lpOpen = false;

function lpScoreClass(s) {
  if (s >= 9)   return 'lp-score-hot';
  if (s >= 8)   return 'lp-score-warm';
  return 'lp-score-cool';
}

function renderLpPanel(data) {
  const content = document.getElementById('lpPanelContent');
  if (!content) return;

  if (!data || !data.totalLeads) {
    content.innerHTML = `
      <p class="mi-empty">
        No personalised leads yet.<br>
        Run: <code>npm run lead:personalise</code>
      </p>`;
    return;
  }

  const demoNote = data.isDemo
    ? `<div class="lp-demo-note">Demo mode — import real clubs to replace synthetic leads</div>`
    : '';

  const arrFormatted = data.totalExpectedARR
    ? `€${Number(data.totalExpectedARR).toLocaleString()}`
    : '€0';

  const statusRows = `
    <div class="mi-stat-row">
      <div class="mi-stat"><strong>${data.totalLeads}</strong><span>Leads</span></div>
      <div class="mi-stat mi-stat-arr"><strong>${arrFormatted}</strong><span>Est. ARR</span></div>
      <div class="mi-stat"><strong>${data.draftStatusBreakdown?.draft ?? 0}</strong><span>Drafts</span></div>
    </div>`;

  const topLeads = (data.topLeads ?? []).map(l => `
    <div class="lp-lead-row">
      <div class="lp-lead-left">
        <div class="lp-lead-name">${escapeHtml(l.clubName)}</div>
        <div class="lp-lead-meta">${escapeHtml(l.country)} · ${escapeHtml(l.sessionHook || '')}</div>
        <div class="lp-lead-action">${escapeHtml(l.nextAction || '')}</div>
      </div>
      <div class="lp-lead-right">
        <span class="lp-score ${lpScoreClass(l.fitScore)}">${l.fitScore.toFixed(1)}</span>
        <span class="lp-arr">€${l.expectedARR}</span>
      </div>
    </div>`).join('');

  const countryRows = Object.entries(data.byCountry || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([c, n]) => `<span class="lp-country-tag">${escapeHtml(c)} (${n})</span>`)
    .join('');

  const ts = data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '';

  content.innerHTML = `
    ${demoNote}
    ${statusRows}

    <div class="mi-section">
      <div class="mi-section-title">Top Leads by Value</div>
      ${topLeads || '<p style="color:rgba(251,191,36,.4);font-size:12px">No leads processed</p>'}
    </div>

    <div class="mi-section">
      <div class="mi-section-title">Countries</div>
      <div class="lp-countries">${countryRows}</div>
    </div>

    <div class="mi-section">
      <div class="mi-section-title">Draft Status</div>
      <div class="lp-draft-note">
        All ${data.draftStatusBreakdown?.draft ?? 0} drafts require human review before sending.
        See PERSONALISED_OUTREACH_DRAFTS.md
      </div>
    </div>

    <div class="mi-action">
      <div class="mi-action-label">Recommended Next Action</div>
      ${data.topLeads?.[0]?.nextAction ? escapeHtml(data.topLeads[0].nextAction) : 'Review outreach drafts'}
    </div>

    <div class="mi-ts">Last run: ${escapeHtml(ts)} · Mode: ${escapeHtml(data.mode || 'template')}</div>`;
}

async function loadLpData() {
  try {
    const res  = await fetch('/api/mission-control?action=lead-personalise', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    lpData = json.leadData ?? null;
  } catch {
    lpData = null;
  }
  renderLpPanel(lpData);
  const hasData = lpData && lpData.totalLeads > 0;
  lpDot.className = `dot${hasData ? ' lp-dot' : ' empty'}`;
}

function openLpPanel() {
  lpOpen = true;
  lpPanel.classList.remove('hidden');
  lpToggle.classList.add('active');
  lpToggle.setAttribute('aria-expanded', 'true');
  panel.classList.add('hidden');
  if (!lpData) loadLpData();
}

function closeLpPanel() {
  lpOpen = false;
  lpPanel.classList.add('hidden');
  lpToggle.classList.remove('active');
  lpToggle.setAttribute('aria-expanded', 'false');
}

lpToggle.addEventListener('click', () => {
  if (lpOpen) closeLpPanel(); else openLpPanel();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && lpOpen) closeLpPanel();
});

setInterval(() => { if (lpOpen) loadLpData(); }, 5 * 60 * 1000);
loadLpData();

// ─── Init ─────────────────────────────────────────────────────────────────────

installIcons();
resize();
installGraph(demoPayload());
loadTelemetry().then(installGraph);
setInterval(() => loadTelemetry().then(installGraph), 30000);
requestAnimationFrame(render);
