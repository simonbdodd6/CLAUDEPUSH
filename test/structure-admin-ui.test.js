/**
 * RC4.7 Phase C — administration UI contracts.
 *
 * The screens must speak plain language (never raw ids or developer terms),
 * separate ACCESS from ELIGIBILITY, confirm every access-removing action, and
 * send only server-validated payloads. These assertions pin the parts a future
 * refactor could silently break.
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

// ── Club structure screen ───────────────────────────────────────────────────
test('the Club Structure card is registered in Settings and gated on permission', () => {
  assert.match(src, /renderClubStructureCard === 'function' \? renderClubStructureCard\(\)/,
    'registered with a typeof guard, matching the other settings cards');
  const card = fn('renderClubStructureCard');
  assert.match(card, /canI\('manage_teams'\)/, 'hidden from members who cannot administer');
  assert.match(card, /!_adminData\.structure/, 'hidden until the structure loads');
});

test('the structure card shows every required field for groups and teams', () => {
  const card = fn('renderClubStructureCard');
  for (const bit of ['members', 'teams', 'Staff', 'Archived', 'eligible']) {
    assert.ok(card.includes(bit), `shows ${bit}`);
  }
  for (const label of ['Rename', 'Add team', 'Archive', 'Restore']) {
    assert.ok(card.includes(label), `offers ${label}`);
  }
  assert.match(card, /Add a group/, 'offers group creation');
});

test('structure operations post to the validated endpoint, never raw storage', () => {
  const op = fn('structureOp');
  assert.match(op, /\/api\/publish\?resource=structure/);
  assert.match(op, /method: 'POST'/);
  assert.match(op, /loadAdminData\(true\)/, 'refreshes from the server after every change');
  // The op name is passed through; ids ride in the payload and are re-checked
  // server-side. No client-side authorization decision is made here.
  assert.doesNotMatch(op, /accessScope|clubWide/, 'no permission logic in the transport helper');
});

test('archiving asks for confirmation and explains nothing is deleted', () => {
  const archive = fn('structureArchive');
  assert.match(archive, /ceConfirm/, 'confirmation dialog');
  assert.match(archive, /danger: true/);
  assert.match(archive, /Nothing is deleted|history/i, 'reassures that history is kept');
  assert.match(archive, /restore it at any time/i);
});

// ── Member access editor ────────────────────────────────────────────────────
test('access and eligibility are rendered as SEPARATE sections', () => {
  const access = fn('renderAccessSection');
  assert.match(access, /renderScopeSection\(member, user\)/);
  assert.match(access, /renderEligibilitySection\(member, user\)/);

  const scope = fn('renderScopeSection');
  const elig = fn('renderEligibilitySection');
  assert.match(scope, /Can access/, 'access section headed "Can access"');
  assert.match(elig, /Can be picked for/, 'eligibility headed separately');
  assert.match(elig, /does not change what they can see or manage/i,
    'states explicitly that eligibility is not permission');
  assert.match(elig, /role \|\| ''\)\.toLowerCase\(\) !== 'player'/, 'eligibility only applies to players');
});

test('permission controls use plain language, never developer terminology', () => {
  const ui = fn('renderScopeSection') + fn('renderEligibilitySection') + fn('renderClubStructureCard');
  for (const phrase of ['Can manage entire club', 'Can coach ', 'Eligible for ', 'Primary squad']) {
    assert.ok(ui.includes(phrase), `uses plain phrase: ${phrase}`);
  }

  // The brief's banned developer terminology must appear nowhere at all.
  for (const banned of ['Scope ID', 'ACL override', 'Entity grant', 'ACL']) {
    assert.equal(ui.includes(banned), false, `must not use "${banned}"`);
  }

  // Ids may only travel through event-handler ARGUMENTS, never be rendered as
  // text. Every id interpolation must therefore sit inside a quoted attribute:
  // `onchange="...('${esc(g.id)}'...)"`. A bare `${g.id}` between tags would be
  // a visible raw id — that is what this catches.
  const idInterpolations = ui.match(/\$\{esc\((?:[a-z]+\.)?(?:id|groupId|teamId)\)\}/g) || [];
  assert.ok(idInterpolations.length > 0, 'ids are interpolated somewhere (sanity)');
  for (const match of idInterpolations) {
    const at = ui.indexOf(match);
    // Walk back to the nearest tag boundary; an id used as display text would
    // have a '>' before it with no opening quote in between.
    const before = ui.slice(Math.max(0, at - 220), at);
    const inAttribute = before.lastIndexOf("'") > before.lastIndexOf('>');
    assert.ok(inAttribute, `raw id rendered as visible text near: ${before.slice(-70)}`);
  }
});

test('the owner is shown as unchangeable rather than offered a broken control', () => {
  const scope = fn('renderScopeSection');
  assert.match(scope, /member\.isOwner/);
  assert.match(scope, /cannot be reduced/i);
});

test('scope edits post the FULL scope and let the server replace it wholesale', () => {
  const save = fn('adminSaveScope');
  assert.match(save, /action: 'set_member_access'/);
  assert.match(save, /accessScope: scope/);

  const group = fn('adminToggleGroupAccess');
  // Granting a whole group supersedes single-team grants inside it — no
  // contradictory overlapping grants can be produced by the UI.
  assert.match(group, /teams: scope\.teams\.filter/);
  assert.match(group, /clubWide: false/);
});

test('every access REMOVAL confirms first and preserves the person', () => {
  for (const name of ['adminToggleClubWide', 'adminToggleGroupAccess', 'adminToggleTeamAccess']) {
    const body = fn(name);
    assert.match(body, /ceConfirm/, `${name} confirms`);
    assert.match(body, /danger: true/, `${name} marks the action destructive`);
  }
  const group = fn('adminToggleGroupAccess');
  assert.match(group, /account, history and any other access stay/i,
    'tells the admin the person is not deleted');
  assert.match(group, /action: 'remove_member_scope'/, 'soft scope removal, not deletion');
});

test('eligibility edits never touch access, and keep a valid primary squad', () => {
  const toggle = fn('adminToggleEligibility');
  assert.match(toggle, /action: 'set_member_eligibility'/);
  assert.doesNotMatch(toggle, /set_member_access|accessScope/, 'eligibility never writes access');
  assert.match(toggle, /teamIds\.includes\(elig\.primaryTeamId\)/,
    'primary squad is re-derived when it stops being eligible');
});

// ── Scoped invites ──────────────────────────────────────────────────────────
test('the invite form offers whole club / group / single team in plain words', () => {
  const select = fn('inviteScopeSelect');
  assert.match(select, /Whole club/);
  assert.match(select, /whole group/);
  assert.match(select, /only</, 'single-team option');
  assert.match(select, /status === 'active'/, 'archived scopes are not offered');
  assert.ok(src.includes("inviteScopeSelect('adm-staff-scope')"), 'wired into the staff invite form');
});

test('the chosen invite scope is sent to the server for re-validation', () => {
  const value = fn('inviteScopeValue');
  assert.match(value, /level: 'club'/);
  assert.match(value, /level: 'group', groupId/);
  assert.match(value, /level: 'team', teamId/);
  const invite = fn('adminInviteStaff');
  assert.match(invite, /inviteScopeValue\('adm-staff-scope'\)/);
  assert.match(invite, /\.\.\.\(scope \? \{ scope \} : \{\}\)/, 'scope travels with the invite');
});

// ── Client mirror of the server's scope resolution ──────────────────────────
test('memberScope mirrors the server derivation and drops removed grants', () => {
  const body = fn('memberScope');
  const memberScope = new Function(`return ${body}`)();

  // Stored scope: removed grants must not appear as access.
  const stored = memberScope({ accessScope: { clubWide: false,
    groups: [{ groupId: 'g1', status: 'active' }, { groupId: 'g2', status: 'removed' }],
    teams: [{ teamId: 't1', status: 'active' }] } });
  assert.deepEqual(stored.groups.map(g => g.groupId), ['g1'], 'removed grant hidden');
  assert.deepEqual(stored.teams.map(t => t.teamId), ['t1']);
  assert.equal(stored.clubWide, false);

  // Derived: owner / explicit full / admin roles read as whole-club.
  for (const m of [{ isOwner: true }, { accessProfile: 'full' }, { role: 'admin' }]) {
    assert.equal(memberScope(m).clubWide, true, JSON.stringify(m));
    assert.equal(memberScope(m).derived, true, 'flagged as not yet explicit');
  }
  // A plain coach is NOT club-wide.
  assert.equal(memberScope({ role: 'coach', staffLevel: 'head' }).clubWide, false);

  // Malformed input fails closed.
  for (const bad of [{ accessScope: 'nope' }, { accessScope: [] }, {}]) {
    const scope = memberScope(bad);
    assert.equal(Array.isArray(scope.groups) && Array.isArray(scope.teams), true);
  }
});

// ── RC4.7 UI wiring fix — data loading, shared block, discoverability ───────

test('any admin screen can request the data it needs, with a loop guard', () => {
  const ensure = fn('ensureAdminData');
  assert.match(ensure, /canI\('manage_players'\)|canI\('manage_teams'\)/, 'permission gated');
  assert.match(ensure, /_adminData\.loaded \|\| _adminData\.loading \|\| _adminData\.attempted/,
    'guards against duplicate AND repeated-failure fetches');
  assert.match(ensure, /loadAdminData\(\)/);
  // `attempted` is what stops a failed fetch looping forever, because
  // loadAdminData re-renders the very screens that call ensureAdminData.
  assert.ok(src.includes('_adminData.attempted = true'), 'attempt recorded in finally');
  assert.ok(src.includes('if (force) _adminData.attempted = false'), 'a forced reload clears the guard');
});

test('Settings requests admin data so a fresh owner sees Club structure first', () => {
  const settings = fn('renderSettings');
  assert.match(settings, /ensureAdminData\(\)/, 'Settings asks for the structure itself');
});

test('loadAdminData re-renders the screen that is actually showing', () => {
  const load = fn('loadAdminData');
  assert.match(load, /activeCoachSection === 'settings'[\s\S]*renderSettings\(\)/,
    'Settings refreshed when it is active');
  assert.match(load, /activeCoachSection === 'players'[\s\S]*renderPlayers\(\)/,
    'Members refreshed when it is active');
  assert.match(load, /renderClubAdmin\(\)/, 'Club Admin still refreshed');
});

test('Members exposes the access + eligibility editor via the SHARED block', () => {
  const players = fn('renderPlayers');
  assert.match(players, /ensureAdminData\(\)/, 'Members requests admin data');
  assert.ok(src.includes('renderMemberAccessCard(_playerDetailId)'), 'member detail renders the card');

  const card = fn('renderMemberAccessCard');
  // The card must DELEGATE to the one implementation — never reimplement it.
  assert.match(card, /renderAccessSection\(member, user\)/, 'reuses the shared section');
  assert.doesNotMatch(card, /set_member_access|set_member_eligibility|remove_member_scope/,
    'no access logic duplicated in the Members wrapper');
  assert.match(card, /canI\('assign_access'\)/, 'permission gated');
  assert.match(card, /_adminData\.loaded/, 'waits for data rather than rendering empty controls');
  assert.match(card, /m\.status === 'active'/, 'resolves an ACTIVE membership only');
});

test('exactly one implementation of the access editor serves both screens', () => {
  // renderAccessSection is defined once and called from Club Admin and from
  // the Members wrapper — so owner protection, final-admin protection and the
  // confirmation prompts cannot diverge between the two screens.
  assert.equal((src.match(/function renderAccessSection\(/g) || []).length, 1, 'defined once');
  // Exclude the definition line itself, which also matches the call pattern.
  const calls = (src.match(/(?<!function )renderAccessSection\(member, user\)/g) || []).length;
  assert.equal(calls, 2, `called from both screens, got ${calls}`);
  assert.ok(fn('renderClubAdmin').includes('renderAccessSection(member, user)'), 'Club Admin call site');
  assert.ok(fn('renderMemberAccessCard').includes('renderAccessSection(member, user)'), 'Members call site');
  assert.equal((src.match(/function renderScopeSection\(/g) || []).length, 1, 'scope editor defined once');
  assert.equal((src.match(/function renderEligibilitySection\(/g) || []).length, 1, 'eligibility editor defined once');
});

test('Club Admin is discoverable from Members and Settings, gated on administration', () => {
  // The Core Beta sidebar is contractually exactly 8 sections with `admin`
  // deliberately hidden (test/core-beta-nav.test.js), so discoverability is
  // delivered through in-page entry points rather than a 9th nav item.
  const players = fn('renderPlayers');
  assert.match(players, /canI\('manage_teams'\) \? `<button[^`]*setSection\('coach','admin'\)/,
    'Members header offers Club Admin to authorised staff only');
  assert.match(src, /canI\('manage_teams'\) \? `<button[^`]*setSection\('coach','admin'\)[^`]*Open Club Admin/,
    'Settings offers an explicit Club Admin button');
  assert.match(src, /SECTION_PERMS = \{[^}]*admin: 'manage_teams'/,
    'the section itself stays gated on manage_teams');
});

test('the beta navigation contract is untouched — admin stays out of the sidebar', () => {
  const ids = new Function(`const BETA_NAV_IDS = ${src.match(/const BETA_NAV_IDS = (\[[^\]]*\])/)[1]}; return BETA_NAV_IDS;`)();
  assert.equal(ids.length, 8, 'still exactly 8 beta sections');
  assert.equal(ids.includes('admin'), false, 'admin remains hidden from the beta sidebar');
});
