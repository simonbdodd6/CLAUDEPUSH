/**
 * Data Registry
 *
 * Central registry of all available club data sources.
 * Adapters self-register on import.
 * Every AI engine queries the registry before deciding what data to request.
 */

import { SENSITIVITY, ADAPTER_STATUS } from './data-source.js';

const _registry = new Map();   // name → DataSource

// ── Registration ──────────────────────────────────────────────────────────────

export function registerDataSource(descriptor) {
  if (!descriptor?.name) throw new Error('DataSource must have a name');
  if (!descriptor?.fetch && descriptor.adapterStatus === ADAPTER_STATUS.LIVE) {
    throw new Error(`Live DataSource '${descriptor.name}' must provide a fetch function`);
  }
  _registry.set(descriptor.name, descriptor);
}

export function getDataSource(name) {
  return _registry.get(name) ?? null;
}

export function hasDataSource(name) {
  return _registry.has(name);
}

export function getAllDataSources() {
  return [..._registry.values()];
}

// ── Queries on the registry itself ───────────────────────────────────────────

/**
 * All sources accessible to a given role.
 */
export function getAvailableData(role = 'public') {
  const roleRank = ROLE_RANK[role] ?? 0;
  const sources  = [..._registry.values()].filter(s => {
    const reqRank = ROLE_RANK[s.requiredRole] ?? 0;
    return roleRank >= reqRank;
  });
  return {
    role,
    totalSources: sources.length,
    liveCount:    sources.filter(s => s.adapterStatus === ADAPTER_STATUS.LIVE).length,
    mockCount:    sources.filter(s => s.adapterStatus === ADAPTER_STATUS.MOCK).length,
    stubCount:    sources.filter(s => s.adapterStatus === ADAPTER_STATUS.STUB || s.adapterStatus === ADAPTER_STATUS.PLANNED).length,
    sources:      sources.map(s => ({
      name:          s.name,
      type:          s.type,
      description:   s.description,
      sensitivity:   s.sensitivity,
      adapterStatus: s.adapterStatus,
      isMock:        s.isMock,
      recordCount:   null,   // filled by health check
      tags:          s.tags ?? [],
    })),
  };
}

/**
 * Sources with no real data (stub or planned) — tells AI what's missing.
 */
export function getMissingData() {
  const missing = [..._registry.values()].filter(
    s => s.adapterStatus === ADAPTER_STATUS.STUB || s.adapterStatus === ADAPTER_STATUS.PLANNED
  );
  return {
    count: missing.length,
    sources: missing.map(s => ({
      name:              s.name,
      type:              s.type,
      description:       s.description,
      adapterStatus:     s.adapterStatus,
      plannedConnection: s.realConnection,
      impact:            describeImpact(s),
    })),
  };
}

/**
 * Sources filtered by type.
 */
export function getSourcesByType(type) {
  return [..._registry.values()].filter(s => s.type === type);
}

/**
 * Sources that can be used for a specific AI intent.
 * Maps common intents to relevant data source types.
 */
export function getSourcesForIntent(intent) {
  const intentMap = {
    player_analysis:  ['player', 'attendance', 'coaching'],
    injury_check:     ['player', 'coaching'],
    session_create:   ['player', 'team', 'attendance', 'coaching'],
    club_overview:    ['player', 'team', 'financial', 'operational', 'commercial'],
    financial_review: ['financial', 'commercial'],
    attendance_check: ['attendance', 'player'],
    fixture_lookup:   ['operational'],
    communication:    ['communication', 'player'],
    market_research:  ['commercial', 'operational'],
  };

  const types = intentMap[intent] ?? [];
  return [..._registry.values()].filter(s => types.includes(s.type));
}

/**
 * Registry stats (used by CLI and reports).
 */
export function registryStats() {
  const sources = [..._registry.values()];
  const byType  = {};
  const byStatus = {};

  for (const s of sources) {
    byType[s.type]   = (byType[s.type]   ?? 0) + 1;
    byStatus[s.adapterStatus] = (byStatus[s.adapterStatus] ?? 0) + 1;
  }

  return {
    totalSources: sources.length,
    byType,
    byStatus,
    liveCount:    byStatus.live    ?? 0,
    mockCount:    byStatus.mock    ?? 0,
    stubCount:    (byStatus.stub   ?? 0) + (byStatus.planned ?? 0),
    sourceNames:  sources.map(s => s.name),
  };
}

// ── Role rank ─────────────────────────────────────────────────────────────────

export const ROLE_RANK = {
  public:  0,
  player:  1,
  coach:   2,
  manager: 3,
  admin:   4,
  dor:     5,
};

function describeImpact(source) {
  const impacts = {
    'finance':     'AI cannot report on club finances without real data',
    'bar-sales':   'AI cannot report on bar revenue without POS integration',
    'membership':  'AI cannot track member growth without live membership data',
    'fixtures':    'AI cannot prepare match-day sessions without fixture data',
    'events':      'AI cannot plan around events without calendar integration',
    'media':       'AI cannot reference match footage or photos',
    'messages':    'AI cannot personalise communications without message history',
  };
  return impacts[source.name] ?? `AI may produce incomplete analysis without ${source.name} data`;
}
