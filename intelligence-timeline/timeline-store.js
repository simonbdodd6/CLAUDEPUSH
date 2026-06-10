/**
 * Intelligence Timeline — JSONL Store
 *
 * Persistence layer following the season-intelligence JSONL pattern.
 * One event per line. Compacts at MAX_EVENTS, keeping the most recent entries.
 * All writes are synchronous (same pattern as season-store).
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const DATA   = join(__dir, 'data');
const FILE   = join(DATA, 'timeline.jsonl');
const MAX_EVENTS = 500;

mkdirSync(DATA, { recursive: true });

// ── Read ──────────────────────────────────────────────────────────────────────

export function readAll() {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// ── Write ─────────────────────────────────────────────────────────────────────

function writeAll(events) {
  writeFileSync(FILE, events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
}

export function append(event) {
  const all = readAll();
  all.push(event);
  if (all.length > MAX_EVENTS) {
    // Keep newest MAX_EVENTS entries
    writeAll(all.slice(-MAX_EVENTS));
  } else {
    appendFileSync(FILE, JSON.stringify(event) + '\n', 'utf8');
  }
}

export function appendBatch(events) {
  const all = readAll();
  const combined = [...all, ...events];
  const trimmed = combined.length > MAX_EVENTS ? combined.slice(-MAX_EVENTS) : combined;
  writeAll(trimmed);
}

// ── Update ────────────────────────────────────────────────────────────────────

export function updateEvent(id, patch) {
  const all = readAll();
  const idx = all.findIndex(e => e.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  writeAll(all);
  return all[idx];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isEmpty() {
  return !existsSync(FILE) || readAll().length === 0;
}

export function count() {
  return readAll().length;
}
