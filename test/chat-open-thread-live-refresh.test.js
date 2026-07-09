/**
 * In-app live refresh of the OPEN thread.
 *
 * The reliable always-on 5s poll (bgPollUnread) used to refresh only the list + badge,
 * never the open thread's messages — so a received DM did not appear until the user
 * clicked the conversation. chatRefreshOpenThread() fixes that: when a conversation is
 * selected, the user is in Messages, and the thread is mounted (chatFeed present), it
 * pulls new messages and re-renders in place.
 *
 * Drives the REAL extracted client function from index.html.
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

function run({ state, hasFeed, fetchResult }) {
  const body = `"use strict";
    const calls = { fetch: [], render: [], markRead: [] };
    const state = ${JSON.stringify(state)};
    const _chatLastPoll = {};
    const feedEl = { scrollHeight: 100, scrollTop: 0, clientHeight: 100 };
    const document = { getElementById: (id) => (id === 'chatFeed' && ${JSON.stringify(!!hasFeed)}) ? feedEl : null };
    async function chatFetchMessages(convId, since) { calls.fetch.push([convId, since]); return ${JSON.stringify(fetchResult)}; }
    function chatRenderMessages(convId, mode) { calls.render.push([convId, mode]); }
    function chatMarkRead(convId) { calls.markRead.push(convId); }
    function chatScrollToBottom() {}
    ${extractFn('chatRefreshOpenThread')}
    return (async () => ({ result: await chatRefreshOpenThread(), calls }))();
  `;
  return new Function(body)();
}

const openCoach = { selectedChatId: 'dm:a:b', activeView: 'coach', activeCoachSection: 'messages' };

test('open thread + new messages → fetches selectedChatId and re-renders in place', async () => {
  const { result, calls } = await run({ state: openCoach, hasFeed: true, fetchResult: [{ id: 'm1', ts: 1 }] });
  assert.equal(result, true);
  assert.deepEqual(calls.fetch, [['dm:a:b', 0]], 'fetched the open conversation');
  assert.deepEqual(calls.render, [['dm:a:b', 'coach']], 're-rendered the thread');
  assert.deepEqual(calls.markRead, ['dm:a:b'], 'marked the open thread read');
});

test('open thread but NO new messages → no re-render', async () => {
  const { result, calls } = await run({ state: openCoach, hasFeed: true, fetchResult: [] });
  assert.equal(result, false);
  assert.deepEqual(calls.fetch, [['dm:a:b', 0]], 'still polled');
  assert.deepEqual(calls.render, [], 'did not re-render when nothing new');
});

test('no conversation selected → no fetch', async () => {
  const { result, calls } = await run({ state: { selectedChatId: null, activeView: 'coach', activeCoachSection: 'messages' }, hasFeed: true, fetchResult: [{ id: 'm1' }] });
  assert.equal(result, false);
  assert.deepEqual(calls.fetch, []);
});

test('not in the Messages section → no fetch (avoids background churn)', async () => {
  const { result, calls } = await run({ state: { selectedChatId: 'dm:a:b', activeView: 'coach', activeCoachSection: 'overview' }, hasFeed: true, fetchResult: [{ id: 'm1' }] });
  assert.equal(result, false);
  assert.deepEqual(calls.fetch, []);
});

test('thread not mounted (no chatFeed) → no fetch', async () => {
  const { result, calls } = await run({ state: openCoach, hasFeed: false, fetchResult: [{ id: 'm1' }] });
  assert.equal(result, false);
  assert.deepEqual(calls.fetch, []);
});

test('player mode: open thread refreshes with the player render mode', async () => {
  const { result, calls } = await run({ state: { selectedChatId: 'dm:a:b', activeView: 'player', activePlayerSection: 'messages' }, hasFeed: true, fetchResult: [{ id: 'm1' }] });
  assert.equal(result, true);
  assert.deepEqual(calls.render, [['dm:a:b', 'player']]);
});
