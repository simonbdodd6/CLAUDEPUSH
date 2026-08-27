/**
 * D1 — onboarding a SECOND playing group (the U18 case).
 *
 * A player belongs to exactly ONE group and is automatically eligible for every
 * active team inside it, so an invite names a GROUP and never a team. These pin
 * the multi-group invite path end to end: the client asks for the group, the
 * server refuses an invite that omits it, the claim stamps it, and eligibility
 * follows the group — with the existing Seniors squad left completely alone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.u18.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const store = await import('../api/_identityStore.js');
const { default: inviteHandler } = await import('../api/invite.js');
const { createGroup, createTeam, loadClubStructure } = await import('../api/_structureStore.js');
const { resolvePlayerGroup, resolveEligibility } = await import('../api/_accessScope.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'boitsfort-test';
const OTHER = 'other-club';
const SEN = 'grp-seniors', U18 = 'grp-u18', OLD = 'grp-vets';

/** Seniors exactly as production looks today, before U18 exists. */
const SENIORS_ONLY = {
  version: 1,
  groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }],
  teams: [
    { id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 't-dev', groupId: SEN, name: 'Premier Development', status: 'active' },
  ],
};

const MEMBERS = [
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true },
  // A backfilled Seniors player, exactly as the D1a migration left the real 41.
  { id: 'm-sen', teamId: CLUB, userId: 'u-sen', role: 'player', status: 'active', playerGroupId: SEN },
];

function seed(structure = SENIORS_ONLY) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }, { id: OTHER, name: 'Other' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structure));
  kv.set(`app:structure:${OTHER}`, JSON.stringify({
    version: 1,
    groups: [{ id: 'grp-foreign', name: 'Foreign', type: 'general', status: 'active' }],
    teams: [],
  }));
  kv.set('ce:invites', JSON.stringify([]));
}

