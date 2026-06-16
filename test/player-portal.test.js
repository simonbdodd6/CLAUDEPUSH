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

  const fns = [
    'normalizeMedicalRecord',
    'playerPortalNextFixture',
    'playerPortalNextTraining',
    'playerPortalAvailabilityStatus',
    'playerPortalSquadStatus',
    'playerPortalOwnMedical',
    'playerPortalRecentAnnouncement',
    'playerPortalUpcomingEvents',
  ];

  const constSrcs = objectConsts.map(extractObjectConst).join(';\n');
  const fnSrcs    = fns.map(extractFn).join('\n');

  const body = `
    "use strict";
    ${constSrcs};
    ${fnSrcs}
    return {
      normalizeMedicalRecord,
      playerPortalNextFixture,
      playerPortalNextTraining,
      playerPortalAvailabilityStatus,
      playerPortalSquadStatus,
      playerPortalOwnMedical,
      playerPortalRecentAnnouncement,
      playerPortalUpcomingEvents,
    };
  `;
  return new Function(body)();
}

// ── playerPortalNextFixture ───────────────────────────────────────────────────

test('playerPortalNextFixture: empty fixtures returns null', () => {
  const scope = buildScope();
  assert.equal(scope.playerPortalNextFixture([], '2026-07-01'), null);
});

test('playerPortalNextFixture: null fixtures returns null', () => {
  const scope = buildScope();
  assert.equal(scope.playerPortalNextFixture(null, '2026-07-01'), null);
});

test('playerPortalNextFixture: returns earliest future fixture', () => {
  const fixtures = [
    { id: 'f1', date: '2026-07-20', opposition: 'Alpha' },
    { id: 'f2', date: '2026-07-10', opposition: 'Beta'  },
    { id: 'f3', date: '2026-06-01', opposition: 'Past'  },
  ];
  const scope = buildScope();
  const r = scope.playerPortalNextFixture(fixtures, '2026-07-05');
  assert.equal(r.id, 'f2');
});

test('playerPortalNextFixture: skips cancelled fixtures', () => {
  const fixtures = [
    { id: 'f1', date: '2026-07-10', opposition: 'Alpha', status: 'cancelled' },
    { id: 'f2', date: '2026-07-15', opposition: 'Beta'  },
  ];
  const scope = buildScope();
  const r = scope.playerPortalNextFixture(fixtures, '2026-07-01');
  assert.equal(r.id, 'f2');
});

test('playerPortalNextFixture: includes today\'s fixture', () => {
  const fixtures = [{ id: 'f1', date: '2026-07-01', opposition: 'Today' }];
  const scope = buildScope();
  const r = scope.playerPortalNextFixture(fixtures, '2026-07-01');
  assert.equal(r.id, 'f1');
});

test('playerPortalNextFixture: all past returns null', () => {
  const fixtures = [{ id: 'f1', date: '2026-06-01', opposition: 'Past' }];
  const scope = buildScope();
  assert.equal(scope.playerPortalNextFixture(fixtures, '2026-07-01'), null);
});

test('playerPortalNextFixture: does not mutate input', () => {
  const fixtures = [
    { id: 'f2', date: '2026-07-20', opposition: 'Beta'  },
    { id: 'f1', date: '2026-07-10', opposition: 'Alpha' },
  ];
  const before = JSON.stringify(fixtures);
  const scope = buildScope();
  scope.playerPortalNextFixture(fixtures, '2026-07-01');
  assert.equal(JSON.stringify(fixtures), before);
});

// ── playerPortalNextTraining ──────────────────────────────────────────────────

test('playerPortalNextTraining: empty schedule returns null', () => {
  const scope = buildScope();
  assert.equal(scope.playerPortalNextTraining([], '2026-07-01'), null);
});

test('playerPortalNextTraining: null schedule returns null', () => {
  const scope = buildScope();
  assert.equal(scope.playerPortalNextTraining(null, '2026-07-01'), null);
});

