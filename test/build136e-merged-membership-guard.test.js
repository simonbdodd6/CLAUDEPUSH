/**
 * A MEMBERSHIP RETIRED BY A MERGE NEVER RESURRECTS (Build 136E prep).
 *
 * The duplicate-player repair (Build 136D plan) retires the duplicate
 * membership as `removed` + `mergedInto: <kept account>`, keeps both login
 * accounts and carries history on the kept profile's legacyPlayerId. Before
 * this guard, the retired account opening the squad link again was set back
 * to active by ensureTeamMember (the duplicate-name guard only watches NEW
 * accounts), so the duplicate came straight back. Now the claim and the
 * team-code join refuse it before any write, with a message that names
 * nothing about the retained account. Everything else about joining is
 * unchanged, and that is tested too. Real store + handler, synthetic data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installKv } from './build135-kv.js';

const URL_ = 'https://redis.merged.test';
process.env.UPSTASH_REDIS_REST_URL = URL_;
process.env.UPSTASH_REDIS_REST_TOKEN = 'merged-token';
process.env.APP_KEY_PREFIX = 'app';
delete process.env.VERCEL; delete process.env.VERCEL_ENV;

const kv = installKv({ maxDelayMs: 0 });
const db = kv.dbFor(URL_);
const S = await import('../api/_identityStore.js');
const ST = await import('../api/_structureStore.js');
const I = await import('../api/_inviteStore.js');
const { default: identity } = await import('../api/identity.js');

const PW = 'password-m1';
const read = k => JSON.parse(db.data.get(k) || 'null');
const members = () => read('app:identity:team_members') || [];
const users = () => read('app:identity:users') || [];
const profiles = () => read('app:identity:player_profiles') || [];
const sessions = () => read('app:identity:sessions') || [];
const rosterRows = teamId => read(`app:roster:${teamId}`)?.players || [];
const membership = (uid, teamId) => members().find(m => m.userId === uid && m.teamId === teamId) || null;
const snapshot = teamId => JSON.stringify({ users: users(), members: members(), profiles: profiles(), sessions: sessions(), roster: rosterRows(teamId) });
const claim = (token, email, name, extra = {}) => S.claimInvite({ token, email, password: PW, name, position: 'Prop', ...extra });
const idOf = r => String(r.user?.id || '');

function jres() { return { statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader(n, v) { this.headers[n] = v; }, end() { return this; } }; }
let ipN = 0;
async function httpClaim(body) {
  const r = jres();
  await identity({ method: 'POST', query: {}, headers: { host: 'm.test', 'x-forwarded-for': `10.136.${Math.floor(++ipN / 250)}.${ipN % 250}` }, body: { action: 'claim_invite', ...body } }, r);
  return r;
}

async function link(teamId, token, playerGroupId) {
  await S.withIdentityLock(() => I.appendClubInvite(teamId, { token, teamId, role: 'player', kind: 'group', status: 'pending', playerGroupId, createdAt: new Date().toISOString() }));
}

/** Two clubs; in Alpha a kept account and a duplicate retired exactly as the 136D plan retires it. */
async function world() {
  db.data.clear(); db.lists.clear(); db.expiry.clear();
  const A = await S.createClub({ clubName: 'Alpha RFC', teamName: 'Seniors', sport: 'rugby', name: 'Olive Owner', email: 'owner@alpha.test', password: PW });
  const B = await S.createClub({ clubName: 'Bravo RFC', teamName: 'Seniors', sport: 'rugby', name: 'Bob Owner', email: 'owner@bravo.test', password: PW });
  const a = A.team.id, b = B.team.id;
  const groupA = (await ST.loadClubStructure(a)).groups.find(g => g.status !== 'archived').id;
  const groupB = (await ST.loadClubStructure(b)).groups.find(g => g.status !== 'archived').id;
  await link(a, 'sq_a', groupA);
  await link(b, 'sq_b', groupB);
  const kept = await claim('sq_a', 'pat.kept@alpha.test', 'Pat Dup');
  const dup = await claim('sq_a', 'pat.dup@alpha.test', 'Pat Dup', { confirmDifferentPerson: true });   // how the production pairs arose, pre-Build 101
  // the 136D repair, as it would be written
  await S.withIdentityLock(async () => {
    const ms = await S.loadTeamMembers();
    Object.assign(ms.find(m => m.userId === idOf(dup) && m.teamId === a), { status: 'removed', removedAt: new Date().toISOString(), removedBy: 'build-136e-merge', mergedInto: idOf(kept) });
    await S.saveTeamMembers(ms);
    const ps = await S.loadPlayerProfiles();
    ps.find(p => p.userId === idOf(kept) && p.teamId === a).legacyPlayerId = idOf(dup);
    await S.savePlayerProfiles(ps.filter(p => !(p.userId === idOf(dup) && p.teamId === a)));
    await S.saveSessions((await S.loadSessions()).filter(s => !(s.userId === idOf(dup) && s.teamId === a)));
  });
  const roster = read(`app:roster:${a}`);
  if (roster) { roster.players = roster.players.filter(r => r.userId !== idOf(dup)); db.data.set(`app:roster:${a}`, JSON.stringify(roster)); }
  const teamCodeA = read('app:identity:teams').find(t => t.id === a).teamCode;
  return { A, B, a, b, groupA, kept, dup, teamCodeA };
}

