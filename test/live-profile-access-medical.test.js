/**
 * RC4.7 — live behaviour fixes found in production testing.
 *
 *  1. Edit profile left First/Last name and Age group blank even though the
 *     linked identity and club structure already held them.
 *  2. The per-player "Can be picked for" checklist offered a choice the club
 *     does not make — every player in a group is eligible for every team in it.
 *  3. An ordinary player was LABELLED "Full access". The server granted them
 *     nothing, so this was display-only, but the label must match reality.
 *  4. The Medical page listed the whole roster and rendered healthy players as
 *     "available". It is a case list, not a roster.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Slice a top-level function body out of index.html. */
function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('{', start), depth = 0, end = i;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}
/**
 * Evaluate helpers together in one scope, with a stubbed _adminData plus the
 * few module-level constants/helpers they close over. Those come from the real
 * source where practical so the test still tracks the product.
 */
function constFromSrc(name) {
  const m = src.match(new RegExp(`const ${name} = (\\{[^}]*\\}|'[^']*'|false|true);`));
  assert.ok(m, `${name} found in source`);
  return `const ${name} = ${m[1]};`;
}
function scope(names, adminData, extras = []) {
  const body = names.map(fn).join('\n');
  return new Function(`
    const _adminData = arguments[0];
    ${extras.join('\n')}
    ${body}
    return { ${names.join(', ')} };`)(adminData);
}

const STRUCTURE = {
  groups: [
    { id: 'g-sen', name: 'Seniors', status: 'active' },
    { id: 'g-u18', name: 'U18', status: 'active' },
    { id: 'g-old', name: 'Veterans', status: 'archived' },
  ],
  teams: [
    { id: 't-prem', groupId: 'g-sen', name: 'Premier', status: 'active' },
    { id: 't-dev', groupId: 'g-sen', name: 'Premier Development', status: 'active' },
    { id: 't-gone', groupId: 'g-sen', name: 'Old Boys', status: 'archived' },
    { id: 't-u18', groupId: 'g-u18', name: 'U18', status: 'active' },
    { id: 't-vets', groupId: 'g-old', name: 'Vets', status: 'active' },
  ],
};

// ── 1. PROFILE AUTO-FILL ───────────────────────────────────────────────────
test('first and last name derive from the linked identity when the row has none', () => {
  const admin = {
    structure: STRUCTURE,
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active' }],
    users: [{ id: 'u1', displayName: 'Sean O Brien' }],
  };
  const { derivedPlayerName } = scope(['splitIdentityName', 'memberForPlayer', 'derivedPlayerName'], admin);

  const blank = derivedPlayerName({ userId: 'u1', name: 'Sean O Brien' });
  assert.equal(blank.firstName, 'Sean');
  assert.equal(blank.lastName, 'O Brien', 'multi-word surnames stay intact');

  // An explicit stored name is authoritative and never replaced by identity.
  const explicit = derivedPlayerName({ userId: 'u1', name: 'Sean O Brien', firstName: 'Seánie', lastName: 'OB' });
  assert.deepEqual(explicit, { firstName: 'Seánie', lastName: 'OB' });

  // No identity linkage at all → fall back to the roster name, never crash.
  const orphan = derivedPlayerName({ name: 'Unlinked Player' });
  assert.equal(orphan.firstName, 'Unlinked');
});

