/**
 * BUILD O — Club Admin group/team context.
 *
 * Reported from real use while setting up U18 Second: "Club Admin always goes
 * automatically to the senior team." Three real causes, three fixes:
 *
 *  1. Club Admin never showed the club structure at all — the groups/teams
 *     card lived only in Settings, so the only named team on the screen was
 *     the legacy club-wide "Team name". The SAME card is now mounted in Club
 *     Admin too: one implementation, two doors.
 *  2. The card listed groups alphabetically, so Seniors always led. The group
 *     being OPERATED now sorts first and carries an "Operating" pill.
 *  3. The server's operational answer arriving AFTER first paint never
 *     repainted, which is the related "Overview stayed on Seniors until I
 *     refreshed" symptom — fixed once, at adoptIdentityPayload, guarded so a
 *     quiet same-answer poll never triggers a mid-edit render.
 *
 * Permissions are untouched: the card still self-gates on manage_teams, edit
 * rights still come from the server-derived club-wide staff list, and the
 * structure itself is server-scoped per club.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const fn = n => extractFn(html, n);

const STRUCTURE = {
  groups: [
    { id: 'grp_initial', name: 'Seniors', status: 'active', developmentCategory: 'senior' },
    { id: 'grp_u18', name: 'U18', status: 'active', developmentCategory: 'u18' },
  ],
  teams: [
    { id: 'team_prem', groupId: 'grp_initial', name: 'Premier', status: 'active' },
    { id: 'team_dev',  groupId: 'grp_initial', name: 'Premier Development', status: 'active' },
    { id: 'team_u18_1', groupId: 'grp_u18', name: 'U18 First', status: 'active' },
    { id: 'team_u18_2', groupId: 'grp_u18', name: 'U18 Second', status: 'active' },
  ],
};

/** The real structure card over a controlled world. */
function card({ opGid = '', canManage = true, clubWideIds = ['coach1'], structure = STRUCTURE } = {}) {
  return new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: cfg.opGid, currentUserId: 'coach1' };
    const _adminData = { structure: cfg.structure,
      structureAccess: { clubWideStaffIds: cfg.clubWideIds },
      counts: { groups: {}, teams: {} }, clubWideStaff: [] };
    function canI(p) { return p === 'manage_teams' ? cfg.canManage : true; }
    const esc = v => String(v == null ? '' : v);
    const DEVELOPMENT_CATEGORY_LABELS = { unknown: 'Not set', senior: 'Senior', u18: 'U18' };
    function developmentCategoryLabel(c) { return DEVELOPMENT_CATEGORY_LABELS[c] || 'Not set'; }
    ${fn('structureGroupsSorted')}
    ${fn('structureTeamsFor')}
    ${fn('renderClubStructureCard')}
    return renderClubStructureCard();
  `)({ opGid, canManage, clubWideIds, structure });
}

/** The card's GROUP ROWS in render order (each row opens with this border). */
const groupRows = out => out.split('border-radius:11px').slice(1);

// ═══════════════ 1–5: U18 CONTEXT, BOTH TEAMS, SENIORS INTACT ══════════════

test('operating U18: the card leads with U18, marked, with BOTH its teams', () => {
  const out = card({ opGid: 'grp_u18' });
  const rows = groupRows(out);
  assert.ok(rows[0].includes('U18') && !rows[0].includes('Seniors'), 'U18 renders FIRST');
  assert.ok(rows[0].includes('Operating'), 'and is marked as the operating group');
  assert.ok(!rows[1].includes('Operating'), 'the mark is on U18 alone');
  for (const team of ['U18 First', 'U18 Second']) assert.ok(out.includes(team), team + ' visible');
  for (const team of ['Premier', 'Premier Development']) assert.ok(out.includes(team), team + ' still intact');
  assert.ok(out.includes('Add team'), 'team management is reachable');
});

test('operating Seniors: Seniors leads and carries the mark instead', () => {
  const rows = groupRows(card({ opGid: 'grp_initial' }));
  assert.ok(rows[0].includes('Seniors'), 'Seniors first when operating Seniors');
  assert.ok(rows[0].includes('Operating'), 'the mark follows the operating group');
  assert.ok(!rows[1].includes('Operating'), 'and marks only it');
});

test('6+7: switching the operating group flips the order both ways', () => {
  assert.ok(groupRows(card({ opGid: 'grp_u18' }))[0].includes('U18'));
  assert.ok(groupRows(card({ opGid: 'grp_initial' }))[0].includes('Seniors'));
});

test('no operating group: the existing alphabetical order is untouched, no mark', () => {
  const out = card({ opGid: '' });
  assert.ok(groupRows(out)[0].includes('Seniors'), 'stable existing order');
  assert.ok(!out.includes('Operating'), 'nothing is claimed to be operated');
});

// ═══════════════ 12–13: PERMISSIONS UNCHANGED ══════════════════════════════

test('without manage_teams the card renders NOTHING — in Admin exactly as in Settings', () => {
  assert.equal(card({ opGid: 'grp_u18', canManage: false }), '');
});

test('a group-scoped coach still sees the structure READ-ONLY', () => {
  const out = card({ opGid: 'grp_u18', clubWideIds: ['someone-else'] });
  assert.ok(out.includes('U18 First') && out.includes('U18 Second'), 'they can SEE their teams');
  assert.ok(!out.includes('Add team'), 'but cannot create');
  assert.ok(!out.includes('Rename'), 'or rename');
  assert.ok(!out.includes('structureAddGroup'), 'or add groups');
});

test('14: the structure is whatever the SERVER handed this club — nothing else', () => {
  // Cross-club isolation is server-side (?resource=structure is tenant-scoped);
  // the card must render only _adminData.structure, never fetch or invent.
  const src = fn('renderClubStructureCard');
  assert.ok(!/fetch\(/.test(src), 'no request of its own');
  const out = card({ opGid: 'grp_u18', structure: { groups: [], teams: [] } });
  assert.match(out, /No groups yet/, 'an empty club shows an empty club');
});

// ═══════════════ THE TWO DOORS ═════════════════════════════════════════════

test('the SAME card is mounted in Settings AND in Club Admin — one implementation', () => {
  const mounts = html.split("typeof renderClubStructureCard === 'function' ? renderClubStructureCard()").length - 1;
  assert.equal(mounts, 2, 'exactly two mounts');
  const admin = fn('renderClubAdmin');
  assert.ok(admin.includes('renderClubStructureCard'), 'Club Admin mounts it');
  const settings = fn('renderSettings');
  assert.ok(settings.includes('renderClubStructureCard'), 'Settings keeps it');
  assert.equal(html.split('function renderClubStructureCard(').length - 1, 1, 'still ONE implementation');
});

// ═══════════════ 8–10: NAVIGATION AND THE REFRESH SYMPTOM ═════════════════

test('8+9: navigating to Club Admin never touches the operating group', () => {
  const run = new Function('cfg', `
    "use strict";
    const state = { activeView: 'coach', activeCoachSection: cfg.from,
                    operationalGroupId: 'grp_u18', messages: [] };
    function isCoach() { return true; }
    function resolveOperationalGroup() { state._resolved = (state._resolved || 0) + 1; }
    function allowedCoachSections(l) { return l; }
    function playerSectionsFor() { return []; }
    function showToast() {}
    function saveState() {}
    function render() {}
    ${fn('setSection')}
    setSection('coach', 'admin');
    return state;
  `);
  for (const from of ['overview', 'players', 'message']) {
    const s = run({ from });
    assert.equal(s.operationalGroupId, 'grp_u18', `U18 survives ${from} → Club Admin`);
    assert.equal(s.activeCoachSection, 'admin');
  }
});

test('10: the server’s operational answer repaints ONLY when the group changed', () => {
  const run = new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: cfg.before };
    let _myPermissions = null, _myPlatformRole = '', _myMembership = null,
        _myMemberships = [], _verifyNotice = null;
    let _myOperational = null;
    const calls = { renders: 0, resolves: 0 };
    function resolveOperationalGroup() { calls.resolves++; state.operationalGroupId = cfg.resolvesTo; }
    function render() { calls.renders++; }
    function renderVerifyEmailBanner() {}
    ${fn('adoptIdentityPayload')}
    adoptIdentityPayload({ operational: { staff: {}, player: {} } });
    return calls;
  `);
  const changed = run({ before: null, resolvesTo: 'grp_u18' });
  assert.equal(changed.renders, 1, 'a NEW answer repaints — the stuck-until-refresh symptom');
  const same = run({ before: 'grp_u18', resolvesTo: 'grp_u18' });
  assert.equal(same.renders, 0, 'a quiet poll with the same answer never repaints mid-edit');
  assert.equal(same.resolves, 1, 'but still resolves, exactly as before');
});
