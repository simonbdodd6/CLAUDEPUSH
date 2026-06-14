// M10 — Traveller Identity Platform.
//
// This module owns NO canonical data. The vocabulary below intentionally
// mirrors `lib/identity-platform/` as plain string literals rather than
// importing it, so travel-facing code stays fully decoupled from the identity
// module. The shared vocabulary IS the contract; the identity snapshot is
// consumed only through the injected adapter.

// A valid traveller must satisfy all of these against the universal identity.
export const TRAVELLER_REQUIRED_ROLE = 'TRAVELLER';
export const TRAVELLER_REQUIRED_STATUS = 'ACTIVE';
export const TRAVELLER_EXPECTED_TYPE = 'PERSON';

// The privacy-safe fields the traveller projection may expose. Every value is
// sourced from the identity-platform PUBLIC view, which has already applied the
// identity's own privacy settings — no internal/PII field is ever projected.
export const TRAVELLER_VIEW_FIELDS = Object.freeze([
  'travellerId',
  'type',
  'status',
  'isTraveller',
  'verified',
  'verificationStatus',
  'displayName',
  'avatarUrl',
  'bio',
  'country',
  'languages',
  'timezone',
  'trust',
  'reputation',
  'createdAt',
  'updatedAt',
]);
