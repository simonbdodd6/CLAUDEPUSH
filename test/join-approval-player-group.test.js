/**
 * APPROVING A TEAM-CODE JOIN PLACES THE PLAYER (trial readiness: Nick onboards a club alone).
 *
 * A team-code join creates a pending membership with no player group.
 * Approval used to activate it and stop: with one group the legacy rule
 * resolved the player anyway; with several, the approved player resolved to
 * NO group and vanished from every squad surface until an admin noticed the
 * "players not in any group" card. Approval now answers the question at the
 * moment the club does:
 *
 *   one active group    → the server places the player in it, unasked;
 *   several             → the caller names the group; a missing one is refused;
 *   named group         → must exist in THIS club and be active; a scoped
 *                         coach may only name a group they operate.
 *
 * Everything else about approval is unchanged: who may approve, the pending
 * check, the single membership, the profile that already exists. Real handlers
 * over an in-memory store, from an empty world with one platform administrator.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.join-approval.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;

const kv = new Map();
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith('https://api.resend.com')) return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) };
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');
const store = await import('../api/_identityStore.js');
const ST = await import('../api/_structureStore.js');
const { resolvePlayerGroup } = await import('../api/_accessScope.js');
const { INITIAL_GROUP_ID } = ST;

function emptyWorld() {
  kv.clear();
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-platform', email: 'platform@coacheasier.com', displayName: 'Platform Admin', platformRole: 'platform_admin' },
  ]));
  kv.set('app:identity:teams', JSON.stringify([]));
  kv.set('app:identity:team_members', JSON.stringify([]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set('ce:invites', JSON.stringify([]));
}
function makeRes() {
  return { code: 0, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end(b) { this.body = this.body ?? b ?? null; return this; } };
}
let ipSeq = 0;
async function call(handler, { method = 'POST', query = {}, body = null, token = '' } = {}) {
  const res = makeRes();
  await handler({ method, url: '/api/identity', query, body, on() {},
    headers: { 'content-type': 'application/json', host: 'test.local',
               'x-forwarded-for': `10.8.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250}`,
               cookie: token ? `ce_session=${token}` : '' } }, res);
  return res;
}
const identity = (body, token) => call(identityHandler, { method: 'POST', body, token });
const tokenOf = res => String(res.headers['Set-Cookie'] || '').split(';')[0].split('=')[1];
const members = () => JSON.parse(kv.get('app:identity:team_members') || '[]');
const profiles = () => JSON.parse(kv.get('app:identity:player_profiles') || '[]');
const memberById = id => members().find(m => m.id === id) || null;
const teamRecord = clubId => JSON.parse(kv.get('app:identity:teams') || '[]').find(t => t.id === clubId) || null;
const write = (key, value) => kv.set(key, JSON.stringify(value));

async function freshClub(clubName, adminEmail) {
  const platform = await store.createSession({ userId: 'u-platform', teamId: 'none', role: 'coach' });
  const provisioned = await identity({ action: 'provision_club', clubName, adminEmail, adminName: 'Frankie Founder' }, platform.token);
  assert.equal(provisioned.code, 201, JSON.stringify(provisioned.body));
  const inviteToken = decodeURIComponent(String(provisioned.body.inviteUrl).split('inv=')[1]);
  const claimed = await identity({ action: 'claim_invite', token: inviteToken, email: adminEmail,
    name: 'Frankie Founder', password: 'longEnough123', position: '2 — Hooker' });
  assert.equal(claimed.code, 201, JSON.stringify(claimed.body));
  return { clubId: provisioned.body.team.id, token: tokenOf(claimed), founderId: claimed.body.user.id,
           code: teamRecord(provisioned.body.team.id).teamCode };
}
let joinSeq = 0;
/** A player who typed the club's code: a pending, groupless membership. */
async function joinRequest(club, first = 'Jo') {
  const n = ++joinSeq;
  const r = await identity({ action: 'join', teamCode: club.code, firstName: first, lastName: `Joiner${n}`,
    email: `${first.toLowerCase()}${n}@${club.clubId}.test`, password: 'longEnough123' });
  assert.equal(r.code, 201, JSON.stringify(r.body));
  return { memberId: r.body.teamMember.id, userId: r.body.user.id };
}
/** A coach whose authority is ONE group — written as the store writes it, with a live session. */
async function scopedCoach(clubId, groupId) {
  const n = ++joinSeq;
  const userId = `u-scoped-${n}`;
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  users.push({ id: userId, email: `${userId}@${clubId}.test`, displayName: 'Scoped Coach' });
  write('app:identity:users', users);
  const list = members();
  list.push({ id: `m-${userId}`, teamId: clubId, userId, role: 'coach', staffLevel: 'head', status: 'active',
    accessProfile: 'coach', accessScope: { clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] } });
  write('app:identity:team_members', list);
  return (await store.createSession({ userId, teamId: clubId, role: 'coach' })).token;
}
const approve = (memberId, token, extra = {}) => identity({ action: 'approve', memberId, ...extra }, token);
const createGroup = async (clubId, name) => (await ST.createGroup(clubId, { name })).group.id;

