/**
 * Recommendation State Store
 *
 * Append-only JSONL file at autonomous-assistant/data/recommendations.jsonl
 * Each line is one state-change event: { id, event, patch, ts }
 * On read, we replay all events to get current state per recommendation.
 *
 * Compacts at 300 lines.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const DATA   = join(__dir, 'data');
const FILE   = join(DATA, 'recommendations.jsonl');
const MAX    = 300;

mkdirSync(DATA, { recursive: true });

function readLines() {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function writeLines(lines) {
  writeFileSync(FILE, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
}

function appendLine(obj) {
  const lines = readLines();
  if (lines.length >= MAX) {
    const compacted = compact(lines);
    writeLines(compacted);
  }
  appendFileSync(FILE, JSON.stringify(obj) + '\n', 'utf8');
}

function compact(lines) {
  const map = new Map();
  for (const line of lines) {
    const cur = map.get(line.id) ?? {};
    map.set(line.id, { ...cur, ...line.patch, id: line.id, type: line.type ?? cur.type });
  }
  return [...map.values()].map(rec => ({ id: rec.id, type: rec.type, event: 'snapshot', patch: rec, ts: new Date().toISOString() }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export function saveRecommendation(rec) {
  appendLine({ id: rec.id, type: rec.type, event: 'created', patch: rec, ts: new Date().toISOString() });
}

export function updateRecommendation(id, patch) {
  appendLine({ id, type: patch.type, event: 'updated', patch, ts: new Date().toISOString() });
}

export function dismissRecommendation(id) {
  appendLine({ id, event: 'dismissed', patch: { state: 'DISMISSED', dismissedAt: new Date().toISOString() }, ts: new Date().toISOString() });
}

export function snoozeRecommendation(id, until) {
  appendLine({ id, event: 'snoozed', patch: { state: 'SNOOZED', snoozedUntil: until }, ts: new Date().toISOString() });
}

export function resolveRecommendation(id) {
  appendLine({ id, event: 'resolved', patch: { state: 'RESOLVED', resolvedAt: new Date().toISOString() }, ts: new Date().toISOString() });
}

export function loadAllRecommendations() {
  const lines = readLines();
  const map   = new Map();
  for (const line of lines) {
    const cur = map.get(line.id) ?? {};
    map.set(line.id, { ...cur, ...line.patch, id: line.id });
  }
  return [...map.values()];
}

export function loadActiveRecommendations() {
  const all = loadAllRecommendations();
  const now = Date.now();
  return all.filter(r => {
    if (r.state === 'DISMISSED' || r.state === 'RESOLVED') return false;
    if (r.state === 'SNOOZED' && r.snoozedUntil && new Date(r.snoozedUntil).getTime() > now) return false;
    return true;
  });
}
