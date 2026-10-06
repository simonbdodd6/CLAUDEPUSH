/**
 * JOIN DECISIONS AND CLUB-WIDE DESTRUCTION FOLLOW THE AUTHORITY MODEL (Build 134)
 *
 * Build 132 found:
 *   - approve / reject acted on ANY member of the club: an assistant coach could
 *     "reject" the owner (status rejected, which restore cannot undo) or
 *     "approve" a removed/archived/deleted member back to active;
 *   - the danger-zone club wipe checked the permission only, and a head coach
 *     scoped to ONE group holds every permission by default — so a U18 coach
 *     could wipe the whole club (and rename it).
 * Proved here against the real handlers, actor by actor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, idCall, publishCall, members, read, kv } from './build134-fixture.js';

const statusOf = id => members().find(m => m.id === id)?.status;

// ── APPROVE / REJECT ────────────────────────────────────────────────────────

test('approve: the owner, a club-wide admin and the group\'s own head coach may approve a pending player of that group', async () => {
  for (const actor of ['owner', 'admin', 'headSeniors']) {
    const w = await world();
    const r = await idCall({ action: 'approve', memberId: w.pendingPlayer.member.id }, w[actor]);
    assert.equal(r.statusCode, 200, `${actor}: ${JSON.stringify(r.body)}`);
    assert.equal(statusOf(w.pendingPlayer.member.id), 'active', `${actor} approved`);
  }
});

test('approve/reject: another group\'s head coach cannot decide a request outside their group', async () => {
  const w = await world();
  for (const action of ['approve', 'reject']) {
    const r = await idCall({ action, memberId: w.pendingPlayer.member.id }, w.headU18);
    assert.equal(r.statusCode, 403, `${action}: ${JSON.stringify(r.body)}`);
  }
  assert.equal(statusOf(w.pendingPlayer.member.id), 'pending');
});

test('reject: a pending request is rejected once; a repeated decision is refused (409), not re-applied', async () => {
  const w = await world();
  const first = await idCall({ action: 'reject', memberId: w.pendingPlayer.member.id }, w.owner);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(statusOf(w.pendingPlayer.member.id), 'rejected');
  for (const action of ['reject', 'approve']) {
    const again = await idCall({ action, memberId: w.pendingPlayer.member.id }, w.owner);
    assert.equal(again.statusCode, 409, `${action} after reject: ${JSON.stringify(again.body)}`);
  }
  assert.equal(statusOf(w.pendingPlayer.member.id), 'rejected', 'a rejected request is not approved by a second call');
});

test('reject/approve of a NON-pending member is refused — the owner, an active player, active staff — whoever asks', async () => {
  const w = await world();
  const targets = { owner: w.owner.member.id, player: w.player.member.id, admin: w.admin.member.id };
  for (const actor of ['assistant', 'manager', 'admin', 'owner']) {
    for (const [label, id] of Object.entries(targets)) {
      if (w[actor].member.id === id) continue;
      for (const action of ['reject', 'approve']) {
        const r = await idCall({ action, memberId: id }, w[actor]);
        assert.ok([403, 409].includes(r.statusCode), `${actor} ${action} ${label}: ${r.statusCode} ${JSON.stringify(r.body)}`);
      }
    }
  }
  assert.equal(statusOf(w.owner.member.id), 'active', 'the owner is still active');
  assert.equal(statusOf(w.player.member.id), 'active');
  assert.equal(statusOf(w.admin.member.id), 'active');
});

test('the owner is never decided — even if the owner\'s record were somehow pending', async () => {
  const w = await world();
  const list = members();
  list.find(m => m.id === w.owner.member.id).status = 'pending';      // corrupted/legacy data
  kv.set('app:identity:team_members', JSON.stringify(list));
  const r = await idCall({ action: 'reject', memberId: w.owner.member.id }, w.admin);
  assert.equal(r.statusCode, 403, JSON.stringify(r.body));
  assert.equal(r.body?.code || 'owner_protected', 'owner_protected');
  assert.equal(statusOf(w.owner.member.id), 'pending', 'not rejected');
});

test('approve: a removed or archived member cannot be brought back through approve (the restore gate stands)', async () => {
  const w = await world();
  const list = members();
  list.find(m => m.id === w.player.member.id).status = 'removed';
  list.find(m => m.id === w.admin.member.id).status = 'archived';
  kv.set('app:identity:team_members', JSON.stringify(list));
  for (const id of [w.player.member.id, w.admin.member.id]) {
    const r = await idCall({ action: 'approve', memberId: id }, w.owner);
    assert.equal(r.statusCode, 409, JSON.stringify(r.body));
  }
  assert.deepEqual([statusOf(w.player.member.id), statusOf(w.admin.member.id)], ['removed', 'archived']);
});

test('staff requests: deciding a pending STAFF member needs manage-coaches — an assistant or a manager cannot', async () => {
  const w = await world();
  for (const actor of ['assistant', 'manager']) {
    for (const action of ['approve', 'reject']) {
      const r = await idCall({ action, memberId: w.pendingCoach.member.id }, w[actor]);
      assert.equal(r.statusCode, 403, `${actor} ${action}: ${JSON.stringify(r.body)}`);
    }
  }
  assert.equal(statusOf(w.pendingCoach.member.id), 'pending');
  const ok = await idCall({ action: 'approve', memberId: w.pendingCoach.member.id }, w.owner);
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
});

test('approve/reject: another club\'s member, a malformed id, a player, and no session are all refused', async () => {
  const w = await world();
  const cross = await idCall({ action: 'approve', memberId: w.bPending.member.id }, w.owner);
  assert.equal(cross.statusCode, 403, 'another club\'s request');
  const crossForged = await idCall({ action: 'reject', memberId: w.bPending.member.id, teamId: w.b }, w.owner);
  assert.equal(crossForged.statusCode, 403, 'a forged teamId does not move the scope');
  assert.equal(statusOf(w.bPending.member.id), 'pending');
  for (const memberId of ['', 'nope', '../tm', null, { $ne: 1 }]) {
    const r = await idCall({ action: 'approve', memberId }, w.owner);
    assert.ok([400, 404].includes(r.statusCode), `malformed ${JSON.stringify(memberId)} → ${r.statusCode}`);
  }
  const byPlayer = await idCall({ action: 'approve', memberId: w.pendingPlayer.member.id }, w.player);
  assert.equal(byPlayer.statusCode, 403);
  const anonymous = await idCall({ action: 'reject', memberId: w.pendingPlayer.member.id }, null);
  assert.equal(anonymous.statusCode, 401);
  assert.equal(statusOf(w.pendingPlayer.member.id), 'pending');
});

// ── DANGER ZONE ─────────────────────────────────────────────────────────────

const clubName = 'Alpha RFC';
async function wipe(actor) { return publishCall('POST', { resource: 'club' }, { action: 'delete_club_data', confirm: clubName, confirmName: clubName, clubName }, actor); }
async function cleanup(actor) { return publishCall('POST', { resource: 'club' }, { action: 'delete_test_data', confirmPhrase: 'DELETE TEST DATA' }, actor); }

test('danger zone: a head coach scoped to ONE group cannot wipe the club or clean its test data — the owner and a club-wide admin can', async () => {
  const w = await world();
  await publishCall('POST', { resource: 'club' }, { club: { clubName } }, w.owner);
  for (const actor of ['headSeniors', 'headU18']) {
    for (const fn of [wipe, cleanup]) {
      const r = await fn(w[actor]);
      assert.equal(r.statusCode, 403, `${actor} ${fn.name}: ${r.statusCode} ${JSON.stringify(r.body)}`);
    }
  }
  for (const actor of ['assistant', 'manager', 'player']) {
    const r = await wipe(w[actor]);
    assert.equal(r.statusCode, 403, `${actor} wipe: ${r.statusCode}`);
  }
  const anon = await wipe(null);
  assert.equal(anon.statusCode, 401);
  const byAdmin = await cleanup(w.admin);
  assert.equal(byAdmin.statusCode, 200, JSON.stringify(byAdmin.body));
  const byOwner = await wipe(w.owner);
  assert.ok([200, 400].includes(byOwner.statusCode), `the owner reaches the wipe itself (confirmation rules apply): ${JSON.stringify(byOwner.body)}`);
  assert.notEqual(byOwner.statusCode, 403);
});

test('danger zone: another club\'s owner cannot wipe this club — the action only ever reaches the caller\'s own club', async () => {
  const w = await world();
  await publishCall('POST', { resource: 'club' }, { club: { clubName } }, w.owner);
  const before = JSON.stringify([...kv.entries()].filter(([k]) => k.includes(`:${w.a}`) || k.includes(`club:${w.a}`)));
  const r = await publishCall('POST', { resource: 'club' }, { action: 'delete_club_data', confirmName: clubName, clubName, teamId: w.a }, w.ownerB);
  assert.equal(r.statusCode, 400, 'Club B\'s owner is checked against CLUB B\'s name (Club A\'s name does not confirm anything): ' + JSON.stringify(r.body));
  assert.equal(JSON.stringify([...kv.entries()].filter(([k]) => k.includes(`:${w.a}`) || k.includes(`club:${w.a}`))), before, 'Club A untouched');
});

test('danger zone: renaming the club needs club-wide authority; a group head coach keeps the ordinary settings', async () => {
  const w = await world();
  const set = await publishCall('POST', { resource: 'club' }, { club: { clubName } }, w.owner);
  assert.equal(set.statusCode, 200, JSON.stringify(set.body));
  const rename = await publishCall('POST', { resource: 'club' }, { club: { clubName: 'U18 Takeover RFC' } }, w.headU18);
  assert.equal(rename.statusCode, 403, JSON.stringify(rename.body));
  const ordinary = await publishCall('POST', { resource: 'club' }, { club: { clubName, seasonStart: '2026-09-01', seasonEnd: '2027-05-31' } }, w.headU18);
  assert.equal(ordinary.statusCode, 200, `a same-name settings save is unchanged: ${JSON.stringify(ordinary.body)}`);
  const adminRename = await publishCall('POST', { resource: 'club' }, { club: { clubName: 'Alpha Rugby' } }, w.admin);
  assert.equal(adminRename.statusCode, 200, JSON.stringify(adminRename.body));
});

test('danger zone: in a ONE-group club the head coach covers the club (the group is the club) — legitimate owners of small clubs keep the tools', async () => {
  const w = await world();
  // Club B has a single group; give it a head coach with the default (initial-group) scope
  const { addMember } = await import('./build134-fixture.js');
  const headB = await addMember(w.b, { role: 'coach', staffLevel: 'head' });
  await publishCall('POST', { resource: 'club' }, { club: { clubName: 'Bravo RFC' } }, w.ownerB);
  const r = await cleanup(headB);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
});

test('danger zone: the test-data cleanup only rewrites the CALLER\'s club conversations', async () => {
  const w = await world();
  const { lists } = await import('./build134-fixture.js');
  // another club's conversation holding a "test" message
  const convs = read('app:chat:convs');
  convs.push({ id: 'conv_b_room', teamId: w.b, name: 'B room', type: 'GROUP' });
  kv.set('app:chat:convs', JSON.stringify(convs));
  lists.set('app:chat:conv:conv_b_room:msgs', [JSON.stringify({ id: 'm1', senderId: 'player-simon-test', text: 'test', ts: 1 })]);
  const r = await cleanup(w.owner);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(lists.get('app:chat:conv:conv_b_room:msgs')?.length, 1, 'Club B\'s conversation untouched');
});
