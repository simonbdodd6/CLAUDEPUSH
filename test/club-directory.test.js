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

  const helpers = `
    function playerIsArchived(p) {
      return !!(p && (p.lifecycleStatus === 'archived' || p._archived === true));
    }
  `;

  const fns = [
    'normalizeMedicalRecord',
    'matchComputeScore',
    'clubOverviewSummary',
    'clubTeamsSummary',
    'clubSeasonSnapshot',
    'clubMedicalSnapshot',
    'clubQuickLinks',
  ];

  const constSrcs = objectConsts.map(extractObjectConst).join(';\n');
  const fnSrcs    = fns.map(extractFn).join('\n');

  const body = `
    "use strict";
    ${constSrcs};
    ${helpers}
    let state = {};
    ${fnSrcs}
    return {
      clubOverviewSummary, clubTeamsSummary, clubSeasonSnapshot,
      clubMedicalSnapshot, clubQuickLinks,
    };
  `;
  return new Function(body)();
}

// ── clubOverviewSummary ───────────────────────────────────────────────────────

test('clubOverviewSummary: empty club returns zeroed counts', () => {
  const { clubOverviewSummary } = buildScope();
  const r = clubOverviewSummary('', '', '', 'Rugby', [], [], [], [], [], '2026-07-01');
  assert.equal(r.playerCount, 0);
  assert.equal(r.teamCount, 0);
  assert.equal(r.coachCount, 0);
  assert.equal(r.upcomingFixtures, 0);
  assert.equal(r.upcomingSessions, 0);
});

test('clubOverviewSummary: returns club name, team, season, sport', () => {
  const { clubOverviewSummary } = buildScope();
  const r = clubOverviewSummary('Harlequins RFC', 'Seniors', '2025/26', 'Rugby', [], [], [], [], [], '2026-07-01');
  assert.equal(r.clubName,   'Harlequins RFC');
  assert.equal(r.teamName,   'Seniors');
  assert.equal(r.seasonName, '2025/26');
  assert.equal(r.sport,      'Rugby');
});

test('clubOverviewSummary: active player count excludes archived', () => {
  const { clubOverviewSummary } = buildScope();
  const players = [
    { id: 'p1', name: 'A' },
    { id: 'p2', name: 'B', lifecycleStatus: 'archived' },
    { id: 'p3', name: 'C', _archived: true },
  ];
  const r = clubOverviewSummary('', '', '', '', players, [], [], [], [], '2026-07-01');
  assert.equal(r.playerCount, 1);
});

test('clubOverviewSummary: team count from teams array', () => {
  const { clubOverviewSummary } = buildScope();
  const teams = [{ id: 't1', name: 'Seniors' }, { id: 't2', name: 'U20' }];
  const r = clubOverviewSummary('', '', '', '', [], teams, [], [], [], '2026-07-01');
  assert.equal(r.teamCount, 2);
});

test('clubOverviewSummary: coachCount counts staff with coach/director/analyst in role', () => {
  const { clubOverviewSummary } = buildScope();
  const staff = [
    { id: 's1', name: 'A', role: 'Head Coach' },
    { id: 's2', name: 'B', role: 'Analyst' },
    { id: 's3', name: 'C', role: 'Director of Rugby' },
    { id: 's4', name: 'D', role: 'Physiotherapist' },
    { id: 's5', name: 'E', role: 'Manager' },
  ];
  const r = clubOverviewSummary('', '', '', '', [], [], staff, [], [], '2026-07-01');
  assert.equal(r.coachCount, 3);
});

test('clubOverviewSummary: upcomingFixtures excludes past and cancelled', () => {
  const { clubOverviewSummary } = buildScope();
  const fixtures = [
    { id: 'f1', date: '2026-06-01', opposition: 'Past' },
    { id: 'f2', date: '2026-08-01', opposition: 'Future' },
    { id: 'f3', date: '2026-09-01', opposition: 'Cancelled', status: 'cancelled' },
  ];
  const r = clubOverviewSummary('', '', '', '', [], [], [], fixtures, [], '2026-07-01');
  assert.equal(r.upcomingFixtures, 1);
});

