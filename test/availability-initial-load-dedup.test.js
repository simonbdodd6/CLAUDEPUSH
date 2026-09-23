/**
 * Availability initial load — duplicate request elimination.
 *
 * Measured on a fresh load: ~36–39 requests for 12 distinct URLs in the first
 * ~600 ms, because render() runs once per loader that lands and three fetch
 * paths re-entered on every pass with no in-flight guard:
 *   /api/chat?action=conversations  ×9–10  (chatFetchConversations < renderCoachMessages)
 *   training-schedule               ×7–8   (renderTrainingScheduleCard bypassing ensureTrainingSchedule's latch)
 *   /api/schedules + /api/templates ×6     (<details open ontoggle> before the first load stored its markup)
 *
 * Each path now shares one in-flight promise. Pinned here, per path:
 *   two concurrent callers → one request · many → one · same result for all ·
 *   a rejection clears the latch · the next call makes a NEW request ·
 *   the pre-existing behaviour is unchanged (caching, forced refresh, keys).
 * The REAL functions are extracted from index.html and driven with a fetch
 * that only resolves when the test says so, so concurrency is real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  assert.ok(m, `function ${name} not found`);
  const start = m.index + 1;
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

/** A fetch whose replies the test releases by hand, so callers really overlap. */
const GATED_FETCH = `
  const calls = [];
  function fetch(url) {
    return new Promise((resolve, reject) => { calls.push({ url, resolve, reject }); });
  }
  const reply = (i, body, ok = true) => calls[i].resolve({ ok, status: ok ? 200 : 500, json: async () => body });
  const fail  = (i) => calls[i].reject(new Error('network down'));
  const tick  = () => new Promise(r => setTimeout(r, 0));
`;

// ─────────────────────────────────────────────────────────────────────────
// 1. chatFetchConversations
// ─────────────────────────────────────────────────────────────────────────
function chatScope() {
  return new Function(`"use strict";
    ${GATED_FETCH}
    let _chatConversations = [];
    let _chatConversationsLoaded = false;
    let _chatConversationsInFlight = null;
    const _serverAuthState = 'authed';
    let ME = { id: 'user_a' };
    function chatMe() { return ME; }
    function _filterCanonicalConversations(list) { return list; }
    let badge = null; function chatSetUnreadTotal(n) { badge = n; }
    function chatVisibleUnreadTotal() { return 7; }
    ${fn('chatFetchConversations')}
    return { calls, reply, fail, tick, chatFetchConversations,
      convs: () => _chatConversations, loaded: () => _chatConversationsLoaded,
      latch: () => _chatConversationsInFlight, badge: () => badge, setMe: m => { ME = m; } };
  `)();
}

test('chat: two concurrent callers share ONE request and both see the same result', async () => {
  const s = chatScope();
  const a = s.chatFetchConversations(); const b = s.chatFetchConversations();
  await s.tick();
  assert.equal(s.calls.length, 1, 'one /api/chat request for two callers');
  assert.ok(s.latch(), 'latched while in flight');
  s.reply(0, { ok: true, conversations: [{ id: 'squad' }] });
  await Promise.all([a, b]);
  assert.deepEqual(s.convs(), [{ id: 'squad' }]); assert.equal(s.loaded(), true); assert.equal(s.badge(), 7);
  assert.equal(s.latch(), null, 'latch cleared after settle');
});

test('chat: ten concurrent render passes still make one request', async () => {
  const s = chatScope();
  const ps = Array.from({ length: 10 }, () => s.chatFetchConversations());
  await s.tick();
  assert.equal(s.calls.length, 1);
  s.reply(0, { ok: true, conversations: [{ id: 'squad' }, { id: 'announce' }] });
  await Promise.all(ps);
  assert.equal(s.convs().length, 2);
});

test('chat: a failed request clears the latch and the next call makes a NEW request', async () => {
  const s = chatScope();
  const p = s.chatFetchConversations(); await s.tick();
  s.fail(0); await p;
  assert.equal(s.latch(), null, 'rejection cleared the latch');
  assert.equal(s.loaded(), false, 'a failure never arms the loaded flag (unchanged)');
  const q = s.chatFetchConversations(); await s.tick();
  assert.equal(s.calls.length, 2, 'the retry is a fresh request');
  s.reply(1, { ok: true, conversations: [{ id: 'squad' }] }); await q;
  assert.equal(s.loaded(), true);
});

test('chat: after a settled request the next call is a new request (no permanent cache)', async () => {
  const s = chatScope();
  const p = s.chatFetchConversations(); await s.tick(); s.reply(0, { ok: true, conversations: [] }); await p;
  const q = s.chatFetchConversations(); await s.tick();
  assert.equal(s.calls.length, 2, 'the conversations list is polled, not cached');
  s.reply(1, { ok: true, conversations: [] }); await q;
});

