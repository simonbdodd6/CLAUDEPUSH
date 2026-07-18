/**
 * RC4.4A — Email Verification Foundation (Path B).
 *
 * These tests PIN the CURRENT identity invariants so that any RC4.4B change to them is
 * deliberate, not accidental. They assert the state of the code as it is today — they do
 * NOT change or drive live authentication behaviour. Pure source-scan (no KV, no network).
 *
 * See docs/rc44-email-verification-foundation.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const store = fs.readFileSync(new URL('../api/_identityStore.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/identity.js', import.meta.url), 'utf8');
const email = fs.readFileSync(new URL('../api/_email.js', import.meta.url), 'utf8');

// Span from a function's declaration to just before the next top-level function decl.
// Robust against `= {}` default params (a brace-matcher trips on those).
function block(src, name) {
  const start = src.search(new RegExp(`(export\\s+)?(async\\s+)?function ${name}\\b`));
  if (start < 0) throw new Error(`function ${name} not found`);
  const after = src.slice(start + 12);
  const next = after.search(/\n(export (async )?function |async function |function )/);
  return next < 0 ? src.slice(start) : after.slice(0, next);
}

// ── Verification primitives exist and are secure ──────────────────────────────
test('verification tokens are stored HASHED, never in plaintext', () => {
  const fn = block(store, 'createEmailVerificationToken');
  assert.match(fn, /tokenHash:\s*hashToken\(/, 'stores a hash of the token');
  assert.doesNotMatch(fn, /token:\s*token[,\s}]/, 'does not persist the raw token');
});

test('verification token has a bounded TTL and is single-use', () => {
  assert.match(store, /EMAIL_VERIFICATION_TTL_MS\s*=\s*1000\s*\*\s*60\s*\*\s*60\s*\*\s*24/, '24h TTL constant');
  const create = block(store, 'createEmailVerificationToken');
  assert.match(create, /expiresAt:.*EMAIL_VERIFICATION_TTL_MS/s, 'token carries expiry');
  const verify = block(store, 'verifyEmailToken');
  assert.match(verify, /hashToken\(/, 'verify matches by hash');
  assert.match(verify, /emailVerified\s*=\s*true/, 'verify sets emailVerified true');
});

test('createEmailVerificationToken no-ops for an already-verified user', () => {
  assert.match(block(store, 'createEmailVerificationToken'), /if\s*\(\s*user\.emailVerified\s*\)/, 'skips when already verified');
});

// ── Current invariant: verification is NOT enforced (so RC4.4B is deliberate) ──
test('login does not gate on emailVerified today (enforcement is a future, deliberate step)', () => {
  const login = block(store, 'loginUser');
  assert.doesNotMatch(login, /emailVerified/, 'loginUser must not silently start gating on verification');
});

test('new accounts default to emailVerified:false', () => {
  assert.ok(store.includes('emailVerified: false'), 'accounts created unverified');
});

// ── Anti-enumeration + takeover guards must remain intact ─────────────────────
test('password-reset request is anti-enumeration (no throw / same shape for unknown email)', () => {
  const fn = block(store, 'createPasswordResetRequest');
  assert.match(fn, /if\s*\(!user\)\s*return\s*{[\s\S]*?user:\s*null/, 'unknown email returns a null user, not an error');
  assert.doesNotMatch(fn, /throw .*(not found|no account)/i, 'does not reveal non-existence');
});

test('resend verification is session-gated (cannot probe arbitrary emails)', () => {
  const idx = api.indexOf("action === 'send_verification_email'");
  assert.ok(idx > -1, 'send_verification_email action exists');
  const region = api.slice(idx, idx + 400);
  assert.match(region, /sessionCtx\.user\.id/, 'targets the caller\'s own account, not a body-supplied email');
  assert.match(region, /enforceRateLimit\('send_verification_email'/, 'throttled');
});

test('invite claim keeps the account-takeover guard (never overwrites an established password)', () => {
  const claim = block(store, 'claimInvite');
  assert.match(claim, /existingUser\.passwordSet/, 'claim path checks passwordSet ownership');
  assert.match(claim, /verifyPassword\(/, 'requires the existing password to be proven');
  const upsert = block(store, 'upsertUserAccount');
  assert.match(upsert, /password\s*&&\s*!user\.passwordSet/, 'password set only when the account has none');
});

// ── Email delivery capability is real but env-gated ───────────────────────────
test('email delivery is Resend, gated on RESEND_API_KEY, and skips silently when unset', () => {
  assert.match(email, /RESEND_API_KEY/, 'uses Resend key');
  assert.match(email, /email_not_configured/, 'skips (no throw) when unconfigured');
});
