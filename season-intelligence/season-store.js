/**
 * Season Store
 *
 * JSONL snapshot persistence — one line per snapshot.
 * Compacts at 200 entries. Rolling window keeps last 52 weeks of data.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA  = join(__dir, 'data');
const FILE  = join(DATA, 'season-snapshots.jsonl');
const MAX   = 200;

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
    // Keep last 100 entries
    writeLines(lines.slice(-100));
  }
  appendFileSync(FILE, JSON.stringify(obj) + '\n', 'utf8');
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function saveSnapshot(snapshot) {
  appendLine({
    ts:           new Date().toISOString(),
    type:         'SEASON_SNAPSHOT',
    phase:        snapshot.phase,
    clubHealth:   snapshot.clubHealth?.overall ?? null,
    availability: snapshot.simulation?.current?.availability ?? null,
    attendance:   snapshot.simulation?.current?.attendance ?? null,
    injuryBurden: snapshot.simulation?.current?.injuryBurden ?? null,
    workload:     snapshot.simulation?.current?.workloadBalance ?? null,
    ...snapshot,
  });
}

export function loadSnapshots(limit = 52) {
  return readLines()
    .filter(l => l.type === 'SEASON_SNAPSHOT')
    .slice(-limit);
}

export function loadLatestSnapshot() {
  const snaps = loadSnapshots(1);
  return snaps[snaps.length - 1] ?? null;
}

export function getHealthTrend(weeks = 12) {
  const snaps = loadSnapshots(weeks);
  return snaps.map(s => ({
    ts:          s.ts,
    phase:       s.phase,
    clubHealth:  s.clubHealth,
    availability:s.availability,
    attendance:  s.attendance,
  }));
}