test('clubOverviewSummary: upcomingSessions counts only future Training type', () => {
  const { clubOverviewSummary } = buildScope();
  const schedule = [
    { id: 's1', type: 'Training', date: '2026-07-10' },
    { id: 's2', type: 'Training', date: '2026-06-01' },
    { id: 's3', type: 'Match',    date: '2026-08-01' },
  ];
  const r = clubOverviewSummary('', '', '', '', [], [], [], [], schedule, '2026-07-01');
  assert.equal(r.upcomingSessions, 1);
});

test('clubOverviewSummary: defaults sport to Rugby when empty', () => {
  const { clubOverviewSummary } = buildScope();
  const r = clubOverviewSummary('', '', '', '', [], [], [], [], [], '2026-07-01');
  assert.equal(r.sport, 'Rugby');
});

test('clubOverviewSummary: does not mutate input arrays', () => {
  const { clubOverviewSummary } = buildScope();
  const players  = [{ id: 'p1', name: 'A' }];
  const fixtures = [{ id: 'f1', date: '2026-08-01', opposition: 'B' }];
  const beforeP  = JSON.stringify(players);
  const beforeF  = JSON.stringify(fixtures);
  clubOverviewSummary('', '', '', '', players, [], [], fixtures, [], '2026-07-01');
  assert.equal(JSON.stringify(players),  beforeP);
  assert.equal(JSON.stringify(fixtures), beforeF);
});

// ── clubTeamsSummary ──────────────────────────────────────────────────────────

test('clubTeamsSummary: empty teams returns empty array', () => {
  const { clubTeamsSummary } = buildScope();
  assert.deepEqual(clubTeamsSummary([], [], [], [], '2026-07-01'), []);
});

test('clubTeamsSummary: null teams returns empty array', () => {
  const { clubTeamsSummary } = buildScope();
  assert.deepEqual(clubTeamsSummary(null, [], [], [], '2026-07-01'), []);
});

test('clubTeamsSummary: returns one summary per team', () => {
  const { clubTeamsSummary } = buildScope();
  const teams = [{ id: 't1', name: 'Seniors' }, { id: 't2', name: 'U20' }];
  const r = clubTeamsSummary(teams, [], [], [], '2026-07-01');
  assert.equal(r.length, 2);
});

test('clubTeamsSummary: each summary has id, name, playerCount, nextFixture, nextTraining', () => {
  const { clubTeamsSummary } = buildScope();
  const teams = [{ id: 't1', name: 'Seniors', ageGroup: 'Senior Men' }];
  const r = clubTeamsSummary(teams, [], [], [], '2026-07-01');
  assert.equal(r[0].id,       't1');
  assert.equal(r[0].name,     'Seniors');
  assert.equal(r[0].ageGroup, 'Senior Men');
  assert.equal(typeof r[0].playerCount, 'number');
  assert.ok('nextFixture'  in r[0]);
  assert.ok('nextTraining' in r[0]);
});

test('clubTeamsSummary: playerCount includes only players on that team', () => {
  const { clubTeamsSummary } = buildScope();
  const teams   = [{ id: 't1', name: 'Seniors' }, { id: 't2', name: 'U20' }];
  const players = [
    { id: 'p1', name: 'A', team: 't1' },
    { id: 'p2', name: 'B', team: 't1' },
    { id: 'p3', name: 'C', team: 't2' },
  ];
  const r = clubTeamsSummary(teams, players, [], [], '2026-07-01');
  const seniors = r.find(t => t.id === 't1');
  const u20     = r.find(t => t.id === 't2');
  assert.equal(seniors.playerCount, 2);
  assert.equal(u20.playerCount,     1);
});

