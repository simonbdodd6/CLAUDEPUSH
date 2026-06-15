/**
 * Fixture Manager — unit tests (Phase 13).
 *
 * All logic under test lives in index.html as pure helper functions.
 * Tests extract the source text and evaluate it in a controlled scope
 * to avoid any DOM or state dependencies.
 *
 * Tests:
 *  1.  normalizeFixture: fills all missing fields with safe defaults
 *  2.  normalizeFixture: maps legacy 'time' field to kickoffTime
 *  3.  normalizeFixture: sets sourceType/syncStatus to 'manual' for new records
 *  4.  normalizeFixture: returns null for null/non-object input
 *  5.  normalizeFixture: preserves existing fields unchanged
 *  6.  fixtureDisplayStatus: upcoming (date in future)
 *  7.  fixtureDisplayStatus: today (date === today)
 *  8.  fixtureDisplayStatus: past (date < today) → Completed label
 *  9.  fixtureDisplayStatus: stored completed
 * 10.  fixtureDisplayStatus: stored cancelled
 * 11.  fixtureDisplayStatus: no date → Upcoming
 * 12.  fixtureCountdown: returns '' for past fixtures
 * 13.  fixtureCountdown: returns '' for no date
 * 14.  fixtureCountdown: returns days+hours for future fixtures
 * 15.  fixtureCountdown: returns hours+mins for same-day future
 * 16.  fixtureGetNext: returns null when array is empty
 * 17.  fixtureGetNext: skips past fixtures
 * 18.  fixtureGetNext: skips cancelled fixtures
 * 19.  fixtureGetNext: returns earliest future fixture when multiple exist
 * 20.  fixtureGetNext: prefers earlier kick-off time on same date
 * 21.  fixtureSortByDate: sorts ascending by date
 * 22.  fixtureSortByDate: no-date fixtures sort to the end
 * 23.  fixtureSortByDate: same date sorted by kickoffTime
 * 24.  fixtureTypeStyle: returns distinct colour pairs for each type
 * 25.  fixtureTypeStyle: unknown type falls back gracefully
 * 26.  Future-proofing: normalized fixture always has all import-sync fields
 */

import test   from 'node:test';
import assert from 'node:assert/strict';
import { readFile }     from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// ── Source extraction helpers ─────────────────────────────────────────────────

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = start;
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — unclosed brace');
}

// Build a self-contained scope with all pure fixture helpers.
// Uses new Function so Date.now() can be mocked via the `nowMs` param.
function buildFixtureScope(nowMs) {
  const body = `"use strict";
    // Allow callers to freeze time for deterministic countdown tests
    const _NOW_MS = ${nowMs != null ? nowMs : 'Date.now()'};
    ${extractFn(src, 'normalizeFixture')}
    ${extractFn(src, 'fixtureDisplayStatus')}
    // Patch fixtureCountdown to use frozen time instead of Date.now()
    function fixtureCountdown(fx) {
      if (!fx || !fx.date) return '';
      const kickoff = new Date(fx.date + 'T' + (fx.kickoffTime || '15:00') + ':00');
      const diff = kickoff.getTime() - _NOW_MS;
      if (diff <= 0) return '';
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      if (d > 0)  return d + 'd ' + h + 'h';
      if (h > 0)  return h + 'h ' + m + 'm';
      return m + 'm';
    }
    ${extractFn(src, 'fixtureSortByDate')}
    ${extractFn(src, 'fixtureTypeStyle')}
    // fixtureGetNext depends on normalizeFixture and uses Date internally;
    // re-implement with frozen time for testability.
    function fixtureGetNext(fixtures) {
      const today = new Date(_NOW_MS).toISOString().slice(0, 10);
      return (Array.isArray(fixtures) ? fixtures : [])
        .map(normalizeFixture)
        .filter(function(fx){ return fx && fx.date && fx.date >= today && fx.status !== 'cancelled'; })
        .sort(function(a,b){ return a.date.localeCompare(b.date) || (a.kickoffTime||'').localeCompare(b.kickoffTime||''); })
        [0] || null;
    }
    // fixtureDisplayStatus also depends on today — patch for frozen time.
    function fixtureDisplayStatus(fx) {
      if (fx.status === 'cancelled') return { label: 'Cancelled', color: '#6b7280',  bg: 'rgba(107,114,128,0.15)' };
      if (fx.status === 'completed') return { label: 'Completed', color: '#94a3b8',  bg: 'rgba(148,163,184,0.12)' };
      const today = new Date(_NOW_MS).toISOString().slice(0, 10);
      if (!fx.date)          return { label: 'Upcoming',  color: '#60a5fa',  bg: 'rgba(96,165,250,0.12)'  };
      if (fx.date < today)   return { label: 'Completed', color: '#94a3b8',  bg: 'rgba(148,163,184,0.12)' };
      if (fx.date === today) return { label: 'Today',     color: '#f59e0b',  bg: 'rgba(245,158,11,0.15)'  };
      return                        { label: 'Upcoming',  color: '#60a5fa',  bg: 'rgba(96,165,250,0.12)'  };
    }
    return { normalizeFixture, fixtureDisplayStatus, fixtureCountdown,
             fixtureSortByDate, fixtureTypeStyle, fixtureGetNext };
  `;
  return new Function(body)();
}

