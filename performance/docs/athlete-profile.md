# Athlete Profile — Canonical Model (SC2)

Source of truth: `performance/types/athlete-profile.js` (shapes + enums) and
`performance/domain/athlete-profile.js` (`createEmptyProfile`, rules). The
inline mirror in `index.html` is kept in lockstep and verified by
`test/performance-profile.test.js`.

## Principles

- **References, not copies.** The profile stores `userRef` / `teamRef` /
  `clubRef` pointing at existing CoachEasier identities. Names, e-mails and
  roster records are never duplicated into the profile.
- **`null` ≠ unknown.** `null`/undefined means *not answered yet*; the
  `'unknown'` sentinel is an *answered* value ("don't know / prefer not to
  say") and counts toward completion everywhere.
- **No diagnosis data.** Wellness and pain fields are player self-reports;
  health fields are administrative records. Nothing in the model represents a
  clinical judgement, and no rule produces one.
- **True 1RM testing is never required.** Strength results support
  actual / estimated / unknown status; zero results is a valid, complete
  profile.

## Field groups

| Group | Fields | Required for onboarding |
|---|---|---|
| Identity refs | id, userRef, teamRef, clubRef, sport, status, version, onboardingVersion, createdAt, updatedAt | auto |
| Personal | dateOfBirth (optional, reduced to `ageBand` for all engine use), ageBand, sex, dominantSide, units {weight, height}, language, timezone | `ageBand` |
| Rugby | primaryPosition, secondaryPosition, playingLevel, yearsPlaying, typicalMatchMinutes, matchDay, rugbySessionsPerWeek, otherSports[], seasonPhase | `primaryPosition`, `playingLevel`, `seasonPhase` |
| Body | heightCm, weightKg, targetWeightKg, bodyComposition, weightTrend, measurementSource, measuredAt | none |
| Training | experience, yearsResistanceTraining, consistency, currentProgramme, preferredStyles[], techConfidence, preferredSessionMinutes | `experience`, `preferredSessionMinutes` |
| Strength | results[] — {testId, variation, measurementType, value, unit, status, source, date, confidence (derived), notes} | none — never blocks |
| Equipment | locations[], items[], notes | `locations` |
| Schedule | availableDays[], preferredDays[], maxSessionMinutes, rugbyDays[{day,kind,time?}], matchDay, workRestrictions, travelRestrictions, temporaryChanges[] | `availableDays` |
| Goals | goals[] — {id, type, importance 1–5, targetDate, targetValue, targetUnit, outcome, reason, status} | ≥ 1 goal |
| Pain (self-report) | present, area, movementAffected, severity 1–5, trainingRestricted, note, reportedAt | none |
| Health (restricted) | injuryHistory[], medicalRestrictions, movementsToAvoid[], physioInstructions, medicalClearanceRequired, returnToTrainingStatus | none — never collected during onboarding |
| Coach restrictions | {id, restriction, reason, author, createdAt, effectiveFrom/To, reviewDate, visibility, overriddenBy/At} | none |
| Sharing | consentVersion/AcceptedAt/AcceptedBy, grants[], audit[] | consent |

Wellness check-ins live OUTSIDE the profile in a capped rolling log
(`wellnessLog`, max 30 entries) inside the profile state — one entry is a
snapshot and can never permanently alter the profile.

## Validation rules (performance/domain/athlete-profile.js)

- `profileCompletion` — required minimum = 70 %, optional richness = 30 %.
- `validateGoal` — legal type/importance; target dates cannot be in the past.
- `detectScheduleConflicts` — advisory: match-day gym days, rugby/gym double
  sessions, preferred-but-unavailable days.
- `equipmentCapability` — full / moderate / minimal / bodyweight summary.
- `strengthResultConfidence` — none / low / medium / high from status,
  source and measurement age (>180 days degrades).
- `restrictionStatus` / `restrictionNeedsReview` — scheduled / active /
  expired / overridden; review due when reviewDate passes while active.
- `shouldRequestClearanceReview` — routing signal only (clearance flag,
  player-reported restriction, severity ≥ 4, restriction review due).
- `staleSections` — body > 180 d, latest strength result > 180 d,
  whole profile > 365 d.

## Assumptions & deferred decisions

- Sport is fixed to rugby union in SC2.
- Timezone/language capture is modelled but not asked during onboarding.
- Parent/guardian flows are modelled via grants only; account linking is a
  future identity-system decision.
- Programme generation, prescription and rehabilitation logic are **not part
  of SC2** and nothing in this model triggers them.
