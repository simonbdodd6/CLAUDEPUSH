// Platform Map — builds the engine dependency graph and renders ASCII diagrams.

import { boot, listEngines, getDependencies, getDependents } from './platform-registry.js';

// ── Dependency graph ────────────────────────────────────────────────────────────

export function buildDependencyGraph() {
  boot();
  const engines = listEngines();
  const nodes   = engines.map(e => ({ id: e.id, name: e.name, capabilities: e.capabilities.length, deps: e.dependencies }));
  const edges   = [];

  engines.forEach(e => {
    e.dependencies.forEach(dep => {
      edges.push({ from: dep, to: e.id, label: 'requires' });
    });
  });

  return { nodes, edges, engineCount: nodes.length, edgeCount: edges.length };
}

// ── Dependency levels (topological layers) ─────────────────────────────────────

export function buildLayers() {
  boot();
  const engines     = listEngines();
  const engineMap   = Object.fromEntries(engines.map(e => [e.id, e]));
  const levels      = {};
  const visited     = new Set();

  function getLevel(id, depth = 0) {
    if (visited.has(id)) return levels[id] ?? 0;
    visited.add(id);
    const e = engineMap[id];
    if (!e || e.dependencies.length === 0) { levels[id] = 0; return 0; }
    const maxDepLevel = Math.max(...e.dependencies.map(d => getLevel(d, depth + 1)));
    levels[id] = maxDepLevel + 1;
    return levels[id];
  }

  engines.forEach(e => getLevel(e.id));

  const layerMap = {};
  Object.entries(levels).forEach(([id, level]) => {
    if (!layerMap[level]) layerMap[level] = [];
    layerMap[level].push(id);
  });

  return { levels, layers: layerMap };
}

// ── ASCII map renderer ─────────────────────────────────────────────────────────

const ENGINE_SHORT = {
  'memory-engine':        'Memory',
  'data-integration':     'DataIntg',
  'coaching-engine':      'Coaching',
  'player-development':   'PlayerDev',
  'workflow-engine':      'Workflow',
  'communications-engine':'Comms',
  'club-intelligence':    'ClubIntel',
  'knowledge-engine':     'Knowledge',
  'executive-dashboard':  'Dashboard',
  'ai-copilot':           'Copilot',
};

export function renderAsciiMap() {
  return `
╔══════════════════════════════════════════════════════════════════════╗
║              COACH'S EYE PLATFORM — ENGINE DEPENDENCY MAP            ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║   ┌─────────────────────────────────────────────────────────────┐   ║
║   │  🤖  AI Copilot  ←  SINGLE ENTRY POINT  (Platform Layer)   │   ║
║   └──────────────────────────┬──────────────────────────────────┘   ║
║                              │                                       ║
║          ┌───────────────────┼──────────────────────┐               ║
║          │                   │                       │               ║
║   ┌──────▼──────┐   ┌────────▼───────┐   ┌──────────▼──────────┐   ║
║   │  Workflow   │   │  Knowledge     │   │  Club Intelligence  │   ║
║   │  Engine     │   │  Engine        │   │  Engine             │   ║
║   └──────┬──────┘   └────────┬───────┘   └──────────┬──────────┘   ║
║          │                   │                       │               ║
║   ┌──────▼──────┐   ┌────────▼───────┐              │               ║
║   │  Coaching   │   │  Data          │              │               ║
║   │  Engine     │   │  Integration   │              │               ║
║   └──────┬──────┘   └────────────────┘              │               ║
║          │                                           │               ║
║   ┌──────▼──────┐   ┌─────────────────┐             │               ║
║   │   Player    │   │  Communications │◄────────────┘               ║
║   │  Dev Engine │   │  Engine         │                              ║
║   └─────────────┘   └─────────────────┘                             ║
║                              ▲                                       ║
║                    ┌─────────┴─────────┐                            ║
║                    │                   │                             ║
║             ┌──────┴──────┐   ┌────────┴───────┐                   ║
║             │   Memory    │   │  Executive     │                   ║
║             │   Engine    │   │  Dashboard     │                   ║
║             └─────────────┘   └────────────────┘                   ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║  FOUNDATION LAYER  │  Memory Engine · Data Integration              ║
║  DOMAIN LAYER      │  Coaching · Player Dev · Club Intelligence      ║
║  INTEGRATION LAYER │  Workflow · Communications · Knowledge          ║
║  PRESENTATION LAYER│  Executive Dashboard · AI Copilot               ║
╠══════════════════════════════════════════════════════════════════════╣
║  PLATFORM LAYER    │  Registry · Contracts · Events · Orchestrator   ║
╚══════════════════════════════════════════════════════════════════════╝
`;
}

// ── Structured dependency report ───────────────────────────────────────────────

export function buildDependencyReport() {
  boot();
  const engines = listEngines();
  const graph   = buildDependencyGraph();
  const { layers } = buildLayers();

  const report = {
    engines: engines.map(e => ({
      id:           e.id,
      name:         e.name,
      capabilities: e.capabilities.length,
      dependencies: e.dependencies,
      dependents:   getDependents(e.id),
      optional:     e.optional,
    })),
    layers,
    stats: {
      totalEngines:  graph.engineCount,
      totalEdges:    graph.edgeCount,
      maxDepth:      Math.max(...Object.values(buildLayers().levels)),
      foundationEngines: (layers[0] ?? []).length,
    },
  };

  return report;
}

export function formatDependencyReport(report) {
  const lines = ['## Engine Dependency Report\n'];

  const layerNames = {
    0: 'Foundation (no deps)',
    1: 'Domain Layer',
    2: 'Integration Layer',
    3: 'Presentation / AI Layer',
  };

  Object.entries(report.layers).sort(([a], [b]) => Number(a) - Number(b)).forEach(([level, ids]) => {
    lines.push(`### Layer ${level}: ${layerNames[level] ?? `Level ${level}`}`);
    ids.forEach(id => {
      const e = report.engines.find(e => e.id === id);
      if (!e) return;
      const deps      = e.dependencies.length ? `deps: [${e.dependencies.join(', ')}]` : 'no dependencies';
      const dependents = e.dependents.length  ? `used by: [${e.dependents.join(', ')}]` : 'no dependents';
      lines.push(`- **${e.name}** — ${e.capabilities} capabilities · ${deps} · ${dependents}${e.optional ? ' _(optional)_' : ''}`);
    });
    lines.push('');
  });

  lines.push(`**Total:** ${report.stats.totalEngines} engines · ${report.stats.totalEdges} dependencies · max depth ${report.stats.maxDepth}`);
  return lines.join('\n');
}
