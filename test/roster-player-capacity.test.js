/**
 * ONE PERSON, ONE PLAYER ROW — AND STAFF ARE NEVER PLAYERS (2026-10-07)
 *
 * Production's Available Players showed (1) the same person twice and (2)
 * managers and coaches among the players. In a grouped club the picker lists
 * roster rows whose ACCOUNT holds an active membership in the operating group,
 * deduplicated by account — so each symptom has exactly one shape:
 *
 *   DUPLICATE  two ACCOUNTS (two user ids), each with an active membership in
 *              the group. Reproduced: two concurrent submissions of the squad
 *              join link, without write locking, mint two accounts and two
 *              memberships (one account record lost to the race). Build 135's
 *              identity lock serialises the claims — the second reuses the
 *              first account.
 *   STAFF      a staff membership carrying a playerGroupId with NO player
 *              profile. Reproduced: a manager opening the squad's PLAYER link
 *              keeps their staff role but had the link's group stamped on, and
 *              the roster projection minted them a "TBC" row.
 *
 * Fixed at the server: the claim no longer stamps a player group on staff;
 * the projection only creates rows for player-capable memberships; the roster
 * READ withholds staff rows and other clubs' accounts (never deleting them —
 * the write keeps them). Real handlers and stores; synthetic data only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installKv } from './build135-kv.js';

const URL_ = 'https://redis.capacity.test';
process.env.UPSTASH_REDIS_REST_URL = URL_;
process.env.UPSTASH_REDIS_REST_TOKEN = 'capacity-token';
process.env.APP_KEY_PREFIX = 'app';
delete process.env.VERCEL; delete process.env.VERCEL_ENV;

const kv = installKv({ maxDelayMs: 0 });
const db = kv.dbFor(URL_);
const S = await import('../api/_identityStore.js');
const ST = await import('../api/_structureStore.js');
const I = await import('../api/_inviteStore.js');
const P = await import('../api/_rosterProjection.js');
const { default: publish } = await import('../api/publish.js');
const { dedupeRosterPlayers } = await import('../src/player-identity.js');

const PW = 'password-cap1';
const read = k => JSON.parse(db.data.get(k) || 'null');
const members = () => read('app:identity:team_members') || [];
const users = () => read('app:identity:users') || [];
const profiles = () => read('app:identity:player_profiles') || [];
const rosterRows = teamId => read(`app:roster:${teamId}`)?.players || [];
const cookie = s => `${S.SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
function jres() { return { statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader(n, v) { this.headers[n] = v; }, end() { return this; } }; }
let ipN = 0;
async function roster(method, session, { query = {}, body } = {}) {
  const r = jres();
  await publish({ method, query: { resource: 'roster', ...query }, headers: { 'x-forwarded-for': `10.77.0.${++ipN % 250}`, cookie: cookie(session) }, body: body || {} }, r);
  return r;
}

/**
 * Available Players as the client builds it in a grouped club: the roster
 * READ, deduplicated by account (src/player-identity.js), kept only when the
 * row's account holds an ACTIVE membership in the operating group
 * (operationalPlayers → playerGroupIdOf), staff position labels excluded
 * (isRosterPlayerRecord).
 */
function availablePlayers(rows, teamId, groupId) {
  const mine = members().filter(m => m.teamId === teamId);
  return dedupeRosterPlayers(rows, { users: users() }).filter(p => {
    const m = mine.find(x => x.status === 'active' && String(x.userId) === String(p.userId || ''));
    return m && m.playerGroupId === groupId && !['coach', 'admin', 'medical staff'].includes(String(p.position || '').trim().toLowerCase());
  });
}
async function picker(session, teamId, groupId) {
  const r = await roster('GET', session);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return availablePlayers(r.body.players, teamId, groupId);
}

async function link(teamId, token, fields) {
  await S.withIdentityLock(() => I.appendClubInvite(teamId, { token, teamId, kind: 'group', status: 'pending', createdAt: new Date().toISOString(), ...fields }));
  return token;
}
const claim = (token, email, name, extra = {}) => S.claimInvite({ token, email, password: PW, name, position: 'Prop', ...extra });

