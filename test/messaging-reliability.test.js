/**
 * Messaging service regression tests (production audit).
 *
 * Four defects were found live and are pinned here:
 *  D1  message CONTENT was written to the browser console on every send.
 *  D2  a cold load REPLACED the cached thread with the newest page (limit 60
 *      of up to 500 retained), truncating history the client already held.
 *  D3  the background unread poll ran every 5s for every visitor forever —
 *      including signed-out tabs (401 each time) and after logout.
 *  D4  'coach' is a PLAYER-only placeholder conversation id, and a locally
 *      computed coach DM can name the legacy 'coach-demo' account. Neither
 *      exists server-side, so staff sends failed outright and both sides
 *      404'd on every poll tick.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('{', start), depth = 0, end = i;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

// ── D1 — no message content in logs ────────────────────────────────────────
test('message content is never written to the console', () => {
  const send = fn('chatSendMessage');
  assert.equal(/console\.log\([^)]*text\.slice/.test(send), false, 'must not log message text');
  assert.equal(/console\.log\([^)]*\$\{text\}/.test(send), false, 'must not interpolate raw text');
  assert.match(send, /len=\$\{text\.length\}/, 'length only is acceptable');
});

// ── D2 — history is merged, never truncated ───────────────────────────────
test('a cold load merges into cached history instead of replacing it', () => {
  const fetchFn = fn('chatFetchMessages');
  // The `else` (since === 0) branch must not assign the response wholesale.
  assert.equal(/\}\s*else\s*\{\s*_chatMessages\[convId\] = fetched;/.test(fetchFn), false,
    'the truncating assignment must not return');
  assert.match(fetchFn, /if \(!existing\.length\) \{ _chatMessages\[convId\] = fetched; \}/,
    'only an empty cache may be seeded directly');
  // The shared merger is used, not a local id-only merge: as well as
  // de-duplicating it reconciles an optimistic bubble with the server message
  // it became (an id-only merge rendered one send twice).
  assert.match(fetchFn, /mergeMessages\(existing, fetched\)/, 'uses the shared optimistic-aware merger');
});

test('merge de-duplicates by stable message id', async () => {
  const { mergeMessages } = await import('../src/chat-state.js');
  const a = [{ id: 'm1', text: 'one', ts: 1 }, { id: 'm2', text: 'two', ts: 2 }];
  const merged = mergeMessages(a, [{ id: 'm2', text: 'two edited', ts: 2 }, { id: 'm3', text: 'three', ts: 3 }]);
  assert.deepEqual(merged.map(m => m.id), ['m1', 'm2', 'm3'], 'no duplicates, old kept');
  assert.equal(merged[1].text, 'two edited', 'existing entry updated in place');
  // Re-merging the same payload changes nothing.
  assert.deepEqual(mergeMessages(merged, merged).map(m => m.id), ['m1', 'm2', 'm3']);
});

// ── D3 — the background poll is session-gated and stops ───────────────────
test('the background unread poll only runs for an authenticated session', () => {
  assert.match(src, /function chatBackgroundPollAllowed\(\)/);
  const gate = fn('chatBackgroundPollAllowed');
  assert.match(gate, /_serverAuthState === 'authed'/, 'signed-out tabs never poll');
  assert.match(gate, /!document\.hidden/, 'hidden tabs never poll');
  assert.match(src, /setInterval\(\(\) => \{ if \(chatBackgroundPollAllowed\(\)\) bgPollUnread\(\); \}, 5000\)/,
    'the interval is gated, not unconditional');
  assert.equal(/setInterval\(\(\) => \{ if \(!document\.hidden\) bgPollUnread\(\); \}, 5000\)/.test(src), false,
    'the ungated loop must not return');
});

test('logout stops the per-conversation poller', () => {
  const idx = src.indexOf("_serverAuthState = 'anon';");
  const after = src.slice(idx, idx + 400);
  assert.match(after, /chatStopPolling\(\)/, 'the 2.5s poller is cleared on sign-out');
  const stop = fn('chatStopPolling');
  assert.match(stop, /clearInterval\(_chatPollTimer\)/);
  assert.match(stop, /_chatPollTimer = null/);
});

test('only one conversation poll timer can exist', () => {
  const start = fn('chatStartPolling');
  assert.match(start, /^function chatStartPolling\(convId\) \{\s*chatStopPolling\(\);/m,
    'starting always clears the previous timer first');
  assert.equal((src.match(/_chatPollTimer\s*=\s*setInterval/g) || []).length, 1,
    'exactly one place creates the timer');
});

// ── D4 — placeholder conversations are never requested ────────────────────
test('unresolved placeholder conversation ids are never sent to the server', () => {
  const body = fn('chatIsUnresolvedPlaceholder');
  const isPlaceholder = new Function(`
    const _chatConversations = arguments[0];
    ${body}
    return chatIsUnresolvedPlaceholder(arguments[1]);`);

  const none = [];
  assert.equal(isPlaceholder(none, 'coach'), true, "'coach' is a placeholder, not a conversation");
  assert.equal(isPlaceholder(none, 'dm:coach-demo:user_1'), true, 'legacy coach-demo DM cannot exist');
  assert.equal(isPlaceholder(none, 'dm:user_1:coach-demo'), true, 'either participant order');
  assert.equal(isPlaceholder(none, ''), true, 'empty id');
  assert.equal(isPlaceholder(none, 'squad'), false, 'real channels are requested');
  assert.equal(isPlaceholder(none, 'dm:user_1:user_2'), false, 'a real DM is requested');
  // Once the server knows the conversation it is no longer a placeholder.
  assert.equal(isPlaceholder([{ id: 'coach' }], 'coach'), false);
});

test('both message and typing polls honour the placeholder guard', () => {
  assert.match(fn('chatFetchMessages'), /if \(chatIsUnresolvedPlaceholder\(convId\)\) return \[\]/,
    'no message fetch for a placeholder');
  assert.match(fn('chatPollTyping'), /if \(chatIsUnresolvedPlaceholder\(convId\)\) return/,
    'no typing poll for a placeholder');
});

test('a staff session never sends to the player-only "coach" placeholder', () => {
  const body = fn('chatGetConvId');
  const getConvId = new Function(`
    const state = arguments[0];
    const _chatConversations = arguments[1];
    ${body}
    return chatGetConvId(arguments[2]);`);

  // The production case: a coach who just created their club still holds the
  // initial default 'coach' and had every send rejected.
  assert.equal(getConvId({ selectedChatId: 'coach' }, [], 'coach'), 'squad');
  assert.equal(getConvId({ selectedChatId: null }, [], 'coach'), 'squad');
  // A player keeps the placeholder — it is resolved to their real DM elsewhere.
  assert.equal(getConvId({ selectedChatId: 'coach' }, [], 'player'), 'coach');
  // An explicit staff choice is respected.
  assert.equal(getConvId({ selectedChatId: 'coaching' }, [], 'coach'), 'coaching');
  // If a real conversation genuinely called 'coach' exists, it is honoured.
  assert.equal(getConvId({ selectedChatId: 'coach' }, [{ id: 'coach' }], 'coach'), 'coach');
});

test('the initial default is corrected at every sign-in path', () => {
  // Login and account-switch both refuse to inherit the placeholder.
  // Both sign-in paths test for the placeholder and reset it to a real channel.
  const guards = src.split('\n').filter(l =>
    l.includes("state.selectedChatId === 'coach'") && l.includes("= 'squad'"));
  assert.equal(guards.length, 2, `both auth paths corrected, found ${guards.length}`);
  assert.equal(/if \(isStaff\) state\.selectedChatId = state\.selectedChatId \|\| 'squad';/.test(src), false,
    'the || form that preserved the placeholder must not return');
});

// ── Send reliability ──────────────────────────────────────────────────────
test('a failed send never leaves a delivered-looking bubble', () => {
  const send = fn('chatSendMessage');
  // Both the rejected-response and network-error paths remove the optimistic
  // message and tell the sender, so nothing is silently lost.
  assert.equal((send.match(/arr\.splice\(i, 1\)/g) || []).length, 2, 'removed on both failure paths');
  assert.match(send, /Message not delivered/);
  assert.match(send, /Message not sent — check your connection/);
  assert.match(send, /if \(ta && !ta\.value\.trim\(\)\) \{ ta\.value = text;/, 'draft restored on network failure');
});

test('the composer clears before the request, preventing a double send', () => {
  const send = fn('chatSendMessage');
  const clearAt = send.indexOf("ta.value = ''");
  const fetchAt = send.indexOf("fetch('/api/chat'");
  assert.ok(clearAt > 0 && fetchAt > clearAt,
    'the textarea is emptied synchronously before the await, so a second invocation returns early');
  assert.match(send, /const text = ta\?\.value\.trim\(\);\s*\n\s*if \(!text\) return;/,
    'an empty composer is a no-op');
});