const expectMerged = (label, e) => {
  assert.equal(e.status, 409, `${label}: 409`);
  assert.equal(e.code, 'membership_merged', `${label}: code`);
  return true;
};

test('A+B. the retired account claiming the squad link again is refused — and nothing changes', async () => {
  const w = await world();
  const before = snapshot(w.a);
  await assert.rejects(claim('sq_a', 'pat.dup@alpha.test', 'Pat Dup'), e => expectMerged('claim', e));
  assert.equal(snapshot(w.a), before, 'users, memberships, profiles, sessions and roster are byte-identical');
  const m = membership(idOf(w.dup), w.a);
  assert.equal(m.status, 'removed'); assert.equal(m.mergedInto, idOf(w.kept));
  assert.equal(members().filter(x => x.teamId === w.a && x.userId === idOf(w.dup)).length, 1, 'no second membership');
  assert.equal(membership(idOf(w.kept), w.a).status, 'active', 'the retained membership untouched');
  assert.equal(profiles().some(p => p.userId === idOf(w.dup) && p.teamId === w.a), false, 'no profile re-created');
  assert.equal(sessions().some(s => s.userId === idOf(w.dup)), false, 'no session issued');
});

test('the refusal comes before the position question and before any write', async () => {
  const w = await world();
  const before = snapshot(w.a);
  await assert.rejects(S.claimInvite({ token: 'sq_a', email: 'pat.dup@alpha.test', password: PW, name: 'Pat Dup' }),   // no position at all
    e => expectMerged('claim without position', e));
  assert.equal(snapshot(w.a), before);
});

test('C. the rejection names nothing: no retained id, no retained email, no mergedInto, no membership id — in the store and over HTTP', async () => {
  const w = await world();
  const secrets = [idOf(w.kept), 'pat.kept@alpha.test', membership(idOf(w.dup), w.a).id, membership(idOf(w.kept), w.a).id];
  let err;
  try { await claim('sq_a', 'pat.dup@alpha.test', 'Pat Dup'); } catch (e) { err = e; }
  assert.ok(err && err.code === 'membership_merged');
  for (const s of secrets) assert.equal(String(err.message).includes(s), false, `message does not contain ${s}`);
  assert.equal(JSON.stringify(err).includes(idOf(w.kept)), false, 'no mergedInto value on the error object');
  const r = await httpClaim({ token: 'sq_a', email: 'pat.dup@alpha.test', password: PW, name: 'Pat Dup', position: 'Prop' });
  assert.equal(r.statusCode, 409);
  assert.equal(r.body.ok, false); assert.equal(r.body.code, 'membership_merged');
  assert.equal(r.headers['Set-Cookie'], undefined, 'no session cookie');
  const body = JSON.stringify(r.body);
  for (const s of [...secrets, 'mergedInto']) assert.equal(body.includes(s), false, `response does not contain ${s}`);
});

test('D. ordinary memberships keep today\'s contract: an active member re-claims in place; a plainly removed member is reactivated', async () => {
  const w = await world();
  const again = await claim('sq_a', 'pat.kept@alpha.test', 'Pat Dup');
  assert.equal(idOf(again), idOf(w.kept));
  assert.equal(members().filter(m => m.teamId === w.a && m.userId === idOf(w.kept)).length, 1);
  assert.equal(membership(idOf(w.kept), w.a).status, 'active');
  // a member the owner removed the ordinary way (no mergedInto)
  const rex = await claim('sq_a', 'rex@alpha.test', 'Rex Removed');
  await S.removeTeamMember(rex.teamMember.id, w.A.user.id, w.a);
  assert.equal(membership(idOf(rex), w.a).status, 'removed');
  const back = await claim('sq_a', 'rex@alpha.test', 'Rex Removed');
  assert.equal(idOf(back), idOf(rex));
  assert.equal(membership(idOf(rex), w.a).status, 'active', 'an ordinary removed membership still reactivates');
  // an active membership carrying a stray marker is not retired: the guard needs BOTH conditions
  await S.withIdentityLock(async () => { const ms = await S.loadTeamMembers(); ms.find(m => m.userId === idOf(rex) && m.teamId === w.a).mergedInto = 'user_stray'; await S.saveTeamMembers(ms); });
  await claim('sq_a', 'rex@alpha.test', 'Rex Removed');
  assert.equal(membership(idOf(rex), w.a).status, 'active');
});

test('E. the new-account duplicate-name protection is unchanged', async () => {
  const w = await world();
  const before = members().length;
  await assert.rejects(claim('sq_a', 'pat.third@alpha.test', 'Pat Dup'), e => e.status === 409 && e.code === 'possible_duplicate_player');
  assert.equal(members().length, before);
  const third = await claim('sq_a', 'pat.third@alpha.test', 'Pat Dup', { confirmDifferentPerson: true });
  assert.equal(membership(idOf(third), w.a).status, 'active');
  assert.equal(membership(idOf(w.dup), w.a).status, 'removed', 'and the retired one stays retired');
});