test('clubTeamsSummary: archived players not counted', () => {
  const { clubTeamsSummary } = buildScope();
  const teams   = [{ id: 't1', name: 'Seniors' }];
  const players = [
    { id: 'p1', name: 'A', team: 't1' },
    { id: 'p2', name: 'B', team: 't1', lifecycleStatus: 'archived' },
  ];
  const r = clubTeamsSummary(teams, players, [], [], '2026-07-01');
  assert.equal(r[0].playerCount, 1);
});

test('clubTeamsSummary: nextFixture is earliest future fixture', () => {
  const { clubTeamsSummary } = buildScope();
  const teams    = [{ id: 't1', name: 'Seniors' }];
  const fixtures = [
    { id: 'f1', date: '2026-08-15', opposition: 'Later'  },
    { id: 'f2', date: '2026-07-10', opposition: 'Sooner' },
  ];
  const r = clubTeamsSummary(teams, [], fixtures, [], '2026-07-01');
  assert.equal(r[0].nextFixture?.opposition, 'Sooner');
});

test('clubTeamsSummary: nextFixture is null when no future fixtures', () => {
  const { clubTeamsSummary } = buildScope();
  const teams    = [{ id: 't1', name: 'Seniors' }];
  const fixtures = [{ id: 'f1', date: '2026-06-01', opposition: 'Past' }];
  const r = clubTeamsSummary(teams, [], fixtures, [], '2026-07-01');
  assert.equal(r[0].nextFixture, null);
});

test('clubTeamsSummary: cancelled fixtures excluded from next fixture', () => {
  const { clubTeamsSummary } = buildScope();
  const teams    = [{ id: 't1', name: 'Seniors' }];
  const fixtures = [{ id: 'f1', date: '2026-07-10', opposition: 'Alpha', status: 'cancelled' }];
  const r = clubTeamsSummary(teams, [], fixtures, [], '2026-07-01');
  assert.equal(r[0].nextFixture, null);
});

test('clubTeamsSummary: does not mutate input arrays', () => {
  const { clubTeamsSummary } = buildScope();
  const teams   = [{ id: 't1', name: 'Seniors' }];
  const players = [{ id: 'p1', team: 't1', name: 'A' }];
  const before  = JSON.stringify(teams);
  const beforeP = JSON.stringify(players);
  clubTeamsSummary(teams, players, [], [], '2026-07-01');
  assert.equal(JSON.stringify(teams),   before);
  assert.equal(JSON.stringify(players), beforeP);
});

// ── clubSeasonSnapshot ────────────────────────────────────────────────────────

test('clubSeasonSnapshot: all empty returns zeroes', () => {
  const { clubSeasonSnapshot } = buildScope();
  const r = clubSeasonSnapshot([], [], {}, {}, '2026-07-01');
  assert.equal(r.fixturesPlayed,    0);
  assert.equal(r.fixturesRemaining, 0);
  assert.equal(r.wins,    0);
  assert.equal(r.draws,   0);
  assert.equal(r.losses,  0);
  assert.equal(r.sessionsCompleted, 0);
  assert.equal(r.sessionsScheduled, 0);
});

test('clubSeasonSnapshot: played and remaining fixtures counted correctly', () => {
  const { clubSeasonSnapshot } = buildScope();
  const fixtures = [
    { id: 'f1', date: '2026-06-01', opposition: 'Past1' },
    { id: 'f2', date: '2026-06-15', opposition: 'Past2' },
    { id: 'f3', date: '2026-08-01', opposition: 'Future' },
  ];
  const r = clubSeasonSnapshot(fixtures, [], {}, {}, '2026-07-01');
  assert.equal(r.fixturesPlayed,    2);
  assert.equal(r.fixturesRemaining, 1);
});

