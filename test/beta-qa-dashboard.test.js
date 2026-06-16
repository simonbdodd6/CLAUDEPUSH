import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Function ${name} not found in source`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

function extractObjectConst(name) {
  const pattern = new RegExp(`const ${name}\\s*=\\s*\\{([^}]*?)\\}`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Const ${name} not found`);
  return m[0];
}

// QA_CHECKLIST_ITEMS has nested {} objects — hardcode for test scope
function extractArrayConst(name) {
  const start = src.indexOf(`const ${name} = [`);
  if (start === -1) throw new Error(`Array const ${name} not found`);
  let depth = 0, i = start + `const ${name} = `.length;
  while (i < src.length) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  return src.slice(start, i) + ';';
}

function buildScope() {
  const objectConsts = ['MATCH_POINT_VALUES'];
  const arrayConsts  = ['QA_CHECKLIST_ITEMS'];

  const helpers = `
    function playerIsArchived(p) {
      return !!(p && (p.lifecycleStatus === 'archived' || p._archived === true));
    }
    function activeRosterPlayers(players) {
      return (players || []).filter(p => !playerIsArchived(p));
    }
  `;

  const fns = [
    'normalizeMedicalRecord',
    'matchComputeScore',
    'qaClubReadiness',
    'qaPlayersReadiness',
    'qaFixturesReadiness',
    'qaAvailabilityReadiness',
    'qaTrainingReadiness',
    'qaMatchCentreReadiness',
    'qaMedicalReadiness',
    'qaReportsReadiness',
    'qaCalendarReadiness',
    'qaPlayerPortalReadiness',
    'qaBuildSections',
    'qaBetaSummaryText',
  ];

  const constSrcs = objectConsts.map(extractObjectConst).join(';\n') + ';\n' +
    arrayConsts.map(extractArrayConst).join('\n');
  const fnSrcs = fns.map(extractFn).join('\n');

  const body = `
    "use strict";
    ${constSrcs}
    ${helpers}
    let state = {};
    ${fnSrcs}
    return {
      qaClubReadiness, qaPlayersReadiness, qaFixturesReadiness,
      qaAvailabilityReadiness, qaTrainingReadiness, qaMatchCentreReadiness,
      qaMedicalReadiness, qaReportsReadiness, qaCalendarReadiness,
      qaPlayerPortalReadiness, qaBuildSections, qaBetaSummaryText,
      QA_CHECKLIST_ITEMS,
    };
  `;
  return new Function(body)();
}

// ── qaClubReadiness ───────────────────────────────────────────────────────────

test('qaClubReadiness: no name returns not-checked', () => {
  const { qaClubReadiness } = buildScope();
  const r = qaClubReadiness('', '');
  assert.equal(r.status, 'not-checked');
});

test('qaClubReadiness: name without team returns needs-data', () => {
  const { qaClubReadiness } = buildScope();
  const r = qaClubReadiness('Harlequins RFC', '');
  assert.equal(r.status, 'needs-data');
  assert.ok(r.summary.includes('Harlequins RFC'));
});

test('qaClubReadiness: name and team returns ready', () => {
  const { qaClubReadiness } = buildScope();
  const r = qaClubReadiness('Harlequins RFC', 'U20s');
  assert.equal(r.status, 'ready');
  assert.ok(r.summary.includes('Harlequins RFC'));
  assert.ok(r.summary.includes('U20s'));
});

test('qaClubReadiness: whitespace-only name returns not-checked', () => {
  const { qaClubReadiness } = buildScope();
  const r = qaClubReadiness('   ', '   ');
  assert.equal(r.status, 'not-checked');
});

test('qaClubReadiness: does not mutate inputs', () => {
  const { qaClubReadiness } = buildScope();
  const name = 'Club A';
  const team = 'Seniors';
  qaClubReadiness(name, team);
  assert.equal(name, 'Club A');
  assert.equal(team, 'Seniors');
});

// ── qaPlayersReadiness ────────────────────────────────────────────────────────

