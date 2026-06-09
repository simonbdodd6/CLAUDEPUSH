/**
 * Fixture Store
 *
 * Lightweight file-based persistence for fixture entities.
 * Each fixture is stored as an individual JSON file in fixture-engine/data/fixtures/.
 * An index JSONL provides fast lookup by teamId and status.
 *
 * No database required. Designed to be migration-compatible with PostgreSQL.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir       = dirname(fileURLToPath(import.meta.url));
const DATA_DIR    = join(__dir, 'data');
const FIXTURE_DIR = join(DATA_DIR, 'fixtures');

function ensureDirs() {
  mkdirSync(FIXTURE_DIR, { recursive: true });
}
ensureDirs();

// ── Read / Write ──────────────────────────────────────────────────────────────

export function saveFixture(fixture) {
  ensureDirs();
  fixture.updatedAt = new Date().toISOString();
  writeFileSync(join(FIXTURE_DIR, `${fixture.id}.json`), JSON.stringify(fixture, null, 2), 'utf8');
  return fixture;
}

export function getFixture(id) {
  const path = join(FIXTURE_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export function deleteFixture(id) {
  const path = join(FIXTURE_DIR, `${id}.json`);
  if (existsSync(path)) unlinkSync(path);
}

// ── List / Query ──────────────────────────────────────────────────────────────

export function listAllFixtures() {
  ensureDirs();
  return readdirSync(FIXTURE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')); } catch { return null; }
    })
    .filter(Boolean);
}

export function listFixturesByTeam(teamId) {
  return listAllFixtures().filter(f => f.teamId === teamId);
}

export function listFixturesByStatus(status) {
  return listAllFixtures().filter(f => f.status === status);
}

export function listUpcomingFixtures(limit = 10) {
  const now = Date.now();
  return listAllFixtures()
    .filter(f => f.kickoff && new Date(f.kickoff).getTime() > now && f.status !== 'cancelled' && f.status !== 'postponed')
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
    .slice(0, limit);
}

export function listRecentFixtures(limit = 5) {
  const now = Date.now();
  return listAllFixtures()
    .filter(f => f.kickoff && new Date(f.kickoff).getTime() <= now)
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))
    .slice(0, limit);
}

export function getNextFixture(teamId) {
  const now = Date.now();
  return listAllFixtures()
    .filter(f => f.teamId === teamId && f.kickoff && new Date(f.kickoff).getTime() > now && f.status !== 'cancelled')
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0] ?? null;
}

export function fixtureCount() {
  ensureDirs();
  return readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.json')).length;
}

// ── Bulk operations ───────────────────────────────────────────────────────────

export function clearAllFixtures() {
  ensureDirs();
  for (const f of readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.json'))) {
    unlinkSync(join(FIXTURE_DIR, f));
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function fixtureStats() {
  const all = listAllFixtures();
  const completed = all.filter(f => f.status === 'completed');
  const wins   = completed.filter(f => f.result?.status === 'win').length;
  const losses = completed.filter(f => f.result?.status === 'loss').length;
  const draws  = completed.filter(f => f.result?.status === 'draw').length;

  return {
    total:     all.length,
    scheduled: all.filter(f => f.status === 'scheduled').length,
    preparing: all.filter(f => f.status === 'preparing').length,
    completed: completed.length,
    cancelled: all.filter(f => f.status === 'cancelled').length,
    wins, losses, draws,
    winRate:   completed.length > 0 ? Math.round((wins / completed.length) * 100) : null,
  };
}
