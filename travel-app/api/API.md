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
| POST | `/capture` | `{ note?, photoRef?, day?, timestamp?, with?:[name], place?, move?:{type,from?,to?} }` (note **or** photoRef required) | `{ capture: Entry & { day, with } }` | timeline (journal_entry / photo_imported) |
| GET | `/timeline` | — | `{ days: [Day] }` | timeline-platform |
| GET | `/feed` | — | `{ hero, featuredPhotos, highlights, today, stats }` | feed (derived from timeline + trip) |
| GET | `/stats` | — | `{ stats: TravelStats }` | feed (derived from timeline + trip) |
| GET | `/intelligence` | — | `{ travelStyle, insights, locked, basedOn }` | intelligence (derived from memories + trips) |
| GET | `/relationships` | — | `{ mostTravelledWith, companions, recurringCompanions, circles, locked, basedOn }` | relationships (derived from shared memories + trips) |
| GET | `/memories` | — | `{ recap, storyCards, chapters, collections, reels, basedOn }` | memory engine (derived from memories + trips) |
| GET | `/life-story` | — | `{ stories, basedOn }` | life story engine (derived from whole history) |
| GET | `/travel-dna` | — | `{ headline, traits, basedOn }` | travel DNA (long-term characteristics) |
| GET | `/predictions` | — | `{ predictions, basedOn }` | predictive companion (anticipates from evidence) |
| GET | `/journey` | — | `{ route, stops, segments, chapters, basedOn }` | journey visualisation (ordered replayable route) |
| GET | `/journey/replay` | — | `{ replay, timeline, chapters, capabilities, controls, basedOn }` | interactive journey replay (timeline + controls) |
| GET | `/globe` | — | `{ globe, markers, arcs, cameraMoves, replayFrames, highlights, replay, filters, basedOn }` | 3D globe data layer |
| GET | `/world` | — | `{ profile, countries, regions, islands, cities, eras, connections, repeatVisits, favouriteReturns, longestGaps, heat, statistics, worldStatistics, filters, basedOn }` | lifetime world data layer |
| GET | `/achievements` | — | `{ summary, categories, series, achievements, earned, timeline, rewards, statistics, basedOn }` | achievement engine (earned from evidence) |
| GET | `/lifetime-timeline` | — | `{ summary, years, chapters, moments, filters, basedOn }` | lifetime travel timeline (whole life as one story) |
| GET | `/travel-wrapped` | — | `{ headline, stats, highlights, bySeason, achievements, travelDna, lifeStory, sections, years, basedOn }` | travel wrapped (composed deck, no new intelligence) |
| GET | `/on-this-day` | `?date=YYYY-MM-DD` (optional; defaults to today) | `{ date, monthDay, referenceYear, hasMemories, label, hero, items, byYear, anniversaryBadges, milestones, comparisons, categories, basedOn }` | on this day (same calendar day, previous years) |
| GET | `/collections` | — | `{ collections, summary, basedOn }` | memory collections (auto-generated themed sets) |
| GET | `/story` | — | `{ story, chapters, hero, anchors, basedOn }` | story composer (immersive chronological story) |
| GET | `/cinematic` | — | `{ cinematicId, scope, sourceJourneyId, dateRange, scenes, sceneOrder, openingScene, closingScene, heroScene, statistics, basedOn }` | journey cinematic (storyboard playback model) |
| GET | `/experiences` | — | `{ experiences:[{id,title,subtitle,icon,available}], basedOn }` | experience catalogue (index) |
| GET | `/experience` | `?name=wrapped\|on-this-day\|collections\|story\|cinematic` (`&date=` for on-this-day) | `ExperiencePresentation` | shared presentation contract for any premium experience |
| GET | `/design-tokens` | — | full token system | deterministic visual guidance (palette, typography, layouts, cards…) |
| GET | `/experience-tokens` | `?name=…` | `{ experience, identity, hero, timeline, statistic, media, map, achievement, emptyState, system }` | per-experience design tokens |
| GET | `/navigation` | `?current=<experience>` (optional) | `{ graph, entryPoints, defaultEntry, recommendedSequence, availableSequence, cursor, timelineAnchors, emptyState, meta, basedOn }` | experience navigation graph |
| GET | `/recommendations` | `?date=YYYY-MM-DD` (optional; defaults today) `&current=<experience>` | `{ version, referenceDate, recommendations, top, continuation, emptyState, meta, basedOn }` | rule-based next-experience recommendations |
| GET | `/home` | `?date=YYYY-MM-DD` (optional; defaults today) `&current=<experience>` | `Home` | the daily home dashboard model |
| GET | `/search` | `?q=<query>` | `Search` | deterministic search across every experience |
| GET | `/profile` | `?date=YYYY-MM-DD` (optional; defaults today) | `Profile` | the canonical traveller profile |
| GET | `/traveller-timeline` | — | `TravellerTimeline` | every travel event in one chronological life stream |
| GET | `/passport` | — | `Passport` | compact traveller identity card and stamp book |
| GET | `/statistics` | — | `Statistics` | deterministic traveller history statistics |
| GET | `/insights` | — | `Insights` | fixed-category traveller insight cards |
| GET | `/highlights` | — | `Highlights` | fixed-category traveller highlight cards |

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

### Personal Travel DNA DTO (M24.6)

The long-term sense of WHO the traveller is — learned deterministically from
evidence across every journey. **No AI, no generated prose, no randomness.** A
trait appears only with evidence; traits with no data (e.g. spending,
accommodation) are honestly absent.

