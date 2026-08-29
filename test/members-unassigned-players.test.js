/**
 * Members — players who belong to no group.
 *
 * The server has always known about these. Its group-scoped roster read
 * (api/publish.js rosterHandler) reports `unassigned: all.filter(p => !groupOf(p)).length`
 * with the comment "honest, never silently placed". But the client only ever
 * requested the CLUB-WIDE roster, so that number reached nobody — and the
 * players it counted were invisible on every group-scoped surface, because
 * Members, Availability and Match Centre all read operationalPlayers(), which
 * keeps only players whose ACTIVE membership names the operating group.
 *
 * This build surfaces them on Members and lets an authorised coach choose a
 * group, reusing set_player_group — the same action the member profile's
 * "Plays for" control already uses, re-validated server-side against the club's
 * own structure and ASSIGN_ACCESS.
 *
 * The load-bearing rules these tests pin:
 *
 *   · ONE definition. playerGroupIdOf() answers "where does this player play?"
 *     for both the group filter and this list, so "not in any group" is the
 *     exact complement of "what a group can see" and the two cannot disagree.
 *   · FAIL CLOSED while the membership list loads. An empty _adminData.members
 *     is indistinguishable from "nobody has a group"; reporting mid-load would
 *     name the whole squad and invite the coach to act on it.
 *   · Nothing is guessed and nothing is assigned automatically.
 *   · An unassigned player stays unselectable everywhere until assigned.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = source.indexOf('(', start), paren = 0;
  for (; i < source.length; i++) {
    if (source[i] === '(') paren++;
    else if (source[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = source.indexOf('{', i), depth = 0;
  for (let k = brace; k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (!depth) return source.slice(start, k + 1); }
  }
  throw new Error('function ' + name + ' — no closing brace');
}

const GROUPS = [
  { id: 'grp_sen', name: 'Seniors', status: 'active' },
  { id: 'grp_u18', name: 'U18',     status: 'active' },
  { id: 'grp_old', name: 'Retired', status: 'archived' },
];

/** The real functions, over a caller-supplied club. */
function buildScope({
  members = [], players = [], loaded = true, groupId = 'grp_sen',
  permissions = ['assign_access', 'manage_players'], groups = GROUPS, coach = true,
} = {}) {
  return new Function(`
    "use strict";
    const state = { players: ${JSON.stringify(players)}, users: [],
                    operationalGroupId: ${JSON.stringify(groupId)} };
    const _adminData = { loaded: ${loaded}, members: ${JSON.stringify(members)},
                         structure: { groups: ${JSON.stringify(groups)}, teams: [] } };
    const _perms = ${JSON.stringify(permissions)};
    const calls = [];
    function canI(p) { return _perms.includes(p); }
    function isCoach() { return ${coach}; }
    function ensureAdminData() { calls.push('ensureAdminData'); }
    function canonicalVisiblePlayers() { return state.players; }
    function esc(v) { return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    ${extractFn(html, 'playerIsArchived')}
    ${extractFn(html, 'activePlayerGroups')}
    ${extractFn(html, 'clubUsesPlayerGroups')}
    ${extractFn(html, 'playerGroupIdOf')}
    ${extractFn(html, 'activeMembershipFor')}
    ${extractFn(html, 'operationalPlayers')}
    ${extractFn(html, 'unassignedRosterPlayers')}
    ${extractFn(html, 'renderUnassignedPlayersCard')}
    return { state, _adminData, calls, operationalPlayers, unassignedRosterPlayers,
             renderUnassignedPlayersCard, playerGroupIdOf };
  `)();
}

const grouped = (uid, gid) => ({ id: 'tm-' + uid, teamId: 'club', userId: uid, status: 'active', role: 'player', playerGroupId: gid });
const nogroup = uid => ({ id: 'tm-' + uid, teamId: 'club', userId: uid, status: 'active', role: 'player' });

