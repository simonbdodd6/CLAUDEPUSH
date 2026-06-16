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

function buildScope(stateOverride) {
  const objectConsts = [
    'MEDICAL_SEVERITY_LABELS', 'MEDICAL_SEVERITY_COLORS',
    'MEDICAL_CLEARANCE_LABELS', 'MEDICAL_CLEARANCE_COLORS',
    'MEDICAL_TRAINING_LABELS', 'MEDICAL_TRAINING_COLORS',
    'MEDICAL_TIMELINE_LABELS', 'MEDICAL_TIMELINE_COLORS',
    'MATCH_EVENT_TYPES', 'MATCH_POINT_VALUES', 'MATCH_EVENT_ICONS',
    'MATCH_STATUS_LABELS', 'MATCH_NOTES_LABELS',
    'TRAINING_ATTENDANCE_LABELS',
  ];
  // TRAINING_ATTENDANCE_COLORS has nested objects — hardcode it
  const arrayConsts = [
    "const MEDICAL_TIMELINE_TYPES = ['injury','physio','clearance','return','surgery','note'];",
    "const MEDICAL_BODY_LOCATIONS = ['Head','Neck','Shoulder','Collarbone','Chest','Ribs','Abdomen','Lower Back','Hip','Groin','Hamstring','Quad','Knee','Calf','Shin','Ankle','Foot','Thumb','Wrist','Elbow','Other'];",
    "const MATCH_NOTES_SECTIONS = ['attack','defence','setPiece','discipline','referee','general'];",
    "const TRAINING_ATTENDANCE_COLORS = { present:{color:'#34d399',bg:'rgba(52,211,153,0.12)'}, late:{color:'#fbbf24',bg:'rgba(251,191,36,0.12)'}, excused:{color:'#60a5fa',bg:'rgba(96,165,250,0.12)'}, injured:{color:'#f87171',bg:'rgba(248,113,113,0.12)'}, absent:{color:'#dc2626',bg:'rgba(220,38,38,0.1)'} };",
  ];

  const helpers = `
    function playerIsArchived(p) {
      return !!(p && (p.lifecycleStatus === 'archived' || p._archived === true));
    }
    function activeRosterPlayers(players) {
      return (players || []).filter(p => !playerIsArchived(p));
    }
  `;

  const fns = [
    'normalizeMedicalRecord', 'medicalDashboardSummary',
    'medicalSeverityColor', 'medicalTrainingStatusColor', 'medicalTrainingStatusLabel',
    'matchComputeScore', 'normalizeMatchDayNotes', 'matchEventsSummary', 'matchKey',
    'trainingAttendanceForSession', 'playerAttendanceHistory', 'normalizeSessionNotes',
    'generatePlayerReport', 'generateAvailabilityReport', 'generateMatchReport',
    'generateMedicalReport', 'generateTrainingReport',
    'reportToText',
  ];

  const constSrcs = objectConsts.map(extractObjectConst).join(';\n') + ';\n' + arrayConsts.join('\n');
  const fnSrcs    = fns.map(extractFn).join('\n');

  const defaultState = {
    players: [], fixtures: [], schedule: [],
    fixtureAvailability: {}, trainingAttendance: {}, sessionNotes: {},
    matchCentre: {}, matchEvents: {}, matchDayNotes: {}, matchStatus: {},
    medicalRecords: {}, medicalNotes: {},
  };
  const stateJson = JSON.stringify(stateOverride || defaultState);

  const body = `
    "use strict";
    ${constSrcs};
    ${helpers}
    let state = ${stateJson};
    ${fnSrcs}
    return {
      generatePlayerReport, generateAvailabilityReport, generateMatchReport,
      generateMedicalReport, generateTrainingReport, reportToText,
      normalizeMedicalRecord, matchComputeScore, activeRosterPlayers,
    };
  `;
  return new Function(body)();
}

// ── generatePlayerReport ──────────────────────────────────────────────────────

