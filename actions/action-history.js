// Coach's Eye Action Library — Execution history (ring buffer + JSONL persistence)

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '..', 'memory-engine', 'data');
const HIST_FILE = join(DATA_DIR, 'action-history.jsonl');
const MAX_IN_MEMORY = 500;

const _history = [];

export function logAction(entry) {
  const record = {
    historyId:   `ah-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    actionId:    entry.actionId,
    actionName:  entry.actionName,
    category:    entry.category,
    role:        entry.role ?? 'unknown',
    params:      entry.params ?? {},
    success:     entry.success ?? true,
    summary:     (entry.summary ?? '').slice(0, 200),
    durationMs:  entry.durationMs ?? 0,
    executedAt:  entry.executedAt ?? new Date().toISOString(),
    error:       entry.error ?? null,
  };

  _history.push(record);
  if (_history.length > MAX_IN_MEMORY) _history.shift();

  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    appendFileSync(HIST_FILE, JSON.stringify(record) + '\n', 'utf8');
  } catch { /* non-fatal */ }

  return record;
}

export function getHistory(n = 20) {
  return _history.slice(-Math.abs(n)).reverse();
}

export function getHistoryByAction(actionId) {
  return _history.filter(h => h.actionId === actionId).reverse();
}

export function getHistoryByCategory(category) {
  return _history.filter(h => h.category === category).reverse();
}

export function getHistoryByRole(role) {
  return _history.filter(h => h.role === role).reverse();
}

export function historyStats() {
  const total     = _history.length;
  const byAction  = {};
  const byRole    = {};
  const byCategory = {};
  let   successes = 0;
  let   totalMs   = 0;

  _history.forEach(h => {
    byAction[h.actionId]    = (byAction[h.actionId] ?? 0) + 1;
    byRole[h.role]          = (byRole[h.role] ?? 0) + 1;
    byCategory[h.category]  = (byCategory[h.category] ?? 0) + 1;
    if (h.success) successes++;
    totalMs += h.durationMs;
  });

  return {
    total,
    successes,
    failures:       total - successes,
    avgDurationMs:  total > 0 ? Math.round(totalMs / total) : 0,
    byAction,
    byRole,
    byCategory,
  };
}

export function clearHistory() {
  _history.length = 0;
}