test('qaPlayersReadiness: empty array returns not-checked', () => {
  const { qaPlayersReadiness } = buildScope();
  const r = qaPlayersReadiness([]);
  assert.equal(r.status, 'not-checked');
  assert.equal(r.count, 0);
});

test('qaPlayersReadiness: 1-4 players returns needs-data', () => {
  const { qaPlayersReadiness } = buildScope();
  const players = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }];
  const r = qaPlayersReadiness(players);
  assert.equal(r.status, 'needs-data');
  assert.equal(r.count, 2);
});

test('qaPlayersReadiness: 5+ players returns ready', () => {
  const { qaPlayersReadiness } = buildScope();
  const players = Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const r = qaPlayersReadiness(players);
  assert.equal(r.status, 'ready');
  assert.equal(r.count, 5);
});

test('qaPlayersReadiness: archived players excluded from count', () => {
  const { qaPlayersReadiness } = buildScope();
  const players = [
    { id: 'p1', name: 'Active' },
    { id: 'p2', name: 'Archived', lifecycleStatus: 'archived' },
    { id: 'p3', name: 'Archived2', _archived: true },
  ];
  const r = qaPlayersReadiness(players);
  assert.equal(r.count, 1);
  assert.equal(r.status, 'needs-data');
});

test('qaPlayersReadiness: null input returns not-checked', () => {
  const { qaPlayersReadiness } = buildScope();
  const r = qaPlayersReadiness(null);
  assert.equal(r.status, 'not-checked');
});

test('qaPlayersReadiness: does not mutate input array', () => {
  const { qaPlayersReadiness } = buildScope();
  const players = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }];
  const before = JSON.stringify(players);
  qaPlayersReadiness(players);
  assert.equal(JSON.stringify(players), before);
});

// ── qaFixturesReadiness ───────────────────────────────────────────────────────

test('qaFixturesReadiness: empty returns not-checked', () => {
  const { qaFixturesReadiness } = buildScope();
  assert.equal(qaFixturesReadiness([], '2026-07-01').status, 'not-checked');
});

test('qaFixturesReadiness: only future returns needs-data', () => {
  const { qaFixturesReadiness } = buildScope();
  const fx = [{ id: 'f1', date: '2026-08-01', opposition: 'Alpha' }];
  const r  = qaFixturesReadiness(fx, '2026-07-01');
  assert.equal(r.status, 'needs-data');
  assert.equal(r.future, 1);
  assert.equal(r.past, 0);
});

test('qaFixturesReadiness: only past returns needs-data', () => {
  const { qaFixturesReadiness } = buildScope();
  const fx = [{ id: 'f1', date: '2026-06-01', opposition: 'Beta' }];
  const r  = qaFixturesReadiness(fx, '2026-07-01');
  assert.equal(r.status, 'needs-data');
  assert.equal(r.future, 0);
  assert.equal(r.past, 1);
});

test('qaFixturesReadiness: both past and future returns ready', () => {
  const { qaFixturesReadiness } = buildScope();
  const fx = [
    { id: 'f1', date: '2026-06-01', opposition: 'Past' },
    { id: 'f2', date: '2026-08-01', opposition: 'Future' },
  ];
  const r = qaFixturesReadiness(fx, '2026-07-01');
  assert.equal(r.status, 'ready');
  assert.equal(r.future, 1);
  assert.equal(r.past, 1);
});

test('qaFixturesReadiness: does not mutate input', () => {
  const { qaFixturesReadiness } = buildScope();
  const fx = [{ id: 'f2', date: '2026-08-01' }, { id: 'f1', date: '2026-06-01' }];
  const before = JSON.stringify(fx);
  qaFixturesReadiness(fx, '2026-07-01');
  assert.equal(JSON.stringify(fx), before);
});

// ── qaAvailabilityReadiness ───────────────────────────────────────────────────

test('qaAvailabilityReadiness: no sessions returns not-checked', () => {
  const { qaAvailabilityReadiness } = buildScope();
  const r = qaAvailabilityReadiness([{ id: 'p1', name: 'A' }], []);
  assert.equal(r.status, 'not-checked');
});