test('generatePlayerReport: unknown player returns ok:false', () => {
  const scope = buildScope();
  const r = scope.generatePlayerReport('no-such-id', [], {}, {}, {}, []);
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('generatePlayerReport: returns ok:true for known player', () => {
  const players = [{ id: 'p1', name: 'Alice', position: 'Prop', trainingStatus: 'full' }];
  const scope = buildScope();
  const r = scope.generatePlayerReport('p1', players, {}, {}, {}, []);
  assert.equal(r.ok, true);
  assert.equal(r.player.name, 'Alice');
  assert.equal(r.player.position, 'Prop');
});

test('generatePlayerReport: medRecord defaults to empty record when missing', () => {
  const players = [{ id: 'p1', name: 'Alice' }];
  const scope = buildScope();
  const r = scope.generatePlayerReport('p1', players, {}, {}, {}, []);
  assert.equal(r.medRecord.currentInjury, '');
  assert.deepEqual(r.medRecord.timeline, []);
});

test('generatePlayerReport: medRecord fields are returned when present', () => {
  const players = [{ id: 'p1', name: 'Alice' }];
  const medRecords = { p1: { currentInjury: 'Hamstring', severity: 'moderate', expectedReturn: '2026-07-01' } };
  const scope = buildScope();
  const r = scope.generatePlayerReport('p1', players, medRecords, {}, {}, []);
  assert.equal(r.medRecord.currentInjury, 'Hamstring');
  assert.equal(r.medRecord.severity, 'moderate');
  assert.equal(r.medRecord.expectedReturn, '2026-07-01');
});

test('generatePlayerReport: attendance history is included', () => {
  const players = [{ id: 'p1', name: 'Alice' }];
  const sessions = [
    { id: 's1', type: 'Training' },
    { id: 's2', type: 'Training' },
  ];
  const allAtt = { s1: { p1: 'present' }, s2: { p1: 'absent' } };
  const scope = buildScope();
  const r = scope.generatePlayerReport('p1', players, {}, {}, allAtt, sessions);
  assert.equal(r.attendance.attended, 1);
  assert.equal(r.attendance.missed, 1);
  assert.equal(r.attendance.total, 2);
});

test('generatePlayerReport: does not mutate input state', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: 'full' }];
  const medRecords = { p1: { currentInjury: 'Knee' } };
  const before = JSON.stringify(players);
  const beforeRec = JSON.stringify(medRecords);
  const scope = buildScope();
  scope.generatePlayerReport('p1', players, medRecords, {}, {}, []);
  assert.equal(JSON.stringify(players), before);
  assert.equal(JSON.stringify(medRecords), beforeRec);
});

// ── generateAvailabilityReport ────────────────────────────────────────────────

test('generateAvailabilityReport: empty squad and fixtures returns ok:true zeroes', () => {
  const scope = buildScope();
  const r = scope.generateAvailabilityReport([], [], {}, {});
  assert.equal(r.ok, true);
  assert.equal(r.players.length, 0);
  assert.equal(r.fixtures.length, 0);
  assert.equal(r.medUnavailable.length, 0);
});

test('generateAvailabilityReport: archived players excluded from squad count', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob', lifecycleStatus: 'archived' },
  ];
  const scope = buildScope();
  const r = scope.generateAvailabilityReport(players, [], {}, {});
  assert.equal(r.players.length, 1);
  assert.equal(r.players[0].id, 'p1');
});

test('generateAvailabilityReport: medUnavailable lists players with trainingStatus=unavailable', () => {
  const players = [
    { id: 'p1', name: 'Alice', trainingStatus: 'unavailable' },
    { id: 'p2', name: 'Bob',   trainingStatus: 'full' },
  ];
  const scope = buildScope();
  const r = scope.generateAvailabilityReport(players, [], {}, {});
  assert.equal(r.medUnavailable.length, 1);
  assert.equal(r.medUnavailable[0].id, 'p1');
});