// ── 1. Nothing to report ──────────────────────────────────────────────────────

test('a club where everyone has a group shows no warning', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'), grouped('u2', 'grp_u18')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p2', name: 'B', userId: 'u2' }],
  });
  assert.equal(s.unassignedRosterPlayers().total, 0);
  assert.equal(s.renderUnassignedPlayersCard(), '', 'no card, no unnecessary warning');
});

test('a club that has not started using groups shows no warning', () => {
  // Nobody is hidden there — every squad surface still shows the full roster —
  // so there is no problem to report.
  const s = buildScope({
    members: [nogroup('u1')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p2', name: 'B' }],
  });
  assert.equal(s.unassignedRosterPlayers().total, 0);
  assert.equal(s.renderUnassignedPlayersCard(), '');
  assert.deepEqual(s.operationalPlayers().map(p => p.name), ['A', 'B'], 'and everyone stays visible');
});

// ── 2. Counting and naming ────────────────────────────────────────────────────

test('one unassigned player is reported, by name, in the singular', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'), nogroup('u3')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' },
              { id: 'p3', name: 'Code Joiner', userId: 'u3' }],
  });
  assert.equal(s.unassignedRosterPlayers().total, 1);
  const card = s.renderUnassignedPlayersCard();
  assert.match(card, /1 player is not in any group/);
  assert.match(card, /Code Joiner/);
  assert.ok(!/1 players/.test(card), 'must read as English');
});

test('several unassigned players are counted correctly and all named', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'), nogroup('u3'), nogroup('u4')],
    players: [{ id: 'p1', name: 'A',   userId: 'u1' },
              { id: 'p3', name: 'Cara Diaz',  userId: 'u3' },
              { id: 'p4', name: 'Dan Evans',  userId: 'u4' },
              { id: 'p5', name: 'Ghost Gary' }],
  });
  const u = s.unassignedRosterPlayers();
  assert.equal(u.total, 3);
  assert.deepEqual(u.assignable.map(a => a.player.name), ['Cara Diaz', 'Dan Evans']);
  assert.deepEqual(u.unlinked.map(a => a.player.name), ['Ghost Gary']);
  const card = s.renderUnassignedPlayersCard();
  assert.match(card, /3 players are not in any group/);
  for (const n of ['Cara Diaz', 'Dan Evans', 'Ghost Gary']) assert.match(card, new RegExp(n));
});

test('an archived player is not reported as a problem', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' },
              { id: 'p9', name: 'Archie Gone', lifecycleStatus: 'archived' }],
  });
  assert.equal(s.unassignedRosterPlayers().total, 0);
});

// ── 3. The remedy: only valid groups, only where it can work ──────────────────

test('"Plays for" offers this club\'s ACTIVE groups and nothing else', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'), nogroup('u3')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p3', name: 'C', userId: 'u3' }],
  });
  const card = s.renderUnassignedPlayersCard();
  const options = [...card.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(options, ['', 'grp_sen', 'grp_u18'],
    'the empty prompt plus the active groups — never the archived one');
  assert.ok(!card.includes('grp_old'), 'an archived group must not be offered');
});

test('nothing is preselected — the coach must choose', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'), nogroup('u3')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p3', name: 'C', userId: 'u3' }],
  });
  const card = s.renderUnassignedPlayersCard();
  assert.match(card, /<option value="" selected>Choose a group/, 'no group is guessed');
  assert.ok(!/<option value="grp_[a-z0-9]+"[^>]*selected/.test(card), 'no real group is preselected');
  assert.match(card, /nothing is assigned automatically/i);
});

test('the picker goes through the existing set_player_group action', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'), nogroup('u3')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p3', name: 'C', userId: 'u3' }],
  });
  assert.match(s.renderUnassignedPlayersCard(), /adminSetPlayerGroup\('tm-u3',this\.value/,
    'the membership id is passed to the same handler the member profile uses');
  // And that handler must still be the one that posts set_player_group.
  assert.match(extractFn(html, 'adminSetPlayerGroup'), /action: 'set_player_group'/);
});

