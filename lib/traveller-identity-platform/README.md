# Traveller Identity Platform

Travel-facing identity **port and projection** for the Travel Intelligence Platform (Milestone M10).

## What this module is — and is not

- **M10 owns no traveller data.** It has no repository, no store, no entity, and
  no id format of its own.
- **The universal identity record remains the single source of truth.** The
  canonical traveller is the existing `lib/identity-platform/` record: an `idn_*`
  id, `PERSON` type, `TRAVELLER` role, `ACTIVE` status, with the identity
  module's own privacy settings, trust, reputation, and verification.
- **M10 is a zero-storage projection / adapter port.** It lets travel modules
  resolve and validate a `travellerIdentityId` safely without importing
  `lib/identity-platform/` directly.

## Why a port

Travel modules currently reference a traveller by an opaque `travellerIdentityId`
string and never validate it. M10 provides one decoupled seam — the
`IdentitySourceAdapter` — through which a travel module can confirm that an id is
a real, active traveller and obtain a privacy-safe view of it. Modules depend on
this port, never on the identity module, so the decoupling holds.

## The port

`IdentitySourceAdapter` (interface) → `getIdentitySnapshot(travellerIdentityId)`
returns an immutable, privacy-applied identity snapshot (the identity-platform
**public view** shape) or `null` when the identity is missing or soft-deleted.

`IdentityPlatformSourceAdapter` is the default implementation. It wraps an
**injected** identity-platform instance and reads only `readIdentity(id, { view: 'public' })`.
The identity platform is injected, not imported, so M10 has no module-level
dependency on it, and only the public (privacy-applied) view is ever read —
internal/PII fields never reach M10.

## API

```js
import { createIdentityPlatform } from '../identity-platform/index.js';
import {
  createTravellerIdentityPlatform,
  IdentityPlatformSourceAdapter,
} from '../traveller-identity-platform/index.js';

const identityPlatform = createIdentityPlatform();
const travellers = createTravellerIdentityPlatform({
  identitySource: new IdentityPlatformSourceAdapter({ identityPlatform }),
});
```

- `resolveTraveller(id)` — validated, privacy-safe traveller view; throws on invalid.
- `assertActiveTraveller(id)` — returns the canonical id if valid; throws otherwise. Boundary guard for travel operations.
- `getTravellerView(id)` — privacy-safe view for a valid traveller; throws otherwise.
- `isTraveller(id)` — non-throwing boolean.

## Validation

A valid traveller must:

- exist (snapshot is not `null`),
- be `ACTIVE` (suspended → `IDENTITY_INACTIVE`; soft-deleted/missing → `TRAVELLER_NOT_FOUND`),
- have the `TRAVELLER` role (else `NOT_A_TRAVELLER`),
- be `PERSON` type **where the snapshot provides it** (else `NOT_A_TRAVELLER`),
- and is projected only through the identity's privacy-applied public view.

The projection is deterministic — a pure function of the snapshot — and exposes
only privacy-safe traveller fields (see `TRAVELLER_VIEW_FIELDS`): id, type,
status, verification, display name/avatar/bio, privacy-filtered
country/languages/timezone, trust, reputation, timestamps. No email, legal name,
phone, emergency contact, or other internal field is ever exposed.

## Scope boundary (important)

- `lib/identity-platform/` is **not modified** by M10.
- Existing travel modules are **not retrofitted** in M10 — they continue to use
  raw `travellerIdentityId` strings. Exposing the port does not enforce it.
- **M11+ should phase in `assertActiveTraveller` adoption** at the boundary of
  each travel module, one module at a time, keeping the test suite green.