test('clubSeasonSnapshot: cancelled fixtures not counted in remaining', () => {
  const { clubSeasonSnapshot } = buildScope();
  const fixtures = [
    { id: 'f1', date: '2026-08-01', opposition: 'Future', status: 'cancelled' },
    { id: 'f2', date: '2026-08-10', opposition: 'Valid' },
  ];
  const r = clubSeasonSnapshot(fixtures, [], {}, {}, '2026-07-01');
  assert.equal(r.fixturesRemaining, 1);
});

test('clubSeasonSnapshot: wins draws losses computed from match events', () => {
  const { clubSeasonSnapshot } = buildScope();
  const fixtures = [
    { id: 'f1', date: '2026-06-01', opposition: 'Alpha' },
    { id: 'f2', date: '2026-06-08', opposition: 'Beta'  },
    { id: 'f3', date: '2026-06-15', opposition: 'Gamma' },
  ];
  const evMap = {
    '2026-06-01_alpha': [{ type: 'try', team: 'us', minute: 5 }, { type: 'try', team: 'us', minute: 20 }],
    '2026-06-08_beta':  [{ type: 'try', team: 'them', minute: 10 }],
    '2026-06-15_gamma': [{ type: 'try', team: 'us', minute: 5 }, { type: 'try', team: 'them', minute: 10 }],
  };
  const stMap = {
    '2026-06-01_alpha': 'ft',
    '2026-06-08_beta':  'ft',
    '2026-06-15_gamma': 'ft',
  };
  const r = clubSeasonSnapshot(fixtures, [], evMap, stMap, '2026-07-01');
  assert.equal(r.wins,   1);
  assert.equal(r.losses, 1);
  assert.equal(r.draws,  1);
});

test('clubSeasonSnapshot: sessions completed and scheduled counted', () => {
  const { clubSeasonSnapshot } = buildScope();
  const schedule = [
    { id: 's1', type: 'Training', date: '2026-06-01' },
    { id: 's2', type: 'Training', date: '2026-06-15' },
    { id: 's3', type: 'Training', date: '2026-07-10' },
    { id: 's4', type: 'Match',    date: '2026-07-12' },
  ];
  const r = clubSeasonSnapshot([], schedule, {}, {}, '2026-07-01');
  assert.equal(r.sessionsCompleted, 2);
  assert.equal(r.sessionsScheduled, 1);
});

test('clubSeasonSnapshot: does not mutate inputs', () => {
  const { clubSeasonSnapshot } = buildScope();
  const fixtures = [{ id: 'f1', date: '2026-06-01', opposition: 'A' }];
  const before   = JSON.stringify(fixtures);
  clubSeasonSnapshot(fixtures, [], {}, {}, '2026-07-01');
  assert.equal(JSON.stringify(fixtures), before);
});

// ── clubMedicalSnapshot ───────────────────────────────────────────────────────

test('clubMedicalSnapshot: no players returns zeroes', () => {
  const { clubMedicalSnapshot } = buildScope();
  const r = clubMedicalSnapshot([], {});
  assert.equal(r.available, 0);
  assert.equal(r.injured,   0);
  assert.equal(r.rehab,     0);
  assert.equal(r.returningThisWeek, 0);
  assert.equal(r.total, 0);
});

test('clubMedicalSnapshot: unavailable status counts as injured', () => {
  const { clubMedicalSnapshot } = buildScope();
  const players = [{ id: 'p1', name: 'A', trainingStatus: 'unavailable' }];
  const r = clubMedicalSnapshot(players, {});
  assert.equal(r.injured, 1);
  assert.equal(r.total,   1);
});

test('clubMedicalSnapshot: game=injured counts as injured', () => {
  const { clubMedicalSnapshot } = buildScope();
  const players = [{ id: 'p1', name: 'A', game: 'injured' }];
  const r = clubMedicalSnapshot(players, {});
  assert.equal(r.injured, 1);
});

