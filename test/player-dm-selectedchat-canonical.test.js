/**
 * selectedChatId canonicalisation: once conversations load, a stale 'coach' /
 * coach-demo selectedChatId must be forced onto the real server DM. Pre-fetch
 * (no server DM yet) it must NOT oscillate/downgrade. Plus: the QA overlay is
 * collapsible so it cannot block the mobile composer.
 *
 * Drives the REAL extracted canonicalizePlayerSelectedChat.
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

const PLAYER = 'user_1781985675283_8sr7et';
const REAL_DM = 'dm:user_1781985525707_z2azip:user_1781985675283_8sr7et';
const COACH_DEMO = 'dm:coach-demo:user_1781985675283_8sr7et';

function runCanon({ convs, selectedChatId, role = 'player' }) {
  const body = `"use strict";
    let _chatConversations = ${JSON.stringify(convs)};
    const state = { users: [], selectedChatId: ${JSON.stringify(selectedChatId)} };
    function currentUser(){ return { role: ${JSON.stringify(role)} }; }
    function chatMe(){ return { id: ${JSON.stringify(PLAYER)}, userId: ${JSON.stringify(PLAYER)} }; }
    ${extractFn('dmConvId')}
    ${extractFn('playerCoachParticipantId')}
    ${extractFn('playerCoachDmId')}
    ${extractFn('playerAllowedConversationIds')}
    ${extractFn('canonicalizePlayerSelectedChat')}
    const changed = canonicalizePlayerSelectedChat();
    return { changed, selectedChatId: state.selectedChatId };
  `;
  return new Function(body)();
}
const LOADED = [{ id: REAL_DM, type: 'DIRECT' }];

test('stale coach-demo selectedChatId is replaced by the real server DM after conversations load', () => {
  const r = runCanon({ convs: LOADED, selectedChatId: COACH_DEMO });
  assert.equal(r.changed, true);
  assert.equal(r.selectedChatId, REAL_DM);
});

test('selectedChatId "coach" is replaced by the real server DM', () => {
  const r = runCanon({ convs: LOADED, selectedChatId: 'coach' });
  assert.equal(r.selectedChatId, REAL_DM);
});

test('read/poll follows the corrected selectedChatId (now the real DM)', () => {
  // canonicalisation result is exactly what chatStartPolling reads via state.selectedChatId
  const r = runCanon({ convs: LOADED, selectedChatId: COACH_DEMO });
  assert.equal(r.selectedChatId, REAL_DM);
  assert.doesNotMatch(r.selectedChatId, /coach-demo/);
});

test('already-correct real DM is left unchanged', () => {
  const r = runCanon({ convs: LOADED, selectedChatId: REAL_DM });
  assert.equal(r.changed, false);
  assert.equal(r.selectedChatId, REAL_DM);
});

test('pre-fetch (no server DM yet) does NOT downgrade or oscillate', () => {
  const r = runCanon({ convs: [], selectedChatId: COACH_DEMO });
  assert.equal(r.changed, false, 'no swap when there is no better (real) DM yet');
  assert.equal(r.selectedChatId, COACH_DEMO);
});

test('no regression: squad/announcements are left unchanged', () => {
  assert.equal(runCanon({ convs: LOADED, selectedChatId: 'squad' }).selectedChatId, 'squad');
  assert.equal(runCanon({ convs: LOADED, selectedChatId: 'announce' }).selectedChatId, 'announce');
  assert.equal(runCanon({ convs: LOADED, selectedChatId: 'squad' }).changed, false);
});

// ── QA overlay collapsible / non-blocking ────────────────────────────────────
test('QA overlay is collapsible and moves out of the composer area when collapsed', () => {
  const block = src.slice(src.indexOf('installQaMessagingDiag'), src.indexOf('// ── Send reaction'));
  assert.match(block, /function applyCollapsed\(\)/, 'has a collapse handler');
  assert.match(block, /collapsed = !collapsed/, 'header toggles collapsed state');
  assert.match(block, /box\.style\.top = '6px'/, 'collapsed pill anchors to the top (away from the bottom composer)');
  assert.match(block, /bodyWrap\.style\.display = 'none'/, 'collapsing hides the body so it does not block input');
});