test('playerPortalNextTraining: returns earliest future training', () => {
  const schedule = [
    { id: 's1', type: 'Training', date: '2026-07-15', title: 'Thu' },
    { id: 's2', type: 'Training', date: '2026-07-08', title: 'Tue' },
  ];
  const scope = buildScope();
  const r = scope.playerPortalNextTraining(schedule, '2026-07-05');
  assert.equal(r.id, 's2');
});

test('playerPortalNextTraining: skips non-Training session types', () => {
  const schedule = [
    { id: 'g1', type: 'Match',    date: '2026-07-05', title: 'Game' },
    { id: 's1', type: 'Training', date: '2026-07-10', title: 'Tue'  },
  ];
  const scope = buildScope();
  const r = scope.playerPortalNextTraining(schedule, '2026-07-01');
  assert.equal(r.id, 's1');
});

test('playerPortalNextTraining: does not mutate input', () => {
  const schedule = [
    { id: 's2', type: 'Training', date: '2026-07-15', title: 'B' },
    { id: 's1', type: 'Training', date: '2026-07-08', title: 'A' },
  ];
  const before = JSON.stringify(schedule);
  const scope = buildScope();
  scope.playerPortalNextTraining(schedule, '2026-07-01');
  assert.equal(JSON.stringify(schedule), before);
});

// ── playerPortalAvailabilityStatus ────────────────────────────────────────────

test('playerPortalAvailabilityStatus: null player returns no-reply', () => {
  const scope = buildScope();
  const r = scope.playerPortalAvailabilityStatus(null, 'game');
  assert.equal(r.status, 'no-reply');
});

test('playerPortalAvailabilityStatus: player with game=available returns Available', () => {
  const player = { id: 'p1', name: 'Alice', game: 'available' };
  const scope = buildScope();
  const r = scope.playerPortalAvailabilityStatus(player, 'game');
  assert.equal(r.status, 'available');
  assert.equal(r.label, 'Available');
});

test('playerPortalAvailabilityStatus: player with game=unavailable returns Not available', () => {
  const player = { id: 'p1', name: 'Alice', game: 'unavailable' };
  const scope = buildScope();
  const r = scope.playerPortalAvailabilityStatus(player, 'game');
  assert.equal(r.status, 'unavailable');
  assert.equal(r.label, 'Not available');
});

test('playerPortalAvailabilityStatus: game=injured returns Injured', () => {
  const player = { id: 'p1', name: 'Alice', game: 'injured' };
  const scope = buildScope();
  const r = scope.playerPortalAvailabilityStatus(player, 'game');
  assert.equal(r.status, 'injured');
  assert.equal(r.label, 'Injured');
});

test('playerPortalAvailabilityStatus: game=maybe returns Maybe', () => {
  const player = { id: 'p1', name: 'Alice', game: 'maybe' };
  const scope = buildScope();
  const r = scope.playerPortalAvailabilityStatus(player, 'game');
  assert.equal(r.status, 'maybe');
  assert.equal(r.label, 'Maybe');
});

test('playerPortalAvailabilityStatus: missing field returns no-reply', () => {
  const player = { id: 'p1', name: 'Alice' };
  const scope = buildScope();
  const r = scope.playerPortalAvailabilityStatus(player, 'game');
  assert.equal(r.status, 'no-reply');
});

test('playerPortalAvailabilityStatus: tue session maps to trainingTuesday', () => {
  const player = { id: 'p1', name: 'Alice', trainingTuesday: 'available' };
  const scope = buildScope();
  const r = scope.playerPortalAvailabilityStatus(player, 'tue');
  assert.equal(r.status, 'available');
});

test('playerPortalAvailabilityStatus: thu session maps to trainingThursday', () => {
  const player = { id: 'p1', name: 'Alice', trainingThursday: 'unavailable' };
  const scope = buildScope();
  const r = scope.playerPortalAvailabilityStatus(player, 'thu');
  assert.equal(r.status, 'unavailable');
});

