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

function buildScope() {
  const objectConsts = ['MATCH_POINT_VALUES'];
  // Consts with nested objects hardcoded
  const literalConsts = [
    "const CALENDAR_EVENT_TYPES = { fixture:{label:'Fixture',color:'#34d399',icon:'🏆'}, training:{label:'Training',color:'#60a5fa',icon:'🏉'}, matchReport:{label:'Match Report',color:'#a78bfa',icon:'📋'}, medReturn:{label:'Medical Return',color:'#fbbf24',icon:'🏥'}, announcement:{label:'Announcement',color:'#f97316',icon:'📢'} };",
    "const MEDICAL_SEVERITY_LABELS = { minor:'Minor', moderate:'Moderate', severe:'Severe', '':'Unknown' };",
    "const MEDICAL_TRAINING_LABELS = { '':'Not set', full:'Full Training', modified:'Modified Training', gymOnly:'Gym Only', noContact:'No Contact', unavailable:'Unavailable' };",
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
    'matchComputeScore',
    'normalizeMedicalRecord',
    'calendarBuildEvents', 'calendarSortEvents', 'calendarFilterEvents',
    'calendarEventsForMonth',
    'dashboardNextTraining', 'dashboardMedicalAlerts',
    'dashboardRecentResult', 'dashboardUpcomingCalendar',
  ];

  const constSrcs = objectConsts.map(extractObjectConst).join(';\n') + ';\n' + literalConsts.join('\n');
  const fnSrcs    = fns.map(extractFn).join('\n');

  const body = `
    "use strict";
    ${constSrcs};
    ${helpers}
    let state = {};
    ${fnSrcs}
    return {
      matchComputeScore, normalizeMedicalRecord,
      dashboardNextTraining, dashboardMedicalAlerts,
      dashboardRecentResult, dashboardUpcomingCalendar,
    };
  `;
  return new Function(body)();
}

// ── dashboardNextTraining ─────────────────────────────────────────────────────

test('dashboardNextTraining: empty schedule returns null', () => {
  const scope = buildScope();
  assert.equal(scope.dashboardNextTraining([], '2026-07-01'), null);
});

test('dashboardNextTraining: null schedule returns null', () => {
  const scope = buildScope();
  assert.equal(scope.dashboardNextTraining(null, '2026-07-01'), null);
});

test('dashboardNextTraining: returns earliest future training session', () => {
  const schedule = [
    { id: 's1', type: 'Training', date: '2026-07-15', title: 'Tue' },
    { id: 's2', type: 'Training', date: '2026-07-08', title: 'Thu' },
    { id: 's3', type: 'Training', date: '2026-07-01', title: 'Old' },
  ];
  const scope = buildScope();
  const r = scope.dashboardNextTraining(schedule, '2026-07-05');
  assert.equal(r.id, 's2');
  assert.equal(r.date, '2026-07-08');
});

test('dashboardNextTraining: skips non-Training sessions', () => {
  const schedule = [
    { id: 'g1', type: 'Match',    date: '2026-07-05', title: 'Game' },
    { id: 's1', type: 'Training', date: '2026-07-08', title: 'Tue' },
  ];
  const scope = buildScope();
  const r = scope.dashboardNextTraining(schedule, '2026-07-01');
  assert.equal(r.id, 's1');
});

test('dashboardNextTraining: skips past sessions', () => {
  const schedule = [
    { id: 's1', type: 'Training', date: '2026-06-01', title: 'Past' },
    { id: 's2', type: 'Training', date: '2026-07-08', title: 'Future' },
  ];
  const scope = buildScope();
  const r = scope.dashboardNextTraining(schedule, '2026-07-05');
  assert.equal(r.id, 's2');
});

test('dashboardNextTraining: includes today\'s session', () => {
  const schedule = [
    { id: 's1', type: 'Training', date: '2026-07-05', title: 'Today' },
  ];
  const scope = buildScope();
  const r = scope.dashboardNextTraining(schedule, '2026-07-05');
  assert.equal(r.id, 's1');
});

test('dashboardNextTraining: all sessions in the past returns null', () => {
  const schedule = [
    { id: 's1', type: 'Training', date: '2026-06-01', title: 'Past' },
  ];
  const scope = buildScope();
  const r = scope.dashboardNextTraining(schedule, '2026-07-05');
  assert.equal(r, null);
});