test('qaAvailabilityReadiness: session exists but no responses returns needs-data', () => {
  const { qaAvailabilityReadiness } = buildScope();
  const players  = [{ id: 'p1', name: 'A' }];
  const schedule = [{ id: 's1', type: 'Training', date: '2026-07-10', title: 'T' }];
  const r = qaAvailabilityReadiness(players, schedule);
  assert.equal(r.status, 'needs-data');
  assert.equal(r.responded, 0);
});

test('qaAvailabilityReadiness: player responded via game field returns ready', () => {
  const { qaAvailabilityReadiness } = buildScope();
  const players  = [{ id: 'p1', name: 'A', game: 'available' }];
  const schedule = [{ id: 's1', type: 'Training', date: '2026-07-10', title: 'T' }];
  const r = qaAvailabilityReadiness(players, schedule);
  assert.equal(r.status, 'ready');
  assert.equal(r.responded, 1);
});

test('qaAvailabilityReadiness: player responded via trainingTuesday returns ready', () => {
  const { qaAvailabilityReadiness } = buildScope();
  const players  = [{ id: 'p1', name: 'A', trainingTuesday: 'unavailable' }];
  const schedule = [{ id: 's1', type: 'Training', date: '2026-07-08', title: 'T' }];
  const r = qaAvailabilityReadiness(players, schedule);
  assert.equal(r.status, 'ready');
});

test('qaAvailabilityReadiness: archived players excluded', () => {
  const { qaAvailabilityReadiness } = buildScope();
  const players  = [
    { id: 'p1', name: 'Active', game: 'available' },
    { id: 'p2', name: 'Arch', lifecycleStatus: 'archived', game: 'available' },
  ];
  const schedule = [{ id: 's1', type: 'Training', date: '2026-07-10', title: 'T' }];
  const r = qaAvailabilityReadiness(players, schedule);
  assert.equal(r.responded, 1);
});

// ── qaTrainingReadiness ───────────────────────────────────────────────────────

test('qaTrainingReadiness: no sessions returns not-checked', () => {
  const { qaTrainingReadiness } = buildScope();
  assert.equal(qaTrainingReadiness([], {}).status, 'not-checked');
});

test('qaTrainingReadiness: session without plan returns needs-data', () => {
  const { qaTrainingReadiness } = buildScope();
  const schedule = [{ id: 's1', type: 'Training', date: '2026-07-10', title: 'T' }];
  const r = qaTrainingReadiness(schedule, {});
  assert.equal(r.status, 'needs-data');
  assert.equal(r.withPlan, 0);
});

test('qaTrainingReadiness: session with plan returns ready', () => {
  const { qaTrainingReadiness } = buildScope();
  const schedule = [{ id: 's1', type: 'Training', date: '2026-07-10', title: 'T' }];
  const blocks   = { s1: [{ activity: 'Warm-up', time: '18:00' }] };
  const r = qaTrainingReadiness(schedule, blocks);
  assert.equal(r.status, 'ready');
  assert.equal(r.withPlan, 1);
});

test('qaTrainingReadiness: non-Training sessions not counted', () => {
  const { qaTrainingReadiness } = buildScope();
  const schedule = [{ id: 'g1', type: 'Match', date: '2026-07-10', title: 'Game' }];
  assert.equal(qaTrainingReadiness(schedule, {}).status, 'not-checked');
});

// ── qaMatchCentreReadiness ────────────────────────────────────────────────────

test('qaMatchCentreReadiness: empty returns not-checked', () => {
  const { qaMatchCentreReadiness } = buildScope();
  assert.equal(qaMatchCentreReadiness({}, {}).status, 'not-checked');
});

test('qaMatchCentreReadiness: events but no ft returns needs-data', () => {
  const { qaMatchCentreReadiness } = buildScope();
  const events = { '2026-07-10_opp': [{ type: 'try', team: 'us', minute: 5 }] };
  const status = { '2026-07-10_opp': 'live' };
  const r = qaMatchCentreReadiness(events, status);
  assert.equal(r.status, 'needs-data');
});

