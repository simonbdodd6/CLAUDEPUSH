// Platform Engine Registry — authoritative catalogue of every Coach's Eye engine.
// Extends the AI Copilot's tool-registry with: module paths, dependencies,
// health checks, and platform-level metadata.

import { emit, EVENT_TYPES } from './platform-events.js';
import { EngineNotFoundError, EngineUnavailableError } from './platform-errors.js';

// ── Engine Descriptor Shape ────────────────────────────────────────────────────
// {
//   id:           string         — unique kebab-case identifier
//   name:         string         — human-readable name
//   version:      string         — semver
//   description:  string         — one sentence
//   module:       string         — relative module path for lazy import
//   capabilities: string[]       — dot-notation: 'player.read', 'session.build'
//   dependencies: string[]       — IDs of engines this one depends on
//   optional:     boolean        — if true, failure doesn't fail dependent pipelines
//   healthCheck:  async () → { ok, details }
//   adapter:      async (req) → PlatformResponse
// }

const _engines  = new Map();
let   _booted   = false;

// ── Engine definitions ─────────────────────────────────────────────────────────

const ENGINE_DEFINITIONS = [
  {
    id:          'memory-engine',
    name:        'Memory Engine',
    version:     '1.0.0',
    description: 'Long-term memory store for all AI features — players, teams, sessions',
    module:      '../memory-engine/index.js',
    capabilities: ['player.read', 'player.write', 'team.read', 'team.write', 'session.read', 'attendance.record', 'memory.search'],
    dependencies: [],
    optional:    false,
    async healthCheck() {
      try {
        const m = await import('../memory-engine/index.js');
        const h = m.checkHealth?.() ?? { healthy: true };
        return { ok: h.healthy !== false, details: h };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
  {
    id:          'data-integration',
    name:        'Data Integration Layer',
    version:     '1.0.0',
    description: 'Unified data access for fixtures, attendance, membership, sponsors, volunteers',
    module:      '../qa/data-integration/index.js',
    capabilities: ['data.query', 'fixture.read', 'attendance.read', 'session.read', 'membership.read', 'sponsor.read', 'volunteer.read', 'data.health'],
    dependencies: [],
    optional:    false,
    async healthCheck() {
      try {
        const di = await import('../qa/data-integration/index.js');
        const h  = await di.getDataHealth();
        return { ok: h.healthy !== false, details: h };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
  {
    id:          'coaching-engine',
    name:        'Coaching Engine',
    version:     '1.0.0',
    description: 'Generates training sessions, coaching programmes, and rehabilitation plans',
    module:      '../qa/coaching-engine/index.js',
    capabilities: ['session.build', 'programme.build', 'rehab.build', 'session.plan'],
    dependencies: ['memory-engine'],
    optional:    false,
    async healthCheck() {
      try {
        const e = await import('../qa/coaching-engine/index.js');
        return { ok: !!e, details: { available: true } };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
  {
    id:          'player-development',
    name:        'Player Development Engine',
    version:     '1.0.0',
    description: 'Tracks player progress, development scores, injury risk, and squad analysis',
    module:      '../qa/player-development/index.js',
    capabilities: ['player.progress', 'squad.analyse', 'injury.risk', 'player.compare', 'development.score'],
    dependencies: ['memory-engine', 'coaching-engine'],
    optional:    true,
    async healthCheck() {
      try {
        const e = await import('../qa/player-development/index.js');
        return { ok: !!e, details: { available: true } };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
  {
    id:          'workflow-engine',
    name:        'Workflow Engine',
    version:     '1.0.0',
    description: 'Parses, plans, queues, and executes multi-step coaching workflows',
    module:      '../workflow-engine/index.js',
    capabilities: ['workflow.execute', 'workflow.plan', 'workflow.queue', 'workflow.history'],
    dependencies: ['memory-engine', 'coaching-engine'],
    optional:    false,
    async healthCheck() {
      try {
        const e = await import('../workflow-engine/index.js');
        return { ok: !!e, details: { available: true } };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
  {
    id:          'communications-engine',
    name:        'Communications Engine',
    version:     '1.0.0',
    description: 'Builds, drafts, and schedules all club communications for 10 audience types',
    module:      '../communications-engine/index.js',
    capabilities: ['communication.draft', 'communication.schedule', 'newsletter.build', 'match_report.build', 'sponsor.update', 'volunteer.manage', 'membership.remind', 'social_media.build'],
    dependencies: ['memory-engine', 'data-integration'],
    optional:    false,
    async healthCheck() {
      try {
        const e = await import('../communications-engine/index.js');
        return { ok: !!e, details: { available: true } };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
  {
    id:          'club-intelligence',
    name:        'Club Intelligence Engine',
    version:     '1.0.0',
    description: 'Highest-level AI engine — health scores, insights, and recommendations for the entire club',
    module:      '../qa/club-intelligence/index.js',
    capabilities: ['health.score', 'insight.generate', 'recommendation.generate', 'question.answer', 'club.profile'],
    dependencies: ['memory-engine'],
    optional:    true,
    async healthCheck() {
      try {
        const e = await import('../qa/club-intelligence/index.js');
        const h = await e.getClubHealth();
        return { ok: !!h, details: { score: h?.overallScore ?? h?.score } };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
  {
    id:          'knowledge-engine',
    name:        'Knowledge Engine',
    version:     '1.0.0',
    description: 'Searchable knowledge layer — evidence-backed answers about any club domain',
    module:      '../knowledge-engine/index.js',
    capabilities: ['knowledge.ask', 'knowledge.search', 'knowledge.index', 'injury_report', 'attendance_report', 'sponsor_expiry'],
    dependencies: ['memory-engine', 'data-integration', 'club-intelligence', 'communications-engine'],
    optional:    true,
    async healthCheck() {
      try {
        const e = await import('../knowledge-engine/index.js');
        const h = await e.checkHealth();
        return { ok: h.healthy, details: h };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
  {
    id:          'executive-dashboard',
    name:        'Executive Dashboard',
    version:     '1.0.0',
    description: 'Unified command centre — morning briefing, approval queue, activity feed',
    module:      '../dashboard/index.js',
    capabilities: ['dashboard.build', 'approval.queue', 'briefing.generate', 'agenda.build'],
    dependencies: ['memory-engine', 'data-integration', 'club-intelligence', 'communications-engine', 'workflow-engine', 'knowledge-engine'],
    optional:    true,
    async healthCheck() {
      try {
        const e = await import('../dashboard/index.js');
        return { ok: !!e, details: { available: true } };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
  {
    id:          'ai-copilot',
    name:        'AI Copilot',
    version:     '1.0.0',
    description: 'Natural language interface — routes any intent to the correct engine(s)',
    module:      '../ai-copilot/index.js',
    capabilities: ['copilot.chat', 'copilot.quick_action', 'intent.route', 'context.load'],
    dependencies: ['memory-engine', 'coaching-engine', 'player-development', 'workflow-engine', 'communications-engine', 'knowledge-engine'],
    optional:    false,
    async healthCheck() {
      try {
        const e = await import('../ai-copilot/index.js');
        return { ok: !!e, details: { available: true } };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
  {
    id:          'proactive-intelligence',
    name:        'Proactive Intelligence Engine',
    version:     '1.0.0',
    description: 'Monitors all engines, detects significant events, and generates executive briefings without autonomous external execution',
    module:      '../lib/ai/proactive-intelligence/index.js',
    capabilities: ['intelligence.monitor', 'briefing.generate', 'executive_inbox.manage', 'morning_briefing.generate', 'urgency.rank'],
    dependencies: ['executive-dashboard', 'ai-copilot'],
    optional:    true,
    async healthCheck() {
      try {
        const e = await import('../lib/ai/proactive-intelligence/index.js');
        return { ok: !!e?.runProactiveIntelligence, details: { available: true, humanApprovalRequired: true } };
      } catch (err) { return { ok: false, details: { error: err.message } }; }
    },
  },
];

// ── Registration ───────────────────────────────────────────────────────────────

export function registerEngine(descriptor) {
  _engines.set(descriptor.id, {
    ...descriptor,
    registeredAt: new Date().toISOString(),
    status:       'unknown',
    lastHealthCheck: null,
  });
  emit(EVENT_TYPES.ENGINE_REGISTERED, { engineId: descriptor.id, name: descriptor.name }, 'platform-registry');
}

export function boot() {
  if (_booted) return;
  ENGINE_DEFINITIONS.forEach(registerEngine);
  _booted = true;
  emit(EVENT_TYPES.PLATFORM_STARTED, { engineCount: _engines.size }, 'platform-registry');
}

// ── Lookup ─────────────────────────────────────────────────────────────────────

export function getEngine(id) {
  const e = _engines.get(id);
  if (!e) throw new EngineNotFoundError(id);
  return e;
}

export function getEngineOrNull(id) {
  return _engines.get(id) ?? null;
}

export function hasEngine(id) { return _engines.has(id); }

export function listEngines() {
  return [..._engines.values()].map(e => ({
    id:           e.id,
    name:         e.name,
    version:      e.version,
    capabilities: e.capabilities,
    dependencies: e.dependencies,
    optional:     e.optional,
    status:       e.status,
    lastHealthCheck: e.lastHealthCheck,
  }));
}

export function getCapable(capability) {
  return [..._engines.values()].filter(e => e.capabilities.includes(capability));
}

export function getDependencies(engineId, transitive = false) {
  const engine = getEngine(engineId);
  if (!transitive) return [...engine.dependencies];

  // BFS for transitive deps
  const visited = new Set(), queue = [...engine.dependencies];
  while (queue.length) {
    const dep = queue.shift();
    if (visited.has(dep)) continue;
    visited.add(dep);
    const depEngine = getEngineOrNull(dep);
    if (depEngine) queue.push(...depEngine.dependencies);
  }
  return [...visited];
}

export function getDependents(engineId) {
  return [..._engines.values()].filter(e => e.dependencies.includes(engineId)).map(e => e.id);
}

// Topological sort — returns engines in execution order (deps before dependents)
export function topoSort(engineIds) {
  const visited = new Set(), sorted = [];

  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const e = getEngineOrNull(id);
    if (e) e.dependencies.filter(d => engineIds.includes(d)).forEach(visit);
    sorted.push(id);
  }

  engineIds.forEach(visit);
  return sorted;
}

export function updateStatus(engineId, status) {
  const e = _engines.get(engineId);
  if (e) { e.status = status; e.lastHealthCheck = new Date().toISOString(); }
}

export function registryStats() {
  const engines = listEngines();
  const capabilityIndex = {};
  engines.forEach(e => e.capabilities.forEach(c => {
    if (!capabilityIndex[c]) capabilityIndex[c] = [];
    capabilityIndex[c].push(e.id);
  }));
  return {
    totalEngines:     engines.length,
    healthy:          engines.filter(e => e.status === 'healthy').length,
    unhealthy:        engines.filter(e => e.status === 'unhealthy').length,
    unknown:          engines.filter(e => e.status === 'unknown').length,
    totalCapabilities: Object.keys(capabilityIndex).length,
    capabilityIndex,
  };
}