```
Trait = {
  id, label, statement,                 // "You live for the ocean." (templated)
  category,                              // element|drive|identity|habit|spectrum|pattern|favourite
  accent, icon,
  score: 0..100, level:"low|medium|high",
  evidence: { count, detail },
  confidence: "emerging|strong|defining",
  trend: "rising|falling|steady|new",   // earlier half vs later half
  firstObserved, latestObserved,        // ISO | null
  value?,                               // for favourites/spectra (e.g. "Indonesia", 15)
}
TravelDna = { headline: { statement, trait } | null, traits: [Trait], basedOn: { memories, trips, span } }
```

Traits include ocean affinity, adventure, relaxation, food/diving/surfing/hiking/
culture identities, photography, spectra (water↔mountains, cities↔nature,
mornings↔nights, solo↔together, pace), explorer breadth, memory density, return
affinity, and favourites (country, region, month, companion, trip length). All
deterministic, offline-first, no backend leakage.

### Predictive Companion DTO (M24.7)

Gently anticipates what the traveller will likely enjoy next — **deterministic
evidence only. No AI, no generated prose, no randomness.** A prediction appears
only with sufficient evidence; no guessing.

```
Prediction = {
  id, category,                          // likely-activity | likely-wake-rhythm | likely-return | …
  statement, explanation,                // templated WHY, never LLM
  score: 0..100,
  confidence: "emerging|strong|defining",
  evidence: { count, detail },
  supportingMemories: [Entry],           // up to 8
  firstObserved, lastObserved,           // ISO | null
  trend: "rising|falling|steady|new",
  accent, icon,
  items?: [{ item, reason }],            // for likely-packing
}
PredictionsResponse = { predictions: [Prediction], basedOn: { memories, trips, span } }
```

Categories: likely-activity ("You normally dive on your 2nd day"), likely-wake-
rhythm ("You usually wake before sunrise near the ocean"), likely-photography,
likely-companion, likely-return, likely-destination-type, likely-trip-style
(Travel-DNA match %), likely-season, likely-trip-length, likely-food, and
likely-packing (evidence-derived suggestions). All deterministic, offline-first,
no backend leakage.

### Journey Visualisation DTO (M25)

A deterministic, replayable ROUTE the UI can animate departure → return — **no AI,
no randomness**. `route` is an ordered ribbon alternating stops and transport
segments (with inferred Home bookends), each carrying `replayOrder`. Assembled
from memories + trips + optional `place`/`move` capture tags. `coordinates` is
always present but `null` until a future region-granularity source fills it (the
platform forbids exact location).

```
Stop = {
  type:"stop", id, place, country, transition:"home|start|country|place",
  startDate, endDate, durationDays, memoryCount,
  supportingMemories:[Entry], supportingPhotos:[ref],
  accommodation:[title], activities:[label], chapter:{index,label}|null,
  icon, coordinates:null, confidence, inferred, replayOrder,
}
Segment = {
  type:"segment", id, transport:"flight|fast boat|ferry|boat|train|taxi|walk|travel|…",
  origin, destination, startDate, endDate, durationHours,
  supportingMemories:[Entry], supportingPhotos:[ref],
  icon, coordinates:null, confidence, inferred, replayOrder,
}
Journey = { route:[Stop|Segment], stops:[Stop], segments:[Segment],
            chapters:[{index,label,places,from,to}], basedOn:{memories,stops,segments,span} }
```

Stops form from consecutive same-`place` memories (place falls back to trip
area → destination → country); segments come from explicit `move` tags
(`confidence:"strong"`) or transport keywords in the memory text
(`confidence:"emerging"`); Home bookends are `inferred`. The UI can animate
routes/flights/boats, build journey ribbons, replay a whole holiday, and zoom
into chapters — with no logic of its own.

### Interactive Journey Replay DTO (M26)

A pure presentation layer over `/journey` that makes the route **replay-ready** —
**no AI, no animations here, only the data a UI needs to animate**. Replay times
are abstract ms of a continuous replay clock (reproducible), so the UI can play /
pause / resume at any point and jump/filter via the control ranges.

```
Replay = {
  replay: { replayStart:0, replayEnd, replayDuration, nodeCount },
  timeline: [ReplayStop | ReplaySegment],   // contiguous: node[i].endAt === node[i+1].startAt
  chapters: [{ index, label, title, places, nodeIds, startAt, endAt }],
  capabilities: { play, pause, resume, jumpToChapter, replayDestination, replayTransport, replayFlightsOnly, replayIslandsOnly },
  controls: {
    jumpToChapter:     [{ index, label, startAt, endAt }],
    replayDestination: [{ place, nodeId, startAt, endAt }],
    replayTransport:   [{ transport, segments:[{ id, origin, destination, startAt, endAt }] }],
    replayFlightsOnly: { transport:"flight", segments:[…] } | null,
    replayIslandsOnly: [{ place, nodeId, startAt, endAt }],
  },
  basedOn: { memories, stops, segments, span },
}
ReplaySegment = Segment & {
  transportIcon, transportColour, animationStyle, pathType, path:{ style, curve, dashed },
  replay: { order, startAt, endAt, duration, movementSpeed, zoomLevel },
}
ReplayStop = Stop & {
  chapterTitle, coverPhoto, favouriteMemories, highlightMemories, activitySummary,
  arrivedBy, isIsland,
  replay: { order, startAt, endAt, arrivalPause, stayDuration, departurePause, zoomLevel, arrivalAnimation },
}
```

- `pathType` ∈ `flight | sea | rail | road | walking | generic`; `transportColour`
  is a semantic token (UI maps to a colour). `isIsland` is derived from a sea
  arrival. Home bookends are `inferred`.