test('age group derives from the club structure, including the single-group case', () => {
  // D1a: the explicit PLAYER group is what names the age group. (This fixture
  // used to express "explicit" as an accessScope grant; that is staff access,
  // and the assertion below now proves it confers no age group at all.)
  const explicitScope = {
    structure: STRUCTURE,
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active', playerGroupId: 'g-u18' }],
    users: [{ id: 'u1', displayName: 'Young Player' }],
  };
  const a = scope(['memberScope', 'memberForPlayer', 'derivedAgeGroup'], explicitScope);
  assert.equal(a.derivedAgeGroup({ userId: 'u1' }), 'U18', 'explicit player group wins');

  // The production case: a player with NO stored scope in a club that has a
  // single active group. This previously derived nothing and left the box blank.
  const oneGroup = {
    structure: { groups: [{ id: 'g-sen', name: 'Seniors', status: 'active' }],
                 teams: [{ id: 't-prem', groupId: 'g-sen', name: 'Premier', status: 'active' }] },
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active' }],
    users: [{ id: 'u1', displayName: 'Legacy Player' }],
  };
  const b = scope(['memberScope', 'memberForPlayer', 'derivedAgeGroup'], oneGroup);
  assert.equal(b.derivedAgeGroup({ userId: 'u1' }), 'Seniors', 'single active group is unambiguous');

  // Ambiguous (several groups, no grant) stays blank rather than guessing.
  const c = scope(['memberScope', 'memberForPlayer', 'derivedAgeGroup'], {
    structure: STRUCTURE,
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active' }],
    users: [{ id: 'u1', displayName: 'Ambiguous' }],
  });
  assert.equal(c.derivedAgeGroup({ userId: 'u1' }), '', 'never guesses between groups');
  // An archived group is never offered as the answer.
  assert.equal(a.derivedAgeGroup({ userId: 'nobody' }), '');

  // D1a: staff access is where you COACH, never where you play. A Seniors
  // coach with no player group must not read as a Seniors player.
  const staffOnly = scope(['memberScope', 'memberForPlayer', 'derivedAgeGroup'], {
    structure: STRUCTURE,
    members: [{ id: 'tm1', userId: 'u1', role: 'coach', status: 'active',
      accessScope: { clubWide: false, groups: [{ groupId: 'g-sen', status: 'active' }], teams: [] } }],
    users: [{ id: 'u1', displayName: 'Coach' }],
  });
  assert.equal(staffOnly.derivedAgeGroup({ userId: 'u1' }), '', 'staff access confers no age group');
});

