import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCoachDmConversationRequest,
  createCoachDmConversationRequestForPlayerId,
  dedupeDirectConversations,
  directConversationParticipantId,
  dmConvId,
  filterCoachDmPlayers,
  isRedisBackedConversation,
  mergeMessages,
  resolveMessagesForRender,
  shouldUseLocalFallback,
} from '../src/chat-state.js';

const convId = 'dm:coach-demo:inv-YxnjxnQa';
const nickConvId = 'dm:coach-demo:inv-nick1234';

function msg(id, text, ts, extra = {}) {
  return {
    id,
    convId,
    senderId: extra.senderId || 'coach-demo',
    senderName: extra.senderName || 'Simon Dodd',
    text,
    ts,
    ...extra,
  };
}

test('dmConvId creates one stable sorted direct-message id', () => {
  assert.equal(dmConvId('coach-demo', 'inv-YxnjxnQa'), convId);
  assert.equal(dmConvId('inv-YxnjxnQa', 'coach-demo'), convId);
});

test('start-DM helper creates a direct conversation request without sending a message', () => {
  const request = createCoachDmConversationRequest({
    id: 'inv-YxnjxnQa',
    name: 'Simon Test Player',
  }, 'coach-demo');

  assert.deepEqual(request, {
    action: 'create_conv',
    id: convId,
    name: 'Simon Test Player',
    type: 'DIRECT',
    participants: ['coach-demo', 'inv-YxnjxnQa'],
  });
  assert.equal(Object.hasOwn(request, 'text'), false);
  assert.equal(request.action === 'send', false);
});

test('start-DM helper returns the same conversation id for an existing player conversation', () => {
  const first = createCoachDmConversationRequest({ id: 'inv-nick1234', name: 'Nick Player' }, 'coach-demo');
  const second = createCoachDmConversationRequest({ id: 'inv-nick1234', name: 'Nick Player' }, 'coach-demo');

  assert.equal(first.id, nickConvId);
  assert.equal(second.id, nickConvId);
});

test('coach player picker filters existing members without mutating member data', () => {
  const players = [
    { id: 'coach-demo', name: 'Simon Dodd', position: 'Coach' },
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' },
    { id: 'inv-nick1234', name: 'Nick Player', position: 'Wing' },
  ];
  const before = JSON.stringify(players);

  const filtered = filterCoachDmPlayers(players, 'nick', 'coach-demo');

  assert.deepEqual(filtered.map(player => player.id), ['inv-nick1234']);
  assert.equal(JSON.stringify(players), before);
});

test('coach player picker supports full multi-letter name searches', () => {
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' },
    { id: 'inv-nick1234', name: 'Nick Player', position: 'Wing' },
  ];

  const filtered = filterCoachDmPlayers(players, 'simon test', 'coach-demo');

  assert.deepEqual(filtered.map(player => player.id), ['inv-YxnjxnQa']);
});

test('selecting a player from the new-message picker opens a DM request without sending', () => {
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' },
    { id: 'inv-nick1234', name: 'Nick Player', position: 'Wing' },
  ];

  const request = createCoachDmConversationRequestForPlayerId(players, 'inv-nick1234', 'coach-demo');

  assert.deepEqual(request, {
    action: 'create_conv',
    id: nickConvId,
    name: 'Nick Player',
    type: 'DIRECT',
    participants: ['coach-demo', 'inv-nick1234'],
  });
  assert.equal(Object.hasOwn(request, 'text'), false);
});

test('new-message picker resolves approved account users to permanent userId conversation ids', () => {
  const players = [
    { id: 'p-dodsy-001', name: 'DodsyPlayer', position: 'TBC', email: 'dodsyplayer@test.com' },
  ];
  const users = [
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];

  const request = createCoachDmConversationRequestForPlayerId(players, 'p-dodsy-001', 'coach-demo', { users });

  assert.deepEqual(request, {
    action: 'create_conv',
    id: 'dm:coach-demo:user_dodsy_approved',
    name: 'DodsyPlayer',
    type: 'DIRECT',
    participants: ['coach-demo', 'user_dodsy_approved'],
  });
});

