# CoachEasier Performance

Premium strength & conditioning module.

---

## ⚠️ SOURCE OF TRUTH

**This directory is NOT where the Performance Intelligence lives.** It is a
VERBATIM MIRROR of the subset Core physically serves. The canonical
implementation is the standalone repository:

```
~/Developer/active/CoachEasier-Performance-Intelligence
```

Since SC9.36, 49 of the 50 `.js` files here are byte-identical to their
canonical counterparts. **Do not edit them.** A fix made here is a fork; make it
in the standalone repository and re-copy. Two implementations of the same
coaching rules is the condition SC9.35 and SC9.36 exist to end.

The single exception is **`services/workout-runtime.js`**, which is Core's own
composition barrel for `index.html`'s dynamic import. It says so at the top.

### Why this directory exists at all

`index.html` loads `./performance/...` as same-origin ES modules at runtime, so
Core must physically contain what it serves. A sibling repository is not
servable and the CSP allows no external host. So the engine is vendored, not
referenced.

### What is reachable

Four entry points, and nothing else, reach this directory from the application:

| Entry point | Reached from | Purpose |
|---|---|---|
| `engine.js` | `index.html` (`perfEngine()`) | **programme generation** |
| `services/exercise-catalogue.js` | `index.html` (dynamic import) | the library UI |
| `services/workout-runtime.js` | `index.html` (dynamic import) | workout execution |
| `domain/authoring-profile.js` | `api/publish.js` | `gateRestrictionSignal` |

`services/performance-data.js` and `types/index.js` are retained only because
`index.html` names the former in a "kept in lockstep with" comment. Neither is
imported.

## ✅ RESOLVED — the pre-Gate-2 generation path (SC9.35 finding, closed by SC9.36)

SC9.35 found that the LIVE coach authoring flow generated programmes by
assembling `engineInputFromAuthoringProfile → generateBlueprint →
programmeDraftFromBlueprint` by hand, against a copy of the domain modules that
predated Gate 2. A programme published through it carried none of the Gate 2
decisions, no youth strength-frequency floor, and no athlete-state pathway — so
a declared restriction excluded nothing.

**SC9.36 replaced it.** `perfGenerateDraft()` now makes one call to
`engine.generateProgramme(...)`. The old chain is not merely unused: the runtime
barrel withholds all three functions, so no live route can reach it, and a test
asserts that. There is **no fallback** — if the engine refuses, generation fails
and says so.

## The integration boundary

```
CoachEasier Core  (index.html → perfGenerateDraft)
      │  ONE import, loaded on demand
      ▼
performance/engine.js          ← the only module Core may import
      ├── generateProgramme    → { programme, version, provenance, blueprint, context }
      ├── releaseDecision      → { releasable, requiresCoachReview, blockedBy, … }
      ├── validateProgramme    → critique (advisory, provisional)
      ├── analyseProgramme     → { dose, attribution, observations }
      ├── explainProgramme     → { trace, reviewPackage }
      └── outstandingQuestions → practitioner handoff
```

### What Core supplies

The **SC8 authoring projection** as `profile` — not an SC2 profile, which
carries wellness, pain and health detail that must never reach a coach's
device. The engine detects `kind: 'authoring_profile'` and maps it with the
reader that restores the restriction signals from the projection's flags.
Passing a projection to the general reader would silently return "no
restriction" for a restricted athlete, so Core hands it over **whole** and does
not build engine inputs.

Also: `catalogue`, `teamCategory` (the operational group's structured
`developmentCategory`), `athleteName`, `athleteUserId`, `author`, `clubId`,
`weeks`, `schedule`, `now`.

### What Core must never import

Anything under `domain/`. Those modules compose in an order that matters and
fail quietly when assembled wrongly; `engine.js` exists to prevent exactly that.
`services/workout-runtime.js` re-exports some `domain/` functions for the SC7
workout surface — that is execution, not generation, and it deliberately
withholds every generation function.

### Athlete state

**Core supplies none today, and that is deliberate.** `athleteState` describes
what an authorised system knows about an athlete's availability and restrictions
right now. Core has no defensible source: session availability answers "can you
make Tuesday", which is not a statement about fitness to train, and the medical
record is outside this endpoint's scope by design. Mapping either would be
fabrication.

The engine records absence as `supplied: false`, never as clearance, so omitting
it is safe. The parameter is the seam a future build fills — **`MISSING DATA ≠
CLEARANCE` and `UNKNOWN ≠ AVAILABLE`.** A stale restriction is applied and
escalated, never lifted. An unavailable athlete throws `athlete_unavailable`
rather than receiving a document. An unknown restriction tag throws rather than
being partially honoured.

The restriction signal Core DOES carry — the projection's `restrictions` flags —
reaches the engine and does exclude work, and is gated for minors on the server
before it ever leaves (`gateRestrictionSignal`).

### Catalogue

One catalogue, `services/exercise-catalogue.js`, byte-identical to the canonical
one and carrying the SC9.32 contraindication tags (14 exercises across 4 tags).
There is no separate "Core operational" catalogue: the library UI, the workout
runtime and the engine all read the same file. It is a mirror — edit it in the
standalone repository.

### Release policy

A generated programme is **released**; review signals go to the coach alongside
it, never in front of it. Only a `blocking`-severity flag holds a programme, and
Core reads that from `releaseDecision()` rather than restating a policy of its
own. `releasable` and `requiresCoachReview` are different questions. The hard
gates are the engine's throws and its eligibility exclusions — a programme that
exists has already passed them.

The coach's existing review acknowledgement on the publish step is unchanged:
SC9.36 changed where a programme comes from, not how a coach publishes one.

### Errors

The engine fails **by name**. `index.html`'s `perfEngineErrorText()` translates
the names a coach can act on and keeps the raw name in brackets for support.
Nothing retries, degrades or substitutes.

### Contract version

`ENGINE_CONTRACT_VERSION` identifies the contract, and moves when observable
behaviour does. It is persisted with each draft as `engineContractVersion` — the
**string only**. The engine `context` carries eligibility sets and the resolved
athlete state and is never stored, never sent to a player, and never kept on the
authoring state.

### Keeping the mirror honest

`test/performance-engine-integration.test.js` pins a SHA-256 digest of the
prescriptions generated for a fixed U18 athlete. The standalone repository's
`performance/tests/sc936-core-integration-contract.test.js` pins the same
constant against the canonical engine. If they ever disagree, this mirror has
drifted — **resync from the standalone repository; do not edit the constant.**

Full contracts: `performance/docs/core-integration.md`, `athlete-state.md` and
`restriction-catalogue-mapping.md` **in the standalone repository**.

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