test('F. another club is another club: a Bravo player joins Alpha as before, and the account retired in Alpha may still join Bravo', async () => {
  const w = await world();
  const bravoPlayer = await claim('sq_b', 'bea@bravo.test', 'Bea Bravo');
  const joinedA = await claim('sq_a', 'bea@bravo.test', 'Bea Bravo');
  assert.equal(idOf(joinedA), idOf(bravoPlayer));
  assert.equal(membership(idOf(bravoPlayer), w.a)?.status, 'active', 'membership in Alpha created');
  assert.equal(membership(idOf(bravoPlayer), w.b).status, 'active', 'Bravo untouched');
  const dupInB = await claim('sq_b', 'pat.dup@alpha.test', 'Pat Dup');
  assert.equal(idOf(dupInB), idOf(w.dup));
  assert.equal(membership(idOf(w.dup), w.b).status, 'active', 'the merge is per club');
  assert.equal(membership(idOf(w.dup), w.a).status, 'removed');
  assert.equal(membership(idOf(w.dup), w.a).mergedInto, idOf(w.kept));
});

test('G. an approved join request that then opens the link keeps one active membership', async () => {
  const w = await world();
  const req = await S.createJoinRequest({ teamCode: w.teamCodeA, firstName: 'Gus', lastName: 'Granted', email: 'gus@alpha.test', password: PW });
  assert.equal(req.teamMember.status, 'pending');
  await S.approveJoinRequest(req.teamMember.id, w.A.user.id, w.a);
  assert.equal(membership(req.user.id, w.a).status, 'active');
  await claim('sq_a', 'gus@alpha.test', 'Gus Granted');
  assert.equal(members().filter(m => m.teamId === w.a && m.userId === req.user.id).length, 1);
  assert.equal(membership(req.user.id, w.a).status, 'active');
});

test('H. repeated attempts of every kind never resurrect it', async () => {
  const w = await world();
  const before = snapshot(w.a);
  for (let i = 0; i < 5; i++) {
    await assert.rejects(S.claimInvite({ token: 'sq_a', email: 'pat.dup@alpha.test', password: 'wrong-password', name: 'Pat Dup', position: 'Prop' }), e => e.status === 403, 'wrong password: the account-takeover guard first');
    await assert.rejects(claim('sq_a', 'pat.dup@alpha.test', 'Pat Dup'), e => expectMerged(`attempt ${i}`, e));
    await assert.rejects(claim('sq_a', 'pat.dup@alpha.test', 'Pat Dup', { confirmDifferentPerson: true }), e => expectMerged(`confirmed attempt ${i}`, e));
    await assert.rejects(S.createJoinRequest({ teamCode: w.teamCodeA, firstName: 'Pat', lastName: 'Dup', email: 'pat.dup@alpha.test', password: PW }), e => expectMerged(`join ${i}`, e));
  }
  assert.equal(snapshot(w.a), before, 'nothing changed across 20 attempts');
});

test('I. the team-code join is refused too, and a rejected request still becomes pending again (unchanged)', async () => {
  const w = await world();
  await assert.rejects(S.createJoinRequest({ teamCode: w.teamCodeA, firstName: 'Pat', lastName: 'Dup', email: 'pat.dup@alpha.test', password: PW }), e => expectMerged('join', e));
  assert.equal(membership(idOf(w.dup), w.a).status, 'removed');
  assert.equal(members().filter(m => m.teamId === w.a && m.userId === idOf(w.dup)).length, 1, 'no pending request created');
  const r = await S.createJoinRequest({ teamCode: w.teamCodeA, firstName: 'Rae', lastName: 'Rejected', email: 'rae@alpha.test', password: PW });
  await S.rejectJoinRequest(r.teamMember.id, w.A.user.id, w.a);
  assert.equal(membership(r.user.id, w.a).status, 'rejected');
  const again = await S.createJoinRequest({ teamCode: w.teamCodeA, firstName: 'Rae', lastName: 'Rejected', email: 'rae@alpha.test', password: PW });
  assert.equal(again.teamMember.status, 'pending', 'a rejected request re-joins as pending, exactly as before');
});

test('the predicate: removed + mergedInto only', () => {
  assert.equal(S.membershipMergedAway({ status: 'removed', mergedInto: 'user_k' }), true);
  assert.equal(S.membershipMergedAway({ status: 'removed', mergedInto: '  user_k ' }), true);
  assert.equal(S.membershipMergedAway({ status: 'removed' }), false);
  assert.equal(S.membershipMergedAway({ status: 'removed', mergedInto: '' }), false);
  assert.equal(S.membershipMergedAway({ status: 'active', mergedInto: 'user_k' }), false);
  assert.equal(S.membershipMergedAway({ status: 'archived', mergedInto: 'user_k' }), false);
  assert.equal(S.membershipMergedAway({ status: 'deleted', mergedInto: 'user_k' }), false);
  assert.equal(S.membershipMergedAway(null), false);
  assert.equal(S.membershipMergedAway(undefined), false);
});
