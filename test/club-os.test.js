/**
 * Phase 16 — Club Operating System: pure function unit tests.
 *
 * Tests:
 *  1.  normalizeClubProfile: fills all default fields for null input
 *  2.  normalizeClubProfile: preserves supplied fields
 *  3.  normalizeClubProfile: normalizes nested socialLinks
 *  4.  normalizeClubProfile: normalizes trainingVenues array
 *  5.  normalizeClubProfile: normalizes matchVenues array
 *  6.  normalizeVenue: returns null for invalid input
 *  7.  normalizeVenue: preserves venue fields
 *  8.  normalizeClubTeam: returns null for null input
 *  9.  normalizeClubTeam: fills all defaults for empty object
 * 10.  normalizeClubTeam: preserves supplied fields
 * 11.  normalizeClubTeam: active defaults to true
 * 12.  normalizeClubTeam: active=false is preserved
 * 13.  normalizeClubStaff: returns null for null input
 * 14.  normalizeClubStaff: fills all defaults for empty object
 * 15.  normalizeClubStaff: preserves role and title
 * 16.  normalizeSeason: returns null for null input
 * 17.  normalizeSeason: fills all defaults for empty object
 * 18.  normalizeSeason: status defaults to upcoming
 * 19.  normalizeSeason: preserves valid statuses
 * 20.  normalizeSeason: rejects invalid status, defaults to upcoming
 * 21.  normalizeFederationMeta: fills all defaults for null input
 * 22.  normalizeFederationMeta: importMethod defaults to manual
 * 23.  normalizeFederationMeta: preserves all fields
 * 24.  clubDashboardStats: counts players from players array
 * 25.  clubDashboardStats: counts upcoming fixtures correctly
 * 26.  clubDashboardStats: counts published squads
 * 27.  clubDashboardStats: computes availability percentage
 * 28.  clubDashboardStats: returns null availPct when no players have avail
 * 29.  normalizeClubTeam: coachIds defaults to empty array
 * 30.  normalizeClubStaff: teamIds defaults to empty array
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
  // Try 4-space indent (inner functions)
  let start = source.indexOf('    function ' + name + '(');
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

function buildClubScope(opts = {}) {
  const today      = opts.today      || '2026-06-15';
  const fixtures   = opts.fixtures   || [];
  const players    = opts.players    || [];
  const squadSelections = opts.squadSelections || [];
  const schedule   = opts.schedule   || [];
  const clubTeams  = opts.clubTeams  || [];
  const clubStaff  = opts.clubStaff  || [];

  const body = `"use strict";
    const state = {
      fixtures:         ${JSON.stringify(fixtures)},
      players:          ${JSON.stringify(players)},
      squadSelections:  ${JSON.stringify(squadSelections)},
      schedule:         ${JSON.stringify(schedule)},
      clubTeams:        ${JSON.stringify(clubTeams)},
      clubStaff:        ${JSON.stringify(clubStaff)},
      clubName:         '',
      teamName:         '',
      seasonName:       '',
    };
    // Minimal canonicalVisiblePlayers stub — returns players as-is
    function canonicalVisiblePlayers() { return state.players; }
    ${extractFn(html, 'normalizeClubProfile')}
    ${extractFn(html, 'normalizeVenue')}
    ${extractFn(html, 'normalizeClubTeam')}
    ${extractFn(html, 'normalizeClubStaff')}
    ${extractFn(html, 'normalizeSeason')}
    ${extractFn(html, 'normalizeFederationMeta')}
    // Phase 17 helpers needed by clubDashboardStats
    ${extractConst(html, 'PLAYER_LIFECYCLE_LABELS')}
    ${extractFn(html, 'playerIsArchived')}
    ${extractFn(html, 'playerProfileCompleteness')}
    ${extractFn(html, 'playerHasMedicalFlag')}
    ${extractFn(html, 'playerLifecycleStats')}
    ${extractFn(html, 'clubDashboardStats')}
    return {
      normalizeClubProfile,
      normalizeVenue,
      normalizeClubTeam,
      normalizeClubStaff,
      normalizeSeason,
      normalizeFederationMeta,
      clubDashboardStats,
    };
  `;
  return new Function(body)();
}

// ── 1–5. normalizeClubProfile ─────────────────────────────────────────────────

test('normalizeClubProfile: fills all default fields for null input', () => {
  const { normalizeClubProfile } = buildClubScope();
  const r = normalizeClubProfile(null);
  assert.equal(r.address,         '');
  assert.equal(r.country,         '');
  assert.equal(r.governingBody,   '');
  assert.equal(r.website,         '');
  assert.equal(r.contactEmail,    '');
  assert.equal(r.contactPhone,    '');
  assert.equal(r.primaryColour,   '');
  assert.equal(r.secondaryColour, '');
  assert.deepEqual(r.socialLinks, { twitter:'', instagram:'', facebook:'', youtube:'' });
  assert.deepEqual(r.trainingVenues, []);
  assert.deepEqual(r.matchVenues,    []);
});

test('normalizeClubProfile: preserves supplied fields', () => {
  const { normalizeClubProfile } = buildClubScope();
  const r = normalizeClubProfile({
    address: '1 Main St', country: 'Ireland',
    governingBody: 'World Rugby', website: 'https://club.ie',
    contactEmail: 'club@club.ie', contactPhone: '+353 1 234 5678',
    primaryColour: '#003366', secondaryColour: '#FFFFFF',
  });
  assert.equal(r.address,         '1 Main St');
  assert.equal(r.country,         'Ireland');
  assert.equal(r.governingBody,   'World Rugby');
  assert.equal(r.website,         'https://club.ie');
  assert.equal(r.contactEmail,    'club@club.ie');
  assert.equal(r.contactPhone,    '+353 1 234 5678');
  assert.equal(r.primaryColour,   '#003366');
  assert.equal(r.secondaryColour, '#FFFFFF');
});

test('normalizeClubProfile: normalizes nested socialLinks', () => {
  const { normalizeClubProfile } = buildClubScope();
  const r = normalizeClubProfile({
    socialLinks: { twitter: '@myclub', instagram: '@myclub_ig' }
  });
  assert.equal(r.socialLinks.twitter,   '@myclub');
  assert.equal(r.socialLinks.instagram, '@myclub_ig');
  assert.equal(r.socialLinks.facebook,  '');
  assert.equal(r.socialLinks.youtube,   '');
});

test('normalizeClubProfile: normalizes trainingVenues array', () => {
  const { normalizeClubProfile } = buildClubScope();
  const r = normalizeClubProfile({
    trainingVenues: [{ id: 'v1', name: 'Main Pitch', address: 'Pitch Rd' }]
  });
  assert.equal(r.trainingVenues.length, 1);
  assert.equal(r.trainingVenues[0].name, 'Main Pitch');
});

test('normalizeClubProfile: normalizes matchVenues array and filters null', () => {
  const { normalizeClubProfile } = buildClubScope();
  const r = normalizeClubProfile({
    matchVenues: [null, { id: 'mv1', name: 'Stadium' }, undefined]
  });
  assert.equal(r.matchVenues.length, 1);
  assert.equal(r.matchVenues[0].name, 'Stadium');
});

// ── 6–7. normalizeVenue ───────────────────────────────────────────────────────

test('normalizeVenue: returns null for null/falsy input', () => {
  const { normalizeVenue } = buildClubScope();
  assert.equal(normalizeVenue(null),      null);
  assert.equal(normalizeVenue(undefined), null);
  assert.equal(normalizeVenue('string'),  null);
});

test('normalizeVenue: preserves all venue fields', () => {
  const { normalizeVenue } = buildClubScope();
  const r = normalizeVenue({ id:'v1', name:'Main Pitch', address:'Pitch Rd', notes:'Floodlit' });
  assert.equal(r.id,      'v1');
  assert.equal(r.name,    'Main Pitch');
  assert.equal(r.address, 'Pitch Rd');
  assert.equal(r.notes,   'Floodlit');
});

// ── 8–12. normalizeClubTeam ───────────────────────────────────────────────────

test('normalizeClubTeam: returns null for null input', () => {
  const { normalizeClubTeam } = buildClubScope();
  assert.equal(normalizeClubTeam(null),      null);
  assert.equal(normalizeClubTeam(undefined), null);
});

test('normalizeClubTeam: fills all defaults for empty object', () => {
  const { normalizeClubTeam } = buildClubScope();
  const r = normalizeClubTeam({});
  assert.equal(r.id,       '');
  assert.equal(r.name,     '');
  assert.equal(r.ageGroup, '');
  assert.equal(r.gender,   '');
  assert.equal(r.level,    '');
  assert.equal(r.active,   true);
  assert.deepEqual(r.coachIds, []);
});

test('normalizeClubTeam: preserves supplied fields', () => {
  const { normalizeClubTeam } = buildClubScope();
  const r = normalizeClubTeam({ id:'t1', name:'Senior Men', ageGroup:'Senior Men', gender:'Men', level:'1st XV' });
  assert.equal(r.id,       't1');
  assert.equal(r.name,     'Senior Men');
  assert.equal(r.ageGroup, 'Senior Men');
  assert.equal(r.gender,   'Men');
  assert.equal(r.level,    '1st XV');
});

test('normalizeClubTeam: active defaults to true when not specified', () => {
  const { normalizeClubTeam } = buildClubScope();
  assert.equal(normalizeClubTeam({}).active, true);
});

test('normalizeClubTeam: active=false is preserved', () => {
  const { normalizeClubTeam } = buildClubScope();
  assert.equal(normalizeClubTeam({ active: false }).active, false);
});

// ── 13–15. normalizeClubStaff ─────────────────────────────────────────────────

test('normalizeClubStaff: returns null for null input', () => {
  const { normalizeClubStaff } = buildClubScope();
  assert.equal(normalizeClubStaff(null),      null);
  assert.equal(normalizeClubStaff(undefined), null);
});

test('normalizeClubStaff: fills all defaults for empty object', () => {
  const { normalizeClubStaff } = buildClubScope();
  const r = normalizeClubStaff({});
  assert.equal(r.id,      '');
  assert.equal(r.userId,  '');
  assert.equal(r.name,    '');
  assert.equal(r.role,    '');
  assert.equal(r.title,   '');
  assert.equal(r.active,  true);
  assert.deepEqual(r.teamIds, []);
});

test('normalizeClubStaff: preserves role and title', () => {
  const { normalizeClubStaff } = buildClubScope();
  const r = normalizeClubStaff({ id:'s1', name:'Bob', role:'Head Coach', title:'Director of Rugby' });
  assert.equal(r.name,  'Bob');
  assert.equal(r.role,  'Head Coach');
  assert.equal(r.title, 'Director of Rugby');
});

// ── 16–20. normalizeSeason ────────────────────────────────────────────────────

test('normalizeSeason: returns null for null input', () => {
  const { normalizeSeason } = buildClubScope();
  assert.equal(normalizeSeason(null),      null);
  assert.equal(normalizeSeason(undefined), null);
});

test('normalizeSeason: fills all defaults for empty object', () => {
  const { normalizeSeason } = buildClubScope();
  const r = normalizeSeason({});
  assert.equal(r.id,        '');
  assert.equal(r.name,      '');
  assert.equal(r.startDate, '');
  assert.equal(r.endDate,   '');
  assert.equal(r.status,    'upcoming');
});

test('normalizeSeason: status defaults to upcoming when not set', () => {
  const { normalizeSeason } = buildClubScope();
  assert.equal(normalizeSeason({ name: '2026/27' }).status, 'upcoming');
});

test('normalizeSeason: preserves valid statuses', () => {
  const { normalizeSeason } = buildClubScope();
  assert.equal(normalizeSeason({ status: 'current'  }).status, 'current');
  assert.equal(normalizeSeason({ status: 'archived' }).status, 'archived');
  assert.equal(normalizeSeason({ status: 'upcoming' }).status, 'upcoming');
});

test('normalizeSeason: rejects invalid status and defaults to upcoming', () => {
  const { normalizeSeason } = buildClubScope();
  assert.equal(normalizeSeason({ status: 'unknown_thing' }).status, 'upcoming');
});

// ── 21–23. normalizeFederationMeta ───────────────────────────────────────────

test('normalizeFederationMeta: fills all defaults for null input', () => {
  const { normalizeFederationMeta } = buildClubScope();
  const r = normalizeFederationMeta(null);
  assert.equal(r.federationName,    '');
  assert.equal(r.competitionSystem, '');
  assert.equal(r.fixtureSource,     '');
  assert.equal(r.clubIdentifier,    '');
  assert.equal(r.importMethod,      'manual');
  assert.equal(r.status,            '');
});

test('normalizeFederationMeta: importMethod defaults to manual', () => {
  const { normalizeFederationMeta } = buildClubScope();
  assert.equal(normalizeFederationMeta({}).importMethod, 'manual');
});

test('normalizeFederationMeta: preserves all supplied fields', () => {
  const { normalizeFederationMeta } = buildClubScope();
  const r = normalizeFederationMeta({
    federationName: 'World Rugby', competitionSystem: 'URC',
    fixtureSource: 'https://uru.ie', clubIdentifier: 'IRL-001',
    importMethod: 'csv', status: 'Active',
  });
  assert.equal(r.federationName,    'World Rugby');
  assert.equal(r.competitionSystem, 'URC');
  assert.equal(r.fixtureSource,     'https://uru.ie');
  assert.equal(r.clubIdentifier,    'IRL-001');
  assert.equal(r.importMethod,      'csv');
  assert.equal(r.status,            'Active');
});

// ── 24–28. clubDashboardStats ─────────────────────────────────────────────────

test('clubDashboardStats: counts players from players array', () => {
  const { clubDashboardStats } = buildClubScope({
    players: [{ id:'p1', name:'A' }, { id:'p2', name:'B' }],
  });
  const s = clubDashboardStats();
  assert.equal(s.players.length, 2);
});

test('clubDashboardStats: counts upcoming fixtures (date >= today)', () => {
  const { clubDashboardStats } = buildClubScope({
    fixtures: [
      { id:'f1', date:'2026-06-20', opposition:'Munster' },
      { id:'f2', date:'2026-06-10', opposition:'Leinster' }, // past
      { id:'f3', date:'2026-06-15', opposition:'Ulster'  }, // today = included
    ],
  });
  const s = clubDashboardStats();
  assert.equal(s.upcomingFx.length, 2, 'today and future count; past excluded');
});

test('clubDashboardStats: counts published squads', () => {
  const { clubDashboardStats } = buildClubScope({
    squadSelections: [
      { id:'s1', status:'published', announcementStatus:'not_announced' },
      { id:'s2', status:'draft',     announcementStatus:'not_announced' },
      { id:'s3', status:'published', announcementStatus:'announced'     },
    ],
  });
  const s = clubDashboardStats();
  assert.equal(s.pubSquads.length,    2, 'two published squads');
  assert.equal(s.announcements.length, 1, 'one announced');
});

test('clubDashboardStats: computes availability percentage correctly', () => {
  const { clubDashboardStats } = buildClubScope({
    players: [
      { id:'p1', game:'available' },
      { id:'p2', game:'available' },
      { id:'p3', game:'unavailable' },
      { id:'p4', game:'available' },
    ],
  });
  const s = clubDashboardStats();
  assert.equal(s.availPct, 75, '3/4 available = 75%');
});

test('clubDashboardStats: availPct is null when no players have game field', () => {
  const { clubDashboardStats } = buildClubScope({
    players: [{ id:'p1', name:'A' }, { id:'p2', name:'B' }],
  });
  const s = clubDashboardStats();
  assert.equal(s.availPct, null);
});

// ── 29–30. Edge cases ─────────────────────────────────────────────────────────

test('normalizeClubTeam: coachIds defaults to empty array when missing', () => {
  const { normalizeClubTeam } = buildClubScope();
  assert.deepEqual(normalizeClubTeam({}).coachIds, []);
  const r = normalizeClubTeam({ coachIds: ['u1','u2'] });
  assert.deepEqual(r.coachIds, ['u1','u2']);
});

test('normalizeClubStaff: teamIds defaults to empty array when missing', () => {
  const { normalizeClubStaff } = buildClubScope();
  assert.deepEqual(normalizeClubStaff({}).teamIds, []);
  const r = normalizeClubStaff({ teamIds: ['t1','t2'] });
  assert.deepEqual(r.teamIds, ['t1','t2']);
});