// ── A1. One group ────────────────────────────────────────────────────────────

test('A1. one active group: approval places the player in it server-side, nothing named by the client', async () => {
  emptyWorld();
  const club = await freshClub('Newbridge RFC', 'founder@newbridge.test');
  const { memberId, userId } = await joinRequest(club);
  assert.equal(memberById(memberId).playerGroupId, undefined, 'precondition: a team-code join names no group');
  const r = await approve(memberId, club.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.teamMember.status, 'active');
  assert.equal(r.body.teamMember.playerGroupId, INITIAL_GROUP_ID, 'the response says where they play');
  const stored = memberById(memberId);
  assert.equal(stored.playerGroupId, INITIAL_GROUP_ID, 'and so does the store');
  const structure = await ST.loadClubStructure(club.clubId);
  assert.equal(resolvePlayerGroup(stored, structure).source, 'explicit', 'no longer leaning on the legacy one-group rule');
  assert.ok(profiles().some(p => p.userId === userId && p.teamId === club.clubId), 'a player profile exists');
  const state = await store.listIdentityState(club.clubId);
  assert.equal((state.pending || []).some(p => p.id === memberId), false, 'out of the inbox');
});

// ── A2. Several groups ───────────────────────────────────────────────────────

test('A2. several active groups: approval without a group is refused and writes nothing; a valid group is honoured', async () => {
  emptyWorld();
  const club = await freshClub('Newbridge RFC', 'founder@newbridge.test');
  const U18 = await createGroup(club.clubId, 'U18');
  const { memberId, userId } = await joinRequest(club);
  const membersBefore = kv.get('app:identity:team_members');
  const profilesBefore = kv.get('app:identity:player_profiles');
  const r = await approve(memberId, club.token);
  assert.equal(r.code, 400, JSON.stringify(r.body));
  assert.equal(r.body.code, 'group_required');
  assert.match(String(r.body.error), /which group/i);
  assert.equal(kv.get('app:identity:team_members'), membersBefore, 'still pending, byte for byte');
  assert.equal(kv.get('app:identity:player_profiles'), profilesBefore, 'no profile was created');
  for (const blank of ['', '   ', null]) {
    const b = await approve(memberId, club.token, { groupId: blank });
    assert.equal(b.code, 400, `blank group ${JSON.stringify(blank)} is a missing group`);
  }
  const ok = await approve(memberId, club.token, { groupId: U18 });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.teamMember.playerGroupId, U18);
  assert.equal(memberById(memberId).playerGroupId, U18);
  assert.ok(profiles().some(p => p.userId === userId), 'profile created on the real approval');
});

// ── A3. Invalid groups ───────────────────────────────────────────────────────

