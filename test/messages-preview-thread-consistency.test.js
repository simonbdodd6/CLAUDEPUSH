/**
 * MESSAGES PREVIEW/THREAD CONSISTENCY (MESSAGES-PREVIEW-THREAD-MISMATCH-2).
 *
 * Production symptom (Seniors players channel, Sep 2026): the conversation
 * list showed a fresh server preview ("I didnt get a notification but…")
 * while the opened thread said "No messages yet" — permanently.
 *
 * Proven root cause: the full-history fetch ran only while
 * !_chatMessages[chatId]; an empty since>0 poll merge wrote [] (truthy!) so
 * the guard believed history was loaded; and the poll cursor was seeded to
 * Date.now() even after a FAILED history load, so existing history was
 * unreachable through polling. One transient fetch failure latched the
 * thread for the whole session.
 *
 * The fix: _chatHistoryLoadedAt[convId] — an EXPLICIT successful-full-load
 * marker — drives retry (chatNeedsHistory); the empty poll merge no longer
 * mints []; the cursor is established only by a successful full load, so an
 * unproven thread's next 5s tick reads since=0 and IS the retry (the same
 * single request the tick always made — CHAT-CPU-OPT-1 cadence unchanged).
 *
 * All tests drive the REAL extracted functions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

const MSGS = [
  { id: 'm1', ts: 1000, text: 'did all players selected receive…', senderId: 'p1' },
  { id: 'm2', ts: 2000, text: 'I got «not selected»…', senderId: 'p2' },
  { id: 'm3', ts: 3000, text: 'I didnt get a notification but…', senderId: 'p3' },
];

/** Real chatFetchMessages + chatNeedsHistory + chatIsUnresolvedPlaceholder +
 *  the select/mount/tick decisions, against a scripted server. serverScript is
 *  consumed one entry per request: 'MSGS' | 'EMPTY' | 'THROW' | 'NOTOK' |
 *  'E401' | 'E403' (last entry repeats). */