test('dashboardNextTraining: does not mutate input schedule', () => {
  const schedule = [
    { id: 's2', type: 'Training', date: '2026-07-15', title: 'B' },
    { id: 's1', type: 'Training', date: '2026-07-08', title: 'A' },
  ];
  const before = JSON.stringify(schedule);
  const scope = buildScope();
  scope.dashboardNextTraining(schedule, '2026-07-01');
  assert.equal(JSON.stringify(schedule), before);
});

// ── dashboardMedicalAlerts ────────────────────────────────────────────────────

test('dashboardMedicalAlerts: empty players returns zeroes', () => {
  const scope = buildScope();
  const r = scope.dashboardMedicalAlerts([], {}, {});
  assert.equal(r.total, 0);
  assert.equal(r.alertCount, 0);
  assert.equal(r.rehabCount, 0);
  assert.equal(r.unavailableCount, 0);
});

test('dashboardMedicalAlerts: archived players excluded', () => {
  const players = [
    { id: 'p1', name: 'Alice', trainingStatus: 'unavailable' },
    { id: 'p2', name: 'Bob',   trainingStatus: 'unavailable', lifecycleStatus: 'archived' },
  ];
  const scope = buildScope();
  const r = scope.dashboardMedicalAlerts(players, {}, {});
  assert.equal(r.total, 1);
  assert.equal(r.unavailableCount, 1);
});

test('dashboardMedicalAlerts: trainingStatus=unavailable counts correctly', () => {
  const players = [
    { id: 'p1', name: 'Alice', trainingStatus: 'unavailable' },
    { id: 'p2', name: 'Bob',   trainingStatus: 'full' },
    { id: 'p3', name: 'Carol', trainingStatus: '' },
  ];
  const scope = buildScope();
  const r = scope.dashboardMedicalAlerts(players, {}, {});
  assert.equal(r.unavailableCount, 1);
  assert.equal(r.alertCount, 1);
});

test('dashboardMedicalAlerts: game=injured counts as unavailable', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: '', game: 'injured' }];
  const scope = buildScope();
  const r = scope.dashboardMedicalAlerts(players, {}, {});
  assert.equal(r.unavailableCount, 1);
});

test('dashboardMedicalAlerts: modified/gymOnly/noContact count as rehab', () => {
  const players = [
    { id: 'p1', name: 'A', trainingStatus: 'modified' },
    { id: 'p2', name: 'B', trainingStatus: 'gymOnly' },
    { id: 'p3', name: 'C', trainingStatus: 'noContact' },
    { id: 'p4', name: 'D', trainingStatus: 'full' },
  ];
  const scope = buildScope();
  const r = scope.dashboardMedicalAlerts(players, {}, {});
  assert.equal(r.rehabCount, 3);
});

test('dashboardMedicalAlerts: player with medical string generates alert', () => {
  const players = [
    { id: 'p1', name: 'Alice', trainingStatus: '', game: 'available', medical: 'Knee condition' },
    { id: 'p2', name: 'Bob',   trainingStatus: '', game: 'available', medical: '' },
  ];
  const scope = buildScope();
  const r = scope.dashboardMedicalAlerts(players, {}, {});
  assert.equal(r.alertCount, 1);
  assert.equal(r.alerts[0].player.id, 'p1');
});

test('dashboardMedicalAlerts: severe injury generates alert', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: '', game: 'available', medical: '' }];
  const medRecords = { p1: { severity: 'severe', currentInjury: '' } };
  const scope = buildScope();
  const r = scope.dashboardMedicalAlerts(players, medRecords, {});
  assert.equal(r.alertCount, 1);
});

test('dashboardMedicalAlerts: all clear returns alertCount=0', () => {
  const players = [
    { id: 'p1', name: 'Alice', trainingStatus: 'full', game: 'available', medical: '' },
    { id: 'p2', name: 'Bob',   trainingStatus: 'full', game: 'available', medical: '' },
  ];
  const scope = buildScope();
  const r = scope.dashboardMedicalAlerts(players, {}, {});
  assert.equal(r.alertCount, 0);
  assert.equal(r.rehabCount, 0);
  assert.equal(r.unavailableCount, 0);
});