test('the form reads the derived values, and joined date stays stable', () => {
  assert.match(src, /field\('First name',\s*'pp-firstname-'\+id,\s*derivedPlayerName\(p\)\.firstName\)/,
    'first name field uses the derivation');
  assert.match(src, /field\('Last name',\s*'pp-lastname-'\+id,\s*derivedPlayerName\(p\)\.lastName\)/,
    'last name field uses the derivation');
  assert.match(src, /derivedAgeGroup\(p\)/, 'age group field uses the derivation');

  const joined = fn('derivedJoinedDate');
  assert.match(joined, /if \(player\.joinedDate\) return player\.joinedDate/,
    'an existing historical joined date always wins and is never reset');

  // Preferred name stays out of the edit UI and is never blanked on save.
  assert.equal(src.includes("field('Preferred name'"), false);
  assert.equal(src.includes('pp-preferred-'), false);
  assert.equal(/p\.preferredName\s*=\s*g\(/.test(fn('playerSaveProfile')), false);
});

test('roster rows created from identity carry name parts and registration', () => {
  const sync = src.slice(src.indexOf('profiles.forEach(profile =>'));
  const creation = sync.slice(0, sync.indexOf('state.players.push(player)'));
  // The sync splits the name inline: several test harnesses evaluate this
  // function standalone, so it must not depend on a module-level helper.
  assert.match(creation, /firstName: String\(name \|\| ''\)\.trim\(\)\.split/);
  assert.match(creation, /lastName:\s*String\(name \|\| ''\)\.trim\(\)\.split/);
  assert.match(creation, /registrationStatus: 'registered'/);
  // Existing rows are backfilled only when BOTH parts are blank.
  assert.match(sync, /if \(!String\(player\.firstName \|\| ''\)\.trim\(\) && !String\(player\.lastName \|\| ''\)\.trim\(\)\)/,
    'never overwrites an explicit historical name');
});

// ── 2. ELIGIBILITY PICKER WITHDRAWN (model intact) ─────────────────────────
test('the per-player eligibility checklist is withdrawn from the Members UI', () => {
  assert.match(src, /const ELIGIBILITY_PICKER_ENABLED = false/, 'picker disabled by a single flag');
  const elig = fn('renderEligibilitySection');
  assert.match(elig, /if \(!ELIGIBILITY_PICKER_ENABLED\)/, 'guarded before any checkbox is rendered');
  // The replacement states what is already true, with no per-team control.
  assert.match(elig, /every player in this group is available for selection/i);
  const shown = elig.slice(elig.indexOf('!ELIGIBILITY_PICKER_ENABLED'), elig.indexOf('return `', elig.indexOf('!ELIGIBILITY_PICKER_ENABLED')) + 700);
  assert.equal(/type="checkbox"/.test(shown), false, 'no eligibility checkbox in the shown branch');
});

test('team names are derived, never hard-coded', () => {
  const elig = fn('renderEligibilitySection');
  const memberElig = fn('memberEligibility');
  for (const literal of ['Premier Development', 'Premier', 'Seniors']) {
    assert.equal(elig.includes(`'${literal}'`), false, `must not hard-code "${literal}"`);
    assert.equal(memberElig.includes(`'${literal}'`), false, `must not hard-code "${literal}"`);
  }
  assert.match(elig, /options\.filter\(t => elig\.teamIds\.includes\(t\.id\)\)/,
    'names come from the club structure');
});

test('the underlying eligibility model is preserved for future use', () => {
  // The derivation, the toggles and the server action all still exist — only
  // the picker is hidden, so Phase D can restore it by flipping the flag.
  for (const name of ['memberEligibility', 'adminToggleEligibility', 'adminSetPrimaryTeam']) {
    assert.ok(src.includes(`function ${name}(`), `${name} retained`);
  }
  assert.match(src, /action: 'set_member_eligibility'/, 'server action retained');
});

test('derived eligibility covers every active team in the group and nothing else', () => {
  // Shared-squad model: the client derives from playerGroupId (where a
  // person PLAYS) — an access grant alone no longer manufactures eligibility.
  const admin = { structure: STRUCTURE };
  const { memberEligibility } = scope(['memberScope', 'memberEligibility'], admin);
  const seniors = memberEligibility({ role: 'player', status: 'active', playerGroupId: 'g-sen' });
  assert.deepEqual(seniors.teamIds.sort(), ['t-dev', 't-prem'], 'both senior squads');
  assert.equal(seniors.teamIds.includes('t-gone'), false, 'archived team excluded');
  assert.equal(seniors.teamIds.includes('t-u18'), false, 'no cross-group eligibility');

  const u18 = memberEligibility({ role: 'player', status: 'active', playerGroupId: 'g-u18' });
  assert.deepEqual(u18.teamIds, ['t-u18']);
  // A team inside an archived group is never eligible.
  const vets = memberEligibility({ role: 'player', status: 'active', playerGroupId: 'g-old' });
  assert.deepEqual(vets.teamIds, []);
  // And an ACCESS grant without a player group creates nothing.
  const staffish = memberEligibility({ role: 'player', status: 'active',
    accessScope: { clubWide: false, groups: [{ groupId: 'g-sen', status: 'active' }], teams: [] } });
  assert.deepEqual(staffish.teamIds, [], 'coaching scope is not playing membership');
});

// ── 3. PLAYER ACCESS LABEL ─────────────────────────────────────────────────
test('an ordinary player is labelled Player access, never Full access', () => {
  const { accessProfileFor, isStaffMember } = scope(['isStaffMember', 'accessProfileFor'], {},
    [constFromSrc('ACCESS_PROFILE_LABELS'), constFromSrc('DEFAULT_PROFILE_BY_LEVEL')]);
  // The production bug: no staffLevel fell through to 'head' → 'full'.
  assert.equal(accessProfileFor({ role: 'player', status: 'active' }), 'player');
  assert.equal(accessProfileFor({ role: 'player', status: 'active', medicalAccess: true }), 'player',
    'medical does not imply a staff profile');
  assert.equal(isStaffMember({ role: 'player' }), false);

  // Staff and owner are unaffected.
  assert.equal(accessProfileFor({ role: 'coach', staffLevel: 'head' }), 'full');
  assert.equal(accessProfileFor({ role: 'coach', staffLevel: 'assistant' }), 'coach');
  assert.equal(accessProfileFor({ role: 'coach', staffLevel: 'manager' }), 'manager');
  assert.equal(accessProfileFor({ role: 'player', isOwner: true }), 'full', 'owner stays full');
  assert.equal(accessProfileFor({ role: 'coach', accessProfile: 'manager' }), 'manager',
    'an explicit profile still wins');
});

test('"player" is never offered as an assignable staff profile', () => {
  assert.match(src, /ACCESS_PROFILE_LABELS = \{ full: 'Full access', coach: 'Coach access', manager: 'Manager access' \}/,
    'the assignable set is unchanged — player is not in it');
  assert.match(src, /PLAYER_ACCESS_LABEL = 'Player access'/);
  const access = fn('renderAccessSection');
  assert.match(access, /canAssign && isStaffMember\(member\)/,
    'the profile selector is only rendered for staff');
  assert.match(access, /PLAYER_ACCESS_SUMMARY/, 'a player gets an honest summary');
});

test('a player sees only the controls that apply to them', () => {
  const scopeSection = fn('renderScopeSection');
  assert.match(scopeSection, /if \(!isStaffMember\(member\)\)/, 'player-specific branch');
  const branchStart = scopeSection.indexOf('if (!isStaffMember(member))');
  const branch = scopeSection.slice(branchStart, branchStart + 1800);
  assert.match(branch, /Player access/);
  assert.match(branch, /medicalRow/, 'Medical stays available as the additive option');
  // Coaching access is now FIRST-CLASS on the player profile — but only a
  // club-wide admin gets the mutating checkboxes (unticked: a player holds
  // no coaching authority and derived phantom ticks are forbidden); anyone
  // else sees a read-only pointer, and no club-wide checkbox ever shows.
  assert.match(branch, /canGrantCoaching/, 'checkboxes gated on club-wide standing');
  assert.match(branch, /Coaching access/, 'the section is explicit');
  assert.match(branch, /checked: false/, 'boxes start unticked — no derived ticks');
  assert.equal(/Can manage entire club/.test(branch), false, 'no club-wide checkbox for a player');
  assert.match(branch, /whole-club administrator/i, 'non-admin staff get a pointer, not controls');
});

// ── 3b. STAFF ACCESS LABELS MIRROR THE SERVER (Problem 3) ──────────────────
// The displayed profile must be the server's derivation —
// ROLE_DEFAULT_PROFILE[canonicalRole(member)] — never staffLevel alone.
// staffLevel defaulting to 'head' made every staff role WITHOUT one (medical,
// snc, analyst) read "Full access", and a stale staffLevel left on an admin
// understated them as "Coach access". Display-only: no permission changes.
const perms = await import('../api/_permissions.js');
const LABEL_EXTRAS = [
  constFromSrc('ACCESS_PROFILE_LABELS'),
  constFromSrc('DEFAULT_PROFILE_BY_LEVEL'),
  constFromSrc('ROLE_DEFAULT_ACCESS_PROFILE'),
];
const labelScope = () => scope(['isStaffMember', 'accessProfileFor'], {}, LABEL_EXTRAS);

test('roles with no default profile are never labelled Full access', () => {
  const { accessProfileFor } = labelScope();
  for (const role of ['medical', 'snc', 'analyst']) {
    const got = accessProfileFor({ role, status: 'active' });
    assert.notEqual(got, 'full', `${role} must not read Full access`);
    assert.equal(got, 'limited', `${role} is role-scoped`);
  }
  // The server really does grant them only a handful of permissions.
  assert.equal(perms.permissionsFor({ status: 'active', role: 'medical' }).size, 3);
  assert.equal(perms.permissionsFor({ status: 'active', role: 'snc' }).size, 3);
  assert.equal(perms.permissionsFor({ status: 'active', role: 'analyst' }).size, 2);
});

test('a stale staffLevel never rewrites a non-coach role', () => {
  const { accessProfileFor } = labelScope();
  // An admin promoted from assistant coach keeps the old staffLevel on the
  // record; the server ignores it (canonicalRole only reads it for 'coach').
  assert.equal(accessProfileFor({ role: 'admin', staffLevel: 'assistant' }), 'full');
  assert.equal(accessProfileFor({ role: 'admin', staffLevel: 'manager' }), 'full');
  assert.equal(accessProfileFor({ role: 'dor', staffLevel: 'assistant' }), 'full');
  assert.equal(accessProfileFor({ role: 'dor', staffLevel: 'manager' }), 'full');
  // And the server agrees these members really hold everything.
  assert.equal(perms.permissionsFor({ status: 'active', role: 'admin', staffLevel: 'assistant' }).size,
    perms.ALL_PERMISSIONS.length);
});

test('capacity pairs keep their labels: player+medical plays, player+coach coaches', () => {
  const { accessProfileFor } = labelScope();
  assert.equal(accessProfileFor({ role: 'player', playerGroupId: 'g-sen', medicalAccess: true }), 'player');
  assert.equal(accessProfileFor({ role: 'coach', staffLevel: 'assistant', playerGroupId: 'g-u18' }), 'coach');
  assert.equal(accessProfileFor({ role: 'owner' }), 'full', 'owner role stays full');
  assert.equal(accessProfileFor({ role: 'medical', isOwner: true }), 'full', 'owner flag stays full');
});

test('an explicit access profile always wins, whatever the role', () => {
  const { accessProfileFor } = labelScope();
  for (const explicit of ['full', 'coach', 'manager']) {
    assert.equal(accessProfileFor({ role: 'medical', accessProfile: explicit }), explicit);
    assert.equal(accessProfileFor({ role: 'coach', staffLevel: 'head', accessProfile: explicit }), explicit);
  }
});

test('the label mirrors ROLE_DEFAULT_PROFILE∘canonicalRole for every role', () => {
  const { accessProfileFor } = labelScope();
  for (const role of perms.ROLES) {
    const member = { role, status: 'active' };
    const server = perms.accessProfileOf(member); // full | coach | manager | null
    const client = accessProfileFor(member);
    if (server) {
      assert.equal(client, server, `${role}: display matches the server profile`);
    } else if (['player', 'parent', 'guest'].includes(role)) {
      assert.equal(client, 'player', `${role}: non-staff read Player access`);
    } else {
      assert.equal(client, 'limited', `${role}: no profile is never shown as one`);
    }
  }
  // The legacy 'coach' role in every staffLevel state, including unknown ones,
  // which the server canonicalises to head_coach → full.
  for (const staffLevel of ['head', 'assistant', 'manager', undefined, 'HEAD', 'senior']) {
    const member = { role: 'coach', staffLevel, status: 'active' };
    assert.equal(accessProfileFor(member), perms.accessProfileOf(member),
      `coach staffLevel=${staffLevel}`);
  }
});

test('the label calculation is pure display — no request, no mutation, no grant', () => {
  // Source proof: the function reads; it never writes, never talks to anyone.
  const body = fn('accessProfileFor');
  for (const forbidden of ['fetch(', 'saveState', 'adminSetAccessProfile', 'adminAction']) {
    assert.equal(body.includes(forbidden), false, `accessProfileFor must not call ${forbidden}`);
  }
  assert.equal(/member\??\.\w+\s*=[^=]/.test(body), false, 'never assigns to the member');

  // Runtime proof: a frozen member, a fetch trip-wire, and identical
  // permission sets before and after the label is computed.
  const { accessProfileFor } = labelScope();
  const member = Object.freeze({ role: 'medical', status: 'active', medicalAccess: true,
    accessScope: Object.freeze({ clubWide: false, groups: [], teams: [] }) });
  const snapshot = JSON.stringify(member);
  const before = [...perms.permissionsFor({ ...member })].sort();
  const origFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; return Promise.resolve({}); };
  try {
    assert.equal(accessProfileFor(member), 'limited');
  } finally {
    globalThis.fetch = origFetch;
  }
  assert.equal(calls, 0, 'no network request');
  assert.equal(JSON.stringify(member), snapshot, 'member untouched');
  assert.deepEqual([...perms.permissionsFor({ ...member })].sort(), before,
    'the permission set is identical after the label calculation');
});