test('clubMedicalSnapshot: modified/gymOnly/noContact count as rehab', () => {
  const { clubMedicalSnapshot } = buildScope();
  const players = [
    { id: 'p1', name: 'A', trainingStatus: 'modified'  },
    { id: 'p2', name: 'B', trainingStatus: 'gymOnly'   },
    { id: 'p3', name: 'C', trainingStatus: 'noContact' },
  ];
  const r = clubMedicalSnapshot(players, {});
  assert.equal(r.rehab, 3);
});

test('clubMedicalSnapshot: players with no status count as available', () => {
  const { clubMedicalSnapshot } = buildScope();
  const players = [
    { id: 'p1', name: 'A', trainingStatus: 'full' },
    { id: 'p2', name: 'B' },
  ];
  const r = clubMedicalSnapshot(players, {});
  assert.equal(r.available, 2);
});

test('clubMedicalSnapshot: archived players excluded', () => {
  const { clubMedicalSnapshot } = buildScope();
  const players = [
    { id: 'p1', name: 'A', trainingStatus: 'full' },
    { id: 'p2', name: 'B', lifecycleStatus: 'archived', trainingStatus: 'full' },
  ];
  const r = clubMedicalSnapshot(players, {});
  assert.equal(r.total, 1);
});

test('clubMedicalSnapshot: does not mutate input players', () => {
  const { clubMedicalSnapshot } = buildScope();
  const players = [{ id: 'p1', name: 'A', trainingStatus: 'modified' }];
  const before  = JSON.stringify(players);
  clubMedicalSnapshot(players, {});
  assert.equal(JSON.stringify(players), before);
});

test('clubMedicalSnapshot: does not mutate input medRecords', () => {
  const { clubMedicalSnapshot } = buildScope();
  const medRecords = { p1: { currentInjury: 'Knee', severity: 'moderate' } };
  const before     = JSON.stringify(medRecords);
  clubMedicalSnapshot([{ id: 'p1', name: 'A' }], medRecords);
  assert.equal(JSON.stringify(medRecords), before);
});

// ── clubQuickLinks ────────────────────────────────────────────────────────────

test('clubQuickLinks: returns array with at least 5 links', () => {
  const { clubQuickLinks } = buildScope();
  const links = clubQuickLinks();
  assert.ok(Array.isArray(links));
  assert.ok(links.length >= 5, 'must have at least 5 quick links');
});

test('clubQuickLinks: each link has label, section, icon', () => {
  const { clubQuickLinks } = buildScope();
  const links = clubQuickLinks();
  links.forEach(lk => {
    assert.ok(typeof lk.label   === 'string' && lk.label.length > 0,   'link.label must be non-empty');
    assert.ok(typeof lk.section === 'string' && lk.section.length > 0, 'link.section must be non-empty');
    assert.ok(typeof lk.icon    === 'string' && lk.icon.length > 0,    'link.icon must be non-empty');
  });
});

test('clubQuickLinks: all section ids are non-empty strings', () => {
  const { clubQuickLinks } = buildScope();
  const links = clubQuickLinks();
  const sections = links.map(lk => lk.section);
  assert.ok(sections.every(s => typeof s === 'string' && s.length > 0));
});

test('clubQuickLinks: output is identical on repeated calls (deterministic)', () => {
  const { clubQuickLinks } = buildScope();
  const a = JSON.stringify(clubQuickLinks());
  const b = JSON.stringify(clubQuickLinks());
  assert.equal(a, b);
});

test('clubQuickLinks: does not reference Simon Test Player', () => {
  const { clubQuickLinks } = buildScope();
  const links = clubQuickLinks();
  const str   = JSON.stringify(links);
  assert.ok(!str.toLowerCase().includes('simon'));
  assert.ok(!str.includes('coach-demo'));
});

// ── Integration: empty and populated states ───────────────────────────────────

