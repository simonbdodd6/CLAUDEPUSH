/**
 * CD-111 — LOGOUT SECURITY: the device signs out FIRST, and nothing in flight
 * or remembered can sign it back in.
 *
 * Every defect pinned here was reproduced on the CD-110 baseline in a real
 * browser against the real handlers (test/logout-security-browser.test.js
 * drives the same journeys end to end):
 *
 *   1. settingsSignOut waited for the server's logout reply before touching
 *      local state. For the whole round trip — 1.2s measured against a server
 *      answering in 2.5s, indefinitely on a stalled connection — the person who
 *      had just confirmed "Sign out" was still looking at their authenticated
 *      app, with every section, nav entry and cache in place.
 *   2. A session check in flight at sign-out re-adopted the account when its
 *      reply landed: currentUserId and 'authed' came back, the id was
 *      re-persisted, the verify reminder was re-raised, and the next render
 *      repainted the authenticated shell.
 *   3. A logout the server did not confirm — a 503, or no network — was simply
 *      forgotten. The device cleared itself, the cookie stayed live, and a
 *      refresh logged the account straight back in.
 *   4. The club's caches (attendance register, Match Centre sides, drafts,
 *      resolved answers, the chat latch) survived sign-out and were inherited
 *      by the next person to log in on the device.
 *   5. The founder's verify-email reminder — their email address in it — and
 *      the "Coach dashboard · Settings" topbar stayed on the signed-out page.
 *
 * The boundary pinned: sign-out ends the local session synchronously; the
 * server is told afterwards; a logout it does not confirm is remembered and
 * finished before any session is adopted again; a reply made for a context
 * that has since ended is discarded on arrival; and a legitimate restore (a
 * live cookie on a device with nothing persisted) still signs in.
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
// Introduced by this change: absent on the baseline, so the suite fails there
// on BEHAVIOUR rather than at extraction.
const fnOpt = name => (src.includes(`function ${name}(`) ? fn(name) : '');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const COACH = { id: 'u-coach', role: 'coach', name: 'Nick Coach', email: 'nick@club.test' };
const NEXT  = { id: 'u-next',  role: 'coach', name: 'Second Coach', email: 'second@club.test' };
const VERIFY = { graceEndsAt: new Date(Date.now() + 36e5).toISOString(), inGrace: true };
const payloadFor = (u, extra = {}) => ({ ok: true,
  user: { id: u.id, role: u.role, displayName: u.name, email: u.email },
  teamMember: { teamId: 'club-a', role: u.role },
  permissions: ['manage_players', 'publish_training', 'medical_access'],
  memberships: [{ teamId: 'club-a', teamName: 'Alpha RFC', role: u.role, current: true }],
  ...extra });
const AUTH_200 = (u, extra) => ({ status: 200, body: payloadFor(u, extra) });
const PENDING_KEY = 'coach-eye-logout-pending';

function sandbox(CFG = {}) {
  const calls = [], held = [];
  const counts = { renders: 0, renderEpochs: [], saves: [], toasts: [], stopLive: 0, navs: 0, hydrated: 0 };
  // localStorage whose OWN ENUMERABLE keys are the stored keys (clearDeviceState
  // enumerates it with Object.keys), methods non-enumerable.
  const localStorage = Object.create(null);
  Object.defineProperties(localStorage, {
    getItem:    { value(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; } },
    setItem:    { value(k, v) { this[k] = String(v); } },
    removeItem: { value(k) { delete this[k]; } },
  });
  const sections = new Map([['coach-overview', '<div>AUTHENTICATED overview</div>'], ['coach-settings', '<div>AUTHENTICATED settings</div>']]);
  const sectionEl = id => ({ get innerHTML() { return sections.get(id); }, set innerHTML(v) { sections.set(id, v); }, classList: { add() {}, remove() {}, toggle() {} } });
  const elements = {
    pageTitle: { textContent: 'Settings' }, eyebrow: { textContent: 'Coach dashboard' },
    opGroupSwitcher: { innerHTML: '<select><option>Seniors</option></select>', dataset: { ceSwitcher: '<select>' } },
    identityLoginEmail: { value: NEXT.email }, identityLoginPassword: { value: 'password123' }, identityLoginBtn: { disabled: false, textContent: 'Log in' },
    'identity-requests-panel': { innerHTML: '' },
  };
  const doc = {
    _banner: null, _welcome: null, hidden: false,
    querySelectorAll(sel) { return sel === '.section' ? [...sections.keys()].map(sectionEl) : []; },
    getElementById(id) {
      if (id === 'verify-email-banner') return doc._banner;
      if (id === 'ce-welcome') return doc._welcome;
      if (sections.has(id)) return sectionEl(id);
      return elements[id] || null;
    },
    createElement() {
      const el = { id: '', className: '', innerHTML: '', style: {},
        remove() { if (doc._banner === el) doc._banner = null; if (doc._welcome === el) doc._welcome = null; } };
      return el;
    },
    body: { prepend(el) { if (el.id === 'verify-email-banner') doc._banner = el; }, appendChild(el) { if (el.id === 'ce-welcome') doc._welcome = el; } },
  };
  const win = { localStorage, location: { replaced: null, replace(u) { win.location.replaced = u; } }, _devLoginEnabled: false };
  const state = {
    currentUserId: CFG.currentUserId === undefined ? COACH.id : CFG.currentUserId,
    users: [COACH], players: [{ id: 'p1', name: 'A Player' }], clubName: 'Alpha RFC', stateTeamId: 'club-a',
    activeView: 'coach', activeCoachSection: 'settings', activePlayerSection: 'home', operationalGroupId: 'grp_initial',
    medicalRecords: {}, medicalNotes: {}, messages: [], availabilityPending: {}, features: {}, meta: { revision: 1 },
    selectedChatId: 'squad', teamCode: '', ...(CFG.state || {}),
  };
  const server = {
    session:    { status: 401, body: { ok: false, error: 'No active session' } },
    logout:     { status: 200, body: { ok: true } },
    login:      { status: 200, body: payloadFor(NEXT) },
    drafts:     { status: 200, body: { ok: true, drafts: [{ userId: 'u-other', coachName: 'Other Coach', fixtureId: '', sideId: '' }] } },
    medical:    { status: 200, body: { ok: true, cases: [{ id: 'c1', playerId: 'p1', note: 'hamstring' }], players: [{ id: 'p1' }] } },
    attendance: { status: 200, body: { ok: true, sessions: { 'slot_tue-20260915': { user_p1: 'present' } }, selfKey: '' } },
    performance: { status: 200, body: { ok: true, capacity: 'player', athletes: [{ userId: 'u-coach', name: 'Nick Coach' }], programmes: [], assignments: [], profile: { ageBand: 'u18', positions: ['9'] } } },
    requests:   { status: 200, body: { ok: true, pending: [{ id: 'req_late', displayName: 'Late Requester', email: 'late@club.test' }] } },
    ...(CFG.server || {}),
  };
  const body = `
    'use strict';
    // ── every module-level name an extracted function may assign ──
    let _serverAuthState = ${JSON.stringify(CFG.serverAuthState || 'authed')};
    let _myPermissions = ${JSON.stringify(CFG.permissions === undefined ? ['manage_players', 'publish_training'] : CFG.permissions)};
    let _myMemberships = [{ teamId: 'club-a', teamName: 'Alpha RFC', role: 'coach', current: true }], _myMembership = { role: 'coach', teamId: 'club-a' }, _serverSessionReadyFor = 'u-coach';
    let _myPlatformRole = '', _myOperational = { staff: { groups: [], defaultGroupId: 'grp_initial' } }, _verifyNotice = null, _welcomeDismissed = true, _chatShellRendered = 'coach', authTab = 'closed';
    let _chatMessages = { squad: [{ id: 'm1', text: 'PREVIOUS ACCOUNT THREAD' }] };
    let _sharedMedical = { loaded: ${CFG.medicalLoaded === false ? 'false' : 'true'}, failed: false, cases: [{ id: 'c0' }], players: [{ id: 'p1' }] };
    let _adminData = { invites: [], members: [{ id: 'm1', email: 'member@club.test' }], users: [], profiles: [], structure: null, counts: null, clubWideStaff: [], loaded: true, loading: false, attempted: true, failed: false };
    let _medActivePlayerId = null, _medActiveTab = 'dashboard', _medAddInjuryOpen = false;
    let _playerAvailFetched = true, _playerAvailKnown = true, _availConfirmedAt = {}, _availReasonOpenByKey = {};
    let _chatConversations = [{ id: 'cg_a', title: 'Club thread', unread: 2 }], _chatConversationsLoaded = true, _chatConversationsInFlight = { id: 'u-coach', promise: Promise.resolve() };
    let _chatLastPoll = {}, _chatHistoryLoadedAt = {}, _chatFeedPaintedFor = null, _chatNavUnread = 2, _groupRecipients = {};
    let _trainingSchedule = null, _trainingScheduleAttempted = false, _trainingScheduleQueue = null, _trainingScheduleGroupId = '';
    let _platformAdmins = {}, _platformClubs = {}, _platformPlanEditing = '', _founderRepairs = {}, _platformFounders = {}, _platformFounderEditing = '', _platformFounderResult = {}, _platformProvisionResult = null, _inviteMigration = {};
    let _myDetails = { phone: '+32 470 00 00 01' }, _settingsPrefs = { reminders: true }, _settingsVersion = 'x';
    let _perfAssign = { loaded: true, loading: false, error: null, capacity: 'staff', athletes: [{ name: 'Athlete' }], programmes: [], assignments: [], entitlement: 'ok', selfService: null };
    let _perfAuthor = { step: 'draft', athleteUserId: 'u-x', draft: { title: 'd' }, provenance: null, athleteProfile: null, programmeId: null, weeks: 4, ack: false, busy: false, error: null, startDate: null, intent: 'assign', assignProgrammeId: null };
    let _identityPendingRequests = [{ id: 'req_1' }];
    // ── the club caches (CD-110's list), as Club A content ──
    let _clubEpoch = 0, _clubContextId = 'club-a';
    let _mcTeams = { groups: [], teams: [{ id: 't1', name: 'Alpha Premier' }] }, _mcTeamsAttempted = true;
    let _mcOtherSide = { names: ['Alpha One'] }, _mcOtherSideResolvedKey = 'fx|t1', _mcOtherSideFetchedAt = 5, _mcCoachPublication = { coachSheet: {} }, _mcCoachPubFetchedAt = 5;
    let _coachDraftsList = ${CFG.noDrafts ? 'null' : "[{ coachName: 'Alpha coach draft' }]"}, _coachDraftsFetchedAt = 0;
    let _attendance = ${CFG.noAttendance ? 'null' : "{ scope: 'group', sessions: { 'slot_tue-20260915': { user_p1: 'present' } } }"};
    let _attendanceGroup = ${CFG.noAttendance ? 'null' : "'grp_initial'"}, _attendanceFailed = null, _attendanceReason = '', _attendanceSelfKey = '', _attendanceLoading = false;
    let _resolvedAvailability = { user_p1: {} }, _resolvedAvailabilityGroup = 'grp_initial', _availLastSync = 'sync-a', _membersAvailFetchedFor = 'grp_initial', _activityFetchedFor = 'grp_initial';
    let _liveMessagingLoadedAt = 5, _liveSchedulesHtml = '<div>alpha</div>', _liveSchedulesLoadedAt = 5;
    let _rosterReadOut = true, _publishedStateLoadedAt = 0, _identityRequestsLoading = false;
    let _logoutGen = 0, _hiddenDataChatAuthSeen = ${JSON.stringify(CFG.hiddenChatAuth === undefined ? 'authed' : CFG.hiddenChatAuth)};
    const testAccounts = [];
    const window = win, document = doc, localStorage = win.localStorage;
    // ── stubs around the functions under test ──
    async function ceConfirm() { return true; }
    function saveState(m) { counts.saves.push(m); }
    function showToast(t) { counts.toasts.push(t); }
    function renderAuthBanner() {} function renderNav() { counts.navs++; } function renderOperationalGroupSwitcher() {}
    // The real render() gate (pinned by logout-session-shell) empties the
    // authenticated sections for a signed-out device; mirrored here.
    function render() { counts.renders++; counts.renderEpochs.push(_clubEpoch); if (sessionSignedOut()) clearAuthenticatedSections(); }
    function chatStopPolling() {} function adminRetryCancel() {} function updateNavBadge() {} function chatSetUnreadTotal(t) { _chatNavUnread = Number(t || 0); }
    function availabilityStopLive() { counts.stopLive++; _resolvedAvailability = {}; _resolvedAvailabilityGroup = null; _availLastSync = null; _liveMessagingLoadedAt = 0; }
    function esc(s) { return String(s ?? ''); }
    function canonicalAccountForUserId(id) { return state.users.find(u => u.id === id) || null; }
    function membershipPlays() { return false; }
    function hydrateSessionPlayerRecord() { return false; }
    function rosterIsRead() { return true; }
    function loadPublishedStateForPlayer() { return Promise.resolve(); } function loadCoachDraft() { return Promise.resolve(); }
    function loadRosterFromServer() { return Promise.resolve(); } function loadClubConfigFromServer() { return Promise.resolve(); }
    function refreshPushSubscriptionMetadata() { return Promise.resolve(); }
    function adoptClubContext() { return false; } function hydrateClubFromServer() { counts.hydrated++; return Promise.resolve(); }
    function contextResolved() { return CFG.contextPending ? false : true; } function resolveOperationalGroup() {} function ensureOwnPlayerRecord() { return false; }
    function isStaffRole(r) { return ['coach', 'admin', 'medical'].includes(String(r || '')); }
    function landingViewFor() { return 'coach'; } function applyApprovedIdentityLocally() {}
    function friendlyAuthError(e) { return String(e && e.message || e); }
    // What the real one does: the caseload becomes PERSISTED state.
    function hydrateMedicalFromShared() { state.medicalRecords = Object.fromEntries((_sharedMedical.cases || []).map(c => [c.id, c])); }
    // What the real one does: the server projection becomes the PERSISTED athlete profile.
    function perfAdoptServerProfile(p) { if (p) state.performanceProfile = { ...p, adoptedFromServer: true }; }
    function renderPerformance() {} function renderIdentityRequestsPanel() {} function syncIdentityStateToLocalRoster() { return false; }
    function ensureServerSessionForCurrentUser() { return Promise.resolve(true); }
    // ── fetch: the answer is computed WHEN THE REQUEST LEAVES (what the real server did) and delivered when released ──
    async function fetch(url, opts = {}) {
      const method = opts.method || 'GET';
      const reqBody = opts.body ? JSON.parse(opts.body) : null;
      const action = reqBody && reqBody.action || null;
      const key = method + ' ' + (action ? 'identity:' + action : url);
      calls.push({ method, url, action, key, keepalive: !!opts.keepalive });
      const answer = action === 'logout' ? server.logout : action === 'login' ? server.login
        : url.startsWith('/api/identity?action=session') ? server.session
        : url.startsWith('/api/publish?type=drafts') ? server.drafts
        : url.startsWith('/api/publish?resource=medical') ? server.medical
        : url.startsWith('/api/publish?resource=attendance') ? server.attendance
        : url.startsWith('/api/publish?resource=performance') ? server.performance
        : url === '/api/identity' && method === 'GET' ? server.requests
        : { status: 200, body: { ok: true } };
      if ((CFG.hold || []).some(h => key.startsWith(h))) await new Promise((resolve, reject) => held.push({ key, resolve, reject }));
      if (answer === 'throw') throw new TypeError('Failed to fetch');
      const res = { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
      if ((CFG.holdBody || []).some(h => key.startsWith(h))) res.json = () => new Promise((resolve, reject) => held.push({ key, resolve: () => resolve(answer.body), reject }));
      return res;
    }
    function release(ok = true) { const h = held.shift(); if (!h) throw new Error('nothing held'); if (ok) h.resolve(); else h.reject(new TypeError('Failed to fetch')); }
    async function settle() { for (let i = 0; i < 8; i++) await new Promise(r => globalThis.setImmediate(r)); }
    // ── the real functions under test ──
    ${fn('sessionSignedOut')}
    ${fn('clearAuthenticatedSections')}
    ${fn('currentUser')}
    ${fn('isCoach')}
    ${fn('canI')}
    ${fn('renderVerifyEmailBanner')}
    ${fn('adoptIdentityPayload')}
    ${fn('resetIdentityScopedState')}
    ${fnOpt('forgetClubCaches')}
    ${fnOpt('logoutPending')}
    ${fnOpt('logoutPendingSet')}
    ${fnOpt('deliverLogout')}
    ${fn('settingsSignOut')}
    ${fn('clearDeviceState')}
    ${fn('checkServerSession')}
    ${fn('loginIdentityAccount')}
    ${fn('loadCoachDraftsList')}
    ${fn('attendanceReadScope')}
    ${fn('loadAttendance')}
    ${fn('loadMedicalFromServer')}
    ${fn('perfLoadAssignments')}
    ${fn('loadIdentityRequests')}
    return {
      state, calls, counts, held, server, release, settle, localStorage, win, doc, sections, cfg: CFG,
      signOut: () => settingsSignOut(), check: () => checkServerSession(), login: () => loginIdentityAccount(),
      clearDevice: () => clearDeviceState(), clearSections: () => clearAuthenticatedSections(),
      drafts: () => loadCoachDraftsList(), attendance: f => loadAttendance(f), medical: () => loadMedicalFromServer(),
      perf: () => perfLoadAssignments(), requests: () => loadIdentityRequests(),
      banner: () => renderVerifyEmailBanner(), setVerify: v => { _verifyNotice = v; },
      pending: () => (typeof logoutPending === 'function' ? logoutPending() : 'not implemented'),
      signedOut: () => sessionSignedOut(),
      snap: () => ({ uid: state.currentUserId, auth: _serverAuthState, perms: _myPermissions, memberships: _myMemberships.length,
                     verify: _verifyNotice, banner: doc._banner ? String(doc._banner.innerHTML) : null,
                     epoch: _clubEpoch, clubContextId: _clubContextId,
                     mcTeams: _mcTeams, attendance: _attendance, attendanceGroup: _attendanceGroup, drafts: _coachDraftsList, draftsAt: _coachDraftsFetchedAt,
                     resolved: _resolvedAvailability, chatInFlight: _chatConversationsInFlight, chatConvs: _chatConversations, chatMsgs: _chatMessages,
                     perfAssign: _perfAssign, perfAuthor: _perfAuthor, pendingRequests: _identityPendingRequests, sharedMedical: _sharedMedical,
                     mcAttempted: _mcTeamsAttempted, perfProfile: state.performanceProfile,
                     gen: _logoutGen, hiddenChatAuth: _hiddenDataChatAuthSeen,
                     adminMembers: _adminData.members.length, myDetails: _myDetails, readyFor: _serverSessionReadyFor, welcomeDismissed: _welcomeDismissed, authTab }),
    };
  `;
  return new Function('state', 'calls', 'counts', 'held', 'server', 'CFG', 'win', 'doc', 'sections', body)(state, calls, counts, held, server, CFG, win, doc, sections);
}
const authenticatedMarkupRemains = s => [...s.sections.values()].some(h => String(h).includes('AUTHENTICATED'));

// ═══════════════════════════════════════════════════════════════════════════════
// Order: the device first, the server afterwards
// ═══════════════════════════════════════════════════════════════════════════════

test('A — the device signs out at once; the server is told afterwards', async () => {
  const s = sandbox({ hold: ['POST identity:logout'] });
  assert.equal(s.signedOut(), false, 'baseline: signed in');
  const done = s.signOut();
  await s.settle();
  assert.equal(s.held.length, 1, 'the logout call is out, unanswered …');
  assert.equal(s.snap().uid, '', '… and the device is ALREADY signed out: no user id');
  assert.equal(s.snap().auth, 'anon', '… refused');
  assert.equal(s.signedOut(), true);
  assert.ok(s.counts.renders >= 1, '… and repainted');
  assert.ok(!authenticatedMarkupRemains(s), 'the authenticated sections are emptied before the server answers');
  assert.ok(s.counts.saves.includes('Signed out'), 'the blank marker is persisted before the server answers');
  assert.ok(s.counts.toasts.includes('Signed out'));
  s.release(); await done;
  assert.equal(s.pending(), false, 'a confirmed logout leaves nothing to retry');
});

test('B — a logout the server did not confirm is remembered on the device; the device is signed out regardless', async () => {
  for (const [label, logout] of [['503', { status: 503, body: { ok: false } }], ['network failure', 'throw']]) {
    const s = sandbox({ server: { logout } });
    await s.signOut();
    assert.equal(s.signedOut(), true, `${label}: the device is signed out`);
    assert.equal(s.snap().uid, '', `${label}: no user id`);
    assert.equal(s.snap().auth, 'anon', `${label}: refused`);
    assert.equal(s.pending(), true, `${label}: … and it remembers that the server has not confirmed the logout`);
  }
  const ok = sandbox(); await ok.signOut(); assert.equal(ok.pending(), false, '200: nothing to remember');
});

test('C — a remembered logout is finished before any session is asked for; nothing is adopted until the server confirms it', async () => {
  // Offline boot after a sign-out the server never received. The cookie is
  // still live: the server WOULD answer 200 — it must not be asked.
  const s = sandbox({ currentUserId: '', serverAuthState: 'unknown', permissions: null, server: { logout: 'throw', session: AUTH_200(COACH) } });
  s.localStorage.setItem(PENDING_KEY, '1');
  await s.check();
  assert.deepEqual(s.calls.map(c => c.key), ['POST identity:logout'], 'the logout is retried first; the session is NOT asked for while it is unconfirmed');
  assert.equal(s.snap().uid, '', 'the cookie\'s session is not adopted');
  assert.notEqual(s.snap().auth, 'authed');
  assert.equal(s.signedOut(), true);
  assert.equal(s.pending(), true, 'still remembered for the next attempt');
  // The network returns: the logout is confirmed, then the session is asked for and refused.
  s.server.logout = { status: 200, body: { ok: true } }; s.server.session = { status: 401, body: { ok: false } }; s.calls.length = 0;
  await s.check();
  assert.deepEqual(s.calls.map(c => c.key), ['POST identity:logout', 'GET /api/identity?action=session'], 'confirmed, then the session is asked for');
  assert.equal(s.pending(), false, 'nothing left to retry');
  assert.equal(s.snap().auth, 'anon'); assert.equal(s.signedOut(), true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Replies in flight across the boundary
// ═══════════════════════════════════════════════════════════════════════════════

test('D — a session reply that left before sign-out is discarded when it lands', async () => {
  const s = sandbox({ hold: ['GET /api/identity?action=session'], server: { session: AUTH_200(COACH, { selfServiceVerification: VERIFY }) } });
  const check = s.check();                          // the session check leaves while signed in …
  await s.settle(); assert.equal(s.held.length, 1, 'baseline: the check is out');
  await s.signOut();                                // … the person signs out (confirmed at once) …
  assert.equal(s.snap().uid, '');
  s.counts.saves.length = 0;
  s.release(); await check;                         // … and the OLD reply — a 200 for them — lands
  const n = s.snap();
  assert.equal(n.uid, '', 'the account is not re-adopted');
  assert.equal(n.auth, 'anon', 'the device stays refused');
  assert.equal(s.signedOut(), true);
  assert.equal(n.perms, null, 'no permission set is adopted');
  assert.equal(n.verify, null, 'no verify reminder is raised'); assert.equal(n.banner, null, 'and none is painted');
  assert.ok(!s.counts.saves.includes('Server session restored'), 'the user id is not re-persisted');
  assert.ok(!authenticatedMarkupRemains(s), 'the shell stays empty');
});

test('E — with no transition the same reply IS adopted: a live cookie on a device with nothing persisted signs in (legitimate restore)', async () => {
  const s = sandbox({ currentUserId: '', serverAuthState: 'unknown', permissions: null, server: { session: AUTH_200(COACH, { selfServiceVerification: VERIFY }) } });
  assert.equal(s.signedOut(), true, 'baseline: nothing persisted');
  await s.check();
  const n = s.snap();
  assert.equal(n.uid, COACH.id, 'the server\'s user is adopted'); assert.equal(n.auth, 'authed'); assert.equal(s.signedOut(), false);
  assert.deepEqual(n.perms, payloadFor(COACH).permissions);
  assert.ok(n.verify, 'the founder reminder is raised for the restored session');
  assert.ok(s.counts.saves.includes('Server session restored'));
  assert.ok(s.counts.renders >= 1, 'the boundary flipped, so the shell repaints');
  assert.equal(s.pending(), false);
});

test('E2 — a cookie naming a different person than the persisted marker replaces them, and ends the context their replies were made in', async () => {
  const s = sandbox({ currentUserId: 'u-other', state: { users: [COACH, { id: 'u-other', role: 'coach', name: 'Other' }] }, server: { session: AUTH_200(COACH) } });
  const before = s.snap().epoch;
  await s.check();
  assert.equal(s.snap().uid, COACH.id);
  assert.ok(s.snap().epoch > before, '_clubEpoch advances on the identity change');
  // The loaders this bump invalidates must be free to read again for the new
  // person: the sides latch and the drafts throttle are released with it.
  assert.equal(s.snap().mcAttempted, false, 'the Match Centre sides latch is released');
  assert.equal(s.snap().draftsAt, 0, 'the drafts throttle is released');
});

// ═══════════════════════════════════════════════════════════════════════════════
// What sign-out leaves behind
// ═══════════════════════════════════════════════════════════════════════════════

test('F — sign-out forgets the club\'s caches and ends their epoch; the club\'s persisted data stays, as the confirmation promises', async () => {
  const s = sandbox(); const before = s.snap();
  await s.signOut();
  const n = s.snap();
  assert.ok(n.epoch > before.epoch, '_clubEpoch advances: a reply still out for the account that left is discarded on arrival');
  assert.equal(n.mcTeams, null, 'Match Centre sides'); assert.equal(n.attendance, null, 'attendance register'); assert.equal(n.attendanceGroup, null);
  assert.equal(n.drafts, null, 'other coaches\' drafts'); assert.equal(n.draftsAt, 0, 'and their throttle');
  assert.deepEqual(n.resolved, {}, 'resolved answers'); assert.equal(n.chatInFlight, null, 'the chat latch');
  assert.deepEqual(n.chatConvs, []); assert.deepEqual(n.chatMsgs, {});
  assert.equal(n.perfAssign.loaded, false); assert.deepEqual(n.perfAssign.athletes, []); assert.equal(n.perfAuthor.draft, null); assert.deepEqual(n.pendingRequests, []);
  assert.equal(n.sharedMedical.loaded, false); assert.equal(n.adminMembers, 0); assert.equal(n.myDetails, null);
  // kept — "Your club data stays saved locally — log back in any time."
  assert.equal(s.state.players.length, 1, 'the roster stays'); assert.equal(s.state.clubName, 'Alpha RFC', 'the club name stays');
  assert.equal(n.clubContextId, 'club-a', 'the device still knows whose club data it holds'); assert.equal(s.state.stateTeamId, 'club-a');
});

test('G — the founder\'s verify reminder, their email address in it, does not survive sign-out', async () => {
  const s = sandbox();
  s.setVerify(VERIFY); s.banner();
  assert.ok(s.snap().banner && s.snap().banner.includes(COACH.email), 'baseline: the reminder shows the founder\'s address while signed in');
  await s.signOut();
  assert.equal(s.snap().verify, null, 'the notice is forgotten with the identity');
  assert.equal(s.snap().banner, null, 'and the banner is taken down at once');
});

test('H — the signed-out paint neutralises the topbar as well as the sections', () => {
  const s = sandbox();
  s.clearSections();
  assert.ok(!authenticatedMarkupRemains(s));
  assert.notEqual(s.doc.getElementById('pageTitle').textContent, 'Settings', 'the page title no longer names the authenticated screen');
  assert.notEqual(s.doc.getElementById('eyebrow').textContent, 'Coach dashboard', 'the eyebrow no longer says "Coach dashboard"');
  assert.equal(s.doc.getElementById('opGroupSwitcher').innerHTML, '', 'the group switcher is emptied');
});

test('I — logging in clears a remembered logout and starts the next person clean', async () => {
  const s = sandbox({ server: { logout: 'throw' } });
  await s.signOut();
  assert.equal(s.pending(), true, 'baseline: an unconfirmed logout is remembered');
  await s.login();
  const n = s.snap();
  assert.equal(n.uid, NEXT.id); assert.equal(n.auth, 'authed'); assert.equal(s.signedOut(), false);
  assert.equal(s.pending(), false, 'this login created a NEW session: the old logout is no longer owed (retrying it would destroy the new session)');
  assert.equal(n.mcTeams, null, 'nothing of the previous person\'s club caches is inherited'); assert.equal(n.attendance, null); assert.equal(n.drafts, null);
  const loginAt = s.calls.findIndex(c => c.action === 'login');
  assert.ok(!s.calls.some((c, i) => i > loginAt && c.action === 'logout'), 'no logout is sent after the login');
});

test('J — a pending request cannot repopulate a signed-out device: drafts list, attendance body, medical caseload', async () => {
  // Other coaches' drafts — reply lands after sign-out.
  let s = sandbox({ noDrafts: true, hold: ['GET /api/publish?type=drafts'] });
  const d = s.drafts(); await s.settle(); assert.equal(s.held.length, 1, 'baseline: the drafts read is out');
  await s.signOut(); s.release(); await d;
  assert.equal(s.snap().drafts, null, 'the drafts reply for the account that left is discarded');
  // Attendance — the HEADERS arrived before sign-out, the BODY after (CD-110 reviewer LOW-1).
  s = sandbox({ noAttendance: true, holdBody: ['GET /api/publish?resource=attendance'] });
  const a = s.attendance(true); await s.settle(); assert.equal(s.held.length, 1, 'baseline: the body is still streaming');
  await s.signOut(); s.release(); await a;
  assert.equal(s.snap().attendance, null, 'the register is not rebuilt on a signed-out device');
  // Medical — a medic who also plays (player view: the group guard cannot catch this one), reply lands after sign-out.
  s = sandbox({ medicalLoaded: false, hold: ['GET /api/publish?resource=medical'], permissions: ['medical_access'], state: { activeView: 'player' } });
  const m = s.medical(); await s.settle(); assert.equal(s.held.length, 1, 'baseline: the caseload read is out');
  await s.signOut(); assert.deepEqual(s.state.medicalRecords, {}, 'baseline: sign-out emptied the caseload');
  s.release(); await m;
  assert.deepEqual(s.state.medicalRecords, {}, 'the caseload reply for the account that left is not persisted');
  assert.equal(s.snap().sharedMedical.loaded, false, 'nor held in memory');
  // Performance assignments — the athlete's own profile is PERSISTED from the reply.
  s = sandbox({ hold: ['GET /api/publish?resource=performance'] });
  s.snap().perfAssign.loaded = false;
  const pf = s.perf(); await s.settle(); assert.equal(s.held.length, 1, 'baseline: the Performance read is out');
  await s.signOut(); assert.equal(s.snap().perfProfile, null, 'baseline: sign-out emptied the athlete profile');
  s.release(); await pf;
  assert.equal(s.snap().perfAssign.loaded, false, 'the Performance reply for the account that left is not adopted'); assert.deepEqual(s.snap().perfAssign.athletes, []);
  assert.equal(s.snap().perfProfile, null, 'and the athlete profile it carried is not persisted');
  // Pending join requests — requester names and addresses.
  s = sandbox({ hold: ['GET /api/identity'] });
  const rq = s.requests(); await s.settle(); assert.equal(s.held.length, 1, 'baseline: the requests read is out');
  await s.signOut(); assert.deepEqual(s.snap().pendingRequests, [], 'baseline: sign-out emptied the requests');
  s.release(); await rq;
  assert.deepEqual(s.snap().pendingRequests, [], 'the requests reply for the account that left is not adopted');
});

test('K — "Log out & clear this device" also remembers a logout the server did not confirm, after the wipe', async () => {
  const s = sandbox({ server: { logout: 'throw' } });
  s.localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', '{}'); s.localStorage.setItem('_pushLastSubscribed', '1'); s.localStorage.setItem('other-app', 'x');
  await s.clearDevice();
  assert.equal(s.win.location.replaced, '/', 'the page reloads to the front door');
  assert.equal(s.localStorage.getItem('coach-eye-real-workflow-mvp-state-v1'), null, 'app data is wiped');
  assert.equal(s.localStorage.getItem('_pushLastSubscribed'), null); assert.equal(s.localStorage.getItem('other-app'), 'x', 'nothing else is touched');
  assert.equal(s.pending(), true, 'the unconfirmed logout survives the wipe, so the next boot finishes it instead of restoring the cookie');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Hardening (CD-110 Loop 3) — the marker leads the request; stale attempts are inert;
// clear-device is local-first; a restore resets before it adopts
// ═══════════════════════════════════════════════════════════════════════════════

test('N — the marker is armed BEFORE the logout request leaves, so a tab closed mid-flight cannot lose it', async () => {
  const s = sandbox({ hold: ['POST identity:logout'] });
  const done = s.signOut();
  await s.settle();
  assert.equal(s.held.length, 1, 'baseline: the logout call is out, unanswered');
  assert.equal(s.pending(), true, 'the logout is already remembered while its request is in flight');
  s.release(); await done;
  assert.equal(s.pending(), false, 'and forgotten once the server confirms it');
});

test('O — the logout request asks the browser to keep it alive across the page closing', async () => {
  const s = sandbox();
  await s.signOut();
  const logout = s.calls.find(c => c.action === 'logout');
  assert.ok(logout, 'baseline: a logout was sent');
  assert.equal(logout.keepalive, true, 'sent with keepalive, so closing the tab does not abandon it');
});

test('P — an old logout attempt is inert once a new session exists: a late failure cannot re-arm the marker, a late success cannot clear a newer one', async () => {
  // Late FAILURE after the next person logged in.
  let s = sandbox({ hold: ['POST identity:logout'] });
  const d1 = s.signOut(); await s.settle(); assert.equal(s.held.length, 1);
  await s.login();                                   // the next person's session: the marker is cleared
  assert.equal(s.pending(), false); assert.equal(s.snap().uid, NEXT.id);
  s.release(false); await d1;                        // the stalled logout for the previous person finally fails
  assert.equal(s.pending(), false, 'the failure of the OLD attempt does not re-arm the marker (it would have destroyed the new session at the next boot)');
  // Late SUCCESS after a NEWER sign-out whose own logout is still owed.
  s = sandbox({ hold: ['POST identity:logout'] });
  const d2 = s.signOut(); await s.settle(); assert.equal(s.held.length, 1);
  await s.login();
  s.cfg.hold = []; s.server.logout = { status: 503, body: { ok: false } };
  await s.signOut();                                 // the newer sign-out: its logout is refused and remembered
  assert.equal(s.pending(), true, 'baseline: the newer logout is owed');
  s.release(); await d2;                             // the OLD attempt now succeeds
  assert.equal(s.pending(), true, 'the old attempt\'s success does not clear the newer sign-out\'s marker');
});

test('Q — "Log out & clear this device" clears the local session at once, wipes within a bounded wait, and remembers an unconfirmed logout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = sandbox({ hold: ['POST identity:logout'] });
  s.localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', '{}'); s.localStorage.setItem('other-app', 'x');
  const p = s.clearDevice();
  await s.settle();
  assert.equal(s.held.length, 1, 'baseline: the logout call is out, unanswered');
  assert.equal(s.signedOut(), true, 'the device is signed out before the server answers');
  assert.ok(!authenticatedMarkupRemains(s), 'the authenticated shell is gone');
  assert.equal(s.pending(), true, 'the logout is remembered before its request even left');
  assert.ok(s.counts.saves.includes('Signed out'), 'the blank marker is PERSISTED at once, so a tab closed inside the wait boots signed out');
  assert.ok(s.snap().epoch > 0, 'the club epoch advanced: a session check landing inside the wait is discarded, not repainted');
  assert.equal(s.win.location.replaced, null, 'the reload waits, briefly, for the server');
  t.mock.timers.tick(2000); await s.settle();
  assert.equal(s.win.location.replaced, '/', 'the bounded wait ran out: wiped and reloaded regardless');
  assert.equal(s.localStorage.getItem('coach-eye-real-workflow-mvp-state-v1'), null, 'app data wiped'); assert.equal(s.localStorage.getItem('other-app'), 'x');
  assert.equal(s.pending(), true, 'the unconfirmed logout survives the wipe for the next boot to finish');
  s.release(); await p;
  t.mock.timers.reset();
});

test('R — a restore naming a different person than the persisted marker resets BEFORE it adopts, so nothing the adoption starts is discarded', async () => {
  const s = sandbox({ currentUserId: 'u-other', contextPending: true,
                      state: { users: [COACH, { id: 'u-other', role: 'coach', name: 'Other' }] },
                      server: { session: AUTH_200(COACH, { operational: { staff: { groups: [{ id: 'grp_initial', name: 'Seniors' }], defaultGroupId: 'grp_initial' } } }) } });
  await s.check();
  const n = s.snap();
  assert.equal(n.uid, COACH.id, 'the server\'s user is adopted');
  assert.ok(s.counts.renderEpochs.length >= 1, 'baseline: the adoption repainted (operational context resolved)');
  assert.ok(s.counts.renderEpochs.every(e => e === n.epoch), `every render the adoption ran saw the FINAL epoch (saw ${JSON.stringify(s.counts.renderEpochs)}, final ${n.epoch}): no reset follows the adoption, so what those renders start is not discarded`);
  assert.equal(n.hiddenChatAuth, '', 'the hidden-section chat latch is released with the identity, so the restored person\'s conversations are requested at once');
  assert.ok(s.counts.saves.includes('Server session restored'));
});

// ═══════════════════════════════════════════════════════════════════════════════
// Source pins — the places the behaviour above has to reach
// ═══════════════════════════════════════════════════════════════════════════════

test('L — SOURCE: a sign-out in another tab forgets this tab\'s identity and club caches too', () => {
  const at = src.search(/window\.addEventListener\(["']storage["']/); assert.ok(at > 0, 'the other-tab listener exists');
  const tab = src.slice(at, at + 3000);
  assert.match(tab, /forgetClubCaches\(\)/, 'club caches'); assert.match(tab, /resetIdentityScopedState\(\)/, 'identity caches');
});

test('M — SOURCE: one cache list for both transitions; every path that creates a session clears a remembered logout; reconnecting delivers it', () => {
  assert.match(stripComments(fn('resetClubScopedState')), /forgetClubCaches\(\)/, 'the club transition');
  assert.match(stripComments(fn('settingsSignOut')), /forgetClubCaches\(\)/, 'sign-out');
  for (const f of ['loginIdentityAccount', 'devLogin', 'clubWizFinish', 'acceptInvite']) assert.match(stripComments(fn(f)), /logoutPendingSet\(false\)/, `${f} creates a new session`);
  assert.match(src, /addEventListener\('online',[^\n]*\n?[^\n]*logoutPending\(\)[^\n]*deliverLogout\(\)/, 'coming back online finishes a remembered logout');
});