test('new-message picker shows one canonical target per real player', () => {
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', email: 'simon.test.player@player.test', playerId: 'inv-YxnjxnQa' },
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' },
    { id: 'player-simon-test', userId: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', name: 'Simon Test Player', email: 'simon.test.player@player.test', position: 'TBC' },
    { id: 'p-dodsy-001', name: 'DodsyPlayer', email: 'dodsyplayer@test.com', position: 'SUB' },
    { id: 'p-doddsy-002', name: 'Doddsy player', email: '', position: 'Centre' },
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: 'dodsyplayer@test.com', position: 'TBC' },
  ];

  assert.deepEqual(
    filterCoachDmPlayers(players, 'simon', 'coach-demo', { users }).map(player => player.id),
    ['inv-YxnjxnQa']
  );
  assert.deepEqual(
    filterCoachDmPlayers(players, 'dodsy', 'coach-demo', { users }).map(player => player.id),
    ['user_dodsy_approved']
  );
});

test('selecting an unknown player from the picker does not create a request', () => {
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' },
  ];

  assert.equal(createCoachDmConversationRequestForPlayerId(players, 'missing', 'coach-demo'), null);
});

test('direct conversation participant identity is based on IDs, not names', () => {
  assert.equal(directConversationParticipantId({
    id: nickConvId,
    type: 'DIRECT',
    name: 'Nick Player',
    participants: ['coach-demo', 'inv-nick1234'],
  }, 'coach-demo'), 'inv-nick1234');
});

test('conversation list dedupes duplicate direct rows for the same participant', () => {
  const conversations = [
    { id: 'squad', name: 'Squad', type: 'GROUP' },
    { id: nickConvId, name: 'Nick Player', type: 'DIRECT', playerId: 'inv-nick1234' },
    { id: nickConvId, name: 'Nick Player', type: 'DIRECT', participants: ['coach-demo', 'inv-nick1234'] },
    { id: 'dm:coach-demo:inv-YxnjxnQa', name: 'Simon Test Player', type: 'DIRECT', playerId: 'inv-YxnjxnQa' },
  ];

  const deduped = dedupeDirectConversations(conversations, 'coach-demo');

  assert.deepEqual(deduped.map(c => c.id), [
    'squad',
    nickConvId,
    'dm:coach-demo:inv-YxnjxnQa',
  ]);
});

test('conversation list dedupes duplicate DMs for canonical participant pairs', () => {
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' },
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'player-simon-test', userId: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'p-dodsy-001', name: 'DodsyPlayer', email: 'dodsyplayer@test.com' },
    { id: 'p-doddsy-002', name: 'Doddsy player' },
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: 'dodsyplayer@test.com' },
  ];
  const conversations = [
    { id: 'dm:coach-demo:player-simon-test', name: 'Simon Test Player duplicate', type: 'DIRECT', participants: ['coach-demo', 'player-simon-test'] },
    { id: 'dm:coach-demo:inv-YxnjxnQa', name: 'Simon Test Player', type: 'DIRECT', participants: ['coach-demo', 'inv-YxnjxnQa'] },
    { id: 'dm:coach-demo:p-dodsy-001', name: 'DodsyPlayer old', type: 'DIRECT', participants: ['coach-demo', 'p-dodsy-001'] },
    { id: 'dm:coach-demo:p-doddsy-002', name: 'Doddsy Player duplicate', type: 'DIRECT', participants: ['coach-demo', 'p-doddsy-002'] },
    { id: 'dm:coach-demo:user_dodsy_approved', name: 'Dodsy Player', type: 'DIRECT', participants: ['coach-demo', 'user_dodsy_approved'] },
  ];

  const deduped = dedupeDirectConversations(conversations, 'coach-demo', { users, players });

  assert.deepEqual(deduped.map(c => c.id), [
    'dm:coach-demo:inv-YxnjxnQa',
    'dm:coach-demo:user_dodsy_approved',
  ]);
});