test('generateAvailabilityReport: trainingStatus=unavailable overrides availability in fixture rows', () => {
  const players = [
    { id: 'p1', name: 'Alice', trainingStatus: 'unavailable' },
    { id: 'p2', name: 'Bob',   trainingStatus: '' },
  ];
  const fixtures = [{ id: 'fx1', date: '2026-07-05', opposition: 'Team B' }];
  // p1 marked available in fixture but med override should make them unavailable
  const fixtureAvail = { fx1: { p1: 'available', p2: 'available' } };
  const scope = buildScope();
  const r = scope.generateAvailabilityReport(players, fixtures, fixtureAvail, {});
  const fxRow = r.fixtures[0];
  assert.equal(fxRow.avail,   1); // only p2
  assert.equal(fxRow.unavail, 1); // p1 overridden
});

test('generateAvailabilityReport: does not mutate input players array', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: 'full' }];
  const before = JSON.stringify(players);
  const scope = buildScope();
  scope.generateAvailabilityReport(players, [], {}, {});
  assert.equal(JSON.stringify(players), before);
});

// ── generateMatchReport ───────────────────────────────────────────────────────

test('generateMatchReport: empty match returns ok:true with 0-0 score', () => {
  const scope = buildScope();
  const r = scope.generateMatchReport({}, [], {}, {}, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.score, { us: 0, them: 0 });
});

test('generateMatchReport: score is computed from events', () => {
  const events = [
    { type: 'try', team: 'us', minute: 12 },
    { type: 'conversion', team: 'us', minute: 13 },
    { type: 'penalty', team: 'them', minute: 25 },
  ];
  const scope = buildScope();
  const r = scope.generateMatchReport({}, events, {}, {}, []);
  assert.equal(r.score.us,   7);
  assert.equal(r.score.them, 3);
});

test('generateMatchReport: events are sorted by minute', () => {
  const events = [
    { type: 'penalty', team: 'us', minute: 40 },
    { type: 'try',     team: 'us', minute: 5  },
  ];
  const scope = buildScope();
  const r = scope.generateMatchReport({}, events, {}, {}, []);
  assert.equal(r.events[0].minute, 5);
  assert.equal(r.events[1].minute, 40);
});

test('generateMatchReport: summary counts are correct', () => {
  const events = [
    { type: 'try',         team: 'us',   minute: 10 },
    { type: 'try',         team: 'them', minute: 20 },
    { type: 'yellowCard',  team: 'us',   minute: 30 },
    { type: 'substitution',team: 'us',   minute: 50 },
    { type: 'injury',      team: 'us',   minute: 55 },
  ];
  const scope = buildScope();
  const r = scope.generateMatchReport({}, events, {}, {}, []);
  assert.equal(r.summary.tries,         2);
  assert.equal(r.summary.yellowCards,   1);
  assert.equal(r.summary.substitutions, 1);
  assert.equal(r.summary.injuries,      1);
});

test('generateMatchReport: does not mutate input events array', () => {
  const events = [
    { type: 'try', team: 'us', minute: 10 },
    { type: 'penalty', team: 'them', minute: 5 },
  ];
  const before = JSON.stringify(events);
  const scope = buildScope();
  scope.generateMatchReport({}, events, {}, {}, []);
  assert.equal(JSON.stringify(events), before);
});

// ── generateMedicalReport ─────────────────────────────────────────────────────

test('generateMedicalReport: empty squad returns ok:true zeroes', () => {
  const scope = buildScope();
  const r = scope.generateMedicalReport([], {}, {});
  assert.equal(r.ok, true);
  assert.equal(r.total, 0);
  assert.equal(r.alerts.length, 0);
  assert.equal(r.rehab.length, 0);
  assert.equal(r.unavailable.length, 0);
});

test('generateMedicalReport: archived players excluded', () => {
  const players = [
    { id: 'p1', name: 'Alice', trainingStatus: 'unavailable' },
    { id: 'p2', name: 'Bob',   trainingStatus: 'unavailable', lifecycleStatus: 'archived' },
  ];
  const scope = buildScope();
  const r = scope.generateMedicalReport(players, {}, {});
  assert.equal(r.total, 1);
  assert.equal(r.rows.length, 1);
});