test('playerPortalAvailabilityStatus: custom session id uses avail_ prefix', () => {
  const player = { id: 'p1', name: 'Alice', avail_session123: 'maybe' };
  const scope = buildScope();
  const r = scope.playerPortalAvailabilityStatus(player, 'session123');
  assert.equal(r.status, 'maybe');
});

// ── playerPortalSquadStatus ───────────────────────────────────────────────────

test('playerPortalSquadStatus: no published selections returns not-selected', () => {
  const scope = buildScope();
  const r = scope.playerPortalSquadStatus('Alice', [], null, []);
  assert.equal(r.status, 'not-selected');
  assert.equal(r.found, false);
});

test('playerPortalSquadStatus: draft-only selections treated as no published', () => {
  const sels = [{ status: 'draft', starters: { '1': 'alice' }, bench: [] }];
  const scope = buildScope();
  const r = scope.playerPortalSquadStatus('alice', sels, null, []);
  assert.equal(r.found, false);
});

test('playerPortalSquadStatus: player in starters returns starting', () => {
  const sels = [{
    status: 'published',
    fixtureId: 'fx1',
    starters: { '10': 'alice', '12': 'bob' },
    bench: [],
  }];
  const scope = buildScope();
  const r = scope.playerPortalSquadStatus('alice', sels, null, []);
  assert.equal(r.status, 'starting');
  assert.equal(r.slot, '10');
  assert.equal(r.fixtureId, 'fx1');
});

test('playerPortalSquadStatus: player in bench returns bench', () => {
  const sels = [{
    status: 'published',
    fixtureId: 'fx1',
    starters: { '1': 'carol' },
    bench: ['dave', 'alice', 'eve'],
  }];
  const scope = buildScope();
  const r = scope.playerPortalSquadStatus('alice', sels, null, []);
  assert.equal(r.status, 'bench');
  assert.equal(r.slot, '17');
  assert.equal(r.fixtureId, 'fx1');
});

test('playerPortalSquadStatus: player not in selection returns not-selected', () => {
  const sels = [{
    status: 'published',
    fixtureId: 'fx1',
    starters: { '1': 'carol' },
    bench: ['dave'],
  }];
  const scope = buildScope();
  const r = scope.playerPortalSquadStatus('alice', sels, null, []);
  assert.equal(r.status, 'not-selected');
  assert.equal(r.found, true);
});

test('playerPortalSquadStatus: matching is case-insensitive', () => {
  const sels = [{
    status: 'published',
    fixtureId: 'fx1',
    starters: { '9': 'Alice Smith' },
    bench: [],
  }];
  const scope = buildScope();
  const r = scope.playerPortalSquadStatus('alice smith', sels, null, []);
  assert.equal(r.status, 'starting');
});

test('playerPortalSquadStatus: does not mutate input selections', () => {
  const sels = [{
    status: 'published',
    fixtureId: 'fx1',
    starters: { '1': 'alice' },
    bench: [],
  }];
  const before = JSON.stringify(sels);
  const scope = buildScope();
  scope.playerPortalSquadStatus('alice', sels, null, []);
  assert.equal(JSON.stringify(sels), before);
});

// ── playerPortalOwnMedical — privacy tests ────────────────────────────────────

test('playerPortalOwnMedical: no records returns hasRecord=false', () => {
  const scope = buildScope();
  const r = scope.playerPortalOwnMedical('p1', {}, {});
  assert.equal(r.hasRecord, false);
});

test('playerPortalOwnMedical: null playerId returns hasRecord=false', () => {
  const scope = buildScope();
  const medRecords = { p1: { currentInjury: 'Knee' }, p2: { currentInjury: 'Shoulder' } };
  const r = scope.playerPortalOwnMedical(null, medRecords, {});
  assert.equal(r.hasRecord, false);
});

