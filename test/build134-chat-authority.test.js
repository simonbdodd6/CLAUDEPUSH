/**
 * NO CLIENT NAMES A CONVERSATION THE SERVER OWNS (Build 134)
 *
 * create_conv accepted any id. A player could send
 *   { id: 'coaching', type: 'DIRECT', participants: [self] }
 * and the record — matched first for the caller's club — made the player a
 * "participant" of the staff channel and locked the staff out of it. Now:
 *   - the built-in ids (squad, coaching, announce) are refused to every client;
 *   - a DM's id is minted from its two participants (dm:<sorted pair>, the form
 *     clients already send) — any other id is refused;
 *   - every other new conversation gets a server-minted id, except the
 *     validated group:<gid> channel of a group the staff member operates;
 *   - a DM may not target another club's account.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, chatCall, read } from './build134-fixture.js';

const RESERVED = ['squad', 'coaching', 'announce', 'Coaching', 'SQUAD'];
const dmOf = (a, b) => `dm:${[a, b].sort().join(':')}`;

test('a player cannot claim any built-in channel id, under any type', async () => {
  const w = await world();
  for (const id of RESERVED) {
    for (const type of ['DIRECT', 'GROUP', 'ANNOUNCEMENT']) {
      const r = await chatCall('POST', '/api/chat', { action: 'create_conv', id, type, name: 'mine', participants: [w.player.user.id] }, w.player);
      assert.ok([400, 403].includes(r.status), `player ${type} ${id} → ${r.status}`);
    }
  }
  const convs = read('app:chat:convs');
  assert.equal(convs.filter(c => RESERVED.map(x => x.toLowerCase()).includes(String(c.id).toLowerCase()) && c.type === 'DIRECT').length, 0, 'no DIRECT record under a channel id');
});

test('nor can staff — the built-ins are the server\'s; the staff channel stays readable and writable by staff', async () => {
  const w = await world();
  for (const id of RESERVED) {
    const r = await chatCall('POST', '/api/chat', { action: 'create_conv', id, type: 'GROUP', name: 'x' }, w.owner);
    assert.equal(r.status, 400, `owner ${id}`);
  }
  // the hijack attempt, then the staff channel as staff see it
  await chatCall('POST', '/api/chat', { action: 'create_conv', id: 'coaching', type: 'DIRECT', participants: [w.player.user.id] }, w.player);
  const send = await chatCall('POST', '/api/chat', { action: 'send', convId: 'coaching', text: 'staff only' }, w.admin);
  assert.equal(send.status, 200, JSON.stringify(send.data));
  const readBack = await chatCall('GET', '/api/chat?action=messages&convId=coaching&since=0', null, w.headSeniors);
  assert.equal(readBack.status, 200);
  assert.ok(readBack.data.messages.some(m => m.text === 'staff only'), 'staff keep their channel');
  const playerRead = await chatCall('GET', '/api/chat?action=messages&convId=coaching&since=0', null, w.player);
  assert.equal(playerRead.status, 403, 'and the player is not in it');
});

test('DMs: the server mints dm:<sorted pair>; the client\'s matching id is accepted, a different id refused, id may be omitted', async () => {
  const w = await world();
  const me = w.player.user.id, coach = w.admin.user.id;
  const ok = await chatCall('POST', '/api/chat', { action: 'create_conv', id: dmOf(me, coach), type: 'DIRECT', name: 'Coach', participants: [me, coach] }, w.player);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.convId, dmOf(me, coach));
  const noId = await chatCall('POST', '/api/chat', { action: 'create_conv', type: 'DIRECT', participants: [coach, me] }, w.player);
  assert.equal(noId.data.convId, dmOf(me, coach), 'omitted id → the same minted id');
  for (const id of [`dm:${coach}:zzz-${me}`, `dm:${me}`, `conv_mine`, `group:${w.seniors}`]) {
    const bad = await chatCall('POST', '/api/chat', { action: 'create_conv', id, type: 'DIRECT', participants: [me, coach] }, w.player);
    assert.ok([400, 403].includes(bad.status), `${id} → ${bad.status}`);
  }
  for (const participants of [[me], [me, coach, w.owner.user.id], [me, me], [], 'x']) {
    const bad = await chatCall('POST', '/api/chat', { action: 'create_conv', type: 'DIRECT', participants }, w.player);
    assert.ok([400, 403].includes(bad.status), `participants ${JSON.stringify(participants)} → ${bad.status}`);
  }
  const third = await chatCall('POST', '/api/chat', { action: 'create_conv', type: 'DIRECT', participants: [coach, w.owner.user.id] }, w.player);
  assert.equal(third.status, 403, 'a DM between two OTHER people');
});

test('DMs never reach another club\'s account', async () => {
  const w = await world();
  const r = await chatCall('POST', '/api/chat', { action: 'create_conv', type: 'DIRECT', participants: [w.player.user.id, w.ownerB.user.id] }, w.player);
  assert.equal(r.status, 403, JSON.stringify(r.data));
  const forgedChannel = await chatCall('POST', '/api/chat', { action: 'create_conv', id: `squad@${w.b}`, type: 'GROUP' }, w.owner);
  assert.equal(forgedChannel.status, 400, 'a storage-scoped id of another club');
  const otherGroup = await chatCall('POST', '/api/chat', { action: 'create_conv', id: 'group:grp_from_another_club', groupId: 'grp_from_another_club', type: 'GROUP' }, w.owner);
  assert.equal(otherGroup.status, 404, 'a group that is not this club\'s');
});

test('staff conversations: ids are minted by the server; group channels only for a group the creator operates; duplicates do not fork', async () => {
  const w = await world();
  const free = await chatCall('POST', '/api/chat', { action: 'create_conv', id: 'match-day-crew', type: 'GROUP', name: 'Crew' }, w.owner);
  assert.equal(free.status, 400, 'a client-chosen free id');
  const minted = await chatCall('POST', '/api/chat', { action: 'create_conv', type: 'GROUP', name: 'Crew' }, w.owner);
  assert.equal(minted.status, 200);
  assert.match(minted.data.convId, /^conv_\d+_[0-9a-f]{8}$/);
  const grp = await chatCall('POST', '/api/chat', { action: 'create_conv', id: `group:${w.u18}`, groupId: w.u18, type: 'GROUP', name: 'U18' }, w.headU18);
  assert.equal(grp.status, 200, JSON.stringify(grp.data));
  assert.equal(grp.data.convId, `group:${w.u18}`);
  const notMine = await chatCall('POST', '/api/chat', { action: 'create_conv', id: `group:${w.u18}`, groupId: w.u18, type: 'GROUP' }, w.headSeniors);
  assert.equal(notMine.status, 403, 'a Seniors coach cannot create the U18 channel');
  const again = await chatCall('POST', '/api/chat', { action: 'create_conv', id: `group:${w.u18}`, groupId: w.u18, type: 'GROUP' }, w.headU18);
  assert.equal(again.status, 200);
  assert.equal(read('app:chat:convs').filter(c => c.id === `group:${w.u18}` && c.teamId === w.a).length, 1, 'one record, not two');
  const ann = await chatCall('POST', '/api/chat', { action: 'create_conv', groupId: w.u18, type: 'ANNOUNCEMENT', name: 'U18 notices' }, w.headU18);
  assert.equal(ann.status, 200);
  assert.notEqual(ann.data.convId, `group:${w.u18}`, 'a group-bound announcement gets its own id, never the channel\'s');
});

test('no session, no conversation', async () => {
  const w = await world();
  const r = await chatCall('POST', '/api/chat', { action: 'create_conv', type: 'DIRECT', participants: [w.player.user.id, w.admin.user.id] }, null);
  assert.equal(r.status, 401);
});
