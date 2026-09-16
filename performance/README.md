# CoachEasier Performance

Premium strength & conditioning module.

---

## ⚠️ SOURCE OF TRUTH (SC9.35)

**This directory is NOT the Performance Intelligence implementation.** It is the
subset of it that Core physically serves, and it is one generation behind.

The canonical implementation is the standalone repository:

```
~/Developer/active/CoachEasier-Performance-Intelligence
```

Everything from Gate 2 onwards lives there and **not** here: the professional
decisions, the progression wave, dose measurement, load attribution, the
decision trace, the critique, the review package, athlete state, the
restriction→catalogue mapping, the release policy, the player-safe projection
and `engine.js` — the single Core-facing contract.

**Do not add intelligence to this directory.** Two implementations of the same
coaching rules is the condition SC9.35 exists to end. Changes belong in the
standalone repository and reach Core through the integration boundary below.

### Why this directory still exists

`index.html` loads `./performance/...` as same-origin ES modules at runtime, so
Core must physically contain what it serves. A sibling repository is not
servable. SC9.35 therefore removed everything Core does not serve and kept the
rest, rather than deleting a directory the application depends on.

### What is actually reachable

Three entry points, and nothing else, reach this directory from the application:

| Entry point | Reached from |
|---|---|
| `services/exercise-catalogue.js` | `index.html` (dynamic import) |
| `services/workout-runtime.js` | `index.html` (dynamic import) |
| `domain/authoring-profile.js` | `api/publish.js` (`gateRestrictionSignal`) |

`services/performance-data.js` and `types/index.js` are retained solely because
`index.html` names the former in a "kept in lockstep with" comment. Neither is
imported. Both should go when `index.html` can be edited.

## ⚠️ OPEN SAFETY FINDING — pre-Gate-2 generation is LIVE

`index.html` → `perfGenerateDraft()` calls, through the `workout-runtime.js`
re-export barrel:

```
engineInputFromAuthoringProfile → generateBlueprint → programmeDraftFromBlueprint
```

**That is this directory's copy, which predates Gate 2.** A programme generated
and published through the coach authoring flow today therefore does not carry:

- the Gate 2 professional decisions (main-strength intent; the NSCA 6–15
  repetition band for youth; the 8-repetition main-strength bound)
- the SC9.29 youth strength-frequency floor
- SC9.31/SC9.32 athlete state — a supplied restriction excludes nothing, because
  this copy has no athlete-state pathway and its catalogue carries no
  contraindication tags
- SC9.28 coverage honesty and SC9.30 progression reporting

This was found by tracing reachability, not assumed. **It is not fixed here**:
the fix is to call the standalone `engine.js` instead, which is SC9.36, and it
requires editing `index.html`, which SC9.35 was explicitly scoped out of.

Until then, treat programmes produced by the coach authoring flow as
pre-Gate-2 output.

## The integration boundary (target state, SC9.36)

```
CoachEasier Core
      │  thin boundary: ONE import
      ▼
performance/engine.js          ← the only module Core may import
      ├── generateProgramme    → { programme, version, provenance, blueprint, context }
      ├── validateProgramme    → critique (advisory, provisional)
      ├── analyseProgramme     → { dose, attribution, observations }
      ├── explainProgramme     → { trace, reviewPackage }
      └── outstandingQuestions → practitioner handoff
```

**Core supplies:** an SC2 athlete profile, the exercise catalogue, `author`,
`athleteName`, `athleteUserId`, `clubId`, `weeks`, `teamCategory`,
`supervisionAvailable`, `now`, and optionally `athleteState` (availability,
restrictions, external load).

**Core must never import directly:** `domain/programme-blueprint.js`,
`domain/blueprint-to-programme.js`, `domain/coaching-rules.js`,
`domain/exercise-selection.js`, `domain/week-progression.js`, or any other
module under `domain/`. They compose in an order that matters and fail quietly
when assembled wrongly. That is what `engine.js` exists to prevent.

**Player-safe boundary.** `blueprint` and `context` are coach-side only — they
carry athlete state including restriction notes and sources. Only
`domain/player-programme.js` output may reach a player; it is a whitelist, so a
field not named in it cannot be shown. `context` must never be persisted.