async function world() {
  db.data.clear(); db.lists.clear(); db.expiry.clear(); kv.setDelay(0);
  const A = await S.createClub({ clubName: 'Alpha RFC', teamName: 'Seniors', sport: 'rugby', name: 'Olive Owner', email: 'owner@alpha.test', password: PW });
  const B = await S.createClub({ clubName: 'Bravo RFC', teamName: 'Seniors', sport: 'rugby', name: 'Bob Owner', email: 'owner@bravo.test', password: PW });
  const a = A.team.id, b = B.team.id;
  const seniors = (await ST.loadClubStructure(a)).groups.find(g => g.status !== 'archived').id;
  const u18 = (await ST.createGroup(a, { name: 'U18' })).group.id;
  const bSeniors = (await ST.loadClubStructure(b)).groups.find(g => g.status !== 'archived').id;
  const squad = await link(a, 'squad_link_a', { role: 'player', playerGroupId: seniors });
  const u18link = await link(a, 'u18_link_a', { role: 'player', playerGroupId: u18 });
  const coachLink = await link(a, 'coach_link_a', { role: 'coach', staffLevel: 'head' });
  const mgrLink = await link(a, 'mgr_link_a', { role: 'coach', staffLevel: 'manager' });
  const asstLink = await link(a, 'asst_link_a', { role: 'coach', staffLevel: 'assistant' });
  const squadB = await link(b, 'squad_link_b', { role: 'player', playerGroupId: bSeniors });
  const w = {
    A, B, a, b, seniors, u18, squad, u18link,
    owner: A.session,
    head: await claim(coachLink, 'head@alpha.test', 'Hugo Head'),
    manager: await claim(mgrLink, 'manager@alpha.test', 'Mia Manager'),
    assistant: await claim(asstLink, 'assistant@alpha.test', 'Ari Assistant'),
    player: await claim(squad, 'pat@alpha.test', 'Pat Player'),
    youth: await claim(u18link, 'yan@alpha.test', 'Yan Youth'),
    removed: await claim(squad, 'rex@alpha.test', 'Rex Removed'),
    playerB: await claim(squadB, 'pia@bravo.test', 'Pia Bravo'),
  };
  await S.removeTeamMember(w.removed.teamMember.id, A.user.id, a);
  // a pending join request (team code), never approved
  const teamCode = read('app:identity:teams').find(t => t.id === a).code || read('app:identity:teams').find(t => t.id === a).teamCode;
  if (teamCode) await S.createJoinRequest({ teamCode, email: 'penny@alpha.test', firstName: 'Penny', lastName: 'Pending', password: PW }).catch(() => {});
  return w;
}
const idOf = r => String(r.user?.id || r.userId || '');

test('Available Players = the group\'s player memberships: owner, head coach, manager, assistant, pending, removed and another club are never in it', async () => {
  const w = await world();
  const pool = await picker(w.owner, w.a, w.seniors);
  assert.deepEqual(pool.map(p => p.name).sort(), ['Pat Player'], JSON.stringify(pool.map(p => [p.name, p.userId])));
  const u18 = await picker(w.owner, w.a, w.u18);
  assert.deepEqual(u18.map(p => p.name), ['Yan Youth']);
  // and the READ itself carries no staff row, whoever reads it
  const all = (await roster('GET', w.owner)).body.players;
  for (const staff of [w.A.user.id, idOf(w.head), idOf(w.manager), idOf(w.assistant)]) {
    assert.equal(all.some(r => r.userId === staff), false, `staff ${staff} not returned as a player`);
  }
});