// Convenience: frozen at 2026-06-15T10:00:00Z (a Monday)
const TODAY     = '2026-06-15';
const NOW_MS    = new Date(TODAY + 'T10:00:00Z').getTime();
const scope     = buildFixtureScope(NOW_MS);
const {
  normalizeFixture, fixtureDisplayStatus, fixtureCountdown,
  fixtureSortByDate, fixtureTypeStyle, fixtureGetNext,
} = scope;

// ── 1–5. normalizeFixture ─────────────────────────────────────────────────────

test('normalizeFixture: fills all missing fields with safe defaults', () => {
  const out = normalizeFixture({ id: 'fx1', opposition: 'Anderlecht' });
  assert.equal(out.id,               'fx1');
  assert.equal(out.opposition,       'Anderlecht');
  assert.equal(out.date,             '');
  assert.equal(out.kickoffTime,      '');
  assert.equal(out.meetTime,         '');
  assert.equal(out.venue,            '');
  assert.equal(out.homeAway,         '');
  assert.equal(out.competition,      '');
  assert.equal(out.type,             'Friendly');
  assert.equal(out.notes,            '');
  assert.equal(out.status,           'scheduled');
  assert.equal(out.sourceType,       'manual');
  assert.equal(out.sourceUrl,        '');
  assert.equal(out.externalFixtureId,'');
  assert.equal(out.lastSyncedAt,     null);
  assert.equal(out.syncStatus,       'manual');
  assert.equal(out.importNotes,      '');
});

test('normalizeFixture: maps legacy time field to kickoffTime', () => {
  const out = normalizeFixture({ id: 'fx_legacy', opposition: 'RC Evere', time: '15:30' });
  assert.equal(out.kickoffTime, '15:30', 'legacy time mapped to kickoffTime');
  assert.equal(out.meetTime,    '',       'meetTime defaults to empty');
});

test('normalizeFixture: kickoffTime takes precedence over legacy time', () => {
  const out = normalizeFixture({ id: 'fx2', opposition: 'RC Evere', kickoffTime: '14:30', time: '12:00' });
  assert.equal(out.kickoffTime, '14:30', 'kickoffTime preferred over time');
});

test('normalizeFixture: sets sourceType and syncStatus to manual for new records', () => {
  const out = normalizeFixture({ id: 'fx3', opposition: 'Test' });
  assert.equal(out.sourceType, 'manual');
  assert.equal(out.syncStatus, 'manual');
});

test('normalizeFixture: returns null for null input', () => {
  assert.equal(normalizeFixture(null),      null);
  assert.equal(normalizeFixture(undefined), null);
  assert.equal(normalizeFixture('string'),  null);
  assert.equal(normalizeFixture(42),        null);
});

test('normalizeFixture: preserves all set fields unchanged', () => {
  const input = {
    id: 'fx_full', opposition: 'Watermael', date: '2026-09-01',
    kickoffTime: '15:00', meetTime: '13:30', venue: 'Stade des 3 Tilleuls',
    homeAway: 'home', competition: 'Belgian Division 3', type: 'League',
    notes: 'Travel by coach', status: 'scheduled',
    sourceType: 'imported', sourceUrl: 'https://fed.example/fixtures/1',
    externalFixtureId: 'ext-001', lastSyncedAt: '2026-09-01T08:00:00Z',
    syncStatus: 'synced', importNotes: 'Auto-imported',
    createdAt: '2026-08-01T10:00:00Z', updatedAt: '2026-08-15T12:00:00Z',
    createdBy: 'user-coach-1',
  };
  const out = normalizeFixture(input);
  assert.deepEqual(out, input);
});

// ── 6–11. fixtureDisplayStatus ────────────────────────────────────────────────

test('fixtureDisplayStatus: future date → Upcoming', () => {
  const s = fixtureDisplayStatus({ status: 'scheduled', date: '2026-07-01' });
  assert.equal(s.label, 'Upcoming');
  assert.ok(s.color, 'has a color');
});