**Release policy.** A generated programme is released to the player; review
signals go to the coach alongside it. Only a `blocking`-severity flag holds a
programme. The hard gates are the engine's throws and its eligibility
exclusions, not the flags — a programme that exists has already passed them.

**Athlete state.** Missing state is never clearance. A stale restriction is
applied and escalated, never lifted. An unavailable athlete throws
`athlete_unavailable` rather than producing a document.

Full contracts: `performance/docs/core-integration.md`,
`athlete-state.md` and `restriction-catalogue-mapping.md` **in the standalone
repository**.

---

- **SC1** — module architecture, navigation shells, premium gating.
- **SC2** — athlete profile model, intelligent onboarding, privacy &
  visibility boundaries, versioned persistence.
- **SC3** — validated exercise library: canonical schema + controlled
  taxonomies, four content tiers with approval rules, a ~60-exercise curated
  beta catalogue (loaded via dynamic import, never inlined), substitution
  rules, ordered exercise collections (reusable non-prescriptive building
  blocks), and the player/coach library experience. See performance/docs/
  exercise-*.md.

- **SC4** — programme architecture: the full
  Programme → Version → Phase → Week → Training Day → Session → Block →
  Exercise Prescription → Set Prescription hierarchy, immutable published
  versions, assignment-snapshot contracts, ownership/visibility and audit
  rules. Pure domain — no UI, no programmes created. See
  performance/docs/programme-*.md.

- **SC5** — deterministic coaching rule engine: development context with
  youth safeguards (U16/U18/Senior as inputs, never verdicts), explicit
  rule precedence, position demand priors, goal/season rules, frequency
  and match-week decisions, safety-first exercise eligibility + ranking,
  and explainable programme BLUEPRINTS (categories only — no loads). All
  rule tables are PROVISIONAL_REQUIRES_SNC_REVIEW. See
  performance/docs/coaching-rule-engine.md and companions.

- **SC6** — controlled progression engine: typed loads (no bare numbers),
  evidence-earned progression (repeated exposures — one PR/one bad day
  changes nothing), bounded methods (double progression, effort-based,
  percentage, duration/distance/density, heavily-gated complexity),
  equipment-increment awareness, trend-based readiness modifiers,
  match-proximity holds, missed-session/deload/plateau rules, coach
  overrides with audit, a programme-wide progression budget, and
  progression plans that write only into SC4 DRAFT versions. All
  thresholds PROVISIONAL_REQUIRES_SNC_REVIEW. See
  performance/docs/progression-*.md.

- **SC7** — workout execution & logging: mobile-first player flow from
  Today's Workout through set logging, rest timer, substitution,
  pain-stop, interruption recovery and completion into immutable history,
  with SC6 exposure records and display-only progression previews.
  Executes real SC4 session snapshots (demo assignment through the proper
  seam); honest on-device/sync-pending persistence. See
  performance/docs/workout-*.md.

No scheduling orchestration, coach assignment tooling, production sync,
analytics dashboards or AI exists through SC7, and no language model makes
coaching or progression decisions. The engine selects only approved
CoachEasier-validated exercises, never requires a 1RM, never fabricates a
load, and obeys the SC4 versioning and snapshot contracts — completed
workout history and published programmes are immutable.

This directory is the **module home** for everything Performance-specific that
is not UI chrome. It follows the same architectural split the rest of
CoachEasier uses:

- **UI lives in `index.html`** — Performance screens are rendered by the
  `renderPerf*` family of functions inside the main application script, using
  the existing screen/navigation system, design tokens and card components.
  Nothing here renders DOM.
- **Pure logic lives here** — like `src/chat-state.js` / `src/player-identity.js`,
  every module in this tree is free of DOM, `fetch` and `localStorage` so it
  can be unit-tested with `node --test` in isolation.

## Layout

