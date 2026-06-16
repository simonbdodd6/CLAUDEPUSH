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
  // CALENDAR_EVENT_TYPES has nested objects — hardcode to avoid regex mismatch
  const literalConsts = [
    "const CALENDAR_EVENT_TYPES = { fixture:{label:'Fixture',color:'#34d399',icon:'🏆'}, training:{label:'Training',color:'#60a5fa',icon:'🏉'}, matchReport:{label:'Match Report',color:'#a78bfa',icon:'📋'}, medReturn:{label:'Medical Return',color:'#fbbf24',icon:'🏥'}, announcement:{label:'Announcement',color:'#f97316',icon:'📢'} };",
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
    'calendarBuildEvents', 'calendarSortEvents', 'calendarFilterEvents',
    'calendarEventsForMonth', 'calendarCurrentYearMonth', 'calendarMonthGrid',
    'calendarGroupByDate', 'calendarNavMonth', 'calendarMonthLabel',
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
      matchComputeScore,
      calendarBuildEvents, calendarSortEvents, calendarFilterEvents,
      calendarEventsForMonth, calendarCurrentYearMonth, calendarMonthGrid,
      calendarGroupByDate, calendarNavMonth, calendarMonthLabel,
    };
  `;
  return new Function(body)();
}

// ── calendarBuildEvents ───────────────────────────────────────────────────────

test('calendarBuildEvents: empty inputs returns empty array', () => {
  const scope = buildScope();
  const r = scope.calendarBuildEvents([], [], {}, {}, [], {}, []);
  assert.equal(r.length, 0);
});

test('calendarBuildEvents: fixtures produce fixture events', () => {
  const fixtures = [
    { id: 'fx1', date: '2026-07-05', opposition: 'Leinster', competition: 'Cup', venue: 'Aviva' },
  ];
  const scope = buildScope();
  const evts = scope.calendarBuildEvents(fixtures, [], {}, {}, [], {}, []);
  const fx = evts.find(e => e.type === 'fixture');
  assert.ok(fx, 'should have a fixture event');
  assert.equal(fx.date, '2026-07-05');
  assert.ok(fx.title.includes('Leinster'));
});

test('calendarBuildEvents: fixture without date is skipped', () => {
  const fixtures = [{ id: 'fx1', date: '', opposition: 'Missing date' }];
  const scope = buildScope();
  const evts = scope.calendarBuildEvents(fixtures, [], {}, {}, [], {}, []);
  assert.equal(evts.length, 0);
});

test('calendarBuildEvents: training sessions produce training events', () => {
  const sessions = [
    { id: 's1', type: 'Training', date: '2026-07-08', title: 'Tuesday Training', location: 'Gym' },
  ];
  const scope = buildScope();
  const evts = scope.calendarBuildEvents([], sessions, {}, {}, [], {}, []);
  const tr = evts.find(e => e.type === 'training');
  assert.ok(tr, 'should have a training event');
  assert.equal(tr.date, '2026-07-08');
  assert.ok(tr.title.includes('Tuesday Training'));
});

test('calendarBuildEvents: training sessions without dates are skipped', () => {
  const sessions = [{ id: 's1', type: 'Training', date: '', title: 'Untimed training' }];
  const scope = buildScope();
  const evts = scope.calendarBuildEvents([], sessions, {}, {}, [], {}, []);
  assert.equal(evts.length, 0);
});

test('calendarBuildEvents: match events produce matchReport events', () => {
  const matchEvents = {
    '2026-07-12_munster': [
      { type: 'try', team: 'us', minute: 10 },
      { type: 'conversion', team: 'us', minute: 11 },
    ],
  };
  const scope = buildScope();
  const evts = scope.calendarBuildEvents([], [], matchEvents, {}, [], {}, []);
  const mr = evts.find(e => e.type === 'matchReport');
  assert.ok(mr, 'should have a matchReport event');
  assert.equal(mr.date, '2026-07-12');
  assert.ok(mr.subtitle.includes('7'));  // try + conversion = 7
});

test('calendarBuildEvents: match events with bad key format are skipped', () => {
  const matchEvents = {
    'current': [{ type: 'try', team: 'us', minute: 10 }],
    'invalid_key': [{ type: 'try', team: 'us', minute: 5 }],
  };
  const scope = buildScope();
  const evts = scope.calendarBuildEvents([], [], matchEvents, {}, [], {}, []);
  assert.equal(evts.filter(e => e.type === 'matchReport').length, 0);
});

test('calendarBuildEvents: empty matchEvents array is skipped', () => {
  const matchEvents = { '2026-07-12_opp': [] };
  const scope = buildScope();
  const evts = scope.calendarBuildEvents([], [], matchEvents, {}, [], {}, []);
  assert.equal(evts.filter(e => e.type === 'matchReport').length, 0);
});

test('calendarBuildEvents: medical return dates produce medReturn events', () => {
  const players = [{ id: 'p1', name: 'Alice', trainingStatus: 'noContact' }];
  const medRecords = { p1: { expectedReturn: '2026-08-01', currentInjury: 'Hamstring', severity: 'moderate' } };
  const scope = buildScope();
  const evts = scope.calendarBuildEvents([], [], {}, {}, players, medRecords, []);
  const mr = evts.find(e => e.type === 'medReturn');
  assert.ok(mr, 'should have a medReturn event');
  assert.equal(mr.date, '2026-08-01');
  assert.ok(mr.title.includes('Alice'));
});

test('calendarBuildEvents: archived players excluded from medical returns', () => {
  const players = [
    { id: 'p1', name: 'Alice', lifecycleStatus: 'archived' },
    { id: 'p2', name: 'Bob' },
  ];
  const medRecords = {
    p1: { expectedReturn: '2026-08-01' },
    p2: { expectedReturn: '2026-08-05' },
  };
  const scope = buildScope();
  const evts = scope.calendarBuildEvents([], [], {}, {}, players, medRecords, []);
  const medEvts = evts.filter(e => e.type === 'medReturn');
  assert.equal(medEvts.length, 1);
  assert.ok(medEvts[0].title.includes('Bob'));
});

test('calendarBuildEvents: announcements with date produce announcement events', () => {
  const announcements = [
    { id: 'a1', date: '2026-07-15', title: 'Squad night out', body: 'Bring your boots' },
  ];
  const scope = buildScope();
  const evts = scope.calendarBuildEvents([], [], {}, {}, [], {}, announcements);
  const a = evts.find(e => e.type === 'announcement');
  assert.ok(a, 'should have an announcement event');
  assert.equal(a.date, '2026-07-15');
  assert.ok(a.title.includes('Squad night out'));
});

test('calendarBuildEvents: announcement with sentAt (not date) is included', () => {
  const announcements = [
    { id: 'a1', sentAt: '2026-07-16T10:00:00Z', title: 'Match day brief' },
  ];
  const scope = buildScope();
  const evts = scope.calendarBuildEvents([], [], {}, {}, [], {}, announcements);
  const a = evts.find(e => e.type === 'announcement');
  assert.ok(a);
  assert.equal(a.date, '2026-07-16');
});

test('calendarBuildEvents: announcement with no date is skipped', () => {
  const announcements = [{ id: 'a1', title: 'Undated note' }];
  const scope = buildScope();
  const evts = scope.calendarBuildEvents([], [], {}, {}, [], {}, announcements);
  assert.equal(evts.filter(e => e.type === 'announcement').length, 0);
});

test('calendarBuildEvents: does not mutate input arrays', () => {
  const fixtures     = [{ id: 'fx1', date: '2026-07-05', opposition: 'Team' }];
  const sessions     = [{ id: 's1', type: 'Training', date: '2026-07-08', title: 'T' }];
  const announcements= [{ id: 'a1', date: '2026-07-10', title: 'Note' }];
  const beforeFx = JSON.stringify(fixtures);
  const beforeSe = JSON.stringify(sessions);
  const beforeAn = JSON.stringify(announcements);
  const scope = buildScope();
  scope.calendarBuildEvents(fixtures, sessions, {}, {}, [], {}, announcements);
  assert.equal(JSON.stringify(fixtures),      beforeFx);
  assert.equal(JSON.stringify(sessions),      beforeSe);
  assert.equal(JSON.stringify(announcements), beforeAn);
});

// ── calendarSortEvents ────────────────────────────────────────────────────────

test('calendarSortEvents: empty array returns empty', () => {
  const scope = buildScope();
  assert.deepEqual(scope.calendarSortEvents([]), []);
});

test('calendarSortEvents: events sorted by date ascending', () => {
  const events = [
    { id: 'b', date: '2026-07-10', type: 'training', title: 'B' },
    { id: 'a', date: '2026-07-05', type: 'fixture',  title: 'A' },
    { id: 'c', date: '2026-07-20', type: 'medReturn',title: 'C' },
  ];
  const scope = buildScope();
  const sorted = scope.calendarSortEvents(events);
  assert.equal(sorted[0].date, '2026-07-05');
  assert.equal(sorted[1].date, '2026-07-10');
  assert.equal(sorted[2].date, '2026-07-20');
});

test('calendarSortEvents: same date sorted by type', () => {
  const events = [
    { id: 'b', date: '2026-07-10', type: 'training', title: 'B' },
    { id: 'a', date: '2026-07-10', type: 'fixture',  title: 'A' },
  ];
  const scope = buildScope();
  const sorted = scope.calendarSortEvents(events);
  // 'fixture' < 'training' alphabetically
  assert.equal(sorted[0].type, 'fixture');
  assert.equal(sorted[1].type, 'training');
});

test('calendarSortEvents: does not mutate input array', () => {
  const events = [
    { id: 'b', date: '2026-07-10', type: 'training', title: 'B' },
    { id: 'a', date: '2026-07-05', type: 'fixture',  title: 'A' },
  ];
  const before = JSON.stringify(events);
  const scope = buildScope();
  scope.calendarSortEvents(events);
  assert.equal(JSON.stringify(events), before);
});

// ── calendarFilterEvents ──────────────────────────────────────────────────────

test('calendarFilterEvents: filter=all returns all', () => {
  const events = [
    { id: 'a', type: 'fixture' },
    { id: 'b', type: 'training' },
  ];
  const scope = buildScope();
  assert.equal(scope.calendarFilterEvents(events, 'all').length, 2);
});

test('calendarFilterEvents: filter=null/undefined returns all', () => {
  const events = [{ id: 'a', type: 'fixture' }, { id: 'b', type: 'training' }];
  const scope = buildScope();
  assert.equal(scope.calendarFilterEvents(events, null).length, 2);
  assert.equal(scope.calendarFilterEvents(events, undefined).length, 2);
});

test('calendarFilterEvents: filter by type returns only matching', () => {
  const events = [
    { id: 'a', type: 'fixture' },
    { id: 'b', type: 'training' },
    { id: 'c', type: 'fixture' },
  ];
  const scope = buildScope();
  const result = scope.calendarFilterEvents(events, 'fixture');
  assert.equal(result.length, 2);
  result.forEach(e => assert.equal(e.type, 'fixture'));
});

test('calendarFilterEvents: filter with no match returns empty', () => {
  const events = [{ id: 'a', type: 'fixture' }];
  const scope = buildScope();
  const result = scope.calendarFilterEvents(events, 'announcement');
  assert.equal(result.length, 0);
});

test('calendarFilterEvents: does not mutate input', () => {
  const events = [{ id: 'a', type: 'fixture' }, { id: 'b', type: 'training' }];
  const before = JSON.stringify(events);
  const scope = buildScope();
  scope.calendarFilterEvents(events, 'fixture');
  assert.equal(JSON.stringify(events), before);
});

// ── calendarEventsForMonth ────────────────────────────────────────────────────

test('calendarEventsForMonth: returns only events for the given month', () => {
  const events = [
    { id: 'a', date: '2026-07-05', type: 'fixture' },
    { id: 'b', date: '2026-08-10', type: 'training' },
    { id: 'c', date: '2026-07-20', type: 'medReturn' },
  ];
  const scope = buildScope();
  const result = scope.calendarEventsForMonth(events, '2026-07');
  assert.equal(result.length, 2);
  result.forEach(e => assert.ok(e.date.startsWith('2026-07')));
});

test('calendarEventsForMonth: empty yearMonth returns all', () => {
  const events = [
    { id: 'a', date: '2026-07-05', type: 'fixture' },
    { id: 'b', date: '2026-08-10', type: 'training' },
  ];
  const scope = buildScope();
  assert.equal(scope.calendarEventsForMonth(events, '').length, 2);
  assert.equal(scope.calendarEventsForMonth(events, null).length, 2);
});

test('calendarEventsForMonth: month with no events returns empty', () => {
  const events = [{ id: 'a', date: '2026-07-05', type: 'fixture' }];
  const scope = buildScope();
  assert.equal(scope.calendarEventsForMonth(events, '2026-08').length, 0);
});

// ── calendarCurrentYearMonth ──────────────────────────────────────────────────

test('calendarCurrentYearMonth: returns YYYY-MM format', () => {
  const scope = buildScope();
  const ym = scope.calendarCurrentYearMonth();
  assert.ok(/^\d{4}-\d{2}$/.test(ym), 'should be YYYY-MM: ' + ym);
});

// ── calendarMonthGrid ─────────────────────────────────────────────────────────

test('calendarMonthGrid: July 2026 has 31 days in grid', () => {
  const scope = buildScope();
  const grid = scope.calendarMonthGrid('2026-07');
  const dateCells = grid.filter(c => c !== null);
  assert.equal(dateCells.length, 31);
});

test('calendarMonthGrid: February 2028 (leap year) has 29 days', () => {
  const scope = buildScope();
  const grid = scope.calendarMonthGrid('2028-02');
  const dateCells = grid.filter(c => c !== null);
  assert.equal(dateCells.length, 29);
});

test('calendarMonthGrid: February 2026 (non-leap) has 28 days', () => {
  const scope = buildScope();
  const grid = scope.calendarMonthGrid('2026-02');
  const dateCells = grid.filter(c => c !== null);
  assert.equal(dateCells.length, 28);
});

test('calendarMonthGrid: total cells is a multiple of 7', () => {
  const scope = buildScope();
  const grid = scope.calendarMonthGrid('2026-07');
  assert.equal(grid.length % 7, 0);
});

test('calendarMonthGrid: first day is correct', () => {
  // July 1 2026 is a Wednesday — offset from Mon start = 2 null cells
  const scope = buildScope();
  const grid = scope.calendarMonthGrid('2026-07');
  const firstDateIdx = grid.findIndex(c => c !== null);
  // Wed = index 2 from Mon
  assert.equal(firstDateIdx, 2);
  assert.equal(grid[firstDateIdx], '2026-07-01');
});

// ── calendarGroupByDate ───────────────────────────────────────────────────────

test('calendarGroupByDate: groups events by date', () => {
  const events = [
    { id: 'a', date: '2026-07-05', type: 'fixture' },
    { id: 'b', date: '2026-07-05', type: 'training' },
    { id: 'c', date: '2026-07-10', type: 'medReturn' },
  ];
  const scope = buildScope();
  const map = scope.calendarGroupByDate(events);
  assert.equal(Object.keys(map).length, 2);
  assert.equal(map['2026-07-05'].length, 2);
  assert.equal(map['2026-07-10'].length, 1);
});

test('calendarGroupByDate: events without date are skipped', () => {
  const events = [
    { id: 'a', date: '', type: 'fixture' },
    { id: 'b', date: '2026-07-05', type: 'training' },
  ];
  const scope = buildScope();
  const map = scope.calendarGroupByDate(events);
  assert.equal(Object.keys(map).length, 1);
});

test('calendarGroupByDate: empty array returns empty map', () => {
  const scope = buildScope();
  assert.deepEqual(scope.calendarGroupByDate([]), {});
});

// ── calendarNavMonth ──────────────────────────────────────────────────────────

test('calendarNavMonth: next from July 2026 → August 2026', () => {
  const scope = buildScope();
  assert.equal(scope.calendarNavMonth('2026-07', 1), '2026-08');
});

test('calendarNavMonth: prev from July 2026 → June 2026', () => {
  const scope = buildScope();
  assert.equal(scope.calendarNavMonth('2026-07', -1), '2026-06');
});

test('calendarNavMonth: next from December wraps to January', () => {
  const scope = buildScope();
  assert.equal(scope.calendarNavMonth('2026-12', 1), '2027-01');
});

test('calendarNavMonth: prev from January wraps to December', () => {
  const scope = buildScope();
  assert.equal(scope.calendarNavMonth('2026-01', -1), '2025-12');
});

// ── calendarMonthLabel ────────────────────────────────────────────────────────

test('calendarMonthLabel: returns human readable month label', () => {
  const scope = buildScope();
  const label = scope.calendarMonthLabel('2026-07');
  assert.ok(label.includes('July'), 'should include July: ' + label);
  assert.ok(label.includes('2026'), 'should include 2026: ' + label);
});

test('calendarMonthLabel: empty string returns empty string', () => {
  const scope = buildScope();
  assert.equal(scope.calendarMonthLabel(''), '');
});

// ── Integration: full pipeline ────────────────────────────────────────────────

test('full pipeline: build → sort → filter → group', () => {
  const fixtures = [
    { id: 'fx1', date: '2026-07-05', opposition: 'Alpha' },
    { id: 'fx2', date: '2026-07-20', opposition: 'Beta' },
  ];
  const sessions = [
    { id: 's1', type: 'Training', date: '2026-07-08', title: 'Tue training' },
  ];
  const scope = buildScope();
  const all    = scope.calendarBuildEvents(fixtures, sessions, {}, {}, [], {}, []);
  const month  = scope.calendarEventsForMonth(all, '2026-07');
  const sorted = scope.calendarSortEvents(month);
  const grouped = scope.calendarGroupByDate(sorted);

  assert.equal(sorted.length, 3);
  assert.equal(sorted[0].date, '2026-07-05');
  assert.equal(sorted[1].date, '2026-07-08');
  assert.equal(sorted[2].date, '2026-07-20');
  assert.ok(grouped['2026-07-05']);
  assert.ok(grouped['2026-07-08']);
});

test('full pipeline: filter to training only', () => {
  const fixtures = [{ id: 'fx1', date: '2026-07-05', opposition: 'Alpha' }];
  const sessions = [{ id: 's1', type: 'Training', date: '2026-07-08', title: 'Tue' }];
  const scope = buildScope();
  const all      = scope.calendarBuildEvents(fixtures, sessions, {}, {}, [], {}, []);
  const filtered = scope.calendarFilterEvents(all, 'training');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].type, 'training');
});

test('empty month: build events gives none, month filter returns empty', () => {
  const fixtures = [{ id: 'fx1', date: '2026-08-15', opposition: 'Alpha' }];
  const scope = buildScope();
  const all    = scope.calendarBuildEvents(fixtures, [], {}, {}, [], {}, []);
  const month  = scope.calendarEventsForMonth(all, '2026-07');
  assert.equal(month.length, 0);
});
