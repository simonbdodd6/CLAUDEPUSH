# Travel App API (M23.0 Phase 3)

The thin HTTP API a future iPhone app points at. Every endpoint delegates to a
frozen Platform V2 module through `createTravelApi` — no platform changes, no
duplicated logic. Auth is a bearer session token (`Authorization: Bearer <token>`)
issued by `POST /auth/apple`.

Run locally: `PORT=8787 TRAVEL_STORE_DIR=./.travel-data node travel-app/api/server.js`

Configuration + deployment (env vars, Apple Sign In setup, Postgres seam): see
[DEPLOYMENT.md](./DEPLOYMENT.md) and [.env.example](./.env.example).

## Endpoints

| Method | Path | Body | Returns | Platform module(s) |
|---|---|---|---|---|
| GET | `/health` (`/healthz`) | — | `{ status, env, time, checks }` (200 ready / 503 store down) | composition — liveness + readiness probe, unauthenticated |
| POST | `/auth/apple` | `{ identityToken, displayName? }` | `{ token, traveller, expiresAt }` | auth → identity-platform + traveller-identity port + session |
| GET | `/today` | — | `{ traveller, currentTrip, recentTimeline }` | identity port, trip-platform, timeline |
| GET | `/trip` | — | `{ trip }` | trip-platform |
| PUT | `/trip` | trip fields (`tripName, country, destination, area, startDate, endDate`) | `{ trip }` | trip-platform (publishes timeline + graph) |
| GET | `/itinerary` | — | `{ itinerary }` | itinerary-platform |
| PUT | `/itinerary` | `{ days?, day?, section?, block? }` | `{ itinerary }` | itinerary-platform (publishes timeline + graph) |
| POST | `/capture` | `{ note?, photoRef?, day?, timestamp?, with?:[name] }` (note **or** photoRef required) | `{ capture: Entry & { day, with } }` | timeline (journal_entry / photo_imported) |
| GET | `/timeline` | — | `{ days: [Day] }` | timeline-platform |
| GET | `/feed` | — | `{ hero, featuredPhotos, highlights, today, stats }` | feed (derived from timeline + trip) |
| GET | `/stats` | — | `{ stats: TravelStats }` | feed (derived from timeline + trip) |
| GET | `/intelligence` | — | `{ travelStyle, insights, locked, basedOn }` | intelligence (derived from memories + trips) |
| GET | `/relationships` | — | `{ mostTravelledWith, companions, recurringCompanions, circles, locked, basedOn }` | relationships (derived from shared memories + trips) |
| GET | `/memories` | — | `{ recap, storyCards, chapters, collections, reels, basedOn }` | memory engine (derived from memories + trips) |
| GET | `/life-story` | — | `{ stories, basedOn }` | life story engine (derived from whole history) |

### Consumer DTOs (M23.3 · premium experience M24.0)

The app never sees raw platform records. `/timeline` and `/capture` return
clean, **premium** app-facing shapes (no `sourceEntityId` / `sourcePlatform` /
`idempotencyKey` / `eventName` / `sequence` / `metadata` / `eventType`):

```
Day = {
  date:    "2026-07-12",            // sort/group key
  title:   "Sunday, 12 July 2026",  // full human date
  label:   "Day 2" | null,          // trip-relative (deterministic from trip start)
  story:   "Day 2 in Bali",         // emotional one-line headline for the memory card
  summary: "2 moments · 2 photos",  // gentle count line
  entries: [Entry],
}
Entry = {
  id, kind,
  accent:    "sunset",              // semantic colour/symbol token (app maps it; no hex)
  title:     "Echo Beach sunset",   // human (journal/photo note becomes the title)
  subtitle:  "Evening · Photo memory",
  detail:    "…",
  partOfDay: "Morning|Afternoon|Evening|Night",
  time:      "18:10",
  timestamp, photoRef|null,
}
```

- `kind` ∈ `trip | itinerary | activity | photo | journal | memory | destination | other`.
- `accent` ∈ `sky | slate | forest | sunset | dusk | ocean | sand` — the app maps the token to a colour/symbol (no styling leaks from the backend).
- `story`/`label` are framed relative to the trip when known ("Arrival in Bali", "Day 3 in Bali") and fall back gracefully ("A moment to remember") with no trip.
- `days` are newest-first; `entries` within a day are chronological (the day reads as a story).
- `/capture` returns one `Entry` plus a `day` field.
- Photos are **references only** (`photoRef`) — the binary stays on device; EXIF
  GPS must be stripped client-side.