test('a manager (or coach) opening the squad\'s PLAYER link stays staff: no group stamped, no row, not a player', async () => {
  const w = await world();
  for (const who of [w.manager, w.head, w.assistant]) {
    const again = await claim(w.squad, who.user.email, who.user.displayName);
    assert.notEqual(again.teamMember.role, 'player', 'still staff');
    const m = members().find(x => x.userId === idOf(who) && x.teamId === w.a);
    assert.equal(m.playerGroupId || '', '', `${who.user.displayName}: no player group stamped by a player link`);
    assert.equal(profiles().some(p => p.userId === idOf(who) && p.teamId === w.a), false, 'no player profile');
    assert.equal(rosterRows(w.a).some(r => r.userId === idOf(who)), false, 'no roster row minted');
  }
  assert.equal((await picker(w.owner, w.a, w.seniors)).length, 1, 'still only Pat');
});

test('EXISTING production artefact — a staff membership already stamped with the group, with a TBC row — is withheld from the read and kept in storage', async () => {
  const w = await world();
  const mid = idOf(w.manager);
  // the shape core-deploy-100 produced: group stamped by the link, row minted by the projection
  await S.withIdentityLock(async () => {
    const ms = await S.loadTeamMembers();
    Object.assign(ms.find(m => m.userId === mid && m.teamId === w.a), { playerGroupId: w.seniors, accessChangedBy: 'invite' });
    await S.saveTeamMembers(ms);
  });
  // the projection no longer mints the "TBC" row for that shape…
  await S.ensureRosterProjection(w.a);
  assert.equal(rosterRows(w.a).some(r => r.userId === mid), false, 'no row created for a staff membership without a player profile');
  // …but core-deploy-100 already did:
  const stored = read(`app:roster:${w.a}`);
  stored.players.push({ id: mid, userId: mid, legacyPlayerId: mid, name: 'Mia Manager', position: 'TBC', status: 'no-reply' });
  db.data.set(`app:roster:${w.a}`, JSON.stringify(stored));

  const get = await roster('GET', w.owner);
  assert.equal(get.body.players.some(r => r.userId === mid), false, 'withheld from the read');
  assert.deepEqual(get.body.withheld, { staff: 1, otherClub: 0 }, 'and the read says so');
  assert.equal((await picker(w.owner, w.a, w.seniors)).some(p => p.userId === mid), false, 'not in Available Players');
  // group-scoped reads too
  const scoped = await roster('GET', w.owner, { query: { group: w.seniors } });
  assert.equal(scoped.body.players.some(r => r.userId === mid), false, 'withheld from the group read');
  // the projection does not re-create it, and a club-wide save of what the device saw does not delete it
  await S.ensureRosterProjection(w.a);
  const post = await roster('POST', w.owner, { body: { players: get.body.players } });
  assert.equal(post.statusCode, 200, JSON.stringify(post.body));
  const after = rosterRows(w.a).filter(r => r.userId === mid);
  assert.equal(after.length, 1, 'the stored row is kept, exactly once');
  assert.equal(after[0].position, 'TBC', 'verbatim');
});

test('another club\'s accounts in this club\'s roster (cross-club residue) are withheld, not returned as players', async () => {
  const w = await world();
  const stored = read(`app:roster:${w.a}`);
  stored.players.push({ id: idOf(w.playerB), userId: idOf(w.playerB), name: 'Pia Bravo', position: 'Wing' });
  stored.players.push({ id: w.B.user.id, userId: w.B.user.id, name: 'Bob Owner', position: 'Centre' });
  db.data.set(`app:roster:${w.a}`, JSON.stringify(stored));
  const get = await roster('GET', w.owner);
  assert.equal(get.body.players.some(r => r.userId === idOf(w.playerB) || r.userId === w.B.user.id), false);
  assert.equal(get.body.withheld.otherClub, 2);
  await roster('POST', w.owner, { body: { players: get.body.players } });
  assert.equal(rosterRows(w.a).filter(r => r.userId === idOf(w.playerB)).length, 1, 'kept in storage, not deleted');
});