- The continuous timeline + control ranges let the UI replay the whole holiday,
  jump to a chapter, replay one destination/transport, or filter to flights-only
  / islands-only — with no logic of its own.

### 3D Globe DTO (M27)

The complete deterministic data layer a future interactive globe needs — **no
graphics, no AI**. Coordinates come from a curated **region-level gazetteer**
(public place centroids, not the traveller's GPS); unknown places get a
deterministic fallback flagged `resolved:false`. Built on `/journey/replay`
(home bookends excluded from the globe).

```
Globe = {
  globe: { defaultZoom, markerCount, arcCount, bounds:{minLat,maxLat,minLng,maxLng}, span },
  markers: [Marker], arcs: [TransportArc],
  cameraMoves: [CameraMove], replayFrames: [ReplayFrame], highlights: [Highlight],
  replay: { replayStart, replayEnd, replayDuration },
  filters: { byCountry, byTransport, byActivity, byYear, favouritesOnly, longestJourneys },
  basedOn,
}
Marker = { id, place, visitOrder, latitude, longitude, coordinateSource:"gazetteer|derived",
  resolved, country, island, city, region, isIsland, isFavourite, zoomLevel, cameraAngle,
  arrivalDirection, departureDirection, markerSize, markerColour, startDate, endDate, year,
  startAt, endAt, durationDays, memoryCount, coverPhoto, chapterTitle, activities }
TransportArc = { id, transport, family, fromMarkerId, toMarkerId, origin:{lat,lng}, destination:{lat,lng},
  greatCircleArc:[{lat,lng}×24], distanceKm, bearing, pathCurvature, elevation, flightHeight, boatHeight,
  travelColour, glowIntensity, animationDuration, startAt, endAt }
ReplayFrame = { order, kind:"marker|arc", refId, action, startAt, endAt, camera:CameraMove }
CameraMove = { id, target:{latitude,longitude}, markerId, zoomLevel, angle, bearing, durationMs, startAt, easing }
Highlight = { id, kind, refType:"marker|arc", refId, label, value, unit? }
```

Filters return id ranges so the UI can replay the whole trip or filter to one
country / transport / activity / year / favourites-only / longest journeys — all
deterministic, offline-first, no backend leakage.

### Lifetime World DTO (M28)

The deterministic data layer for a traveller's **entire visited world** (not one
trip) — **no graphics, no AI**. Aggregates every place ever visited into
countries / regions / islands / cities, plus travel eras, world connections, heat
values and lifetime statistics. Built on `/globe` + shared enrichment.

```
World = {
  profile: { firstVisit, latestVisit, span, totalCountries, totalPlaces, mostVisitedCountry, favouritePlace },
  countries|regions|islands|cities: [VisitedLocation],
  eras: [{ year, countries, countryCount, placeCount, memoryCount, photoCount, trips, span }],
  connections: [{ id, kind:"flight|ferry|land", level:"country|island|region|place", from, to, count, transports, totalKm }],
  repeatVisits: [{ place, country, visitCount, firstVisit, latestVisit }],
  favouriteReturns: [...], longestGaps: [{ place, gapDays, from, to }],
  heat: { countryIntensity, cityIntensity, islandIntensity, revisitIntensity, memoryDensity,
          emotionalSignificance, photographyDensity, activityDensity },   // each [{ name, value:0..100 }]
  statistics: { totalCountries, totalCities, totalIslands, continents, yearsTravelled,
                totalTransportLegs, totalFlights, totalFerries, totalJourneys, totalPlaces, totalMemories, totalPhotos, totalDays },
  worldStatistics: [{ id, label, value }],
  filters: { byYear, byContinent, byCountry, byCompanion, byActivity, bySeason, favourites, firstVisits, latestVisits },
}
VisitedLocation = { type, name, country, places, firstVisit, latestVisit, visitCount, totalDays,
  memoryCount, photoCount, companions:[{name,count}], favouriteSeason, favouriteMemories,
  coordinates, confidence, isFavourite, highlightScore, heat:{ intensity, revisitIntensity,
  memoryDensity, photographyDensity, activityDensity, emotionalSignificance } }
```

`totalDays` is distinct memory-days; `connections` include only evidenced legs
(flights/ferries), no self-loops; heat arrays are normalised 0–100. All
deterministic, offline-first, no backend leakage.

### Achievement DTO (M29)

Achievements are **never manually awarded** — each is earned deterministically
from stored evidence via the lifetime data layers. **No AI, no randomness.**
Tiered series (Bronze→Legend), one-off milestones, seasonal/yearly/lifetime
scopes, hidden achievements, progress %, rarity scoring, and an earned timeline.

```
Achievement = {
  id, seriesId|null, category, scope:"lifetime|seasonal|yearly", hidden,
  title, subtitle, tier:"Bronze|Silver|Gold|Platinum|Legend",
  rarity:"common|uncommon|rare|epic|legendary", rarityScore:0..100, iconId,
  earned, earnedDate, confidence,
  progress: { current, target, percent, remaining, isComplete },
  remaining, evidence:{ count, detail },
  supportingMemories:[Entry], supportingTrips:[{tripId,name}], statistics,
}
Achievements = {
  summary: { totalEarned, totalAvailable, completion, byTier, rarityScore },
  categories: [{ id, label, icon, total, earned }],
  series: [{ id, category, title, icon, levels:[{tier,title,achievementId,earned}], currentTier, nextTier, progressToNext }],
  achievements: [Achievement],          // all (earned + locked, with progress)
  earned: [achievementId],
  timeline: [{ achievementId, title, tier, category, earnedDate }],   // earned, chronological
  rewards: [{ achievementId, tier, badge, frame, titleUnlock }],
  statistics: { totalEarned, totalAvailable, completion, byTier, byCategory, rarityScore, legendCount, hiddenEarned },
}
```