```
performance/
├── components/   Pure HTML-string builders shared by Performance screens
│                 (mirrors the render-helper convention in index.html).
├── docs/         SC2 documentation: athlete-profile.md, onboarding-flow.md,
│                 privacy-and-visibility.md, persistence-and-versioning.md.
├── hooks/        State/lifecycle seams (subscribe/select helpers) that the
│                 inline app script will adopt when engine logic arrives.
├── services/     Data-access seams. Sample-data provider (SC1) and the
│                 versioned athlete-profile store (SC2); real Redis/API
│                 adapters replace these later without touching screens.
├── domain/       Entities and pure business rules: SC1 display rules plus
│                 the SC2 athlete-profile rules (completion, onboarding
│                 steps, units, goals, schedule conflicts, equipment
│                 capability, strength confidence, restrictions, staleness,
│                 review-request routing) and the visibility model.
├── types/        JSDoc typedef + enum modules — the single source of truth
│                 for Performance data shapes (index.js, athlete-profile.js).
├── utils/        Formatting and small pure helpers.
└── tests/        node --test unit tests for this tree. Run directly:
                  node --test performance/tests/*.test.js
                  (the root `npm test` glob covers test/*.test.js, which
                  holds the index.html integration tests for this module).
```

## Screen map (SC1 shells)

| Screen | index.html renderer | Purpose |
|---|---|---|
| Dashboard | `renderPerfDashboard` | Premium landing — today's workout, programme progress, athletes, analytics, coach tools, recent activity |
| My Profile (SC2) | `perfProfileHtml` / `perfOnboardingHtml` | Athlete profile + progressive onboarding wizard |
| Athletes | `renderPerfAthletes` | Coach list: completion, programme, adherence, readiness category, attention flag; summary shell per athlete |
| Programmes | `renderPerfProgrammes` | Programme overview, ready for programme management |
| Workouts | `renderPerfWorkouts` | Today's workout shell — structure only |
| Exercise Library | `renderPerfLibrary` | Search / filters / categories / favourites shell |
| Analytics | `renderPerfAnalytics` | Strength, power, speed, conditioning, adherence, bodyweight, readiness placeholders |
| Coach Tools | `renderPerfCoachTools` | Assignments, Templates, Compliance, Reports, Team Monitoring tiles |
| Settings | `renderPerfSettings` | Performance-specific preferences |

## Rules

1. **No engine logic in SC1.** Modules here model shapes and display rules only.
2. **Keep this tree pure.** If a function needs the DOM or the network it
   belongs in `index.html` (UI) or `api/` (server), not here.
3. **Club branding wins.** Performance uses the standard CoachEasier tokens;
   never hard-code club colours.

## SC8 — Coach assignment & player delivery

The milestone that made the engine a product: a coach authors a programme for a
real athlete, publishes it, and assigns it; the athlete opens Performance and
trains it. The demo fixture is no longer the production source of Today.

| Layer | Module | Owns |
|---|---|---|
| Types | `types/assignment.js` | Statuses, lifecycle vocabulary, schema version |
| Domain | `domain/authoring-profile.js` | The athlete projection a coach may read (programming inputs only) |
| Domain | `domain/programme-assignment.js` | Lifecycle, calendar resolution, conflicts, validation, SC6 review seam, snapshot rehydration |
| Domain | `domain/blueprint-to-programme.js` | SC5 blueprint → SC4 draft version (decides nothing) |
| Server | `api/_performanceStore.js` | `performance:<clubId>` — programmes + assignments, allow-listed, audited |
| Server | `api/publish.js` → `performanceHandler` | Entitlement, scope, player self-access, ops |
| Client | `index.html` (`perf*` authoring + `perfWkAssignment`) | Rendering, and only rendering |

Contracts worth not breaking:

1. **Assignments are server-owned.** localStorage holds the in-flight workout and
   history, never an assignment.
2. **Assignments pin an immutable snapshot.** Workouts are built from it, so a
   later programme or exercise edit cannot rewrite what an athlete did.
3. **Context is captured at assignment time.** A later group change never
   rewrites history.
4. **Nothing auto-publishes, auto-assigns or auto-progresses.** Every step is a
   coach decision; SC6 suggestions stay `pending`.
5. **No AI, and no invented loads.** Prescriptions are sets/reps/effort until SC6
   earns a real load from real evidence.
6. **Scope is enforced on the server.** A coach cannot enumerate, assign to, or
   act on an athlete outside their operational scope.
7. **Authoring uses the ATHLETE's server profile, never the coach's device.**
   Only a minimised projection travels — wellness, pain detail and health data
   are never uploaded, so a programming tool cannot hold them.

See `docs/athlete-profile-sync.md`, `docs/programme-assignment.md`, `docs/programme-authoring.md`,
`docs/assignment-permissions.md`, `docs/player-programme-delivery.md` and
`docs/progression-approval.md`.