test('chat: a forced (post-mutation) call does NOT join the in-flight request, and identity is respected', async () => {
  const s = chatScope();
  const a = s.chatFetchConversations(); await s.tick();
  const f = s.chatFetchConversations(true); await s.tick();
  assert.equal(s.calls.length, 2, 'force starts its own request');
  s.setMe({ id: 'user_b' });
  const c = s.chatFetchConversations(); await s.tick();
  assert.equal(s.calls.length, 3, 'a different identity never shares another identity\'s request');
  assert.match(s.calls[2].url, /userId=user_b/);
  s.reply(0, { ok: true, conversations: [] }); s.reply(1, { ok: true, conversations: [] }); s.reply(2, { ok: true, conversations: [] });
  await Promise.all([a, f, c]);
  assert.equal(s.latch(), null);
});

test('chat: every render-driven caller shares; every post-mutation caller forces', () => {
  const forced = (src.match(/chatFetchConversations\(true\)/g) || []).length;
  assert.equal(forced, 5, 'group create/update (2), group modal save, DM open, and mark-read force a fresh answer');
  assert.equal((fn('renderCoachMessages').match(/chatFetchConversations\(\)\.then/g) || []).length, 2, 'both Messages render paths join the in-flight request');
  assert.match(fn('bgPollUnread'), /chatFetchConversations\(\)\.then/, 'the unread poll joins it too');
});

// ─────────────────────────────────────────────────────────────────────────
// 2. loadTrainingSchedule
// ─────────────────────────────────────────────────────────────────────────
function scheduleScope() {
  return new Function(`"use strict";
    ${GATED_FETCH}
    let _trainingSchedule = null, _trainingScheduleAttempted = false, _trainingScheduleGroupId = '';
    let _trainingScheduleInFlight = null, _trainingPubLoadedAt = 99;
    let rendered = 0; function render() { rendered++; }
    let GID = 'grp_a'; function trainingGroupParam() { return GID; }
    ${fn('loadTrainingSchedule')}
    ${fn('ensureTrainingSchedule')}
    return { calls, reply, fail, tick, loadTrainingSchedule, ensureTrainingSchedule,
      sched: () => _trainingSchedule, latch: () => _trainingScheduleInFlight, attempted: () => _trainingScheduleAttempted,
      rendered: () => rendered, setGid: g => { GID = g; } };
  `)();
}

test('schedule: the Settings card and the availability board share ONE request', async () => {
  const s = scheduleScope();
  s.ensureTrainingSchedule();                       // availability board (latched path)
  const card1 = s.loadTrainingSchedule();           // renderTrainingScheduleCard, render pass 2
  const card2 = s.loadTrainingSchedule();           // render pass 3
  await s.tick();
  assert.equal(s.calls.length, 1, 'one training-schedule request');
  assert.match(s.calls[0].url, /group=grp_a/);
  s.reply(0, { slots: [{ id: 'slot_tue' }] });
  const [r1, r2] = await Promise.all([card1, card2]);
  assert.deepEqual(r1, { slots: [{ id: 'slot_tue' }] }); assert.equal(r1, r2, 'same result object for all callers');
  assert.equal(s.rendered(), 1, 'the arrival re-renders exactly once (was once per duplicate)');
  assert.equal(s.latch(), null);
  await s.loadTrainingSchedule();
  assert.equal(s.calls.length, 1, 'once cached, no request at all (unchanged)');
});

test('schedule: seven concurrent render passes → one request', async () => {
  const s = scheduleScope();
  const ps = Array.from({ length: 7 }, () => s.loadTrainingSchedule());
  await s.tick(); assert.equal(s.calls.length, 1);
  s.reply(0, { slots: [] }); await Promise.all(ps);
});

test('schedule: HTTP failure and network failure both clear the latch; the retry is a new request', async () => {
  const s = scheduleScope();
  let p = s.loadTrainingSchedule(); await s.tick(); s.reply(0, {}, false);
  assert.equal(await p, null); assert.equal(s.latch(), null); assert.equal(s.attempted(), false, 'attempt latch released (unchanged)');
  p = s.loadTrainingSchedule(); await s.tick(); assert.equal(s.calls.length, 2, 'fresh request after a 500');
  s.fail(1); assert.equal(await p, null); assert.equal(s.latch(), null);
  p = s.loadTrainingSchedule(); await s.tick(); assert.equal(s.calls.length, 3, 'fresh request after a network failure');
  s.reply(2, { slots: [] }); await p; assert.deepEqual(s.sched(), { slots: [] });
});

