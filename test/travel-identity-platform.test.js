import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_ACTIONS,
  IDENTITY_ROLES,
  IDENTITY_STATUS,
  IDENTITY_TYPES,
  PROFILE_VISIBILITY,
  VERIFICATION_STATUS,
  createIdentityPlatform,
} from '../lib/identity-platform/index.js';

const admin = { id: 'founder-admin', type: 'ADMINISTRATOR' };

test('creates one canonical identity with multiple roles and placeholders', async () => {
  const platform = createIdentityPlatform();
  const identity = await platform.createIdentity({
    roles: [IDENTITY_ROLES.TRAVELLER, IDENTITY_ROLES.HOST],
    publicProfile: {
      displayName: 'Ayu Traveller',
      country: 'ID',
      languages: ['EN', 'id', 'en'],
      timezone: 'Asia/Makassar',
    },
    internalProfile: {
      email: 'AYU@example.com',
      emergencyContact: { name: 'Made', relationship: 'friend', phone: '+620000000' },
    },
  }, admin);

  assert.equal(identity.type, IDENTITY_TYPES.PERSON);
  assert.deepEqual(identity.roles, [IDENTITY_ROLES.TRAVELLER, IDENTITY_ROLES.HOST]);
  assert.equal(identity.verified, false);
  assert.equal(identity.verification.status, VERIFICATION_STATUS.UNVERIFIED);
  assert.equal(identity.trust.level, 'UNASSESSED');
  assert.equal(identity.reputation.eventsCount, 0);
  assert.equal(identity.internalProfile.email, 'ayu@example.com');
  assert.deepEqual(identity.publicProfile.languages, ['en', 'id']);
  assert.equal(identity.country, 'ID');
  assert.equal(identity.timezone, 'Asia/Makassar');
  assert.ok(identity.metadata.federationReady);
  assert.ok(identity.metadata.ssoReady);
  assert.ok(identity.metadata.enterpriseReady);
});

test('public reads exclude internal profile and respect privacy settings', async () => {
  const platform = createIdentityPlatform();
  const identity = await platform.createIdentity({
    publicProfile: {
      displayName: 'Private Guide',
      country: 'ID',
      languages: ['id', 'en'],
      timezone: 'Asia/Jakarta',
    },
    internalProfile: { email: 'guide@example.com', phone: '+62001' },
    privacySettings: {
      profileVisibility: PROFILE_VISIBILITY.AUTHENTICATED,
      showCountry: false,
      showLanguages: true,
      showTimezone: false,
    },
  }, admin);

  const publicIdentity = await platform.readIdentity(identity.id);
  assert.equal(publicIdentity.publicProfile.displayName, 'Private Guide');
  assert.equal(publicIdentity.publicProfile.country, null);
  assert.deepEqual(publicIdentity.publicProfile.languages, ['id', 'en']);
  assert.equal(publicIdentity.publicProfile.timezone, null);
  assert.equal(publicIdentity.internalProfile, undefined);
});

test('internal reads require an actor and are audited', async () => {
  const platform = createIdentityPlatform();
  const identity = await platform.createIdentity({ publicProfile: { displayName: 'Moderator' } }, admin);

  await assert.rejects(
    () => platform.readIdentity(identity.id, { view: 'internal' }),
    /Actor is required/
  );

  const internal = await platform.readIdentity(identity.id, { view: 'internal', actor: admin, reason: 'support' });
  assert.equal(internal.internalProfile.email, null);

  const audit = await platform.getAuditEvents({ identityId: identity.id, action: AUDIT_ACTIONS.INTERNAL_PROFILE_READ });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].details.reason, 'support');
});

test('updates profile without replacing canonical identity', async () => {
  const platform = createIdentityPlatform();
  const identity = await platform.createIdentity({ publicProfile: { displayName: 'Old Name' } }, admin);
  const updated = await platform.updateProfile(identity.id, {
    publicProfile: { displayName: 'New Name', country: 'LU', languages: ['fr'] },
    timezone: 'Europe/Luxembourg',
  }, admin);

  assert.equal(updated.id, identity.id);
  assert.equal(updated.publicProfile.displayName, 'New Name');
  assert.equal(updated.country, 'LU');
  assert.deepEqual(updated.languages, ['fr']);
  assert.equal(updated.timezone, 'Europe/Luxembourg');
});

