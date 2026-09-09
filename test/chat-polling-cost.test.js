/**
 * CHAT-CPU-OPT-1 — chat polling must not spend requests it cannot use.
 *
 * Three guards, all client-side. None of them changes what a caller is
 * ALLOWED to read: authorization, club/group isolation and conversation
 * access stay entirely server-side in api/chat.js. These only stop the
 * client asking for things it already knows are not there, or asking twice.
 *
 *  A. A synthetic conversation (a coach contact row / player coach-DM that
 *     was never created server-side) must not be polled — it answers 404 on
 *     every messages, typing and read request, forever, at close to the full
 *     cost of a 200. The guard is STATE-AWARE: it only refuses once the
 *     server has actually answered the conversations list, and it releases
 *     itself the moment the conversation becomes real.
 *  B. While the dedicated thread poll is running, the background poll must
 *     not fetch the SAME thread's messages a second time.
 *  C. The cadences are the reduced ones (thread 5s; background throttled off
 *     the Messages screen).
 *
 * Drives the REAL extracted client functions from index.html.
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

// ── A. Synthetic-conversation guard ───────────────────────────────────────
// The real chatIsUnresolvedPlaceholder, driven over the two axes that decide
// it: whether the server has answered yet, and what it said exists.
function isPlaceholder(convId, { conversations = [], loaded = false } = {}) {
  return new Function(`
    "use strict";
    const _chatConversations = arguments[0];
    const _chatConversationsLoaded = arguments[1];
    ${extractFn('chatIsUnresolvedPlaceholder')}
    return chatIsUnresolvedPlaceholder(arguments[2]);
  `)(conversations, loaded, convId);
}

const REAL_DM = 'dm:user_a:user_b';

test('TEST 1+2 — a synthetic DM is refused, so it polls neither messages nor typing', () => {
  // Both request paths run through this one guard (chatFetchMessages and
  // chatPollTyping each call it before fetching), so refusing here is what
  // silences both.
  assert.equal(isPlaceholder(REAL_DM, { conversations: [], loaded: true }), true,
    'server has answered and this DM is not in the list → never requested');
  assert.match(extractFn('chatFetchMessages'), /chatIsUnresolvedPlaceholder\(convId\)/,
    'the messages fetch consults the guard');
  assert.match(extractFn('chatPollTyping'), /chatIsUnresolvedPlaceholder\(convId\)/,
    'the typing poll consults the guard');
});

test('TEST 3 — a synthetic conversation is refused the read marker too', () => {
  assert.match(extractFn('chatMarkRead'), /chatIsUnresolvedPlaceholder\(convId\)/,
    'the read marker consults the guard, so a 404 thread stops re-POSTing');
  assert.equal(isPlaceholder('group:ghost', { conversations: [], loaded: true }), true,
    'an uncreated group channel is synthetic on the same terms');
});

test('TEST 4 — the guard releases the moment the conversation becomes real', () => {
  // This is what chatEnsureCoachDmConversationExists does on first send, and
  // what the next conversations poll does for a thread the other side opened.
  assert.equal(isPlaceholder(REAL_DM, { conversations: [{ id: REAL_DM }], loaded: true }), false,
    'once the conversation exists, normal polling resumes on its own');
});

test('TEST 4b — the guard is state-aware, never a permanent blacklist', () => {
  // BOOT: the list has not been answered yet. "Unknown" here means "not
  // loaded", and refusing would block real threads on every cold start.
  assert.equal(isPlaceholder(REAL_DM, { conversations: [], loaded: false }), false,
    'before the server answers, a real-looking DM is still requested');
  // The same id, same empty list — only the server having spoken differs.
  assert.equal(isPlaceholder(REAL_DM, { conversations: [], loaded: true }), true);
});

test('TEST 7 — the built-in channels always poll normally', () => {
  // squad / coaching / announce are created server-side by ensureDefaults and
  // always exist. They must never be withheld, loaded or not, listed or not.
  for (const id of ['squad', 'coaching', 'announce']) {
    assert.equal(isPlaceholder(id, { conversations: [], loaded: true }), false,
      `${id} is a built-in channel and must keep polling`);
    assert.equal(isPlaceholder(id, { conversations: [], loaded: false }), false);
  }
});

test('TEST 8 — real listed DMs and group channels keep polling normally', () => {
  const convs = [{ id: REAL_DM }, { id: 'group:seniors' }];
  assert.equal(isPlaceholder(REAL_DM, { conversations: convs, loaded: true }), false);
  assert.equal(isPlaceholder('group:seniors', { conversations: convs, loaded: true }), false);
});

test('legacy placeholders stay refused (no regression on the original guard)', () => {
  assert.equal(isPlaceholder('coach', { conversations: [], loaded: false }), true);
  assert.equal(isPlaceholder('dm:coach-demo:user_1', { conversations: [], loaded: false }), true);
  assert.equal(isPlaceholder('', { conversations: [], loaded: false }), true);
});

test('TEST 9 — the create-on-first-send flow is not blocked by the guard', () => {
  // The send path does NOT go through chatIsUnresolvedPlaceholder: it creates
  // the conversation and then POSTs. Proving this keeps the guard from ever
  // making a never-messaged contact unmessageable.
  const send = extractFn('chatSendMessage');
  assert.match(send, /chatEnsureCoachDmConversationExists\(convId\)/,
    'first send still creates the conversation server-side');
  assert.equal(/chatIsUnresolvedPlaceholder/.test(send), false,
    'the send path is never gated by the synthetic-conversation guard');
  // And creating it locally reflects the new conversation, which is exactly
  // what releases the guard for the polling that follows.
  assert.match(extractFn('chatEnsureCoachDmConversationExists'),
    /_chatConversations\.push\(\{ id, name, type: 'DIRECT', participants \}\)/,
    'the created conversation is reflected locally, releasing the guard');
});

// ── A(wiring). The flag the guard depends on ──────────────────────────────
// The guard above is only as good as the flag that arms it. These drive the
// REAL chatFetchConversations to prove the flag is set on a genuine answer
// and — the fail-safe that matters — NOT set on a rejected or failed one.
function runFetchConversations({ ok, throws = false }) {
  const body = `"use strict";
    let _chatConversations = [];
    let _chatConversationsLoaded = false;
    const _serverAuthState = 'authed';
    function chatMe() { return { id: 'user_a' }; }
    function _filterCanonicalConversations(list) { return list; }
    function chatSetUnreadTotal() {}
    function chatVisibleUnreadTotal() { return 0; }
    async function fetch() {
      if (${JSON.stringify(throws)}) throw new Error('offline');
      return { json: async () => (${JSON.stringify(ok)}
        ? { ok: true, conversations: [{ id: 'squad' }] }
        : { ok: false, error: 'Authentication required' }) };
    }
    ${extractFn('chatFetchConversations')}
    return (async () => { await chatFetchConversations(); return _chatConversationsLoaded; })();
  `;
  return new Function(body)();
}

test('the guard is armed only by a real server answer', async () => {
  assert.equal(await runFetchConversations({ ok: true }), true,
    'a successful conversations response arms the synthetic-conversation guard');
});

test('a rejected or failed conversations response never arms the guard', async () => {
  // Fail-safe: if a 401 armed it, a lapsed session would make every real
  // thread look synthetic and silently stop polling all chat.
  assert.equal(await runFetchConversations({ ok: false }), false,
    'a non-ok response must not arm the guard');
  assert.equal(await runFetchConversations({ ok: true, throws: true }), false,
    'an offline failure must not arm the guard');
});

test('signing out disarms the guard along with the conversation list', () => {
  // resetIdentityScopedState clears _chatConversations. Leaving the flag set
  // would hand the NEXT identity "loaded + empty" — every one of their real
  // DMs and group channels refused until their first fetch returned.
  const reset = extractFn('resetIdentityScopedState');
  assert.match(reset, /_chatConversations = \[\];[\s\S]{0,400}?_chatConversationsLoaded = false;/,
    'the flag is cleared wherever the conversation list is cleared');
});

// ── B. Duplicate open-thread fetch ────────────────────────────────────────
// chatRefreshOpenThread runs off the background poll. When the dedicated
// thread timer is live it must mark read but NOT fetch.
function runRefresh({ pollTimerActive, conversations = [], fetchResult = [] }) {
  const body = `"use strict";
    const calls = { fetch: [], render: [], markRead: [] };
    const state = { selectedChatId: 'dm:a:b', activeView: 'coach', activeCoachSection: 'messages' };
    const _chatLastPoll = {};
    const _chatConversations = ${JSON.stringify(conversations)};
    let _chatPollTimer = ${pollTimerActive ? '1234' : 'null'};
    const feedEl = { scrollHeight: 100, scrollTop: 0, clientHeight: 100 };
    const document = { getElementById: (id) => (id === 'chatFeed') ? feedEl : null };
    async function chatFetchMessages(convId, since) { calls.fetch.push([convId, since]); return ${JSON.stringify(fetchResult)}; }
    function chatRenderMessages(convId, mode) { calls.render.push([convId, mode]); }
    function chatMarkRead(convId) { calls.markRead.push(convId); }
    function chatScrollToBottom() {}
    ${extractFn('chatRefreshOpenThread')}
    return (async () => ({ result: await chatRefreshOpenThread(), calls }))();
  `;
  return new Function(body)();
}

test('TEST 5 — dedicated poll active → chatRefreshOpenThread issues NO duplicate fetch', async () => {
  const { result, calls } = await runRefresh({
    pollTimerActive: true, fetchResult: [{ id: 'm1', ts: 1 }],
  });
  assert.deepEqual(calls.fetch, [], 'the thread poll owns this thread — no second request');
  assert.equal(result, false);
});

test('TEST 5b — the skipped path still clears an unread badge', async () => {
  // Skipping the fetch must not strand the badge: the thread is open and
  // being read, so the read marker still goes out.
  const { calls } = await runRefresh({
    pollTimerActive: true,
    conversations: [{ id: 'dm:a:b', unread: 3 }],
  });
  assert.deepEqual(calls.fetch, [], 'still no duplicate fetch');
  assert.deepEqual(calls.markRead, ['dm:a:b'], 'the open thread is still marked read');
});

test('TEST 6 — dedicated poll NOT active → chatRefreshOpenThread still fetches (fallback)', async () => {
  const { result, calls } = await runRefresh({
    pollTimerActive: false, fetchResult: [{ id: 'm1', ts: 1 }],
  });
  assert.deepEqual(calls.fetch, [['dm:a:b', 0]], 'the fallback path is preserved');
  assert.deepEqual(calls.render, [['dm:a:b', 'coach']]);
  assert.equal(result, true);
});

// ── C. Cadence ────────────────────────────────────────────────────────────

test('TEST 10 — the thread poll ticks every 5s, and typing rides the same tick', async () => {
  // Behavioural: capture the real interval the function registers, then fire
  // one tick and count the requests it actually makes.
  const body = `"use strict";
    const calls = { messages: [], typing: [] };
    let _registeredMs = null, _intervalFn = null, _chatPollTimer = null;
    const _chatLastPoll = {};
    const state = { activeView: 'coach', activeCoachSection: 'messages', selectedChatId: 'squad' };
    function setInterval(fn, ms) { _intervalFn = fn; _registeredMs = ms; return 7; }
    function clearInterval() { _chatPollTimer = null; }
    async function chatFetchMessages(convId) { calls.messages.push(convId); return []; }
    async function chatPollTyping(convId) { calls.typing.push(convId); }
    function chatRenderMessages() {} function chatMarkRead() {} function chatScrollToBottom() {}
    const document = { hidden: false, getElementById: () => null };
    ${extractFn('chatStopPolling')}
    ${extractFn('chatStartPolling')}
    return (async () => { chatStartPolling('squad'); await _intervalFn(); return { _registeredMs, calls }; })();
  `;
  const { _registeredMs, calls } = await new Function(body)();
  assert.equal(_registeredMs, 5000, 'thread poll cadence is 5s, not the original 2.5s');
  assert.equal(calls.messages.length, 1, 'one messages request per tick');
  assert.equal(calls.typing.length, 1, 'typing rides the same tick — never more often than messages');
});

test('TEST 10b — the background poll is throttled off the Messages screen', () => {
  // In Messages every tick runs (the contact list must stay live); elsewhere
  // one tick in five reaches the server (~25s at the 5s tick).
  const runDue = (state, ticks) => new Function(`
    "use strict";
    const state = arguments[0];
    let _chatBgPollTick = 0;
    const CHAT_BG_POLL_IDLE_TICKS = ${src.match(/const CHAT_BG_POLL_IDLE_TICKS = (\d+);/)[1]};
    ${extractFn('chatBackgroundPollDue')}
    let ran = 0;
    for (let i = 0; i < arguments[1]; i++) if (chatBackgroundPollDue()) ran++;
    return ran;
  `)(state, ticks);

  const inMessages = { activeView: 'coach', activeCoachSection: 'messages' };
  const elsewhere  = { activeView: 'coach', activeCoachSection: 'overview' };

  assert.equal(runDue(inMessages, 20), 20, 'on Messages every 5s tick still polls');
  assert.equal(runDue(elsewhere, 20), 4, 'elsewhere only 1 tick in 5 polls (~25s)');

  // The interval itself is still gated on session + visibility.
  assert.match(src, /setInterval\(\(\) => \{ if \(chatBackgroundPollAllowed\(\) && chatBackgroundPollDue\(\)\) bgPollUnread\(\); \}, 5000\)/,
    'the throttle is applied on top of the auth/visibility gate, not instead of it');
});

test('leaving Messages does not strand the throttle counter', () => {
  // Returning to Messages must poll on the VERY NEXT tick, not wait out a
  // partially-consumed idle cycle.
  const ran = new Function(`
    "use strict";
    const state = { activeView: 'coach', activeCoachSection: 'overview' };
    let _chatBgPollTick = 0;
    const CHAT_BG_POLL_IDLE_TICKS = ${src.match(/const CHAT_BG_POLL_IDLE_TICKS = (\d+);/)[1]};
    ${extractFn('chatBackgroundPollDue')}
    chatBackgroundPollDue(); chatBackgroundPollDue();   // 2 idle ticks consumed
    state.activeCoachSection = 'messages';
    return chatBackgroundPollDue();
  `)();
  assert.equal(ran, true, 'the first tick back on Messages polls immediately');
});
