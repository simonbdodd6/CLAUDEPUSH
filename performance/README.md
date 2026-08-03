# CoachEasier Performance

Premium strength & conditioning module — SC1 foundation.

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
├── hooks/        State/lifecycle seams (subscribe/select helpers) that the
│                 inline app script will adopt when engine logic arrives.
├── services/     Data-access seams. SC1 ships sample-data providers only;
│                 real Redis/API adapters replace the sample layer later
│                 without touching screens.
├── domain/       Entities and pure business rules (progress, readiness,
│                 workout status). No engine logic yet — SC1 keeps only the
│                 display-level rules the shells need.
├── types/        JSDoc typedef modules — the single source of truth for
│                 Performance data shapes.
├── utils/        Formatting and small pure helpers.
└── tests/        node --test unit tests for this tree. Run directly:
                  node --test performance/tests/*.test.js
                  (the root `npm test` glob covers test/*.test.js, which
                  holds the index.html integration test for this module).
```

## Screen map (SC1 shells)

| Screen | index.html renderer | Purpose |
|---|---|---|
| Dashboard | `renderPerfDashboard` | Premium landing — today's workout, programme progress, athletes, analytics, coach tools, recent activity |
| Athletes | `renderPerfAthletes` | Athlete list, ready for player profiles |
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