Categories include Countries, Islands, Cities, Continents, Flights, Ferries, Road
Trips, Diving, Surfing, Hiking, Mountains, Beaches, Photography, Wildlife, Food,
Culture, Adventure, Return Traveller, National Parks, UNESCO, Seasonal, Yearly,
Lifetime. Earned dates are the moment the threshold was crossed (the Nth
qualifying event). Hidden milestones (e.g. *Returned to Same Island*, *Most
Remote Island*) only matter once earned. All deterministic, offline-first, no
backend leakage.

### Lifetime Travel Timeline DTO (M30)

The traveller's **entire travel life** as one chronological story of typed
moments — **no AI, no generated prose**. Assembled from the achievements, world,
globe, relationships and memory engines; the UI renders it with almost no logic.

```
LifetimeTimeline = {
  summary: { totalMoments, years, chapters, span, firstMoment, latestMoment, byType },
  years:   [{ year, summary:{trips,countries,places,memories,photos,moments}, months:[TravelMonth], momentIds, topMoment }],
  chapters:[{ id, title:"2024–2026", years, from, to, summary:{years,countries,memories,moments} }],   // travel eras
  moments: [Moment],   // chronological
  filters: { byYear, byMonth, byCountry, byCompanion, byActivity, byAchievement, favourites, firsts, returns },
}
TravelMonth = { year, month, label, momentIds, momentCount }
Moment = {
  id, type:"first-visit|milestone|achievement|return|relationship|memory|journey",
  title, subtitle, date, year, month,
  supportingMemories:[Entry], supportingTrips:[{tripId,name}],
  relatedAchievements:[id], relatedPlaces:[name], relatedCompanions:[name],
  emotionalTone:"joyful|proud|nostalgic|warm|reflective|adventurous",
  iconId, confidence, evidence:{count,detail}, category, tier, favourite,
}
```

Includes first trip / first country / island / flight / dive / memory / first
trip with a companion, returns to the same place, longest trip, most photographed
day, major achievements, favourite memories, yearly & monthly summaries, travel
eras (chapters), and relationship / country / island milestones. All
deterministic, offline-first, no backend leakage.

### Travel Wrapped DTO (M31)

A Spotify-Wrapped-style deck for a future SwiftUI experience. It **composes
existing engines only** (lifetime timeline, world, journey replay, achievements,
travel DNA, life story, relationships) — **no new intelligence, no AI, no prose
generation**. Pure presentation; the UI renders the ordered `sections` deck.

```
TravelWrapped = {
  headline: { statement, favouriteDestination, mostActiveYear, span },
  stats: { countries, cities, islands, continents, travelDays, trips, flights,
           ferries, dives, photos, beachDays, returnVisits, memories },
  highlights: { favouriteDestination, favouriteCountry, favouriteCompanion,
                longestTrip, mostActiveYear, mostPhotographedDay, firstTrip },
  bySeason: [{ season, moments }],                 // reshape of timeline moments
  achievements: { totalEarned, completion, rarityScore, topBadges:[{id,title,tier,category,earnedDate}] },
  travelDna: { headline, topTraits:[{id,label,statement,score}] },
  lifeStory: [{ id, title, framing }],
  sections: [{ id, kind, title, value, subtitle, accent, icon }],   // ordered deck
  years: [{ year, summary, countries, topMoment, topAchievement, bySeason, momentIds }],
}
```

Every value is pulled verbatim from the source engines (e.g. `stats.countries ===`
world `totalCountries`, `stats.dives ===` the diving achievement's current
count). Deterministic, offline-first, no backend leakage.

### On This Day DTO (M32)

Everything that happened on the **same calendar day (month + day) across previous
years**. **Composes existing engines only** (lifetime timeline + shared enrichment
+ journey transport tagging) — **no new intelligence, no AI, no prose**. The
reference date is an explicit argument (the API defaults it to today), so the
engine is deterministic. Media is exposed as **references only** (`mediaRefs`),
never loaded.

```
OnThisDay = {
  date, monthDay:"MM-DD", referenceYear, hasMemories, label,
  hero: OnThisDayMoment | null,
  items: [OnThisDayMoment],                 // chronological (oldest first)
  byYear: [{ year, yearsAgo, count, place, itemIds }],
  anniversaryBadges: [{ yearsAgo, label, count }],
  milestones: [itemId],
  comparisons: [{ year, yearsAgo, headline, place, count }],
  categories: [{ category, count }],
}
OnThisDayMoment = {
  id, sourceId, type, category, title, subtitle, date, year, yearsAgo,
  isMilestone, isAnniversary, borderCrossing,
  place, companions:[], relatedAchievements:[],
  supportingMemories:[Entry], mediaRefs:[ref],
  emotionalTone, iconId, confidence, evidence, tier, favourite,
}
```

Covers trips, transport legs (flights/ferries/trains via the journey engine),
dives/surf/hikes/beaches/photos (via memory cats), favourite memories,
achievements, companions, countries/cities/islands, return visits, first-time
experiences and milestones — each tagged with `yearsAgo` (anniversaries). Empty
days return a valid empty-state DTO. Deterministic, offline-first, no leakage.

### Memory Collections DTO (M33)