test('the access UI never presents Full access for a member with no profile', () => {
  const access = fn('renderAccessSection');
  // The selector shows an explicit placeholder instead of silently defaulting
  // to its first option ("Full access") when no profile matches.
  assert.match(access, /ACCESS_PROFILE_LABELS\[profile\] \? '' : `<option value="" disabled selected>\$\{esc\(ROLE_ACCESS_LABEL\)\}<\/option>`/,
    'placeholder option for the no-profile state');
  // The read-only label and summary fall back to the role-scoped wording,
  // never to a profile the server does not derive.
  assert.match(access, /ACCESS_PROFILE_LABELS\[profile\] \|\| ROLE_ACCESS_LABEL/);
  assert.match(access, /ACCESS_PROFILE_SUMMARY\[profile\] \|\| ROLE_ACCESS_SUMMARY/);
  assert.match(src, /ROLE_ACCESS_LABEL = 'Limited access'/);
  // 'limited' is a display state, never an assignable profile.
  assert.equal(src.includes("limited: '"), false, 'limited is not in ACCESS_PROFILE_LABELS');
});

// ── 4. MEDICAL = ACTIVE CASES ──────────────────────────────────────────────
test('a healthy player is not a medical case; a recorded injury makes one', () => {
  const { hasActiveMedicalCase } = scope(['normalizeMedicalRecord', 'hasActiveMedicalCase'], {});
  const healthy = { id: 'p1', game: 'available' };
  assert.equal(hasActiveMedicalCase(healthy, {}, {}), false, 'no record → not on the page');

  for (const [label, recs, notes, p] of [
    ['currentInjury', { p1: { currentInjury: 'Hamstring' } }, {}, healthy],
    ['severity',      { p1: { severity: 'moderate' } }, {}, healthy],
    ['dateInjured',   { p1: { dateInjured: '2026-08-01' } }, {}, healthy],
    ['condition note', {}, { p1: { condition: 'Ankle sprain' } }, healthy],
    ['injured flag',  {}, {}, { id: 'p1', game: 'injured' }],
    ['restricted training', {}, {}, { id: 'p1', trainingStatus: 'modified' }],
  ]) {
    assert.equal(hasActiveMedicalCase(p, recs, notes), true, `${label} opens a case`);
  }
});

