// Communication audit log — ring buffer + optional JSONL persistence
// Tracks every send attempt so the engine never double-sends.

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR   = join(__dirname, '../memory-engine/data');
const LOG_FILE  = join(LOG_DIR, 'communication-history.jsonl');
const MAX_ENTRIES = 5000;

const _log = [];

export const COMM_EVENTS = {
  SCHEDULED:   'comm.scheduled',
  SENT:        'comm.sent',
  FAILED:      'comm.failed',
  CANCELLED:   'comm.cancelled',
  OPENED:      'comm.opened',
  BOUNCED:     'comm.bounced',
};

function persist(entry) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* non-fatal */ }
}

export function logCommunication(event, details = {}) {
  const entry = {
    entryId:     randomUUID(),
    event,
    type:        details.type        ?? null,
    recipientId: details.recipientId ?? null,
    audienceType:details.audienceType ?? null,
    channel:     details.channel     ?? null,
    subject:     details.subject     ?? null,
    batchId:     details.batchId     ?? null,
    scheduledFor:details.scheduledFor ?? null,
    error:       details.error       ?? null,
    ts:          new Date().toISOString(),
    ...details,
  };
  _log.push(entry);
  if (_log.length > MAX_ENTRIES) _log.splice(0, _log.length - MAX_ENTRIES);
  persist(entry);
  return entry;
}

export function logSent(details)      { return logCommunication(COMM_EVENTS.SENT,      details); }
export function logFailed(details)    { return logCommunication(COMM_EVENTS.FAILED,    details); }
export function logScheduled(details) { return logCommunication(COMM_EVENTS.SCHEDULED, details); }
export function logCancelled(details) { return logCommunication(COMM_EVENTS.CANCELLED, details); }

export function getRecipientHistory(recipientId) {
  return _log.filter(e => e.recipientId === recipientId)
             .sort((a, b) => b.ts.localeCompare(a.ts));
}

export function getBatchHistory(batchId) {
  return _log.filter(e => e.batchId === batchId);
}

export function getRecentHistory(n = 50) {
  return _log.slice(-n).reverse();
}

export function getTypeHistory(type) {
  return _log.filter(e => e.type === type).slice(-100);
}

// Returns true if this recipient was sent this type within the given window.
export function hasRecentlySent(recipientId, type, withinHours = 24) {
  const cutoff = Date.now() - withinHours * 60 * 60 * 1000;
  return _log.some(e =>
    e.event === COMM_EVENTS.SENT &&
    e.recipientId === recipientId &&
    e.type === type &&
    new Date(e.ts).getTime() > cutoff
  );
}

export function getHistoryStats() {
  const byType    = {};
  const byChannel = {};
  const byEvent   = {};
  let failures = 0;

  for (const e of _log) {
    byType[e.type]       = (byType[e.type]       ?? 0) + 1;
    byChannel[e.channel] = (byChannel[e.channel] ?? 0) + 1;
    byEvent[e.event]     = (byEvent[e.event]      ?? 0) + 1;
    if (e.event === COMM_EVENTS.FAILED) failures++;
  }

  return {
    total:          _log.length,
    sent:           byEvent[COMM_EVENTS.SENT]      ?? 0,
    scheduled:      byEvent[COMM_EVENTS.SCHEDULED] ?? 0,
    failed:         failures,
    byType,
    byChannel,
    successRate:    _log.length > 0 ? Math.round(((byEvent[COMM_EVENTS.SENT] ?? 0) / _log.length) * 100) : 100,
  };
}