Auto-generated themed travel collections — **composed from existing engines only**
(shared enrichment, journey transport, lifetime world, achievements, lifetime
timeline). **No new intelligence, no AI, no prose.** Each is evidence-gated (min
members) so thin data never fabricates a collection.

```
Collections = { collections: [Collection], summary: { total, byType }, basedOn }
Collection = {
  id, type:"activity|transport|media|place|country|companion|trip", hidden,
  title, subtitle, icon, sortOrder,
  coverCandidate: { memoryId, photoRef } | null,
  timeSpan: { from, to },
  locations:[name], companions:[name], journeyCount,
  mediaRefs:[ref], achievementRefs:[id], highlightRefs:[momentId], memoryRefs:[id],
  statistics: { memories, photos, days, locations, companions, journeys },
}
```

Collection families: activities (Diving, Surf, Mountains, Beaches, City Breaks,
Food, Wildlife) via memory cats + achievement detectors; transport (Flights,
Ferry, Train, Road) via the journey engine; places (Island Escapes, National
Parks, UNESCO, Favourite Places) via the lifetime world; per-country ("Exploring
{Country}"), per-companion ("Travelling with {name}"), and trip-shape (Weekend
Trips, Long Expeditions). `achievementRefs`/`highlightRefs` cross-reference the
achievement and timeline engines. Media is references only. Deterministic,
offline-first, no backend leakage.

### Story Composer DTO (M34)

An immersive, chronological travel story — **composed, never generated**. It
weaves the lifetime timeline (typed moments) with the journey engine (transport
transitions + location/border changes), grouped into chapters → days. **No AI, no
prose generation.** Media/achievements/companions are references only.

```
Story = { story: { span, chapterCount, momentCount, transitionCount, hero },
          chapters: [StoryChapter], hero: { id, title, date, iconId } | null,
          anchors: [{ id, type:"chapter|day", date, title?, label?, chapterId }], basedOn }
StoryChapter = { id, title, subtitle, span, years, hero, days:[StoryDay],
                 highlights:[id], milestones:[id], transitions:[id], statistics, sortOrder }
StoryDay = { id, date, label, moments:[StoryMoment], transitions:[StoryTransition],
             flow:[{ kind:"moment|transition", refId, date }], hero, milestones:[id],
             locationChanges:[{ id, from, to, crossedCountry }] }
StoryMoment = { id, sourceId, type, kind, title, subtitle, date, time, isHero, isMilestone,
                emotionalTone, iconId, mediaRefs:[ref], achievementRefs:[id], companionRefs:[name], place, confidence, evidence }
StoryTransition = { id, kind:"transport", transport, icon, from, to, date, time,
                    crossedCountry, locationChange, mediaRefs:[ref], inferred }
```

`flow` is the per-day render order (transitions set the scene, then moments, by
time). `anchors` drive scroll/scrub. Deterministic, offline-first, references
only, no backend leakage.

### Journey Cinematic DTO (M35)

A deterministic **storyboard** playback model for a future premium SwiftUI
experience — **not a video renderer, not an AI story generator, creates no
media**. It composes the story composer + journey + lifetime timeline into an
ordered set of scenes with **fixed-enum** transition / pacing / emotion hints and
**references only**.

```
Cinematic = {
  cinematicId, scope:"lifetime", sourceJourneyId|null, dateRange:{from,to},
  scenes:[Scene], sceneOrder:[id],
  openingScene:id|null, closingScene:id|null, heroScene:id|null,
  statistics:{ scenes, byType, locations, companions, mediaCount, milestones, hasHero },
}
Scene = {
  id, order, type, title, subtitle, timelineAnchor, dateRange,
  locationRefs:[name], mapRefs:[{place,isIsland}], companionRefs:[name],
  mediaRefs:[ref], achievementRefs:[id],
  transitionHint, pacingHint, emotionalCategory,   // FIXED enums only
  heroCandidate, isMilestone, sourceKind, sourceRef, chapterId, dayId, transport?,
}
```

Fixed enums (exported): `SCENE_TYPES` (departure, arrival, transport,
first-moment, location-change, border-crossing, beach, island, dive, surf, hike,
food, city, sunset, milestone, achievement, final-evening, journey-home, memory,
photo, other), `EMOTIONS`, `TRANSITION_HINTS`, `PACING_HINTS`. The opening
`departure` and closing `journey-home` are synthesised from home bookends; the
hero scene mirrors the story hero. Deterministic, offline-first, references only,
no backend leakage.

### Experience Presentation contract (M36)

The **single composition layer** for all premium experiences. It creates no new
intelligence — it **adapts** each experience engine (Travel Wrapped, On This Day,
Memory Collections, Story Composer, Journey Cinematic) into ONE shared,
serialisable contract so SwiftUI screens never rebuild presentation logic.

```
ExperiencePresentation = {
  id, experience, title, subtitle,
  hero: Hero | null, sections: [Section], timeline: Timeline | null,
  statistics: { items: [Stat] }, generatedFrom: [engineName], basedOn,
}
Hero    = { id, kind, title, subtitle, mediaRef|null, mapRef|null, accent, icon }
Section = { id, kind, title, layout, cards: [Card], subtitle? }     // layout ∈ SECTION_LAYOUTS
Card    = { id, kind, title, subtitle, value, date, accent, icon, emphasis,
            mediaRefs:[MediaRef], mapRefs:[MapRef], achievementRefs:[AchRef], companionRefs:[name], sourceRef }
Timeline = { anchors:[{ id, date, label, kind }], entries:[] }
Stat    = { id, label, value, unit, icon }
MediaRef = { photoRef }            // reference only
MapRef   = { place, isIsland, latitude, longitude }   // coords null until resolved
AchRef   = { id }
```

