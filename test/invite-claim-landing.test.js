/**
 * WHERE A CLAIM LANDS (Nick onboarding loop 1).
 *
 * acceptInvite() computes `claimedIsStaff` from the server's answer, then
 * decided the landing view and the loaders with `isStaffRole ? … : …` — the
 * FUNCTION itself, always truthy. Every claimer, players included, took the
 * staff branch: coach view, coach section, squad chat, the roster and draft
 * loaders (which return early for a non-coach) and never their own
 * loadPublishedStateForPlayer. showSection() later coerced the view back, so
 * the player setup never ran and nothing proved it should.
 *
 * The REAL acceptInvite runs here against a stubbed network and counted
 * stubs for everything it calls, so the branch itself is observed — not what
 * showSection() repairs afterwards.
 */
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
/** The app's own staff classification, verbatim. */
const staffRoles = /const STAFF_ROLES = \[[^\]]*\];\n\s*const isStaffRole = [^\n]*\n/.exec(src)?.[0];
assert.ok(staffRoles, 'STAFF_ROLES + isStaffRole found');

const CLUB = 'club_landing';
const PLAYER = { ok: true, user: { id: 'u_pat', role: 'player', displayName: 'Pat Player', email: 'pat@club.test' },
  teamMember: { id: 'tm_pat', teamId: CLUB, userId: 'u_pat', role: 'player', status: 'active', playerGroupId: 'grp_initial' },
  playerProfile: { id: 'pp_pat', displayName: 'Pat Player', position: '9 — Scrum half' } };
const COACH = { ok: true, user: { id: 'u_casey', role: 'coach', displayName: 'Casey Coach', email: 'casey@club.test' },
  teamMember: { id: 'tm_casey', teamId: CLUB, userId: 'u_casey', role: 'coach', staffLevel: 'head', status: 'active' },
  playerProfile: null };

/**
 * Run the REAL acceptInvite to completion. `answer` is the server's claim
 * response; `invite` is what the link said (role / group); `state` is the
 * device state before the claim.
 */
async function claim({ answer, invite = { role: 'player', group: true }, state: initial = {} } = {}) {
  const trace = [];                                   // ordered calls, with arguments that matter
  const els = {
    'invite-first-input': { value: 'Pat' }, 'invite-last-input': { value: 'Player' }, 'invite-name-input': { value: 'Casey Coach' },
    'invite-email-input': { value: 'who@club.test' }, 'invite-password-input': { value: 'longEnough123' },
    'invite-position-input': { value: '9 — Scrum half', focus() {} }, 'invite-position-error': { hidden: true },
    'invite-modal': { remove() { trace.push('modal-removed'); } },
  };
  const document = { getElementById: id => els[id] || null, querySelector: () => ({ disabled: false, textContent: '' }) };
  const fetch = async (url, opts) => {
    trace.push(`POST ${url} ${JSON.parse(opts.body).action}`);
    return { ok: true, status: 201, json: async () => structuredClone(answer) };
  };
  const run = new Function('document', 'fetch', 'CFG', `
    ${staffRoles}
    const trace = CFG.trace;
    const state = Object.assign({ users: [], players: [], currentUserId: '', activeView: '', activeCoachSection: null,
      activePlayerSection: null, selectedChatId: null, selectedPlayerId: null, selectedMessagePlayerId: null }, CFG.state);
    let _inviteData = CFG.invite, _inviteToken = 'TOKEN';
    const window = { history: { replaceState() { trace.push('url-cleared'); } } };
    const Notification = { permission: 'denied' };   // acceptInvite's push prompt (inert here)
    const console = { warn(...a) { trace.push('warn:' + String(a[0])); } };
    const note = name => (...a) => { trace.push(name + (a.length && typeof a[0] === 'string' ? ':' + a[0] : '')); return Promise.resolve(); };
    function showToast(m) { trace.push('toast:' + m); }
    function friendlyAuthError(e) { return String(e?.message || e); }
    function ceDialog() { trace.push('dialog'); return Promise.resolve(false); }
    function adoptClubContext(id) { trace.push('adoptClubContext:' + id); return false; }
    function applyApprovedIdentityLocally(d) { trace.push('applyApprovedIdentityLocally:' + d.user.id); }
    function resetIdentityScopedState() { trace.push('resetIdentityScopedState'); }
    function saveState(label) { trace.push('saveState:' + label); }
    function render() { trace.push('render'); }
    const loadMedicalFromServer = note('loadMedicalFromServer');
    const loadRosterFromServer = note('loadRosterFromServer');
    const loadCoachDraft = note('loadCoachDraft');
    const loadPublishedStateForPlayer = note('loadPublishedStateForPlayer');
    const loadClubConfigFromServer = note('loadClubConfigFromServer');
    const refreshPushSubscriptionMetadata = note('refreshPushSubscriptionMetadata');
    const checkServerSession = note('checkServerSession');
    ${fn('availabilityGroupForPlayer')}
    ${fn('isRecognisedPlayerPosition')}
    ${fn('acceptInvite')}
    return acceptInvite().then(() => ({ state, trace }));`);
  return run(document, fetch, { trace, invite, state: initial });
}
const calls = (trace, name) => trace.filter(t => t === name || t.startsWith(name + ':')).length;

