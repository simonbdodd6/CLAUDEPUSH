import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(
    `function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`,
    's'
  );
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

function buildScope(extra = {}) {
  const fns = [
    'trainingAttendanceForSession',
    'playerAttendanceHistory',
    'normalizeSessionNotes',
  ];

  // Extract helpers needed by the functions under test
  const helperSrc = `
    function playerIsArchived(p) {
      return !!(p && (p.lifecycleStatus === 'archived' || p._archived === true));
    }
    function activeRosterPlayers(players) {
      return (players || []).filter(p => !playerIsArchived(p));
    }
    function sessionKey(id) {
      if (id === 'tue') return 'trainingTuesday';
      if (id === 'thu') return 'trainingThursday';
      if (id === 'game') return 'game';
      return 'avail_' + id;
    }
  `;

  const fnSrcs = fns.map(extractFn).join('\n');

  const stateRef = extra.state || { players: [], trainingAttendance: {}, sessionNotes: {}, schedule: [] };

  const body = `
    "use strict";
    ${helperSrc}
    let state = ${JSON.stringify(stateRef)};
    ${fnSrcs}
    return {
      trainingAttendanceForSession,
      playerAttendanceHistory,
      normalizeSessionNotes,
    };
  `;
  return new Function(body)();
}

// ── trainingAttendanceForSession ─────────────────────────────────────────────

test('trainingAttendanceForSession: empty attendance returns all noRecord', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ];
  const scope = buildScope({ state: { players, trainingAttendance: {}, schedule: [] } });
  const result = scope.trainingAttendanceForSession('sess1', players);
  assert.equal(result.total, 2);
  assert.equal(result.noRecord, 2);
  assert.equal(result.attended, 0);
  assert.equal(result.pct, 0);
});

test('trainingAttendanceForSession: counts present and late as attended', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Carol' },
    { id: 'p4', name: 'Dave' },
    { id: 'p5', name: 'Eve' },
  ];
  const attMap = { p1: 'present', p2: 'late', p3: 'excused', p4: 'injured', p5: 'absent' };
  const scope = buildScope({
    state: { players, trainingAttendance: { sess1: attMap }, schedule: [] },
  });
  const r = scope.trainingAttendanceForSession('sess1', players);
  assert.equal(r.present,  1);
  assert.equal(r.late,     1);
  assert.equal(r.excused,  1);
  assert.equal(r.injured,  1);
  assert.equal(r.absent,   1);
  assert.equal(r.attended, 2);
  assert.equal(r.noRecord, 0);
  assert.equal(r.pct, 40);
});

test('trainingAttendanceForSession: excludes archived players', () => {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob', lifecycleStatus: 'archived' },
  ];
  const attMap = { p1: 'present', p2: 'present' };
  const scope = buildScope({
    state: { players, trainingAttendance: { s: attMap }, schedule: [] },
  });
  const r = scope.trainingAttendanceForSession('s', players);
  assert.equal(r.total,   1);
  assert.equal(r.present, 1);
  assert.equal(r.pct,     100);
});

test('trainingAttendanceForSession: 0 players → 0% pct', () => {
  const scope = buildScope({ state: { players: [], trainingAttendance: {}, schedule: [] } });
  const r = scope.trainingAttendanceForSession('s', []);
  assert.equal(r.total, 0);
  assert.equal(r.pct, 0);
});

test('trainingAttendanceForSession: unknown session returns empty attMap', () => {
  const players = [{ id: 'p1', name: 'Alice' }];
  const scope = buildScope({ state: { players, trainingAttendance: {}, schedule: [] } });
  const r = scope.trainingAttendanceForSession('no-such-session', players);
  assert.deepEqual(r.attMap, {});
  assert.equal(r.noRecord, 1);
});