test('a genuine player+coach (explicit "Plays for") is in the picker ONCE, as a player — and leaves it when the capacity is removed', async () => {
  const w = await world();
  await S.setPlayerGroup(w.head.teamMember.id, w.seniors, w.A.user.id, w.a);
  assert.ok(profiles().some(p => p.userId === idOf(w.head) && p.teamId === w.a), 'the dual role carries a player profile');
  let pool = await picker(w.owner, w.a, w.seniors);
  assert.equal(pool.filter(p => p.userId === idOf(w.head)).length, 1, 'once');
  assert.deepEqual(pool.map(p => p.name).sort(), ['Hugo Head', 'Pat Player']);
  // twice more: idempotent
  await S.setPlayerGroup(w.head.teamMember.id, w.seniors, w.A.user.id, w.a);
  await S.ensureRosterProjection(w.a);
  assert.equal(rosterRows(w.a).filter(r => r.userId === idOf(w.head)).length, 1);
  await S.setPlayerGroup(w.head.teamMember.id, '', w.A.user.id, w.a);
  pool = await picker(w.owner, w.a, w.seniors);
  assert.equal(pool.some(p => p.userId === idOf(w.head)), false, 'not a player any more');
  // a player who becomes staff (RC4.7 C.1) keeps their player capacity
  await claim('coach_link_a', 'pat@alpha.test', 'Pat Player');
  pool = await picker(w.owner, w.a, w.seniors);
  assert.equal(pool.filter(p => p.userId === idOf(w.player)).length, 1, 'C.1 dual role still plays, once');
});

test('DUPLICATES: the same person submitting the join link twice AT ONCE gets one account, one membership, one row', async () => {
  for (let run = 0; run < 6; run++) {
    const w = await world();
    kv.setDelay(4);
    const results = await Promise.allSettled([0, 1].map(() => claim(w.squad, 'gaetan@alpha.test', 'Gaëtan Example')));
    kv.setDelay(0);
    assert.ok(results.some(r => r.status === 'fulfilled'), JSON.stringify(results.map(r => r.reason?.message)));
    const accounts = users().filter(u => u.email === 'gaetan@alpha.test');
    assert.equal(accounts.length, 1, `run ${run}: one account`);
    const ms = members().filter(m => m.teamId === w.a && (m.userId === accounts[0].id || !users().some(u => u.id === m.userId)));
    assert.equal(ms.length, 1, `run ${run}: one membership, no orphan: ${JSON.stringify(ms)}`);
    const pool = await picker(w.owner, w.a, w.seniors);
    assert.equal(pool.filter(p => /Ga.tan/.test(p.name)).length, 1, `run ${run}: once in Available Players`);
    for (const r of results.filter(x => x.status === 'fulfilled')) assert.equal(idOf(r.value), accounts[0].id, 'both answers name the same account');
  }
});

test('an existing identity is reused: a retry, the join link of a second club, and switching clubs never add a membership', async () => {
  const w = await world();
  const again = await claim(w.squad, 'pat@alpha.test', 'Pat Player');
  assert.equal(idOf(again), idOf(w.player), 'same account');
  const inB = await claim('squad_link_b', 'pat@alpha.test', 'Pat Player');
  assert.equal(idOf(inB), idOf(w.player), 'the same account joins the second club');
  const mine = () => members().filter(m => m.userId === idOf(w.player));
  assert.deepEqual(mine().map(m => m.teamId).sort(), [w.a, w.b].sort(), 'one membership per club');
  for (const to of [w.b, w.a, w.b, w.a]) await S.switchTeam({ token: inB.session.token, userId: idOf(w.player), teamId: to }).catch(() => S.switchTeam(inB.session.token, to)).catch(() => {});
  assert.equal(mine().length, 2, 'switching clubs created nothing');
  assert.equal(rosterRows(w.a).filter(r => r.userId === idOf(w.player)).length, 1);
  assert.equal(rosterRows(w.b).filter(r => r.userId === idOf(w.player)).length, 1);
});

