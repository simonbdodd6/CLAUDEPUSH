# Universal Travel Timeline Platform

The chronological backbone of the Travel Intelligence Platform (Milestone M12).

## Purpose

Every significant event in the travel ecosystem eventually exists here, in time
order. The Timeline owns **chronology** — not business logic, not bookings, not
itineraries, not memories. It is the one place to ask *"what happened, and
when?"* across every product and module.

## Reference-only philosophy

The Timeline **stores references, never business data.** Each event records:

| field | meaning |
|---|---|
| `timelineEventId` | `tev_*` id of the timeline entry |
| `travellerIdentityId` | the traveller (universal `idn_*` id) |
| `tripId` | optional trip the event belongs to |
| `eventType` | closed vocabulary (+ `custom`) — see below |
| `sourcePlatform` | the authoritative module that owns the fact (open slug namespace) |
| `sourceEntityId` | the id of the fact **in that source platform** |
| `timestamp` | when the event occurred (chronology) |
| `importance` | low / normal / high / critical |
| `visibility` | private / companions / public / system |
| `status` | active / redacted (superseded is derived) |
| `confidence` | optional 0–1 |
| `metadata` | small reference/display bag — **not** business data |
| `recordedAt` | when the entry was appended |

The **source platform remains authoritative**. To render an event's full detail,
a consumer follows `sourcePlatform` + `sourceEntityId` back to the owner. The
Timeline never duplicates that data, so it can never drift from the source.

### Supported event types

`trip_created`, `trip_updated`, `destination_added`, `booking_planned`,
`booking_confirmed`, `accommodation`, `flight`, `transport`, `activity`,
`memory_created`, `recommendation_generated`, `companion_match`, `notification`,
`photo_imported`, `journal_entry`, `custom`.

Event types are a **closed vocabulary** (with `custom` as the escape hatch);
`sourcePlatform` is an **open** slug namespace on purpose — the 101st publisher
must never require editing this module.

## Immutability & corrections

- Every timeline event is **immutable**. The repository has no update or delete
  method — at the storage level there is simply no way to mutate an event.
- **Corrections never mutate history.** `correctEvent` appends a *new* event that
  supersedes the original (linked by `correctsEventId`) and writes a correction
  audit record. Only display/chronology fields may change — identity fields
  (`travellerIdentityId`, `sourcePlatform`, `sourceEntityId`, `eventType`) that
  define the underlying fact cannot.
- `redactEvent` appends a `redacted` superseding event with cleared metadata,
  preserving the chronological slot without exposing content.
- Queries return the **effective timeline**: superseded originals are hidden by
  default (`includeSuperseded: true` to see full history); the surviving event
  carries a derived `effectiveStatus` and `superseded` flag.

## Idempotency / duplicate prevention

Pass an `idempotencyKey` to make an append safe to retry — re-appending the same
key throws `DUPLICATE_TIMELINE_EVENT`. Without a key, events are distinct facts,
so genuinely repeatable events (e.g. `trip_updated`) are never wrongly blocked.

## Query API

A single future-friendly `query(filter)` drives everything, with named wrappers:

- `listByTraveller(id, filter?)`
- `listByTrip(tripId, filter?)`
- `listByDateRange(from, to, filter?)`
- `listBySourcePlatform(slug, filter?)`
- `listByEventType(type, filter?)`
- `groupByDay(filter?)` → `[{ day, events }]`
- `groupByTrip(filter?)` → `[{ tripId, events }]`

`filter` supports `travellerIdentityId`, `tripId`, `sourcePlatform`, `eventType`,
`importance`, `visibility`, `status`, `from`, `to`, `includeSuperseded`,
`includeRedacted`, `order` (`asc`/`desc`), and `limit`. Output is deterministic —
ordered by timestamp, then recorded time, then id.

## Future publishers

Any module that records something a traveller would recognise on a timeline:
trip / destination / itinerary / booking / accommodation / flight / transport /
activity / memory / recommendation / companion / notification / photo / journal —
and future products not yet built. Each publishes a reference; none couples to
the Timeline beyond the append contract.

## Future consumers

Built to still be correct at 100 modules and 10M+ events: AI summarisation, smart
notifications, journals, "year in review", memory surfacing, audit/compliance,
and cross-product activity feeds. All read through `query`/grouping; none needs
the Timeline to hold business data.

## Repository abstraction

State lives behind `InMemoryTravelTimelineRepository`, a dumb append-only adapter
(no update/delete). A production event store can implement the same async surface
without changing the domain service.