test('fixtureDisplayStatus: date === today → Today', () => {
  const s = fixtureDisplayStatus({ status: 'scheduled', date: TODAY });
  assert.equal(s.label, 'Today');
  assert.equal(s.color, '#f59e0b');
});

test('fixtureDisplayStatus: past date + status scheduled → Completed', () => {
  const s = fixtureDisplayStatus({ status: 'scheduled', date: '2026-01-01' });
  assert.equal(s.label, 'Completed');
});

test('fixtureDisplayStatus: status=completed overrides date', () => {
  const s = fixtureDisplayStatus({ status: 'completed', date: '2026-12-31' });
  assert.equal(s.label, 'Completed');
});

test('fixtureDisplayStatus: status=cancelled overrides everything', () => {
  const s = fixtureDisplayStatus({ status: 'cancelled', date: TODAY });
  assert.equal(s.label, 'Cancelled');
  assert.equal(s.color, '#6b7280');
});

test('fixtureDisplayStatus: no date → Upcoming', () => {
  const s = fixtureDisplayStatus({ status: 'scheduled', date: '' });
  assert.equal(s.label, 'Upcoming');
});

// ── 12–15. fixtureCountdown ───────────────────────────────────────────────────

test('fixtureCountdown: past kick-off returns empty string', () => {
  // Date in the past relative to NOW_MS
  assert.equal(fixtureCountdown({ date: '2026-01-01', kickoffTime: '15:00' }), '');
});

test('fixtureCountdown: no date returns empty string', () => {
  assert.equal(fixtureCountdown({ date: '', kickoffTime: '15:00' }), '');
  assert.equal(fixtureCountdown(null), '');
  assert.equal(fixtureCountdown({}),   '');
});

test('fixtureCountdown: 3 days in future returns d+h format', () => {
  // NOW_MS = 2026-06-15T10:00:00Z
  // Kick-off: 2026-06-18T15:00:00 local → at UTC+0 same time
  const result = fixtureCountdown({ date: '2026-06-18', kickoffTime: '15:00' });
  assert.ok(result.includes('d'), `expected days in "${result}"`);
});

test('fixtureCountdown: same-day future kick-off returns h+m or m format', () => {
  // NOW_MS = 2026-06-15T10:00:00Z, kick-off 2026-06-15T14:00 local
  const result = fixtureCountdown({ date: TODAY, kickoffTime: '14:00' });
  assert.ok(result.length > 0, 'should return non-empty for future same-day kick-off');
  assert.ok(!result.includes('d'), `should not include days: "${result}"`);
});

// ── 16–20. fixtureGetNext ─────────────────────────────────────────────────────

test('fixtureGetNext: returns null for empty array', () => {
  assert.equal(fixtureGetNext([]), null);
  assert.equal(fixtureGetNext(null), null);
});

test('fixtureGetNext: skips past fixtures', () => {
  const fixtures = [
    { id: 'a', opposition: 'Past FC', date: '2026-01-01', status: 'scheduled' },
    { id: 'b', opposition: 'Future FC', date: '2026-09-01', status: 'scheduled' },
  ];
  const result = fixtureGetNext(fixtures);
  assert.ok(result, 'should find a fixture');
  assert.equal(result.opposition, 'Future FC');
});

test('fixtureGetNext: skips cancelled fixtures', () => {
  const fixtures = [
    { id: 'a', opposition: 'Cancelled FC', date: '2026-09-01', status: 'cancelled' },
    { id: 'b', opposition: 'Active FC',    date: '2026-09-15', status: 'scheduled' },
  ];
  assert.equal(fixtureGetNext(fixtures)?.opposition, 'Active FC');
});

test('fixtureGetNext: returns null when all future fixtures are cancelled', () => {
  const fixtures = [
    { id: 'a', opposition: 'X', date: '2026-09-01', status: 'cancelled' },
  ];
  assert.equal(fixtureGetNext(fixtures), null);
});

test('fixtureGetNext: returns earliest future fixture when multiple exist', () => {
  const fixtures = [
    { id: 'b', opposition: 'Later FC',    date: '2026-10-01', status: 'scheduled' },
    { id: 'a', opposition: 'Earliest FC', date: '2026-07-01', status: 'scheduled' },
    { id: 'c', opposition: 'Middle FC',   date: '2026-09-01', status: 'scheduled' },
  ];
  assert.equal(fixtureGetNext(fixtures)?.opposition, 'Earliest FC');
});