test('changes roles for businesses guides moderators admins AI agents and organisations', async () => {
  const platform = createIdentityPlatform();
  const identity = await platform.createIdentity({
    type: IDENTITY_TYPES.ORGANIZATION,
    roles: [IDENTITY_ROLES.ORGANIZATION],
    publicProfile: { displayName: 'Bali Operators Group' },
  }, admin);

  const updated = await platform.changeRole(identity.id, [
    IDENTITY_ROLES.BUSINESS,
    IDENTITY_ROLES.LOCAL_GUIDE,
    IDENTITY_ROLES.MODERATOR,
    IDENTITY_ROLES.ADMINISTRATOR,
    IDENTITY_ROLES.AI_AGENT,
    IDENTITY_ROLES.ORGANIZATION,
  ], admin);

  assert.deepEqual(updated.roles, [
    IDENTITY_ROLES.BUSINESS,
    IDENTITY_ROLES.LOCAL_GUIDE,
    IDENTITY_ROLES.MODERATOR,
    IDENTITY_ROLES.ADMINISTRATOR,
    IDENTITY_ROLES.AI_AGENT,
    IDENTITY_ROLES.ORGANIZATION,
  ]);
});

test('sets verification status and verified flag consistently', async () => {
  const platform = createIdentityPlatform();
  const identity = await platform.createIdentity({ publicProfile: { displayName: 'Verified Host' } }, admin);

  const verified = await platform.setVerificationStatus(identity.id, {
    status: VERIFICATION_STATUS.VERIFIED,
    method: 'manual_review',
    evidenceRef: 'verification_evidence_123',
  }, admin);

  assert.equal(verified.verified, true);
  assert.equal(verified.verification.status, VERIFICATION_STATUS.VERIFIED);
  assert.equal(verified.verification.reviewedBy, admin.id);
  assert.ok(verified.verification.verifiedAt);

  const revoked = await platform.setVerificationStatus(identity.id, {
    status: VERIFICATION_STATUS.REVOKED,
    reason: 'expired',
  }, admin);
  assert.equal(revoked.verified, false);
});

test('suspends identity with reason and audit trail', async () => {
  const platform = createIdentityPlatform();
  const identity = await platform.createIdentity({ publicProfile: { displayName: 'Risky Account' } }, admin);

  await assert.rejects(() => platform.suspendIdentity(identity.id, '', admin), /Suspension reason is required/);

  const suspended = await platform.suspendIdentity(identity.id, 'Safety review', admin);
  assert.equal(suspended.status, IDENTITY_STATUS.SUSPENDED);
  assert.equal(suspended.suspensionReason, 'Safety review');

  const audit = await platform.getAuditEvents({ identityId: identity.id, action: AUDIT_ACTIONS.IDENTITY_SUSPENDED });
  assert.equal(audit.length, 1);
});

test('soft delete anonymizes personal data for GDPR-safe deletion workflow', async () => {
  const platform = createIdentityPlatform();
  const identity = await platform.createIdentity({
    publicProfile: { displayName: 'Delete Me', country: 'ID', languages: ['en'], timezone: 'Asia/Jakarta' },
    internalProfile: { email: 'delete@example.com', phone: '+62002', emergencyContact: { name: 'Friend' } },
  }, admin);

  const deleted = await platform.softDeleteIdentity(identity.id, admin, { gdpr: true, reason: 'user_request' });
  assert.equal(deleted.status, IDENTITY_STATUS.SOFT_DELETED);
  assert.equal(deleted.publicProfile.displayName, 'Deleted identity');
  assert.equal(deleted.internalProfile.email, null);
  assert.equal(deleted.internalProfile.phone, null);
  assert.equal(deleted.internalProfile.emergencyContact, null);
  assert.equal(deleted.privacySettings.allowDiscovery, false);

  const publicRead = await platform.readIdentity(identity.id);
  assert.equal(publicRead, null);
});

test('validates unsupported roles types and verification statuses', async () => {
  const platform = createIdentityPlatform();
  await assert.rejects(() => platform.createIdentity({ roles: ['SUPERUSER'] }, admin), /Unsupported identity role/);
  await assert.rejects(() => platform.createIdentity({ type: 'ALIEN' }, admin), /Unsupported identity type/);
  const identity = await platform.createIdentity({ publicProfile: { displayName: 'Test' } }, admin);
  await assert.rejects(
    () => platform.setVerificationStatus(identity.id, { status: 'MAYBE' }, admin),
    /Unsupported verification status/
  );
});

