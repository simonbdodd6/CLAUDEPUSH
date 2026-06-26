/**
 * Phase 25E — the authenticated coach (server session) must drive currentUser,
 * Availability and Messaging — never a stale/placeholder coach-demo.
 *
 * Investigation result: the identity flow is already CORRECT. A real created-club
 * coach (user_…) resolves to their own id; coach-demo only appears when the server
 * session itself IS coach-demo (Boitsfort legacy / COACH_DEMO_EMAIL login). The
 * coach-demo fallbacks are legacy-compat and intentionally preserved. These tests
 * are regression guards proving the authenticated coach is used end to end.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's'));
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start + m[0].length - 1;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(start, i + 1);
}

// ── client identity scope (real extracted functions + faithful stubs) ─────────
function clientScope({ users = [], currentUserId = '', sessionPayload = null } = {}) {
  const body = `
    "use strict";
    const state = { users: ${JSON.stringify(users)}, currentUserId: ${JSON.stringify(currentUserId)}, players: [] };
    let _serverAuthState = 'unknown';
    let _myPermissions = [], _myMemberships = [];
    const _chatStateModule = null;
    function adoptIdentityPayload() {}
    function saveState() {} function renderAuthBanner() {} function renderNav() {}
    function getPlayer() { return {}; }
    function canonicalSwitchAccounts() { return []; }
    const identityCompactKey = v => String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
    const canonicalIdentityNameKey = v => { const c = identityCompactKey(v); return ({simontestplayer:'simontestplayer'})[c] || c; };
    const isPermanentPlayerUserId = v => Boolean(v) && String(v).startsWith('user_');
    globalThis.fetch = async () => ({ ok: ${sessionPayload ? 'true' : 'false'}, json: async () => (${JSON.stringify(sessionPayload || {})}) });
    ${'async ' + extractFn('checkServerSession')}
    ${extractFn('canonicalAccountForUserId')}
    ${extractFn('currentUser')}
    ${extractFn('canonicalPlayerIdForUser')}
    ${extractFn('ensureCanonicalPlayerRecord')}
    ${extractFn('hydrateSessionPlayerRecord')}
    function loadPublishedStateForPlayer() { return Promise.resolve(); }
    function render() {}
    let _playerAvailFetched = false, _publishedStateLoadedAt = 0;
    ${extractFn('chatMe')}
    // console used by chatMe
    const console = { log() {} };
    return { state, checkServerSession, currentUser, canonicalPlayerIdForUser, chatMe,
             authState: () => _serverAuthState };
  `;
  return new Function('globalThis', body)(globalThis);
}

const REAL_COACH_SESSION = {
  user: { id: 'user_real_coach_1', displayName: 'Real Coach', email: 'real@club.test', role: 'coach' },
  teamMember: { userId: 'user_real_coach_1', role: 'coach', teamId: 'trial-club-4' },
};

test('checkServerSession replaces a STALE coach-demo with the authenticated coach', async () => {
  const scope = clientScope({
    users: [{ id: 'coach-demo', role: 'coach', name: 'Simon Coach' }],
    currentUserId: 'coach-demo',          // stale localStorage placeholder
    sessionPayload: REAL_COACH_SESSION,
  });
  await scope.checkServerSession();
  assert.equal(scope.state.currentUserId, 'user_real_coach_1', 'adopts the authenticated coach');
  assert.notEqual(scope.state.currentUserId, 'coach-demo');
  assert.equal(scope.currentUser().id, 'user_real_coach_1');
  assert.equal(scope.currentUser().role, 'coach');
  assert.equal(scope.authState(), 'authed');
});

test('Messaging (chatMe) uses the authenticated coach, not coach-demo', async () => {
  const scope = clientScope({ users: [{ id: 'coach-demo', role: 'coach', name: 'Simon Coach' }], currentUserId: 'coach-demo', sessionPayload: REAL_COACH_SESSION });
  await scope.checkServerSession();
  const me = scope.chatMe();
  assert.equal(me.id, 'user_real_coach_1', 'chatMe id is the authenticated coach');
  assert.equal(me.userId, 'user_real_coach_1');
  assert.notEqual(me.id, 'coach-demo');
});

test('canonicalPlayerId resolves correctly: null for coach, id for players', () => {
  const scope = clientScope({});
  assert.equal(scope.canonicalPlayerIdForUser({ id: 'user_real_coach_1', role: 'coach' }), null, 'coach has no canonicalPlayerId');
  assert.equal(scope.canonicalPlayerIdForUser({ id: 'user_p1', role: 'player' }), 'user_p1', 'permanent player → own user id');
  assert.equal(scope.canonicalPlayerIdForUser({ id: 'player-compat', role: 'player', playerId: 'inv-XYZ' }), 'inv-XYZ', 'compat player → invite id');
});

test('coach-demo is preserved as a legitimate authenticated identity (NOT removed)', async () => {
  // When the server session genuinely IS coach-demo (Boitsfort legacy login),
  // currentUser must remain coach-demo — the fallback is correct, not a bug.
  const scope = clientScope({
    users: [{ id: 'coach-demo', role: 'coach', name: 'Simon Coach' }],
    currentUserId: '',
    sessionPayload: { user: { id: 'coach-demo', displayName: 'Simon Coach', email: 'simonbdodd@gmail.com', role: 'coach' }, teamMember: { userId: 'coach-demo', role: 'coach', teamId: 'boitsfort-rfc' } },
  });
  await scope.checkServerSession();
  assert.equal(scope.state.currentUserId, 'coach-demo', 'coach-demo session is honoured');
  assert.equal(scope.currentUser().role, 'coach');
});
