/**
 * Phase 14 — Squad Selection Board: pure function unit tests.
 *
 * All tested functions are extracted from index.html via extractFn and run
 * in an isolated scope with frozen state so tests are deterministic and fast.
 *
 * Tests:
 *  1.  normalizeSquadSelection: fills all default fields
 *  2.  normalizeSquadSelection: preserves supplied fields
 *  3.  normalizeSquadSelection: bench defaults to 8 empty slots
 *  4.  normalizeSquadSelection: null/invalid input returns null
 *  5.  normalizeSquadSelection: future-proofing fields always present
 *  6.  selectionStarterCount: counts filled slots only
 *  7.  selectionStarterCount: empty starters = 0
 *  8.  selectionStarterCount: null sel = 0
 *  9.  selectionBenchCount: counts non-empty bench entries
 * 10.  selectionBenchCount: all-empty bench = 0
 * 11.  selectionPlayerCount: starters + bench combined
 * 12.  selectionGetPlayerStatus: identifies starter with correct slot
 * 13.  selectionGetPlayerStatus: identifies bench player with correct jersey
 * 14.  selectionGetPlayerStatus: not-selected for absent player
 * 15.  selectionGetPlayerStatus: returns not-selected for missing playerId
 * 16.  selectionAvailColor: available → green
 * 17.  selectionAvailColor: unavailable → red
 * 18.  selectionAvailColor: injured → red
 * 19.  selectionAvailColor: no-reply → grey
 * 20.  selectionAvailColor: null player → grey
 * 21.  selectionFindForFixture: prefers published over draft
 * 22.  selectionFindForFixture: returns most-recent draft when no published
 * 23.  selectionFindForFixture: returns null when no selections match
 * 24.  normalizeSquadSelection bench: slices to 8 if longer
 * 25.  normalizeSquadSelection starters: accepts object with slot keys
 */

