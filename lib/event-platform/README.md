# Universal Event Platform

The canonical, immutable event model every product publishes into (Milestone M21).

## What this is — and is not

This is the single, durable **shape an event takes** across every Simon Dodd
product. It is **not** an event bus, **not** a queue, **not** messaging, **not**
notifications, and **not** AI. It is the system of record for *what happened* —
one event model, appended once, never changed.

Travel is simply the **first consumer**. Coach's Eye, the Website Lead Agent,
Executive Intelligence, Wedding Intelligence, and Hospitality Intelligence will
all eventually publish the exact same structure into this platform.

## The event model

| field | meaning |
|---|---|
| `eventId` | unique id — caller-supplied (idempotent) or generated `evt_*` |
| `schemaVersion` | the event-schema version stamped on every event |
| `eventCategory` | broad, closed vocabulary (see below) |
| `eventType` | fine-grained type, an open string scoped by platform/module |
| `sourcePlatform` | the product that emitted it (`travel`, `coachs-eye`, …) |
| `sourceModule` | the module within that product (`trip-platform`, …) |
| `sourceEntityType` / `sourceEntityId` | the entity the event is about (a reference) |
| `actorIdentityId` | who caused it (nullable for system events) |
| `organisationId` | tenant scope (nullable) |
| `timestamp` | when the event occurred |
| `references[]` | related entity pointers — `{ type, id }` only |
| `metadata{}` | small reference/display bag — **never** business data |
| `sequence` | monotonic append offset — the deterministic total order |
| `audit` | `{ recordedAt }` — immutable append provenance |

### Categories

`identity`, `travel`, `relationship`, `timeline`, `memory`, `booking`,
`activity`, `approval`, `notification`, `system`, `custom`. Categories are broad
and product-agnostic; meaning is refined by `eventType` (an open string), so new
event types never require a schema change.

## Immutability

- **Append-only.** The repository exposes no update and no delete — immutability
  is structural, not a convention.
- **Corrections are new events.** To correct or supersede an event, append a new
  event that references the original (`references: [{ type: 'event', id }]`). The
  original always remains.
- **Deterministic total order** via the monotonic `sequence`, independent of
  timestamp ties or storage iteration order.

## Validation

Every append validates: required fields; `eventCategory` against the vocabulary;
`sourcePlatform`/`sourceModule`/`sourceEntityType` as slugs; `references` as pure
`{ type, id }` pointers (extra keys dropped so no business data rides along);
`metadata` shape; duplicate `eventId` rejection; and a deep scrub that **forbids
exact-location fields** anywhere in the event.

## API

`createEventPlatform({ repository?, schemaVersion? })` →

- `appendEvent(event)` — append one immutable event
- `getEvent(eventId)`
- `queryEvents(filter)` — the core query (category, type, platform, module,
  entity, actor, org, time range, `sinceSequence`, reference, order, limit)
- `queryByEntity({ type, id }, filter)` — full history of an entity (as source **or** reference)
- `queryByActor(actorIdentityId, filter)`
- `queryByPlatform(sourcePlatform, filter)`
- `queryByCategory(eventCategory, filter)`

The repository is dumb (append-only log + id index); all validation, ordering,
and querying live in the service.

## The foundation this becomes

Designed to still be powering events in 15 years. Because every event shares one
immutable shape with a stable `schemaVersion` and a monotonic `sequence`, this
platform is the natural substrate for:

- **Travel** (first consumer) and then **Coach's Eye**, **Website Lead Agent**,
  **Executive Intelligence**, **Wedding Intelligence**, **Hospitality**.
- A future **Event Bus** / **Event Streaming** layer (the `sequence` is an offset;
  consumers replay from a cursor) — built *on top*, without changing this model.
- Future **analytics** and **AI** — they read one canonical log instead of
  re-joining per-product event shapes.

This milestone creates only the shared foundation. It does not wire any product
into it; consumers adopt it deliberately, one at a time.