// ── The branch under test ────────────────────────────────────────────────────

test('the landing decision reads the computed classification, not the isStaffRole function', () => {
  const body = fn('acceptInvite');
  assert.doesNotMatch(body, /\bisStaffRole\s*\?/, 'no `isStaffRole ? … : …` — that tested the function object');
  assert.doesNotMatch(body, /if \(isStaffRole\)/, 'no `if (isStaffRole)`');
  assert.match(body, /state\.activeView = claimedIsStaff \? 'coach' : 'player';/);
  assert.equal(body.split('if (claimedIsStaff) {').length - 1, 3, 'identity application, view setup and loaders all branch on claimedIsStaff');
});

test('a PLAYER claim lands in the player view with the player setup and the player loader — and none of the staff loaders', async () => {
  const { state, trace } = await claim({ answer: PLAYER });
  assert.equal(state.activeView, 'player');
  assert.equal(state.activePlayerSection, 'messages');
  assert.equal(state.selectedPlayerId, 'u_pat');
  assert.equal(state.selectedMessagePlayerId, 'u_pat');
  assert.equal(state.selectedChatId, 'coach');
  assert.equal(state.activeCoachSection, null, 'no coach section was chosen for a player');
  assert.equal(state.currentUserId, 'u_pat');
  assert.equal(calls(trace, 'loadPublishedStateForPlayer'), 1, 'the player reads their published state straight away');
  assert.equal(calls(trace, 'loadRosterFromServer'), 0, 'no roster read for a player');
  assert.equal(calls(trace, 'loadCoachDraft'), 0, 'no coach draft read for a player');
  assert.equal(calls(trace, 'applyApprovedIdentityLocally'), 1, 'the player is applied through the roster path');
  assert.equal(state.users.length, 0, 'a player is never injected into state.users as staff');
  // The shared tail still runs for everyone.
  for (const name of ['loadMedicalFromServer', 'loadClubConfigFromServer', 'refreshPushSubscriptionMetadata', 'checkServerSession', 'render'])
    assert.equal(calls(trace, name), 1, name);
  assert.equal(trace.indexOf('adoptClubContext:' + CLUB) < trace.indexOf('applyApprovedIdentityLocally:u_pat'), true,
    'the club context is adopted before any local write');
  assert.match(trace.find(t => t.startsWith('toast:')) || '', /^toast:Welcome Pat!/);
});

test('a STAFF claim keeps the coach view, the coach setup and the staff loaders', async () => {
  const { state, trace } = await claim({ answer: COACH, invite: { role: 'coach', group: false, name: 'Casey Coach', email: 'casey@club.test' } });
  assert.equal(state.activeView, 'coach');
  assert.equal(state.activeCoachSection, 'overview');
  assert.equal(state.selectedChatId, 'squad');
  assert.equal(state.activePlayerSection, null);
  assert.equal(calls(trace, 'loadRosterFromServer'), 1);
  assert.equal(calls(trace, 'loadCoachDraft'), 1);
  assert.equal(calls(trace, 'loadPublishedStateForPlayer'), 0, 'the player loader is not the staff path');
  assert.equal(calls(trace, 'applyApprovedIdentityLocally'), 0);
  assert.deepEqual(state.users.map(u => [u.id, u.role]), [['u_casey', 'coach']], 'staff go into state.users with their role');
});

test('a staff member opening a PLAYER link keeps the staff landing (the server answered with their staff role)', async () => {
  const { state, trace } = await claim({ answer: COACH, invite: { role: 'player', group: true } });
  assert.equal(state.activeView, 'coach');
  assert.equal(calls(trace, 'loadRosterFromServer'), 1);
  assert.equal(calls(trace, 'loadPublishedStateForPlayer'), 0);
});

test('an existing coach section survives a staff claim; a player claim never inherits one', async () => {
  const staff = await claim({ answer: COACH, invite: { role: 'coach', group: false, name: 'Casey Coach' }, state: { activeCoachSection: 'players', selectedChatId: 'dm_1' } });
  assert.equal(staff.state.activeCoachSection, 'players');
  assert.equal(staff.state.selectedChatId, 'dm_1');
  const player = await claim({ answer: PLAYER, state: { activeCoachSection: 'players', selectedChatId: 'dm_1' } });
  assert.equal(player.state.activeView, 'player');
  assert.equal(player.state.selectedChatId, 'coach', 'the player chat is the coach thread');
});
