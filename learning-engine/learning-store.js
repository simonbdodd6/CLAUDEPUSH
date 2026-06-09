/**
 * Learning Store
 *
 * Three JSONL files, all append-only with rolling compaction:
 *   data/outcomes.jsonl     — one line per recommendation outcome
 *   data/feedback.jsonl     — one line per monthly feedback snapshot
 *   data/club-profile.jsonl — one line per club profile update (latest wins)
 *
 * Compaction: outcomes at 500, feedback at 50, profile retains last 10.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir   = dirname(fileURLToPath(import.meta.url));
const DATA    = join(__dir, 'data');
const OUTCOMES = join(DATA, 'outcomes.jsonl');
const FEEDBACK = join(DATA, 'feedback.jsonl');
const PROFILE  = join(DATA, 'club-profile.jsonl');

mkdirSync(DATA, { recursive: true });

function readFile(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function writeFile(path, lines) {
  writeFileSync(path, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
}

function appendTo(path, obj, maxLines = 500) {
  const lines = readFile(path);
  if (lines.length >= maxLines) writeFile(path, lines.slice(-Math.floor(maxLines / 2)));
  appendFileSync(path, JSON.stringify(obj) + '\n', 'utf8');
}

// ── Outcome store ──────────────────────────────────────────────────────────────

export function saveOutcome(outcome) {
  appendTo(OUTCOMES, { ...outcome, savedAt: new Date().toISOString() }, 500);
}

export function loadOutcomes(limit = 200) {
  return readFile(OUTCOMES).slice(-limit);
}

export function loadOutcomesByType(type) {
  return readFile(OUTCOMES).filter(o => o.recommendationType === type);
}

export function loadOutcomesByPeriod(yearMonth) {
  return readFile(OUTCOMES).filter(o => (o.savedAt ?? o.outcomeTs ?? '').startsWith(yearMonth));
}

export function loadPendingOutcomes() {
  return readFile(OUTCOMES).filter(o => !o.predictionCorrect && o.predictionCorrect !== false);
}

// ── Feedback store ────────────────────────────────────────────────────────────

export function saveFeedback(feedback) {
  appendTo(FEEDBACK, { ...feedback, savedAt: new Date().toISOString() }, 50);
}

export function loadFeedback(limit = 12) {
  return readFile(FEEDBACK).slice(-limit);
}

export function loadLatestFeedback() {
  const all = readFile(FEEDBACK);
  return all[all.length - 1] ?? null;
}

// ── Club profile store ────────────────────────────────────────────────────────

export function saveClubProfile(profile) {
  appendTo(PROFILE, { ...profile, updatedAt: new Date().toISOString() }, 20);
}

export function loadClubProfile() {
  const all = readFile(PROFILE);
  return all[all.length - 1] ?? null;
}

export function profileExists() {
  return existsSync(PROFILE) && readFile(PROFILE).length > 0;
}