Fixed enums (exported): `SECTION_LAYOUTS` (hero, deck, grid, list, carousel,
stat-grid, timeline), `CARD_KINDS`, `EMPHASIS`, `EXPERIENCES`. `GET /experiences`
lists the catalogue; `GET /experience?name=` returns the contract for one. All
deterministic, offline-first, references only, no backend leakage.

### Experience Design Tokens (M37)

Deterministic, platform-neutral **visual guidance** that maps the presentation
contract's enums to design tokens — **not UI, not CSS, not animation, not AI
design**. Static + serialisable; built from fixed enums and deterministic
mappings.

```
DesignTokens = {
  version, palette:{ token:{token,hex,on,role} }, typography, spacing, radii, elevation,
  layouts:{ <SECTION_LAYOUT>:{ columns, scroll, cardStyle, snap, spacing, connector } },
  cards:{ byKind:{ <CARD_KIND>:{ surface, accentUsage, density, showMedia, titleType, valueType } },
          defaults:{ radius, elevation, mediaShape, scale }, emphasisModifiers:{ <EMPHASIS>:{…} } },
  hero, timeline, statistic, media, map,
  achievement:{ Bronze|Silver|Gold|Platinum|Legend:{ tier, swatch, glow, badgeShape, emphasis } },
  emptyState, moods, enums,
}
ExperienceTokens = {
  experience, identity:{ id, title, subtitle, accent, secondaryAccent, icon, mood, gradient,
                         accentSwatch, secondarySwatch, gradientSwatches, heroLayout },
  hero, timeline, statistic, media, map, achievement, emptyState, system,
}
```

`cardTreatment(kind, emphasis)` resolves a card's treatment deterministically
(base × emphasis modifier). Every accent referenced resolves to a palette swatch
(`{token, hex, on, role}`). Covers all five experiences. Deterministic,
offline-first, serialisable, no backend leakage.

### Experience Navigation DTO (M38)

One deterministic model describing how the premium experiences connect — a graph
to navigate by, **not UI / SwiftUI navigation / routing**. Reuses the experience
index (availability) + design-token identities. **No AI, no randomness, no
Date.now.**

```
Navigation = {
  graph: { nodes:[NavNode], edges:[{ from, to, relation:"related" }] },
  entryPoints:[id], defaultEntry:id|null,
  recommendedSequence:[id], availableSequence:[id],
  cursor: { current, next, previous } | null,        // when ?current= is given
  timelineAnchors:[{ order, experience, deepLink }],
  emptyState: { title, subtitle, icon, cta:{id,label,deepLink} } | null,
  meta: { version, experienceCount, availableCount, hasMemories }, basedOn,
}
NavNode = {
  id, title, subtitle, icon, mood, accent, accentSwatch,
  deepLink:"travelapp://experience/<id>", available, entryPoint,
  related:[id], recommendedNext:id|null, previous:id|null,
  quickActions:[{ id, label, icon }], timelineAnchor:{ experience, deepLink }, meta,
}
```

`recommendedNext`/`previous` chain over the available experiences in a fixed
recommended order; `defaultEntry`/`entryPoints` follow a fixed entry priority;
edges are a curated adjacency. Empty history → unavailable nodes + an
empty-state CTA. Deterministic, serialisable, no backend leakage.

### Experience Recommendations DTO (M39)

A deterministic, **rule-based** layer suggesting which premium experience to view
next — **not AI, not ML, not generated reasoning**. Every recommendation comes
from fixed rules over existing engine outputs, with fixed enums. The reference
date is an explicit argument (defaults to today).

```
Recommendations = {
  version, referenceDate,
  recommendations: [Recommendation],   // de-duped by target, sorted by score desc
  top: id | null,
  continuation: { current, next, previous } | null,   // when ?current= given
  emptyState: { title, subtitle, icon, cta } | null,
  meta: { count, hasMemories }, basedOn,
}
Recommendation = {
  id, rank, reasonCode, category, priority, score,
  sourceExperience: id|null, targetExperience: id,
  title, accent, icon,
  supportingRefs: [{ type, id }], timelineAnchors:[{experience,deepLink}], quickActions:[{id,label,icon}],
  expiry: { condition, date? }, deepLink,
}
```

Fixed enums (exported): `REASON_CODES` (ON_THIS_DAY_MATCH, NEW_ACHIEVEMENTS,
STORY_READY, RICH_COLLECTIONS, WRAPPED_READY, CINEMATIC_READY, START_HERE),
`CATEGORIES`, `PRIORITIES`, `EXPIRY_CONDITIONS`. One recommendation per target
(highest score wins); continuation is a separate pointer. Deterministic,
serialisable, no backend leakage.

### Home DTO (M40)

The single deterministic model for the home screen — it **assembles** the daily
dashboard from existing engines (recommendations, navigation, world, on-this-day,
collections, achievements, lifetime timeline). **No new intelligence, no AI, no
prose.** The reference date is explicit (defaults to today).