test('clearing a case removes it from the active list without deleting history', () => {
  const { hasActiveMedicalCase } = scope(['normalizeMedicalRecord', 'hasActiveMedicalCase'], {});
  const player = { id: 'p1', game: 'available' };
  const injured = { p1: { currentInjury: 'Hamstring', severity: 'moderate', timeline: [{ at: '2026-08-01' }] } };
  assert.equal(hasActiveMedicalCase(player, injured, {}), true);

  const cleared = { p1: { ...injured.p1, clearanceStatus: 'cleared' } };
  assert.equal(hasActiveMedicalCase(player, cleared, {}), false, 'resolved cases drop off');
  // The record itself — including its timeline — is untouched.
  assert.equal(cleared.p1.currentInjury, 'Hamstring');
  assert.equal(cleared.p1.timeline.length, 1, 'history preserved');
});

test('the Medical page lists the caseload, not the roster', () => {
  const { medicalDashboardSummary } = scope(
    ['normalizeMedicalRecord', 'hasActiveMedicalCase', 'activeRosterPlayers', 'medicalDashboardSummary'], {},
    // activeRosterPlayers filters archived rows via this helper.
    ['const playerIsArchived = p => p.lifecycleStatus === "archived" || !!p.archivedDate;']);
  const players = [
    { id: 'p1', name: 'Fit One', game: 'available', lifecycleStatus: 'active' },
    { id: 'p2', name: 'Fit Two', game: 'available', lifecycleStatus: 'active' },
    { id: 'p3', name: 'Injured', game: 'injured', lifecycleStatus: 'active' },
  ];
  const summ = medicalDashboardSummary(players, {}, {});
  assert.deepEqual(summ.all.map(p => p.id), ['p3'], 'only the injured player is listed');
  assert.equal(summ.roster.length, 3, 'the full roster is still available separately');
  assert.equal(summ.all.length < summ.roster.length, true, 'the page is not the roster');

  // Reading the page must not manufacture records.
  const summ2 = medicalDashboardSummary(players, {}, {});
  assert.deepEqual(summ2.all.map(p => p.id), ['p3'], 'repeat reads are stable');
});

