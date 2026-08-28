/**
 * Members — one player-onboarding path, and no control that quietly fails.
 *
 * Members offered several ways to get a player into a club, and they were not
 * equivalent:
 *
 *   · "Invite players" (group invite link) → POST /api/invite → the player
 *     registers → claimInvite() creates an ACCOUNT and a MEMBERSHIP carrying
 *     playerGroupId. They can sign in, and their group can see them.
 *   · "Advanced: invite a specific person" → the same server path, per person.
 *   · The team code → a pending membership → the Pending joins approval inbox.
 *   · "+ Add player" → a row in state.players and nothing else. No account, no
 *     invitation, no membership, and a fabricated name@player.test address.
 *
 * The last one was not merely redundant, it silently failed. operationalPlayers()
 * matches a player to a membership by userId to find their group, and starts
 * filtering the moment ANY membership carries a playerGroupId. A record with no
 * membership can never match, so in a club that had started using groups it
 * appeared on NO screen — not Members, not Availability, not Match Centre —
 * while the coach was told "added to squad". The failure was also delayed: in a
 * brand-new club the records showed normally and then vanished together the
 * first time a real player claimed an invite. And they were unrepairable, since
 * "Plays for" (adminSetPlayerGroup) needs a membership id.
 *
 * These tests pin the resulting rules:
 *   1. the invite path is the one prominent player action, and still works;
 *   2. the roster-record control cannot create an invisible record;
 *   3. it is honestly labelled where it survives;
 *   4. Pending joins is kept — it is the ONLY way to admit a team-code joiner —
 *      but only shown when it holds something;
 *   5. group isolation and permissions are exactly as they were.
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

/** The real addPlayer / operationalPlayers, over a caller-supplied membership list. */
function buildScope({ members = [], players = [], groupId = 'grp_a', form = {} } = {}) {
  const body = `
    "use strict";
    const state = { players: ${JSON.stringify(players)}, users: [],
                    operationalGroupId: ${JSON.stringify(groupId)}, showAddPlayer: true };
    const _adminData = { loaded: true, members: ${JSON.stringify(members)} };
    const out = { toasts: [], notices: [], synced: 0 };
    const _f = ${JSON.stringify({ apName: 'Manual Person', apPos: '4 — Lock', ...form })};
    function canI() { return true; }
    function ensureAdminData() {}
    function saveState() {}
    function render() {}
    function showToast(m) { out.toasts.push(String(m)); }
    function notify(m) { out.notices.push(String(m)); }
    function flushRosterSync() { out.synced++; }
    function canonicalIdentityDisplayName(n) { return n; }
    function canonicalizeStatePlayers() {}
    function ensurePlayerUsersForRoster(p, u) { return u; }
    function canonicalVisiblePlayers() { return state.players; }
    const document = { getElementById: id => ({ value: _f[id] || '' }) };
    ${extractFn(html, 'clubUsesPlayerGroups')}
    ${extractFn(html, 'operationalPlayers')}
    ${extractFn(html, 'upsertCanonicalPlayerRecord')}
    ${extractFn(html, 'addPlayer')}
    return { state, out, addPlayer, operationalPlayers, clubUsesPlayerGroups };
  `;
  return new Function(body)();
}

const grouped   = [{ id: 'tm1', userId: 'u-a', status: 'active', role: 'player', playerGroupId: 'grp_a' }];
const ungrouped = [{ id: 'tm1', userId: 'u-a', status: 'active', role: 'player' }];

// ── 1. The supported path is the prominent one, and is unchanged ──────────────

test('the group invite link is the one prominent player action on Members', () => {
  const header = html.slice(html.indexOf('<h2 style="margin:0;font-size:19px;color:var(--ink)">Members</h2>'),
                            html.indexOf('<!-- ── Invite & Access panel'));
  assert.match(header, /class="btn primary"[^>]*openInvitePlayersModal\(\)/,
    'the invite link must be the primary action');
  assert.match(header, /openCoachGroupInviteModal\(\)/, 'staff invites are a separate audience, kept');
  assert.ok(!/showAddPlayerForm\(\)/.test(header),
    'no roster-record control may sit beside the invite link looking like the same job');
});