```
Home = {
  version, referenceDate, hasMemories,
  hero: { experience, title, subtitle, accent, icon, deepLink, reasonCode, priority } | null,
  todaysRecommendation: Recommendation | null, moreRecommendations: [Recommendation],
  continueJourney: { current, next, previous, resume, nextDeepLink },
  onThisDay: { available, label, count, hero, deepLink },
  recentMemories: [{ id, title, date, kind, icon, place, mediaRefs }],     // newest-first, refs only
  favouriteCollections: [{ id, title, subtitle, count, cover, icon, deepLink }],
  currentAchievements: { totalEarned, completion, rarityScore, recent:[{id,title,tier,earnedDate}], deepLink },
  travelStatistics: { items:[{ id, label, value, icon }] },
  quickActions: [{ id, label, icon, deepLink }],
  timelineSnapshot: { span, years:[{ year, memories, countries }] },
  destinationsOverview: { totalCountries, totalIslands, totalCities, mostVisitedCountry, topPlaces:[{name,type,country,visitCount}] },
  navigationShortcuts: [{ id, title, icon, accent, deepLink }],
  emptyState: { title, subtitle, icon, cta } | null,
  sectionOrder: [sectionId],     // deterministic; present sections only
  meta: { generatedFrom }, basedOn,
}
```

Empty history returns a welcome empty-state with only a capture action.
Deterministic, serialisable, references only, no backend leakage.

### Search DTO (M41)

One deterministic search across every premium experience. It **indexes existing
engine outputs** and matches with **simple token matching** — **no AI, no
embeddings, no ML, no fuzzy scoring**. Reference layer only.

```
Search = {
  version, query, hasQuery,
  matchedSections:[kind], grouped:[{ kind, count, results:[Result] }], results:[Result],
  navigationTargets:[{ experience, deepLink }], experienceTargets:[{ experience, deepLink }],
  timelineAnchors:[{ id, date, experience, deepLink }],
  mapReferences:[{ place, isIsland }], mediaReferences:[ref],
  statistics:{ total, byKind }, emptyState:{ kind, title, subtitle, suggestions } | null, basedOn,
}
Result = { id, kind, title, subtitle, score, target:{experience,deepLink}, ref:{type,id}, date, place, mediaRefs, earned? }
```

Kinds (`SEARCH_KINDS`): experience, country, island, city, companion, collection,
achievement, activity, transport, story-chapter, cinematic-scene, memory,
timeline-event. Matching = query tokens vs indexed tokens (substring); ranked by
matched-token count (+ all-match / exact-title bonuses), then kind, then title.
Dates match via year + month-name tokens. Empty query → a browse empty-state with
suggestions; no match → a no-results empty-state. Deterministic, serialisable,
references only, no backend leakage.

### Traveller Profile DTO (M42)

One canonical traveller profile **assembled entirely from existing engines** —
**no new intelligence, no AI, no prose**. The reference date is explicit
(defaults to today).

```
Profile = {
  version, referenceDate, hasProfile,
  identity: { since, latest, span, mostVisitedCountry, favouritePlace, signature } | null,
  hero: { title, subtitle, accent, icon, mediaRef, mapRef } | null,
  travelDna: { headline, topTraits:[{id,label,statement,score}] } | null,
  lifetimeStatistics: { …world.statistics },
  favouriteCountries|favouriteCities|favouriteIslands: [{ name, country?, visitCount, deepLink? }],
  favouriteCompanions: [{ name, sharedMemories, deepLink }],
  favouriteActivities|favouriteTransport: [{ id, title, count }],
  favouriteCollections: [{ id, title, subtitle, count, cover, deepLink }],
  achievementSummary: { totalEarned, completion, rarityScore, top:[{id,title,tier}], deepLink } | null,
  storyHighlights | cinematicHighlights | wrappedHighlights: { …, deepLink } | null,
  currentRecommendations: [Recommendation], recentMemories: [{ id, title, date, kind, place, mediaRefs }],
  timelineSummary: { span, momentCount, years:[{year,memories}] } | null,
  mediaReferences:[ref], mapReferences:[{place,isIsland}], achievementReferences:[{id,tier}],
  statistics:{ items:[{id,label,value,icon}] }, deepLinks:[{experience,title,deepLink}],
  emptyState: { title, subtitle, icon, cta } | null, meta, basedOn,
}
```

Composes world, travel-DNA, achievements, collections, story, cinematic, wrapped,
recommendations, navigation and the lifetime timeline. Empty history → a profile
empty-state with a capture CTA. Deterministic, serialisable, references only, no
backend leakage.

### Traveller Timeline DTO (M43)

Every known travel event assembled into **one complete chronological life
stream** — composed from existing engines (lifetime moments, journey transport
legs, story chapters, yearly markers). **No new intelligence, no AI.** Distinct
from `/timeline` (the per-trip consumer day-feed); this is the lifetime stream.

```
TravellerTimeline = {
  version, entries:[Entry], span:{from,to},
  statistics:{ total, byType }, byYear:[{ year, count, entryIds }],
  emptyState:{ title, subtitle, icon, cta } | null, basedOn,
}
Entry = {
  id, orderingIndex, type, title, subtitle, date,
  locationRefs:[name], companionRefs:[name], mediaRefs:[ref], achievementRefs:[id],
  ref:{ type, id }, navigationTarget:{ experience, deepLink },
}
```

Entry types (`TIMELINE_ENTRY_TYPES`): trip, flight, ferry, transport,
border-crossing, country, island, city, dive, surf, memory, achievement,
milestone, relationship, return, story-anchor, year. Ordered by date with
deterministic tiebreaks; each entry carries a navigation target. Deterministic,
serialisable, references only, no backend leakage.

> **Note:** exposed at `GET /traveller-timeline` to avoid colliding with the
> existing `GET /timeline` (per-trip consumer day-feed). Repointing `/timeline`
> to this engine is a one-line change if desired.

### Traveller Passport DTO (M44)

