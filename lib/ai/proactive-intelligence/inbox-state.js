import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, 'data');
const DEFAULT_FILE = join(DATA_DIR, 'executive-inbox.jsonl');
const MAX_LINES = 1000;

export const INBOX_STATUS = {
  UNREAD: 'UNREAD',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  DISMISSED: 'DISMISSED',
  ACTED_ON: 'ACTED_ON',
  SNOOZED: 'SNOOZED',
};

mkdirSync(DATA_DIR, { recursive: true });

function readEvents(file = DEFAULT_FILE) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function appendEvent(event, file = DEFAULT_FILE) {
  const events = readEvents(file);
  if (events.length >= MAX_LINES) {
    writeFileSync(file, compactEvents(events).map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  }
  appendFileSync(file, JSON.stringify({ ...event, ts: event.ts ?? new Date().toISOString() }) + '\n', 'utf8');
}

function compactEvents(events) {
  const records = replayEvents(events, { includeResolved: true });
  return records.map(briefing => ({
    id: briefing.id,
    event: 'snapshot',
    patch: briefing,
    ts: new Date().toISOString(),
  }));
}

export function replayEvents(events, options = {}) {
  const { includeResolved = true } = options;
  const map = new Map();

  for (const event of events) {
    const current = map.get(event.id) ?? {};
    map.set(event.id, { ...current, ...event.patch, id: event.id });
  }

  const now = Date.now();
  return [...map.values()]
    .filter(item => {
      if (includeResolved) return true;
      if ([INBOX_STATUS.DISMISSED, INBOX_STATUS.ACTED_ON].includes(item.status)) return false;
      if (item.status === INBOX_STATUS.SNOOZED && item.snoozedUntil && new Date(item.snoozedUntil).getTime() > now) return false;
      return true;
    })
    .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0) || new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0));
}

export function saveBriefings(briefings, options = {}) {
  const { file = DEFAULT_FILE } = options;
  const existing = new Set(loadInbox({ file, includeResolved: true }).map(b => b.dedupeKey ?? b.id));
  const saved = [];

  for (const briefing of briefings) {
    const key = briefing.dedupeKey ?? briefing.id;
    if (existing.has(key)) continue;
    appendEvent({
      id: briefing.id,
      event: 'created',
      patch: { ...briefing, status: briefing.status ?? INBOX_STATUS.UNREAD },
    }, file);
    existing.add(key);
    saved.push(briefing);
  }

  return saved;
}

export function loadInbox(options = {}) {
  const { file = DEFAULT_FILE, includeResolved = true } = options;
  return replayEvents(readEvents(file), { includeResolved });
}

export function updateBriefingStatus(id, status, options = {}) {
  const { file = DEFAULT_FILE, snoozedUntil = null, note = null } = options;
  if (!Object.values(INBOX_STATUS).includes(status)) {
    throw new Error(`Unsupported executive inbox status: ${status}`);
  }

  const patch = {
    status,
    updatedAt: new Date().toISOString(),
    ...(status === INBOX_STATUS.ACKNOWLEDGED ? { acknowledgedAt: new Date().toISOString() } : {}),
    ...(status === INBOX_STATUS.DISMISSED ? { dismissedAt: new Date().toISOString() } : {}),
    ...(status === INBOX_STATUS.ACTED_ON ? { actedOnAt: new Date().toISOString() } : {}),
    ...(status === INBOX_STATUS.SNOOZED ? { snoozedUntil } : {}),
    ...(note ? { statusNote: note } : {}),
  };

  appendEvent({ id, event: 'status_updated', patch }, file);
  return loadInbox({ file, includeResolved: true }).find(b => b.id === id) ?? null;
}

export function clearInboxForTest(file) {
  if (!file) return;
  writeFileSync(file, '', 'utf8');
}