import test   from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let parenDepth = 0;
  while (i < source.length) {
    if (source[i] === '(') parenDepth++;
    if (source[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
    i++;
  }
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — could not find closing brace');
}

function extractConst(source, name) {
  const marker = '    const ' + name + ' = ';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('const ' + name + ' not found');
  let i = start + marker.length;
  while (i < source.length && (source[i] === ' ' || source[i] === '\n')) i++;
  const opener = source[i];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (closer) {
    let depth = 0;
    while (i < source.length) {
      if (source[i] === opener) depth++;
      else if (source[i] === closer) { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
  } else {
    while (i < source.length && source[i] !== ';') i++;
    i++;
  }
  if (i < source.length && source[i] === ';') i++;
  return source.slice(start, i);
}

// Build a deterministic scope for all pure squad-selection functions.
function buildSelScope(overrides = {}) {
  const rugbySlots = [
    ["1",24,81],["2",50,83],["3",76,81],
    ["4",36,68],["5",64,68],
    ["6",18,56],["8",50,55],["7",82,56],
    ["9",37,42],["10",64,36],
    ["11",13,24],["12",39,25],["13",62,21],["14",87,24],["15",50,11],
  ];

  const fixtures = overrides.fixtures || [];
  const squadSelections = overrides.squadSelections || [];

  const body = `"use strict";
    const rugbySlots = ${JSON.stringify(rugbySlots)};
    const state = { fixtures: ${JSON.stringify(fixtures)}, squadSelections: ${JSON.stringify(squadSelections)}, players: [] };
    ${extractConst(html, 'SEL_POSITION_NAMES')}
    ${extractFn(html, 'normalizeSquadSelection')}
    ${extractFn(html, 'selectionStarterCount')}
    ${extractFn(html, 'selectionBenchCount')}
    ${extractFn(html, 'selectionPlayerCount')}
    ${extractFn(html, 'selectionGetPlayerStatus')}
    ${extractFn(html, 'selectionAvailColor')}
    ${extractFn(html, 'selectionFindForFixture')}
    return {
      normalizeSquadSelection,
      selectionStarterCount,
      selectionBenchCount,
      selectionPlayerCount,
      selectionGetPlayerStatus,
      selectionAvailColor,
      selectionFindForFixture,
    };
  `;
  return new Function(body)();
}

// ── 1–5. normalizeSquadSelection ──────────────────────────────────────────────

test('normalizeSquadSelection: fills all default fields when input is empty object', () => {
  const { normalizeSquadSelection } = buildSelScope();
  const result = normalizeSquadSelection({});
  assert.equal(result.id,           '');
  assert.equal(result.fixtureId,    '');
  assert.equal(result.name,         '');
  assert.equal(result.status,       'draft');
  assert.deepEqual(result.starters, {});
  assert.equal(result.bench.length, 8);
  assert.ok(result.bench.every(s => s === ''), 'bench slots default to empty string');
  assert.equal(result.captainId,    '');
  assert.equal(result.viceCaptainId,'');
  assert.equal(result.publishedAt,  null);
  assert.equal(result.sourceType,   'manual');
});

test('normalizeSquadSelection: preserves supplied id, fixtureId, name, status', () => {
  const { normalizeSquadSelection } = buildSelScope();
  const result = normalizeSquadSelection({
    id: 'sel_abc', fixtureId: 'fx_1', name: 'vs Anderlecht', status: 'published',
  });
  assert.equal(result.id,        'sel_abc');
  assert.equal(result.fixtureId, 'fx_1');
  assert.equal(result.name,      'vs Anderlecht');
  assert.equal(result.status,    'published');
});

test('normalizeSquadSelection: bench defaults to 8 empty strings when missing', () => {
  const { normalizeSquadSelection } = buildSelScope();
  const result = normalizeSquadSelection({ id: 'x' });
  assert.equal(result.bench.length, 8);
  assert.deepEqual(result.bench, ['','','','','','','','']);
});

test('normalizeSquadSelection: returns null for null/falsy input', () => {
  const { normalizeSquadSelection } = buildSelScope();
  assert.equal(normalizeSquadSelection(null),      null);
  assert.equal(normalizeSquadSelection(undefined), null);
  assert.equal(normalizeSquadSelection(42),        null);
  assert.equal(normalizeSquadSelection('string'),  null);
});

test('normalizeSquadSelection: future-proofing fields always present', () => {
  const { normalizeSquadSelection } = buildSelScope();
  const result = normalizeSquadSelection({ id: 'x' });
  assert.ok('sourceType'          in result, 'sourceType present');
  assert.ok('aiRecommendationId'  in result, 'aiRecommendationId present');
  assert.ok('approvalStatus'      in result, 'approvalStatus present');
  assert.ok('collaboratorIds'     in result, 'collaboratorIds present');
  assert.equal(result.sourceType,         'manual');
  assert.equal(result.aiRecommendationId, null);
  assert.equal(result.approvalStatus,     null);
  assert.deepEqual(result.collaboratorIds, []);
});

// ── 6–8. selectionStarterCount ────────────────────────────────────────────────

test('selectionStarterCount: counts only filled slots', () => {
  const { selectionStarterCount } = buildSelScope();
  const sel = { starters: { '1': 'p1', '2': 'p2', '10': 'p10' }, bench: [] };
  assert.equal(selectionStarterCount(sel), 3);
});

test('selectionStarterCount: empty starters object = 0', () => {
  const { selectionStarterCount } = buildSelScope();
  assert.equal(selectionStarterCount({ starters: {}, bench: [] }), 0);
});

test('selectionStarterCount: null sel = 0', () => {
  const { selectionStarterCount } = buildSelScope();
  assert.equal(selectionStarterCount(null), 0);
  assert.equal(selectionStarterCount(undefined), 0);
});

// ── 9–10. selectionBenchCount ─────────────────────────────────────────────────

test('selectionBenchCount: counts non-empty bench entries', () => {
  const { selectionBenchCount } = buildSelScope();
  const sel = { bench: ['p1', '', 'p3', '', '', '', '', ''] };
  assert.equal(selectionBenchCount(sel), 2);
});

test('selectionBenchCount: all-empty bench = 0', () => {
  const { selectionBenchCount } = buildSelScope();
  assert.equal(selectionBenchCount({ bench: ['','','','','','','',''] }), 0);
});

// ── 11. selectionPlayerCount ──────────────────────────────────────────────────

test('selectionPlayerCount: returns starters + bench', () => {
  const { selectionPlayerCount } = buildSelScope();
  const sel = {
    starters: { '1':'p1', '2':'p2', '9':'p9', '10':'p10' },
    bench:    ['b1','b2','','','','','',''],
  };
  assert.equal(selectionPlayerCount(sel), 6);
});

// ── 12–15. selectionGetPlayerStatus ──────────────────────────────────────────

test('selectionGetPlayerStatus: identifies starter with correct slot', () => {
  const { selectionGetPlayerStatus } = buildSelScope();
  const sel = { starters: { '9': 'p-scrumhalf' }, bench: [] };
  const result = selectionGetPlayerStatus(sel, 'p-scrumhalf');
  assert.equal(result.status, 'starter');
  assert.equal(result.slot,   '9');
});

test('selectionGetPlayerStatus: identifies bench player with jersey number', () => {
  const { selectionGetPlayerStatus } = buildSelScope();
  const sel = { starters: {}, bench: ['', 'p-bench', '', '', '', '', '', ''] };
  const result = selectionGetPlayerStatus(sel, 'p-bench');
  assert.equal(result.status, 'bench');
  assert.equal(result.slot,   '17');  // index 1 → jersey 17
});

test('selectionGetPlayerStatus: not-selected for absent player', () => {
  const { selectionGetPlayerStatus } = buildSelScope();
  const sel = { starters: { '1': 'p1' }, bench: ['p16','','','','','','',''] };
  const result = selectionGetPlayerStatus(sel, 'p-other');
  assert.equal(result.status, 'not-selected');
  assert.equal(result.slot,   null);
});

test('selectionGetPlayerStatus: not-selected when playerId is empty', () => {
  const { selectionGetPlayerStatus } = buildSelScope();
  const sel = { starters: { '1': 'p1' }, bench: [] };
  assert.equal(selectionGetPlayerStatus(sel, '').status, 'not-selected');
  assert.equal(selectionGetPlayerStatus(null, 'p1').status, 'not-selected');
});

// ── 16–20. selectionAvailColor ───────────────────────────────────────────────

test('selectionAvailColor: available → green', () => {
  const { selectionAvailColor } = buildSelScope();
  assert.equal(selectionAvailColor({ game: 'available' }),   '#34d399');
});

test('selectionAvailColor: unavailable → red', () => {
  const { selectionAvailColor } = buildSelScope();
  assert.equal(selectionAvailColor({ game: 'unavailable' }), '#f87171');
});

test('selectionAvailColor: injured → red', () => {
  const { selectionAvailColor } = buildSelScope();
  assert.equal(selectionAvailColor({ game: 'injured' }),     '#f87171');
});

test('selectionAvailColor: no-reply → grey', () => {
  const { selectionAvailColor } = buildSelScope();
  assert.equal(selectionAvailColor({ game: 'no-reply' }),    '#94a3b8');
  assert.equal(selectionAvailColor({}),                      '#94a3b8');
});

test('selectionAvailColor: null player → grey', () => {
  const { selectionAvailColor } = buildSelScope();
  assert.equal(selectionAvailColor(null), '#94a3b8');
});

// ── 21–23. selectionFindForFixture ───────────────────────────────────────────

test('selectionFindForFixture: prefers published over draft', () => {
  const sels = [
    { id: 's1', fixtureId: 'fx_1', status: 'draft',     updatedAt: '2026-06-10T10:00:00Z' },
    { id: 's2', fixtureId: 'fx_1', status: 'published', updatedAt: '2026-06-11T10:00:00Z' },
  ];
  const { selectionFindForFixture } = buildSelScope({ squadSelections: sels });
  const result = selectionFindForFixture('fx_1');
  assert.equal(result.id,     's2');
  assert.equal(result.status, 'published');
});

test('selectionFindForFixture: returns most-recently-updated draft when no published', () => {
  const sels = [
    { id: 's1', fixtureId: 'fx_2', status: 'draft', updatedAt: '2026-06-09T00:00:00Z' },
    { id: 's2', fixtureId: 'fx_2', status: 'draft', updatedAt: '2026-06-11T00:00:00Z' },
    { id: 's3', fixtureId: 'fx_2', status: 'draft', updatedAt: '2026-06-08T00:00:00Z' },
  ];
  const { selectionFindForFixture } = buildSelScope({ squadSelections: sels });
  const result = selectionFindForFixture('fx_2');
  assert.equal(result.id, 's2');
});

test('selectionFindForFixture: returns null when no selections match fixture', () => {
  const sels = [{ id: 's1', fixtureId: 'fx_99', status: 'draft', updatedAt: '' }];
  const { selectionFindForFixture } = buildSelScope({ squadSelections: sels });
  assert.equal(selectionFindForFixture('fx_other'), null);
  assert.equal(selectionFindForFixture(''),         null);
});

// ── 24–25. Edge cases ─────────────────────────────────────────────────────────

test('normalizeSquadSelection bench: slices to first 8 if array is longer', () => {
  const { normalizeSquadSelection } = buildSelScope();
  const longBench = ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10'];
  const result = normalizeSquadSelection({ bench: longBench });
  assert.equal(result.bench.length, 8);
  assert.equal(result.bench[0], 'p1');
  assert.equal(result.bench[7], 'p8');
});

test('normalizeSquadSelection starters: accepts object with slot keys', () => {
  const { normalizeSquadSelection } = buildSelScope();
  const starters = { '1': 'p1', '9': 'p9', '15': 'p15' };
  const result = normalizeSquadSelection({ starters });
  assert.deepEqual(result.starters, starters);
});