test('A3. an unknown, archived, malformed or OTHER club\'s group id is refused — the request stays pending', async () => {
  emptyWorld();
  const a = await freshClub('Alpha RFC', 'founder@alpha.test');
  const b = await freshClub('Bravo RFC', 'founder@bravo.test');
  const U18 = await createGroup(a.clubId, 'U18');
  const colts = await createGroup(a.clubId, 'Colts');
  await ST.setGroupStatus(a.clubId, colts, 'archived');
  const bees = await createGroup(b.clubId, 'Bees');            // exists — in Bravo
  const { memberId } = await joinRequest(a);
  const before = kv.get('app:identity:team_members');
  const cases = [
    ['unknown',        'grp_nope',        404],
    ['archived',       colts,             400],
    ["another club's", bees,              404],
    ['malformed',      { id: U18 },       400],
    ['malformed',      ['grp_initial'],   400],
  ];
  for (const [label, groupId, status] of cases) {
    const r = await approve(memberId, a.token, { groupId });
    assert.equal(r.code, status, `${label}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.ok, false);
  }
  assert.equal(kv.get('app:identity:team_members'), before, 'nothing was written by any refusal');
  assert.equal(memberById(memberId).status, 'pending');
  assert.equal(JSON.stringify((await approve(memberId, a.token, { groupId: bees })).body).includes('Bees'), false,
    "another club's group name never leaks into the refusal");
});

// ── A4. Scoped staff ─────────────────────────────────────────────────────────

test('A4. a group-scoped coach: no groupless approvals, no placing players into groups they do not operate; their own group works', async () => {
  emptyWorld();
  const club = await freshClub('Newbridge RFC', 'founder@newbridge.test');
  const U18 = await createGroup(club.clubId, 'U18');
  const u18Coach = await scopedCoach(club.clubId, U18);
  const lost = await joinRequest(club, 'Lost');            // groupless: club administration
  let r = await approve(lost.memberId, u18Coach);
  assert.equal(r.code, 403, 'a groupless request is club administration');
  r = await approve(lost.memberId, u18Coach, { groupId: U18 });
  assert.equal(r.code, 403, 'naming their own group does not make it theirs — the record decides');
  assert.equal(memberById(lost.memberId).status, 'pending');

  // A request already placed in U18 (an invite-born or admin-tagged request).
  const tagged = await joinRequest(club, 'Tagged');
  const list = members(); list.find(m => m.id === tagged.memberId).playerGroupId = U18; write('app:identity:team_members', list);
  r = await approve(tagged.memberId, u18Coach, { groupId: INITIAL_GROUP_ID });
  assert.equal(r.code, 403, 'cannot move the player into a group they do not operate');
  assert.equal(memberById(tagged.memberId).status, 'pending');
  r = await approve(tagged.memberId, u18Coach);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(memberById(tagged.memberId).playerGroupId, U18, 'kept where the record put them');
  assert.equal(memberById(tagged.memberId).status, 'active');
});

// ── A5. No duplicates, nothing re-decided ────────────────────────────────────

test('A5. approving twice is refused; the membership list never grows; a request that already names a valid group keeps it', async () => {
  emptyWorld();
  const club = await freshClub('Newbridge RFC', 'founder@newbridge.test');
  const U18 = await createGroup(club.clubId, 'U18');
  const { memberId } = await joinRequest(club);
  const list = members(); list.find(m => m.id === memberId).playerGroupId = U18; write('app:identity:team_members', list);
  const count = members().length;
  const first = await approve(memberId, club.token);
  assert.equal(first.code, 200, JSON.stringify(first.body));
  assert.equal(memberById(memberId).playerGroupId, U18, 'with two groups and no group named, the record\'s own group stands');
  const second = await approve(memberId, club.token, { groupId: INITIAL_GROUP_ID });
  assert.equal(second.code, 409, 'not pending any more');
  assert.equal(memberById(memberId).playerGroupId, U18, 'and a second decision moves nobody');
  assert.equal(members().length, count, 'one person, one membership');
  assert.equal(members().filter(m => m.teamId === club.clubId && m.userId === memberById(memberId).userId).length, 1);
});

// ── A6. Existing records survive ─────────────────────────────────────────────

test('A6. an existing player profile and availability identity survive approval untouched; no availability key is written', async () => {
  emptyWorld();
  const club = await freshClub('Newbridge RFC', 'founder@newbridge.test');
  const { memberId, userId } = await joinRequest(club);
  // A profile from an earlier life (a prior season's roster row): position set, availability identity set.
  write('app:identity:player_profiles', [{ id: 'profile-old', teamMemberId: memberId, teamId: club.clubId, userId,
    displayName: 'Jo Joiner', position: 'Prop', phone: '0470', email: `x@${club.clubId}.test`, legacyPlayerId: 'inv-OLDID123',
    createdAt: '2026-01-01T00:00:00.000Z' }]);
  const availabilityBefore = [...kv.keys()].filter(k => /availability/.test(k)).map(k => [k, kv.get(k)]);
  const r = await approve(memberId, club.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const mine = profiles().filter(p => p.teamMemberId === memberId);
  assert.equal(mine.length, 1, 'no second profile');
  assert.equal(mine[0].id, 'profile-old');
  assert.equal(mine[0].position, 'Prop', 'the position was not reset to TBC');
  assert.equal(mine[0].legacyPlayerId, 'inv-OLDID123', 'the availability identity is intact');
  assert.equal(mine[0].phone, '0470');
  assert.deepEqual([...kv.keys()].filter(k => /availability/.test(k)).map(k => [k, kv.get(k)]), availabilityBefore,
    'approval writes no availability data');
  assert.equal(memberById(memberId).playerGroupId, INITIAL_GROUP_ID);
});

// ── A7. Who may approve is unchanged ─────────────────────────────────────────

test('A7. the owner approves; a player, another club\'s staff and an anonymous caller are refused', async () => {
  emptyWorld();
  const a = await freshClub('Alpha RFC', 'founder@alpha.test');
  const b = await freshClub('Bravo RFC', 'founder@bravo.test');
  const p1 = await joinRequest(a, 'One');
  const p2 = await joinRequest(a, 'Two');
  assert.equal((await approve(p1.memberId, a.token)).code, 200);
  const playerToken = (await store.createSession({ userId: p1.userId, teamId: a.clubId, role: 'player' })).token;
  assert.equal((await approve(p2.memberId, playerToken)).code, 403, 'a player may not approve');
  assert.equal((await approve(p2.memberId, b.token)).code, 403, "another club's owner may not approve");
  assert.equal((await approve(p2.memberId, '')).code, 401, 'anonymous');
  assert.equal(memberById(p2.memberId).status, 'pending');
});

// ── A8. Nowhere to place anyone ──────────────────────────────────────────────

test('A8. with no active group at all, approval is refused rather than minting a player nobody can see', async () => {
  emptyWorld();
  const club = await freshClub('Newbridge RFC', 'founder@newbridge.test');
  const { memberId } = await joinRequest(club);
  // The store refuses to archive the last group, so this state is written directly.
  write(`app:structure:${club.clubId}`, { version: 1, groups: [{ id: INITIAL_GROUP_ID, name: 'Newbridge RFC', type: 'general', status: 'archived' }],
    teams: [{ id: 'team_initial', groupId: INITIAL_GROUP_ID, name: 'Newbridge RFC', status: 'archived' }] });
  const r = await approve(memberId, club.token);
  assert.equal(r.code, 400, JSON.stringify(r.body));
  assert.equal(r.body.code, 'no_active_group');
  assert.equal(memberById(memberId).status, 'pending');
  const forced = await approve(memberId, club.token, { groupId: INITIAL_GROUP_ID });
  assert.equal(forced.code, 400, 'naming the archived group does not help');
});

// ── A9. The inbox asks the question the server will ask ──────────────────────

test('A9. index.html: the Pending joins inbox offers a group choice when several are operable, sends groupId, and keeps the refusal visible', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const inbox = html.slice(html.indexOf('function identityRequestsHtml'), html.indexOf('function renderIdentityRequestsPanel'));
  assert.ok(/<select[^>]*id="approve-group-\$\{/.test(inbox), 'a per-request group select');
  assert.ok(/Choose a group/.test(inbox), 'with an explicit "choose" placeholder, never a preselected guess');
  const fn = html.slice(html.indexOf('async function approveIdentityRequest'), html.indexOf('async function rejectIdentityRequest'));
  assert.ok(/groupId/.test(fn), 'the chosen group is sent');
  assert.ok(/_identityRequestNotes/.test(fn) && /_identityRequestNotes/.test(inbox), 'the server\'s refusal is rendered beside the request, not only toasted');
});