test('a roster row with no account gets no picker it cannot use', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p5', name: 'Ghost Gary' }],
  });
  const card = s.renderUnassignedPlayersCard();
  assert.match(card, /Ghost Gary/);
  assert.ok(!/adminSetPlayerGroup/.test(card), 'there is no membership to set a group on');
  assert.match(card, /No account/i, 'and the coach is told why');
});

test('a member still waiting on Pending joins is left to that inbox', () => {
  // They have an account; calling them a leftover record would be wrong, and
  // offering to delete their row would be worse.
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'),
              { id: 'tm-p', teamId: 'club', userId: 'u-pend', status: 'pending', role: 'player' }],
    players: [{ id: 'p1', name: 'A', userId: 'u1' },
              { id: 'p4', name: 'Pending Pat', userId: 'u-pend' }],
  });
  assert.equal(s.unassignedRosterPlayers().total, 0);
  assert.equal(s.renderUnassignedPlayersCard(), '');
});

test('a placeholder @player.test address is never shown as contact detail', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'), nogroup('u3')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' },
              { id: 'p3', name: 'C', userId: 'u3', email: 'c@player.test' }],
  });
  assert.ok(!s.renderUnassignedPlayersCard().includes('@player.test'));
});

// ── 4. Assigning removes them, into the right group only ─────────────────────

test('assigning a group removes the player from the list', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'), nogroup('u3')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p3', name: 'C', userId: 'u3' }],
  });
  assert.equal(s.unassignedRosterPlayers().total, 1);
  // set_player_group writes playerGroupId onto the membership; loadAdminData(true)
  // then refreshes _adminData. Model that outcome.
  s._adminData.members.find(m => m.id === 'tm-u3').playerGroupId = 'grp_u18';
  assert.equal(s.unassignedRosterPlayers().total, 0, 'no longer unassigned');
  assert.equal(s.renderUnassignedPlayersCard(), '', 'and the warning goes away');
});

test('an assigned player appears in their group and in NO other', () => {
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'), nogroup('u3')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p3', name: 'Cara Diaz', userId: 'u3' }],
  });
  s.state.operationalGroupId = 'grp_u18';
  assert.deepEqual(s.operationalPlayers().map(p => p.name), [], 'invisible before assignment');

  s._adminData.members.find(m => m.id === 'tm-u3').playerGroupId = 'grp_u18';
  s.state.operationalGroupId = 'grp_u18';
  assert.deepEqual(s.operationalPlayers().map(p => p.name), ['Cara Diaz'], 'visible in the chosen group');
  s.state.operationalGroupId = 'grp_sen';
  assert.deepEqual(s.operationalPlayers().map(p => p.name), ['A'], 'and in no other');
});