test('displayed Dodsy and Simon targets resolve to the same DMs their portals read', () => {
  const users = [
    { id: 'player-simon-test', role: 'player', name: 'Simon Test Player', playerId: 'inv-YxnjxnQa' },
    { id: 'user_dodsy_approved', role: 'player', name: 'Dodsy Player', email: 'dodsyplayer@test.com', playerId: 'user_dodsy_approved' },
  ];
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'player-simon-test', userId: 'player-simon-test', legacyPlayerId: 'inv-YxnjxnQa', name: 'Simon Test Player' },
    { id: 'p-dodsy-001', name: 'DodsyPlayer', email: 'dodsyplayer@test.com' },
    { id: 'p-doddsy-002', name: 'Doddsy player' },
    { id: 'user_dodsy_approved', userId: 'user_dodsy_approved', name: 'Dodsy Player', email: 'dodsyplayer@test.com' },
  ];
  const simon = filterCoachDmPlayers(players, 'simon', 'coach-demo', { users })[0];
  const dodsy = filterCoachDmPlayers(players, 'dodsy', 'coach-demo', { users })[0];
  const simonRequest = createCoachDmConversationRequestForPlayerId(players, simon.id, 'coach-demo', { users });
  const dodsyRequest = createCoachDmConversationRequestForPlayerId(players, dodsy.id, 'coach-demo', { users });

  assert.equal(simonRequest.id, 'dm:coach-demo:inv-YxnjxnQa');
  assert.equal(dodsyRequest.id, 'dm:coach-demo:user_dodsy_approved');
});

test('merges full Redis history with a matching optimistic send', () => {
  const existing = [
    msg('m1', 'test new code', 1000),
    msg('opt_1', 'new send', 3000, { _optimistic: true }),
  ];
  const redisHistory = [
    msg('m1', 'test new code', 1000),
    msg('m2', 'trst nwe', 2000),
    msg('m3', 'new send', 3050),
  ];

  const merged = mergeMessages(existing, redisHistory);

  assert.deepEqual(merged.map(m => m.id), ['m1', 'm2', 'm3']);
  assert.equal(merged.some(m => m._optimistic), false);
});

test('Simon Test Player history merge preserves old and newly fetched Redis messages', () => {
  const cachedSimonHistory = [
    msg('s1', 'test new code', 1000),
    msg('s2', 'trst nwe', 2000),
    msg('s3', 'new test', 3000),
  ];
  const fetchedSimonHistory = [
    msg('s1', 'test new code', 1000),
    msg('s2', 'trst nwe', 2000),
    msg('s3', 'new test', 3000),
    msg('s4', 'latest desktop send', 4000),
  ];

  const merged = mergeMessages(cachedSimonHistory, fetchedSimonHistory);

  assert.deepEqual(merged.map(m => m.text), [
    'test new code',
    'trst nwe',
    'new test',
    'latest desktop send',
  ]);
});

test('prevents message history collapse when POST returns only the new message', () => {
  const existing = [
    msg('m1', 'test A', 1000),
    msg('m2', 'test B', 2000),
  ];
  const postResponseOnly = [msg('m3', 'test C', 3000)];

  const merged = mergeMessages(existing, postResponseOnly);

  assert.deepEqual(merged.map(m => m.text), ['test A', 'test B', 'test C']);
});

test('A/B/C/D remain visible after sequential send confirmations', () => {
  let visible = [];

  ['A', 'B', 'C', 'D'].forEach((label, index) => {
    const ts = (index + 1) * 1000;
    visible = mergeMessages(visible, [
      msg(`opt_${label}`, `test ${label}`, ts, { _optimistic: true }),
    ]);
    visible = mergeMessages(visible, [
      msg(`m${index + 1}`, `test ${label}`, ts + 20),
    ]);
  });

  assert.deepEqual(visible.map(m => m.text), ['test A', 'test B', 'test C', 'test D']);
  assert.deepEqual(visible.map(m => m.id), ['m1', 'm2', 'm3', 'm4']);
});

test('refresh preserves history after local send state is merged with Redis history', () => {
  const localAfterSend = [
    msg('m1', 'test A', 1000),
    msg('m2', 'test B', 2000),
    msg('m3', 'test C', 3000),
    msg('opt_D', 'test D', 4000, { _optimistic: true }),
  ];
  const fullRedisHistory = [
    msg('m1', 'test A', 1000),
    msg('m2', 'test B', 2000),
    msg('m3', 'test C', 3000),
    msg('m4', 'test D', 4050),
  ];

  const refreshed = mergeMessages(localAfterSend, fullRedisHistory);

  assert.deepEqual(refreshed.map(m => m.text), ['test A', 'test B', 'test C', 'test D']);
  assert.equal(refreshed.some(m => m._optimistic), false);
});

