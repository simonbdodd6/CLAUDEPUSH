# Travel App — Product Vision & Future Integrations

> A living document. It captures where the traveller experience is going so we
> build toward it deliberately — **without** building speculative integrations
> early. Nothing here is implemented yet. Each milestone (M24+) must make the
> app *feel* better for the traveller, not just improve architecture.

## North star

Think **Apple** (simplicity), **Instagram** (aesthetics), **Meta** (polish),
**Airbnb** (usability), **Day One** (journaling intimacy), **Polarsteps**
(journey storytelling). The app is a beautiful, emotional, offline-first record
of a journey — memory-first, premium, delightful.

## Product principles

1. **Memory-first.** The timeline is a story, not a log. Every screen earns its
   place by helping the traveller relive or anticipate a moment.
2. **Offline-first.** It must feel instant and complete on a plane, a boat, or a
   dive boat with no signal. Sync is invisible.
3. **Apple-quality.** Restraint, typography, motion, haptics. Nothing shouts.
4. **Privacy by design.** No exact location ever leaves the platform; photos are
   references; integrations are opt-in and least-privilege.
5. **Zero platform duplication.** Experience lives in the product (API
   presenters + app); business rules stay in the frozen platform modules.
6. **Integrations enrich, never gate.** The core journey works with zero
   integrations connected.

## How integrations are staged

