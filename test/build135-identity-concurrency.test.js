/**
 * IDENTITY WRITES ARE SERIALISED (Build 135)
 *
 * The identity store keeps users, teams, memberships, profiles, sessions and
 * tokens as whole JSON arrays: every writer reads the array, changes it and
 * writes it back. Two writers in the same window each read the same version
 * and the second save erased the first — a session vanished, a profile change
 * was undone, a removed member came back. Every writer now runs under ONE
 * identity lock (SET NX EX in storage, so it holds across instances) and every
 * save is fenced: refused outside the lock, refused when the lock is no longer
 * ours.
 *
 * The storage stand-in answers each command after a random delay, so
 * concurrent writers genuinely interleave between their read and their write;
 * a control test proves that this harness DOES lose updates when there is no
 * lock — so a pass here is the lock, not luck. The cross-process test runs the
 * writers in separate Node processes against one HTTP database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installKv, startKvServer, runWorker, apiModule } from './build135-kv.js';

const URL_ = 'https://redis.identity-b135.test';
process.env.UPSTASH_REDIS_REST_URL = URL_;
process.env.UPSTASH_REDIS_REST_TOKEN = 'identity-b135-token';
process.env.APP_KEY_PREFIX = 'app';
delete process.env.VERCEL; delete process.env.VERCEL_ENV;

const kvStub = installKv({ maxDelayMs: 0 });
const db = kvStub.dbFor(URL_);
const S = await import('../api/_identityStore.js');
const L = await import('../api/_lock.js');
const I = await import('../api/_inviteStore.js');
const { kvGet, kvSet } = await import('../api/_kv.js');

const PW = 'password-b135';
const read = k => JSON.parse(db.data.get(k) || '[]');
const users = () => read('app:identity:users');
const members = () => read('app:identity:team_members');
const sessions = () => read('app:identity:sessions');
const LOCK = 'app:lock:identity';

let n = 0;
async function addMember(teamId, { role = 'player', staffLevel } = {}) {
  const id = ++n;
  return S.withIdentityLock(async () => {
    const us = await S.loadUsers();
    const user = { id: `user_c${id}`, email: `c${id}@b135.test`, displayName: `Member ${id}`, authProvider: 'password', passwordSet: true, emailVerified: true, createdAt: new Date().toISOString() };
    us.push(user); await S.saveUsers(us);
    const ms = await S.loadTeamMembers();
    const member = { id: `tm_c${id}`, teamId, userId: user.id, role, status: 'active', joinedAt: new Date().toISOString(), ...(staffLevel ? { staffLevel } : {}) };
    ms.push(member); await S.saveTeamMembers(ms);
    return { user, member };
  });
}

async function world() {
  db.data.clear(); db.lists.clear(); db.expiry.clear(); kvStub.setDelay(0); n = 0;
  const A = await S.createClub({ clubName: 'Alpha RFC', teamName: 'Seniors', sport: 'rugby', name: 'Alpha Owner', email: 'owner.a@b135.test', password: PW });
  const B = await S.createClub({ clubName: 'Bravo RFC', teamName: 'Seniors', sport: 'rugby', name: 'Bravo Owner', email: 'owner.b@b135.test', password: PW });
  const w = { A, B, a: A.team.id, b: B.team.id, inA: [], inB: [] };
  for (let i = 0; i < 6; i++) w.inA.push(await addMember(w.a));
  for (let i = 0; i < 4; i++) w.inB.push(await addMember(w.b));
  kvStub.setDelay(4);                                    // from here on, every command interleaves
  return w;
}

test('CONTROL: this harness loses updates when writers are NOT locked (so the passes below are the lock)', async () => {
  await world();
  let lostRuns = 0;
  for (let run = 0; run < 10; run++) {
    await kvSet('app:control', []);
    await Promise.all(Array.from({ length: 6 }, (_, i) => (async () => {
      const list = (await kvGet('app:control')) || [];
      list.push(i);
      await kvSet('app:control', list);
    })()));
    if ((await kvGet('app:control')).length < 6) lostRuns++;
  }
  assert.ok(lostRuns >= 5, `unlocked read-modify-write lost updates in ${lostRuns}/10 runs`);
});

test('two (and twelve) concurrent identity writers: every session is kept', async () => {
  const w = await world();
  const before = sessions().length;
  const created = await Promise.all(w.inA.concat(w.inB).map(m =>
    S.createSession({ userId: m.user.id, teamId: m.member.teamId, role: 'player' })));
  assert.equal(sessions().length, before + created.length, 'no session lost');
  for (const s of created) assert.ok(await S.resolveSession(s.token), 'each new session resolves');
});

test('concurrent profile changes on different users all survive', async () => {
  const w = await world();
  await Promise.all(w.inA.map((m, i) => S.updateProfile(m.user.id, { displayName: `Renamed ${i}` })));
  const byId = new Map(users().map(u => [u.id, u]));
  w.inA.forEach((m, i) => assert.equal(byId.get(m.user.id).displayName, `Renamed ${i}`, `user ${i} kept its change`));
});

test('concurrent club creation: every club, owner and membership exists', async () => {
  await world();
  const made = await Promise.all([0, 1, 2, 3].map(i => S.createClub({ clubName: `Club ${i}`, teamName: 'Seniors', sport: 'rugby', name: `Founder ${i}`, email: `founder${i}@b135.test`, password: PW })));
  const teams = read('app:identity:teams');
  for (const c of made) {
    assert.ok(teams.some(t => t.id === c.team.id), `team ${c.team.id}`);
    assert.ok(users().some(u => u.id === c.user.id), 'owner user');
    assert.ok(members().some(m => m.teamId === c.team.id && m.userId === c.user.id && m.status === 'active'), 'owner membership');
  }
});

test('a removed member is NOT resurrected by a concurrent membership write elsewhere', async () => {
  for (let run = 0; run < 5; run++) {
    const w = await world();
    const victim = w.inA[0].member, other = w.inA[1].member;
    await Promise.all([
      S.removeTeamMember(victim.id, w.A.user.id, w.a),
      S.setMemberRole(other.id, { role: 'coach', staffLevel: 'assistant' }, w.A.user.id, w.a),
      S.createSession({ userId: w.inA[2].user.id, teamId: w.a, role: 'player' }),
    ]);
    const ms = members();
    assert.equal(ms.find(m => m.id === victim.id).status, 'removed', `run ${run}: the removal held`);
    assert.equal(ms.find(m => m.id === other.id).role, 'coach', `run ${run}: the role change held`);
  }
});

test('concurrent writes from DIFFERENT clubs: both land, and neither touches the other club', async () => {
  const w = await world();
  const bBefore = members().filter(m => m.teamId === w.b).map(m => JSON.stringify(m)).sort();
  await Promise.all([
    S.removeTeamMember(w.inA[0].member.id, w.A.user.id, w.a),
    S.setMemberRole(w.inA[1].member.id, { role: 'coach', staffLevel: 'assistant' }, w.A.user.id, w.a),
    S.updateProfile(w.inB[0].user.id, { displayName: 'Bravo Renamed' }),
    S.createSession({ userId: w.inB[1].user.id, teamId: w.b, role: 'player' }),
  ]);
  const ms = members();
  assert.equal(ms.find(m => m.id === w.inA[0].member.id).status, 'removed');
  assert.equal(ms.find(m => m.id === w.inA[1].member.id).role, 'coach');
  assert.equal(users().find(u => u.id === w.inB[0].user.id).displayName, 'Bravo Renamed');
  assert.deepEqual(ms.filter(m => m.teamId === w.b).map(m => JSON.stringify(m)).sort(), bBefore, 'Club B memberships untouched');
  // and a club-A writer naming a club-B member is still refused
  await assert.rejects(S.removeTeamMember(w.inB[2].member.id, w.A.user.id, w.a), e => e.status >= 400 && e.status < 500);
  assert.equal(members().find(m => m.id === w.inB[2].member.id).status, 'active');
});

test('concurrent invitations to one club and to another: every invitation is kept, in its own club\'s list', async () => {
  const w = await world();
  const inv = (teamId, i) => ({ token: `inv_${teamId}_${i}`, teamId, role: 'player', status: 'pending', createdAt: new Date().toISOString() });
  await Promise.all([
    ...[0, 1, 2, 3, 4].map(i => I.appendClubInvite(w.a, inv(w.a, i))),
    ...[0, 1, 2].map(i => I.appendClubInvite(w.b, inv(w.b, i))),
    S.createSession({ userId: w.inA[0].user.id, teamId: w.a, role: 'player' }),
  ]);
  assert.deepEqual((await I.listClubInvites(w.a)).map(x => x.token).sort(), [0, 1, 2, 3, 4].map(i => `inv_${w.a}_${i}`).sort());
  assert.deepEqual((await I.listClubInvites(w.b)).map(x => x.token).sort(), [0, 1, 2].map(i => `inv_${w.b}_${i}`).sort());
});

test('a save OUTSIDE the lock is refused and writes nothing', async () => {
  await world();
  const before = db.data.get('app:identity:users');
  await assert.rejects(S.saveUsers([]), e => e.status === 500 && e.code === 'write_outside_lock');
  await assert.rejects(S.saveTeamMembers([]), e => e.code === 'write_outside_lock');
  await assert.rejects(S.saveSessions([]), e => e.code === 'write_outside_lock');
  assert.equal(db.data.get('app:identity:users'), before);
});

test('a STALE writer (its lock expired and another writer took it) is refused with 409 and writes nothing', async () => {
  await world();
  const before = db.data.get('app:identity:users');
  await assert.rejects(S.withIdentityLock(async () => {
    const us = await S.loadUsers();
    // the lock times out and a second instance acquires it meanwhile
    db.data.set(LOCK, JSON.stringify('someone-else'));
    us.length = 0;
    await S.saveUsers(us);
  }), e => e.status === 409 && e.code === 'conflict');
  assert.equal(db.data.get('app:identity:users'), before, 'the stale save never landed');
  assert.equal(db.data.get(LOCK), JSON.stringify('someone-else'), 'and the new holder\'s lock was not released by the stale one');
});

test('a busy lock fails closed (503) after the wait — nothing runs, nothing is written', async () => {
  await world();
  db.data.set('app:lock:b135-busy', JSON.stringify('held-elsewhere'));
  let ran = false;
  await assert.rejects(L.withStoreLock('b135-busy', async () => { ran = true; }, { waitMs: 120 }),
    e => e.status === 503 && e.code === 'busy');
  assert.equal(ran, false);
});

test('safe retry: a writer waits for the holder, then succeeds; a DEAD holder\'s lock frees itself by TTL', async () => {
  const w = await world();
  // a holder that keeps the lock for a while — the second writer waits, then writes
  let release;
  const holding = S.withIdentityLock(() => new Promise(r => { release = r; }));
  await new Promise(r => setTimeout(r, 30));
  const waiting = S.updateProfile(w.inA[0].user.id, { displayName: 'After Wait' });
  await new Promise(r => setTimeout(r, 120));
  assert.notEqual(users().find(u => u.id === w.inA[0].user.id).displayName, 'After Wait', 'still waiting while held');
  release();
  await holding; await waiting;
  assert.equal(users().find(u => u.id === w.inA[0].user.id).displayName, 'After Wait');
  // a crashed holder: a lock nobody will release, 1s TTL
  db.data.set(LOCK, JSON.stringify('crashed-holder')); db.expiry.set(LOCK, Date.now() + 1000);
  const t0 = Date.now();
  await S.updateProfile(w.inA[1].user.id, { displayName: 'After Crash' });
  assert.ok(Date.now() - t0 >= 900, 'it waited for the TTL rather than overriding a live lock');
  assert.equal(users().find(u => u.id === w.inA[1].user.id).displayName, 'After Crash');
});

test('locks are released after success AND after a thrown error', async () => {
  const w = await world();
  await S.updateProfile(w.inA[0].user.id, { displayName: 'Ok' });
  assert.equal(db.data.has(LOCK), false);
  await assert.rejects(S.updateProfile('no-such-user', { displayName: 'x' }), e => e.status === 404);
  assert.equal(db.data.has(LOCK), false);
});

test('SEPARATE PROCESSES (separate instances) sharing one database: no session is lost; unlocked control loses', async () => {
  const server = await startKvServer({ maxDelayMs: 4 });
  try {
    const env = { UPSTASH_REDIS_REST_URL: server.url, UPSTASH_REDIS_REST_TOKEN: 'worker-token', APP_KEY_PREFIX: 'app' };
    const WORKERS = 4, EACH = 6;
    await Promise.all(Array.from({ length: WORKERS }, (_, w) => runWorker({ ...env, B135_W: String(w), B135_N: String(EACH) }, `
      const S = await import(${JSON.stringify(apiModule('_identityStore.js'))});
      const w = process.env.B135_W, n = Number(process.env.B135_N);
      await Promise.all(Array.from({ length: n }, (_, i) => S.createSession({ userId: 'user_w' + w + '_' + i, teamId: 'club_x', role: 'player' })));
    `)));
    const stored = JSON.parse(server.store.data.get('app:identity:sessions') || '[]');
    assert.equal(stored.length, WORKERS * EACH, `${stored.length}/${WORKERS * EACH} sessions survived across processes`);
    assert.equal(server.store.data.has('app:lock:identity'), false, 'lock released');

    // CONTROL: the same processes doing an UNLOCKED read-modify-write lose updates
    server.store.data.set('app:control', '[]');
    await Promise.all(Array.from({ length: WORKERS }, (_, w) => runWorker({ ...env, B135_W: String(w), B135_N: String(EACH) }, `
      const kv = await import(${JSON.stringify(apiModule('_kv.js'))});
      const w = process.env.B135_W, n = Number(process.env.B135_N);
      await Promise.all(Array.from({ length: n }, async (_, i) => { const l = (await kv.kvGet('app:control')) || []; l.push(w + '_' + i); await kv.kvSet('app:control', l); }));
    `)));
    assert.ok(JSON.parse(server.store.data.get('app:control')).length < WORKERS * EACH, 'without the lock, separate processes DO lose updates');
  } finally { await server.close(); }
});