test('qaMatchCentreReadiness: ft match with events returns ready', () => {
  const { qaMatchCentreReadiness } = buildScope();
  const events = { '2026-07-10_opp': [{ type: 'try', team: 'us', minute: 5 }] };
  const status = { '2026-07-10_opp': 'ft' };
  const r = qaMatchCentreReadiness(events, status);
  assert.equal(r.status, 'ready');
  assert.equal(r.completed, 1);
});

// ── qaMedicalReadiness ────────────────────────────────────────────────────────

test('qaMedicalReadiness: no players returns not-checked', () => {
  const { qaMedicalReadiness } = buildScope();
  assert.equal(qaMedicalReadiness([], {}).status, 'not-checked');
});

test('qaMedicalReadiness: players with no medical records returns needs-data', () => {
  const { qaMedicalReadiness } = buildScope();
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: 'full' }];
  assert.equal(qaMedicalReadiness(players, {}).status, 'needs-data');
});

test('qaMedicalReadiness: player with injury record returns ready', () => {
  const { qaMedicalReadiness } = buildScope();
  const players    = [{ id: 'p1', name: 'Alice', trainingStatus: '' }];
  const medRecords = { p1: { currentInjury: 'Knee', severity: 'moderate' } };
  assert.equal(qaMedicalReadiness(players, medRecords).status, 'ready');
});

test('qaMedicalReadiness: player with unavailable trainingStatus returns ready', () => {
  const { qaMedicalReadiness } = buildScope();
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: 'unavailable' }];
  assert.equal(qaMedicalReadiness(players, {}).status, 'ready');
});

test('qaMedicalReadiness: archived players excluded', () => {
  const { qaMedicalReadiness } = buildScope();
  const players = [
    { id: 'p1', name: 'Active', trainingStatus: '' },
    { id: 'p2', name: 'Arch', trainingStatus: 'unavailable', lifecycleStatus: 'archived' },
  ];
  const r = qaMedicalReadiness(players, {});
  assert.equal(r.status, 'needs-data');
  assert.equal(r.flagged, 0);
});

// ── qaReportsReadiness ────────────────────────────────────────────────────────

test('qaReportsReadiness: empty returns not-checked', () => {
  const { qaReportsReadiness } = buildScope();
  assert.equal(qaReportsReadiness({}, {}).status, 'not-checked');
});

test('qaReportsReadiness: 1 completed match returns needs-data', () => {
  const { qaReportsReadiness } = buildScope();
  const events = { '2026-07-10_opp': [{ type: 'try', team: 'us', minute: 5 }] };
  const status = { '2026-07-10_opp': 'ft' };
  assert.equal(qaReportsReadiness(events, status).status, 'needs-data');
});

test('qaReportsReadiness: 2+ completed matches returns ready', () => {
  const { qaReportsReadiness } = buildScope();
  const events = {
    '2026-07-10_a': [{ type: 'try', team: 'us', minute: 5 }],
    '2026-07-17_b': [{ type: 'try', team: 'them', minute: 10 }],
  };
  const status = { '2026-07-10_a': 'ft', '2026-07-17_b': 'ft' };
  assert.equal(qaReportsReadiness(events, status).status, 'ready');
});

// ── qaCalendarReadiness ───────────────────────────────────────────────────────

test('qaCalendarReadiness: empty returns not-checked', () => {
  const { qaCalendarReadiness } = buildScope();
  assert.equal(qaCalendarReadiness([], []).status, 'not-checked');
});

test('qaCalendarReadiness: fewer than 5 events returns needs-data', () => {
  const { qaCalendarReadiness } = buildScope();
  const fixtures = [{ id: 'f1', date: '2026-07-10' }, { id: 'f2', date: '2026-07-17' }];
  assert.equal(qaCalendarReadiness(fixtures, []).status, 'needs-data');
});