test('schedule: a request for ANOTHER group is never shared, and a forced chase replaces the latch', async () => {
  const s = scheduleScope();
  const a = s.loadTrainingSchedule(); await s.tick();
  s.setGid('grp_b');
  const b = s.loadTrainingSchedule(); await s.tick();
  assert.equal(s.calls.length, 2, 'different group → its own request');
  assert.match(s.calls[1].url, /group=grp_b/);
  s.reply(1, { slots: [{ id: 'b' }] }); await b;
  assert.deepEqual(s.sched(), { slots: [{ id: 'b' }] });
  s.reply(0, { slots: [{ id: 'a' }] }); await a;          // stale reply for grp_a lands last
  await s.tick();
  // Pre-existing semantics, unchanged: a stale reply is discarded and the
  // group in force is chased with a FORCED request — which must replace the
  // latch rather than join anything, and must not be un-latched by the
  // stale request settling.
  assert.equal(s.calls.length, 3, 'the stale reply chases the group in force (unchanged)');
  assert.match(s.calls[2].url, /group=grp_b/);
  assert.ok(s.latch() && s.latch().gid === 'grp_b', 'the forced chase holds the latch');
  const joined = s.loadTrainingSchedule(); await s.tick();
  assert.equal(s.calls.length, 3, 'a render pass during the chase joins it');
  s.reply(2, { slots: [{ id: 'b2' }] }); await joined; await s.tick();
  assert.deepEqual(s.sched(), { slots: [{ id: 'b2' }] }); assert.equal(s.latch(), null);
});

// ─────────────────────────────────────────────────────────────────────────
// 3. loadLiveSchedules (+ the toggle handler that re-fires on every render)
// ─────────────────────────────────────────────────────────────────────────
function liveScope() {
  return new Function(`"use strict";
    ${GATED_FETCH}
    let _liveSchedulesLoadedAt = 0, _liveSchedulesHtml = '', _liveSchedulesInFlight = null;
    const LIVE_MESSAGING_MIN_INTERVAL_MS = 15000;
    let panel = { innerHTML: 'Loading...' };
    const document = { getElementById: id => id === 'live-schedules-panel' ? panel : null };
    function esc(s) { return String(s); }
    ${fn('loadLiveSchedulesOnToggle')}
    ${fn('loadLiveSchedules')}
    return { calls, reply, fail, tick, loadLiveSchedules, loadLiveSchedulesOnToggle,
      panel: () => panel, rebuildPanel: () => { panel = { innerHTML: 'Loading...' }; },
      html: () => _liveSchedulesHtml, latch: () => _liveSchedulesInFlight };
  `)();
}
const SCHED = { schedules: [{ id: 's1', name: 'Chase', active: true, days: ['mon'], time: '18:00' }] };

test('live panels: the live-data cycle and five toggle re-fires share ONE schedules+templates pair', async () => {
  const s = liveScope();
  const a = s.loadLiveSchedules();                  // loadLiveMessaging
  for (let i = 0; i < 5; i++) { s.rebuildPanel(); s.loadLiveSchedulesOnToggle(); }   // renders rebuilding <details open>
  await s.tick();
  assert.equal(s.calls.length, 2, 'exactly one /api/schedules + one /api/templates');
  assert.ok(s.latch());
  s.reply(0, SCHED); s.reply(1, { templates: [] });
  await a; await s.tick();
  assert.match(s.panel().innerHTML, /Chase/, 'the panel that is CURRENTLY in the page is painted, not the one captured at request time');
  assert.match(s.html(), /Chase/, 'markup stored for later throttled repaints (unchanged)');
  assert.equal(s.latch(), null);
});

test('live panels: a failure clears the latch, shows the error, stores nothing, and the next call is a new request', async () => {
  const s = liveScope();
  const p = s.loadLiveSchedules(); await s.tick(); s.fail(0); s.reply(1, { templates: [] });
  await p;
  assert.match(s.panel().innerHTML, /Could not load schedules/); assert.equal(s.html(), ''); assert.equal(s.latch(), null);
  const q = s.loadLiveSchedules(); await s.tick();
  assert.equal(s.calls.length, 4, 'a fresh pair after the failure');
  s.reply(2, SCHED); s.reply(3, { templates: [] }); await q;
  assert.match(s.panel().innerHTML, /Chase/);
});

test('live panels: a forced reload (toggle/delete/manual refresh) does not join an in-flight request', async () => {
  const s = liveScope();
  const a = s.loadLiveSchedules(); await s.tick();
  const f = s.loadLiveSchedules(true); await s.tick();
  assert.equal(s.calls.length, 4, 'the forced reload is its own pair');
  s.reply(0, SCHED); s.reply(1, { templates: [] }); s.reply(2, { schedules: [] }); s.reply(3, { templates: [] });
  await Promise.all([a, f]);
  assert.match(s.panel().innerHTML, /No scheduled sends yet/, 'the forced (later) answer is what stays painted');
  assert.equal(s.latch(), null);
  assert.equal((src.match(/loadLiveSchedules\(true\)/g) || []).length, 3, 'toggle, delete and the manual refresh force');
});

test('live panels: once markup is held, a toggle inside the window repaints without any request (unchanged)', async () => {
  const s = liveScope();
  const p = s.loadLiveSchedules(); await s.tick(); s.reply(0, SCHED); s.reply(1, { templates: [] }); await p;
  s.rebuildPanel(); s.loadLiveSchedulesOnToggle(); await s.tick();
  assert.equal(s.calls.length, 2, 'no refetch'); assert.match(s.panel().innerHTML, /Chase/);
});
