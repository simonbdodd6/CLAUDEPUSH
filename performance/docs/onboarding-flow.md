# Onboarding Flow (SC2)

Progressive, mobile-first wizard rendered inside the Performance section's
**My Profile** tab (`perfOnboardingHtml` in index.html). Step definitions:
`ONBOARDING_STEPS` in `performance/types/athlete-profile.js` (mirrored inline
as `PERF_OB_STEPS`).

## Sequence

| # | Step | Required | Collects |
|---|---|---|---|
| 1 | welcome | – | nothing — explains purpose, time (5–8 min), and that nothing is medical |
| 2 | rugby | ✔ | primary/secondary position, playing level, season phase, age band |
| 3 | training | ✔ | gym experience, recent consistency (opt), preferred session length |
| 4 | schedule | ✔ | gym days, rugby training days (opt), match day (opt) + live conflict note |
| 5 | equipment | ✔ | locations, items (opt), custom notes (opt) |
| 6 | goals | ✔ | up to three goals; first pick is the priority |
| 7 | strength | ✖ skippable | four key tests, each *don't know / estimate / tested* + value |
| 8 | readiness | ✖ skippable | six 1–5 wellness scales (opt) + pain self-report (opt) |
| 9 | privacy | ✔ | readable consent + optional medical / parent sharing toggles |
| 10 | review | ✔ | per-section summary, edit links, missing-answer warnings |
| 11 | done | – | confirmation; explicitly states **no programme has been generated** |

## Behaviours

- **Progress indicator** — "Step N of 9" + meter, hidden on welcome/done.
- **Back / Continue** on every data step; **Skip for now** on optional steps.
- **Save & resume** — every answer writes through `saveState()` into
  `state.performanceProfile`; reopening the app lands on the saved step
  (verified by test 3 in `test/performance-profile.test.js`).
- **Validation** — Continue checks the step's required paths and shows one
  friendly message; "unknown / prefer not to say" always passes.
- **Edit jumps** — review rows and profile-screen Edit buttons jump into a
  single step and return to where they came from (`_perfObReturn`).
- **Answer widgets** — 44 px chip buttons for choices, 1–5 scale buttons,
  numeric inputs with `inputmode="decimal"`; free-text saves on change so
  typing never loses focus.
- **No giant form** — one section per screen; advanced data (body metrics,
  extra tests) is deliberately deferred to profile editing.

## Wording rules

- Soreness/pain steps state they are self-reports, **not** a medical
  assessment or diagnosis (guarded by test 12).
- The strength step states a true 1RM is never needed.
- The done screen never claims a programme exists.
