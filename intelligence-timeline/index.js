/**
 * Intelligence Timeline
 *
 * Gives the AI Brain memory over time.
 *
 * Every recommendation produced by any Intelligence engine is converted into
 * a timeline event and persisted. The timeline can be filtered by team,
 * player, fixture, season phase, category, priority, and status — making it
 * the single source of truth for what the AI Brain has observed and recommended
 * over the club's lifetime.
 *
 * Boundary:
 *   - This module writes to its own JSONL store (intelligence-timeline/data/)
 *   - It never imports from Coach's Eye Core
 *   - Core reads the timeline via /api/intelligence/timeline — it never writes to it
 *   - Intelligence engines call appendFromRecommendations() after generating recs
 */

import { randomUUID } from 'crypto';
import { readAll, append, appendBatch, updateEvent, isEmpty } from './timeline-store.js';
import { buildSeedEvents } from './timeline-seed.js';

// ── Lifecycle constants ───────────────────────────────────────────────────────

export const STATUS = {
  NEW:          'new',
  ACKNOWLEDGED: 'acknowledged',
  COMPLETED:    'completed',
  IGNORED:      'ignored',
};

// ── Seed ──────────────────────────────────────────────────────────────────────

let _seeded = false;

function ensureSeeded() {
  if (_seeded) return;
  _seeded = true;
  if (isEmpty()) {
    appendBatch(buildSeedEvents());
  }
}

// ── Append ────────────────────────────────────────────────────────────────────

/**
 * Convert recommendation engine output into timeline events and persist them.
 *
 * @param {object[]} recommendations - Output of recommendation-engine generate()
 * @param {object}   ctx             - The same context passed to generate()
 * @param {string}   engine          - Name of the calling engine (default: 'recommendation-engine')
 */
