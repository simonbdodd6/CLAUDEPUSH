/**
 * Player DM id resolution — the player UI must use the SERVER-returned
 * conversation id (source of truth), never a locally-recomputed id that a
 * coach-demo fallback could make diverge from a valid server DM.
 *
 * Drives the REAL extracted client functions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('(', start), pd = 0;
  for (; i < src.length; i++) { if (src[i] === '(') pd++; else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } } }
  let depth = 0; i = src.indexOf('{', i);
  for (let b = i; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } } }
  return src.slice(start, i + 1);
}
function build({ convs = [], users = [], meId = 'user_player' }) {
  const body = `"use strict";
    const _chatConversations = ${JSON.stringify(convs)};
    const state = { users: ${JSON.stringify(users)} };
    function chatMe(){ return { id: ${JSON.stringify(meId)}, userId: ${JSON.stringify(meId)} }; }
    ${extractFn('dmConvId')}
    ${extractFn('playerCoachParticipantId')}
    ${extractFn('playerCoachDmId')}
    ${extractFn('playerAllowedConversationIds')}
    return { playerCoachDmId, playerAllowedConversationIds, playerCoachParticipantId, dmConvId };
  `;
  return new Function(body)();
}

const SERVER_DM = 'dm:user_coachZ:user_playerA';

test('player uses the SERVER DM id even when state.users lacks the real coach', () => {
  const api = build({ convs: [{ id: SERVER_DM, type: 'DIRECT', participants: ['user_coachZ', 'user_playerA'] }], users: [], meId: 'user_playerA' });
  assert.equal(api.playerCoachDmId(), SERVER_DM, 'resolves to the server conversation id');
});

test('no coach-demo fallback can hide a valid server conversation', () => {
  const api = build({ convs: [{ id: SERVER_DM, type: 'DIRECT' }], users: [], meId: 'user_playerA' });
  const id = api.playerCoachDmId();
  assert.notEqual(id, api.dmConvId('coach-demo', 'user_playerA'), 'must NOT be the coach-demo computed id');
  assert.equal(id, SERVER_DM);
});

test('playerAllowedConversationIds includes the server DM id (selectChat will not redirect away)', () => {
  const api = build({ convs: [{ id: SERVER_DM, type: 'DIRECT' }], users: [], meId: 'user_playerA' });
  assert.ok(api.playerAllowedConversationIds().has(SERVER_DM), 'server DM is allowed');
});

test('local computation is used only when a REAL coach identity is known', () => {
  // A real coach in state.users -> compute the DM against that coach.
  const withCoach = build({ convs: [], users: [{ id: 'user_coachZ', role: 'coach' }], meId: 'user_playerA' });
  assert.equal(withCoach.playerCoachDmId(), withCoach.dmConvId('user_coachZ', 'user_playerA'));

  // CONTRACT CHANGE (messaging audit): with no server DM AND no coach on the
  // device, the app must NOT fabricate one from the deleted legacy 'coach-demo'
  // account. That produced a conversation the server can never have: the
  // player's replies were POSTed to it, rejected 404, and silently lost — a
  // player literally could not answer their coach. No identity, no DM id.
  const bare = build({ convs: [], users: [], meId: 'user_playerA' });
  assert.equal(bare.playerCoachParticipantId(), '', 'no legacy participant is invented');
  assert.equal(bare.playerCoachDmId(), '', 'no phantom DM id is produced');
  assert.equal(String(bare.playerCoachDmId()).includes('coach-demo'), false);
});

test('a server DM is always preferred, proving the server is the source of truth', () => {
  // state.users has NO coach, but a server DM exists -> the canonical server id wins.
  const api = build({ convs: [{ id: SERVER_DM, type: 'DIRECT' }], users: [{ id: 'user_playerA', role: 'player' }], meId: 'user_playerA' });
  assert.equal(api.playerCoachDmId(), SERVER_DM);
  assert.equal(api.playerCoachParticipantId(), '',
    'local compute yields nothing without a real coach — the canonical server id is used instead');
  assert.equal(SERVER_DM.includes('coach-demo'), false, 'the canonical id is never a legacy id');
});
