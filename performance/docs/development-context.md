# Development Context (SC5)

Source of truth: `performance/domain/development-context.js`;
categories in `performance/types/coaching.js` (`DEVELOPMENT_CONTEXTS`).

## Why it exists

U16, U18 and Senior are **not equivalent programming populations** — but age
group is an input, not the programme. The engine always combines development
context with training age, technical confidence, position, goals, schedule,
equipment and restrictions. A highly experienced U18 and a beginner Senior
receive different complexity decisions in BOTH directions: the U18's
experience earns intermediate complexity (never advanced — safeguard cap),
while the Senior's age unlocks nothing without the experience to match
(beginner Senior → beginner complexity, test-enforced).

## Categories

`youth_u16`, `youth_u18`, `adult`, plus the fail-safe `unknown` (treated
with youth-level safeguards). The registry is extensible — new categories
declare their own safeguard behaviour without engine redesign.

## Core integration contract: `teamDevelopmentCategory`

The existing CoachEasier identity/team system does **not** yet carry a
structured team age category, and team NAME strings are never parsed as
age evidence. The engine therefore defines the integration seam now
(`TEAM_DEVELOPMENT_CATEGORIES` + `normalizeTeamDevelopmentCategory` in
types/coaching.js): when Core integration lands, each team must expose a
structured `teamDevelopmentCategory` with canonical values

`youth_u16 · youth_u18 · adult · mixed_open · unknown`

(legacy shorthands `u16`/`u18`/`senior` normalise onto these; any other
value — including a team name — normalises to `unknown`). Until the field
exists, callers pass null and the engine **fails conservatively**:
test-proven, the absence of this field (or an `adult`/`mixed_open` value
without athlete-age evidence) never silently unlocks adult rules. The
category is supporting context only — athlete-age evidence always outranks
it.

## Resolution precedence (conservative, deterministic)

1. **Athlete age band** (stated, or derived from DOB when the band is
   missing). Age always wins:
   - youth-age athlete in a senior team → youth context kept, safeguards
     active, `youth_age_in_senior_team` conflict + warning flag;
   - adult registered with a youth team → adult, `adult_in_youth_team`
     conflict flag (never classified from a team name).
2. **Structured team category** (`u16` | `u18` | `senior` — never inferred
   from a name string) — used only when age is unknown, always with a
   `missing_development_context` review flag. A senior team category alone
   is NOT enough to unlock adult programming.
3. **Nothing reliable** → context `unknown`: conservative safeguards stay
   active, review required. An athlete is never silently treated as Senior.

"Prefer not to say" age answers are treated as unanswered, not as a band.

## What the context controls

- Complexity ceiling (`complexityCeiling`): U16 → beginner (intermediate
  only with intermediate+ experience); U18 → intermediate max; adult → earns
  its ceiling from experience; unknown → treated as U16.
- Frequency caps (U16: 3, in-season 2; U18: 4, in-season 3; unknown: 2).
- Dose caps (U16/unknown: volume ≤ moderate, intensity ≤ moderate,
  technique intensity for new/beginner; U18 high intensity raises
  `youth_high_load_review`).
- Eligibility: youth suitability checks, supervision requirements for
  technique-gated/high-skill/high-load work, U16 high-load review.
- Archetypes: U16/unknown swap complex power sessions for technique-first
  full-body structure.
- Neck/contact patterns: recommended only for forwards, and for youth only
  with supervision (the exercises themselves stay behind SC3 review gates).

All thresholds are PROVISIONAL_REQUIRES_SNC_REVIEW — see
coaching-rule-review-requirements.md.
