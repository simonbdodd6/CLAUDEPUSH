import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

function extractConst(name) {
  const pattern = new RegExp(`const ${name}\\s*=\\s*\\{([^}]*?)\\}`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Const ${name} not found`);
  return m[0];
}

function buildScope(stateOverride) {
  const fns = ['matchComputeScore', 'normalizeMatchDayNotes', 'matchEventsSummary', 'matchKey'];
  // Only extract object-literal consts (arrays need different regex)
  const consts = ['MATCH_EVENT_TYPES', 'MATCH_POINT_VALUES', 'MATCH_EVENT_ICONS',
                  'MATCH_STATUS_LABELS', 'MATCH_NOTES_LABELS'];
  // Array consts — extracted as-is from source
  const arrayConsts = [
    'const MATCH_NOTES_SECTIONS = [\'attack\',\'defence\',\'setPiece\',\'discipline\',\'referee\',\'general\'];',
  ];

  const constSrcs = consts.map(extractConst).join(';\n') + ';\n' + arrayConsts.join('\n');
  const fnSrcs    = fns.map(extractFn).join('\n');
  const stateJson = JSON.stringify(stateOverride || { matchCentre: {}, matchEvents: {}, matchStatus: {} });

  const body = `
    "use strict";
    ${constSrcs};
    let state = ${stateJson};
    ${fnSrcs}
    return { matchComputeScore, normalizeMatchDayNotes, matchEventsSummary, matchKey };
  `;
  return new Function(body)();
}

// ── matchComputeScore ────────────────────────────────────────────────────────

test('matchComputeScore: empty events → 0–0', () => {
  const scope = buildScope();
  const r = scope.matchComputeScore([]);
  assert.deepEqual(r, { us: 0, them: 0 });
});

test('matchComputeScore: null events → 0–0', () => {
  const scope = buildScope();
  const r = scope.matchComputeScore(null);
  assert.deepEqual(r, { us: 0, them: 0 });
});

test('matchComputeScore: try = 5 points', () => {
  const scope = buildScope();
  const r = scope.matchComputeScore([{ type: 'try', team: 'us' }]);
  assert.equal(r.us, 5);
  assert.equal(r.them, 0);
});

test('matchComputeScore: conversion = 2 points', () => {
  const scope = buildScope();
  const r = scope.matchComputeScore([{ type: 'conversion', team: 'us' }]);
  assert.equal(r.us, 2);
});

test('matchComputeScore: penalty = 3 points', () => {
  const scope = buildScope();
  const r = scope.matchComputeScore([{ type: 'penalty', team: 'them' }]);
  assert.equal(r.them, 3);
  assert.equal(r.us, 0);
});

test('matchComputeScore: dropGoal = 3 points', () => {
  const scope = buildScope();
  const r = scope.matchComputeScore([{ type: 'dropGoal', team: 'us' }]);
  assert.equal(r.us, 3);
});

test('matchComputeScore: non-scoring events add no points', () => {
  const scope = buildScope();
  const events = [
    { type: 'yellowCard',  team: 'us' },
    { type: 'redCard',     team: 'us' },
    { type: 'injury',      team: 'us' },
    { type: 'substitution',team: 'us' },
  ];
  const r = scope.matchComputeScore(events);
  assert.deepEqual(r, { us: 0, them: 0 });
});

test('matchComputeScore: mixed events compute correctly', () => {
  const scope = buildScope();
  const events = [
    { type: 'try',         team: 'us'   },  // 5
    { type: 'conversion',  team: 'us'   },  // 2
    { type: 'penalty',     team: 'us'   },  // 3
    { type: 'try',         team: 'them' },  // 5
    { type: 'penalty',     team: 'them' },  // 3
    { type: 'yellowCard',  team: 'us'   },  // 0
  ];
  const r = scope.matchComputeScore(events);
  assert.equal(r.us,   10);
  assert.equal(r.them, 8);
});

test('matchComputeScore: two tries = 10 points', () => {
  const scope = buildScope();
  const events = [
    { type: 'try', team: 'us' },
    { type: 'try', team: 'us' },
  ];
  const r = scope.matchComputeScore(events);
  assert.equal(r.us, 10);
});

test('matchComputeScore: try + conversion = 7 points', () => {
  const scope = buildScope();
  const events = [
    { type: 'try',        team: 'them' },
    { type: 'conversion', team: 'them' },
  ];
  const r = scope.matchComputeScore(events);
  assert.equal(r.them, 7);
  assert.equal(r.us, 0);
});

// ── normalizeMatchDayNotes ────────────────────────────────────────────────────

test('normalizeMatchDayNotes: null returns 6 empty sections', () => {
  const scope = buildScope();
  const r = scope.normalizeMatchDayNotes(null);
  assert.deepEqual(r, { attack:'', defence:'', setPiece:'', discipline:'', referee:'', general:'' });
});

test('normalizeMatchDayNotes: undefined returns 6 empty sections', () => {
  const scope = buildScope();
  const r = scope.normalizeMatchDayNotes(undefined);
  assert.deepEqual(r, { attack:'', defence:'', setPiece:'', discipline:'', referee:'', general:'' });
});

test('normalizeMatchDayNotes: existing fields preserved', () => {
  const scope = buildScope();
  const notes = { attack: 'Strong inside ball', defence: 'Blitz worked well' };
  const r = scope.normalizeMatchDayNotes(notes);
  assert.equal(r.attack,  'Strong inside ball');
  assert.equal(r.defence, 'Blitz worked well');
  assert.equal(r.general, '');
  assert.equal(r.setPiece, '');
});

test('normalizeMatchDayNotes: all 6 fields survive round-trip', () => {
  const scope = buildScope();
  const notes = { attack:'A', defence:'B', setPiece:'C', discipline:'D', referee:'E', general:'F' };
  const r = scope.normalizeMatchDayNotes(notes);
  assert.deepEqual(r, notes);
});

test('normalizeMatchDayNotes: non-object returns empty shape', () => {
  const scope = buildScope();
  const r = scope.normalizeMatchDayNotes('bad input');
  assert.deepEqual(r, { attack:'', defence:'', setPiece:'', discipline:'', referee:'', general:'' });
});

// ── matchEventsSummary ────────────────────────────────────────────────────────

test('matchEventsSummary: empty returns all empty arrays', () => {
  const scope = buildScope();
  const r = scope.matchEventsSummary([]);
  assert.equal(r.tries.length, 0);
  assert.equal(r.yellowCards.length, 0);
  assert.equal(r.substitutions.length, 0);
  assert.equal(r.injuries.length, 0);
});

test('matchEventsSummary: null events returns all empty arrays', () => {
  const scope = buildScope();
  const r = scope.matchEventsSummary(null);
  assert.equal(r.tries.length, 0);
});

test('matchEventsSummary: categorises scoring events correctly', () => {
  const scope = buildScope();
  const events = [
    { type:'try', team:'us', minute:12 },
    { type:'conversion', team:'us', minute:13 },
    { type:'penalty', team:'them', minute:25 },
    { type:'dropGoal', team:'us', minute:38 },
  ];
  const r = scope.matchEventsSummary(events);
  assert.equal(r.tries.length,       1);
  assert.equal(r.conversions.length, 1);
  assert.equal(r.penalties.length,   1);
  assert.equal(r.dropGoals.length,   1);
});

test('matchEventsSummary: categorises discipline events correctly', () => {
  const scope = buildScope();
  const events = [
    { type:'yellowCard', team:'us',   minute:22 },
    { type:'redCard',    team:'them', minute:55 },
  ];
  const r = scope.matchEventsSummary(events);
  assert.equal(r.yellowCards.length, 1);
  assert.equal(r.redCards.length,    1);
  assert.equal(r.tries.length,       0);
});

test('matchEventsSummary: injury and substitution events', () => {
  const scope = buildScope();
  const events = [
    { type:'injury',       team:'us', minute:30, playerId:'p1' },
    { type:'substitution', team:'us', minute:31, playerId:'p2' },
  ];
  const r = scope.matchEventsSummary(events);
  assert.equal(r.injuries.length,      1);
  assert.equal(r.substitutions.length, 1);
  assert.equal(r.injuries[0].playerId, 'p1');
});

test('matchEventsSummary: multiple events of same type', () => {
  const scope = buildScope();
  const events = [
    { type:'try', team:'us',   minute:5  },
    { type:'try', team:'us',   minute:22 },
    { type:'try', team:'them', minute:35 },
  ];
  const r = scope.matchEventsSummary(events);
  assert.equal(r.tries.length, 3);
  assert.equal(r.tries.filter(e=>e.team==='us').length,   2);
  assert.equal(r.tries.filter(e=>e.team==='them').length, 1);
});

// ── matchKey ─────────────────────────────────────────────────────────────────

test('matchKey: with date and opposition → date_opp slug', () => {
  const scope = buildScope({
    matchCentre: { kickoffDate: '2026-06-21', opposition: 'Kituro RFC' },
    matchEvents: {}, matchStatus: {},
  });
  const k = scope.matchKey();
  assert.equal(k, '2026-06-21_kiturorfc');
});

test('matchKey: date only, no opposition → just date', () => {
  const scope = buildScope({
    matchCentre: { kickoffDate: '2026-06-21', opposition: '' },
    matchEvents: {}, matchStatus: {},
  });
  const k = scope.matchKey();
  assert.equal(k, '2026-06-21');
});

test('matchKey: no date or opposition → "current"', () => {
  const scope = buildScope({
    matchCentre: { kickoffDate: '', opposition: '' },
    matchEvents: {}, matchStatus: {},
  });
  const k = scope.matchKey();
  assert.equal(k, 'current');
});

test('matchKey: empty matchCentre → "current"', () => {
  const scope = buildScope({ matchCentre: {}, matchEvents: {}, matchStatus: {} });
  const k = scope.matchKey();
  assert.equal(k, 'current');
});

test('matchKey: opposition with special chars is stripped', () => {
  const scope = buildScope({
    matchCentre: { kickoffDate: '2026-07-04', opposition: 'St. Mary\'s RFC & Lions' },
    matchEvents: {}, matchStatus: {},
  });
  const k = scope.matchKey();
  assert.ok(k.startsWith('2026-07-04_'));
  // The opposition slug should contain only alphanumeric chars (date part uses hyphens, that's fine)
  const oppSlug = k.split('_').slice(1).join('_');
  assert.ok(/^[a-z0-9]+$/.test(oppSlug));
});
