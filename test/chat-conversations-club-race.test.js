/**
 * CD-111 — CHAT CONVERSATION CACHE ISOLATION ACROSS A CLUB SWITCH
 *
 * chatFetchConversations shares its in-flight request so that render-driven
 * callers join the request already out instead of starting another. The latch
 * was keyed on the IDENTITY alone — and the same owner switching clubs keeps
 * their identity. So Club B's first render JOINED the request still out for
 * Club A, Club B issued no request of its own, and Club A's reply became Club
 * B's conversation list: its titles, previews and unread counts, until the
 * next poll replaced them.
 *
 * Reproduced in a real browser on the CD-110 baseline (real handlers, the
 * owner in two clubs, Club A's reply held in transit): after the switch,
 * conversations requests since the switch = 0, the latch still held Club A's
 * request, and the list that landed as "loaded" for Club B was Club A's.
 *
 * Pinned here with the original timing, deterministically: Club A's request
 * leaves → the transition runs (resetClubScopedState, as switchTeamTo calls
 * it) → Club B asks → Club A's reply lands → Club B's reply lands. The context
 * each request was made in is _clubEpoch (CD-110): the latch is keyed on it
 * as well as on the identity, and a reply whose context has ended is
 * discarded on arrival — list, badge and thread bodies alike.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  const isAsync = src.slice(Math.max(0, start - 6), start) === 'async ';
  return (isAsync ? 'async ' : '') + src.slice(start, end + 1);
}
const fnOpt = name => (src.includes(`function ${name}(`) ? fn(name) : '');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const OWNER = 'u-owner';
const CLUB_A = 'club_a_alpha', CLUB_B = 'club_b_bravo';
// Coach mode hides 'squad'/'coaching' from the badge: Club A's visible unread is 3, Club B's is 2.
const A_LIST = [{ id: 'squad', name: 'Squad', unread: 5, lastActivity: 10 }, { id: 'cg_alpha', name: 'Alpha Only Group', unread: 3, lastActivity: 10 }];
const B_LIST = [{ id: 'squad', name: 'Squad', unread: 0 }, { id: 'cg_bravo', name: 'Bravo Only Group', unread: 2, lastActivity: 10 }];
const A_MSGS = [{ id: 'ma1', text: 'Alpha squad secret', ts: 1 }];
const B_MSGS = [{ id: 'mb1', text: 'Bravo squad note', ts: 2 }];

function sandbox(CFG = {}) {
  const body = `
    'use strict';
    const CFG = arguments[0];
    const calls = [], held = [], counts = { badge: [], saves: 0 };
    const defaultState = { matchCentre: {}, schedule: [], trainingBlocks: {} };
    const state = { currentUserId: '${OWNER}', users: [{ id: '${OWNER}', role: 'coach', name: 'Owner' }], players: [],
                    activeView: 'coach', activeCoachSection: 'messages', stateTeamId: '${CLUB_A}', selectedChatId: 'squad' };
    let _serverAuthState = 'authed';
    // ── the chat caches ──
    let _chatConversations = [], _chatConversationsLoaded = false, _chatConversationsInFlight = null, _chatNavUnread = 0;
    let _chatMessages = {}, _chatLastPoll = {}, _chatHistoryLoadedAt = {}, _chatFeedPaintedFor = null;
    // ── everything else the club transition assigns (declared as the app declares them) ──
    let _clubContextId = '${CLUB_A}', _clubEpoch = 0;
    let _rosterLastSyncedFp = null, _rosterSyncTimer = null, _rosterSyncPending = false, _rosterSyncDeferred = false;
    let _rosterAwaitingServer = false, _rosterEpoch = 0;
    let _appearanceAdjustments = null, _seasonSheets = null, _seasonSheetsGroup = null;
    let _trainingPubState = {}, _trainingPubLoadedAt = 0, _trainingSchedule = null, _trainingScheduleAttempted = false;
    let _trainingScheduleQueue = null, _trainingScheduleGroupId = '';
    let _groupRecipients = {}, _clubConfigChecked = true, _publishedStateLoadedAt = 9, _playerFixturesLandedAt = 9;
    let _adminData = { loaded: true, members: [] }, _staffDirLoadedAt = 9, _availRosterLinkedAt = 9, _staffDetailUserId = null;
    let _sharedMedical = { loaded: false, failed: false, cases: [], players: [] }, _medActivePlayerId = null, _medActiveTab = 'dashboard', _medAddInjuryOpen = false;
    let _autopilotEnsured = true, _autopilotLogAt = 9, _autopilotLog = [];
    let _playerAvailFetched = true, _playerAvailKnown = true, _availConfirmedAt = {}, _availReasonOpenByKey = {};
    const server = { club: '${CLUB_A}' };
    // ── stubs ──
    function chatMe() { return { id: state.currentUserId, name: 'Owner', role: 'coach', userId: state.currentUserId }; }
    function updateNavBadge() { counts.badge.push(_chatNavUnread); }
    function chatIsUnresolvedPlaceholder() { return false; }
    function chatIsCoachDirectConversation() { return false; }
    async function chatMergeMessages(a, b) { return [...a, ...b]; }
    function chatDirectParticipantId() { return ''; }
    function saveState() { counts.saves++; } function adminRetryCancel() {} function chatStopPolling() {}
    // The answer describes the club in force WHEN THE REQUEST LEFT — what the real server did.
    async function fetch(url) {
      const forA = server.club === '${CLUB_A}';
      calls.push({ url, club: server.club });
      const data = url.includes('action=conversations') ? { ok: true, conversations: forA ? ${JSON.stringify(A_LIST)} : ${JSON.stringify(B_LIST)} }
                 : url.includes('action=messages') ? { ok: true, messages: forA ? ${JSON.stringify(A_MSGS)} : ${JSON.stringify(B_MSGS)} }
                 : { ok: true };
      if ((CFG.hold || []).some(p => url.includes(p))) await new Promise((resolve, reject) => held.push({ url, resolve, reject }));
      return { ok: true, status: 200, json: async () => data };
    }
    function release(ok = true) { const h = held.shift(); if (!h) throw new Error('nothing held'); if (ok) h.resolve(); else h.reject(new TypeError('Failed to fetch')); }
    async function settle() { for (let i = 0; i < 8; i++) await new Promise(r => globalThis.setImmediate(r)); }
    // ── the real functions under test ──
    ${fn('rosterFingerprint')}
    ${fn('resetTeamScopedState')}
    ${fnOpt('forgetClubCaches')}
    ${fn('resetClubScopedState')}
    ${fn('_filterCanonicalConversations')}
    ${fn('chatUnreadTotal')}
    ${fn('chatVisibleUnreadTotal')}
    ${fn('chatSetUnreadTotal')}
    ${fn('chatFetchConversations')}
    ${fn('chatFetchMessages')}
    // The switch as switchTeamTo performs it: the transition runs, then the next club is in force.
    function switchTo(id) { resetClubScopedState(); server.club = id; state.stateTeamId = id; _clubContextId = id; }
    return { calls, held, counts, server, release, settle, switchTo, state,
      fetchConvs: f => chatFetchConversations(f), fetchMsgs: (c, s) => chatFetchMessages(c, s || 0),
      snap: () => ({ convs: _chatConversations.map(c => c.id), loaded: _chatConversationsLoaded,
                     inFlight: _chatConversationsInFlight ? _chatConversationsInFlight.id : null, badge: _chatNavUnread,
                     msgs: Object.fromEntries(Object.entries(_chatMessages).map(([k, v]) => [k, v.map(m => m.id)])), epoch: _clubEpoch }) };
  `;
  return new Function(body)(CFG);
}

test('C1 — the original timing: Club A\'s request is out when the owner switches; Club B starts its OWN request and Club A\'s reply never becomes Club B\'s list', async () => {
  const s = sandbox({ hold: ['action=conversations'] });
  const pA = s.fetchConvs();                                  // 1. Club A's request leaves (held in transit)
  await s.settle();
  assert.equal(s.held.length, 1); assert.equal(s.snap().inFlight, OWNER, 'baseline: the latch holds Club A\'s request');
  s.switchTo(CLUB_B);                                         // 2. the owner switches clubs
  assert.equal(s.snap().inFlight, null, 'the transition releases the latch: nothing of Club A\'s is "in flight" for Club B');
  assert.deepEqual(s.snap().convs, []);
  const pB = s.fetchConvs();                                  // 3. Club B's first render asks for its list
  await s.settle();
  assert.equal(s.calls.length, 2, 'Club B starts its OWN request instead of joining Club A\'s');
  assert.equal(s.calls[1].club, CLUB_B, 'and the server answers it for Club B');
  assert.equal(s.held.length, 2);
  s.release(); await pA; await s.settle();                    // 4. Club A's reply lands — under Club B
  assert.deepEqual(s.snap().convs, [], 'Club A\'s list does not become Club B\'s');
  assert.equal(s.snap().loaded, false, 'and the server has not "answered" for Club B yet');
  assert.equal(s.snap().badge, 0, 'no Club A unread on Club B\'s badge');
  s.release(); await pB;                                      // 5. Club B's own reply lands
  assert.deepEqual(s.snap().convs, ['squad', 'cg_bravo'], 'Club B\'s own reply is the list');
  assert.equal(s.snap().loaded, true); assert.equal(s.snap().badge, 2, 'the badge is Club B\'s unread');
});

test('C2 — an old request cannot overwrite the new state when it lands late', async () => {
  const s = sandbox({ hold: ['action=conversations'] });
  const pA = s.fetchConvs(); await s.settle();
  s.switchTo(CLUB_B);
  const pB = s.fetchConvs(); await s.settle();
  assert.equal(s.held.length, 2);
  // Club B's reply first …
  s.held.push(s.held.shift());                                // reorder: release B before A
  s.release(); await pB;
  assert.deepEqual(s.snap().convs, ['squad', 'cg_bravo']); assert.equal(s.snap().badge, 2);
  // … then Club A's lands late.
  s.release(); await pA; await s.settle();
  assert.deepEqual(s.snap().convs, ['squad', 'cg_bravo'], 'Club B\'s list stands'); assert.equal(s.snap().badge, 2, 'Club B\'s badge stands');
  assert.equal(s.snap().loaded, true);
});

test('C3 — a stale FAILURE for the club being left does not zero the new club\'s badge', async () => {
  const s = sandbox({ hold: ['action=conversations'] });
  const pA = s.fetchConvs(); await s.settle();
  s.switchTo(CLUB_B);
  const pB = s.fetchConvs(); await s.settle();
  s.held.push(s.held.shift());
  s.release(); await pB;
  assert.equal(s.snap().badge, 2, 'baseline: Club B\'s badge');
  s.release(false); await pA; await s.settle();               // Club A's request fails (offline) after the switch
  assert.equal(s.snap().badge, 2, 'Club B\'s badge is untouched by Club A\'s failure');
  assert.deepEqual(s.snap().convs, ['squad', 'cg_bravo']);
  assert.equal(s.snap().convs.length, 2);
});

test('C4 — same-club caching remains functional: callers join the request in flight, force bypasses it, and a landed request is not reused', async () => {
  const s = sandbox({ hold: ['action=conversations'] });
  const p1 = s.fetchConvs(); const p2 = s.fetchConvs(); await s.settle();
  assert.equal(s.calls.length, 1, 'the second render-driven caller joins the request already out');
  assert.equal(s.snap().inFlight, OWNER);
  const p3 = s.fetchConvs(true); await s.settle();
  assert.equal(s.calls.length, 2, 'a forced caller starts its own request');
  while (s.held.length) s.release();
  await Promise.all([p1, p2, p3]);
  assert.deepEqual(s.snap().convs, ['squad', 'cg_alpha']); assert.equal(s.snap().loaded, true); assert.equal(s.snap().badge, 3);
  assert.equal(s.snap().inFlight, null, 'nothing in flight once everything landed');
  const p4 = s.fetchConvs(); await s.settle();
  assert.equal(s.calls.length, 3, 'a later caller asks the server again (the latch is in-flight sharing, not a cache)');
  while (s.held.length) s.release(); await p4;
});

test('C5 — thread bodies: a message poll for the club being left is discarded; the same thread id in the next club loads its own', async () => {
  const s = sandbox({ hold: ['action=messages'] });
  const pA = s.fetchMsgs('squad'); await s.settle();           // Club A's 'squad' history leaves
  s.switchTo(CLUB_B);                                         // 'squad' exists in every club
  s.release(); await pA; await s.settle();
  assert.equal(s.snap().msgs.squad, undefined, 'Club A\'s squad messages are not Club B\'s squad thread');
  const pB = s.fetchMsgs('squad'); await s.settle(); s.release(); await pB;
  assert.deepEqual(s.snap().msgs.squad, ['mb1'], 'Club B\'s own history loads');
});

test('C6 — SOURCE: the transition and sign-out forget the same list; the identity reset ends the epoch too; the server\'s conversation authorization is untouched', () => {
  assert.match(stripComments(fn('resetClubScopedState')), /forgetClubCaches\(\)/, 'the club transition');
  assert.match(stripComments(fn('settingsSignOut')), /forgetClubCaches\(\)/, 'sign-out');
  assert.match(stripComments(fn('forgetClubCaches')), /_chatConversationsInFlight = null/, 'the latch is released by the transition');
  assert.match(stripComments(fn('resetIdentityScopedState')), /_clubEpoch\+\+/, 'an identity change ends the context too');
  const chat = fs.readFileSync(new URL('../api/chat.js', import.meta.url), 'utf8');
  assert.match(chat, /function sessionMatchesConversationTeam\(/, 'the server still refuses another club\'s conversation (unchanged by this fix)');
});
