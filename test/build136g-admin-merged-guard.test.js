/**
 * ADMIN ACTIONS NEVER RESURRECT A MERGED MEMBERSHIP (Build 136G).
 *
 * Build 136E closed the join and claim doors. Two administrative doors were
 * still open (Build 136F): Members → Restore (`restoreTeamMember`) set a
 * merged-away membership back to active and re-projected its roster row, and
 * "Plays for" (`setPlayerGroup`) re-created the retired profile — after which
 * the shared-id healer would silently strip the alias carrying the person's
 * history on the kept account. Both now refuse a membership that is `removed`
 * with a non-blank `mergedInto`, before any write, with the same 409
 * `membership_merged` contract and a message naming nothing about the
 * retained account. Ordinary removed memberships keep today's behaviour.
 * Real store + handler over the in-memory Upstash stand-in; synthetic data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installKv } from './build135-kv.js';

const URL_ = 'https://redis.admin-merged.test';
process.env.UPSTASH_REDIS_REST_URL = URL_;
process.env.UPSTASH_REDIS_REST_TOKEN = 'admin-merged-token';
process.env.APP_KEY_PREFIX = 'app';
delete process.env.VERCEL; delete process.env.VERCEL_ENV;

const kv = installKv({ maxDelayMs: 0 });
const db = kv.dbFor(URL_);
const S = await import('../api/_identityStore.js');
const ST = await import('../api/_structureStore.js');
const I = await import('../api/_inviteStore.js');
const { default: identity } = await import('../api/identity.js');

const PW = 'password-g1';
const read = k => JSON.parse(db.data.get(k) || 'null');
const members = () => read('app:identity:team_members') || [];
const users = () => read('app:identity:users') || [];
const profiles = () => read('app:identity:profiles') || read('app:identity:player_profiles') || [];
const sessions = () => read('app:identity:sessions') || [];
const rosterRows = teamId => read(`app:roster:${teamId}`)?.players || [];
const membership = (uid, teamId) => members().find(m => m.userId === uid && m.teamId === teamId) || null;
const profileOf = (uid, teamId) => (read('app:identity:player_profiles') || []).find(p => p.userId === uid && p.teamId === teamId) || null;
const snapshot = teamId => JSON.stringify({ users: users(), members: members(), profiles: read('app:identity:player_profiles'), sessions: sessions(), roster: rosterRows(teamId), audit: read('app:identity:audit_log') });
const claim = (token, email, name, extra = {}) => S.claimInvite({ token, email, password: PW, name, position: 'Prop', ...extra });
const idOf = r => String(r.user?.id || '');
const cookie = s => `${S.SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

function jres() { return { statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader(n, v) { this.headers[n] = v; }, end() { return this; } }; }
let ipN = 0;
async function adminCall(session, body) {
  const r = jres();
  await identity({ method: 'POST', query: {}, headers: { host: 'g.test', 'x-forwarded-for': `10.137.${Math.floor(++ipN / 250)}.${ipN % 250}`, cookie: cookie(session) }, body }, r);
  return r;
}
async function link(teamId, token, fields) {
  await S.withIdentityLock(() => I.appendClubInvite(teamId, { token, teamId, kind: 'group', status: 'pending', createdAt: new Date().toISOString(), ...fields }));
}

/** One club; a kept account and a duplicate retired exactly as the 136D plan retires it; a plain removed player; a coach. */
async function world() {
  db.data.clear(); db.lists.clear(); db.expiry.clear();
  const A = await S.createClub({ clubName: 'Alpha RFC', teamName: 'Seniors', sport: 'rugby', name: 'Olive Owner', email: 'owner@alpha.test', password: PW });
  const a = A.team.id;
  const seniors = (await ST.loadClubStructure(a)).groups.find(g => g.status !== 'archived').id;
  const u18 = (await ST.createGroup(a, { name: 'U18' })).group.id;
  await link(a, 'sq_a', { role: 'player', playerGroupId: seniors });
  await link(a, 'coach_a', { role: 'coach', staffLevel: 'assistant' });
  const kept = await claim('sq_a', 'pat.kept@alpha.test', 'Pat Dup');
  const dup = await claim('sq_a', 'pat.dup@alpha.test', 'Pat Dup', { confirmDifferentPerson: true });
  const rex = await claim('sq_a', 'rex@alpha.test', 'Rex Removed');
  const coach = await claim('coach_a', 'cody@alpha.test', 'Cody Coach');
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
  roster.players = roster.players.filter(r => r.userId !== idOf(dup));
  db.data.set(`app:roster:${a}`, JSON.stringify(roster));
  // an ordinary removal, the way the owner removes someone
  await S.removeTeamMember(rex.teamMember.id, A.user.id, a);
  return { A, a, seniors, u18, kept, dup, rex, coach, dupMember: membership(idOf(dup), a), rexMember: membership(idOf(rex), a) };
}

