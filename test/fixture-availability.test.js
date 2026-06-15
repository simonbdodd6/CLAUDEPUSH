/**
 * Phase 18 — Fixture Availability & Match Week Intelligence.
 *
 * Tests for all pure functions added in Phase 18:
 *   positionSlotNumber, fixtureCountdownDays,
 *   fixturePositionWarnings, fixtureAvailabilitySummary
 *
 * Tests:
 *  1.  positionSlotNumber: null player → null
 *  2.  positionSlotNumber: 'SUB — Squad player' → null
 *  3.  positionSlotNumber: '10 — Fly half' → '10'
 *  4.  positionSlotNumber: '1' → '1'
 *  5.  positionSlotNumber: primaryPosition preferred over position
 *  6.  positionSlotNumber: '3 — Tighthead Prop' → '3'
 *  7.  positionSlotNumber: empty string → null
 *  8.  fixtureCountdownDays: null date → null
 *  9.  fixtureCountdownDays: today → 0
 * 10.  fixtureCountdownDays: tomorrow → 1
 * 11.  fixtureCountdownDays: 7 days ahead → 7
 * 12.  fixtureCountdownDays: past date → negative
 * 13.  fixturePositionWarnings: no players → many critical warnings
 * 14.  fixturePositionWarnings: no hooker → critical hooker warning
 * 15.  fixturePositionWarnings: no scrum-half → critical
 * 16.  fixturePositionWarnings: no fly-half → critical
 * 17.  fixturePositionWarnings: only 2 front row → critical
 * 18.  fixturePositionWarnings: fewer than 15 available → critical squad warning
 * 19.  fixturePositionWarnings: 15–21 available → warning about short bench
 * 20.  fixturePositionWarnings: full 22+ → no squad warning
 * 21.  fixtureAvailabilitySummary: empty state → all zeros
 * 22.  fixtureAvailabilitySummary: 3 players, 2 available → correct counts
 * 23.  fixtureAvailabilitySummary: availPct correct
 * 24.  fixtureAvailabilitySummary: missingReplies excludes responded players
 * 25.  fixtureAvailabilitySummary: archived players excluded from total
 * 26.  fixtureAvailabilitySummary: responded count excludes no-reply
 * 27.  fixtureAvailabilitySummary: warnings propagated from fixturePositionWarnings
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
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
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
  const start  = source.indexOf(marker);
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

// ── Scope builder ─────────────────────────────────────────────────────────────

function buildScope({ players = [], fixtureAvailability = {}, fixtures = [] } = {}) {
  const stateObj = { players, fixtureAvailability, fixtures };

  const body =
    '"use strict";\n' +
    'const state = ' + JSON.stringify(stateObj) + ';\n' +
    // Phase 17 deps (needed by activeRosterPlayers)
    extractConst(html, 'PLAYER_LIFECYCLE_LABELS') + '\n' +
    extractFn(html, 'playerIsArchived') + '\n' +
    extractFn(html, 'activeRosterPlayers') + '\n' +
    // Phase 18 constants & functions
    extractConst(html, 'FIXTURE_AVAIL_STATES') + '\n' +
    extractConst(html, 'POSITION_GROUPS') + '\n' +
    extractConst(html, 'POSITION_GROUP_SLOTS') + '\n' +
    extractFn(html, 'positionSlotNumber') + '\n' +
    extractFn(html, 'fixtureCountdownDays') + '\n' +
    extractFn(html, 'fixturePositionWarnings') + '\n' +
    extractFn(html, 'fixtureAvailabilitySummary') + '\n' +
    'return { positionSlotNumber, fixtureCountdownDays, fixturePositionWarnings, fixtureAvailabilitySummary };\n';

  return new Function(body)();
}

// ── 1–7. positionSlotNumber ───────────────────────────────────────────────────

test('positionSlotNumber: null player → null', () => {
  const { positionSlotNumber } = buildScope();
  assert.equal(positionSlotNumber(null), null);
});

test('positionSlotNumber: SUB position → null', () => {
  const { positionSlotNumber } = buildScope();
  assert.equal(positionSlotNumber({ position: 'SUB' }), null);
  assert.equal(positionSlotNumber({ position: 'SUB — Squad player' }), null);
});

test('positionSlotNumber: "10 — Fly half" → "10"', () => {
  const { positionSlotNumber } = buildScope();
  assert.equal(positionSlotNumber({ position: '10 — Fly half' }), '10');
});

test('positionSlotNumber: bare number string → that number', () => {
  const { positionSlotNumber } = buildScope();
  assert.equal(positionSlotNumber({ position: '1' }), '1');
  assert.equal(positionSlotNumber({ position: '15' }), '15');
});

test('positionSlotNumber: primaryPosition preferred over position', () => {
  const { positionSlotNumber } = buildScope();
  assert.equal(positionSlotNumber({ position: '10', primaryPosition: '9' }), '9');
});

test('positionSlotNumber: primaryPosition with label suffix', () => {
  const { positionSlotNumber } = buildScope();
  assert.equal(positionSlotNumber({ primaryPosition: '3 — Tighthead Prop' }), '3');
});

test('positionSlotNumber: empty position string → null', () => {
  const { positionSlotNumber } = buildScope();
  assert.equal(positionSlotNumber({ position: '' }), null);
  assert.equal(positionSlotNumber({}), null);
});

// ── 8–12. fixtureCountdownDays ────────────────────────────────────────────────

test('fixtureCountdownDays: null date → null', () => {
  const { fixtureCountdownDays } = buildScope();
  assert.equal(fixtureCountdownDays(null), null);
  assert.equal(fixtureCountdownDays(''), null);
  assert.equal(fixtureCountdownDays(undefined), null);
});

test('fixtureCountdownDays: today → 0', () => {
  const { fixtureCountdownDays } = buildScope();
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(fixtureCountdownDays(today), 0);
});

test('fixtureCountdownDays: tomorrow → 1', () => {
  const { fixtureCountdownDays } = buildScope();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  assert.equal(fixtureCountdownDays(tomorrow), 1);
});

test('fixtureCountdownDays: 7 days ahead → 7', () => {
  const { fixtureCountdownDays } = buildScope();
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  assert.equal(fixtureCountdownDays(future), 7);
});

test('fixtureCountdownDays: past date → negative', () => {
  const { fixtureCountdownDays } = buildScope();
  const past = '2020-01-01';
  const days = fixtureCountdownDays(past);
  assert.ok(days < 0, 'past date should return negative number');
});

// ── 13–20. fixturePositionWarnings ────────────────────────────────────────────

test('fixturePositionWarnings: no available players → has critical warnings', () => {
  const { fixturePositionWarnings } = buildScope();
  const warnings = fixturePositionWarnings({}, []);
  assert.ok(warnings.length > 0, 'should have warnings with no players');
  assert.ok(warnings.some(w => w.severity === 'critical'), 'should include critical warnings with 0 players');
});

test('fixturePositionWarnings: no hooker available → critical warning', () => {
  const { fixturePositionWarnings } = buildScope();
  // 15 players available, none are position 2 (hooker)
  const players = Array.from({ length: 15 }, (_, i) => ({ id: 'p' + i, position: '1' }));
  const availMap = Object.fromEntries(players.map(p => [p.id, 'available']));
  const warnings = fixturePositionWarnings(availMap, players);
  const hookerWarn = warnings.find(w => w.message.includes('hooker'));
  assert.ok(hookerWarn, 'should warn about missing hooker');
  assert.equal(hookerWarn.severity, 'critical');
});

test('fixturePositionWarnings: no scrum-half → critical', () => {
  const { fixturePositionWarnings } = buildScope();
  const players = [{ id: 'p1', position: '10' }];
  const availMap = { p1: 'available' };
  const warnings = fixturePositionWarnings(availMap, players);
  assert.ok(warnings.some(w => w.message.includes('scrum-half')), 'missing scrum-half warning expected');
});

test('fixturePositionWarnings: no fly-half → critical', () => {
  const { fixturePositionWarnings } = buildScope();
  const players = [{ id: 'p1', position: '9' }];
  const availMap = { p1: 'available' };
  const warnings = fixturePositionWarnings(availMap, players);
  assert.ok(warnings.some(w => w.message.includes('fly-half')), 'missing fly-half warning expected');
});

test('fixturePositionWarnings: only 2 front row → critical', () => {
  const { fixturePositionWarnings } = buildScope();
  const players = [
    { id: 'p1', position: '1' },
    { id: 'p2', position: '2' },
  ];
  const availMap = { p1: 'available', p2: 'available' };
  const warnings = fixturePositionWarnings(availMap, players);
  assert.ok(warnings.some(w => w.message.includes('front row')), 'front row warning expected');
  const frWarn = warnings.find(w => w.message.includes('front row'));
  assert.equal(frWarn.severity, 'critical');
});

test('fixturePositionWarnings: fewer than 15 available → critical squad warning', () => {
  const { fixturePositionWarnings } = buildScope();
  const players = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + i }));
  const availMap = Object.fromEntries(players.map(p => [p.id, 'available']));
  const warnings = fixturePositionWarnings(availMap, players);
  assert.ok(warnings.some(w => w.group === 'Squad' && w.severity === 'critical'), 'squad critical warning expected');
});

test('fixturePositionWarnings: 15–21 available → warning (short bench)', () => {
  const { fixturePositionWarnings } = buildScope();
  const players = Array.from({ length: 18 }, (_, i) => ({ id: 'p' + i }));
  const availMap = Object.fromEntries(players.map(p => [p.id, 'available']));
  const warnings = fixturePositionWarnings(availMap, players);
  const squadWarn = warnings.find(w => w.group === 'Squad');
  assert.ok(squadWarn, 'squad warning expected');
  assert.equal(squadWarn.severity, 'warning');
  assert.ok(squadWarn.message.includes('bench'), 'short bench message expected');
});

test('fixturePositionWarnings: 22 available → no squad warning', () => {
  const { fixturePositionWarnings } = buildScope();
  const players = Array.from({ length: 22 }, (_, i) => ({ id: 'p' + i }));
  const availMap = Object.fromEntries(players.map(p => [p.id, 'available']));
  const warnings = fixturePositionWarnings(availMap, players);
  assert.ok(!warnings.some(w => w.group === 'Squad'), 'no squad warning with 22 available');
});

// ── 21–27. fixtureAvailabilitySummary ────────────────────────────────────────

test('fixtureAvailabilitySummary: no players, empty state → all zeros', () => {
  const { fixtureAvailabilitySummary } = buildScope({ players: [], fixtureAvailability: {} });
  const s = fixtureAvailabilitySummary('fx1', []);
  assert.equal(s.total, 0);
  assert.equal(s.available, 0);
  assert.equal(s.unavailable, 0);
  assert.equal(s.maybe, 0);
  assert.equal(s.noReply, 0);
  assert.equal(s.responded, 0);
  assert.equal(s.availPct, 0);
});

test('fixtureAvailabilitySummary: 3 players, 2 available, 1 no-reply', () => {
  const players = [
    { id: 'p1', lifecycleStatus: 'active' },
    { id: 'p2', lifecycleStatus: 'active' },
    { id: 'p3', lifecycleStatus: 'active' },
  ];
  const fixtureAvailability = { fx1: { p1: 'available', p2: 'available' } };
  const { fixtureAvailabilitySummary } = buildScope({ players, fixtureAvailability });
  const s = fixtureAvailabilitySummary('fx1', players);
  assert.equal(s.total, 3);
  assert.equal(s.available, 2);
  assert.equal(s.unavailable, 0);
  assert.equal(s.maybe, 0);
  assert.equal(s.noReply, 1);
});

test('fixtureAvailabilitySummary: availPct is rounded percentage', () => {
  const players = [
    { id: 'p1', lifecycleStatus: 'active' },
    { id: 'p2', lifecycleStatus: 'active' },
    { id: 'p3', lifecycleStatus: 'active' },
  ];
  const fixtureAvailability = { fx1: { p1: 'available', p2: 'available' } };
  const { fixtureAvailabilitySummary } = buildScope({ players, fixtureAvailability });
  const s = fixtureAvailabilitySummary('fx1', players);
  assert.equal(s.availPct, 67); // Math.round(100 * 2/3) = 67
});

test('fixtureAvailabilitySummary: missingReplies only includes no-reply players', () => {
  const players = [
    { id: 'p1', lifecycleStatus: 'active' },
    { id: 'p2', lifecycleStatus: 'active' },
    { id: 'p3', lifecycleStatus: 'active' },
  ];
  const fixtureAvailability = { fx1: { p1: 'available', p2: 'unavailable' } };
  const { fixtureAvailabilitySummary } = buildScope({ players, fixtureAvailability });
  const s = fixtureAvailabilitySummary('fx1', players);
  assert.equal(s.missingReplies.length, 1);
  assert.equal(s.missingReplies[0].id, 'p3');
});

test('fixtureAvailabilitySummary: archived players excluded from total', () => {
  const players = [
    { id: 'p1', lifecycleStatus: 'active' },
    { id: 'p2', lifecycleStatus: 'archived' },
  ];
  const fixtureAvailability = { fx1: { p1: 'available', p2: 'available' } };
  const { fixtureAvailabilitySummary } = buildScope({ players, fixtureAvailability });
  const s = fixtureAvailabilitySummary('fx1', players);
  assert.equal(s.total, 1, 'archived player must not count in total');
  assert.equal(s.available, 1);
});

test('fixtureAvailabilitySummary: responded count = total - noReply', () => {
  const players = [
    { id: 'p1', lifecycleStatus: 'active' },
    { id: 'p2', lifecycleStatus: 'active' },
    { id: 'p3', lifecycleStatus: 'active' },
    { id: 'p4', lifecycleStatus: 'active' },
  ];
  const fixtureAvailability = {
    fx1: { p1: 'available', p2: 'maybe', p3: 'unavailable' }
    // p4 has no entry → no-reply
  };
  const { fixtureAvailabilitySummary } = buildScope({ players, fixtureAvailability });
  const s = fixtureAvailabilitySummary('fx1', players);
  assert.equal(s.responded, 3);
  assert.equal(s.noReply, 1);
});

test('fixtureAvailabilitySummary: warnings array included in result', () => {
  const players = [];
  const { fixtureAvailabilitySummary } = buildScope({ players, fixtureAvailability: {} });
  const s = fixtureAvailabilitySummary('fx1', players);
  assert.ok(Array.isArray(s.warnings), 'warnings should be an array');
});