test('playerPortalOwnMedical: CRITICAL — does not expose other players data', () => {
  // medRecords has records for p1 and p2; querying for p1 must NOT surface p2 data
  const scope = buildScope();
  const medRecords = {
    p1: { currentInjury: 'Knee sprain', severity: 'moderate', expectedReturn: '2026-07-15' },
    p2: { currentInjury: 'Shoulder tear', severity: 'severe', expectedReturn: '2026-09-01' },
    p3: { currentInjury: 'Hamstring', severity: 'minor', expectedReturn: '2026-07-05' },
  };
  const r = scope.playerPortalOwnMedical('p1', medRecords, {});

  // Own data is accessible
  assert.equal(r.currentInjury, 'Knee sprain');
  assert.equal(r.severity, 'moderate');
  assert.equal(r.expectedReturn, '2026-07-15');

  // Other players' data is NOT included in the result
  const rStr = JSON.stringify(r);
  assert.ok(!rStr.includes('Shoulder tear'), 'p2 injury must not appear in p1 result');
  assert.ok(!rStr.includes('Hamstring'),     'p3 injury must not appear in p1 result');
  assert.ok(!rStr.includes('severe'),        'p2 severity must not appear in p1 result');
  assert.ok(!rStr.includes('2026-09-01'),    'p2 return date must not appear in p1 result');
  assert.ok(!rStr.includes('2026-07-05'),    'p3 return date must not appear in p1 result');
});

test('playerPortalOwnMedical: returns own record correctly', () => {
  const scope = buildScope();
  const medRecords = { p1: { currentInjury: 'Knee sprain', severity: 'moderate', expectedReturn: '2026-07-15', clearanceStatus: 'Pending' } };
  const r = scope.playerPortalOwnMedical('p1', medRecords, {});
  assert.equal(r.hasRecord, true);
  assert.equal(r.currentInjury, 'Knee sprain');
  assert.equal(r.severity, 'moderate');
  assert.equal(r.expectedReturn, '2026-07-15');
  assert.equal(r.clearanceStatus, 'Pending');
});

test('playerPortalOwnMedical: medNotes for own player included', () => {
  const scope = buildScope();
  const medNotes = { p1: { condition: 'Back stiffness', returnTarget: '2026-07-20' } };
  const r = scope.playerPortalOwnMedical('p1', {}, medNotes);
  assert.equal(r.hasRecord, true);
  assert.equal(r.currentInjury, 'Back stiffness');
  assert.equal(r.expectedReturn, '2026-07-20');
});

test('playerPortalOwnMedical: medNotes from OTHER players not exposed', () => {
  const scope = buildScope();
  const medNotes = {
    p1: { condition: 'Ankle', returnTarget: '2026-07-10' },
    p2: { condition: 'PRIVATE_INJURY', returnTarget: '2026-08-01' },
  };
  const r = scope.playerPortalOwnMedical('p1', {}, medNotes);
  const rStr = JSON.stringify(r);
  assert.ok(!rStr.includes('PRIVATE_INJURY'), 'p2 medNote must not appear in p1 result');
  assert.ok(!rStr.includes('2026-08-01'),      'p2 return date must not appear in p1 result');
});

test('playerPortalOwnMedical: player with no injury hasRecord=false', () => {
  const scope = buildScope();
  const medRecords = { p1: {}, p2: { currentInjury: 'Knee' } };
  const r = scope.playerPortalOwnMedical('p1', medRecords, {});
  assert.equal(r.hasRecord, false);
});

test('playerPortalOwnMedical: does not mutate input medRecords', () => {
  const scope = buildScope();
  const medRecords = { p1: { currentInjury: 'Knee', severity: 'minor' } };
  const before = JSON.stringify(medRecords);
  scope.playerPortalOwnMedical('p1', medRecords, {});
  assert.equal(JSON.stringify(medRecords), before);
});

// ── playerPortalRecentAnnouncement ────────────────────────────────────────────

test('playerPortalRecentAnnouncement: empty announcements returns null', () => {
  const scope = buildScope();
  assert.equal(scope.playerPortalRecentAnnouncement([]), null);
});

test('playerPortalRecentAnnouncement: null returns null', () => {
  const scope = buildScope();
  assert.equal(scope.playerPortalRecentAnnouncement(null), null);
});