const expectMerged = (label, e) => { assert.equal(e.status, 409, `${label}: 409`); assert.equal(e.code, 'membership_merged', `${label}: code`); return true; };
const expectNoLeak = (w, text, label) => { for (const s of [idOf(w.kept), 'pat.kept@alpha.test', w.dupMember.id, membership(idOf(w.kept), w.a).id, 'mergedInto']) assert.equal(String(text).includes(s), false, `${label}: does not contain ${s}`); };

test('1+2. RESTORE of a merged-away membership is refused (store and HTTP) and nothing changes — no reactivation, no roster row, no profile', async () => {
  const w = await world();
  assert.equal(rosterRows(w.a).some(r => r.userId === idOf(w.dup)), false, 'precondition: the retired row is gone');
  const before = snapshot(w.a);
  await assert.rejects(S.restoreTeamMember(w.dupMember.id, w.A.user.id, w.a), e => expectMerged('store restore', e));
  assert.equal(snapshot(w.a), before, 'users, memberships, profiles, sessions, roster and audit log are byte-identical');
  const r = await adminCall(w.A.session, { action: 'restore_member', memberId: w.dupMember.id });
  assert.equal(r.statusCode, 409); assert.equal(r.body.ok, false); assert.equal(r.body.code, 'membership_merged');
  expectNoLeak(w, r.body.error, 'restore message'); expectNoLeak(w, JSON.stringify(r.body), 'restore body');
  assert.equal(snapshot(w.a), before, 'still byte-identical after the HTTP attempt');
  const m = membership(idOf(w.dup), w.a);
  assert.equal(m.status, 'removed'); assert.equal(m.mergedInto, idOf(w.kept)); assert.equal(m.restoredAt, undefined);
  assert.equal(rosterRows(w.a).some(r => r.userId === idOf(w.dup)), false, 'no roster projection re-created');
  assert.equal(profileOf(idOf(w.dup), w.a), null, 'no profile re-created');
});

test('3+4+5. PLAYS FOR on a merged-away membership is refused (store and HTTP); membership, profiles, roster unchanged; the kept alias survives the next identity read', async () => {
  const w = await world();
  const before = snapshot(w.a);
  for (const groupId of [w.seniors, w.u18, '']) {
    await assert.rejects(S.setPlayerGroup(w.dupMember.id, groupId, w.A.user.id, w.a), e => expectMerged(`store set_player_group ${groupId || '(clear)'}`, e));
  }
  assert.equal(snapshot(w.a), before, 'byte-identical after three refused assignments');
  const r = await adminCall(w.A.session, { action: 'set_player_group', memberId: w.dupMember.id, groupId: w.u18 });
  assert.equal(r.statusCode, 409); assert.equal(r.body.code, 'membership_merged');
  expectNoLeak(w, r.body.error, 'plays-for message'); expectNoLeak(w, JSON.stringify(r.body), 'plays-for body');
  assert.equal(snapshot(w.a), before, 'byte-identical after the HTTP attempt (no audit entry either)');
  assert.equal(profileOf(idOf(w.dup), w.a), null, 'the retired profile is not re-created');
  assert.equal(profileOf(idOf(w.kept), w.a).legacyPlayerId, idOf(w.dup), 'the kept profile still carries the alias in storage');
  const state = await S.listIdentityState(w.a);
  assert.equal(state.player_profiles.find(p => p.userId === idOf(w.kept)).legacyPlayerId, idOf(w.dup), 'and after the healing read');
});