test('qaCalendarReadiness: 5+ events returns ready', () => {
  const { qaCalendarReadiness } = buildScope();
  const fixtures = Array.from({ length: 3 }, (_, i) => ({ id: 'f' + i, date: '2026-07-' + (10 + i) }));
  const sessions = Array.from({ length: 2 }, (_, i) => ({ id: 's' + i, type: 'Training', date: '2026-07-' + (20 + i) }));
  const r = qaCalendarReadiness(fixtures, sessions);
  assert.equal(r.status, 'ready');
  assert.equal(r.total, 5);
});

test('qaCalendarReadiness: non-Training sessions not counted', () => {
  const { qaCalendarReadiness } = buildScope();
  const sessions = Array.from({ length: 5 }, (_, i) => ({ id: 'g' + i, type: 'Match', date: '2026-07-' + (10 + i) }));
  assert.equal(qaCalendarReadiness([], sessions).status, 'not-checked');
});

// ── qaPlayerPortalReadiness ───────────────────────────────────────────────────

test('qaPlayerPortalReadiness: no players returns not-checked', () => {
  const { qaPlayerPortalReadiness } = buildScope();
  assert.equal(qaPlayerPortalReadiness([]).status, 'not-checked');
});

test('qaPlayerPortalReadiness: players without credentials returns not-checked', () => {
  const { qaPlayerPortalReadiness } = buildScope();
  const players = Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  assert.equal(qaPlayerPortalReadiness(players).status, 'not-checked');
});

test('qaPlayerPortalReadiness: invited player but fewer than 3 total returns needs-data', () => {
  const { qaPlayerPortalReadiness } = buildScope();
  const players = [
    { id: 'p1', name: 'A', userId: 'u1' },
    { id: 'p2', name: 'B' },
  ];
  assert.equal(qaPlayerPortalReadiness(players).status, 'needs-data');
});

test('qaPlayerPortalReadiness: invited player with 3+ active returns ready', () => {
  const { qaPlayerPortalReadiness } = buildScope();
  const players = [
    { id: 'p1', name: 'A', userId: 'u1' },
    { id: 'p2', name: 'B' },
    { id: 'p3', name: 'C' },
  ];
  assert.equal(qaPlayerPortalReadiness(players).status, 'ready');
});

// ── qaBuildSections ───────────────────────────────────────────────────────────

test('qaBuildSections: returns array of 10 sections', () => {
  const { qaBuildSections } = buildScope();
  const s = { players: [], fixtures: [], schedule: [], trainingBlocks: {}, medicalRecords: {}, matchCentre: {}, clubName: '', teamName: '', announcements: [] };
  const sections = qaBuildSections(s, '2026-07-01');
  assert.equal(sections.length, 10);
});

test('qaBuildSections: each section has id, name, icon, status, summary', () => {
  const { qaBuildSections } = buildScope();
  const s = { players: [], fixtures: [], schedule: [], trainingBlocks: {}, medicalRecords: {}, matchCentre: {}, clubName: '', teamName: '' };
  const sections = qaBuildSections(s, '2026-07-01');
  sections.forEach(sec => {
    assert.ok(typeof sec.id     === 'string' && sec.id.length > 0,     'section.id must be a non-empty string');
    assert.ok(typeof sec.name   === 'string' && sec.name.length > 0,   'section.name must be a non-empty string');
    assert.ok(typeof sec.icon   === 'string' && sec.icon.length > 0,   'section.icon must be non-empty');
    assert.ok(typeof sec.status  === 'string' && sec.status.length > 0, 'section.status must be a non-empty string');
    assert.ok(typeof sec.summary === 'string' && sec.summary.length > 0,'section.summary must be non-empty');
  });
});

test('qaBuildSections: empty state produces all not-checked sections', () => {
  const { qaBuildSections } = buildScope();
  const s = { players: [], fixtures: [], schedule: [], trainingBlocks: {}, medicalRecords: {}, matchCentre: {}, clubName: '', teamName: '' };
  const sections = qaBuildSections(s, '2026-07-01');
  const statuses = sections.map(sec => sec.status);
  assert.ok(statuses.every(st => ['not-checked', 'needs-data', 'ready'].includes(st)));
  // Empty state: all should be 'not-checked'
  assert.ok(statuses.every(st => st === 'not-checked'));
});

