/**
 * Read-path fix: the messages poll/read must follow the canonical
 * state.selectedChatId, not a stale convId captured when polling started
 * (which on first open could be a pre-fetch dm:coach-demo:<player> id).
 *
 * Drives the REAL extracted chatStartPolling tick.
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

const REAL_DM = 'dm:user_1781985525707_z2azip:user_1781985675283_8sr7et';
const COACH_DEMO = 'dm:coach-demo:user_1781985675283_8sr7et';

// Run chatStartPolling, then fire ONE tick manually (setInterval is stubbed).
function runPollTick({ selectedChatId, startedWith }) {
  const body = `"use strict";
    let captured = null; let _chatPollTimer = null; const _chatLastPoll = {}; let _intervalFn = null;
    const state = { activeView: 'player', activePlayerSection: 'messages', selectedChatId: ${JSON.stringify(selectedChatId)} };
    function setInterval(fn){ _intervalFn = fn; return 1; }
    function clearInterval(){ _chatPollTimer = null; }
    async function chatFetchMessages(convId){ captured = convId; return []; }
    function chatRenderMessages(){} function chatMarkRead(){} async function chatPollTyping(){} function chatScrollToBottom(){}
    const document = { getElementById: () => null };
    ${extractFn('chatStopPolling')}
    ${extractFn('chatStartPolling')}
    return (async () => { chatStartPolling(${JSON.stringify(startedWith)}); await _intervalFn(); return captured; })();
  `;
  return new Function(body)();
}

test('poll reads the canonical selectedChatId even when started with a stale coach-demo id', async () => {
  const read = await runPollTick({ selectedChatId: REAL_DM, startedWith: COACH_DEMO });
  assert.equal(read, REAL_DM, 'read follows selectedChatId, not the stale captured id');
  assert.doesNotMatch(read, /coach-demo/);
});

test('Messages → Coach: poll reads from the real server DM (normal case)', async () => {
  const read = await runPollTick({ selectedChatId: REAL_DM, startedWith: REAL_DM });
  assert.equal(read, REAL_DM);
});

test('no regression: squad poll reads "squad"', async () => {
  assert.equal(await runPollTick({ selectedChatId: 'squad', startedWith: 'squad' }), 'squad');
});

test('no regression: announcements poll reads "announce"', async () => {
  assert.equal(await runPollTick({ selectedChatId: 'announce', startedWith: 'announce' }), 'announce');
});

// ── Static wiring: renderPlayerMessages re-canonicalises after the fetch ──────
test('renderPlayerMessages re-canonicalises selectedChatId after chatFetchConversations and repoints polling', () => {
  const fn = extractFn('renderPlayerMessages');
  const thenIdx = fn.indexOf('chatFetchConversations().then');
  assert.ok(thenIdx > 0, 'has the post-fetch .then block');
  const after = fn.slice(thenIdx);
  assert.match(after, /canonicalizePlayerSelectedChat\(\)/, 're-canonicalises once conversations are loaded');
  assert.match(after, /chatStartPolling\(state\.selectedChatId\)/, 'repoints polling to the canonical id');
});

test('the poll tick uses a live selectedChatId-derived convId (not the captured closure value)', () => {
  const fn = extractFn('chatStartPolling');
  assert.match(fn, /const liveConvId = state\.selectedChatId \|\| convId;/);
  assert.match(fn, /chatFetchMessages\(liveConvId/, 'fetch uses the live id');
});
