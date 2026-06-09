// Platform Event Bus — lightweight pub/sub for engine-to-engine communication.
// Engines emit events; other engines subscribe without tight coupling.

import { appendFileSync } from 'fs';
import { dirname, join }  from 'path';
import { fileURLToPath }  from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH  = join(__dirname, '..', 'memory-engine', 'data', 'platform-events.jsonl');

// ── Event Type Registry ────────────────────────────────────────────────────────

export const EVENT_TYPES = {
  // Player
  PLAYER_CREATED:          'player.created',
  PLAYER_UPDATED:          'player.updated',
  PLAYER_INJURED:          'player.injured',
  PLAYER_CLEARED:          'player.cleared',
  PLAYER_ATTENDED:         'player.attended',
  PLAYER_ABSENT:           'player.absent',
  // Team
  TEAM_CREATED:            'team.created',
  TEAM_UPDATED:            'team.updated',
  TEAM_PLAYER_ADDED:       'team.player_added',
  TEAM_PLAYER_REMOVED:     'team.player_removed',
  // Session / Training
  SESSION_PLANNED:         'session.planned',
  SESSION_COMPLETED:       'session.completed',
  SESSION_CANCELLED:       'session.cancelled',
  // Fixture / Match
  FIXTURE_CREATED:         'fixture.created',
  FIXTURE_RESULT_RECORDED: 'fixture.result_recorded',
  // Communications
  COMMUNICATION_DRAFTED:   'communication.drafted',
  COMMUNICATION_APPROVED:  'communication.approved',
  COMMUNICATION_SENT:      'communication.sent',
  COMMUNICATION_FAILED:    'communication.failed',
  // Workflow
  WORKFLOW_STARTED:        'workflow.started',
  WORKFLOW_COMPLETED:      'workflow.completed',
  WORKFLOW_FAILED:         'workflow.failed',
  WORKFLOW_STEP_DONE:      'workflow.step_done',
  // Approval
  APPROVAL_REQUESTED:      'approval.requested',
  APPROVAL_APPROVED:       'approval.approved',
  APPROVAL_REJECTED:       'approval.rejected',
  // Knowledge
  KNOWLEDGE_QUERIED:       'knowledge.queried',
  KNOWLEDGE_INDEXED:       'knowledge.indexed',
  // Platform
  ENGINE_REGISTERED:       'platform.engine_registered',
  ENGINE_HEALTH_CHANGED:   'platform.engine_health_changed',
  PLATFORM_STARTED:        'platform.started',
  PIPELINE_COMPLETED:      'platform.pipeline_completed',
};

// ── Event Bus ──────────────────────────────────────────────────────────────────

const _handlers  = new Map();   // type → Set<handler>
const _wildcard  = new Set();   // * handlers
const _history   = [];          // ring buffer MAX 2000
const MAX_HIST   = 2000;

export function on(type, handler) {
  if (type === '*') { _wildcard.add(handler); return () => _wildcard.delete(handler); }
  if (!_handlers.has(type)) _handlers.set(type, new Set());
  _handlers.get(type).add(handler);
  return () => off(type, handler);
}

export function once(type, handler) {
  const wrapped = (event) => { handler(event); off(type, wrapped); };
  return on(type, wrapped);
}

export function off(type, handler) {
  if (type === '*') _wildcard.delete(handler);
  else _handlers.get(type)?.delete(handler);
}

export function emit(type, payload = {}, source = 'platform') {
  const event = {
    eventId:   `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    source,
    payload,
    emittedAt: new Date().toISOString(),
  };

  // Ring buffer
  _history.push(event);
  if (_history.length > MAX_HIST) _history.shift();

  // JSONL log (async, non-blocking)
  try { appendFileSync(LOG_PATH, JSON.stringify(event) + '\n', 'utf8'); } catch { /* non-fatal */ }

  // Dispatch to type handlers
  const typeHandlers = _handlers.get(type);
  if (typeHandlers) for (const h of typeHandlers) { try { h(event); } catch { /* non-fatal */ } }

  // Dispatch to wildcard handlers
  for (const h of _wildcard) { try { h(event); } catch { /* non-fatal */ } }

  return event;
}

// ── Convenience emitters ───────────────────────────────────────────────────────

export const events = new Proxy({}, {
  get(_, type) {
    return (payload, source) => emit(type, payload, source);
  },
});

// ── History ────────────────────────────────────────────────────────────────────

export function getRecentEvents(n = 20)                   { return [..._history].reverse().slice(0, n); }
export function getEventsByType(type, n = 50)             { return _history.filter(e => e.type === type).slice(-n); }
export function getEventsBySource(source, n = 50)         { return _history.filter(e => e.source === source).slice(-n); }

export function eventStats() {
  const byType = {};
  _history.forEach(e => { byType[e.type] = (byType[e.type] ?? 0) + 1; });
  return { total: _history.length, byType, handlers: _handlers.size, wildcards: _wildcard.size };
}