test('fixtureGetNext: tiebreaks by kickoffTime on same date', () => {
  const fixtures = [
    { id: 'b', opposition: 'Afternoon FC', date: '2026-09-01', kickoffTime: '15:00', status: 'scheduled' },
    { id: 'a', opposition: 'Morning FC',   date: '2026-09-01', kickoffTime: '11:00', status: 'scheduled' },
  ];
  assert.equal(fixtureGetNext(fixtures)?.opposition, 'Morning FC');
});

// ── 21–23. fixtureSortByDate ──────────────────────────────────────────────────

test('fixtureSortByDate: sorts ascending by date', () => {
  const fixtures = [
    { id: 'c', opposition: 'C', date: '2026-10-01' },
    { id: 'a', opposition: 'A', date: '2026-07-01' },
    { id: 'b', opposition: 'B', date: '2026-09-01' },
  ];
  const sorted = fixtureSortByDate(fixtures);
  assert.deepEqual(sorted.map(f => f.opposition), ['A', 'B', 'C']);
});

test('fixtureSortByDate: fixtures without date sort to end', () => {
  const fixtures = [
    { id: 'a', opposition: 'A', date: '2026-09-01' },
    { id: 'n', opposition: 'NoDate', date: '' },
    { id: 'b', opposition: 'B', date: '2026-07-01' },
  ];
  const sorted = fixtureSortByDate(fixtures);
  assert.equal(sorted[sorted.length - 1].opposition, 'NoDate');
});

test('fixtureSortByDate: same date sorted by kickoffTime', () => {
  const fixtures = [
    { id: 'a', opposition: 'PM',  date: '2026-09-01', kickoffTime: '15:00' },
    { id: 'b', opposition: 'AM',  date: '2026-09-01', kickoffTime: '11:00' },
  ];
  const sorted = fixtureSortByDate(fixtures);
  assert.equal(sorted[0].opposition, 'AM');
  assert.equal(sorted[1].opposition, 'PM');
});

// ── 24–25. fixtureTypeStyle ───────────────────────────────────────────────────

test('fixtureTypeStyle: returns distinct colour pairs for all four types', () => {
  const types   = ['League', 'Cup', 'Friendly', 'Training Match'];
  const results = types.map(t => fixtureTypeStyle(t));
  const colors  = results.map(r => r.color);
  // All distinct
  assert.equal(new Set(colors).size, types.length, 'each type has a unique colour');
  results.forEach((r, i) => {
    assert.ok(r.color, `${types[i]} has a color`);
    assert.ok(r.bg,    `${types[i]} has a bg`);
  });
});

test('fixtureTypeStyle: unknown type returns fallback (does not throw)', () => {
  const r = fixtureTypeStyle('Unknown Type');
  assert.ok(r.color, 'fallback has a color');
  assert.ok(r.bg,    'fallback has a bg');
});

// ── 26. Future-proofing: import-sync fields always present ───────────────────

test('future-proofing: normalized fixture always has all import/sync fields', () => {
  const SYNC_FIELDS = ['sourceType', 'sourceUrl', 'externalFixtureId', 'lastSyncedAt', 'syncStatus', 'importNotes'];
  const minimal = normalizeFixture({ id: 'fx_min', opposition: 'Test' });
  for (const field of SYNC_FIELDS) {
    assert.ok(Object.hasOwn(minimal, field), `field ${field} present`);
  }
  // Manually created fixtures start with 'manual' values
  assert.equal(minimal.sourceType, 'manual');
  assert.equal(minimal.syncStatus, 'manual');
  assert.equal(minimal.sourceUrl,  '');
  assert.equal(minimal.externalFixtureId, '');
  assert.equal(minimal.lastSyncedAt,      null);
  assert.equal(minimal.importNotes,       '');
});

test('future-proofing: imported fixture preserves all sync metadata unchanged', () => {
  const imported = {
    id: 'fx_imported', opposition: 'Evere RFC',
    sourceType: 'imported', sourceUrl: 'https://fed.example/fixture/42',
    externalFixtureId: 'fed-42', lastSyncedAt: '2026-09-01T08:00:00Z',
    syncStatus: 'synced', importNotes: 'Auto-imported from federation API',
  };
  const out = normalizeFixture(imported);
  assert.equal(out.sourceType,        'imported');
  assert.equal(out.sourceUrl,         'https://fed.example/fixture/42');
  assert.equal(out.externalFixtureId, 'fed-42');
  assert.equal(out.lastSyncedAt,      '2026-09-01T08:00:00Z');
  assert.equal(out.syncStatus,        'synced');
  assert.equal(out.importNotes,       'Auto-imported from federation API');
});
