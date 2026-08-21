# CoachEasier Performance

Premium strength & conditioning module.

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