test('an unassigned player is selectable nowhere until assigned', () => {
  // The U18 lesson: eligibility is group-scoped. Surfacing a player on Members
  // must not make them pickable anywhere.
  const s = buildScope({
    members: [grouped('u1', 'grp_sen'), nogroup('u3')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p3', name: 'C', userId: 'u3' }],
  });
  for (const gid of ['grp_sen', 'grp_u18', 'grp_old']) {
    s.state.operationalGroupId = gid;
    assert.ok(!s.operationalPlayers().some(p => p.name === 'C'),
      `C must not appear in ${gid} before a group is chosen`);
  }
});

// ── 5. Safety ────────────────────────────────────────────────────────────────

test('nothing is reported while the membership list is still loading', () => {
  // The dangerous case: mid-load every player looks unassigned, and the card
  // would name the entire squad and offer actions on it.
  const s = buildScope({
    loaded: false, members: [],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p2', name: 'B', userId: 'u2' }],
  });
  assert.equal(s.unassignedRosterPlayers().total, 0);
  assert.equal(s.renderUnassignedPlayersCard(), '');
});

test('the loading guard stands on its own, not on an empty membership list', () => {
  // With members present and grouped, every other guard passes — so this pins
  // the `loaded` check itself. It is the only thing standing between a
  // half-loaded refresh and a card that names players it should not.
  const s = buildScope({
    loaded: false,
    members: [grouped('u1', 'grp_sen')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' },
              { id: 'p3', name: 'C', userId: 'u3' },
              { id: 'p5', name: 'Ghost Gary' }],
  });
  assert.equal(s.unassignedRosterPlayers().total, 0,
    'an untrusted membership list reports nothing at all');
  assert.equal(s.renderUnassignedPlayersCard(), '');
  // …and the same club reports honestly once the load completes.
  const loaded = buildScope({
    loaded: true,
    members: [grouped('u1', 'grp_sen')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' },
              { id: 'p3', name: 'C', userId: 'u3' },
              { id: 'p5', name: 'Ghost Gary' }],
  });
  assert.equal(loaded.unassignedRosterPlayers().total, 2);
});

test('the warning is shown only to someone who can act on it', () => {
  const club = {
    members: [grouped('u1', 'grp_sen'), nogroup('u3')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p3', name: 'C', userId: 'u3' }],
  };
  assert.notEqual(buildScope({ ...club }).renderUnassignedPlayersCard(), '');
  assert.equal(buildScope({ ...club, permissions: ['manage_players'] }).renderUnassignedPlayersCard(), '',
    'assign_access is the permission set_player_group requires');
  assert.equal(buildScope({ ...club, permissions: [] }).renderUnassignedPlayersCard(), '');
});

test('the remove action for a leftover row is coach-gated', () => {
  const club = {
    members: [grouped('u1', 'grp_sen')],
    players: [{ id: 'p1', name: 'A', userId: 'u1' }, { id: 'p5', name: 'Ghost Gary' }],
  };
  assert.match(buildScope(club).renderUnassignedPlayersCard(), /removePlayerFromSquad\('p5'\)/);
  assert.ok(!/removePlayerFromSquad/.test(buildScope({ ...club, coach: false }).renderUnassignedPlayersCard()));
  // And the handler itself still refuses a non-coach.
  assert.match(extractFn(html, 'removePlayerFromSquad'), /if \(!isCoach\(\)\) return showToast/);
});

test('another club\'s players cannot appear — both sources are session-scoped', async () => {
  // This list is built from exactly two client-side sources, and each is
  // narrowed to the caller's own club BY THE SERVER before it is sent.
  assert.match(html, /_adminData\.members\s*=\s*d\.team_members \|\| \[\]/,
    'memberships come from /api/identity');
  assert.match(html, /const res = await fetch\('\/api\/roster'\)/,
    'the roster comes from /api/roster');

  const identityStore = await readFile(join(__dirname, '..', 'api', '_identityStore.js'), 'utf8');
  const listState = identityStore.slice(identityStore.indexOf('export async function listIdentityState'));
  assert.match(listState.slice(0, 900), /members\.filter\(member => member\.teamId === teamId\)/,
    'team_members is filtered to the session\'s club');

  const identityApi = await readFile(join(__dirname, '..', 'api', 'identity.js'), 'utf8');
  assert.match(identityApi, /const tenant = await requireTenantPermission\(req, PERM\.MANAGE_PLAYERS\);[\s\S]{0,200}listIdentityState\(tenant\.teamId\)/,
    'and the club id comes from the session, never from the query');
  assert.match(identityApi, /if \(req\.query\?\.teamId\) assertSameTenant\(tenant, req\.query\.teamId\)/,
    'a forged ?teamId= is refused outright');

  const publishApi = await readFile(join(__dirname, '..', 'api', 'publish.js'), 'utf8');
  assert.match(publishApi, /readScoped\(rosterKey\(session\.teamId\), 'roster', session\.teamId\)/,
    'the roster is read under the session\'s club key');
  assert.match(publishApi, /session = await requireTenantPermission\(req, PERM\.MANAGE_PLAYERS\)/,
    'and the roster route is permission-gated');
});

test('assigning a group is re-validated server-side against the caller\'s own club', async () => {
  const identityApi = await readFile(join(__dirname, '..', 'api', 'identity.js'), 'utf8');
  const route = identityApi.slice(identityApi.indexOf("if (action === 'set_player_group')"));
  assert.match(route.slice(0, 500), /requireClubManage\(req, PERM\.ASSIGN_ACCESS\)/,
    'the action needs ASSIGN_ACCESS');
  assert.match(route.slice(0, 500), /setPlayerGroup\(memberId, req\.body\?\.groupId, session\.user\.id, session\.teamId\)/,
    'and is bound to the session\'s club');

  const identityStore = await readFile(join(__dirname, '..', 'api', '_identityStore.js'), 'utf8');
  const setter = identityStore.slice(identityStore.indexOf('export async function setPlayerGroup'));
  assert.match(setter.slice(0, 800), /findTeamMemberOrThrow\(members, memberId, expectedTeamId\)/,
    'a membership from another club cannot be targeted');
  assert.match(setter.slice(0, 800), /groupById\(structure, next\)/, 'the group must exist in THIS club');
  assert.match(setter.slice(0, 800), /group\.status !== 'active'/, 'and must not be archived');
});

test('no second definition of "where this player plays" was introduced', () => {
  const op = extractFn(html, 'operationalPlayers');
  assert.match(op, /playerGroupIdOf\(p\)/, 'the group filter asks the shared rule');
  assert.ok(!/m\.status === 'active' && String\(m\.userId\)/.test(op),
    'and no longer carries its own copy of it');
  const un = extractFn(html, 'unassignedRosterPlayers');
  assert.match(un, /!playerGroupIdOf\(p\)/, 'the list is its exact complement');
  assert.ok(!/state\.players/.test(un), 'it reads the canonical roster, not raw club-wide state');
  const rule = extractFn(html, 'playerGroupIdOf');
  assert.match(rule, /m\.status === 'active'/, 'only an active membership confers a group');
  assert.match(rule, /_adminData\.members/, 'the membership is the authority');
});

test('the fail-closed rule and group isolation in operationalPlayers are untouched', () => {
  const op = extractFn(html, 'operationalPlayers');
  assert.match(op, /if \(!_adminData\.loaded && \(canI\('manage_players'\) \|\| canI\('manage_teams'\)\)\)/);
  assert.match(op, /return \[\];/, 'still fails CLOSED, never club-wide');
  assert.match(op, /if \(!gid\) return rows;/, 'no group in force is still unchanged behaviour');
  assert.match(op, /if \(!clubUsesPlayerGroups\(\)\) return rows;/, 'pre-structure clubs unchanged');
});

test('no API, authentication or entitlement change rides along', () => {
  for (const name of ['unassignedRosterPlayers', 'renderUnassignedPlayersCard',
                      'playerGroupIdOf', 'activeMembershipFor']) {
    const src = extractFn(html, name);
    assert.ok(!/fetch\(/.test(src), `${name} must not call an API`);
    assert.ok(!/password|claimInvite|teamPlan|canUseFeature/.test(src), `${name} must not touch auth or entitlement`);
  }
});

test('previous Members and Overview builds remain intact', () => {
  for (const name of ['clubUsesPlayerGroups', 'addPlayer', 'identityRequestsHtml',
                      'approveIdentityRequest', 'adminSetPlayerGroup',
                      'overviewRoster', 'availabilityNonResponders', 'setAppearance']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must still exist`);
  }
  assert.match(extractFn(html, 'addPlayer'), /if \(clubUsesPlayerGroups\(\)\)/,
    'the ghost-record guard from ff4cca56 still stands');
});