test('playerPortalRecentAnnouncement: returns most recent by date', () => {
  const announcements = [
    { title: 'Old',    date: '2026-06-01', body: 'old' },
    { title: 'Recent', date: '2026-07-10', body: 'recent' },
    { title: 'Middle', date: '2026-06-20', body: 'mid' },
  ];
  const scope = buildScope();
  const r = scope.playerPortalRecentAnnouncement(announcements);
  assert.equal(r.title, 'Recent');
  assert.equal(r.date,  '2026-07-10');
});

test('playerPortalRecentAnnouncement: falls back to sentAt if no date field', () => {
  const announcements = [
    { title: 'A', sentAt: '2026-07-05T10:00:00Z', body: '' },
    { title: 'B', sentAt: '2026-06-01T10:00:00Z', body: '' },
  ];
  const scope = buildScope();
  const r = scope.playerPortalRecentAnnouncement(announcements);
  assert.equal(r.title, 'A');
});

test('playerPortalRecentAnnouncement: title defaults if missing', () => {
  const announcements = [{ date: '2026-07-01', body: 'content' }];
  const scope = buildScope();
  const r = scope.playerPortalRecentAnnouncement(announcements);
  assert.equal(r.title, 'Team Announcement');
});

test('playerPortalRecentAnnouncement: result includes body and id', () => {
  const announcements = [{ id: 'ann1', title: 'Meeting', date: '2026-07-01', body: 'See you all there.' }];
  const scope = buildScope();
  const r = scope.playerPortalRecentAnnouncement(announcements);
  assert.equal(r.id,   'ann1');
  assert.equal(r.body, 'See you all there.');
});

test('playerPortalRecentAnnouncement: does not mutate input array', () => {
  const announcements = [
    { title: 'B', date: '2026-07-10', body: '' },
    { title: 'A', date: '2026-06-01', body: '' },
  ];
  const before = JSON.stringify(announcements);
  const scope = buildScope();
  scope.playerPortalRecentAnnouncement(announcements);
  assert.equal(JSON.stringify(announcements), before);
});

// ── playerPortalUpcomingEvents ────────────────────────────────────────────────

test('playerPortalUpcomingEvents: empty inputs returns empty array', () => {
  const scope = buildScope();
  const r = scope.playerPortalUpcomingEvents([], [], '2026-07-01', 5);
  assert.equal(r.length, 0);
});

test('playerPortalUpcomingEvents: skips past events', () => {
  const fixtures = [
    { id: 'f1', date: '2026-06-01', opposition: 'Past'   },
    { id: 'f2', date: '2026-07-10', opposition: 'Future' },
  ];
  const scope = buildScope();
  const r = scope.playerPortalUpcomingEvents(fixtures, [], '2026-07-01', 5);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'f2');
});

test('playerPortalUpcomingEvents: skips cancelled fixtures', () => {
  const fixtures = [
    { id: 'f1', date: '2026-07-10', opposition: 'Alpha', status: 'cancelled' },
    { id: 'f2', date: '2026-07-15', opposition: 'Beta'  },
  ];
  const scope = buildScope();
  const r = scope.playerPortalUpcomingEvents(fixtures, [], '2026-07-01', 5);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'f2');
});

test('playerPortalUpcomingEvents: includes training sessions', () => {
  const schedule = [
    { id: 's1', type: 'Training', date: '2026-07-08', title: 'Tue' },
  ];
  const scope = buildScope();
  const r = scope.playerPortalUpcomingEvents([], schedule, '2026-07-01', 5);
  assert.equal(r.length, 1);
  assert.equal(r[0].type, 'training');
});

test('playerPortalUpcomingEvents: results sorted by date ascending', () => {
  const fixtures = [
    { id: 'f1', date: '2026-07-20', opposition: 'Later'  },
    { id: 'f2', date: '2026-07-05', opposition: 'Sooner' },
  ];
  const scope = buildScope();
  const r = scope.playerPortalUpcomingEvents(fixtures, [], '2026-07-01', 5);
  assert.equal(r[0].date, '2026-07-05');
  assert.equal(r[1].date, '2026-07-20');
});

