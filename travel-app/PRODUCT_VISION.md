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

## H. Relationship & shared-journey deepeners (added M24.3)

The relationship layer (`/relationships`) is deterministic and derives only from
who you tag in a memory. These would make shared journeys richer — still **not
implemented**.

### Companions as graph entities (`COMPANION` + `TRAVELLED_WITH`)
- **Why:** Promote tagged names to first-class people so companion stats, circles
  and "friends met on multiple trips" are backed by the relationship graph (which
  already models `COMPANION` / `TRAVELLED_WITH`) rather than name strings.
- **Complexity:** Medium (identity resolution for names; merge duplicates).
- **Tier:** V2.
- **Possible API:** Internal (travel-relationship-graph); Contacts (opt-in) for
  real names/avatars.

### Shared wishlists & collaborative trips (Airbnb wishlist / Apple Family Sharing)
- **Why:** Plan a trip together — shared itinerary, shared "places to go",
  co-owned memories. The social core of the product.
- **Complexity:** High (multi-user auth, sync, permissions — beyond single-user MVP).
- **Tier:** V3.
- **Possible API:** Internal multi-user platform; CloudKit sharing for Apple-native sync.

### Spotify Blend-style "Travel Blend"
- **Why:** Merge two travellers' styles into a shared profile — "you and Manon
  both love reef dives and quiet beaches" — a delightful pairs card.
- **Complexity:** Medium (compose two `/intelligence` profiles deterministically).
- **Tier:** V2 (once a companion has their own profile / shared data).
- **Possible API:** Internal composer over two intelligence profiles.

### Occasion tagging (anniversaries, honeymoon, birthdays)
- **Why:** Unlocks "Anniversary trips" and "Honeymoon timeline" as their own
  beautiful stories — currently locked.
- **Complexity:** Low (a trip/memory occasion tag) → Medium (recurring anniversary detection).
- **Tier:** V2.
- **Possible API:** Internal (trip/memory metadata); Calendar (opt-in) for dates.

### Shared accommodation & "hotels you've shared"
- **Why:** Unlocks the locked "Hotels you've shared" card; "your favourite place
  to stay together".
- **Complexity:** Medium (needs stay data — pairs with TripIt/Booking/Airbnb, section B).
- **Tier:** V3.

### Face grouping for auto-companion suggestions (on-device)
- **Why:** Suggest "tag Manon?" from on-device photo face grouping — effortless
  companion capture, privacy-preserving.
- **Complexity:** High (on-device only; sensitive; opt-in).
- **Tier:** V3.
- **Possible API:** Apple Vision face grouping (on-device); never leaves device.

## I. Memory Engine deepeners (added M24.4)

The Memory Engine (`/memories`) assembles stories deterministically from existing
memories. These would make those stories richer and more cinematic — still **not
implemented**. Several depend on integrations in sections A–C.

### Photo-backed reels & covers (Apple Photos / Google Photos)
- **Why:** Today reels reference `photoRef` only; with the photo libraries the
  app can render real cinematic reels and auto-pick the most beautiful cover.
- **Complexity:** Medium (on-device; strip EXIF GPS before any reference leaves).
- **Tier:** V2.
- **Possible API:** PhotoKit / `PHPickerViewController`; Google Photos Library API.

### Cinematic recap films (GoPro / DJI / AVFoundation)
- **Why:** Turn the deterministic recap + reels into an actual shareable film,
  with action/aerial footage cut to the trip's beats.
- **Complexity:** High (media transfer + on-device composition).
- **Tier:** V3.
- **Possible API:** GoPro/DJI media import; AVFoundation for composition.

### Map-animated journey chapters (Apple Maps / Polarsteps)
- **Why:** Each chapter animates across an approximate-region map — the
  Polarsteps "watch your journey move" moment.
- **Complexity:** Medium (region granularity only; never exact pins).
- **Tier:** V2–V3.
- **Possible API:** MapKit snapshotter / overlays.

### Sensor-enriched story cards (Garmin / dive logs / Apple Health / Weather / Surfline)
- **Why:** "Your best dive day" gains real depth/time from a dive log; "your
  longest day" gains steps/elevation; "first sunset" gains the actual golden-hour
  time and conditions; surf days gain swell.
- **Complexity:** High (depends on wearable/dive/weather/surf integrations).
- **Tier:** V3.
- **Possible API:** Garmin Connect/Dive, Shearwater Cloud & other dive-log
  providers, Apple Health (HealthKit), Apple WeatherKit / historical weather,
  Surfline API.

### Soundtracked memories (Spotify)
- **Why:** Score a recap or reel with what you actually listened to on the trip —
  the emotional multiplier of music.
