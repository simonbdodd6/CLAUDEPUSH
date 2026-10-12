/**
 * Session check during a server outage (cd-104).
 *
 * During the Upstash 401 outage the session endpoint answered HTTP 503
 * (storage unavailable), and checkServerSession() treated every non-OK answer
 * as a definitive refusal: _serverAuthState = 'anon', the live board stopped,
 * and render() emptied the authenticated shell — every signed-in user was shown
 * the login screen although nobody's session had ended.
 *
 * The rule now: a 5xx means the server could not ANSWER, which is the offline
 * case ('unknown'), not a refusal. A refusal already learned ('anon') is never
 * undone by a 5xx — only a 200 lifts it. 401 / 403 / other 4xx still sign the
 * device out exactly as before, and a network failure is still 'unknown'.
 *
 * The real checkServerSession() and sessionSignedOut() are extracted from
 * index.html and run against an injected fetch. "The shell is cleared" is
 * observed the way render() decides it: a render() while sessionSignedOut() is
 * true empties every authenticated section (pinned by the SOURCE test below).
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

// reply: { status, body } for an HTTP answer, or 'network' for a thrown fetch.
function sessionScope({ authState = 'unknown', currentUserId = 'u-coach', reply }) {
  const body = `
    "use strict";
    const state = { users: [], currentUserId: ${JSON.stringify(currentUserId)}, players: [] };
    let _serverAuthState = ${JSON.stringify(authState)};
    const calls = { stopLive: 0, renders: 0, shellCleared: 0 };
    function availabilityStopLive() { calls.stopLive++; }
    // render() empties every authenticated section when sessionSignedOut() is true.
    function render() { calls.renders++; if (sessionSignedOut()) calls.shellCleared++; }
    function adoptIdentityPayload() {}
    function saveState() {} function renderAuthBanner() {} function renderNav() {}
    function renderOperationalGroupSwitcher() {}
    function resetIdentityScopedState() {}
    function hydrateSessionPlayerRecord() { return false; }
    function membershipPlays() { return false; }
    function loadPublishedStateForPlayer() { return Promise.resolve(); }
    function loadCoachDraft() { return Promise.resolve(); }
    function isCoach() { return true; }
    function rosterIsRead() { return true; }
    function loadRosterFromServer() { return Promise.resolve(); }
    let _rosterReadOut = false, _playerAvailFetched = false, _publishedStateLoadedAt = 0;
    ${extractFn('sessionSignedOut')}
    ${'async ' + extractFn('checkServerSession')}
    return { state, calls, checkServerSession, sessionSignedOut, authState: () => _serverAuthState };
  `;
  const fetch = async () => {
    if (reply === 'network') throw new TypeError('Failed to fetch');
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => (reply.body || {}) };
  };
  return new Function('fetch', body)(fetch);
}

async function run(opts) {
  const s = sessionScope(opts);
  await s.checkServerSession();
  return { auth: s.authState(), signedOut: s.sessionSignedOut(), ...s.calls, currentUserId: s.state.currentUserId };
}

const SERVER_ERRORS = [500, 502, 503, 504];
const REFUSALS = [401, 403, 400];

for (const status of SERVER_ERRORS) {
  test(`HTTP ${status} on a signed-in device at boot: unknown, the shell stays`, async () => {
    const r = await run({ authState: 'unknown', reply: { status, body: { ok: false, error: 'Storage temporarily unavailable' } } });
    assert.equal(r.auth, 'unknown', 'a server that cannot answer is not a refusal');
    assert.equal(r.signedOut, false, 'the device is not signed out');
    assert.equal(r.shellCleared, 0, 'the authenticated shell is not emptied');
    assert.equal(r.stopLive, 0, 'the live board is not torn down');
    assert.equal(r.currentUserId, 'u-coach', 'the persisted marker is untouched');
  });

  test(`HTTP ${status} after 'authed': unknown, never anon`, async () => {
    const r = await run({ authState: 'authed', reply: { status } });
    assert.equal(r.auth, 'unknown');
    assert.equal(r.signedOut, false);
    assert.equal(r.shellCleared, 0, 'no repaint into the signed-out presentation');
    assert.equal(r.stopLive, 0);
  });

  test(`HTTP ${status} after 'anon': the refusal stands`, async () => {
    const r = await run({ authState: 'anon', reply: { status } });
    assert.equal(r.auth, 'anon', 'a 5xx never undoes a refusal already learned');
    assert.equal(r.signedOut, true, 'the device stays signed out');
    assert.equal(r.renders, 0, 'nothing repaints the authenticated shell back in');
  });
}

for (const status of REFUSALS) {
  test(`HTTP ${status} after 'authed': signed out, the shell is cleared, the live board stops`, async () => {
    const r = await run({ authState: 'authed', reply: { status, body: { ok: false, error: 'No active session' } } });
    assert.equal(r.auth, 'anon', 'a 4xx is a refusal');
    assert.equal(r.signedOut, true);
    assert.equal(r.shellCleared, 1, 'render() empties the authenticated sections');
    assert.equal(r.stopLive, 1, 'availabilityStopLive() runs on the confirmed sign-out (Build 129)');
  });
}

test('HTTP 401 on a signed-in device at boot: signed out and the shell is cleared', async () => {
  const r = await run({ authState: 'unknown', reply: { status: 401 } });
  assert.equal(r.auth, 'anon');
  assert.equal(r.signedOut, true);
  assert.equal(r.shellCleared, 1);
  assert.equal(r.stopLive, 1);
});

test('network failure after authed: unknown, the shell stays (offline behaviour unchanged)', async () => {
  const r = await run({ authState: 'authed', reply: 'network' });
  assert.equal(r.auth, 'unknown');
  assert.equal(r.signedOut, false);
  assert.equal(r.shellCleared, 0);
  assert.equal(r.stopLive, 0);
});

test('network failure after anon: unknown (pre-existing offline behaviour, pinned as is)', async () => {
  const r = await run({ authState: 'anon', reply: 'network' });
  assert.equal(r.auth, 'unknown');
});

test('only a 200 lifts a refusal: anon → authed', async () => {
  const r = await run({ authState: 'anon', reply: { status: 200, body: { ok: true } } });
  assert.equal(r.auth, 'authed');
  assert.equal(r.signedOut, false);
});

test('SOURCE: render() empties the authenticated sections whenever sessionSignedOut() is true', () => {
  const body = extractFn('render');
  assert.match(body, /if \(sessionSignedOut\(\)\) \{\s*\n\s*safeRender\(null,\s*\(\) => clearAuthenticatedSections\(\)\);/,
    'the shell-clearing gate the tests above observe through render()');
  const check = extractFn('checkServerSession');
  assert.match(check, /\} else if \(res\.status >= 500\) \{[\s\S]*?if \(_serverAuthState !== 'anon'\) _serverAuthState = 'unknown';\s*\n\s*\} else \{\s*\n\s*_serverAuthState = 'anon';/,
    'the 5xx branch sits between the 200 branch and the refusal branch');
});
