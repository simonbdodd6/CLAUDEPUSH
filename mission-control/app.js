const canvas = document.getElementById('missionCanvas');
const ctx = canvas.getContext('2d', { alpha: true });
const panel = document.getElementById('nodePanel');
const stageShell = document.querySelector('.stage-shell');
const shell = document.querySelector('.mission-shell');
const missionDock = document.getElementById('missionDock');
const dockToggle = document.getElementById('dockToggle');
const thoughtStream = document.getElementById('thoughtStream');
const nodeWorkspace = document.getElementById('nodeWorkspace');
const soundToggle = document.getElementById('soundToggle');
const sparklineCanvases = [...document.querySelectorAll('.sparkline')];
const intelligenceCards = {
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
  Memory: '#8b5cf6',
  Reasoning: '#67e8f9',
  Player: '#f472b6',
  Coach: '#fbbf24',
  Fixture: '#60a5fa',
  Training: '#86efac',
  Prediction: '#fb7185',
  Knowledge: '#c4b5fd',
  Learning: '#5eead4',
  Video: '#38bdf8',
  DNA: '#f0abfc',
  Market: '#fcd34d',
  Club: '#34d399',
  Task: '#93c5fd',
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

const graphTypes = [
  'Memory', 'Reasoning', 'Player', 'Coach', 'Fixture', 'Training', 'Deployment',
  'Agent', 'Knowledge', 'Prediction', 'Task', 'Market', 'Video', 'Club', 'Learning', 'DNA',
];

const lucidePaths = {
  'bot': '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  'bug': '<path d="m8 2 1.9 1.9"/><path d="M14.1 3.9 16 2"/><path d="M9 7.5V6a3 3 0 0 1 6 0v1.5"/><rect width="10" height="12" x="7" y="8" rx="4"/><path d="M5 13h2"/><path d="M17 13h2"/><path d="M5 17h2"/><path d="M17 17h2"/><path d="M12 8v12"/>',
  'chevrons-left': '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
  'git-branch': '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  'network': '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M12 8v4"/><path d="M5 16l7-4 7 4"/>',
  'panel-left': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  'rocket': '<path d="M4.5 16.5c-1.5 1.26-2 4-2 4s2.74-.5 4-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.9 12.9 0 0 1 22 2c0 2.72-.78 7.5-6 11a22 22 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.4a1.4 1.4 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'sparkles': '<path d="m12 3-1.9 5.8L4 11l6.1 2.2L12 19l1.9-5.8L20 11l-6.1-2.2z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>',
  'terminal-square': '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2"/>',
  'volume-2': '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  'volume-x': '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
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
  targetZoom: 0.86,
  targetPanX: 0,
  targetPanY: 0,
  velocityX: 0,
  velocityY: 0,
  tick: 0,
  selected: null,
  hovered: null,
  workspaceNode: null,
  focusCluster: null,
  syntheticReady: false,
  dragging: false,
  lastPointer: null,
  pointerStart: null,
  lastPinchDistance: 0,
  lastPointerTime: 0,
  visible: true,
  mode: 'demo',
  events: [],
  liveSignals: [],
  sparkTick: 0,
};

const sound = {
  enabled: false,
  context: null,
  play(type = 'hover') {
    if (!this.enabled || typeof AudioContext === 'undefined') return;
    this.context ||= new AudioContext();
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const freq = { hover: 420, notification: 620, deploy: 840, complete: 720 }[type] || 520;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  },
};

const liveThoughts = [
  'Match prediction updated',
  'Learning complete',
  'Memory consolidated',
  'New tactical insight',
  'Deployment successful',
  'Agent 7 reasoning',
  'QA signal reconciled',
  'Vercel preview stable',
  'Rugby intelligence indexed',
  'Confidence matrix refreshed',
];

const activePointers = new Map();

const missionAgents = [
  { id: 'agent-coach-eye', label: "Coach's Eye Core", task: 'Product telemetry', health: 'Nominal', tone: 'hot' },
  { id: 'agent-mind', label: 'AI Mind', task: 'Coordinating the living graph', health: 'Optimal', tone: 'hot' },
  { id: 'agent-claude', label: 'Claude Builder', task: 'Planning product changes', health: 'Nominal', tone: '' },
  { id: 'agent-codex', label: 'Codex Engineer', task: 'Evolving the intelligence graph', health: 'Active', tone: 'hot' },
  { id: 'agent-qa', label: 'QA Agent', task: 'Regression monitoring', health: 'Watching', tone: 'warn' },
  { id: 'agent-github', label: 'GitHub', task: 'Branch intelligence', health: 'Online', tone: '' },
  { id: 'agent-vercel', label: 'Vercel', task: 'Deployment radar', health: 'Online', tone: '' },
  { id: 'agent-deploy', label: 'Deployments', task: 'Release readiness', health: 'Stable', tone: '' },
  { id: 'agent-analytics', label: 'Analytics', task: 'Usage signals', health: 'Learning', tone: '' },
  { id: 'agent-rugby', label: 'Rugby Intelligence', task: 'Knowledge synthesis', health: 'Ready', tone: '' },
  { id: 'agent-notifications', label: 'Notifications', task: 'Push delivery watch', health: 'Watching', tone: 'warn' },
  { id: 'agent-memory', label: 'Memory', task: 'Context retention', health: 'Synced', tone: '' },
];

const knowledgeClusters = [
  { id: 'memory', label: 'Memory', x: -520, y: -180, color: '#8b5cf6', types: ['Memory', 'Knowledge', 'DNA'] },
  { id: 'reasoning', label: 'Reasoning', x: 0, y: -250, color: '#67e8f9', types: ['Reasoning', 'Task', 'Agent'] },
  { id: 'rugby', label: 'Rugby Intelligence', x: 470, y: -120, color: '#86efac', types: ['Player', 'Coach', 'Fixture', 'Training'] },
  { id: 'prediction', label: 'Prediction', x: 380, y: 260, color: '#fb7185', types: ['Prediction', 'Learning', 'Video'] },
  { id: 'deployment', label: 'Deployment', x: -80, y: 340, color: '#c4b5fd', types: ['Deployment', 'System', 'API'] },
  { id: 'market', label: 'Market Intelligence', x: -520, y: 220, color: '#fcd34d', types: ['Market', 'Club', 'Knowledge'] },
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

function createMindGraph(graph = { nodes: [], links: [] }) {
  const nodes = [];
  const links = [];
  const addNode = node => {
    const cluster = node.cluster || knowledgeClusters[hashValue(node.id) % knowledgeClusters.length].id;
    const type = node.type === 'Core' ? 'Knowledge' : node.type || graphTypes[hashValue(node.id) % graphTypes.length];
    nodes.push({
      ...node,
      type,
      cluster,
      mass: 0.5 + (hashValue(`${node.id}:mass`) % 120) / 100,
      seed: hashValue(node.id),
      activity: Math.random() * 0.5,
      age: Math.random() * 1000,
    });
  };

  (graph.nodes || []).forEach((node, index) => {
    const cluster = knowledgeClusters[index % knowledgeClusters.length];
    addNode({
      ...node,
      cluster: cluster.id,
      label: node.label || node.id,
      type: node.type === 'Core' ? 'Knowledge' : node.type,
      meta: { ...(node.meta || {}), source: 'live telemetry' },
    });
  });

  missionAgents.forEach((agent, index) => addNode({
    id: agent.id,
    label: agent.label,
    type: 'Agent',
    cluster: knowledgeClusters[(index + 1) % knowledgeClusters.length].id,
    meta: { status: agent.health, task: agent.task, source: 'AI agent' },
  }));

  const targetCount = 1450;
  for (let i = nodes.length; i < targetCount; i++) {
    const cluster = knowledgeClusters[i % knowledgeClusters.length];
    const type = cluster.types[hashValue(`${cluster.id}:${i}`) % cluster.types.length];
    addNode({
      id: `mind-${cluster.id}-${i}`,
      label: `${type} ${i}`,
      type,
      cluster: cluster.id,
      meta: {
        status: i % 11 === 0 ? 'actively reasoning' : 'latent memory',
        source: cluster.label,
        confidence: `${64 + (i % 35)}%`,
      },
    });
  }

  const nodeIds = nodes.map(node => node.id);
  (graph.links || []).forEach(link => {
    if (nodeIds.includes(link.source) && nodeIds.includes(link.target)) links.push({ ...link, phase: Math.random() * Math.PI * 2, strength: 1 });
  });

  nodes.forEach((node, index) => {
    const clusterMates = nodes.filter(candidate => candidate.cluster === node.cluster);
    for (let k = 0; k < (index % 5 === 0 ? 3 : 2); k++) {
      const target = clusterMates[(hashValue(`${node.id}:${k}`) + index) % clusterMates.length];
      if (target && target.id !== node.id) links.push({ source: node.id, target: target.id, type: 'association', phase: Math.random() * Math.PI * 2, strength: 0.45 + (index % 8) / 10 });
    }
    if (index % 17 === 0) {
      const target = nodes[(index * 37 + 97) % nodes.length];
      if (target && target.id !== node.id) links.push({ source: node.id, target: target.id, type: 'cross-cluster inference', phase: Math.random() * Math.PI * 2, strength: 0.75 });
    }
  });

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
    const cluster = knowledgeClusters.find(item => item.id === node.cluster) || knowledgeClusters[h % knowledgeClusters.length];
    const local = index + h * 0.001;
    const angle = local * 2.399963 + (h % 360) * Math.PI / 180;
    const ring = 18 + Math.sqrt((h % 1000) / 1000) * (120 + (h % 190));
    const spiral = 1 + ((index % 19) - 9) * 0.006;
    return {
      ...node,
      x: cluster.x + Math.cos(angle) * ring * spiral,
      y: cluster.y + Math.sin(angle) * ring * 0.72 * spiral,
      vx: 0,
      vy: 0,
      homeX: cluster.x + Math.cos(angle) * ring * spiral,
      homeY: cluster.y + Math.sin(angle) * ring * 0.72 * spiral,
      size: Math.max(1.2, Math.min(9, (node.mass || 1) * (node.type === 'Agent' ? 4 : node.type === 'Prediction' ? 3.2 : 2.2))),
      pulse: (h % 100) / 100 * Math.PI * 2,
      color: colors[node.type] || cluster.color,
      activity: node.activity ?? Math.random() * 0.4,
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

  intelligenceCards.activeAgentCount.textContent = String(missionAgents.length);
  intelligenceCards.agentHealthSummary.textContent = warningSignals ? `${warningSignals} signals need review` : 'All critical systems online';
  intelligenceCards.currentBranch.textContent = metrics.branch || 'unknown';
  intelligenceCards.githubStatus.textContent = `${payload.mode === 'live' ? 'Live' : 'Demo'} graph · ${graph.links.length} links`;
  intelligenceCards.bugsOpen.textContent = String(warningSignals);
  intelligenceCards.latestDeployment.textContent = metrics.deploymentStatus || (deploymentNodes.length ? 'READY' : 'DEMO');
  intelligenceCards.currentBuild.textContent = metrics.latestCommit || 'local-demo';
  intelligenceCards.qaProgress.textContent = `${qaScore}%`;
  intelligenceCards.sprintStatus.textContent = `${tests.length || 1} QA surfaces · ${apiNodes.length || 1} API systems`;
  intelligenceCards.missionText.textContent = state.mode === 'live' ? 'Operate the autonomous AI company' : 'Demo the autonomous AI operating system safely';
  intelligenceCards.nextAction.textContent = warningSignals
    ? 'Review notifications and QA signals before the next deploy.'
    : 'Let the AI core monitor agents, deployments, learning, and tactical intelligence.';

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
  state.graph = createMindGraph(payload.graph || demoPayload().graph);
  assignLayout(state.graph);
  updateOverlays({ ...payload, graph: state.graph });
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
    state.targetPanX = state.panX;
    state.targetPanY = state.panY;
    state.targetZoom = state.zoom;
  }
}

function stageCenter() {
  const stageRect = stageShell?.getBoundingClientRect();
  return stageRect
    ? { x: stageRect.left + stageRect.width / 2, y: stageRect.top + stageRect.height / 2 - 8 }
    : { x: state.width / 2, y: state.height / 2 };
}

function focusCameraOn(node, zoom = 1.26) {
  const center = stageCenter();
  state.targetZoom = Math.min(2.8, Math.max(0.34, zoom));
  state.targetPanX = center.x - node.x * state.targetZoom;
  state.targetPanY = center.y - node.y * state.targetZoom;
  state.focusCluster = node.cluster || null;
}

function resetCamera() {
  const center = stageCenter();
  state.selected = null;
  state.workspaceNode = null;
  state.focusCluster = null;
  state.targetZoom = 0.9;
  state.targetPanX = center.x;
  state.targetPanY = center.y;
  nodeWorkspace?.classList.add('hidden');
  shell?.classList.remove('workspace-open');
}

function updateCamera() {
  if (!state.dragging) {
    state.targetPanX += state.velocityX;
    state.targetPanY += state.velocityY;
    state.velocityX *= 0.9;
    state.velocityY *= 0.9;
    if (Math.abs(state.velocityX) < 0.03) state.velocityX = 0;
    if (Math.abs(state.velocityY) < 0.03) state.velocityY = 0;
  }
  state.panX += (state.targetPanX - state.panX) * 0.11;
  state.panY += (state.targetPanY - state.panY) * 0.11;
  state.zoom += (state.targetZoom - state.zoom) * 0.1;
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
  const linkSample = state.links.slice(0, 1900);
  for (const link of linkSample) {
    const a = state.nodeById.get(link.source);
    const b = state.nodeById.get(link.target);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const target = link.type === 'cross-cluster inference' ? 420 : 72;
    const force = (d - target) * 0.00012 * link.strength;
    a.vx += dx / d * force;
    a.vy += dy / d * force;
    b.vx -= dx / d * force;
    b.vy -= dy / d * force;
  }
  state.nodes.forEach((node, index) => {
    const cluster = knowledgeClusters.find(item => item.id === node.cluster) || knowledgeClusters[0];
    const breathe = Math.sin(state.tick * 0.004 + node.seed * 0.01) * 12;
    const homePull = state.focusCluster === node.cluster ? 0.012 : 0.0025;
    node.vx += (node.homeX + Math.cos(node.seed) * breathe - node.x) * homePull + Math.cos(state.tick * 0.003 + index) * 0.01;
    node.vy += (node.homeY + Math.sin(node.seed) * breathe * 0.7 - node.y) * homePull + Math.sin(state.tick * 0.0037 + index) * 0.01;
    node.vx += Math.cos(state.tick * 0.0008 + cluster.x * 0.01) * 0.004;
    node.vy += Math.sin(state.tick * 0.0007 + cluster.y * 0.01) * 0.004;
    if (focus && state.adjacency.get(focus.id)?.has(node.id)) node.activity = Math.max(node.activity, 0.55);
    if (state.tick % 420 === index % 420) node.activity = Math.max(node.activity, 0.9);
    node.activity = Math.max(0.01, node.activity * 0.992);
    node.vx *= 0.92;
    node.vy *= 0.92;
    node.x += node.vx;
    node.y += node.vy;
  });

  if (state.tick % 180 === 0 && state.nodes.length > 10) {
    const source = state.nodes[(state.tick * 17) % state.nodes.length];
    const target = state.nodes[(state.tick * 43 + 91) % state.nodes.length];
    if (source && target && source.id !== target.id) {
      state.links.push({ source: source.id, target: target.id, type: 'emergent thought', phase: Math.random() * Math.PI * 2, strength: 1.4, born: state.tick });
      state.adjacency.get(source.id)?.add(target.id);
      state.adjacency.get(target.id)?.add(source.id);
      source.activity = 1;
      target.activity = 1;
      if (state.links.length > 3800) state.links.splice(0, 80);
    }
  }
}

function drawBackground() {
  const grid = 56 * state.zoom;
  ctx.save();
  ctx.globalAlpha = 0.04;
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

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 64; i++) {
    const depth = 0.25 + (i % 9) / 9;
    const x = ((Math.sin(i * 12.989 + state.tick * 0.0009 * depth) * 43758.5453) % 1 + 1) % 1 * state.width;
    const y = ((Math.cos(i * 78.233 + state.tick * 0.0007 * depth) * 19341.271) % 1 + 1) % 1 * state.height;
    ctx.globalAlpha = 0.025 + depth * 0.055;
    ctx.fillStyle = i % 4 ? '#dff7ff' : '#67e8f9';
    ctx.beginPath();
    ctx.arc(x, y, 0.45 + depth * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 18; i++) {
    const a = i * 0.72 + state.tick * 0.0014;
    const b = a + 0.48 + (i % 3) * 0.16;
    const cx = state.width / 2;
    const cy = state.height / 2;
    const r = Math.min(state.width, state.height) * (0.24 + (i % 5) * 0.05);
    ctx.globalAlpha = 0.035;
    ctx.strokeStyle = i % 2 ? '#67e8f9' : '#c4b5fd';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.58);
    ctx.lineTo(cx + Math.cos(b) * r * 1.12, cy + Math.sin(b) * r * 0.64);
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

function drawClusterFields() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  knowledgeClusters.forEach((cluster, index) => {
    const p = worldToScreen(cluster.x, cluster.y);
    const radius = (240 + Math.sin(state.tick * 0.01 + index) * 28) * state.zoom;
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    glow.addColorStop(0, `${cluster.color}22`);
    glow.addColorStop(0.42, `${cluster.color}0d`);
    glow.addColorStop(1, `${cluster.color}00`);
    ctx.globalAlpha = state.focusCluster && state.focusCluster !== cluster.id ? 0.18 : 1;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (state.zoom > 0.48) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = cluster.color;
      ctx.font = `${Math.max(10, 13 * state.zoom)}px Inter, sans-serif`;
      ctx.fillText(cluster.label, p.x - 42 * state.zoom, p.y - radius * 0.28);
    }
  });
  ctx.restore();
}

function visibleOnScreen(point, pad = 120) {
  return point.x > -pad && point.y > -pad && point.x < state.width + pad && point.y < state.height + pad;
}

function drawMindLink(link) {
  const a = state.nodeById.get(link.source);
  const b = state.nodeById.get(link.target);
  if (!a || !b) return;
  const pa = worldToScreen(a.x, a.y);
  const pb = worldToScreen(b.x, b.y);
  if (!visibleOnScreen(pa, 260) && !visibleOnScreen(pb, 260)) return;
  const focus = state.selected || state.hovered;
  const connected = !focus || a.id === focus.id || b.id === focus.id || state.adjacency.get(focus.id)?.has(a.id) || state.adjacency.get(focus.id)?.has(b.id);
  const pulse = (Math.sin(state.tick * 0.035 + link.phase) + 1) / 2;
  const color = a.color || colors[a.type] || '#67e8f9';
  ctx.save();
  ctx.globalAlpha = connected ? 0.08 + pulse * 0.08 : 0.012;
  if (state.focusCluster && a.cluster !== state.focusCluster && b.cluster !== state.focusCluster) ctx.globalAlpha *= 0.24;
  ctx.strokeStyle = color;
  ctx.lineWidth = link.type === 'cross-cluster inference' ? 0.8 : 0.45;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  const cx = (pa.x + pb.x) / 2 + Math.sin(link.phase) * 18 * state.zoom;
  const cy = (pa.y + pb.y) / 2 + Math.cos(link.phase) * 18 * state.zoom;
  ctx.quadraticCurveTo(cx, cy, pb.x, pb.y);
  ctx.stroke();

  if (connected && (link.strength > 0.9 || state.tick % 3 === 0)) {
    const t = (state.tick * 0.004 * link.strength + link.phase) % 1;
    const x = (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * cx + t * t * pb.x;
    const y = (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * cy + t * t * pb.y;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(x, y, 1.4 + pulse * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawNode(node) {
  const p = worldToScreen(node.x, node.y);
  if (!visibleOnScreen(p, 80)) return;
  const connected = connectedToFocus(node);
  const color = node.color || colors[node.type] || '#67e8f9';
  const selected = state.selected?.id === node.id;
  const hovered = state.hovered?.id === node.id;
  const pulse = (Math.sin(state.tick * 0.05 + node.pulse) + 1) / 2;
  const lod = state.zoom < 0.42 && !selected && !hovered && node.size < 4 ? 0.55 : 1;
  const radius = Math.max(0.8, (node.size + node.activity * 4 + pulse * 0.9) * (selected || hovered ? 2.1 : 1) * state.zoom * lod);

  ctx.save();
  ctx.globalAlpha = connected ? 0.9 : 0.08;
  if (state.focusCluster && node.cluster !== state.focusCluster && !connected) ctx.globalAlpha *= 0.22;
  ctx.shadowColor = color;
  ctx.shadowBlur = connected ? 8 + node.activity * 24 : 0;
  if (radius > 2.2) {
    const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, radius * 5);
    glow.addColorStop(0, `${color}88`);
    glow.addColorStop(0.4, `${color}22`);
    glow.addColorStop(1, `${color}00`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();

  if (selected || hovered) {
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#f8fafc';
    ctx.stroke();
  }

  if ((selected || hovered || state.zoom > 1.2 && node.size > 4.5) && connected) {
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#e0f2fe';
    ctx.font = `${Math.max(10, 11 * state.zoom)}px Inter, sans-serif`;
    ctx.fillText(node.label, p.x + radius + 8, p.y + 4);
  }
  ctx.restore();
}

function render() {
  if (!state.visible) {
    requestAnimationFrame(render);
    return;
  }
  state.tick++;
  updateCamera();
  simulate();
  ctx.clearRect(0, 0, state.width, state.height);
  drawBackground();
  drawParticles();
  drawClusterFields();
  state.links.slice(Math.max(0, state.links.length - 2800)).forEach(drawMindLink);
  state.nodes.forEach(drawNode);
  drawSparklines();
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
    if (d < bestD && d < Math.max(22, node.size * 4 + 10) / state.zoom) {
      best = node;
      bestD = d;
    }
  }
  return best;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function setPanelPosition(clientX, clientY) {
  const x = Math.min(state.width - 390, Math.max(22, clientX + 22));
  const y = Math.min(state.height - 260, Math.max(86, clientY - 54));
  document.documentElement.style.setProperty('--panel-x', `${x}px`);
  document.documentElement.style.setProperty('--panel-y', `${y}px`);
  document.documentElement.style.setProperty('--focus-x', `${Math.round(clientX / Math.max(1, state.width) * 100)}%`);
  document.documentElement.style.setProperty('--focus-y', `${Math.round(clientY / Math.max(1, state.height) * 100)}%`);
}

function focusHoverNode(node, rect) {
  state.hovered = node;
  state.focusCluster = node.cluster || null;
  node.activity = 1;
  shell?.classList.add('node-focus');
  const screen = rect
    ? { x: rect.right, y: rect.top + rect.height / 2 }
    : worldToScreen(node.x, node.y);
  setPanelPosition(screen.x, screen.y);
  showPanel(node);
  sound.play('hover');
}

function clearHoverNode() {
  state.hovered = null;
  if (!state.selected) state.focusCluster = null;
  shell?.classList.remove('node-focus');
  if (!state.selected) showPanel(null);
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

function openWorkspace(node) {
  if (!node) return;
  state.selected = node;
  state.workspaceNode = node;
  node.activity = 1;
  focusCameraOn(node, node.type === 'Agent' ? 1.58 : 1.34);
  showPanel(null);
  shell?.classList.add('workspace-open');
  sound.play('complete');

  const meta = node.meta || {};
  const confidence = 82 + (hashValue(node.id) % 16);
  const links = state.adjacency.get(node.id)?.size || 0;
  const tasks = [
    meta.task || meta.status || 'Coordinate active company context',
    node.type === 'Deployment' ? 'Verify release readiness' : 'Synchronise memory and telemetry',
    node.type === 'Agent' ? 'Report reasoning trace' : 'Watch connected system signals',
  ];
  const logs = [
    `${new Date().toLocaleTimeString()} signal received`,
    `${links} connections illuminated`,
    `confidence adjusted to ${confidence}%`,
  ];

  nodeWorkspace.innerHTML = `
    <div class="workspace-hero">
      <div>
        <span class="kicker">${escapeHtml(node.type)}</span>
        <h2>${escapeHtml(node.label)}</h2>
        <p>${escapeHtml(meta.status || meta.subject || meta.route || meta.path || 'Autonomous company system online')}</p>
      </div>
      <div class="workspace-confidence">
        <strong>${confidence}%</strong>
        <span>Confidence</span>
      </div>
    </div>
    <div class="workspace-grid">
      <section class="workspace-panel"><h3>Status</h3><p>${escapeHtml(meta.status || 'Running nominally')} · ${links} active links</p></section>
      <section class="workspace-panel"><h3>Memory</h3><p>${escapeHtml(meta.path || meta.source || meta.task || 'Context retained in the Mission Control graph')}</p></section>
      <section class="workspace-panel"><h3>Reasoning</h3><p>${escapeHtml(node.type === 'Agent' ? 'Prioritising company signals, confidence deltas, and operational context.' : 'Mapping upstream and downstream dependencies before recommending action.')}</p></section>
      <section class="workspace-panel"><h3>Tasks</h3><ul>${tasks.map(task => `<li>${escapeHtml(task)}</li>`).join('')}</ul></section>
      <section class="workspace-panel"><h3>Logs</h3><ul>${logs.map(log => `<li>${escapeHtml(log)}</li>`).join('')}</ul></section>
      <section class="workspace-panel"><h3>Learning</h3><p>Signal quality ${Math.max(64, confidence - 12)}%. Telemetry updates fold back into the living graph every cycle.</p></section>
    </div>`;
  nodeWorkspace.classList.remove('hidden');
}

function addLiveThought(text = liveThoughts[Math.floor(Math.random() * liveThoughts.length)]) {
  if (!thoughtStream) return;
  const cluster = knowledgeClusters[Math.floor(Math.random() * knowledgeClusters.length)];
  const clusterNodes = state.nodes.filter(node => node.cluster === cluster.id);
  const hotNode = clusterNodes[Math.floor(Math.random() * Math.max(1, clusterNodes.length))];
  const origin = hotNode ? worldToScreen(hotNode.x, hotNode.y) : worldToScreen(cluster.x, cluster.y);
  const thought = document.createElement('div');
  thought.className = 'thought-pill';
  thought.style.left = `${Math.max(10, Math.min(90, origin.x / Math.max(1, state.width) * 100))}%`;
  thought.style.top = `${Math.max(12, Math.min(86, origin.y / Math.max(1, state.height) * 100))}%`;
  thought.textContent = text;
  thoughtStream.append(thought);
  sound.play(text.toLowerCase().includes('deployment') ? 'deploy' : 'notification');
  if (hotNode) {
    hotNode.activity = 1;
    state.focusCluster = cluster.id;
    setTimeout(() => { if (!state.selected && !state.hovered) state.focusCluster = null; }, 1600);
  }
  setTimeout(() => thought.remove(), 5200);
}

function drawSparklines() {
  state.sparkTick++;
  sparklineCanvases.forEach((spark, index) => {
    const rect = spark.getBoundingClientRect?.() || { width: 120, height: 34 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(90, Math.floor(rect.width || 120));
    const height = Math.max(24, Math.floor(rect.height || 34));
    if (spark.width !== Math.floor(width * dpr) || spark.height !== Math.floor(height * dpr)) {
      spark.width = Math.floor(width * dpr);
      spark.height = Math.floor(height * dpr);
      spark.style.width = `${width}px`;
      spark.style.height = `${height}px`;
    }
    const sctx = spark.getContext?.('2d');
    if (!sctx) return;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, width, height);
    sctx.strokeStyle = index % 2 ? '#86efac' : '#67e8f9';
    sctx.lineWidth = 1.4;
    sctx.globalAlpha = 0.75;
    sctx.beginPath();
    for (let x = 0; x < width; x += 4) {
      const y = height * 0.58 + Math.sin((x + state.sparkTick * (0.9 + index * 0.12)) * 0.06 + index) * height * 0.18 + Math.sin((x + index * 17) * 0.17) * height * 0.08;
      if (x === 0) sctx.moveTo(x, y);
      else sctx.lineTo(x, y);
    }
    sctx.stroke();
  });
}

function setDockOpen(open) {
  missionDock?.classList.toggle('collapsed', !open);
  dockToggle?.setAttribute('aria-expanded', String(open));
  scheduleDockHide();
}

let dockHideTimer = null;
function scheduleDockHide() {
  if (!missionDock || missionDock.classList.contains('collapsed')) return;
  clearTimeout(dockHideTimer);
  dockHideTimer = setTimeout(() => {
    missionDock.classList.add('collapsed');
    dockToggle?.setAttribute('aria-expanded', 'false');
  }, 7000);
}

function installDock() {
  dockToggle?.addEventListener('click', () => setDockOpen(missionDock.classList.contains('collapsed')));
  missionDock?.addEventListener('mousemove', scheduleDockHide);
  missionDock?.addEventListener('mouseleave', scheduleDockHide);
  setTimeout(() => missionDock?.classList.add('auto-hidden'), 9000);
  missionDock?.addEventListener('mouseenter', () => missionDock.classList.remove('auto-hidden'));
  document.querySelectorAll('[data-panel-trigger]').forEach(button => {
    button.addEventListener('click', () => {
      const target = button.dataset.panelTrigger;
      if (target === 'marketPanel') marketToggle?.click();
      if (target === 'rugbyPanel') rugbyToggle?.click();
      if (target === 'lpPanel') lpToggle?.click();
    });
  });
  document.querySelector('[data-focus-graph]')?.addEventListener('click', resetCamera);
}

function installSoundToggle() {
  soundToggle?.addEventListener('click', () => {
    sound.enabled = !sound.enabled;
    soundToggle.setAttribute('aria-pressed', String(sound.enabled));
    soundToggle.querySelector('[data-icon]')?.setAttribute('data-icon', sound.enabled ? 'volume-2' : 'volume-x');
    installIcons();
    sound.play('complete');
  });
}

canvas.addEventListener('pointerdown', event => {
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    const points = [...activePointers.values()];
    state.lastPinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    state.dragging = false;
    return;
  }
  state.dragging = true;
  state.lastPointer = { x: event.clientX, y: event.clientY };
  state.pointerStart = { x: event.clientX, y: event.clientY };
  state.lastPointerTime = performance.now();
  state.velocityX = 0;
  state.velocityY = 0;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    const points = [...activePointers.values()];
    const distance = Math.max(20, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
    const midpoint = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    const before = screenToWorld(midpoint.x, midpoint.y);
    const factor = state.lastPinchDistance ? distance / state.lastPinchDistance : 1;
    state.targetZoom = Math.min(3.1, Math.max(0.28, state.targetZoom * factor));
    state.targetPanX = midpoint.x - before.x * state.targetZoom;
    state.targetPanY = midpoint.y - before.y * state.targetZoom;
    state.lastPinchDistance = distance;
    return;
  }
  const near = nearestNode(event.clientX, event.clientY);
  if (!state.workspaceNode) {
    if (near && near !== state.hovered) focusHoverNode(near);
    else if (near) setPanelPosition(event.clientX, event.clientY);
    else if (state.hovered) clearHoverNode();
  }
  if (state.dragging && state.lastPointer) {
    const now = performance.now();
    const dt = Math.max(16, now - state.lastPointerTime);
    const dx = event.clientX - state.lastPointer.x;
    const dy = event.clientY - state.lastPointer.y;
    state.targetPanX += dx;
    state.targetPanY += dy;
    state.velocityX = dx / dt * 16;
    state.velocityY = dy / dt * 16;
    state.lastPointer = { x: event.clientX, y: event.clientY };
    state.lastPointerTime = now;
  }
});

canvas.addEventListener('pointerup', event => {
  activePointers.delete(event.pointerId);
  state.lastPinchDistance = 0;
  const moved = state.pointerStart && Math.hypot(event.clientX - state.pointerStart.x, event.clientY - state.pointerStart.y) > 8;
  state.dragging = false;
  state.lastPointer = null;
  state.pointerStart = null;
  if (!moved) {
    const node = nearestNode(event.clientX, event.clientY);
    if (node) openWorkspace(node);
  }
});

canvas.addEventListener('pointercancel', event => {
  activePointers.delete(event.pointerId);
  state.dragging = false;
  state.lastPinchDistance = 0;
  state.lastPointer = null;
  state.pointerStart = null;
});

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const before = screenToWorld(event.clientX, event.clientY);
  const multiplier = Math.exp(-event.deltaY * 0.0011);
  state.targetZoom = Math.min(3.1, Math.max(0.28, state.targetZoom * multiplier));
  state.targetPanX = event.clientX - before.x * state.targetZoom;
  state.targetPanY = event.clientY - before.y * state.targetZoom;
}, { passive: false });

canvas.addEventListener('dblclick', event => {
  const node = nearestNode(event.clientX, event.clientY);
  if (node) {
    state.selected = node;
    focusCameraOn(node, 1.55);
    focusHoverNode(node);
  } else {
    resetCamera();
  }
});

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    resetCamera();
    showPanel(null);
    closeMarketPanel();
    closeRugbyPanel?.();
    closeLpPanel?.();
  }
});

window.addEventListener('resize', resize);

document.addEventListener('visibilitychange', () => {
  state.visible = !document.hidden;
  shell?.classList.toggle('paused', document.hidden);
});

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
installDock();
installSoundToggle();
resize();
installGraph(demoPayload());
loadTelemetry().then(installGraph);
setInterval(() => loadTelemetry().then(installGraph), 30000);
setInterval(() => addLiveThought(), 3600);
setTimeout(() => addLiveThought('Neural operating system online'), 700);
requestAnimationFrame(render);
