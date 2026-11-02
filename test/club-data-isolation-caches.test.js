// CD-110 LOOP 1 — CLUB DATA ISOLATION: the caches the club transition forgot.
//
// The original P1 (a device SEEDING a new club's server store from another
// club's local state) is closed by adoptClubContext / clubStateOwned and pinned
// by test/club-state-isolation.test.js. What that boundary did NOT reach is a
// set of module-level caches holding the previous club's content:
//
//   _mcTeams / _mcTeamsAttempted      Match Centre sides — LATCHED on truthy, so
//                                     never refetched: Club A's teams were the
//                                     next club's sides for the rest of the page.
//   _attendance / _attendanceGroup    the register, keyed by GROUP id; grp_initial
//                                     collides across clubs, so the loader saw
//                                     "same group, already loaded" and kept A's.
//   _resolvedAvailability / _availLastSync / _resolvedAvailabilityGroup
//                                     the live answers map — same group-id
//                                     collision; and the Members / Recent
//                                     activity latches then believed the next
//                                     club's answers were already known.
//   _liveMessagingLoadedAt            the Availability panels' cycle was not
//                                     re-armed, so Club A's panels stood ≤15 s.
//   _chatConversations / _chatMessages / state.selectedChatId …
//                                     reset on an IDENTITY change only — the
//                                     same owner switching clubs kept A's threads.
//   _coachDraftsList, _liveSchedulesHtml, _mcOtherSide, _mcCoachPublication
//                                     bounded (12–15 s / keyed) but still A's.
//   _perfAssign / _perfAuthor / _identityPendingRequests
//                                     per-club answers latched on `loaded` or
//                                     re-read only while their panel is open.
//   IN FLIGHT: a reply for the club being left that lands AFTER the transition
//   must be discarded (_clubEpoch) — else the latch re-fills with that club.
//   _myDetails / _settingsPrefs       IDENTITY-scoped: a player's phone,
//                                     emergency contact, height and weight
//                                     survived sign-out and the next account on
//                                     the device was shown — and could save — them.
//
// Real functions are extracted from index.html and executed against a captured
// fetch. Every test below is RED on the baseline and GREEN once
// resetClubScopedState / resetIdentityScopedState forget these caches too.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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

const CLUB_A = 'club_a_alpha';
const CLUB_B = 'club_b_bravo';
const GROUP  = 'grp_initial';   // the id EVERY club's first group carries

// Everything that identifies Club A — or Player A — and must not survive.
const CLUB_A_SIGNATURES = [
  'Alpha Premier', 'Alpha Development', 'team_a1', 'team_a2',          // sides
  'Alpha One', 'user_pa1', 'present-at-alpha',                          // register / answers
  'cg_club_a', 'Club A thread', 'Club A secret message',                // chat
  'Alpha coach draft', 'Alpha schedule markup', 'Alpha Opposition XV',  // drafts / schedules / opposition
  'Alpha coach sheet',                                                  // coach publication
  'Alpha Athlete', 'Alpha programme', 'Alpha Requester',                // performance / pending requests
];
const PLAYER_A_SIGNATURES = ['+32 470 00 00 01', 'Mum Alpha', 'alpha-reminders-on'];

