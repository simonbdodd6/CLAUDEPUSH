# Persistence & Versioning (SC2)

Source of truth: `performance/services/athlete-profile-store.js`; inline
mirror `perfNormalizeProfileState` + friends in index.html (lockstep verified
by `test/performance-profile.test.js`).

## Where data lives (prototype)

The whole Performance profile state lives under one namespaced key on the
app state: `state.performanceProfile`. It rides the existing CoachEasier
persistence (`saveState()` → localStorage `coach-eye-…-state-v1`) and is
normalised on every load from `normalizeState()`:

```
state.performanceProfile = {
  stateVersion: 1,
  profile: <athlete profile | null>,      // null = onboarding not started
  onboarding: { step, startedAt, completedAt, skippedSteps[] },
  wellnessLog: [ ...max 30 entries ],
}
```

No other global state key is touched; Core screens never read this namespace
(guarded by test 17).

## Guarantees

- **Survives refresh / resume** — every answer writes through `saveState()`;
  reload resumes at the saved step.
- **Fails safe** — malformed, foreign, or future-versioned data normalises to
  a fresh initial state; a corrupt profile becomes `null` (onboarding
  restarts) rather than half-loading. App boot never throws on bad data.
- **Unknown keys dropped, missing keys defaulted** — profiles are
  template-merged against the canonical shape on load.
- **Versioned** — `stateVersion` (container) and `profile.version` +
  `onboardingVersion` (content). Current: all 1.

## Migration seam

`PROFILE_MIGRATIONS` maps `fromVersion → (state) => state'`. Normalisation
chains registered migrations up to the current version; a missing step in the
chain fails safe to fresh state. Adding profile v2 means: bump the constants,
register `1: migrateV1toV2`, done — screens are untouched.

## Future API boundary

The store is deliberately DOM/network-free. The production replacement is an
API adapter (in `api/`) that persists per-athlete profiles server-side with
the same normalise/serialize surface; `state.performanceProfile` then becomes
a cache. **No production database migration ships in SC2.**