test('generateMedicalReport: player with injury has hasAlert=true', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: 'unavailable', game: 'injured', medical: '' }];
  const scope = buildScope();
  const r = scope.generateMedicalReport(players, {}, {});
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].player.id, 'p1');
});

test('generateMedicalReport: rehab includes modified/gymOnly/noContact', () => {
  const players = [
    { id: 'p1', name: 'A', trainingStatus: 'modified',  game: 'available' },
    { id: 'p2', name: 'B', trainingStatus: 'gymOnly',   game: 'available' },
    { id: 'p3', name: 'C', trainingStatus: 'noContact', game: 'available' },
    { id: 'p4', name: 'D', trainingStatus: 'full',      game: 'available' },
  ];
  const scope = buildScope();
  const r = scope.generateMedicalReport(players, {}, {});
  assert.equal(r.rehab.length, 3);
});

test('generateMedicalReport: severe medRecord generates alert', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: '', game: 'available', medical: '' }];
  const medRecords = { p1: { severity: 'severe' } };
  const scope = buildScope();
  const r = scope.generateMedicalReport(players, medRecords, {});
  assert.equal(r.alerts.length, 1);
});

test('generateMedicalReport: does not mutate input players', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: 'full', game: 'available' }];
  const before = JSON.stringify(players);
  const scope = buildScope();
  scope.generateMedicalReport(players, {}, {});
  assert.equal(JSON.stringify(players), before);
});

// ── generateTrainingReport ────────────────────────────────────────────────────

test('generateTrainingReport: empty inputs returns ok:true with zeroes', () => {
  const scope = buildScope();
  const r = scope.generateTrainingReport([], [], {}, {});
  assert.equal(r.ok, true);
  assert.equal(r.totalSessions, 0);
  assert.equal(r.avgPct, null);
  assert.equal(r.sessions.length, 0);
  assert.equal(r.players.length, 0);
});

test('generateTrainingReport: only Training type sessions are counted', () => {
  const players = [{ id: 'p1', name: 'Alice' }];
  const sessions = [
    { id: 's1', type: 'Training', date: '2026-06-10', title: 'Tue' },
    { id: 'g1', type: 'Game',     date: '2026-06-12', title: 'Game' },
  ];
  const scope = buildScope();
  const r = scope.generateTrainingReport(players, sessions, {}, {});
  assert.equal(r.totalSessions, 1);
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].session.id, 's1');
});

test('generateTrainingReport: session pct computed correctly', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Carol' },
    { id: 'p4', name: 'Dave' },
  ];
  const sessions = [{ id: 's1', type: 'Training', date: '2026-06-10', title: 'T' }];
  const allAtt   = { s1: { p1: 'present', p2: 'late', p3: 'absent', p4: 'excused' } };
  const scope = buildScope();
  const r = scope.generateTrainingReport(players, sessions, allAtt, {});
  assert.equal(r.sessions[0].present, 2); // present + late
  assert.equal(r.sessions[0].absent,  1);
  assert.equal(r.sessions[0].excused, 1);
  assert.equal(r.sessions[0].pct,    50); // 2/4
});

test('generateTrainingReport: avgPct is average across sessions', () => {
  const players = [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }];
  const sessions = [
    { id: 's1', type: 'Training', date: '2026-06-10', title: 'T1' },
    { id: 's2', type: 'Training', date: '2026-06-12', title: 'T2' },
  ];
  const allAtt = {
    s1: { p1: 'present', p2: 'present' }, // 100%
    s2: { p1: 'absent',  p2: 'absent'  }, // 0%
  };
  const scope = buildScope();
  const r = scope.generateTrainingReport(players, sessions, allAtt, {});
  assert.equal(r.avgPct, 50);
});

test('generateTrainingReport: player rows sorted by pct descending', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ];
  const sessions = [
    { id: 's1', type: 'Training', date: '2026-06-10', title: 'T' },
    { id: 's2', type: 'Training', date: '2026-06-12', title: 'T2' },
  ];
  const allAtt = {
    s1: { p1: 'present', p2: 'absent' },
    s2: { p1: 'present', p2: 'absent' },
  };
  const scope = buildScope();
  const r = scope.generateTrainingReport(players, sessions, allAtt, {});
  // p1 has 100%, p2 has 0% — p1 should come first
  assert.equal(r.players[0].player.id, 'p1');
  assert.equal(r.players[1].player.id, 'p2');
});