export function appendFromRecommendations(recommendations, ctx = {}, engine = 'recommendation-engine') {
  ensureSeeded();

  // Extract relationship dimensions from context
  const teamId        = ctx.fixture?.teamId    ?? ctx.teamId    ?? null;
  const teamName      = ctx.fixture?.teamName  ?? ctx.teamName  ?? null;
  const fixtureId     = ctx.fixture?.id        ?? null;
  const fixtureSummary = ctx.fixture
    ? `vs ${ctx.fixture.opponent ?? 'Unknown'} — ${ctx.fixture.competition ?? 'Fixture'}`
    : null;
  const seasonPhase   = ctx.seasonPhase?.phase ?? null;

  const events = recommendations.map(r => ({
    id:               randomUUID(),
    timestamp:        new Date().toISOString(),
    engine,
    recommendationId: r.id,
    category:         r.category,
    priority:         r.priority,
    confidence:       r.confidence,
    title:            r.title,
    description:      r.description,
    explanation:      r.explainability,
    action:           r.action,
    source:           r.source,
    status:           STATUS.NEW,
    acknowledgedAt:   null,
    completedAt:      null,
    ignoredAt:        null,
    notes:            null,
    // Relationship dimensions
    teamId,
    teamName,
    // Per-recommendation: extract player if title references one
    playerId:         r._playerId   ?? null,
    playerName:       r._playerName ?? null,
    fixtureId,
    fixtureSummary,
    seasonPhase,
  }));

  appendBatch(events);
  return events;
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Return filtered timeline events, newest first.
 *
 * Supported filters:
 *   teamId        — exact match
 *   teamName      — case-insensitive substring
 *   playerId      — exact match
 *   playerName    — case-insensitive substring
 *   fixtureId     — exact match
 *   seasonPhase   — exact match (PRE_SEASON | COMPETITIVE | POST_SEASON | OFF_SEASON)
 *   category      — exact match or array of categories
 *   priority      — exact match or array (HIGH | MEDIUM | LOW)
 *   status        — exact match or array (new | acknowledged | completed | ignored)
 *   engine        — exact match
 *   source        — exact match
 *   from          — ISO date string (inclusive)
 *   to            — ISO date string (inclusive)
 *   limit         — max results (default 50)
 *   offset        — pagination offset (default 0)
 */
export function getTimeline(filters = {}) {
  ensureSeeded();

  const {
    teamId, teamName,
    playerId, playerName,
    fixtureId,
    seasonPhase,
    category, priority, status,
    engine, source,
    from, to,
    limit = 50,
    offset = 0,
  } = filters;

  const fromTs = from ? new Date(from).getTime() : null;
  const toTs   = to   ? new Date(to).getTime()   : null;

  function matchesArray(val, filter) {
    if (!filter) return true;
    return Array.isArray(filter) ? filter.includes(val) : val === filter;
  }

  const all = readAll()
    .filter(e => {
      if (teamId     && e.teamId    !== teamId)                                    return false;
      if (teamName   && !e.teamName?.toLowerCase().includes(teamName.toLowerCase())) return false;
      if (playerId   && e.playerId   !== playerId)                                  return false;
      if (playerName && !e.playerName?.toLowerCase().includes(playerName.toLowerCase())) return false;
      if (fixtureId  && e.fixtureId  !== fixtureId)                                return false;
      if (seasonPhase && e.seasonPhase !== seasonPhase)                            return false;
      if (!matchesArray(e.category, category))   return false;
      if (!matchesArray(e.priority, priority))   return false;
      if (!matchesArray(e.status, status))       return false;
      if (engine && e.engine !== engine)         return false;
      if (source && e.source !== source)         return false;
      if (fromTs && new Date(e.timestamp).getTime() < fromTs) return false;
      if (toTs   && new Date(e.timestamp).getTime() > toTs)   return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const total   = all.length;
  const page    = all.slice(offset, offset + limit);

  return {
    events: page,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

// ── Status lifecycle ──────────────────────────────────────────────────────────

/**
 * Update the lifecycle status of a timeline event.
 *
 * @param {string} id     - Timeline event ID
 * @param {string} status - 'acknowledged' | 'completed' | 'ignored'
 * @param {string} [notes]
 */
export function updateStatus(id, newStatus, notes = null) {
  ensureSeeded();

  const now  = new Date().toISOString();
  const patch = { status: newStatus, notes: notes ?? undefined };

  if (newStatus === STATUS.ACKNOWLEDGED) patch.acknowledgedAt = now;
  if (newStatus === STATUS.COMPLETED)    { patch.acknowledgedAt = patch.acknowledgedAt ?? now; patch.completedAt = now; }
  if (newStatus === STATUS.IGNORED)      patch.ignoredAt = now;

  return updateEvent(id, patch);
}

// ── Summary stats ─────────────────────────────────────────────────────────────

/**
 * Return aggregate statistics for the timeline (or a filtered subset).
 */
export function summarise(filters = {}) {
  ensureSeeded();

  const { events } = getTimeline({ ...filters, limit: 10000 });

  const byCategory = {};
  const byPriority = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const byStatus   = { new: 0, acknowledged: 0, completed: 0, ignored: 0 };
  const byEngine   = {};

  for (const e of events) {
    byCategory[e.category]          = (byCategory[e.category] ?? 0) + 1;
    byPriority[e.priority]          = (byPriority[e.priority]  ?? 0) + 1;
    byStatus[e.status]              = (byStatus[e.status]       ?? 0) + 1;
    byEngine[e.engine]              = (byEngine[e.engine]       ?? 0) + 1;
  }

  const completed    = events.filter(e => e.status === STATUS.COMPLETED);
  const highPriority = events.filter(e => e.priority === 'HIGH');
  const openHigh     = highPriority.filter(e => e.status === STATUS.NEW).length;

  // Acknowledge rate = events that were not ignored / total events
  const actioned = (byStatus.acknowledged + byStatus.completed);
  const actionRate = events.length > 0 ? Math.round((actioned / events.length) * 100) : 0;

  return {
    total:        events.length,
    byCategory,
    byPriority,
    byStatus,
    byEngine,
    openHighPriority: openHigh,
    actionRate,
    oldest:       events.at(-1)?.timestamp ?? null,
    newest:       events[0]?.timestamp     ?? null,
  };
}

// ── Filter helpers (exposed for the API route) ────────────────────────────────

export const FILTER_KEYS = [
  'teamId', 'teamName', 'playerId', 'playerName',
  'fixtureId', 'seasonPhase', 'category', 'priority',
  'status', 'engine', 'source', 'from', 'to', 'limit', 'offset',
];

export function parseFilters(query) {
  const out = {};
  for (const key of FILTER_KEYS) {
    const val = query[key];
    if (val == null) continue;
    // Support comma-separated multi-values for category, priority, status
    if (['category', 'priority', 'status'].includes(key) && val.includes(',')) {
      out[key] = val.split(',').map(v => v.trim());
    } else if (key === 'limit' || key === 'offset') {
      const n = parseInt(val, 10);
      if (!isNaN(n)) out[key] = n;
    } else {
      out[key] = val;
    }
  }
  return out;
}
