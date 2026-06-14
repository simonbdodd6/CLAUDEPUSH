# Itinerary Platform

Deterministic, editable itinerary foundation for the Travel Intelligence Platform (Milestone M7).

This module turns a **Trip Intelligence** trip-plan snapshot into an editable,
versioned, multi-day itinerary. It consumes the trip plan as an immutable
snapshot — it never mutates the Trip Intelligence Platform or any other upstream
domain, and it makes no AI/LLM, external API, map, or provider calls.

## What it produces

A multi-day itinerary where each day has ordered **Morning / Afternoon /
Evening** sections plus a list of **rain-day alternatives**. Each section holds
ordered, editable **blocks**. Every block carries an editable `notes` field.

Supported block types:

- `activity` — a planned activity (carries the source recommendation id)
- `transport` — a transport placeholder
- `meal` — a meal placeholder (`details.mealType`: breakfast / lunch / dinner / snack)
- `rest` — a rest period
- `free_time` — an open / unstructured block
- `rain_alternative` — a rain-day fallback (stored in the day's `rainAlternatives`)

When generated from a trip plan, each day is a complete editable skeleton:
breakfast → transport → morning activity, lunch → afternoon activity → rest,
evening activity → dinner, plus a rain-day alternative derived from the plan's
backup option. Missing activity slots fall back to free-time blocks.

## Core API

`createItineraryPlatform({ repository? })` returns:

- `createItineraryFromTripPlan({ tripPlan, ownerIdentityId?, tripId?, title? })`
- `createBlankItinerary({ days, startDate?, ownerIdentityId?, tripId?, title? })`
- `getItinerary(itineraryId)`
- `listItinerariesForTrip(tripId)`
- `listItinerariesForOwner(ownerIdentityId)`
- `addBlock({ itineraryId, day, section, block, index? })`
- `addRainAlternative({ itineraryId, day, block })`
- `updateBlock({ itineraryId, blockId, changes })`
- `setBlockNotes({ itineraryId, blockId, notes })`
- `removeBlock({ itineraryId, blockId })`
- `moveBlock({ itineraryId, blockId, toSection, toIndex? })`
- `publishItinerary(itineraryId)`
- `revertToVersion({ itineraryId, version })`
- `getVersionHistory(itineraryId)` / `getVersion(itineraryId, version)`
- `getAuditEvents({ itineraryId?, action? })`

## Draft / published lifecycle

- New itineraries start as `draft` at `version` 1.
- `publishItinerary` sets status to `published`, stamps `publishedAt`, and
  snapshots the published state into version history.
- Editing a published itinerary reopens it as a `draft` (the published snapshot
  remains in history and is never silently overwritten).

## Version history

Every create / edit / publish / revert appends an immutable snapshot
(`{ version, status, title, label, days, createdAt }`) to the version history.
`revertToVersion` restores a snapshot's days/title/status and is itself
append-only — it creates a new version rather than deleting later ones.

## Privacy rules

- Inputs must not include exact traveller location, live location, coordinates,
  or tracking data (validated and rejected on every entry point).
- Itineraries are built from supplied snapshots only.

## Repository abstraction

State lives behind `InMemoryItineraryRepository`, a swappable adapter. A future
production adapter (Postgres / Supabase / etc.) can implement the same async
surface without changing the domain service.
