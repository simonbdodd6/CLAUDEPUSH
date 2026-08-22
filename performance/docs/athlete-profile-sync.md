# Athlete profiles across devices (SC8)

## The defect this fixes

Coach authoring originally read `state.performanceProfile` — the profile on the
**coach's own device**. A coach who is also an athlete (common) would have built
Athlete B's programme from their own position, training age, equipment and
schedule. Wrong programme, wrong athlete, and a privacy problem in the other
direction too.

## The projection

An athlete's device publishes a small **authoring profile** — never the full SC2
profile (`performance/domain/authoring-profile.js`):

| Class | Content | Stored server-side? | Coach-readable? |
|---|---|---|---|
| **A** Programming inputs | sport, age **band**, position, playing level, season phase, training experience, technical confidence, equipment, schedule, goals | yes | yes |
| **B** Wellness log | daily sleep/fatigue/readiness | **no** | no |
| **C** Pain detail | area, severity, notes | **no** — only a `trainingRestricted` flag | flag only |
| **D** Health / medical | injury history, medical restrictions, movements to avoid, physio instructions, clearance status | **no** — only `hasMovementRestrictions` | flag only |
| Body | height, weight, composition | **no** | no |

Two deliberate reductions:

* **Age travels as a band, never a date of birth.** The band is what the coaching
  rules use; a birth date is precision nobody programming a session needs.
* **A restriction is signalled, never described.** A coach learns that an athlete
  has a movement restriction — which changes the programme and forces review —
  and never learns what the injury is.

The server re-applies this allow-list on write (`normalizeAuthoringProfile`), so a
client that posts a whole SC2 profile has every sensitive field **dropped rather
than stored**. What is not stored cannot leak.

## Authority and sync

* The **server** is authoritative for what a coach may read.
* The **device** keeps the athlete's full profile as their working copy — it is
  the only place wellness, pain detail and health information live.
* Saving locally publishes the projection. Failure is reported honestly: "Saved on
  this device", never a claimed sync that did not happen.
* A device with **no** profile adopts the server copy on load (cross-device
  restore). A device that **already has** one keeps it and re-publishes, so a
  newer local edit is never overwritten by an older server read.
* Old local profiles are never destroyed. The projection is derived from them.

Restoring on a new device brings back programming inputs only — the athlete's
wellness history stays where they recorded it. The UI says so.

## Permissions

* **Player** — reads and writes their own profile only. The athlete id comes from
  the session, so a forged id in a body or query changes nothing.
* **Coach** — may READ the projection for athletes in their operational scope, via
  `?resource=performance&athleteProfile=<userId>`; scope is re-checked on that
  read exactly as on a write. They may **never write** an athlete's profile.
* **Out of scope / another club** — refused (403 / 404), not an empty object.
* **Medical** — no `publish_training`, so Performance authoring stays closed.
* **Club admin** — may author club-wide, and still receives only the projection:
  no wellness, pain or health data.

## Authoring behaviour

Generation fetches the selected athlete's projection and refuses to proceed
without one, naming what is missing ("playing position, training availability").
It never falls back to the coach's device — asserted by test, in code with
comments stripped so the guard cannot be satisfied by prose.