test('generateTrainingReport: does not mutate input players or sessions', () => {
  const players  = [{ id: 'p1', name: 'Alice' }];
  const sessions = [{ id: 's1', type: 'Training', date: '2026-06-10', title: 'T' }];
  const beforeP = JSON.stringify(players);
  const beforeS = JSON.stringify(sessions);
  const scope = buildScope();
  scope.generateTrainingReport(players, sessions, {}, {});
  assert.equal(JSON.stringify(players),  beforeP);
  assert.equal(JSON.stringify(sessions), beforeS);
});

// ── reportToText ──────────────────────────────────────────────────────────────

test('reportToText: player report contains player name', () => {
  const players = [{ id: 'p1', name: 'Ciarán Murphy', trainingStatus: 'full' }];
  const scope = buildScope();
  const rpt = scope.generatePlayerReport('p1', players, {}, {}, {}, []);
  const text = scope.reportToText('player', rpt);
  assert.ok(text.includes('Ciarán Murphy'));
  assert.ok(text.includes('PLAYER REPORT'));
});

test('reportToText: availability report contains header', () => {
  const scope = buildScope();
  const rpt = scope.generateAvailabilityReport([], [], {}, {});
  const text = scope.reportToText('availability', rpt);
  assert.ok(text.includes('TEAM AVAILABILITY REPORT'));
});

test('reportToText: match report contains score', () => {
  const events = [
    { type: 'try', team: 'us', minute: 10 },
    { type: 'penalty', team: 'them', minute: 30 },
  ];
  const scope = buildScope();
  const rpt = scope.generateMatchReport({ opposition: 'Enemies RFC' }, events, {}, {}, []);
  const text = scope.reportToText('match', rpt);
  assert.ok(text.includes('MATCH REPORT'));
  assert.ok(text.includes('5'));
  assert.ok(text.includes('3'));
});

test('reportToText: medical report contains header and squad size', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: 'full', game: 'available' }];
  const scope = buildScope();
  const rpt = scope.generateMedicalReport(players, {}, {});
  const text = scope.reportToText('medical', rpt);
  assert.ok(text.includes('MEDICAL & WELFARE REPORT'));
  assert.ok(text.includes('1'));
});

test('reportToText: training report contains header', () => {
  const scope = buildScope();
  const rpt = scope.generateTrainingReport([], [], {}, {});
  const text = scope.reportToText('training', rpt);
  assert.ok(text.includes('TRAINING ATTENDANCE REPORT'));
});

// ── Medical unavailable override appears in availability reports ──────────────

test('availability report: medical unavailable shows in medUnavailable and overrides fixture', () => {
  const players = [
    { id: 'p1', name: 'Injured Ian', trainingStatus: 'unavailable' },
    { id: 'p2', name: 'Fit Fred',    trainingStatus: 'full' },
  ];
  const fixtures = [{ id: 'fx1', date: '2026-07-05', opposition: 'Opponents' }];
  // Ian says he's available in the fixture form — but medically he's unavailable
  const fixtureAvail = { fx1: { p1: 'available', p2: 'available' } };
  const scope = buildScope();
  const rpt = scope.generateAvailabilityReport(players, fixtures, fixtureAvail, {});
  // medUnavailable list
  assert.equal(rpt.medUnavailable.length, 1);
  assert.equal(rpt.medUnavailable[0].name, 'Injured Ian');
  // fixture row should show override
  const fx = rpt.fixtures[0];
  assert.equal(fx.avail,   1); // Fred
  assert.equal(fx.unavail, 1); // Ian (overridden)
  // text report should mention medical unavailability
  const text = scope.reportToText('availability', rpt);
  assert.ok(text.includes('Med. unavail'));
});