function sandbox(cfg = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const calls = [];
    const counts = { renders: 0, refreshLive: 0, ensureAdmin: 0, renderPlayers: 0, renderPlayerWeek: 0, saves: 0, toasts: [] };
    const defaultState = { matchCentre: {}, schedule: [], trainingBlocks: {} };
    const state = CFG.state;
    // ── globals every extracted function assigns, declared as the app declares them ──
    let _clubContextId = CFG.contextId || '';
    let _clubEpoch = 0;
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
    let _myPlatformRole = '', _myOperational = null, _myMembership = { role: 'coach' }, _myMemberships = [], _myPermissions = ['publish_training'];
    let _platformAdmins = {}, _platformClubs = {}, _platformPlanEditing = '', _founderRepairs = {}, _platformFounders = {}, _platformFounderEditing = '', _platformFounderResult = {}, _platformProvisionResult = null, _inviteMigration = {};
    let _serverAuthState = 'authed', _serverSessionReadyFor = 'user_coach', _welcomeDismissed = true;
    let _availPollTimer = null, _availabilityReadSeq = 3, _availabilityAppliedSeq = 3, _liveAvailabilityInFlight = null, _availReadFailed = false;
    let authTab = 'login';
    const testAccounts = [];
    const LIVE_MESSAGING_MIN_INTERVAL_MS = 15000;
    // ── THE CACHES UNDER TEST — populated with Club A / Player A content ──
    let _mcTeams = CFG.emptyMc ? null : { groups: [{ id: '${GROUP}', name: 'Seniors' }],
                     teams: [{ id: 'team_a1', name: 'Alpha Premier', groupId: '${GROUP}' }, { id: 'team_a2', name: 'Alpha Development', groupId: '${GROUP}' }] };
    let _mcTeamsAttempted = !CFG.emptyMc;
    let _attendance = CFG.emptyAtt ? null : { scope: 'group', sessions: { 'slot_tue-20260915': { 'user_pa1': 'present-at-alpha' } } };
    let _attendanceGroup = CFG.emptyAtt ? null : '${GROUP}', _attendanceLoading = false, _attendanceFailed = null, _attendanceReason = '', _attendanceSelfKey = CFG.emptyAtt ? '' : 'user_pa1';
    let _perfAssign = { loaded: true, loading: false, error: null, capacity: 'staff', athletes: [{ userId: 'user_pa1', name: 'Alpha Athlete' }],
                        programmes: [{ id: 'prog_a', title: 'Alpha programme' }], assignments: [], entitlement: 'ok', selfService: null };
    let _perfAuthor = { step: 'draft', athleteUserId: 'user_pa1', draft: { title: 'Alpha programme' }, provenance: null, athleteProfile: null,
                        programmeId: null, weeks: 4, ack: false, busy: false, error: null, startDate: null, intent: 'assign', assignProgrammeId: null };
    let _identityPendingRequests = [{ id: 'req_a', displayName: 'Alpha Requester' }];
    let _resolvedAvailability = { user_pa1: { 'slot_tue-20260915': { response: 'present-at-alpha', name: 'Alpha One' } } };
    let _resolvedAvailabilityGroup = '${GROUP}';
    let _availLastSync = '2026-11-02T10:00:00.000Z';
    let _membersAvailFetchedFor = '${GROUP}', _activityFetchedFor = '${GROUP}';
    let _liveMessagingLoadedAt = Date.now(), _liveMessagingInFlight = false;
    let _chatConversations = [{ id: 'cg_club_a', title: 'Club A thread', unread: 2 }];
    let _chatConversationsLoaded = true;
    let _chatMessages = { cg_club_a: [{ id: 'm1', text: 'Club A secret message' }] };
    let _chatLastPoll = { cg_club_a: 1 }, _chatHistoryLoadedAt = { cg_club_a: 1 }, _chatFeedPaintedFor = 'cg_club_a';
    let _coachDraftsList = [{ userId: 'user_other', coachName: 'Alpha coach draft', fixtureId: '', sideId: '', squad: {} }];
    let _coachDraftsFetchedAt = Date.now();
    let _liveSchedulesHtml = '<div>Alpha schedule markup</div>', _liveSchedulesLoadedAt = Date.now();
    let _mcOtherSide = { fixtureId: 'fx_a', sideId: 'team_a1', teamName: 'Alpha Opposition XV', names: ['Alpha One'] };
    let _mcOtherSideResolvedKey = 'fx_a|team_a1', _mcOtherSideFetchedAt = Date.now();
    let _mcCoachPublication = { coachSheet: { note: 'Alpha coach sheet' }, publishedByName: 'Alpha coach', fixtureId: 'fx_a', sideId: 'team_a1' };
    let _mcCoachPubFetchedAt = Date.now();
    let _myDetails = CFG.emptyDetails ? null : { phone: '+32 470 00 00 01', emergencyContact: 'Mum Alpha', heightCm: 180, weightKg: 90, _loaded: true };
    let _settingsPrefs = { reminders: 'alpha-reminders-on' }, _settingsVersion = 'c1171ee';
    // ── stubs ──
    function isCoach() { return CFG.coach !== false; }
    function canI() { return CFG.coach !== false; }
    function membershipPlays() { return CFG.coach === false; }
    function currentUser() { return { id: state.currentUserId, role: CFG.coach === false ? 'player' : 'coach' }; }
    function render() { counts.renders++; }
    function renderPlayers() { counts.renderPlayers++; }
    function renderPlayerWeek() { counts.renderPlayerWeek++; }
    function renderAuthBanner() {} function showToast(t) { counts.toasts.push(t); }
    function esc(s) { return String(s ?? ''); }
    function refreshLiveAvailability() { counts.refreshLive++; return Promise.resolve(); }
    function ensureAdminData() { counts.ensureAdmin++; }
    function adminRetryCancel() {}
    function availabilitySetReadFailed(v) { _availReadFailed = Boolean(v); }
    function chatSetUnreadTotal() {} function chatStopPolling() {}
    function queueRosterSync() {}
    function saveState() { counts.saves++; }
    async function ceConfirm() { return true; }
    async function settle() { for (let i = 0; i < 6; i++) await new Promise(r => globalThis.setImmediate(r)); }
    const server = { club: CFG.serverClub || '${CLUB_A}' };
    const held = [];
    async function fetch(url, opts = {}) {
      const method = opts.method || 'GET';
      calls.push({ method, url, body: opts.body ? JSON.parse(opts.body) : null });
      const A = server.club === '${CLUB_A}';          // the answer describes the club in force WHEN THE REQUEST LEFT
      if ((CFG.hold || []).some(prefix => url.startsWith(prefix))) {
        await new Promise((resolve, reject) => held.push({ resolve, reject }));
      }
      const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
      if (url === '/api/publish?resource=matchday-teams')
        return json(A ? { ok: true, groups: [{ id: '${GROUP}', name: 'Seniors' }], teams: [{ id: 'team_a1', name: 'Alpha Premier', groupId: '${GROUP}' }, { id: 'team_a2', name: 'Alpha Development', groupId: '${GROUP}' }] }
                      : { ok: true, groups: [{ id: '${GROUP}', name: 'Seniors' }], teams: [{ id: 'team_b1', name: 'Bravo First XV', groupId: '${GROUP}' }, { id: 'team_b2', name: 'Bravo Seconds', groupId: '${GROUP}' }] });
      if (url.startsWith('/api/publish?resource=attendance'))
        return json(A ? { ok: true, sessions: { 'slot_tue-20260915': { user_pa1: 'present-at-alpha' } }, selfKey: 'user_pa1' }
                      : { ok: true, sessions: { 'slot_thu-20261105': { user_pb1: 'present' } }, selfKey: 'user_pb1' });
      if (url.startsWith('/api/identity?action=session'))
        return json(A ? { ok: true, user: { id: 'user_player_a' }, playerProfile: { details: { phone: '+32 470 00 00 01', emergencyContact: 'Mum Alpha' } } }
                      : { ok: true, user: { id: 'user_player_b' }, playerProfile: { details: { phone: '+32 480 99 99 02', emergencyContact: 'Dad Bravo' } } });
      return json({ ok: true });
    }
    // Let a held request proceed (resolve) or fail (reject) — AFTER the test has moved the device on.
    function release(ok = true) { const h = held.shift(); if (!h) throw new Error('nothing held'); if (ok) h.resolve(); else h.reject(new TypeError('Failed to fetch')); }
    // ── the real functions under test ──
    ${fn('rosterFingerprint')}
    ${fn('clubStateOwned')}
    ${fn('adoptClubContext')}
    ${fn('resetTeamScopedState')}
    ${fn('forgetClubCaches')}
    ${fn('resetClubScopedState')}
    ${fn('availabilityStopLive')}
    ${fn('resetIdentityScopedState')}
    ${fn('settingsSignOut')}
    ${fn('mcSideRank')}
    ${fn('ensureMatchCentreTeams')}
    ${fn('matchCentreSides')}
    ${fn('attendanceReadScope')}
    ${fn('loadAttendance')}
    ${fn('currentAttendance')}
    ${fn('currentResolvedAvailability')}
    ${fn('ensureMembersAvailability')}
    ${fn('ensureRecentActivity')}
    ${fn('liveMessagingCycleDue')}
    ${fn('loadMyDetails')}
    ${fn('renderMyDetailsCard')}
    return {
      state, calls, counts, settle, server, release,
      resetClub: () => resetClubScopedState(),
      resetIdentity: () => resetIdentityScopedState(),
      signOut: () => settingsSignOut(),
      adopt: id => adoptClubContext(id),
      sides: () => matchCentreSides().map(t => t.name),
      ensureSides: () => ensureMatchCentreTeams(),
      attendance: () => currentAttendance(),
      resolved: () => currentResolvedAvailability(),
      ensureMembersAvailability, ensureRecentActivity, liveMessagingCycleDue,
      myDetailsCard: () => renderMyDetailsCard(),
      caches: () => ({ _mcTeams, _mcTeamsAttempted, _attendance, _attendanceGroup, _attendanceFailed, _attendanceReason, _attendanceSelfKey, _attendanceLoading,
                       _perfAssign, _perfAuthor, _identityPendingRequests, _clubEpoch,
                       _resolvedAvailability, _resolvedAvailabilityGroup, _availLastSync, _membersAvailFetchedFor, _activityFetchedFor,
                       _liveMessagingLoadedAt, _chatConversations, _chatConversationsLoaded, _chatMessages, _chatLastPoll, _chatHistoryLoadedAt,
                       _chatFeedPaintedFor, _coachDraftsList, _coachDraftsFetchedAt, _liveSchedulesHtml, _liveSchedulesLoadedAt,
                       _mcOtherSide, _mcOtherSideResolvedKey, _mcCoachPublication, _mcCoachPubFetchedAt, selectedChatId: state.selectedChatId }),
      identityCaches: () => ({ _myDetails, _settingsPrefs, _settingsVersion }),
      contextId: () => _clubContextId,
    };
  `;
  return new Function(body)(cfg);
}

function clubAState(extra = {}) {
  return {
    stateTeamId: CLUB_A, currentUserId: 'user_coach',
    users: [{ id: 'user_coach', role: 'coach', name: 'Same Coach' }],
    players: [{ id: 'pa1', userId: 'user_pa1', name: 'Alpha One' }],
    fixtures: [{ id: 'fx_a' }], clubName: 'Club A RFC', teamName: 'Seniors', seasonName: '26/27',
    clubLogo: '', clubColours: null, matchCentre: {}, formationNames: {}, fphotoIds: {}, benchPlayers: [],
    schedule: [], trainingBlocks: {}, trainingByGroup: { [GROUP]: {} }, trainingAdopted: {}, trainingStateGroupId: GROUP,
    trainingAttendance: {}, sessionNotes: {}, availabilityRequests: [], autopilotReceipts: [], lastWeekTrainingBlocks: null,
    messages: [], performanceWorkout: null, medicalRecords: {}, medicalNotes: {},
    operationalGroupId: GROUP, selectedChatId: 'cg_club_a', activeView: 'coach', activeCoachSection: 'matchday',
    availabilityPending: {}, meta: { revision: 1 },
    ...extra,
  };
}

const noSignature = (obj, sigs, what) => {
  const json = JSON.stringify(obj);
  for (const sig of sigs) assert.ok(!json.includes(sig), `${what}: Club A signature "${sig}" must not survive`);
};

// ═════════════════════════════════════════════════════════════════════════════
// The club transition (resetClubScopedState — run by switchTeamTo and by
// adoptClubContext on every login / claim / creation / session-restore path)
// ═════════════════════════════════════════════════════════════════════════════

test('Match Centre sides: the transition drops the previous club\'s teams and the next club\'s are READ, not inherited', async () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A });
  assert.deepEqual(c.sides(), ['Alpha Premier', 'Alpha Development'], 'baseline: Club A sides in force');
  c.resetClub(); c.server.club = CLUB_B;
  // Club B's session lands: same group id, as every club's first group has.
  c.state.operationalGroupId = GROUP;
  assert.deepEqual(c.sides(), [], 'no sides are shown until the next club\'s teams have been read');
  c.ensureSides();
  assert.equal(c.calls.filter(x => x.url === '/api/publish?resource=matchday-teams').length, 1,
    'the latch is released: the next club\'s teams are fetched');
  await c.settle();
  assert.deepEqual(c.sides(), ['Bravo First XV', 'Bravo Seconds'], 'and the sides shown are the next club\'s');
});

test('attendance register: the transition forgets the previous club\'s register, even for the colliding group id', async () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A });
  assert.equal(c.attendance().sessions['slot_tue-20260915'].user_pa1, 'present-at-alpha', 'baseline: Club A register in force');
  c.resetClub(); c.server.club = CLUB_B;
  c.state.operationalGroupId = GROUP;
  assert.equal(c.attendance(), null, 'the register of the next club is UNKNOWN, not Club A\'s');
  const reads = c.calls.filter(x => x.url.startsWith('/api/publish?resource=attendance'));
  assert.equal(reads.length, 1, 'and it is read afresh');
  assert.equal(reads[0].url, `/api/publish?resource=attendance&group=${GROUP}`);
  await c.settle();
  const after = c.attendance();
  assert.ok(after && after.sessions['slot_thu-20261105'], 'the next club\'s register arrives');
  noSignature(after, CLUB_A_SIGNATURES, 'attendance after the transition');
  assert.equal(c.caches()._attendanceSelfKey, 'user_pb1', 'the self key is the server\'s answer for THIS club');
});

test('resolved availability: the transition forgets the answers map, re-arms the live cycle and releases the fetch latches', () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A });
  assert.ok(c.resolved() && c.resolved().user_pa1, 'baseline: Club A answers resolved for grp_initial');
  assert.equal(c.liveMessagingCycleDue(), false, 'baseline: the live cycle has just run');
  c.resetClub();
  c.state.operationalGroupId = GROUP;
  assert.equal(c.resolved(), null, 'Club A\'s answers are not the next club\'s knowledge of the same group id');
  assert.equal(c.caches()._availLastSync, null);
  assert.equal(c.liveMessagingCycleDue(), true, 'the Availability panels reload for the next club at once, not after the 15 s window');
  c.ensureMembersAvailability();
  c.ensureRecentActivity();
  assert.equal(c.counts.refreshLive, 2, 'Members dots and Recent activity each FETCH the next club\'s answers instead of trusting Club A\'s map');
});

test('messages: the transition forgets the previous club\'s conversation list, thread bodies and the selected thread', () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A });
  c.resetClub();
  const k = c.caches();
  assert.deepEqual(k._chatConversations, []);
  assert.equal(k._chatConversationsLoaded, false, 'and the "server has stated the list" latch is released so the next club\'s list is fetched');
  assert.deepEqual(k._chatMessages, {});
  assert.deepEqual(k._chatLastPoll, {}); assert.deepEqual(k._chatHistoryLoadedAt, {});
  assert.equal(k._chatFeedPaintedFor, null);
  assert.equal(k.selectedChatId, null, 'no Club A thread stays selected under the next club');
});

test('the bounded Match Centre and schedule caches go too: drafts list, opposition names, coach publication, schedules markup', () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A });
  c.resetClub();
  const k = c.caches();
  assert.equal(k._coachDraftsList, null); assert.equal(k._coachDraftsFetchedAt, 0, 'the 12 s throttle does not hold Club A\'s list over the next club');
  assert.equal(k._liveSchedulesHtml, ''); assert.equal(k._liveSchedulesLoadedAt, 0);
  assert.equal(k._mcOtherSide, null); assert.equal(k._mcOtherSideResolvedKey, '');
  assert.equal(k._mcCoachPublication, null); assert.equal(k._mcCoachPubFetchedAt, 0);
});

test('no Club A signature survives in ANY module cache after the transition', () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A });
  noSignature({ before: 1 }, [], 'sanity');
  c.resetClub();
  noSignature(c.caches(), CLUB_A_SIGNATURES, 'module caches');
  noSignature(c.state, ['Alpha One', 'Club A RFC', 'cg_club_a'], 'persisted state');
});

test('adoptClubContext: the server naming a DIFFERENT club (login, claim, creation, session restore) forgets the caches …', () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A });
  assert.equal(c.adopt(CLUB_B), true, 'a transition ran');
  assert.equal(c.contextId(), CLUB_B);
  noSignature(c.caches(), CLUB_A_SIGNATURES, 'module caches after adopting Club B');
  assert.equal(c.caches()._mcTeams, null);
  assert.equal(c.caches()._attendance, null);
  assert.equal(c.resolved(), null);
});

test('… and the server naming the SAME club (reload, session poll) keeps every cache — nothing is refetched needlessly', () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A });
  const before = JSON.stringify(c.caches());
  assert.equal(c.adopt(CLUB_A), false, 'no transition');
  assert.equal(JSON.stringify(c.caches()), before, 'same club: caches untouched');
  assert.deepEqual(c.sides(), ['Alpha Premier', 'Alpha Development']);
  assert.equal(c.calls.length, 0, 'and nothing was fetched');
});

test('Performance assignments, the authoring draft and the pending join requests are the club\'s too', () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A });
  c.resetClub();
  const k = c.caches();
  assert.equal(k._perfAssign.loaded, false, 'the next club\'s assignments are re-read');
  assert.deepEqual(k._perfAssign.athletes, []); assert.deepEqual(k._perfAssign.programmes, []);
  assert.equal(k._perfAssign.entitlement, null, 'entitlement is per club');
  assert.equal(k._perfAuthor.athleteUserId, null); assert.equal(k._perfAuthor.draft, null, 'no draft for a Club A athlete sits inside Club B\'s shell');
  assert.deepEqual(k._identityPendingRequests, [], 'Club A\'s requesters are not Club B\'s to-do');
  assert.equal(k._clubEpoch, 1, 'and the transition is counted, so replies already out are discarded on arrival');
});

test('in flight at the switch: a Match Centre teams reply for the club being left lands AFTER the transition and is discarded', async () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A, hold: ['/api/publish?resource=matchday-teams'], emptyMc: true });
  c.ensureSides();                                   // Club A's read leaves …
  assert.equal(c.calls.length, 1);
  c.resetClub(); c.server.club = CLUB_B;             // … the switch completes while it is out …
  c.release(); await c.settle();                     // … and Club A's reply lands now.
  assert.equal(c.caches()._mcTeams, null, 'the club being left\'s teams are not adopted');
  assert.deepEqual(c.sides(), []);
  c.ensureSides(); c.release(); await c.settle();    // the next club's own read (held too) is not blocked by the stale one
  assert.equal(c.calls.filter(x => x.url === '/api/publish?resource=matchday-teams').length, 2);
  assert.deepEqual(c.sides(), ['Bravo First XV', 'Bravo Seconds']);
});

test('in flight at the switch: the register reply for the club being left is discarded — and its failure is not this club\'s failure', async () => {
  const c = sandbox({ state: clubAState(), contextId: CLUB_A, hold: ['/api/publish?resource=attendance'], emptyAtt: true });
  assert.equal(c.attendance(), null);                // Club A's read leaves (held)
  c.resetClub(); c.server.club = CLUB_B;
  c.release(); await c.settle();                     // Club A's reply lands after the transition
  let k = c.caches();
  assert.equal(k._attendance, null, 'Club A\'s register is not adopted for Club B\'s grp_initial');
  assert.equal(k._attendanceGroup, null);
  assert.equal(k._attendanceLoading, false, 'and the stale read does not block the next club\'s');
  assert.equal(c.attendance(), null);                // Club B's own read leaves (held)
  c.release(); await c.settle();
  k = c.caches();
  assert.ok(k._attendance && k._attendance.sessions['slot_thu-20261105'], 'Club B\'s register arrives');
  noSignature(k._attendance, CLUB_A_SIGNATURES, 'Club B\'s register');
  // The invariant kept: a failed read for the CURRENT club is recorded as a failure (null document, failed group stamped) — never an empty register
  const e = sandbox({ state: clubAState(), contextId: CLUB_A, hold: ['/api/publish?resource=attendance'], emptyAtt: true });
  e.attendance(); e.release(false); await e.settle();
  assert.equal(e.caches()._attendance, null); assert.equal(e.caches()._attendanceFailed, GROUP, 'this club\'s failure IS recorded');
  assert.equal(e.caches()._attendanceLoading, false);
  // A read out for the club being left that FAILS after the transition
  const d = sandbox({ state: clubAState(), contextId: CLUB_A, hold: ['/api/publish?resource=attendance'], emptyAtt: true });
  d.attendance(); d.resetClub(); d.server.club = CLUB_B;
  d.release(false); await d.settle();
  assert.equal(d.caches()._attendanceFailed, null, 'the failed read was the club being left\'s — not a failure of this club\'s read');
  assert.equal(d.caches()._attendanceLoading, false);
});

// ═════════════════════════════════════════════════════════════════════════════
// The identity transition (resetIdentityScopedState — login as someone else,
// sign-out, session restore of another account)
// ═════════════════════════════════════════════════════════════════════════════

test('My details: a change of account forgets the previous person\'s phone, emergency contact, height and weight', async () => {
  const c = sandbox({ state: clubAState({ activeView: 'player' }), contextId: CLUB_A, coach: false });
  assert.ok(c.myDetailsCard().includes('+32 470 00 00 01'), 'baseline: Player A sees their own details');
  c.resetIdentity(); c.server.club = CLUB_B; c.state.currentUserId = 'user_player_b';
  assert.equal(c.identityCaches()._myDetails, null, 'the cache is forgotten with the identity');
  const html = c.myDetailsCard();
  noSignature({ html }, PLAYER_A_SIGNATURES, 'the next account\'s card');
  assert.equal(c.calls.filter(x => x.url.startsWith('/api/identity?action=session')).length, 1, 'the next account\'s details are READ from the server');
  await c.settle();
  assert.ok(c.myDetailsCard().includes('+32 480 99 99 02'), 'and what is shown is theirs');
  assert.equal(c.identityCaches()._settingsPrefs, null, 'notification preferences are the person\'s too');
  assert.equal(c.identityCaches()._settingsVersion, null, 'and Settings\' load latch is released, so the next person\'s preferences are read when Settings opens');
});

test('sign-out forgets them as well (the shared-device case: the next player on this phone never sees them)', async () => {
  const c = sandbox({ state: clubAState({ activeView: 'player' }), contextId: CLUB_A, coach: false });
  await c.signOut();
  assert.equal(c.state.currentUserId, '');
  assert.equal(c.identityCaches()._myDetails, null);
  assert.equal(c.identityCaches()._settingsPrefs, null);
  noSignature(c.identityCaches(), PLAYER_A_SIGNATURES, 'identity caches after sign-out');
});

test('in flight at the identity change: a My details reply for the previous person lands after the change and is discarded', async () => {
  const c = sandbox({ state: clubAState({ activeView: 'player', currentUserId: 'user_player_a' }), contextId: CLUB_A, coach: false,
                      hold: ['/api/identity?action=session'], emptyDetails: true });
  c.myDetailsCard();                                 // Player A's read leaves (held)
  c.resetIdentity(); c.state.currentUserId = 'user_player_b'; c.server.club = CLUB_B;
  c.release(); await c.settle();                     // Player A's reply lands after the change
  assert.equal(c.identityCaches()._myDetails, null, 'Player A\'s details are not adopted for Player B');
  c.myDetailsCard();                                 // Player B's own read
  c.release(); await c.settle();
  const html = c.myDetailsCard();
  assert.ok(html.includes('+32 480 99 99 02'), 'Player B sees their own');
  noSignature({ html }, PLAYER_A_SIGNATURES, 'Player B\'s card');
});
