# Travel Memory Platform

Deterministic long-term traveller memory for the Travel Intelligence Platform (Milestone M8).

This module stores a traveller's durable preferences over time. It is fully
deterministic: **no AI, no LLMs, no embeddings, no external APIs**. Confidence,
decay and polarity changes are pure functions of explicit input and observation
counts. It consumes immutable snapshots from other platforms (recommendations,
itineraries, trips, …) by reading plain snapshot objects — it imports and
mutates nothing upstream.

## Memory model

Memory identity is `(travellerIdentityId, key, value)`. Each record carries:

- `origin` — `explicit` (stated by the traveller) or `learned` (derived from behaviour)
- `polarity` — `positive` (likes/wants) or `negative` (dislikes/avoids)
- `confidence` — 0–1, deterministic from origin + observation count
- `observationCount`, `firstObserved`, `lastConfirmed`
- `decayScore` — linear freshness (1.0 at last-confirmed → 0.0 after the decay window)
- `locked` — manual lock; blocks **automatic** updates (learned observations + decay)
- `manualCorrection` + `correctionCount` — retained prior state on traveller correction
- `sources` — provenance entries from consumed snapshots
- `version`, `createdAt`, `updatedAt`, `deterministic`, `aiUsed`

`effectiveConfidence` (in explain output) = `confidence × decayScore`.

## Deterministic rules

- **Explicit memory** is authoritative (base confidence 0.9) and is allowed even
  when locked — a lock only blocks automatic updates, not the traveller's own input.
- **Learned observation** of the same polarity reinforces (`+0.1`, capped at 0.95)
  and bumps the observation count; an **opposite** observation weakens (`−0.1`).
  When confidence collapses to ≤ the flip threshold (0.2) the polarity flips and
  confidence resets to the learned base (0.4).
- **Locked** memories ignore learned observations (audited as
  `OBSERVATION_IGNORED_LOCKED`) and are exempt from decay.
- **Decay** is recomputed via `applyDecay({ travellerIdentityId, asOf })` —
  deterministic from `lastConfirmed` and the supplied `asOf` timestamp.

## Core API

`createTravelMemoryPlatform({ repository? })` returns:

- `recordExplicitMemory({ travellerIdentityId, key, value, polarity, confidence?, source?, observedAt? })`
- `observeLearnedMemory({ travellerIdentityId, key, value, polarity, source?, observedAt? })`
- `recordFromSnapshot({ travellerIdentityId, snapshot, signals, observedAt? })`
- `correctMemory({ memoryId, polarity?, value?, confidence?, reason? })`
- `lockMemory(memoryId)` / `unlockMemory(memoryId)`
- `applyDecay({ travellerIdentityId, asOf? })`
- `getMemory(memoryId)`
- `listMemoriesForTraveller(travellerIdentityId, { polarity?, origin?, key?, minConfidence? })`
- `explainMemory(memoryId)` — explainable snapshot
- `getVersionHistory(memoryId)` / `getVersion(memoryId, version)`
- `getAuditEvents({ memoryId?, travellerIdentityId?, action? })`

## Snapshot consumption (no coupling)

`recordFromSnapshot` reads a plain immutable snapshot object plus a list of
derived `signals` (`{ key, value, polarity }`) and folds them into learned
memory, recording `snapshotType`/`snapshotId` provenance. No upstream module is
imported; the snapshot is never written back.

## Version & audit history

Every create/edit/observe/correct/lock/decay appends an immutable version
snapshot (`{ version, label, state, createdAt }`) and an audit event. History is
append-only.

## Privacy rules

Inputs and snapshots must not include exact traveller location, live location,
coordinates, or tracking data — rejected on every entry point.

## Repository abstraction

State lives behind `InMemoryTravelMemoryRepository`, a swappable adapter. A
future production adapter can implement the same async surface without changing
the domain service.