- **Complexity:** Medium (OAuth; recently-played).
- **Tier:** V2.
- **Possible API:** Spotify Web API.

### On-this-day & resurfacing (Meta Memories / Apple Photos)
- **Why:** "A year ago today in Bali" notifications resurface old memories — a
  powerful re-engagement + emotional loop. Deterministic from existing dates.
- **Complexity:** Low–Medium (date math + notifications).
- **Tier:** V2.
- **Possible API:** Internal (dates) + local notifications.

### Trip & travel-document context (Flighty / Booking.com / Airbnb / TripIt)
- **Why:** Anchor story cards and chapters to real flights and stays ("the day
  you flew to Lombok", "your villa week") rather than inferred phases.
- **Complexity:** Medium–High (partner APIs / share-in / email parsing).
- **Tier:** V2 (Flighty share-in / TripIt) → V3 (Booking/Airbnb).
- **Possible API:** Flighty share-in, TripIt API, Booking/Airbnb partner APIs.

## J. Life Story deepeners (added M24.5)

The Life Story Engine (`/life-story`) curates the whole history into titled
stories deterministically. These would make those stories deeper and more
cinematic — still **not implemented**; several depend on integrations above.

### Richer milestones from real data (PADI / SSI / Garmin Dive / Shearwater)
- **Why:** "The Summer You Learned To Dive" backed by the actual certification
  date and first logged dive; certification milestones ("You became an Advanced
  Diver") as their own life chapters.
- **Complexity:** High (dive-credential + dive-log integrations, section C).
- **Tier:** V3.
- **Possible API:** PADI/SSI digital cards, Garmin Dive, Shearwater Cloud.

### Place-meaning enrichment (Apple Maps / approximate regions)
- **Why:** "Places That Changed You" / "Your Island Years" gain map-backed region
  art and proper place names (island vs city vs region) — approximate only.
- **Complexity:** Medium (region granularity; never exact pins).
- **Tier:** V2–V3.
- **Possible API:** MapKit reverse-geocode at region level; curated place dataset.

### Auto-narrated story films (Apple Photos Memories / Google Photos)
- **Why:** Turn a life story into a shareable, photo-backed film with covers and
  hero images chosen from the real library.
- **Complexity:** Medium–High (on-device photo access + composition).
- **Tier:** V2 (covers) → V3 (films).
- **Possible API:** PhotoKit / Google Photos Library API; AVFoundation.

### Life-story soundtrack (Spotify)
- **Why:** A signature track per chapter/era — "the sound of your Bali years".
- **Complexity:** Medium (OAuth; per-period recently-played).
- **Tier:** V2.
- **Possible API:** Spotify Web API.

### Resurfacing & chapters-in-progress (Facebook Memories / Apple Journal)
- **Why:** Gently resurface a maturing chapter ("Your Bali Chapter is growing")
  and "on this day" life-story moments — emotional re-engagement.
- **Complexity:** Low–Medium (date math + local notifications).
- **Tier:** V2.
- **Possible API:** Internal + local notifications.

### Shared & merged life stories (Spotify Blend / Apple Family Sharing)
- **Why:** "Your Story With Manon" as a co-authored life chapter once companions
  have their own data — the relational counterpart to personal life stories.
- **Complexity:** High (multi-user, permissions, sync).
- **Tier:** V3.
- **Possible API:** Internal multi-user platform; CloudKit sharing.

## K. Personal Travel DNA deepeners (added M24.6)

The Travel DNA layer (`/travel-dna`) learns long-term characteristics from
existing evidence. These would unlock the traits that are currently absent for
lack of data, and sharpen the rest — still **not implemented**; most depend on
integrations above.

### Spending tier (only with evidence) — Apple Wallet / manual
- **Why:** Unlocks "Luxury vs Backpacker" honestly, per-trip and over time.
- **Complexity:** Medium (manual entry first; Wallet/bank later — sensitive).
- **Tier:** V3.
- **Possible API:** Manual entry + FX; Apple Wallet transactions (restricted).

### Accommodation & transport DNA — TripIt / Booking / Airbnb / Flighty / ride-hailing
- **Why:** Unlocks "Favourite accommodation" (villa vs hostel vs liveaboard) and
  "Favourite transport" (fly vs drive vs scooter vs ferry) from real itinerary data.
- **Complexity:** Medium–High (partner APIs / share-in / email parsing).
- **Tier:** V2 (TripIt/Flighty) → V3 (Booking/Airbnb/Grab/Gojek).
- **Possible API:** TripIt, Flighty, Booking/Airbnb partner APIs, ride-hailing APIs.

### Climate & region DNA — Apple Maps / WeatherKit
- **Why:** "Favourite climate" (tropical vs alpine) and richer "Favourite regions"
  from approximate-region geocoding + historical weather.
- **Complexity:** Medium (region granularity; never exact pins).
- **Tier:** V2–V3.
- **Possible API:** MapKit reverse-geocode (region), WeatherKit / historical weather.

### Sensor-true identities — Garmin / Strava / Apple Health / dive logs / Surfline
- **Why:** "Diving / Surfing / Hiking" identities become objective (logged dives,
  surf sessions + swell, vertical climbed, steps) rather than note-inferred;
  "fast vs slow" gains real movement data.
- **Complexity:** High (wearable/dive/surf integrations, sections A & C).
- **Tier:** V3.
- **Possible API:** Garmin Connect/Dive, Strava, Apple HealthKit, Shearwater/dive
  logs, Surfline.

### Photo-derived identity (on-device) — Apple Photos / Vision
- **Why:** Sharpen "Photography habits" and category traits from actual photo
  scene/aesthetics analysis, not just note keywords.
- **Complexity:** Medium (on-device only; privacy-first).
- **Tier:** V2.
- **Possible API:** PhotoKit metadata + Apple Vision scene/aesthetics (on-device).

### DNA over time — "This year you travelled differently"
- **Why:** Turn the `trend` field into a yearly narrative — how the traveller's
  DNA shifts across years (Wrapped-style "this year vs last").
- **Complexity:** Low–Medium (compose per-year DNA snapshots deterministically).
- **Tier:** V2.
- **Possible API:** Internal (per-period DNA snapshots).

### Return probability model (deterministic)
- **Why:** Strengthen "return affinity" into a calibrated, explainable likelihood
  per destination (visits, recency, memory density) — still rule-based, not ML.
- **Complexity:** Medium (transparent scoring; no black box).
- **Tier:** V2.
- **Possible API:** Internal.

## L. Predictive Companion deepeners (added M24.7)

The Predictive Companion (`/predictions`) anticipates from deterministic evidence
only. These would broaden and sharpen predictions — still **not implemented**,
and several need integrations above. All must remain rule-based and explainable
(no black-box ML).

### Destination DNA-match scoring (curated destination dataset)
- **Why:** Deliver true "This destination matches 82% of your Travel DNA" by
  scoring a candidate destination's attributes (climate, activities, vibe)
  against the traveller's DNA — deterministic, transparent.
- **Complexity:** Medium (curate a destination attribute dataset + scoring).
- **Tier:** V2.
- **Possible API:** Internal curated dataset; geographic open data (no per-user location).

### Likely accommodation & transport — TripIt / Booking / Airbnb / Flighty / ride-hailing
- **Why:** Unlocks the currently-absent "likely accommodation style" and "likely
  transport" predictions from real itinerary history.
- **Complexity:** Medium–High (partner APIs / share-in / email parsing).
- **Tier:** V2 (TripIt/Flighty) → V3 (Booking/Airbnb/Grab/Gojek).
- **Possible API:** TripIt, Flighty, Booking/Airbnb partner APIs, ride-hailing APIs.

### Weather/season-aware suggestions — WeatherKit / historical / Surfline
- **Why:** "Best travel season" and packing become condition-aware ("pack a
  wetsuit — water's 24°C", "swell builds in July"); golden-hour timing for
  "likely photography moments".
- **Complexity:** Medium (historical weather / surf APIs by approximate area).
- **Tier:** V2–V3.
- **Possible API:** Apple WeatherKit, Open-Meteo/Visual Crossing, Surfline.

### Smart packing lists — sensor + itinerary aware
- **Why:** Turn likely-packing into a full, deterministic checklist driven by
  destination, season, planned activities and dive/surf gear history.
- **Complexity:** Medium (compose existing evidence + destination/season data).
- **Tier:** V2.
- **Possible API:** Internal; enriched by weather + dive/activity integrations.

### Proactive, calm nudges — local notifications
- **Why:** Surface a prediction at the right moment ("You usually dive on day 2 —
  want to plan it?") without being a dashboard. Opt-in, gentle, Apple-like.
- **Complexity:** Low–Medium (local notifications + timing rules).
- **Tier:** V2.
- **Possible API:** Local notifications (no server push needed for MVP).

### Companion-aware predictions — relationship graph
- **Why:** "You usually travel with Manon in July" — combine companion + season +
  destination evidence into richer joint predictions.
- **Complexity:** Medium (cross-evidence joins; still deterministic).
- **Tier:** V2.
- **Possible API:** Internal (relationships + predictions).

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