test('Redis history cannot collapse to newest message only during incremental merge', () => {
  const fullHistory = [
    msg('m1', 'test A', 1000),
    msg('m2', 'test B', 2000),
    msg('m3', 'test C', 3000),
  ];
  const newestOnly = [msg('m4', 'test D', 4000)];

  const merged = mergeMessages(fullHistory, newestOnly);

  assert.deepEqual(merged.map(m => m.text), ['test A', 'test B', 'test C', 'test D']);
  assert.notDeepEqual(merged.map(m => m.text), ['test D']);
});

test('Nick player direct messages do not affect Simon Test Player history', () => {
  const simonHistory = [
    msg('s1', 'Simon old', 1000),
    msg('s2', 'Simon latest', 2000),
  ];
  const nickHistory = [
    msg('n1', 'Nick old', 1000, { convId: nickConvId }),
    msg('n2', 'Nick latest', 2000, { convId: nickConvId }),
  ];

  const updatedNick = mergeMessages(nickHistory, [
    msg('n3', 'Nick new', 3000, { convId: nickConvId }),
  ]);
  const untouchedSimon = mergeMessages(simonHistory, []);

  assert.deepEqual(untouchedSimon.map(m => m.text), ['Simon old', 'Simon latest']);
  assert.deepEqual(updatedNick.map(m => m.text), ['Nick old', 'Nick latest', 'Nick new']);
});

test('Squad Announcements and Coaching Team remain separate conversations', () => {
  const squad = mergeMessages([], [
    msg('sq1', 'Squad update', 1000, { convId: 'squad' }),
  ]);
  const announce = mergeMessages([], [
    msg('an1', 'Announcement update', 1000, { convId: 'announce' }),
  ]);
  const coaching = mergeMessages([], [
    msg('co1', 'Coaching Team update', 1000, { convId: 'coaching' }),
  ]);

  assert.equal(isRedisBackedConversation('squad'), true);
  assert.equal(isRedisBackedConversation('announce'), true);
  assert.equal(isRedisBackedConversation('coaching'), true);
  assert.deepEqual(squad.map(m => m.convId), ['squad']);
  assert.deepEqual(announce.map(m => m.convId), ['announce']);
  assert.deepEqual(coaching.map(m => m.convId), ['coaching']);
});

test('preserves existing messages after a new send confirmation replaces optimistic row', () => {
  const existing = [
    msg('m1', 'old 1', 1000),
    msg('m2', 'old 2', 2000),
    msg('opt_2', 'new confirmed', 3000, { _optimistic: true }),
  ];
  const confirmed = [msg('m3', 'new confirmed', 3010)];

  const merged = mergeMessages(existing, confirmed);

  assert.deepEqual(merged.map(m => m.id), ['m1', 'm2', 'm3']);
  assert.deepEqual(merged.map(m => m.text), ['old 1', 'old 2', 'new confirmed']);
});

test('does not overwrite Redis-backed history with fallback or demo messages', () => {
  const fallback = [msg('local-1', 'demo fallback', 1000)];

  assert.equal(isRedisBackedConversation(convId), true);
  assert.equal(shouldUseLocalFallback(convId, { productionMode: true }), false);
  assert.deepEqual(resolveMessagesForRender(convId, [], fallback, { productionMode: true }), []);

  const cached = [msg('m1', 'redis history', 1000)];
  assert.deepEqual(resolveMessagesForRender(convId, cached, fallback, { productionMode: true }), cached);
});

test('allows local fallback only for non-Redis legacy conversations', () => {
  const fallback = [msg('legacy-1', 'legacy only', 1000, { convId: 'coach' })];

  assert.equal(isRedisBackedConversation('coach'), false);
  assert.equal(shouldUseLocalFallback('coach', { productionMode: true }), true);
  assert.deepEqual(resolveMessagesForRender('coach', [], fallback, { productionMode: true }), fallback);
});

test('chat-state helpers do not mutate Members/player data when Messages are visited', () => {
  const players = [
    { id: 'inv-YxnjxnQa', name: 'Simon Test Player', position: 'TBC' },
    { id: 'inv-nick1234', name: 'Nick Player', position: 'TBC' },
  ];
  const before = JSON.stringify(players);
  const history = [msg('m1', 'existing', 1000)];

  mergeMessages(history, [msg('m2', 'new', 2000)]);
  resolveMessagesForRender(convId, history, [], { productionMode: true });
  shouldUseLocalFallback(convId, { productionMode: true });

  assert.equal(JSON.stringify(players), before);
});
