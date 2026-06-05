import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCoachDmConversationRequest,
  dmConvId,
} from '../src/chat-state.js';
import {
  ensurePlayerUserForRosterPlayer,
} from '../src/player-identity.js';

const coachId = 'coach-demo';

function portalIdentityId(user = {}, player = {}) {
  const nameKey = String(user.name || '').trim().toLowerCase();
  if (user.role === 'player' && nameKey === 'simon test player') return 'inv-YxnjxnQa';
  return user.playerId || player.id || user.id || 'anon';
}

function directMessageTrace(label, { user, player, coachTargetPlayer, identityContext = {} }) {
  const portalId = portalIdentityId(user, player);
  const request = createCoachDmConversationRequest(coachTargetPlayer, coachId, identityContext);
  const coachTargetId = request?.participants?.[1] || coachTargetPlayer.id;
  const coachConversationId = dmConvId(coachId, coachTargetId);
  const portalConversationId = dmConvId(coachId, portalId);

  return {
    label,
    userId: user.id,
    playerId: player.id,
    userPlayerId: user.playerId || '',
    portalIdentityId: portalId,
    coachDmTargetId: coachTargetId,
    coachConversationId,
    portalConversationId,
    createdConversationId: request?.id || '',
    storedMessagesKey: request?.id ? `app:chat:conv:${request.id}:msgs` : '',
    diverges: coachConversationId !== portalConversationId,
  };
}

test('diagnostic: direct-message IDs diverge when a roster player is not linked to the approved account user', () => {
  const simonPlayer = {
    id: 'inv-YxnjxnQa',
    name: 'Simon Test Player',
    position: 'TBC',
  };
  const simonUser = {
    id: 'player-simon-test',
    role: 'player',
    name: 'Simon Test Player',
    playerId: 'inv-YxnjxnQa',
  };

  const manualDodsyPlayer = {
    id: 'p-dodsy-001',
    name: 'DodsyPlayer',
    position: 'TBC',
    email: 'dodsyplayer@test.com',
  };
  const localDodsyUser = ensurePlayerUserForRosterPlayer([], manualDodsyPlayer)
    .find(user => user.name === 'DodsyPlayer');

  const approvedDodsyUser = {
    id: 'user_dodsy_approved',
    role: 'player',
    name: 'Dodsy Player',
    email: 'dodsyplayer@test.com',
    playerId: 'user_dodsy_approved',
  };
  const approvedDodsyPlayer = {
    id: 'user_dodsy_approved',
    userId: 'user_dodsy_approved',
    name: 'Dodsy Player',
    position: 'TBC',
    email: 'dodsyplayer@test.com',
  };

  const traces = [
    directMessageTrace('Simon Test Player existing canonical identity', {
      user: simonUser,
      player: simonPlayer,
      coachTargetPlayer: simonPlayer,
    }),
    directMessageTrace('Dodsy Player local roster identity only', {
      user: localDodsyUser,
      player: manualDodsyPlayer,
      coachTargetPlayer: manualDodsyPlayer,
    }),
    directMessageTrace('Dodsy Player mixed manual roster plus approved account identity', {
      user: approvedDodsyUser,
      player: approvedDodsyPlayer,
      coachTargetPlayer: manualDodsyPlayer,
    }),
    directMessageTrace('Dodsy Player mixed identity with shared resolver', {
      user: approvedDodsyUser,
      player: approvedDodsyPlayer,
      coachTargetPlayer: manualDodsyPlayer,
      identityContext: {
        users: [approvedDodsyUser],
        players: [manualDodsyPlayer, approvedDodsyPlayer],
      },
    }),
    directMessageTrace('Dodsy Player approved account identity aligned', {
      user: approvedDodsyUser,
      player: approvedDodsyPlayer,
      coachTargetPlayer: approvedDodsyPlayer,
    }),
  ];

  console.log('\nDM identity diagnostic trace');
  console.log(JSON.stringify(traces, null, 2));

  const simon = traces[0];
  assert.equal(simon.userId, 'player-simon-test');
  assert.equal(simon.playerId, 'inv-YxnjxnQa');
  assert.equal(simon.portalIdentityId, 'inv-YxnjxnQa');
  assert.equal(simon.coachDmTargetId, 'inv-YxnjxnQa');
  assert.equal(simon.coachConversationId, 'dm:coach-demo:inv-YxnjxnQa');
  assert.equal(simon.portalConversationId, 'dm:coach-demo:inv-YxnjxnQa');
  assert.equal(simon.diverges, false);

  const dodsyMixed = traces[2];
  assert.equal(dodsyMixed.userId, 'user_dodsy_approved');
  assert.equal(dodsyMixed.playerId, 'user_dodsy_approved');
  assert.equal(dodsyMixed.portalIdentityId, 'user_dodsy_approved');
  assert.equal(dodsyMixed.coachDmTargetId, 'p-dodsy-001');
  assert.equal(dodsyMixed.coachConversationId, 'dm:coach-demo:p-dodsy-001');
  assert.equal(dodsyMixed.portalConversationId, 'dm:coach-demo:user_dodsy_approved');
  assert.equal(dodsyMixed.createdConversationId, 'dm:coach-demo:p-dodsy-001');
  assert.equal(dodsyMixed.storedMessagesKey, 'app:chat:conv:dm:coach-demo:p-dodsy-001:msgs');
  assert.equal(dodsyMixed.diverges, true);

  const dodsyResolved = traces[3];
  assert.equal(dodsyResolved.userId, 'user_dodsy_approved');
  assert.equal(dodsyResolved.playerId, 'user_dodsy_approved');
  assert.equal(dodsyResolved.portalIdentityId, 'user_dodsy_approved');
  assert.equal(dodsyResolved.coachDmTargetId, 'user_dodsy_approved');
  assert.equal(dodsyResolved.coachConversationId, 'dm:coach-demo:user_dodsy_approved');
  assert.equal(dodsyResolved.portalConversationId, 'dm:coach-demo:user_dodsy_approved');
  assert.equal(dodsyResolved.createdConversationId, 'dm:coach-demo:user_dodsy_approved');
  assert.equal(dodsyResolved.storedMessagesKey, 'app:chat:conv:dm:coach-demo:user_dodsy_approved:msgs');
  assert.equal(dodsyResolved.diverges, false);

  const dodsyApproved = traces[4];
  assert.equal(dodsyApproved.coachConversationId, 'dm:coach-demo:user_dodsy_approved');
  assert.equal(dodsyApproved.portalConversationId, 'dm:coach-demo:user_dodsy_approved');
  assert.equal(dodsyApproved.diverges, false);
});