function makeEnv({ serverScript, conversations, loaded = true, store = MSGS } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const state = { selectedChatId: null, activeView: 'coach', activeCoachSection: 'messages' };
    let _serverAuthState = 'authed';
    let _chatMessages = {}, _chatLastPoll = {}, _chatHistoryLoadedAt = {};
    let _chatConversations = CFG.conversations;
    let _chatConversationsLoaded = CFG.loaded;
    let _chatStateModule = null;
    let requests = [];
    function chatLoadStateModule(){ return Promise.resolve({ mergeMessages: (a,b)=>{
      const s=new Set(a.map(m=>m.id)); return a.concat(b.filter(m=>!s.has(m.id))).sort((x,y)=>(x.ts||0)-(y.ts||0)); } }); }
    function chatIsCoachDirectConversation(){ return false; }
    function chatMe(){ return { id: 'coach1', name: 'C' }; }
    async function fetch(url){
      const since = Number(new URL(url, 'http://x').searchParams.get('since') || 0);
      const step = CFG.serverScript[Math.min(requests.length, CFG.serverScript.length - 1)];
      requests.push({ since, step });
      if (step === 'THROW') throw new Error('network');
      if (step === 'NOTOK') return { json: async () => ({ ok: false, error: 'Server error' }) };
      if (step === 'E401')  return { json: async () => ({ ok: false, error: 'Authentication required' }) };
      if (step === 'E403')  return { json: async () => ({ ok: false, error: 'Not authorized for this conversation' }) };
      const all = step === 'EMPTY' ? [] : CFG.store;
      return { json: async () => ({ ok: true, messages: since > 0 ? all.filter(m => m.ts > since) : all }) };
    }
    ${fn('chatIsUnresolvedPlaceholder')}
    ${fn('chatFetchMessages')}
    ${fn('chatNeedsHistory')}
    // The select/mount decision (selectChat + renderCoachMessages, post-fix):
    async function openThread(convId){
      state.selectedChatId = convId;
      if (chatNeedsHistory(convId)) await chatFetchMessages(convId, 0);
      // chatStartPolling's seed (post-fix): only once history proved.
      if (!_chatLastPoll[convId] && _chatHistoryLoadedAt[convId]) _chatLastPoll[convId] = Date.now();
    }
    // One 5s poll tick (the real tick's since/bump logic):
    async function tick(convId){
      const since = _chatLastPoll[convId] || 0;
      const msgs = await chatFetchMessages(convId, since);
      if (msgs.length) _chatLastPoll[convId] = Date.now();
      return msgs.length;
    }
    return { openThread, tick,
      fetchDirect: (id, since) => chatFetchMessages(id, since),
      rendered: id => (_chatMessages[id] || []).length,
      ids:      id => (_chatMessages[id] || []).map(m => m.id).join(','),
      needs:    id => chatNeedsHistory(id),
      loadedAt: id => _chatHistoryLoadedAt[id] || 0,
      cursor:   id => _chatLastPoll[id] || 0,
      cache:    () => _chatMessages,
      requests: () => requests };
  `;
  return new Function(body)({ serverScript, conversations, loaded, store });
}

const GC  = { id: 'group:grp_initial', name: 'Seniors players', type: 'GROUP', lastMessage: MSGS[2] };
const DM  = { id: 'dm:coach1:user_abc', type: 'DIRECT', lastMessage: MSGS[0] };
const SQ  = { id: 'squad', type: 'GROUP' };
const CO  = { id: 'coaching', type: 'GROUP' };
const ALL = [GC, DM, SQ, CO];

// ── 1+2. Agreement ──────────────────────────────────────────────────────────

test('1+2. preview/thread agreement — the thread shows exactly the messages behind the preview', async () => {
  for (const conv of [GC, DM, SQ, CO]) {                     // group, DM, squad, coaching
    const env = makeEnv({ serverScript: ['MSGS'], conversations: ALL });
    await env.openThread(conv.id);
    assert.equal(env.rendered(conv.id), 3, `${conv.id}: all messages`);
    assert.equal(env.ids(conv.id), 'm1,m2,m3', `${conv.id}: chronological, no duplicates`);
  }
});

// ── 3-5. M1: transient failure recovery ─────────────────────────────────────

test('3. M1 REPRO+FIX — one failed history fetch no longer latches: the next tick retries since=0 and heals', async () => {
  const env = makeEnv({ serverScript: ['THROW', 'MSGS'], conversations: ALL });
  await env.openThread(GC.id);                               // history fetch fails
  assert.equal(env.rendered(GC.id), 0, 'thread empty right after the failure');
  assert.equal(env.loadedAt(GC.id), 0, 'a failed load is NOT marked successful');
  assert.equal(env.cursor(GC.id), 0, 'the cursor is NOT pre-seeded to NOW (test 18)');
  const got = await env.tick(GC.id);                          // the 5s tick IS the retry
  assert.equal(got, 3, 'the tick fetched since=0 and recovered the full history');
  assert.equal(env.rendered(GC.id), 3, 'thread agrees with the preview again');
  assert.ok(env.loadedAt(GC.id) > 0 && env.cursor(GC.id) > 0, 'marker + cursor established by the success');
});

test('4. re-select retries history while no successful load exists', async () => {
  const env = makeEnv({ serverScript: ['THROW', 'MSGS'], conversations: ALL });
  await env.openThread(GC.id);                               // fails
  await env.openThread(GC.id);                               // user leaves + reopens
  assert.equal(env.rendered(GC.id), 3, 're-select refetched and healed');
});

test('5. the old latch is gone: an empty INCREMENTAL poll cannot mint [] and block the retry', async () => {
  // The pre-fix killer sequence, against the REAL chatFetchMessages:
  //   failed full fetch → an empty since>0 poll wrote [] (truthy) →
  //   the guard believed "loaded" → permanent "No messages yet".
  const env = makeEnv({ serverScript: ['THROW', 'EMPTY', 'MSGS'], conversations: ALL });
  await env.openThread(GC.id);                               // full fetch fails
  assert.equal(env.cache()[GC.id], undefined, 'nothing cached after the failure');
  await env.fetchDirect(GC.id, 999999);                      // stray empty incremental poll ('EMPTY')
  assert.equal(env.cache()[GC.id], undefined, 'the empty merge writes NOTHING — no [] latch');
  assert.equal(env.needs(GC.id), true, 'history still owed — the retry stays armed');
  await env.openThread(GC.id);                               // retry succeeds ('MSGS')
  assert.equal(env.rendered(GC.id), 3, 'healed');
});

// ── 6-8. Empty conversations ────────────────────────────────────────────────

test('6+7. a successful EMPTY history marks loaded (no refetch loop), and a later message arrives via polling', async () => {
  const env = makeEnv({ serverScript: ['EMPTY', 'EMPTY', 'MSGS'], conversations: ALL, store: [MSGS[2]] });
  await env.openThread(GC.id);                               // genuinely empty, success
  assert.equal(env.rendered(GC.id), 0);
  assert.ok(env.loadedAt(GC.id) > 0, 'empty SUCCESS = loaded (never a retry loop)');
  assert.equal(env.needs(GC.id), false, 'no further history fetches owed');
  assert.ok(env.cursor(GC.id) > 0, 'polling state established');
  // later: a message arrives newer than the cursor — adjust store ts:
  const now = Date.now();
  const late = { id: 'mNew', ts: now + 1000, text: 'first!', senderId: 'p1' };
  const env2 = makeEnv({ serverScript: ['EMPTY', 'MSGS'], conversations: ALL, store: [late] });
  await env2.openThread(GC.id);
  const got = await env2.tick(GC.id);                        // incremental since=cursor
  assert.equal(got, 1, 'the new message arrives through the normal incremental poll');
  assert.equal(env2.rendered(GC.id), 1);
});

test('7b. a tick-retry that finds an EMPTY history establishes the cursor — no since=0 refetch loop', async () => {
  // Failed open → the 5s tick retries since=0 → the conversation is genuinely
  // empty. The SUCCESS itself must establish the polling cursor (the tick's
  // own bump only fires when messages came), or every subsequent tick would
  // refetch the full (empty) history forever.
  const env = makeEnv({ serverScript: ['THROW', 'EMPTY', 'EMPTY'], conversations: ALL });
  await env.openThread(GC.id);                               // fails: no marker, no cursor
  await env.tick(GC.id);                                     // retry since=0 → ok+[] (empty success)
  assert.ok(env.loadedAt(GC.id) > 0, 'empty success marks loaded');
  assert.ok(env.cursor(GC.id) > 0, 'the SUCCESS establishes the cursor');
  await env.tick(GC.id);
  assert.ok(env.requests()[2].since > 0, 'the next tick is INCREMENTAL — no full-history loop');
});

test('8. a brand-new conversation (not yet in the server list) is not spammed, then loads once real', async () => {
  const env = makeEnv({ serverScript: ['MSGS'], conversations: [SQ], loaded: true });
  await env.openThread('dm:coach1:user_new');                // unknown dm: → phantom guard
  assert.equal(env.requests().length, 0, 'no request for a not-yet-created DM');
  // the conversation becomes real (enters the server list):
  const env2 = makeEnv({ serverScript: ['MSGS'], conversations: [SQ, { id: 'dm:coach1:user_new', type: 'DIRECT' }] });
  await env2.openThread('dm:coach1:user_new');
  assert.equal(env2.rendered('dm:coach1:user_new'), 3, 'loads normally once known');
});

// ── 13-15. Errors never latch ───────────────────────────────────────────────

for (const [name, step] of [['13. 401', 'E401'], ['14. 403', 'E403'], ['15. server error', 'NOTOK']]) {
  test(`${name} does not latch history — recovery after the error clears`, async () => {
    const env = makeEnv({ serverScript: [step, 'MSGS'], conversations: ALL });
    await env.openThread(GC.id);
    assert.equal(env.loadedAt(GC.id), 0, 'error ≠ loaded');
    assert.equal(env.needs(GC.id), true, 'retry stays armed');
    await env.openThread(GC.id);                             // after auth/connectivity recovery
    assert.equal(env.rendered(GC.id), 3, 'healed');
  });
}

// ── 16-17. Incremental polling still works ──────────────────────────────────

test('16+17. after a successful load, polling is incremental and never duplicates', async () => {
  const env = makeEnv({ serverScript: ['MSGS'], conversations: ALL });
  await env.openThread(GC.id);
  const cursorAfterLoad = env.cursor(GC.id);
  assert.ok(cursorAfterLoad > 0, 'cursor established by the successful load');
  await env.tick(GC.id);                                     // since=cursor → nothing new
  assert.equal(env.requests()[1].since, cursorAfterLoad, 'incremental since — not a refetch');
  assert.equal(env.rendered(GC.id), 3, 'no duplicates');
  await env.tick(GC.id);
  assert.equal(env.rendered(GC.id), 3);
});

test('22. re-selecting an already-loaded conversation makes NO further full-history request', async () => {
  const env = makeEnv({ serverScript: ['MSGS'], conversations: ALL });
  await env.openThread(GC.id);
  await env.openThread(GC.id);
  await env.openThread(GC.id);
  assert.equal(env.requests().length, 1, 'exactly one history request — OPT-1 discipline intact');
});

// ── 19. Phantom guard ───────────────────────────────────────────────────────

test('19. phantom guard intact: unknown dm:/group: ids make zero requests, even though history is "owed"', async () => {
  const env = makeEnv({ serverScript: ['MSGS'], conversations: [SQ], loaded: true });
  for (let i = 0; i < 5; i++) await env.openThread('dm:coach1:ghost');
  for (let i = 0; i < 5; i++) await env.tick('dm:coach1:ghost');
  assert.equal(env.requests().length, 0, 'no request storm for a phantom conversation');
  assert.equal(env.needs('dm:coach1:ghost'), false, 'chatNeedsHistory excludes phantoms — no retry spin');
});

// ── 23. Cadence pins ────────────────────────────────────────────────────────

test('23. CHAT-CPU-OPT-1 cadence does not regress: one messages request per tick, 5s interval pinned in source', async () => {
  const env = makeEnv({ serverScript: ['THROW', 'MSGS'], conversations: ALL });
  await env.openThread(GC.id);                               // 1 failed request
  await env.tick(GC.id);                                     // 1 retry request (the tick's own)
  await env.tick(GC.id);                                     // 1 incremental request
  assert.equal(env.requests().length, 3, 'exactly one messages request per open/tick — no extra retries');
  assert.match(html, /\}, 5000\);\s*\n\s*\}\s*\n\s*function chatStopPolling/, 'the 5s poll interval is unchanged');
  const guard = fn('chatIsUnresolvedPlaceholder');
  assert.match(guard, /id\.startsWith\('dm:'\) \|\| id\.startsWith\('group:'\)/, 'phantom guard source intact');
});

// ── 24. Stale state recovery ────────────────────────────────────────────────

test('24. stale frontend state cannot permanently hide server messages: [] in cache without a marker still retries', async () => {
  const env = makeEnv({ serverScript: ['MSGS'], conversations: ALL });
  env.cache()[GC.id] = [];                                   // the historical latch shape
  assert.equal(env.needs(GC.id), true, 'a bare [] no longer counts as loaded');
  await env.openThread(GC.id);
  assert.equal(env.rendered(GC.id), 3, 'the real history replaces the stale empty state');
});

// ── Source pins ─────────────────────────────────────────────────────────────

test('PIN — the retry guards use chatNeedsHistory, never cache truthiness', () => {
  assert.match(fn('selectChat'), /else if \(chatNeedsHistory\(chatId\)\)/);
  assert.match(fn('renderCoachMessages'), /chatNeedsHistory\(state\.selectedChatId\)/);
  const rpm = fn('renderPlayerMessages');
  assert.equal((rpm.match(/chatNeedsHistory\(/g) || []).length >= 2, true, 'player sites converted');
  assert.ok(!/else if \(!_chatMessages\[chatId\]\)/.test(fn('selectChat')), 'the truthiness guard is gone');
});

test('PIN — the empty since>0 merge cannot mint []; success sets marker+cursor; failure sets neither', () => {
  const src = fn('chatFetchMessages');
  assert.match(src, /if \(fetched\.length \|\| existing\.length \|\| _chatHistoryLoadedAt\[convId\]\)/,
    'the empty-merge latch is guarded');
  assert.match(src, /_chatHistoryLoadedAt\[convId\] = Date\.now\(\)/, 'success marks history loaded');
  const markerAt = src.indexOf('_chatHistoryLoadedAt[convId] = Date.now()');
  const okAt = src.indexOf('if (data.ok)');
  assert.ok(okAt > 0 && markerAt > okAt, 'the marker is set only inside the ok branch');
  assert.ok(!fn('chatFetchMessages').slice(src.indexOf('catch')).includes('_chatHistoryLoadedAt[convId] ='),
    'the catch path never marks');
});

test('PIN — chatStartPolling seeds the cursor only after proven history; identity reset clears the markers', () => {
  assert.match(fn('chatStartPolling'), /if \(!_chatLastPoll\[convId\] && _chatHistoryLoadedAt\[convId\]\) _chatLastPoll\[convId\] = Date\.now\(\)/);
  assert.match(fn('resetIdentityScopedState'), /_chatHistoryLoadedAt = \{\}/);
});

// ── 20-21. Isolation (server pins — the client fix must not touch them) ─────

test('20+21. group/cross-club isolation untouched: server access + storage scoping source-pinned', () => {
  const chat = readFileSync(new URL('../api/chat.js', import.meta.url), 'utf8');
  assert.match(chat, /return ctx\.playingGroupId === targetGroup \|\| ctx\.staffGroupIds\.has\(targetGroup\)/,
    'group-targeted reads stay gated on playing/operating standing');
  assert.match(chat, /teamId === DEFAULT_TEAM\.id \? id : `\$\{id\}@\$\{teamId\}`/,
    'built-in/group storage stays club-scoped');
  assert.match(chat, /const groupCtx = conversationGroupId\(conversation\)\s*\n?\s*\? await groupContextForSession\(sessionContext\)/,
    'thread access still resolves the group context');
});
