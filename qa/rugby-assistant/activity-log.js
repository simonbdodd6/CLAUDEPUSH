/**
 * Activity log for the Rugby Coaching Assistant.
 *
 * Append-only JSONL: one event per line.
 * Reads are summarised into assistant-summary.json for Mission Control.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '../../');
const DATA_DIR = join(ROOT, 'qa/rugby-assistant/data');
const LOG_FILE = join(DATA_DIR, 'activity.jsonl');
const SUM_FILE = join(DATA_DIR, 'assistant-summary.json');

function ensureDir() { mkdirSync(DATA_DIR, { recursive: true }); }

export function logActivity(event) {
  ensureDir();
  appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n', 'utf8');
  rebuildSummary();
}

export function loadEvents() {
  if (!existsSync(LOG_FILE)) return [];
  return readFileSync(LOG_FILE, 'utf8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

export function rebuildSummary() {
  ensureDir();
  const events = loadEvents();

  const byType = {};
  const queryCounts = {};

  for (const e of events) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    if (e.query) queryCounts[e.query.toLowerCase()] = (queryCounts[e.query.toLowerCase()] || 0) + 1;
  }

  const popularTopics = Object.entries(queryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([query, count]) => ({ query, count }));

  const recentSearches = events
    .filter(e => e.type === 'query')
    .slice(-10)
    .reverse()
    .map(e => ({ query: e.query, ts: e.ts, ageGroup: e.ageGroup }));

  const summary = {
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,
    searchCount:      byType['query']       || 0,
    sessionCount:     byType['session']     || 0,
    drillSearchCount: byType['drill-query'] || 0,
    lawQueryCount:    byType['law-query']   || 0,
    recentSearches,
    popularTopics,
  };

  writeFileSync(SUM_FILE, JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}

export function readSummary() {
  if (!existsSync(SUM_FILE)) return null;
  try { return JSON.parse(readFileSync(SUM_FILE, 'utf8')); } catch { return null; }
}