test('the invite flow itself is untouched — account + group still come from the server', () => {
  const modal = extractFn(html, 'openInvitePlayersModal');
  assert.match(modal, /'\/api\/invite'/, 'still posts to the invite endpoint');
  assert.match(modal, /group: true/, 'still a reusable group link');
  assert.match(modal, /playerGroupId: pgid/, 'still names the player group');
  assert.match(modal, /scope: \{ groupId: pgid \}/, 'still scoped for multi-group clubs');
});

test('an empty club is pointed at the path that actually creates a login', () => {
  const empty = html.slice(html.indexOf('<div style="font-size:40px;margin-bottom:14px;opacity:.55">👥</div>'),
                           html.indexOf('<div class="members-search-bar">'));
  assert.match(empty, /openInvitePlayersModal\(\)/);
  assert.ok(!/showAddPlayerForm\(\)/.test(empty),
    'a first-run coach must not be offered a record that cannot sign in');
  assert.match(empty, /gets their own login/, 'and must be told what the link does');
});

// ── 2. The roster record can no longer fail silently ──────────────────────────

test('a club using player groups cannot create an invisible roster record', () => {
  const s = buildScope({ members: grouped });
  s.addPlayer();
  assert.equal(s.state.players.length, 0, 'nothing may be written');
  assert.equal(s.out.synced, 0, 'and nothing may be pushed to the server');
  assert.match(s.out.toasts.join(' '), /player groups/i, 'the coach is told why');
  assert.match(s.out.toasts.join(' '), /invite link/i, 'and where to go instead');
});

test('a club that has not started using groups keeps the behaviour it had', () => {
  const s = buildScope({ members: ungrouped });
  s.addPlayer();
  assert.equal(s.state.players.length, 1, 'the record is still written');
  assert.equal(s.state.players[0].name, 'Manual Person');
  assert.equal(s.out.synced, 1, 'and still synced');
  assert.equal(s.operationalPlayers().length, 1, 'and it is visible, as before');
});

test('the record is described as a squad-list entry, never as onboarding', () => {
  const s = buildScope({ members: ungrouped });
  s.addPlayer();
  const said = s.out.notices.join(' ');
  assert.match(said, /squad list/i, 'it names what was made');
  assert.match(said, /invite link/i, 'and says what is still needed for a login');
  assert.ok(!/^Manual Person added to squad$/.test(said),
    'the old wording read as though the player could now use the app');
});

test('the roster record still creates no account, and never claims to', () => {
  const s = buildScope({ members: ungrouped });
  s.addPlayer();
  const rec = s.state.players[0];
  assert.equal(rec.userId, undefined, 'no server identity');
  assert.match(rec.email, /@player\.test$/, 'the address is a placeholder, as before');
  const src = extractFn(html, 'addPlayer');
  assert.ok(!/\/api\/invite|claimInvite|password/i.test(src),
    'it must not have grown an authentication path of its own');
});