Each candidate below is rated:
- **Why** — the traveller value (not the technical novelty).
- **Complexity** — Low / Medium / High (auth + data model + maintenance).
- **Tier** — MVP (this product's first real release), V2 (post-launch depth),
  V3 (ambitious / niche / heavy).
- **Possible API** — the realistic integration surface (subject to change).

---

## A. Apple ecosystem (highest priority — native, trusted, offline-friendly)

### Apple Photos
- **Why:** The journey is mostly photos. Auto-surface the day's shots as memory
  cards; let the traveller attach a photo to a moment without leaving the app.
- **Complexity:** Medium. On-device only; must strip EXIF GPS before any
  reference leaves the device (platform forbids exact location).
- **Tier:** MVP (read/attach by local reference) → V2 (smart "moments" grouping).
- **Possible API:** PhotoKit (`PHPhotoLibrary`, `PHAsset`), `PHPickerViewController`.

### Apple Health
- **Why:** Context that makes memories richer — steps walked exploring a city,
  a long hike, sleep on a red-eye, workouts on the trip.
- **Complexity:** Medium. Sensitive; explicit per-type consent; read-only.
- **Tier:** V2.
- **Possible API:** HealthKit (`HKHealthStore`, workouts, steps, sleep).

### Apple Wallet
- **Why:** Boarding passes, hotel keys, event tickets surfaced on the right day
  of the timeline; "today you fly" moments.
- **Complexity:** Medium–High (PassKit add flow, no general read of others' passes).
- **Tier:** V2 (add passes we generate) → V3 (deep boarding-pass awareness).
- **Possible API:** PassKit (`.pkpass`), Wallet add APIs.

### Apple Maps
- **Why:** Beautiful, native, privacy-respecting place context and route
  snapshots for a day — without sending location off device.
- **Complexity:** Medium. Keep approximate-area only (no exact pins persisted).
- **Tier:** V2.
- **Possible API:** MapKit, `MKLocalSearch`, Look Around snapshots.

---

## B. Journey & travel logistics

### Flighty
- **Why:** Best-in-class flight tracking; "where am I in the journey" with live
  delays. A premium traveller's flights become first-class timeline moments.
- **Complexity:** Medium (no broad public partner API today; may need manual/
  share-in or deep links initially).
- **Tier:** V2 (deep link / share-in) → V3 (data partnership).
- **Possible API:** Share-extension import; partner API if available.

### TripIt
- **Why:** Aggregated itinerary (flights, hotels, cars) auto-imported so the
  traveller never types an itinerary by hand.
- **Complexity:** Medium. OAuth + structured trip data.
- **Tier:** V2.
- **Possible API:** TripIt API (OAuth 1.0a; `/list/trip`, `/get/trip`).

### Polarsteps
- **Why:** Reference experience for journey maps + auto travel tracking; possible
  import of a traveller's existing trips.
- **Complexity:** Medium–High (no official public API; import via export files).
- **Tier:** V3 (import from export).
- **Possible API:** User data export import; unofficial endpoints (avoid).

### Booking.com
- **Why:** Accommodation in the itinerary auto-populated; check-in/out as
  timeline anchors.
- **Complexity:** High (affiliate/partner program, approval, compliance).
- **Tier:** V3.
- **Possible API:** Booking.com Demand/Affiliate Partner API.

### Airbnb
- **Why:** Same as Booking — stays as itinerary anchors; "your home for Bali".
- **Complexity:** High (no open public API; partner-only).
- **Tier:** V3 (or email/forward-parse as a pragmatic stopgap).
- **Possible API:** Partner API (restricted); itinerary email parsing.

### Uber / Grab / Gojek (ride-hailing; Grab & Gojek crucial in Indonesia/SE-Asia)
- **Why:** Ground transport is the connective tissue of a trip in Bali/Jakarta;
  surface rides as small timeline moments and quick "get a ride" actions.
- **Complexity:** High (regional APIs, OAuth, deep-link vs data access differ).
- **Tier:** V3 (deep-link "open a ride" first; data import later).
- **Possible API:** Uber Deeplinks/Rides API; Grab Partner API; Gojek (limited —
  likely deep links only).

### Google Maps
- **Why:** Place search, saved lists, timeline-style location history that could
  enrich days (with care — approximate only).
- **Complexity:** Medium–High (billing, ToS, location sensitivity).
- **Tier:** V3 (and only approximate; Apple Maps preferred for privacy).
- **Possible API:** Places API, Maps SDK; Timeline export (manual).

---

## C. Adventure, dive & outdoors (a signature niche for this traveller)

### Garmin Connect
- **Why:** Activities (hikes, rides, swims), routes, and health context as rich
  timeline moments — "you climbed 1,200m today".
- **Complexity:** Medium–High (OAuth; developer program approval).
- **Tier:** V2.
- **Possible API:** Garmin Connect Developer / Health & Activity APIs (OAuth 1.0a/2).

### Garmin Dive
- **Why:** Dive logs (depth, time, profile) become beautiful underwater memory
  cards — a standout for a diving traveller.
- **Complexity:** High (specialised data; access via Garmin Connect dive data).
- **Tier:** V3.
- **Possible API:** Garmin Connect (dive activity data) where exposed.

### PADI
- **Why:** Verified certifications + a digital dive log; "Dive #142, Tulamben".
- **Complexity:** High (partner access; consumer API limited).
- **Tier:** V3.
- **Possible API:** PADI partner API / digital card (limited); manual log import.

### SSI (Scuba Schools International)
- **Why:** Same value as PADI for SSI-certified divers (cert + logbook).
- **Complexity:** High (limited public API).
- **Tier:** V3.
- **Possible API:** SSI MySSI partner integration (limited); manual import.

### Shearwater Cloud
- **Why:** Gold-standard dive-computer logs (detailed profiles, gas, deco) for
  serious divers — the richest possible dive memory.
- **Complexity:** High (desktop-sync ecosystem; export-file import most realistic).
- **Tier:** V3.
- **Possible API:** Shearwater Cloud export (UDDF/CSV) import; no broad public API.

---

## D. Capture & media (the look and feel of memories)

### GoPro Quik
- **Why:** Action/dive footage is core to adventure memories; import highlights
  as media moments.
- **Complexity:** High (limited public API; cloud + on-device transfer).
- **Tier:** V3.
- **Possible API:** GoPro cloud/media APIs (limited); local file import; share-in.

### DJI
- **Why:** Drone footage gives the "Polarsteps aerial" wow; epic establishing
  shots for a destination.
- **Complexity:** High (SDK is for control/telemetry, not a clean media API).
- **Tier:** V3.
- **Possible API:** DJI Mobile/Media SDK (heavy); pragmatic = file import.

---

## E. Soundtrack & movement (emotional texture)

### Spotify
- **Why:** A trip has a soundtrack. "What you listened to in Bali" or a
  per-trip playlist deepens the emotional replay.
- **Complexity:** Medium (OAuth; recently-played / playlist scopes).
- **Tier:** V2.
- **Possible API:** Spotify Web API (OAuth 2 PKCE; recently played, playlists).

### Strava
- **Why:** Social fitness journeys — runs/rides as shareable, map-rich moments
  for active travellers.
- **Complexity:** Medium (OAuth 2; rate limits; webhook for new activities).
- **Tier:** V2.
- **Possible API:** Strava API v3 (OAuth 2; activities, webhooks).

---

## F. Feed, memory & storytelling intelligence (added M24.1)

These deepen the *feel* of the feed/stats experience rather than pulling in
third-party data. Still **not implemented** — captured here so the feed evolves
deliberately.

### On-device photo aesthetics (Vision framework)
- **Why:** Auto-pick the most beautiful photo of a day as the hero; classify
  scenes (beach/sunset/mountain/food/wildlife) to power memory categories from
  pixels, not just words — far richer than note keywords.
- **Complexity:** Medium. On-device only (privacy); no photo leaves the device.
- **Tier:** V2.
- **Possible API:** Apple Vision (`VNClassifyImageRequest`, saliency, aesthetics
  score), Core ML scene classifiers.

### Auto-generated trip recaps ("Year in Bali" / end-of-trip film)
- **Why:** Polarsteps/Apple Memories-style auto montage + a written recap of the
  journey — a delightful, shareable artifact.
- **Complexity:** Medium (compose from existing memories + music; on-device).
- **Tier:** V2 (still recap) → V3 (video montage).
- **Possible API:** AVFoundation (video), our own deterministic recap composer.

### Weather & golden-hour enrichment
- **Why:** "32°C, golden hour at 18:14" makes a sunset memory richer; backfill
  historical weather for a day/place (approximate area only).
- **Complexity:** Low–Medium (historical weather API by approximate area + date).
- **Tier:** V2.
- **Possible API:** Apple WeatherKit (current/forecast), historical weather
  providers (Open-Meteo, Visual Crossing).

### Currency & spend awareness
- **Why:** Gentle "what this trip cost" stats without being a finance app;
  per-day or per-country spend as a travel statistic.
- **Complexity:** Medium (manual entry first; bank/Wallet later — sensitive).
- **Tier:** V3.
- **Possible API:** Manual entry + FX rates API; Apple Wallet transactions (heavy/restricted).

### Maps-based "places visited" mosaic
- **Why:** A beautiful map of approximate areas visited (country/region tiles),
  feeding "countries" and "places visited" stats visually.
- **Complexity:** Medium (approximate regions only — never exact pins).
- **Tier:** V2 (Apple Maps snapshots) — see Apple Maps above.
- **Possible API:** MapKit snapshotter at region granularity.

## G. Travel intelligence deepeners (added M24.2)

The intelligence layer (`/intelligence`) is deterministic and derives only from
the traveller's own data. These would make it richer — still **not implemented**,
and several depend on integrations above (kept opt-in, privacy-first).

### Destination similarity graph ("places like ones you loved")
- **Why:** Power "places similar to Bali" / "you'd love Lombok" honestly, from a
  curated attribute graph (climate, vibe, activities) — not a black-box model.
- **Complexity:** Medium (build/curate a deterministic destination attribute set
  + similarity scoring; ships offline).
- **Tier:** V2.
- **Possible API:** Internal curated dataset; optionally enriched by geographic
  open data (no per-user location).

### Companion intelligence ("your favourite travel companion")
- **Why:** "You travel best with …", trips-together count — a warm, social
  Wrapped card.
- **Complexity:** Low–Medium (needs a lightweight "who came" capture; the
  relationship-graph platform already models companions).
- **Tier:** V2 (once companions are captured in-product).
- **Possible API:** Internal (relationship graph); Contacts (opt-in) for names.

### Accommodation & stay intelligence
- **Why:** "Your favourite place to stay" (villa vs hostel vs liveaboard), avg
  nights per stay — depends on itinerary/booking data.
- **Complexity:** Medium (needs stay data; pairs with TripIt/Booking/Airbnb).
- **Tier:** V3.
- **Possible API:** Itinerary platform + booking integrations (section B).

### Quiet-vs-busy preference
- **Why:** "You stay longer in quiet places" — correlate trip length with a
  destination's population/density tier.
- **Complexity:** Medium (needs a coarse density classification per destination,
  approximate only).
- **Tier:** V3.
- **Possible API:** Curated destination density tiers (offline dataset).

### Activity intelligence from wearables
- **Why:** "You take more photos underwater than on land" gets verified by actual
  dive logs; "longest dive streak" backed by Garmin Dive / Shearwater.
- **Complexity:** High (depends on dive/wearable integrations in sections C).
- **Tier:** V3.
- **Possible API:** Garmin Connect/Dive, Shearwater Cloud, Apple Health (section A/C).

### Year-in-review / Trip Wrapped
- **Why:** A seasonal, shareable "Travel Wrapped" deck assembled from these
  insights — the emotional payoff of the whole layer.
- **Complexity:** Low (composes existing `/intelligence` cards) → Medium (share art).
- **Tier:** V2.
- **Possible API:** Internal composer over `/intelligence`; share sheet for export.

## Integration design rules (when any of these is built)

- **Opt-in, least-privilege, read-only first.** Never request a scope before the
  feature needs it.
- **No exact location persisted, ever.** Approximate area only; strip GPS/EXIF at
  the edge (matches platform `assertNoExactLocation`).
- **Adapters, not couplings.** Each integration is an injected adapter behind a
  small product interface; the frozen platform modules never learn about a vendor.
- **Graceful absence.** Every feature must degrade to a great experience with the
  integration disconnected (offline-first, core-first).
- **No business-logic duplication.** Integrations feed data in; rules stay in the
  platform.

## Roadmap shape (indicative, not committed)

- **MVP:** Apple Photos (attach/surface). Everything else manual + premium.
- **V2:** Apple Health, Apple Maps, Apple Wallet, TripIt, Garmin Connect,
  Spotify, Strava, Flighty (deep-link/share-in).
- **V3:** Dive stack (Garmin Dive, PADI, SSI, Shearwater), media (GoPro, DJI),
  booking/rides (Booking, Airbnb, Uber, Grab, Gojek), Google Maps, Polarsteps
  import.