test('trainingAttendanceForSession: pct rounds correctly', () => {
  const players = Array.from({ length: 3 }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const attMap = { p0: 'present', p1: 'absent', p2: 'absent' };
  const scope = buildScope({
    state: { players, trainingAttendance: { s: attMap }, schedule: [] },
  });
  const r = scope.trainingAttendanceForSession('s', players);
  assert.equal(r.pct, 33); // Math.round(100 * 1/3)
});

// ── playerAttendanceHistory ──────────────────────────────────────────────────

test('playerAttendanceHistory: no sessions returns null pct', () => {
  const scope = buildScope();
  const r = scope.playerAttendanceHistory('p1', {}, []);
  assert.equal(r.total, 0);
  assert.equal(r.pct, null);
});

test('playerAttendanceHistory: only non-Training sessions ignored', () => {
  const schedSessions = [{ id: 'g1', type: 'Game' }];
  const allAtt = { g1: { p1: 'present' } };
  const scope = buildScope();
  const r = scope.playerAttendanceHistory('p1', allAtt, schedSessions);
  assert.equal(r.total, 0);
  assert.equal(r.pct, null);
});

test('playerAttendanceHistory: present and late count as attended', () => {
  const schedSessions = [
    { id: 's1', type: 'Training' },
    { id: 's2', type: 'Training' },
    { id: 's3', type: 'Training' },
  ];
  const allAtt = {
    s1: { p1: 'present' },
    s2: { p1: 'late' },
    s3: { p1: 'absent' },
  };
  const scope = buildScope();
  const r = scope.playerAttendanceHistory('p1', allAtt, schedSessions);
  assert.equal(r.attended, 2);
  assert.equal(r.missed, 1);
  assert.equal(r.total, 3);
  assert.equal(r.pct, 67);
});

test('playerAttendanceHistory: excused does not count as attended or missed', () => {
  const schedSessions = [
    { id: 's1', type: 'Training' },
    { id: 's2', type: 'Training' },
  ];
  const allAtt = {
    s1: { p1: 'present' },
    s2: { p1: 'excused' },
  };
  const scope = buildScope();
  const r = scope.playerAttendanceHistory('p1', allAtt, schedSessions);
  assert.equal(r.attended, 1);
  assert.equal(r.missed,   0);
  assert.equal(r.excused,  1);
  assert.equal(r.total,    2);
  assert.equal(r.pct, 50);
});

test('playerAttendanceHistory: consecutive present streak', () => {
  const schedSessions = Array.from({ length: 5 }, (_, i) => ({ id: 's' + i, type: 'Training' }));
  const allAtt = {
    s0: { p1: 'present' },
    s1: { p1: 'present' },
    s2: { p1: 'absent'  },
    s3: { p1: 'present' },
    s4: { p1: 'present' },
  };
  const scope = buildScope();
  const r = scope.playerAttendanceHistory('p1', allAtt, schedSessions);
  assert.equal(r.consecutivePresent, 2);
});

test('playerAttendanceHistory: consecutive absent streak', () => {
  const schedSessions = Array.from({ length: 4 }, (_, i) => ({ id: 's' + i, type: 'Training' }));
  const allAtt = {
    s0: { p1: 'present' },
    s1: { p1: 'absent'  },
    s2: { p1: 'absent'  },
    s3: { p1: 'absent'  },
  };
  const scope = buildScope();
  const r = scope.playerAttendanceHistory('p1', allAtt, schedSessions);
  assert.equal(r.consecutiveAbsent, 3);
});

test('playerAttendanceHistory: injured counts as missed', () => {
  const schedSessions = [{ id: 's1', type: 'Training' }];
  const allAtt = { s1: { p1: 'injured' } };
  const scope = buildScope();
  const r = scope.playerAttendanceHistory('p1', allAtt, schedSessions);
  assert.equal(r.missed, 1);
});

test('playerAttendanceHistory: player with no records in any session', () => {
  const schedSessions = [
    { id: 's1', type: 'Training' },
    { id: 's2', type: 'Training' },
  ];
  const allAtt = { s1: { p2: 'present' }, s2: { p2: 'present' } };
  const scope = buildScope();
  const r = scope.playerAttendanceHistory('p1', allAtt, schedSessions);
  assert.equal(r.total,    0);
  assert.equal(r.attended, 0);
  assert.equal(r.pct,      null);
});

test('playerAttendanceHistory: 100% attendance', () => {
  const schedSessions = Array.from({ length: 3 }, (_, i) => ({ id: 's' + i, type: 'Training' }));
  const allAtt = {
    s0: { p1: 'present' },
    s1: { p1: 'present' },
    s2: { p1: 'late'    },
  };
  const scope = buildScope();
  const r = scope.playerAttendanceHistory('p1', allAtt, schedSessions);
  assert.equal(r.pct, 100);
  assert.equal(r.attended, 3);
});

// ── normalizeSessionNotes ────────────────────────────────────────────────────

test('normalizeSessionNotes: null/undefined returns empty object shape', () => {
  const scope = buildScope();
  const r = scope.normalizeSessionNotes(null);
  assert.deepEqual(r, {
    objectives: '', equipment: '', coachingPoints: '', review: '', followUpActions: '',
  });
  const r2 = scope.normalizeSessionNotes(undefined);
  assert.deepEqual(r2, {
    objectives: '', equipment: '', coachingPoints: '', review: '', followUpActions: '',
  });
});

test('normalizeSessionNotes: existing fields are preserved', () => {
  const scope = buildScope();
  const notes = { objectives: 'Win the ruck', equipment: 'Tackle bags', coachingPoints: 'Body height' };
  const r = scope.normalizeSessionNotes(notes);
  assert.equal(r.objectives,     'Win the ruck');
  assert.equal(r.equipment,      'Tackle bags');
  assert.equal(r.coachingPoints, 'Body height');
  assert.equal(r.review,          '');
  assert.equal(r.followUpActions, '');
});

test('normalizeSessionNotes: empty object returns all-empty fields', () => {
  const scope = buildScope();
  const r = scope.normalizeSessionNotes({});
  assert.deepEqual(r, {
    objectives: '', equipment: '', coachingPoints: '', review: '', followUpActions: '',
  });
});

test('normalizeSessionNotes: all five fields survive round-trip', () => {
  const scope = buildScope();
  const notes = {
    objectives: 'A', equipment: 'B', coachingPoints: 'C', review: 'D', followUpActions: 'E',
  };
  const r = scope.normalizeSessionNotes(notes);
  assert.deepEqual(r, notes);
});

test('normalizeSessionNotes: non-object input returns empty shape', () => {
  const scope = buildScope();
  const r = scope.normalizeSessionNotes('bad input');
  assert.deepEqual(r, {
    objectives: '', equipment: '', coachingPoints: '', review: '', followUpActions: '',
  });
});
