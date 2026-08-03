/**
 * RC4.3A — First-Contact Polish.
 *
 * Covers the four first-contact improvements:
 *  1. Player join success → persistent "You're on the list" state (source-scan).
 *  2. Distinct invite-link messages (inviteLinkMessage — extracted + run).
 *  3. Friendly auth errors (friendlyAuthError — extracted + run) + QA-toast dev guard.
 *  4. Login panel cleanup (jargon / Switch / device-clear / prompt removed — source-scan).
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
const { friendlyAuthError, inviteLinkMessage } = new Function(`"use strict";
  ${extractFn('friendlyAuthError')}
  ${extractFn('inviteLinkMessage')}
  return { friendlyAuthError, inviteLinkMessage };
`)();

// ── Item 3: friendly auth-error mapper ────────────────────────────────────────
test('auth error: 401 → incorrect email/password', () => {
  assert.equal(friendlyAuthError(401, 'login'), 'The email or password is incorrect.');
  assert.equal(friendlyAuthError({ status: 401 }, 'login'), 'The email or password is incorrect.');
});
test('auth error: 429 → too many attempts', () => {
  assert.equal(friendlyAuthError(429, 'login'), 'Too many attempts. Please wait a few minutes and try again.');
});
test('auth error: network/fetch failure → connection message', () => {
  assert.equal(friendlyAuthError(new TypeError('Failed to fetch'), 'login'), "We couldn't connect. Check your internet connection and try again.");
  assert.equal(friendlyAuthError({ message: 'NetworkError when attempting to fetch resource' }, 'login'), "We couldn't connect. Check your internet connection and try again.");
});
test('auth error: unknown → generic, never raw text', () => {
  const out = friendlyAuthError(new Error('TypeError: undefined is not an object (evaluating x.y)'), 'login');
  assert.equal(out, 'Something went wrong. Please try again.');
  assert.doesNotMatch(out, /undefined|TypeError|evaluating/);
});
test('auth error: context tunes 404 / 409 / 410 / 403', () => {
  assert.equal(friendlyAuthError(404, 'invite'), "We couldn't find this invite. Check the link or ask your coach for a new one.");
  assert.equal(friendlyAuthError(404, 'login'), "We couldn't find an account for that email.");
  assert.equal(friendlyAuthError(409, 'invite'), 'This invite has already been used. Sign in with the account created from it.');
  assert.equal(friendlyAuthError(409, 'login'), 'An account with that email already exists — try signing in.');
  assert.equal(friendlyAuthError(410, 'invite'), 'This invite has expired. Ask your coach for a new link.');
  assert.match(friendlyAuthError(403, 'join'), /approve/i);
});
test('auth error: never leaks a raw server string for a known status', () => {
  // Even if the thrown error carries a raw server message, only the mapped copy shows.
  const err = new Error('ECONNREFUSED 127.0.0.1:6379'); err.status = 401;
  assert.equal(friendlyAuthError(err, 'login'), 'The email or password is incorrect.');
});

// ── Item 2: distinct invite-link messages ─────────────────────────────────────
test('invite link: 404 → not found', () => {
  assert.equal(inviteLinkMessage(404, { valid: false }), "We couldn't find this invite. Check the link or ask your coach for a new one.");
});
test('invite link: 410 revoked vs expired are distinct', () => {
  assert.equal(inviteLinkMessage(410, { error: 'This invite has been revoked' }), 'This invite was cancelled by your coach.');
  assert.equal(inviteLinkMessage(410, { error: 'This invite link has expired' }), 'This invite has expired. Ask your coach for a new link.');
});
test('invite link: already-accepted single-use → sign-in message', () => {
  assert.equal(inviteLinkMessage(200, { valid: true, status: 'accepted', group: false }), 'This invite has already been used. Sign in with the account created from it.');
});
test('invite link: a valid open group invite is not mislabelled as used', () => {
  // (This path is only reached for non-claimable invites; a live group invite opens the
  // claim modal instead — asserting the accepted-branch does not fire for a group link.)
  assert.notEqual(inviteLinkMessage(200, { valid: true, status: 'open', group: true }), 'This invite has already been used. Sign in with the account created from it.');
});

// ── RC4.6F: server trouble is NOT "invite not found" ─────────────────────────
// A storage-less/failing server returns 5xx; blaming the link sends the player
// to their coach for a new invite that will fail identically. The copy must say
// retry, and the token must stay in the URL so refresh retries it.
test('invite link: 5xx → temporary-server copy, not "not found"', () => {
  for (const status of [500, 502, 503]) {
    const msg = inviteLinkMessage(status, {});
    assert.match(msg, /server had a problem|try again/i, `status ${status} says retry`);
    assert.doesNotMatch(msg, /couldn't find this invite/i, `status ${status} does not blame the link`);
  }
});
test('invite link: 429 → wait-and-retry copy', () => {
  assert.equal(inviteLinkMessage(429, {}), 'Too many attempts. Please wait a few minutes and try again.');
});
test('invite claim keeps the token in the URL on 5xx/429 (source-scan)', () => {
  assert.match(src, /if \(!\(res\.status >= 500 \|\| res\.status === 429\)\) window\.history\.replaceState/,
    'checkInviteParam only clears the invite token for definitive (non-5xx/429) outcomes');
});

// ── Item 1: persistent join success state (source-scan) ───────────────────────
test('join success sets the persistent "joined" state, not a fleeting toast', () => {
  const fn = extractFn('joinSquad');
  assert.match(fn, /authTab = 'joined'/, 'joinSquad enters the joined state');
  assert.doesNotMatch(fn, /Join request sent — wait for coach approval/, 'old fleeting toast removed');
  assert.ok(src.includes("You're on the list"), 'confirmation copy present');
  assert.ok(src.includes('Back to sign in'), 'one clear action present');
  assert.ok(src.includes("authTab === 'joined'"), 'joined render branch present');
});

// ── Item 4: login panel cleanup (source-scan) ─────────────────────────────────
test('login panel: developer jargon and bug-documenting copy removed', () => {
  assert.ok(!src.includes('Canonical accounts only. Duplicate local identities are hidden.'), 'jargon removed');
  assert.ok(!src.includes('one wrong letter shows'), 'bug-documenting help text removed');
});
test('login panel: redundant Switch tab trigger removed', () => {
  assert.ok(!src.includes("setAuthTab('switch')\" style=\"padding:3px 7px;font-size:11px;white-space:nowrap\">Switch<"), 'Switch tab button removed from account bar');
});
test('forgot-password uses an inline field, never a native prompt()', () => {
  const fn = extractFn('requestPasswordReset');
  assert.doesNotMatch(fn, /prompt\(['"]/, 'no native prompt() call with a message');
  assert.match(fn, /identityLoginEmail/, 'reads the inline email field');
});

// ── Item 3: QA/self-test toasts gated behind the existing dev flag ────────────
test('availability self-test no-ops (no toast) for a normal production user', () => {
  const fn = extractFn('devRunAvailabilitySelfTest');
  assert.match(fn, /if \(!window\._devLoginEnabled\) return;/, 'dev-flag guard present');
  // The guard precedes any Self-test PASS/FAIL toast in the function body.
  const guardIdx = fn.indexOf('_devLoginEnabled');
  const toastIdx = fn.indexOf('Self-test');
  assert.ok(guardIdx > -1 && (toastIdx === -1 || guardIdx < toastIdx), 'guard runs before any self-test toast');
});