test('the control is hidden entirely where its output could not be seen', () => {
  const panel = html.slice(html.indexOf('Squad list record — administrative'),
                           html.indexOf('<!-- Fallback: team code for bulk sharing -->'));
  assert.match(panel, /\$\{clubUsesPlayerGroups\(\) \? '' : `/,
    'it must be gated on the same predicate addPlayer() checks');
  assert.match(panel, /does not create a login/i, 'and must say so plainly');
  assert.match(panel, /invite link/i, 'and point at the path that does');
});

test('the guard and the group filter share one definition', () => {
  // If these ever diverge, the control reappears exactly where its output is
  // invisible again.
  const op = extractFn(html, 'operationalPlayers');
  assert.match(op, /if \(!clubUsesPlayerGroups\(\)\) return rows;/,
    'the filter must ask the shared predicate');
  const add = extractFn(html, 'addPlayer');
  assert.match(add, /if \(clubUsesPlayerGroups\(\)\)/, 'and so must the guard');
});

// ── 3. Pending joins — kept, because nothing else does its job ────────────────

test('Pending joins survives: it is the only way to admit a team-code joiner', () => {
  assert.ok(html.includes('function identityRequestsHtml()'), 'the list is still built');
  assert.ok(html.includes('function approveIdentityRequest('), 'approve is still available');
  assert.ok(html.includes('function rejectIdentityRequest('), 'reject is still available');
  const members = html.slice(html.indexOf('<!-- Pending account join requests'),
                             html.indexOf('<!-- Squad list record form'));
  assert.match(members, /identity-requests-panel/, 'and it is still rendered on Members');
  assert.match(members, /approveIdentityRequest|identityRequestsHtml/, 'with its actions');
});

test('Pending joins is shown only when it holds something', () => {
  const members = html.slice(html.indexOf('<!-- Pending account join requests'),
                             html.indexOf('<!-- Squad list record form'));
  assert.match(members, /_identityPendingRequests\.length === 0 \? '' :/,
    'an empty inbox must not occupy the top of Members');
  // Discovery does not depend on the panel being permanently visible.
  assert.match(html, /waiting for approval/, 'the Overview still raises them');
  assert.match(html, /label: 'Pending joins'/, 'and still offers a route here');
});

// ── 4. Nothing protected moved ───────────────────────────────────────────────

test('group isolation is exactly as it was', () => {
  const s = buildScope({
    members: [
      { id: 'tm1', userId: 'u-a', status: 'active', role: 'player', playerGroupId: 'grp_a' },
      { id: 'tm2', userId: 'u-b', status: 'active', role: 'player', playerGroupId: 'grp_b' },
    ],
    players: [{ id: 'p1', name: 'A Player', userId: 'u-a' }, { id: 'p2', name: 'B Player', userId: 'u-b' }],
  });
  s.state.operationalGroupId = 'grp_a';
  assert.deepEqual(s.operationalPlayers().map(p => p.name), ['A Player']);
  s.state.operationalGroupId = 'grp_b';
  assert.deepEqual(s.operationalPlayers().map(p => p.name), ['B Player']);
});

test('a player cannot leak into another group through the roster record', () => {
  // The U18 lesson: selection eligibility is group-scoped. A record with no
  // membership must not become club-wide-visible as a side effect of this build.
  const s = buildScope({ members: grouped, players: [{ id: 'p9', name: 'Ghost' }] });
  s.state.operationalGroupId = 'grp_a';
  assert.deepEqual(s.operationalPlayers().map(p => p.name), [],
    'a membership-less record still belongs to no group');
  s.state.operationalGroupId = 'grp_b';
  assert.deepEqual(s.operationalPlayers().map(p => p.name), []);
});

test('the fail-closed rule while admin data loads is untouched', () => {
  const op = extractFn(html, 'operationalPlayers');
  assert.match(op, /if \(!_adminData\.loaded && \(canI\('manage_players'\) \|\| canI\('manage_teams'\)\)\)/);
  assert.match(op, /return \[\];/, 'still fails CLOSED, never club-wide');
});

test('no permission, role or endpoint behaviour rides along', () => {
  const add = extractFn(html, 'addPlayer');
  for (const forbidden of ['canI(', 'canUseFeature(', 'accessScope', 'playerGroupId =', 'set_player_group']) {
    assert.ok(!add.includes(forbidden), `addPlayer must not touch ${forbidden}`);
  }
  const pred = extractFn(html, 'clubUsesPlayerGroups');
  assert.ok(!/fetch\(/.test(pred), 'the predicate reads loaded state only — no new request');
  assert.match(pred, /_adminData\.members/, 'and reads the membership list, the authority on groups');
});

test('the Overview data-integrity and appearance builds are untouched', () => {
  for (const fnName of ['overviewRoster', 'overviewAvailableCount', 'availabilityNonResponders',
                        'setAppearance', 'clubUsesPlayerGroups']) {
    assert.ok(html.includes(`function ${fnName}(`), `${fnName} must still exist`);
  }
});

test('the form cannot reappear from stale state where it could only refuse', () => {
  // state.showAddPlayer is persisted. A coach who left the form open before
  // their club started using groups would otherwise come back to a form whose
  // only possible outcome is the refusal toast.
  const members = html.slice(html.indexOf('<!-- Squad list record form'),
                             html.indexOf('<!-- Player database table'));
  assert.match(members, /state\.showAddPlayer && !clubUsesPlayerGroups\(\)/,
    'the form is gated on the same predicate as its trigger and as addPlayer()');
});