test('the Medical listing heading and empty state describe cases, not availability', () => {
  assert.match(src, /Active medical cases \(/, 'heading names the caseload');
  assert.equal(src.includes('Squad medical status ('), false, 'old roster heading gone');
  assert.match(src, /No active medical cases\. Players appear here once an injury is recorded\./,
    'empty state explains the model');
  // The unreachable pre-Phase-21 legacy body has been REMOVED: renderMedical
  // is now pure tab delegation, so the tabbed views (whose caseload is
  // activeMedicalCases over the group-scoped medicalPlayers()) are the ONLY
  // Medical surface.
  const renderer = fn('renderMedical');
  assert.match(renderer, /_renderMedicalDashboard\(\)/, 'dashboard is the default tab');
  assert.equal(/Treatment & rehab tracker/.test(renderer), false, 'legacy body gone');
  assert.equal(src.includes("oninput=\"setRehabProgress("), false, 'no legacy rehab slider markup');
});

test('a player with no explicit grant belongs to the club\'s only group', () => {
  // Production case: players who joined before the structure existed, or via an
  // unscoped invite, carry no accessScope. With one active group the answer is
  // unambiguous; with several it must stay empty rather than guess.
  const oneGroup = { structure: {
    groups: [{ id: 'g1', name: 'Seniors', status: 'active' }],
    teams: [{ id: 't1', groupId: 'g1', name: 'Premier', status: 'active' },
            { id: 't2', groupId: 'g1', name: 'Premier Development', status: 'active' },
            { id: 't3', groupId: 'g1', name: 'Old Boys', status: 'archived' }] } };
  const a = scope(['memberScope', 'memberEligibility'], oneGroup);
  const elig = a.memberEligibility({ role: 'player', status: 'active' });
  assert.deepEqual(elig.teamIds.sort(), ['t1', 't2'], 'both active squads');
  assert.equal(elig.teamIds.includes('t3'), false, 'archived excluded');

  const many = scope(['memberScope', 'memberEligibility'], { structure: STRUCTURE });
  assert.deepEqual(many.memberEligibility({ role: 'player', status: 'active' }).teamIds, [],
    'never guesses between several groups');
});