test('roster refresh, a stale device save and a minimal identity-only save never duplicate a player', async () => {
  const w = await world();
  const snapshot = (await roster('GET', w.owner)).body.players;           // a device reads…
  const late = await claim(w.squad, 'lou@alpha.test', 'Lou Late');        // …a player joins after that read
  // refresh repeatedly
  for (let i = 0; i < 3; i++) {
    await S.ensureRosterProjection(w.a);
    const g = await roster('GET', w.owner);
    await roster('POST', w.owner, { body: { players: g.body.players } });
  }
  // the device's OLD snapshot lands late (delayed response / stale cache)
  await roster('POST', w.owner, { body: { players: snapshot } });
  // and a device that never read pushes minimal identity-only rows (the Build 132 shape)
  await roster('POST', w.owner, { body: { players: [{ id: idOf(w.player), userId: idOf(w.player), name: 'Pat Player', position: 'TBC' }, ...snapshot] } });
  const rows = rosterRows(w.a);
  for (const who of [w.player, late]) assert.equal(rows.filter(r => r.userId === idOf(who)).length, 1, `${who.user.displayName}: one row`);
  const pool = await picker(w.owner, w.a, w.seniors);
  assert.deepEqual(pool.map(p => p.name).sort(), ['Lou Late', 'Pat Player']);
});

test('identity linking is idempotent: a coach-typed row is linked once and every repeat changes nothing', async () => {
  const w = await world();
  // a CSV/trialist row typed before the person joined — same email, no account
  const stored = read(`app:roster:${w.a}`);
  stored.players.push({ id: 'csv_7', name: 'Cara Csv', email: 'cara@alpha.test', position: 'Hooker', dateOfBirth: '2001-02-03' });
  db.data.set(`app:roster:${w.a}`, JSON.stringify(stored));
  const cara = await claim(w.squad, 'cara@alpha.test', 'Cara Csv');
  const first = JSON.stringify(rosterRows(w.a));
  const linked = rosterRows(w.a).filter(r => r.userId === idOf(cara) || r.id === 'csv_7');
  assert.equal(linked.length, 1, 'the typed row became the person\'s row — no second row');
  assert.equal(linked[0].id, 'csv_7', 'its id (history key) is kept');
  assert.equal(linked[0].dateOfBirth, '2001-02-03', 'and its detail');
  for (let i = 0; i < 3; i++) {
    await S.ensureRosterProjection(w.a);
    const r = P.reconcileMissingRows({ rows: rosterRows(w.a), members: members(), users: users(), profiles: profiles(),
      structure: await ST.loadClubStructure(w.a), teamId: w.a });
    assert.equal(r.changed, false, 'a repeat changes nothing');
  }
  assert.equal(JSON.stringify(rosterRows(w.a)), first, 'same canonical record');
});

test('the capacity rule itself: player role, explicit dual role, and the staff-with-group-but-no-profile artefact', () => {
  const base = { teamId: 't', status: 'active', userId: 'user_x', id: 'tm_x' };
  const prof = [{ teamMemberId: 'tm_x', userId: 'user_x', teamId: 't' }];
  assert.equal(P.isPlayerCapableMember({ ...base, role: 'player' }, []), true);
  assert.equal(P.isPlayerCapableMember({ ...base, role: 'coach', staffLevel: 'manager', playerGroupId: 'g' }, []), false, 'artefact');
  assert.equal(P.isPlayerCapableMember({ ...base, role: 'coach', staffLevel: 'manager', playerGroupId: 'g' }, prof), true, 'explicit dual role');
  assert.equal(P.isPlayerCapableMember({ ...base, role: 'coach' }, prof), false, 'no group → staff only');
  assert.equal(P.isPlayerCapableMember({ ...base, role: 'player', status: 'pending' }, prof), false);
  assert.equal(P.isPlayerCapableMember({ ...base, role: 'player', status: 'removed' }, prof), false);
});