async function ownerCookie() {
  const s = await createSession({ userId: 'u-owner', teamId: CLUB, role: 'admin' });
  return `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
}

function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}

async function invite(cookie, body) {
  const r = res();
  await inviteHandler({ method: 'POST', headers: { cookie }, body, query: {} }, r);
  return r.result;
}

/** The endpoint answers 201 Created; assert success without pinning the code. */
const created = result => assert.ok(result.code === 200 || result.code === 201,
  `expected a success code, got ${result.code}: ${JSON.stringify(result.body)}`);

/** Build the two-group club the way an admin actually would. */
async function addU18() {
  await createGroup(CLUB, { name: 'U18' });
  const st = await loadClubStructure(CLUB);
  const u18 = st.groups.find(g => g.name === 'U18');
  await createTeam(CLUB, { groupId: u18.id, name: 'U18 Premier' });
  await createTeam(CLUB, { groupId: u18.id, name: 'U18 Premier Development' });
  return u18.id;
}

// ── STRUCTURE ──────────────────────────────────────────────────────────────
test('a second group is added to the SAME club, with its own teams', async () => {
  seed();
  const u18Id = await addU18();
  const st = await loadClubStructure(CLUB);

  assert.equal(st.groups.filter(g => g.status === 'active').length, 2);
  assert.deepEqual(st.groups.map(g => g.name).sort(), ['Seniors', 'U18']);
  assert.deepEqual(st.teams.filter(t => t.groupId === u18Id).map(t => t.name).sort(),
    ['U18 Premier', 'U18 Premier Development']);
  // Same tenant — no second club, and Seniors untouched.
  assert.equal(st.clubId ?? CLUB, CLUB);
  assert.deepEqual(st.teams.filter(t => t.groupId === SEN).map(t => t.name).sort(),
    ['Premier', 'Premier Development']);
  assert.equal(JSON.parse(kv.get('app:identity:teams')).length, 2, 'no new tenant created');
});

test('creating a group never touches memberships — Seniors players stay put', async () => {
  seed();
  const before = kv.get('app:identity:team_members');
  await addU18();
  assert.equal(kv.get('app:identity:team_members'), before,
    'membership storage is byte-identical after adding a group');

  const st = await loadClubStructure(CLUB);
  const senior = MEMBERS.find(m => m.id === 'm-sen');
  assert.equal(resolvePlayerGroup(senior, st).groupId, SEN, 'still Seniors');
  assert.deepEqual(resolveEligibility(senior, st).teamIds.sort(), ['t-dev', 't-prem'],
    'Seniors eligibility unchanged by the arrival of U18');
});

test('a duplicate group name is refused', async () => {
  seed();
  await assert.rejects(() => createGroup(CLUB, { name: 'Seniors' }), /already exists/);
});

// ── PLAYER INVITE: ONE GROUP ───────────────────────────────────────────────
test('with a single group the invite needs no explicit choice', async () => {
  seed();
  const cookie = await ownerCookie();
  const r = await invite(cookie, { name: 'New Senior', role: 'player' });
  created(r);
  const stored = JSON.parse(kv.get('app:invites:boitsfort-test'))[0];
  assert.equal(stored.playerGroupId, SEN, 'inferred, because there is only one answer');
});

// ── PLAYER INVITE: TWO GROUPS ──────────────────────────────────────────────
test('with two groups the invite MUST name one — no silent default', async () => {
  seed();
  await addU18();
  const cookie = await ownerCookie();

  const missing = await invite(cookie, { name: 'Ambiguous', role: 'player' });
  assert.equal(missing.code, 400);
  assert.match(missing.body.error, /Choose which group/);
  assert.equal(JSON.parse(kv.get('app:invites:boitsfort-test') || '[]').length, 0, 'nothing was created');
});

test('a U18 invite stores U18; a Seniors invite stores Seniors', async () => {
  seed();
  const u18Id = await addU18();
  const cookie = await ownerCookie();

  created(await invite(cookie, { name: 'Young', role: 'player', playerGroupId: u18Id }));
  created(await invite(cookie, { name: 'Older', role: 'player', playerGroupId: SEN }));

  const stored = JSON.parse(kv.get('app:invites:boitsfort-test'));
  assert.equal(stored.find(i => i.name === 'Young').playerGroupId, u18Id);
  assert.equal(stored.find(i => i.name === 'Older').playerGroupId, SEN);
});

// ── GUARDRAILS ─────────────────────────────────────────────────────────────
test('an unknown, archived, foreign or team id is refused', async () => {
  seed();
  await addU18();
  const cookie = await ownerCookie();

  assert.equal((await invite(cookie, { name: 'A', role: 'player', playerGroupId: 'grp-nope' })).code, 404,
    'unknown group');
  assert.equal((await invite(cookie, { name: 'B', role: 'player', playerGroupId: 'grp-foreign' })).code, 404,
    'another club\'s group is invisible to this club');
  assert.equal((await invite(cookie, { name: 'C', role: 'player', playerGroupId: 't-prem' })).code, 404,
    'a TEAM id cannot masquerade as a group id');

  // Archive U18 and try again.
  const st = await loadClubStructure(CLUB);
  st.groups = st.groups.map(g => g.name === 'U18' ? { ...g, status: 'archived' } : g);
  kv.set(`app:structure:${CLUB}`, JSON.stringify(st));
  const u18Id = st.groups.find(g => g.name === 'U18').id;
  const archived = await invite(cookie, { name: 'D', role: 'player', playerGroupId: u18Id });
  assert.equal(archived.code, 400);
  assert.match(archived.body.error, /archived/);

  assert.equal(JSON.parse(kv.get('app:invites:boitsfort-test') || '[]').length, 0, 'no invite survived a refusal');
});

// ── CLAIM ──────────────────────────────────────────────────────────────────
test('claiming a U18 invite yields a U18 player eligible for both U18 teams', async () => {
  seed();
  const u18Id = await addU18();
  const cookie = await ownerCookie();
  const made = await invite(cookie, { name: 'U18 Player', role: 'player', playerGroupId: u18Id });
  created(made);
  const token = made.body.token;

  const claimed = await store.claimInvite({
    token, email: 'u18player@c.test', password: 'Str0ngPass!23', displayName: 'U18 Player',
  });
  assert.ok(claimed, 'claim succeeded');

  const members = JSON.parse(kv.get('app:identity:team_members'));
  const member = members.find(m => m.userId === claimed.user.id);
  assert.equal(member.playerGroupId, u18Id, 'membership carries the invited group');
  assert.equal(member.role, 'player');

  const st = await loadClubStructure(CLUB);
  const teams = st.teams.filter(t => t.groupId === u18Id).map(t => t.id).sort();
  const elig = resolveEligibility(member, st);
  assert.deepEqual(elig.teamIds.sort(), teams, 'eligible for BOTH U18 teams');
  assert.equal(elig.teamIds.includes('t-prem'), false, 'never Premier');
  assert.equal(elig.teamIds.includes('t-dev'), false, 'never Premier Development');
  assert.equal(resolvePlayerGroup(member, st).group.name, 'U18', 'age group derives U18');
});

test('the existing Seniors player is unaffected by all of the above', async () => {
  const members = JSON.parse(kv.get('app:identity:team_members'));
  const senior = members.find(m => m.id === 'm-sen');
  assert.equal(senior.playerGroupId, SEN);
  assert.equal(senior.role, 'player');
  assert.equal(senior.accessScope, undefined, 'no staff scope invented');
  const st = await loadClubStructure(CLUB);
  assert.deepEqual(resolveEligibility(senior, st).teamIds.sort(), ['t-dev', 't-prem']);
});

// ── STAFF STAYS SEPARATE ───────────────────────────────────────────────────
test('a staff invite creates no player group and no playing eligibility', async () => {
  seed();
  const u18Id = await addU18();
  const cookie = await ownerCookie();

  const r = await invite(cookie, { name: 'U18 Coach', role: 'coach', staffLevel: 'head',
    scope: { level: 'group', groupId: u18Id } });
  created(r);
  const stored = JSON.parse(kv.get('app:invites:boitsfort-test')).find(i => i.name === 'U18 Coach');
  assert.equal(stored.playerGroupId, undefined, 'staff invites never carry a player group');
  assert.equal(stored.scope.groupId, u18Id, 'staff scope is the separate concept');
});

test('dual role survives: plays U18, coaches Seniors', async () => {
  seed();
  const u18Id = await addU18();
  const st = await loadClubStructure(CLUB);
  const dual = { id: 'm-dual', teamId: CLUB, userId: 'u-dual', role: 'coach', status: 'active',
    playerGroupId: u18Id,
    accessScope: { clubWide: false, groups: [{ groupId: SEN, status: 'active' }], teams: [] } };

  assert.equal(resolvePlayerGroup(dual, st).group.name, 'U18', 'plays U18');
  const teams = st.teams.filter(t => t.groupId === u18Id).map(t => t.id).sort();
  assert.deepEqual(resolveEligibility(dual, st).teamIds.sort(), teams, 'U18 eligibility only');
  assert.equal(dual.accessScope.groups[0].groupId, SEN, 'coaches Seniors, independently');
});

// ── RESEND / CANCEL ────────────────────────────────────────────────────────
test('resend preserves the group; revoke changes no membership', async () => {
  seed();
  const u18Id = await addU18();
  const cookie = await ownerCookie();
  const made = await invite(cookie, { name: 'Resend Me', role: 'player', playerGroupId: u18Id });
  created(made);
  const token = made.body.token;
  const membersBefore = kv.get('app:identity:team_members');

  // Resend rewrites nothing about the invite's target group.
  const r = res();
  await inviteHandler({ method: 'PATCH', headers: { cookie }, body: { token, action: 'resend' }, query: {} }, r);
  assert.equal(JSON.parse(kv.get('app:invites:boitsfort-test')).find(i => i.token === token).playerGroupId, u18Id);

  const d = res();
  await inviteHandler({ method: 'DELETE', headers: { cookie }, body: { token }, query: {} }, d);
  assert.equal(kv.get('app:identity:team_members'), membersBefore,
    'revoking an invite never touches memberships');
});

// ── CLIENT: the inviter picks a GROUP, never a team ────────────────────────
function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let depth = 0, end = src.indexOf('{', start);
  for (let b = end; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

function inviteUi(groups, teams) {
  const admin = { structure: { groups, teams } };
  const els = {};
  const doc = { getElementById: id => els[id] || (els[id] = { value: '', innerHTML: '', textContent: '', style: {} }) };
  const api = new Function(`
    const _adminData = arguments[0];
    const document = arguments[1];
    function esc(s) { return String(s == null ? '' : s); }
    ${fn('activePlayerGroups')}
    ${fn('groupTeamNames')}
    ${fn('playerGroupEligibilityNote')}
    ${fn('renderInvitePlayerGroupOptions')}
    ${fn('updateInvitePlayerGroupNote')}
    ${fn('invitePlayerGroupValue')}
    return { activePlayerGroups, playerGroupEligibilityNote, renderInvitePlayerGroupOptions,
             invitePlayerGroupValue, els: arguments[2] };
  `)(admin, doc, els);
  return { ...api, els };
}

const G2 = [{ id: SEN, name: 'Seniors', status: 'active' },
            { id: U18, name: 'U18', status: 'active' },
            { id: OLD, name: 'Veterans', status: 'archived' }];
const T2 = [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' },
            { id: 't-dev', groupId: SEN, name: 'Premier Development', status: 'active' },
            { id: 't-u18a', groupId: U18, name: 'U18 Premier', status: 'active' },
            { id: 't-u18b', groupId: U18, name: 'U18 Premier Development', status: 'active' },
            { id: 't-gone', groupId: U18, name: 'Old U18', status: 'archived' }];

test('the dropdown offers GROUPS only — never individual teams', () => {
  const ui = inviteUi(G2, T2);
  ui.renderInvitePlayerGroupOptions();
  const html = ui.els['inv-playergroup'].innerHTML;
  assert.match(html, /value="grp-seniors">Seniors</);
  assert.match(html, /value="grp-u18">U18</);
  for (const team of ['Premier', 'Premier Development', 'U18 Premier', 'U18 Premier Development']) {
    assert.equal(html.includes(`>${team}<`), false, `${team} must not be selectable`);
  }
  assert.equal(html.includes('Veterans'), false, 'archived groups are not offered');
});

test('the note tells the inviter which teams the group covers', () => {
  const ui = inviteUi(G2, T2);
  assert.equal(ui.playerGroupEligibilityNote(SEN), 'Eligible for: Premier, Premier Development');
  assert.equal(ui.playerGroupEligibilityNote(U18), 'Eligible for: U18 Premier, U18 Premier Development');
  assert.equal(ui.playerGroupEligibilityNote(U18).includes('Old U18'), false, 'archived teams excluded');
});

test('one group pre-selects; several require a real choice', () => {
  const one = inviteUi([{ id: SEN, name: 'Seniors', status: 'active' }],
                       [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }]);
  assert.equal(one.invitePlayerGroupValue(), SEN, 'no extra click when there is one answer');

  const two = inviteUi(G2, T2);
  assert.equal(two.invitePlayerGroupValue(), '', 'nothing is assumed with several groups');
  two.els['inv-playergroup'].value = U18;
  assert.equal(two.invitePlayerGroupValue(), U18, 'the explicit choice is used');
});

test('the invite request carries the group, and refuses without one', () => {
  const create = fn('createInvite');
  assert.match(create, /if \(role === 'player'\)/, 'asked only for players');
  assert.match(create, /playerGroupId = invitePlayerGroupValue\(\)/);
  assert.match(create, /Choose which group this player will play in/, 'client refuses before calling the API');
  assert.match(create, /\.\.\.\(playerGroupId \? \{ playerGroupId \} : \{\}\)/, 'sent to the server');

  // Staff invites must not acquire one.
  const role = fn('setInviteRole');
  assert.match(role, /role === 'player' && activePlayerGroups\(\)\.length > 1/,
    'the control appears for players with a real choice to make');
});

test('pending invites show where the player will land', () => {
  assert.match(src, /inv\.role === 'player' && inv\.playerGroupId \? ' · Group: ' \+ esc\(inviteGroupName\(inv\.playerGroupId\)\)/,
    'the target group is visible before they claim');
  assert.match(fn('inviteGroupName'), /Unknown group/, 'degrades safely if the group was archived');
});