A compact, offline-first **traveller passport**: cover, credentials, stamps,
year pages and highlights composed from the canonical profile (M42) plus the
complete traveller timeline (M43). **No new intelligence, no AI.** This is a
presentation DTO for a passport/stamp-book UI.

```
Passport = {
  version, referenceDate, hasPassport,
  cover:{ title, subtitle, heroPlace, country, mediaRef, accent, deepLink } | null,
  identity:{ since, latest, favouritePlace, mostVisitedCountry, signature } | null,
  credentials:{ countries, islands, cities, travelDays, memories, achievements, timelineEntries, years },
  stamps:[Stamp],
  pages:[{ year, count, stampIds, types:[{type,label}] }],
  highlights:{ first, latest, recent:[stampId], transport:[stampId] },
  references:{ media:[ref], map:[{place,isIsland}], achievements:[{id}] },
  actions:[{ id, label, deepLink, icon }],
  emptyState:{ title, subtitle, icon, cta } | null,
  meta, basedOn,
}
Stamp = {
  id, orderingIndex, type, label, subtitle, date, icon, accent,
  locationRefs:[name], companionRefs:[name], mediaRefs:[ref], achievementRefs:[id],
  ref:{ type, id }, deepLink,
}
```

Stamp types (`PASSPORT_STAMP_TYPES`): trip, country, island, city, flight,
ferry, transport, border-crossing, dive, surf, achievement, return. Stamps are
ordered by timeline date with deterministic tiebreaks. Credentials mirror source
engine values; references are ids only, no media binaries or backend records.

### Traveller Statistics DTO (M45)

A deterministic **traveller statistics** presentation model composed from the
traveller profile, passport, traveller timeline, collections and achievements.
It adds no new detectors and no intelligence; values mirror existing source
engine outputs.

```
Statistics = {
  version, referenceDate, hasStatistics,
  headline:[Metric],
  metrics:[Metric],
  groups:[{ id, title, icon, metricIds }],
  milestones:{
    firstTrip:{ id, title, destination, country, startDate, endDate } | null,
    latestTrip:{ id, title, destination, country, startDate, endDate } | null,
    firstTimelineEntry:{ id, title, date } | null,
    latestTimelineEntry:{ id, title, date } | null,
  },
  sourceSummaries:{
    profile, passport, travellerTimeline, achievements, collections,
  },
  highlights:{ topCollections, topAchievements, timelineYears },
  references:{ media:[ref], map:[{place,isIsland}], achievements:[{id}] },
  actions:[{ id, label, deepLink, icon }],
  emptyState:{ title, subtitle, icon, cta } | null,
  meta, basedOn,
}
Metric = {
  id, label, value, unit:"count", icon, group, source,
}
```

Metrics include countries, cities, islands, dives, flights, ferries, nights
travelled, trips completed, memories captured, achievements unlocked,
collections completed and timeline entries. `source` names the composed engine
field that supplied the value. Deterministic, serialisable, reference-only, no
backend leakage.

### Traveller Insights DTO (M46)

Fixed-category **traveller insight cards** composed from statistics, passport,
profile, traveller timeline, collections, achievements and relationships. This
is **not AI**, **not generated prose**, and **not recommendation logic**: every
card uses a fixed title and fixed reason code.

```
Insights = {
  version, referenceDate, hasInsights,
  cards:[InsightCard],
  categories:[{ id, count }],
  reasonCodes:[code],
  sourceSummaries:{ statistics, passport, profile, travellerTimeline, collections, achievements, relationships },
  actions:[{ id, label, deepLink, icon }],
  emptyState:{ title, subtitle, icon, cta } | null,
  meta, basedOn,
}
InsightCard = {
  id, rank, category, title, reasonCode, value, icon, accent, source,
  refs:{
    metricIds, stampIds, entryIds, collectionIds, achievementIds,
    companionRefs, mapRefs, mediaRefs,
  },
}
```

Reason codes (`INSIGHT_REASON_CODES`): most visited country, most active travel
year, favourite activity, strongest travel style, biggest collection, longest
travel streak, most repeated destination, first major milestone, latest
achievement, ocean/island/beach tendency and companion-based insight.
Deterministic, serialisable, reference-only, no backend leakage.

### Traveller Highlights DTO (M47)

Fixed-category **traveller highlight cards** selected from existing outputs:
insights, statistics, passport, profile, traveller timeline, collections,
achievements, story composer and cinematic. This is **not AI**, **not generated
prose**, and **not recommendations**: every card uses a fixed title and fixed
reason code.

```
Highlights = {
  version, referenceDate, hasHighlights,
  cards:[HighlightCard],
  categories:[{ id, count }],
  reasonCodes:[code],
  sourceSummaries:{ insights, statistics, passport, profile, travellerTimeline, collections, achievements, story, cinematic },
  actions:[{ id, label, deepLink, icon }],
  emptyState:{ title, subtitle, icon, cta } | null,
  meta, basedOn,
}
HighlightCard = {
  id, rank, category, title, reasonCode, value, icon, accent, source,
  refs:{
    tripIds, metricIds, insightIds, stampIds, entryIds, collectionIds,
    achievementIds, storyMomentIds, sceneIds, companionRefs, mapRefs, mediaRefs,
  },
}
```

Reason codes (`HIGHLIGHT_REASON_CODES`): first trip, latest trip, biggest trip,
longest trip, top achievement, most meaningful collection, most active year,
favourite destination, most repeated place, strongest activity theme, companion
highlight, island/ocean/beach highlight, story hero moment and cinematic hero
scene. Deterministic, serialisable, reference-only, no backend leakage.

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
