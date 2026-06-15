import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileStore } from '../persistence/file-store.js';
import { createSessionManager } from '../session.js';
import { createAppleAuth } from '../auth.js';
import { createIdentityPlatform } from '../../../lib/identity-platform/index.js';
import { IdentityPlatformSourceAdapter, createTravellerIdentityPlatform } from '../../../lib/traveller-identity-platform/index.js';

function freshDir() { return mkdtempSync(join(tmpdir(), 'travel-auth-')); }

// Deterministic clock for session tests.
function fixedClock(startMs) {
  let nowMs = startMs;
  const fn = () => nowMs;
  fn.advance = ms => { nowMs += ms; };
  return fn;
}

function buildAuthStack({ store } = {}) {
  const identityPlatform = createIdentityPlatform();
  const travellerIdentityPlatform = createTravellerIdentityPlatform({
    identitySource: new IdentityPlatformSourceAdapter({ identityPlatform }),
  });
  const sessionManager = createSessionManager({ store });
  // Fake Apple verifier: token "apple:<sub>:<email>" -> claims.
  const appleVerifier = async (token) => {
    const [, sub, email] = token.split(':');
    return { sub, email };
  };
  const auth = createAppleAuth({ identityPlatform, travellerIdentityPlatform, sessionManager, store, appleVerifier });
  return { identityPlatform, travellerIdentityPlatform, sessionManager, auth };
}

// ---------------------------------------------------------------------------
// Session manager
// ---------------------------------------------------------------------------
test('session manager issues, resolves, expires, and revokes tokens', () => {
  const clock = fixedClock(1_000_000);
  const sm = createSessionManager({ clock, ttlMs: 1000 });
  const s = sm.createSession('idn_1');
  assert.ok(s.token.startsWith('sess_'));
  assert.equal(sm.requireTraveller(s.token), 'idn_1');

  clock.advance(1500); // past TTL
  assert.equal(sm.resolveSession(s.token), null);
  assert.throws(() => sm.requireTraveller(s.token), err => err.code === 'UNAUTHENTICATED');

  const s2 = createSessionManager({ clock }).createSession('idn_2');
  assert.ok(s2.token);
});

test('sessions survive a reload from the durable store', () => {
  const dir = freshDir();
  const s = createSessionManager({ store: new FileStore(dir) }).createSession('idn_1');
  // fresh manager + store from same dir
  const sm2 = createSessionManager({ store: new FileStore(dir) });
  assert.equal(sm2.requireTraveller(s.token), 'idn_1');
  assert.equal(sm2.revokeSession(s.token), true);
  assert.equal(sm2.resolveSession(s.token), null);
});

// ---------------------------------------------------------------------------
// Sign in with Apple (injectable verifier) -> identity-platform + session
// ---------------------------------------------------------------------------
test('first Apple sign-in creates a canonical PERSON+TRAVELLER and a session', async () => {
  const { auth, sessionManager, identityPlatform } = buildAuthStack();
  const result = await auth.signInWithApple('apple:appleuser123:mei@example.com', { displayName: 'Mei' });

  assert.ok(result.token);
  assert.equal(result.traveller.isTraveller, true);
  assert.equal(result.traveller.displayName, 'Mei');
  assert.equal(sessionManager.requireTraveller(result.token), result.traveller.travellerId);
  // identity really exists with TRAVELLER role + PERSON type
  const view = await identityPlatform.readIdentity(result.traveller.travellerId, { view: 'public' });
  assert.equal(view.type, 'PERSON');
  assert.ok(view.roles.includes('TRAVELLER'));
});

test('repeat Apple sign-in resolves the SAME traveller (stable link)', async () => {
  const dir = freshDir();
  const stack = buildAuthStack({ store: new FileStore(dir) });
  const first = await stack.auth.signInWithApple('apple:sub_stable:x@y.com');

  // a fresh auth stack over the same store (simulated restart) returns same traveller
  const stack2 = buildAuthStackOverStore(dir, stack.identityPlatform);
  const second = await stack2.auth.signInWithApple('apple:sub_stable:x@y.com');
  assert.equal(second.traveller.travellerId, first.traveller.travellerId);
  assert.notEqual(second.token, first.token); // new session each sign-in
});

// helper: rebuild an auth stack over an existing store + identity platform (link persists; identities in-memory here, so reuse the same identityPlatform)
function buildAuthStackOverStore(dir, identityPlatform) {
  const travellerIdentityPlatform = createTravellerIdentityPlatform({
    identitySource: new IdentityPlatformSourceAdapter({ identityPlatform }),
  });
  const store = new FileStore(dir);
  const sessionManager = createSessionManager({ store });
  const appleVerifier = async (token) => { const [, sub, email] = token.split(':'); return { sub, email }; };
  const auth = createAppleAuth({ identityPlatform, travellerIdentityPlatform, sessionManager, store, appleVerifier });
  return { auth };
}

test('rejects invalid tokens and unconfigured verifier', async () => {
  const { auth } = buildAuthStack();
  await assert.rejects(() => auth.signInWithApple(''), err => err.code === 'VALIDATION_FAILED');

  const identityPlatform = createIdentityPlatform();
  const travellerIdentityPlatform = createTravellerIdentityPlatform({ identitySource: new IdentityPlatformSourceAdapter({ identityPlatform }) });
  const noVerifier = createAppleAuth({ identityPlatform, travellerIdentityPlatform, sessionManager: createSessionManager({}) });
  await assert.rejects(() => noVerifier.signInWithApple('anytoken'), err => err.code === 'AUTH_NOT_CONFIGURED');
});