test('6+8. an ordinary removed membership — no mergedInto, blank, or whitespace — still restores exactly as before, and re-projects its row', async () => {
  const w = await world();
  assert.equal(w.rexMember.status, 'removed'); assert.equal(w.rexMember.mergedInto, undefined);
  const r = await adminCall(w.A.session, { action: 'restore_member', memberId: w.rexMember.id });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(membership(idOf(w.rex), w.a).status, 'active');
  assert.ok(rosterRows(w.a).some(x => x.userId === idOf(w.rex)), 'row re-projected');
  for (const marker of ['', '   ']) {
    await S.removeTeamMember(w.rexMember.id, w.A.user.id, w.a);
    await S.withIdentityLock(async () => { const ms = await S.loadTeamMembers(); ms.find(m => m.id === w.rexMember.id).mergedInto = marker; await S.saveTeamMembers(ms); });
    await S.restoreTeamMember(w.rexMember.id, w.A.user.id, w.a);
    assert.equal(membership(idOf(w.rex), w.a).status, 'active', `blank marker ${JSON.stringify(marker)} is not a merge`);
  }
  assert.equal(S.membershipMergedAway({ status: 'removed', mergedInto: null }), false);
  assert.equal(S.membershipMergedAway({ status: 'archived', mergedInto: 'user_k' }), false, 'archived is not the merge state');
});

test('7. normal "Plays for" administration is untouched: assign, move, clear for an active player; give a coach a playing capacity', async () => {
  const w = await world();
  const keptM = membership(idOf(w.kept), w.a);
  let r = await adminCall(w.A.session, { action: 'set_player_group', memberId: keptM.id, groupId: w.u18 });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(membership(idOf(w.kept), w.a).playerGroupId, w.u18);
  r = await adminCall(w.A.session, { action: 'set_player_group', memberId: keptM.id, groupId: w.seniors });
  assert.equal(r.statusCode, 200); assert.equal(membership(idOf(w.kept), w.a).playerGroupId, w.seniors);
  assert.equal(profileOf(idOf(w.kept), w.a).legacyPlayerId, idOf(w.dup), 'the alias is never touched by a group move');
  r = await adminCall(w.A.session, { action: 'set_player_group', memberId: keptM.id, groupId: '' });
  assert.equal(r.statusCode, 200); assert.equal(membership(idOf(w.kept), w.a).playerGroupId, undefined);
  // the explicit dual role still works: a coach made to play gets a profile and a row
  const coachM = membership(idOf(w.coach), w.a);
  assert.equal(profileOf(idOf(w.coach), w.a), null);
  r = await adminCall(w.A.session, { action: 'set_player_group', memberId: coachM.id, groupId: w.seniors });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.ok(profileOf(idOf(w.coach), w.a), 'profile created'); assert.ok(rosterRows(w.a).some(x => x.userId === idOf(w.coach)), 'row projected');
  // and a plainly removed player may still be given a group (today's contract, unchanged)
  await S.setPlayerGroup(w.rexMember.id, w.u18, w.A.user.id, w.a);
  assert.equal(membership(idOf(w.rex), w.a).playerGroupId, w.u18);
});

test('10. the refusal is ordered before the status check and before every write', async () => {
  const w = await world();
  // a merged membership whose status is NOT removed is not "merged away" (needs BOTH conditions) — so the
  // guard must be evaluated on the record as stored, before anything rewrites it
  await S.withIdentityLock(async () => { const ms = await S.loadTeamMembers(); const m = ms.find(x => x.id === w.dupMember.id); m.status = 'archived'; await S.saveTeamMembers(ms); });
  // archived + mergedInto: not the merge state → ordinary archived restore applies (status check, then restore)
  await S.restoreTeamMember(w.dupMember.id, w.A.user.id, w.a);
  assert.equal(membership(idOf(w.dup), w.a).status, 'active', 'archived (not removed) is restorable regardless of the marker');
  // back to the merge state, with a write-counting stub: the refusal must happen with ZERO writes
  await S.withIdentityLock(async () => { const ms = await S.loadTeamMembers(); const m = ms.find(x => x.id === w.dupMember.id); m.status = 'removed'; await S.saveTeamMembers(ms); });
  const mark = db.log.length;
  await assert.rejects(S.restoreTeamMember(w.dupMember.id, w.A.user.id, w.a), e => e.code === 'membership_merged');
  await assert.rejects(S.setPlayerGroup(w.dupMember.id, w.seniors, w.A.user.id, w.a), e => e.code === 'membership_merged');
  const writes = db.log.slice(mark).filter(([c, k]) => (c === 'SET' || c === 'DEL') && !String(k).includes(':lock:'));
  assert.deepEqual(writes, [], 'no SET or DEL other than the lock itself reached storage');
  assert.ok(db.log.slice(mark).some(([c]) => c === 'GET'), 'the record was read (the guard evaluated the stored membership)');
});