test('integration: empty club produces safe zero-value summary', () => {
  const { clubOverviewSummary, clubTeamsSummary, clubSeasonSnapshot, clubMedicalSnapshot, clubQuickLinks } = buildScope();

  const ov = clubOverviewSummary('', '', '', '', [], [], [], [], [], '2026-07-01');
  assert.equal(ov.playerCount, 0);
  assert.equal(ov.teamCount,   0);
  assert.equal(ov.coachCount,  0);

  const teams = clubTeamsSummary([], [], [], [], '2026-07-01');
  assert.deepEqual(teams, []);

  const season = clubSeasonSnapshot([], [], {}, {}, '2026-07-01');
  assert.equal(season.wins + season.draws + season.losses, 0);

  const med = clubMedicalSnapshot([], {});
  assert.equal(med.total, 0);

  const links = clubQuickLinks();
  assert.ok(links.length >= 5);
});

test('integration: populated club returns non-trivial summaries', () => {
  const { clubOverviewSummary, clubTeamsSummary, clubSeasonSnapshot, clubMedicalSnapshot } = buildScope();

  const players = [
    { id: 'p1', name: 'Alice', team: 't1', trainingStatus: 'full' },
    { id: 'p2', name: 'Bob',   team: 't1', trainingStatus: 'unavailable' },
    { id: 'p3', name: 'Carol', team: 't2', trainingStatus: 'modified' },
    { id: 'p4', name: 'Dave',  team: 't2', lifecycleStatus: 'archived' },
  ];
  const teams = [
    { id: 't1', name: 'Seniors', ageGroup: 'Senior Men' },
    { id: 't2', name: 'U20',     ageGroup: 'U20' },
  ];
  const fixtures = [
    { id: 'f1', date: '2026-06-01', opposition: 'Past'   },
    { id: 'f2', date: '2026-08-01', opposition: 'Future' },
  ];
  const schedule = [
    { id: 's1', type: 'Training', date: '2026-06-10' },
    { id: 's2', type: 'Training', date: '2026-08-05' },
  ];
  const staff = [{ id: 'st1', name: 'Nick', role: 'Head Coach' }];

  const ov = clubOverviewSummary('RFC', 'Seniors', '25/26', 'Rugby', players, teams, staff, fixtures, schedule, '2026-07-01');
  assert.equal(ov.playerCount,       3); // 4 total - 1 archived
  assert.equal(ov.teamCount,         2);
  assert.equal(ov.coachCount,        1);
  assert.equal(ov.upcomingFixtures,  1);
  assert.equal(ov.upcomingSessions,  1);

  const ts = clubTeamsSummary(teams, players, fixtures, schedule, '2026-07-01');
  assert.equal(ts.length, 2);
  const seniors = ts.find(t => t.id === 't1');
  assert.equal(seniors.playerCount, 2);

  const snap = clubSeasonSnapshot(fixtures, schedule, {}, {}, '2026-07-01');
  assert.equal(snap.fixturesPlayed,    1);
  assert.equal(snap.fixturesRemaining, 1);
  assert.equal(snap.sessionsCompleted, 1);
  assert.equal(snap.sessionsScheduled, 1);

  const med = clubMedicalSnapshot(players, {});
  assert.equal(med.total,     3); // 4 - 1 archived
  assert.equal(med.available, 1);
  assert.equal(med.injured,   1);
  assert.equal(med.rehab,     1);
});

// ── Source-level checks ───────────────────────────────────────────────────────

test('directory tab added to renderClubSection', () => {
  assert.ok(src.includes("id:'directory'"), 'renderClubSection must include directory tab');
  assert.ok(src.includes("renderClubDirectory()"), 'renderClubSection must call renderClubDirectory');
});

test('no new API files added', () => {
  const apiFiles = fs.readdirSync(new URL('../api', import.meta.url)).filter(f => f.endsWith('.js'));
  // clubOverviewSummary and related helpers must NOT appear in API files
  apiFiles.forEach(f => {
    const apiSrc = fs.readFileSync(new URL(`../api/${f}`, import.meta.url), 'utf8');
    assert.ok(!apiSrc.includes('clubOverviewSummary'), `API file ${f} must not contain clubOverviewSummary`);
  });
});