test('dashboardMedicalAlerts: does not mutate input players', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: 'full', game: 'available' }];
  const before = JSON.stringify(players);
  const scope = buildScope();
  scope.dashboardMedicalAlerts(players, {}, {});
  assert.equal(JSON.stringify(players), before);
});

// ── dashboardRecentResult ─────────────────────────────────────────────────────

test('dashboardRecentResult: no match events returns null', () => {
  const scope = buildScope();
  assert.equal(scope.dashboardRecentResult({}, {}), null);
});

test('dashboardRecentResult: only pre/live/ht status returns null', () => {
  const matchEvents = { '2026-07-05_opp': [{ type: 'try', team: 'us', minute: 10 }] };
  const matchStatus = { '2026-07-05_opp': 'live' };
  const scope = buildScope();
  assert.equal(scope.dashboardRecentResult(matchEvents, matchStatus), null);
});

test('dashboardRecentResult: ft match with events returns result', () => {
  const matchEvents = { '2026-07-05_opp': [{ type: 'try', team: 'us', minute: 10 }] };
  const matchStatus = { '2026-07-05_opp': 'ft' };
  const scope = buildScope();
  const r = scope.dashboardRecentResult(matchEvents, matchStatus);
  assert.ok(r !== null);
  assert.equal(r.score.us, 5);
  assert.equal(r.score.them, 0);
});

test('dashboardRecentResult: returns most recent ft match (by key sort)', () => {
  const matchEvents = {
    '2026-06-01_alpha': [{ type: 'try', team: 'us', minute: 10 }],
    '2026-07-01_beta':  [{ type: 'penalty', team: 'them', minute: 20 }],
  };
  const matchStatus = {
    '2026-06-01_alpha': 'ft',
    '2026-07-01_beta':  'ft',
  };
  const scope = buildScope();
  const r = scope.dashboardRecentResult(matchEvents, matchStatus);
  assert.equal(r.key, '2026-07-01_beta');
  assert.equal(r.score.us,   0);
  assert.equal(r.score.them, 3);
});

test('dashboardRecentResult: ft with empty events is ignored', () => {
  const matchEvents = { '2026-07-05_opp': [] };
  const matchStatus = { '2026-07-05_opp': 'ft' };
  const scope = buildScope();
  assert.equal(scope.dashboardRecentResult(matchEvents, matchStatus), null);
});

test('dashboardRecentResult: date extracted from key', () => {
  const matchEvents = { '2026-07-12_munster': [{ type: 'try', team: 'us', minute: 5 }] };
  const matchStatus = { '2026-07-12_munster': 'ft' };
  const scope = buildScope();
  const r = scope.dashboardRecentResult(matchEvents, matchStatus);
  assert.equal(r.date, '2026-07-12');
});

test('dashboardRecentResult: does not mutate input', () => {
  const matchEvents = { '2026-07-05_opp': [{ type: 'try', team: 'us', minute: 10 }] };
  const matchStatus = { '2026-07-05_opp': 'ft' };
  const beforeE = JSON.stringify(matchEvents);
  const beforeS = JSON.stringify(matchStatus);
  const scope = buildScope();
  scope.dashboardRecentResult(matchEvents, matchStatus);
  assert.equal(JSON.stringify(matchEvents), beforeE);
  assert.equal(JSON.stringify(matchStatus), beforeS);
});

// ── dashboardUpcomingCalendar ─────────────────────────────────────────────────

test('dashboardUpcomingCalendar: empty inputs returns empty array', () => {
  const scope = buildScope();
  const r = scope.dashboardUpcomingCalendar([], [], {}, {}, [], {}, [], '2026-07-01', 5);
  assert.equal(r.length, 0);
});

test('dashboardUpcomingCalendar: only returns future events from today', () => {
  const fixtures = [
    { id: 'fx1', date: '2026-06-15', opposition: 'Past'   },
    { id: 'fx2', date: '2026-07-10', opposition: 'Future' },
  ];
  const scope = buildScope();
  const r = scope.dashboardUpcomingCalendar(fixtures, [], {}, {}, [], {}, [], '2026-07-01', 5);
  assert.equal(r.length, 1);
  assert.ok(r[0].title.includes('Future'));
});

