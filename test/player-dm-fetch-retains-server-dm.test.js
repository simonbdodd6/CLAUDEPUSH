/**
 * Upstream DM fix: chatFetchConversations must RETAIN the server-returned DM
 * even when the player's client does not know the coach's real user id, so
 * _chatConversations populates and everything downstream resolves to the real
 * server DM (not a coach-demo computed id).
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

const COACH = 'user_coachZ';          // real coach id — NOT known to the player client
const PLAYER = 'user_playerA';
const REAL_DM = 'dm:user_coachZ:user_playerA';   // sorted coach:player
const COACH_DEMO_DM = 'dm:coach-demo:user_playerA';

// ── Harness 1: fetch -> store -> resolve -> canonicalise ─────────────────────
function runFetchResolve({ serverConvs, users, allowedDmIds, selectedChatId }) {
  const body = `"use strict";
    let _chatConversations = [];
    const state = { users: ${JSON.stringify(users)}, selectedChatId: ${JSON.stringify(selectedChatId)} };
    const ME = { id: ${JSON.stringify(PLAYER)}, userId: ${JSON.stringify(PLAYER)}, role: 'player' };
    function chatMe(){ return ME; }
    function currentUser(){ return { role: 'player' }; }
    let _allowedDmParticipantIds = new Set(${JSON.stringify(allowedDmIds)});
    function chatSetUnreadTotal(){} function chatUnreadTotal(){ return 0; }
    const fetch = async () => ({ json: async () => ({ ok: true, conversations: ${JSON.stringify(serverConvs)} }) });
    ${extractFn('dmConvId')}
    ${extractFn('playerCoachParticipantId')}
    ${extractFn('playerCoachDmId')}
    ${extractFn('playerAllowedConversationIds')}
    ${extractFn('canonicalizePlayerSelectedChat')}
    ${extractFn('_filterCanonicalConversations')}
    ${extractFn('chatFetchConversations')}
    return (async () => {
      await chatFetchConversations();
      const idAfterFetch = playerCoachDmId();
      canonicalizePlayerSelectedChat();
      return { chatConvIds: _chatConversations.map(c => c.id), playerCoachDmId: idAfterFetch, selectedChatId: state.selectedChatId };
    })();
  `;
  return new Function(body)();
}

const SCENARIO = {
  // The exact production failure: player knows itself + coach-demo, NOT the real coach.
  users: [{ id: PLAYER, role: 'player' }],
  allowedDmIds: ['coach-demo', PLAYER],
  selectedChatId: COACH_DEMO_DM,   // stale computed id (as seen on prod 8ac0400)
  serverConvs: [
    { id: 'announce', type: 'ANNOUNCEMENT' },
    { id: 'squad', type: 'GROUP' },
    { id: REAL_DM, type: 'DIRECT', participants: [COACH, PLAYER], name: 'Coach' },
  ],
};

test('server DM is RETAINED even when the client does not know the coach id', async () => {
  const r = await runFetchResolve(SCENARIO);
  assert.ok(r.chatConvIds.includes(REAL_DM), 'real server DM survives chatFetchConversations');
});

test('_chatConversations is populated (not empty) with the real DM', async () => {
  const r = await runFetchResolve(SCENARIO);
  assert.notDeepEqual(r.chatConvIds, [], '_chatConversations is no longer []');
  assert.deepEqual(r.chatConvIds, ['announce', 'squad', REAL_DM]);
});

test('playerCoachDmId resolves to the real server DM after chatFetchConversations', async () => {
  const r = await runFetchResolve(SCENARIO);
  assert.equal(r.playerCoachDmId, REAL_DM);
  assert.notEqual(r.playerCoachDmId, COACH_DEMO_DM, 'no coach-demo fallback');
});

test('selectedChatId canonicalises from the stale coach-demo id to the real DM', async () => {
  const r = await runFetchResolve(SCENARIO);
  assert.equal(r.selectedChatId, REAL_DM, 'read/display will use the real server DM');
});

test('squad and announcements are retained normally', async () => {
  const r = await runFetchResolve(SCENARIO);
  assert.ok(r.chatConvIds.includes('announce') && r.chatConvIds.includes('squad'));
});

test('no coach-demo fallback can hide a valid server-returned DM', async () => {
  const r = await runFetchResolve(SCENARIO);
  assert.doesNotMatch(r.playerCoachDmId, /coach-demo/);
  assert.doesNotMatch(r.selectedChatId, /coach-demo/);
});

// ── Harness 2: send uses whatever selectedChatId resolved to ─────────────────
function runSend({ selectedChatId }) {
  const body = `"use strict";
    let posted = null;
    const _chatMessages = {}; const _chatLastPoll = {}; let _chatReplyTo = null;
    let _serverAuthState = 'authed';
    const ME = { id: ${JSON.stringify(PLAYER)}, name: 'P', role: 'player', userId: ${JSON.stringify(PLAYER)} };
    const state = { activeView: 'player', selectedChatId: ${JSON.stringify(selectedChatId)}, messages: [], players: [], users: [] };
    const document = { getElementById: (id) => id === 'chatComposer' ? { value: 'reply-after-fix', style: {} } : null };
    function chatMe(){ return ME; }
    function showToast(){} function saveState(){} function chatRenderMessages(){} function chatScrollToBottom(){}
    async function chatResolveCoachDirectChatId(x){ return x; }
    async function chatLoadStateModule(){ return { mergeMessages:(a,b)=>[...(a||[]),...(b||[])] }; }
    async function chatFetchMessages(){}
    const fetch = async (url, opts) => { posted = JSON.parse(opts.body); return { ok:true, json: async () => ({ ok:true, message:{ id:'s1', convId: posted.convId, text: posted.text, senderRole: ME.role } }) }; };
    ${extractFn('chatGetConvId')}
    ${extractFn('chatIsCoachDirectConversation')}
    ${extractFn('chatSendMessage')}
    return (async () => { await chatSendMessage(); return posted && posted.convId; })();
  `;
  return new Function(body)();
}

test('player send uses the real server DM (the id selectedChatId resolved to)', async () => {
  // After the upstream fix, canonicalisation leaves selectedChatId = REAL_DM.
  const convId = await runSend({ selectedChatId: REAL_DM });
  assert.equal(convId, REAL_DM);
  assert.doesNotMatch(convId, /coach-demo/);
});

test('no regression: squad/announcement sends keep their own ids', async () => {
  assert.equal(await runSend({ selectedChatId: 'squad' }), 'squad');
  assert.equal(await runSend({ selectedChatId: 'announce' }), 'announce');
});
