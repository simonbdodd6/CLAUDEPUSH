// Travel App — Sign in with Apple (M23.0 bridge).
//
// Verifies an Apple identity token and maps the stable Apple user id (`sub`) to
// one canonical identity-platform PERSON with the TRAVELLER role, then issues a
// session. The Apple token VERIFIER is injected: production passes a real
// verifier (validates the JWT against Apple's public JWKS); tests pass a fake.
// The Apple-sub -> traveller link is a PRODUCT concern (the platform stays
// identity-source-agnostic), persisted durably so re-sign-in returns the same
// traveller.

import { clone } from '../../lib/platform-kernel/index.js';

const SYSTEM_ACTOR = { id: 'travel-app', type: 'SYSTEM' };

export class AuthError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.details = details;
  }
}

// Default verifier — intentionally inert. Production injects a real Apple JWKS
// verifier; this makes "unconfigured" an explicit, safe failure rather than a
// silent accept.
async function unconfiguredVerifier() {
  throw new AuthError('AUTH_NOT_CONFIGURED', 'No Apple identity verifier configured');
}

export function createAppleAuth(options = {}) {
  const identityPlatform = options.identityPlatform;
  const travellerIdentityPlatform = options.travellerIdentityPlatform;
  const sessionManager = options.sessionManager;
  if (!identityPlatform || typeof identityPlatform.createIdentity !== 'function') {
    throw new AuthError('CONFIGURATION_ERROR', 'createAppleAuth requires an identityPlatform with createIdentity()');
  }
  if (!travellerIdentityPlatform || typeof travellerIdentityPlatform.assertActiveTraveller !== 'function') {
    throw new AuthError('CONFIGURATION_ERROR', 'createAppleAuth requires a travellerIdentityPlatform port');
  }
  if (!sessionManager || typeof sessionManager.createSession !== 'function') {
    throw new AuthError('CONFIGURATION_ERROR', 'createAppleAuth requires a sessionManager');
  }
  const verifyAppleToken = options.appleVerifier ?? unconfiguredVerifier;
  const store = options.store ?? null;
  const collection = options.collection ?? 'apple_links';

  const memory = [];
  function readLinks() { return store ? store.read(collection) : memory.map(clone); }
  function writeLinks(links) {
    if (store) { store.write(collection, links); return; }
    memory.length = 0; for (const l of links) memory.push(clone(l));
  }
  function findLink(sub) { return readLinks().find(l => l.appleSub === sub) ?? null; }
  function saveLink(appleSub, travellerIdentityId) {
    const links = readLinks();
    links.push({ appleSub, travellerIdentityId });
    writeLinks(links);
  }

  /**
   * Verify an Apple identity token and return an authenticated session.
   * First sign-in creates the canonical traveller; subsequent sign-ins resolve
   * the existing one. Returns { token, traveller }.
   */
  async function signInWithApple(identityToken, signInOptions = {}) {
    if (typeof identityToken !== 'string' || !identityToken.trim()) {
      throw new AuthError('VALIDATION_FAILED', 'identityToken is required');
    }
    const claims = await verifyAppleToken(identityToken);
    const sub = claims && typeof claims.sub === 'string' && claims.sub.trim();
    if (!sub) throw new AuthError('AUTH_INVALID_TOKEN', 'Apple token did not yield a subject');

    let travellerIdentityId;
    const existing = findLink(sub);
    if (existing) {
      travellerIdentityId = existing.travellerIdentityId;
      await travellerIdentityPlatform.assertActiveTraveller(travellerIdentityId); // still a valid traveller
    } else {
      const identity = await identityPlatform.createIdentity({
        type: 'PERSON',
        roles: ['TRAVELLER'],
        publicProfile: { displayName: signInOptions.displayName ?? claims.email ?? 'Traveller' },
        internalProfile: { ssoSubjectRef: sub, email: claims.email ?? null },
      }, SYSTEM_ACTOR);
      travellerIdentityId = identity.id;
      saveLink(sub, travellerIdentityId);
    }

    const session = sessionManager.createSession(travellerIdentityId);
    const traveller = await travellerIdentityPlatform.getTravellerView(travellerIdentityId);
    return { token: session.token, traveller, expiresAt: session.expiresAt };
  }

  return { signInWithApple };
}
