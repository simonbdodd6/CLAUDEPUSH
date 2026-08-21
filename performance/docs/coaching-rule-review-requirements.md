# Coaching-Rule Review Requirements (SC5)

Every rule table in the SC5 engine ships as a beta default marked
**PROVISIONAL_REQUIRES_SNC_REVIEW** (`performance/types/coaching.js`), and
every blueprint carries the always-on `beta_rules_provisional` flag. The
product must never present these rules as professionally validated until
qualified review is recorded.

## Rules requiring qualified S&C review

| Rule table | Where | Also needs |
|---|---|---|
| Youth frequency caps (`YOUTH_FREQ_CAP`) | coaching-rules.js | safeguarding |
| Youth volume/intensity ceilings (`decideDose` caps) | coaching-rules.js | safeguarding |
| High-load definitions (SC3 `highLoad` flags + U16 high-load gate) | exercise catalogue + exercise-selection.js | medical |
| High-skill definitions (SC3 `highSkill` flags + supervision gates) | exercise catalogue + exercise-selection.js | — |
| Complexity ceilings (`complexityCeiling`) | exercise-selection.js | safeguarding |
| Neck training rules (pattern recommendation + youth supervision gate) | coaching-rules.js + SC3 catalogue gates | medical + safeguarding |
| Contact-preparation rules | coaching-rules.js + SC3 catalogue gates | medical + safeguarding |
| Conditioning dose classes (work classes + archetype plans) | coaching-rules.js | — |
| Volume/intensity resolution pipeline (`EXPERIENCE_DOSE_CAPS`, phase baselines, congestion step-down) | coaching-rules.js | safeguarding (youth rows) |
| Match-week proximity table (`MATCH_WEEK_RULES`) | coaching-rules.js | — |
| Base frequency table (`FREQ_BASE`) | coaching-rules.js | — |
| Position demand weights (`POSITION_DEMANDS`) | position-demands.js | — |
| Goal→quality map (`GOAL_QUALITY_MAP`) | position-demands.js | — |
| Exercise-ranking weights (`RANKING_WEIGHTS`) | exercise-selection.js | — |
| Return-to-general-training boundaries (dose + review flag) | coaching-rules.js | medical |
| Development-context resolution precedence | development-context.js | safeguarding |

## Review process expectations

- A qualified S&C coach reviews each table and either signs it off
  (recording reviewer + date, lifting the PROVISIONAL marker for that
  table) or amends the values.
- Medical/safeguarding-flagged rows additionally need the corresponding
  adviser's sign-off, consistent with the SC3 exercise review gates.
- Until sign-off, the UI must surface the beta status wherever blueprint
  output is shown (the `beta_rules_provisional` info flag exists for
  exactly this).

## Explicit non-claims

These rules are product safety boundaries, not medical rules. Nothing in
the engine diagnoses, treats, clears, or rehabilitates; `return_to_general
_training` is a conservative training phase whose use always raises a
review flag.