test('qaBuildSections: does not mutate input state', () => {
  const { qaBuildSections } = buildScope();
  const s = {
    players: [{ id: 'p1', name: 'Alice' }],
    fixtures: [{ id: 'f1', date: '2026-07-10', opposition: 'Alpha' }],
    schedule: [], trainingBlocks: {}, medicalRecords: {},
    matchCentre: {}, clubName: 'Club', teamName: 'Seniors',
  };
  const before = JSON.stringify(s);
  qaBuildSections(s, '2026-07-01');
  assert.equal(JSON.stringify(s), before);
});

test('qaBuildSections: populated state produces non-trivial statuses', () => {
  const { qaBuildSections } = buildScope();
  const s = {
    clubName: 'Harlequins RFC',
    teamName: 'Seniors',
    players: Array.from({ length: 6 }, (_, i) => ({
      id: 'p' + i, name: 'Player ' + i,
      userId: i === 0 ? 'u0' : undefined,
      game: i < 3 ? 'available' : undefined,
    })),
    fixtures: [
      { id: 'f1', date: '2026-06-01', opposition: 'Past' },
      { id: 'f2', date: '2026-08-01', opposition: 'Future' },
    ],
    schedule: [{ id: 's1', type: 'Training', date: '2026-07-10', title: 'Tue' }],
    trainingBlocks: { s1: [{ activity: 'Warm-up' }] },
    medicalRecords: { p0: { currentInjury: 'Knee', severity: 'moderate' } },
    matchCentre: {
      events: { '2026-07-05_opp': [{ type: 'try', team: 'us', minute: 5 }] },
      status: { '2026-07-05_opp': 'ft' },
    },
  };
  const sections = qaBuildSections(s, '2026-07-01');
  const ready = sections.filter(sec => sec.status === 'ready').length;
  assert.ok(ready >= 4, 'populated state should have at least 4 ready sections, got ' + ready);
});

// ── qaBetaSummaryText ─────────────────────────────────────────────────────────

test('qaBetaSummaryText: empty sections produces valid text', () => {
  const { qaBetaSummaryText } = buildScope();
  const text = qaBetaSummaryText([], 'Test Club', '2026-07-01');
  assert.ok(text.includes("Coach's Eye"));
  assert.ok(text.includes('Test Club'));
  assert.ok(text.includes('2026-07-01'));
  assert.ok(text.includes('0/0 sections ready'));
});

test('qaBetaSummaryText: ready sections show checkmark', () => {
  const { qaBetaSummaryText } = buildScope();
  const sections = [
    { name: 'Club Setup', status: 'ready',       summary: 'Club A · Seniors' },
    { name: 'Players',    status: 'needs-data',  summary: '2 players' },
    { name: 'Fixtures',   status: 'not-checked', summary: 'None' },
  ];
  const text = qaBetaSummaryText(sections, 'Club A', '2026-07-01');
  assert.ok(text.includes('✅ Club Setup'));
  assert.ok(text.includes('⚠️ Players'));
  assert.ok(text.includes('⬜ Fixtures'));
});

test('qaBetaSummaryText: count of ready sections is accurate', () => {
  const { qaBetaSummaryText } = buildScope();
  const sections = [
    { name: 'A', status: 'ready',       summary: 'ok' },
    { name: 'B', status: 'ready',       summary: 'ok' },
    { name: 'C', status: 'needs-data',  summary: 'partial' },
    { name: 'D', status: 'not-checked', summary: 'none' },
  ];
  const text = qaBetaSummaryText(sections, '', '2026-07-01');
  assert.ok(text.includes('2/4 sections ready'));
});

test('qaBetaSummaryText: does not mutate input sections array', () => {
  const { qaBetaSummaryText } = buildScope();
  const sections = [{ name: 'X', status: 'ready', summary: 'ok' }];
  const before = JSON.stringify(sections);
  qaBetaSummaryText(sections, 'Club', '2026-07-01');
  assert.equal(JSON.stringify(sections), before);
});