| GET | `/trip-readiness` | — | `{ candidates, approvalRequests }` | context → insight → action → orchestrator → approval |
| GET | `/approvals` | — | `{ pending }` | approval-platform |
| POST | `/approvals/:id` | `{ decision: 'approve'\|'reject', reason? }` | `{ request }` | approval-platform |

### Premium feed & statistics DTOs (M24.1)

"Instagram Explore meets Apple Journal." `/feed` and `/stats` are **derived,
read-only** views over the timeline + trip — deterministic, offline-friendly,
display-ready (almost zero UI logic), and free of any backend term. They derive
from the same premium entries as `/timeline` (single source of truth).

```
Feed = {
  hero:           Entry & { place, featured: true } | null,   // the standout memory
  featuredPhotos: [Entry],                                     // up to 6, newest-first
  highlights:     [{ id, kind:"milestone", accent, icon, title, subtitle }],
  today:          Day | null,                                  // newest premium day card
  stats:          TravelStats,
}

TravelStats = {
  headline:   { daysTravelling, placesVisited, countries, memories },  // hero numbers
  journey:    { tripDuration, daysTravelling, countries, countriesList, placesVisited, placesList },
  activity:   { flightsTaken, diveCount, memories, photoCount, journalCount, memoryCount },
  streaks:    { current, longest, unit:"days" },
  categories: [{ key, label, accent, icon, count }],  // richest-first
}
```

- **Memory categories** are derived deterministically from each memory's own
  words: `sunset · beach · mountain · city · wildlife · food · dive · flight`.
  (Counts populate "sunset count", "beach count", "dives", "flights", etc.)
- `tripDuration` is inclusive days from the trip dates (null if unknown);
  `daysTravelling` is distinct days with memories; `streaks` are consecutive
  memory-days.
- All numbers/labels are display-ready; the app binds them with no computation.

### Travel Intelligence DTO (M24.2)