test('one row per account at the write: same account twice collapses (stored id kept, blanks filled); different names under one account are NOT merged', () => {
  const stored = [{ id: 'csv_1', userId: 'user_a', name: 'Ann Able', dateOfBirth: '2000-01-01' }];
  const r = P.collapseDuplicateRows({ storedRows: stored, rows: [
    { id: 'user_a', userId: 'user_a', name: 'Ann Able', position: 'TBC', phone: '+32' },
    { id: 'csv_1', userId: 'user_a', name: 'ann  able', position: 'Hooker' },
    { id: 'x1', name: 'Unlinked' }, { id: 'x1', name: 'Unlinked', notes: 'n' },
    { id: 'user_b', userId: 'user_b', name: 'Ben Bee' }, { id: 'user_b2', userId: 'user_b', name: 'Someone Else' },
  ] });
  const ann = r.rows.filter(x => x.userId === 'user_a');
  assert.equal(ann.length, 1);
  assert.equal(ann[0].id, 'csv_1', 'the stored history id survives');
  assert.equal(ann[0].position, 'Hooker', 'a real position beats a placeholder');
  assert.equal(ann[0].phone, '+32', 'blanks filled from the other copy');
  assert.equal(r.rows.filter(x => x.id === 'x1').length, 1, 'an exact same-id repeat of an unlinked row collapses');
  assert.equal(r.rows.filter(x => x.userId === 'user_b').length, 2, 'one account, two DIFFERENT names: a corruption to report — never merged by guess');
  assert.equal(r.collapsed, 2);
});

test('DUPLICATES (the production shape): re-joining with a NEW email under the same name is stopped with a question — nothing is written', async () => {
  const w = await world();
  const before = JSON.stringify([users().length, members().length, profiles().length, rosterRows(w.a).length]);
  for (const variant of ['Pat Player', 'pat  player', 'PAT PLAYER']) {
    await assert.rejects(claim(w.squad, 'pat.second@alpha.test', variant),
      e => e.status === 409 && e.code === 'possible_duplicate_player' && !String(e.message).includes('pat@alpha.test'), variant);
  }
  // accents fold too (Gaétan / Gaëtan / Gaetan)
  await claim(w.squad, 'gaetan.one@alpha.test', 'Gaétan Van Aken');
  const mid = JSON.stringify([users().length, members().length, profiles().length, rosterRows(w.a).length]);
  await assert.rejects(claim(w.squad, 'gaetan.two@alpha.test', 'Gaetan van Aken'), e => e.code === 'possible_duplicate_player');
  assert.equal(JSON.stringify([users().length, members().length, profiles().length, rosterRows(w.a).length]), mid, 'refused before any write');
  assert.notEqual(before, mid);
  // a pending request of that name counts as well
  await S.withIdentityLock(async () => {
    const ms = await S.loadTeamMembers(); const us = await S.loadUsers();
    us.push({ id: 'user_pend', email: 'pend@alpha.test', displayName: 'Penny Pending', createdAt: new Date().toISOString() });
    ms.push({ id: 'tm_pend', teamId: w.a, userId: 'user_pend', role: 'player', status: 'pending' });
    await S.saveUsers(us); await S.saveTeamMembers(ms);
  });
  await assert.rejects(claim(w.squad, 'penny.two@alpha.test', 'Penny Pending'), e => e.code === 'possible_duplicate_player');
});

test('the question never blocks a legitimate join: a confirmed different person, the same account, staff, another club, a removed namesake', async () => {
  const w = await world();
  const twin = await claim(w.squad, 'pat.other@alpha.test', 'Pat Player', { confirmDifferentPerson: true });
  assert.notEqual(idOf(twin), idOf(w.player), 'a confirmed different person joins as themselves');
  const pool = await picker(w.owner, w.a, w.seniors);
  assert.equal(pool.filter(p => p.name === 'Pat Player').length, 2, 'two genuine people of one name are both listed');
  assert.equal(idOf(await claim(w.squad, 'pat@alpha.test', 'Pat Player')), idOf(w.player), 'the same email reuses the account (no question)');
  await claim('mgr_link_a', 'pat.coach@alpha.test', 'Pat Player');      // a staff invite is not a player join
  await claim('squad_link_b', 'pat.bravo@alpha.test', 'Pat Player');    // another club
  await claim(w.squad, 'rex.again@alpha.test', 'Rex Removed');          // the namesake's membership was removed
  assert.equal(members().filter(m => m.teamId === w.b && m.status === 'active').length, 3);
});