test('qaBetaSummaryText: output is deterministic for identical inputs', () => {
  const { qaBetaSummaryText } = buildScope();
  const sections = [
    { name: 'Club', status: 'ready',      summary: 'Club X · Seniors' },
    { name: 'Players', status: 'needs-data', summary: '3 players' },
  ];
  const a = qaBetaSummaryText(sections, 'Club X', '2026-07-01');
  const b = qaBetaSummaryText(sections, 'Club X', '2026-07-01');
  assert.equal(a, b);
});

// ── QA_CHECKLIST_ITEMS integrity ──────────────────────────────────────────────

test('QA_CHECKLIST_ITEMS: all items have id, section, label', () => {
  const { QA_CHECKLIST_ITEMS } = buildScope();
  assert.ok(QA_CHECKLIST_ITEMS.length >= 10, 'must have at least 10 checklist items');
  QA_CHECKLIST_ITEMS.forEach(item => {
    assert.ok(typeof item.id      === 'string' && item.id.length > 0,    'item.id must be non-empty');
    assert.ok(typeof item.section === 'string' && item.section.length > 0,'item.section must be non-empty');
    assert.ok(typeof item.label   === 'string' && item.label.length > 0,  'item.label must be non-empty');
  });
});

test('QA_CHECKLIST_ITEMS: all ids are unique', () => {
  const { QA_CHECKLIST_ITEMS } = buildScope();
  const ids = QA_CHECKLIST_ITEMS.map(i => i.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'all QA_CHECKLIST_ITEMS ids must be unique');
});

test('QA_CHECKLIST_ITEMS: does not reference Simon Test Player or internal ids', () => {
  const { QA_CHECKLIST_ITEMS } = buildScope();
  QA_CHECKLIST_ITEMS.forEach(item => {
    assert.ok(!item.label.toLowerCase().includes('simon'), 'checklist must not reference simon');
    assert.ok(!item.id.includes('coach-demo'), 'checklist must not reference coach-demo');
  });
});

// ── Simon Test Player not exposed ─────────────────────────────────────────────

test('qaBuildSections: Simon Test Player data not visible in section summaries', () => {
  const { qaBuildSections } = buildScope();
  const s = {
    clubName: 'Simon FC', teamName: 'Seniors',
    players: [{ id: 'simon-test-player', name: 'Simon Test Player' }],
    fixtures: [], schedule: [], trainingBlocks: {}, medicalRecords: {}, matchCentre: {},
  };
  const sections = qaBuildSections(s, '2026-07-01');
  const allSummaries = sections.map(sec => sec.summary).join(' ');
  // Section summaries show counts, not player names
  assert.ok(!allSummaries.includes('Simon Test Player'), 'player names must not appear in section summaries');
});

// ── Integration: all helpers return safe values from complete empty state ──────

test('integration: all readiness helpers handle complete empty state', () => {
  const { qaClubReadiness, qaPlayersReadiness, qaFixturesReadiness,
    qaAvailabilityReadiness, qaTrainingReadiness, qaMatchCentreReadiness,
    qaMedicalReadiness, qaReportsReadiness, qaCalendarReadiness,
    qaPlayerPortalReadiness } = buildScope();

  assert.equal(qaClubReadiness('', '').status, 'not-checked');
  assert.equal(qaPlayersReadiness([]).status, 'not-checked');
  assert.equal(qaFixturesReadiness([], '2026-07-01').status, 'not-checked');
  assert.equal(qaAvailabilityReadiness([], []).status, 'not-checked');
  assert.equal(qaTrainingReadiness([], {}).status, 'not-checked');
  assert.equal(qaMatchCentreReadiness({}, {}).status, 'not-checked');
  assert.equal(qaMedicalReadiness([], {}).status, 'not-checked');
  assert.equal(qaReportsReadiness({}, {}).status, 'not-checked');
  assert.equal(qaCalendarReadiness([], []).status, 'not-checked');
  assert.equal(qaPlayerPortalReadiness([]).status, 'not-checked');
});