test('dashboardUpcomingCalendar: results are sorted by date ascending', () => {
  const fixtures = [
    { id: 'fx1', date: '2026-07-20', opposition: 'Later'  },
    { id: 'fx2', date: '2026-07-05', opposition: 'Sooner' },
  ];
  const scope = buildScope();
  const r = scope.dashboardUpcomingCalendar(fixtures, [], {}, {}, [], {}, [], '2026-07-01', 5);
  assert.equal(r[0].date, '2026-07-05');
  assert.equal(r[1].date, '2026-07-20');
});

test('dashboardUpcomingCalendar: respects limit parameter', () => {
  const fixtures = Array.from({ length: 10 }, (_, i) => ({
    id: 'fx' + i,
    date: '2026-07-' + String(i + 10).padStart(2, '0'),
    opposition: 'Team ' + i,
  }));
  const scope = buildScope();
  const r = scope.dashboardUpcomingCalendar(fixtures, [], {}, {}, [], {}, [], '2026-07-01', 3);
  assert.equal(r.length, 3);
});

test('dashboardUpcomingCalendar: default limit is 5', () => {
  const fixtures = Array.from({ length: 10 }, (_, i) => ({
    id: 'fx' + i,
    date: '2026-07-' + String(i + 10).padStart(2, '0'),
    opposition: 'Team ' + i,
  }));
  const scope = buildScope();
  const r = scope.dashboardUpcomingCalendar(fixtures, [], {}, {}, [], {}, [], '2026-07-01', undefined);
  assert.equal(r.length, 5);
});

test('dashboardUpcomingCalendar: includes training and fixture events together', () => {
  const fixtures = [{ id: 'fx1', date: '2026-07-10', opposition: 'Alpha' }];
  const sessions = [{ id: 's1', type: 'Training', date: '2026-07-07', title: 'Tue' }];
  const scope = buildScope();
  const r = scope.dashboardUpcomingCalendar(fixtures, sessions, {}, {}, [], {}, [], '2026-07-01', 5);
  assert.equal(r.length, 2);
  assert.equal(r[0].type, 'training');
  assert.equal(r[1].type, 'fixture');
});

test('dashboardUpcomingCalendar: medical return dates included', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: 'noContact' }];
  const medRecords = { p1: { expectedReturn: '2026-07-15' } };
  const scope = buildScope();
  const r = scope.dashboardUpcomingCalendar([], [], {}, {}, players, medRecords, [], '2026-07-01', 5);
  const med = r.find(e => e.type === 'medReturn');
  assert.ok(med);
  assert.ok(med.title.includes('Alice'));
});

test('dashboardUpcomingCalendar: does not mutate inputs', () => {
  const fixtures = [{ id: 'fx1', date: '2026-07-10', opposition: 'Alpha' }];
  const sessions = [{ id: 's1', type: 'Training', date: '2026-07-07', title: 'T' }];
  const beforeF = JSON.stringify(fixtures);
  const beforeS = JSON.stringify(sessions);
  const scope = buildScope();
  scope.dashboardUpcomingCalendar(fixtures, sessions, {}, {}, [], {}, [], '2026-07-01', 5);
  assert.equal(JSON.stringify(fixtures), beforeF);
  assert.equal(JSON.stringify(sessions), beforeS);
});

// ── Integration: empty state summaries ────────────────────────────────────────

test('empty state: all helpers return safe empty values', () => {
  const scope = buildScope();
  const nextTrain    = scope.dashboardNextTraining([], '2026-07-01');
  const medAlerts    = scope.dashboardMedicalAlerts([], {}, {});
  const recentResult = scope.dashboardRecentResult({}, {});
  const upcoming     = scope.dashboardUpcomingCalendar([], [], {}, {}, [], {}, [], '2026-07-01', 5);

  assert.equal(nextTrain, null);
  assert.equal(medAlerts.alertCount, 0);
  assert.equal(medAlerts.total, 0);
  assert.equal(recentResult, null);
  assert.equal(upcoming.length, 0);
});