Deterministic product intelligence — **not AI**. Spotify-Wrapped-style
observations derived purely + honestly from the traveller's own memories + trips
("You chase the light", "Sunsets appear in 33% of your memories", "Indonesia is
your kind of place"). An insight is emitted **only** when the data supports it;
everything else is `locked` with a friendly hint.

```
Intelligence = {
  travelStyle: { headline, detail, accent, icon } | null,   // the signature line
  insights:    [Insight],                                    // strongest-first deck
  locked:      [{ id, title, hint }],                         // "keep travelling to unlock"
  basedOn:     { memories, trips, activeDays },               // the evidence base
}
Insight = { id, kind:"insight", title, detail, accent, icon, stat?: { value, label } }
```

Observations include: signature travel style, sunset share %, beaches-vs-cities,
underwater-vs-land photos, favourite activity, daily rhythm (early riser),
longest travel streak, longest dive streak, favourite country, average trip
length, favourite season, revisits, and a gentle "you should go back" nudge.
All deterministic, offline-first, and free of backend terms.

### Relationship & Shared-Journey DTO (M24.3)

Deterministic shared-journey intelligence — **not AI**. Warm, emotional
observations about the people you travel with, derived purely from the memories
you tagged them in (`/capture` `with:[name]`) + your trips. A companion story is
emitted only with evidence; the rest is `locked`.

```
Relationships = {
  mostTravelledWith:   { name, tripsTogether, daysTogether, sharedMemories } | null,
  companions:          [Companion],        // strongest bond first
  recurringCompanions: [{ name, tripsTogether }],   // friends met on multiple trips
  circles:             [{ members:[name], tripsTogether }],  // travel circles
  locked:              [{ id, title, hint }],
  basedOn:             { companions, sharedMemories },
}
Companion = {
  name, headline:"You and Manon", summary, favouriteDestination,
  stats: { tripsTogether, daysTogether, countriesTogether, placesTogether,
           sharedMemories, sharedSunsets, sharedDives, sharedFlights, sharedPhotos },
  insights: [Insight],   // "You've watched 31 sunsets together", "You always dive together"
}
```

Companions are a product concept (names tagged on a memory). They could later be
promoted to graph `COMPANION` entities + `TRAVELLED_WITH` edges (see
PRODUCT_VISION.md); the aggregation here is presentation logic with zero platform
duplication.

### Memory Engine DTO (M24.4)

Deterministic memory storytelling — **no AI, no generated prose**. Every label is
a fixed template filled with the traveller's own numbers/dates. Assembled from
existing memories + trips; the UI renders it with almost zero logic.

```
Memories = {
  recap:       { id, title:"Your Bali story", period, year, headline:{memories,days,places,photos},
                 storyLine, topCategories:[{label,count,accent,icon}], cover } | null,
  storyCards:  [{ id, kind:"story", title, subtitle, accent, icon, date, cover, entries }],
  chapters:    [{ id, kind:"chapter", title:"Chapter 1 · Arrival", story, subtitle, dayCount, memoryCount, accent, cover }],
  collections: [{ id, kind:"collection", title, subtitle, accent, icon, count, cover, entries }],
  reels:       [{ id, kind:"reel", title, subtitle, accent, count, cover, entries }],
  basedOn:     { memories, days },
}
```

- **Story cards** (superlatives, evidence-gated): best day, quietest day, most
  adventurous day, most photographed day, best dive day, longest day, first/last
  sunset, first/final memory, trip beginning/ending, busiest week.
- **Chapters**: the trip week-by-week ("Chapter 1 · Arrival", "A week of beaches").
- **Collections**: themed sets (dive trip, food/wildlife journey, sunsets,
  beaches, high ground, road trip) — formed only with ≥2 matching memories.
- **Reels**: ordered photo/moment sequences (the day in photos, the most moving day).
- **Recap**: the trip/year packaged as a shareable summary.
- All `cover`/`entries` are premium `Entry` objects (same shape as `/timeline`).

### Life Story DTO (M24.5)

The highest narrative layer — reads across the traveller's whole history and
curates titled **life stories** ("The Bali Chapter", "The Summer You Learned To
Dive", "Travelling With Manon", "Where You Always Return"). **No AI, no generated
prose** — every title/subtitle/framing is a fixed template filled with the
traveller's own evidence. Evidence-gated; emitted strongest-first.

```
LifeStory = {
  id, title, subtitle, framing,            // emotional framing (templated, not LLM)
  category,                                 // place|theme|person|pattern|milestone|era|mood
  cover,                                    // cover memory (premium Entry)
  hero,                                     // hero image reference (cover's photoRef | null)
  memories: [Entry],                        // supporting memories (chronological)
  statistics: { memories, photos, days, … },// story-relevant counts
  span: { from, to, days, label:"Jul 2026" | "2024–2026" },
  evidence: { count, confidence:"emerging"|"strong"|"defining" },
}
LifeStoryResponse = { stories: [LifeStory], basedOn: { memories, trips, span } }
```

Stories include place chapters, "learned to dive" milestone, theme journeys
(diving / sunsets / ocean / food / wild), companion stories, "where you always
return", "your island years", "the year of adventure", "your quiet places" and
"places that changed you". All deterministic, offline-first, no backend leakage.

## End-to-end journey (validated by `test/journey.test.js`)

```
POST /auth/apple        → token + traveller (PERSON+TRAVELLER created/resolved)
PUT  /trip              → create Indonesia trip   (→ timeline trip_created, graph owns/visited)
PUT  /itinerary         → build days + add activity (→ timeline + graph edges)
POST /capture           → journal/photo            (→ timeline photo_imported, photoRef only)
GET  /timeline          → grouped feed of what happened
GET  /trip-readiness    → deterministic gap candidates; high-impact routed to approval
GET  /approvals         → pending decisions
POST /approvals/:id     → approve  (human decision; nothing auto-executes)
```

## Notes & follow-ups
- **Photos:** only a reference id is stored (`photoRef`); binaries stay on device; EXIF GPS must be stripped client-side (platform forbids exact location).
- **Durable today:** trips, timeline, events, sessions, Apple links. **Follow-up:** durable identity / itinerary / memory / graph / approval repositories (in-memory within a running process for now — reads survive restart for the durable set; `createTrip` after restart needs the durable identity repo).
- **Apple verifier is injected and now real** — `apple-verifier.js` validates the identity token against Apple's public JWKS (signature + iss/aud/exp); selected by `APPLE_VERIFIER_MODE` (`disabled`/`fake`/`jwks`). No Apple secrets in the repo (verification uses only public keys + the public client id).
- **No platform module was modified.** The API is pure composition over the frozen V2 contracts.