test('playerPortalUpcomingEvents: respects limit', () => {
  const fixtures = Array.from({ length: 10 }, (_, i) => ({
    id: 'f' + i,
    date: '2026-07-' + String(i + 10).padStart(2, '0'),
    opposition: 'Team ' + i,
  }));
  const scope = buildScope();
  const r = scope.playerPortalUpcomingEvents(fixtures, [], '2026-07-01', 3);
  assert.equal(r.length, 3);
});

test('playerPortalUpcomingEvents: fixture event has title with opposition', () => {
  const fixtures = [{ id: 'f1', date: '2026-07-10', opposition: 'Munster' }];
  const scope = buildScope();
  const r = scope.playerPortalUpcomingEvents(fixtures, [], '2026-07-01', 5);
  assert.ok(r[0].title.includes('Munster'));
  assert.equal(r[0].type, 'fixture');
});

test('playerPortalUpcomingEvents: training event has correct type', () => {
  const schedule = [{ id: 's1', type: 'Training', date: '2026-07-10', title: 'Thursday Session' }];
  const scope = buildScope();
  const r = scope.playerPortalUpcomingEvents([], schedule, '2026-07-01', 5);
  assert.equal(r[0].type, 'training');
  assert.ok(r[0].title.includes('Thursday Session'));
});

test('playerPortalUpcomingEvents: default limit is 5', () => {
  const fixtures = Array.from({ length: 10 }, (_, i) => ({
    id: 'f' + i,
    date: '2026-07-' + String(i + 10).padStart(2, '0'),
    opposition: 'Team ' + i,
  }));
  const scope = buildScope();
  const r = scope.playerPortalUpcomingEvents(fixtures, [], '2026-07-01', undefined);
  assert.equal(r.length, 5);
});

test('playerPortalUpcomingEvents: does not mutate inputs', () => {
  const fixtures = [{ id: 'f2', date: '2026-07-20', opposition: 'Beta'  }, { id: 'f1', date: '2026-07-10', opposition: 'Alpha' }];
  const schedule = [{ id: 's1', type: 'Training', date: '2026-07-15', title: 'T' }];
  const beforeF = JSON.stringify(fixtures);
  const beforeS = JSON.stringify(schedule);
  const scope = buildScope();
  scope.playerPortalUpcomingEvents(fixtures, schedule, '2026-07-01', 5);
  assert.equal(JSON.stringify(fixtures), beforeF);
  assert.equal(JSON.stringify(schedule), beforeS);
});

// ── Integration: empty state ──────────────────────────────────────────────────

test('integration: all helpers return safe empty values from empty state', () => {
  const scope = buildScope();
  assert.equal(scope.playerPortalNextFixture([], '2026-07-01'), null);
  assert.equal(scope.playerPortalNextTraining([], '2026-07-01'), null);
  assert.equal(scope.playerPortalRecentAnnouncement([]), null);
  assert.equal(scope.playerPortalUpcomingEvents([], [], '2026-07-01', 5).length, 0);
  const avail = scope.playerPortalAvailabilityStatus(null, 'game');
  assert.equal(avail.status, 'no-reply');
  const med = scope.playerPortalOwnMedical('p1', {}, {});
  assert.equal(med.hasRecord, false);
});

test('integration: privacy — player sees only own medical among many records', () => {
  const scope = buildScope();
  const medRecords = {};
  // Populate 10 fake players with injuries
  for (let i = 1; i <= 10; i++) {
    medRecords['p' + i] = { currentInjury: 'Injury_' + i, severity: 'moderate', expectedReturn: '2026-07-' + String(i + 10).padStart(2,'0') };
  }
  // Query for p5
  const r = scope.playerPortalOwnMedical('p5', medRecords, {});
  assert.equal(r.currentInjury, 'Injury_5');
  // Verify no other injury text leaked
  const rStr = JSON.stringify(r);
  for (let i = 1; i <= 10; i++) {
    if (i !== 5) {
      assert.ok(!rStr.includes('Injury_' + i), 'Injury_' + i + ' must not appear in p5 result');
    }
  }
});
