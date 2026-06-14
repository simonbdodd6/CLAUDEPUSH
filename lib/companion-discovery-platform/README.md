# Companion Discovery Platform

Deterministic, privacy-first traveller discovery for the Travel Intelligence Platform (Milestone M9).

This module lets travellers safely discover compatible nearby travellers
**without exposing exact locations**. It is fully deterministic: **no AI, no
LLMs, no embeddings, no external APIs**. Compatibility is a pure weighted sum of
overlapping, privacy-safe attributes.

## Privacy & safety guarantees

- **No exact GPS is ever stored or returned.** Profiles hold a broad
  `approximateArea` label and a canonical `destinationId` only. Coordinate-style
  fields (`lat`, `lng`, `coordinates`, `liveLocation`, `gps`, …) are rejected on
  every entry point, and free-text area fields that look like a coordinate pair
  are rejected too.
- **Opt-in is required.** A traveller is only discoverable when `optedIn` is
  true. Opting out is absolute. A seeker must be opted in to run discovery
  (no lurking).
- **Blocked travellers never appear**, in either direction — if A blocked B or
  B blocked A, neither sees the other.
- **Visibility controls** gate who can discover a profile:
  `everyone`, `same_destination`, `same_area`, or `hidden` (paused).

## Traveller status

`looking_for_dinner`, `looking_for_diving`, `looking_for_surfing`,
`looking_for_exploring`, `looking_for_photography`, `looking_for_coffee`,
`available_today`.

## Compatibility scoring (deterministic)

Weighted overlap of: shared destination, shared approximate area, shared
activity interests, overlapping travel dates, shared travel styles, shared
positive Travel-Memory tags, shared statuses, and an `available_today` boost.
Conflicting memory tags (one's positive vs the other's negative) apply a
penalty. The raw score is normalised to a `compatibility` band (0–1);
`confidence` reflects how many comparison dimensions both travellers supplied
data for. Every result carries an `explanation` and `sourceFactors`.

## Snapshot consumption (no coupling)

`deriveProfileFieldsFromSnapshots({ preferences, memories })` reads immutable
Traveller Preferences and Travel Memory snapshots (plain objects) and returns
privacy-safe discovery fields (`activityInterests`, `travelStyles`,
`positiveMemoryTags`, `negativeMemoryTags`). No upstream module is imported or
mutated, and no location is carried over.

## Core API

`createCompanionDiscoveryPlatform({ repository? })` returns:

- `deriveProfileFieldsFromSnapshots({ preferences, memories })`
- `createProfile({ travellerIdentityId, approximateArea?, destinationId?, travelStartDate?, travelEndDate?, activityInterests?, travelStyles?, positiveMemoryTags?, negativeMemoryTags?, statuses?, visibility?, optedIn? })`
- `updateProfile({ profileId, changes })`
- `optIn(profileId)` / `optOut(profileId)`
- `setStatuses({ profileId, statuses })`
- `setVisibility({ profileId, visibility })`
- `blockTraveller({ profileId, blockedTravellerIdentityId })` / `unblockTraveller({ ... })`
- `getProfile(profileId)` / `getProfileByTraveller(travellerIdentityId)`
- `discoverCompanions({ seekerProfileId, limit?, requireStatus?, onlySharedDestination? })`
- `getAuditEvents({ profileId?, travellerIdentityId?, action? })`

## Repository abstraction

State lives behind `InMemoryCompanionDiscoveryRepository`, a swappable adapter.
The repository never decides discoverability — all opt-in, visibility, and block
filtering happens in the domain service. A future production adapter can
implement the same async surface without changing the service.
