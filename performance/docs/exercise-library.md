# Exercise Library — Canonical Schema & Source of Truth (SC3)

Source of truth: `performance/types/exercise.js` (schema + taxonomies),
`performance/domain/exercise.js` (validation, search/filter, integrity),
`performance/services/exercise-catalogue.js` (the curated beta catalogue,
`CATALOGUE_VERSION`). The app loads the catalogue at runtime via dynamic
`import()` — exercise definitions are **never** duplicated into app state or
inline HTML.

## Canonical record

Field groups per exercise (all classification values come from controlled
taxonomies — free text is only allowed in coaching/safety prose and the
custom equipment note):

| Group | Contents |
|---|---|
| Identity | id (`ex-<slug>`), slug, name, displayName, aliases, shortDescription, status (`draft/in_review/approved/archived`), version, created/updated |
| Classification | category, pattern (+secondary), laterality, chain, plane, region, primary/secondary qualities, primary/secondary muscles, difficulty, impact, complexity |
| Equipment | required[], optional[], space, surface, partner, setup, bodyweightOnly |
| Prescription | list of PRESCRIPTION_TYPES ids the exercise may legally be prescribed as |
| Coaching | setup, execution, cues[], mistakes[], breathing, spotting, checkpoints[], stopConditions[], coachNotes, playerExplanation |
| Safety | notes[], contraindicationTags[], precautionTags[], supervision, youth, highSkill/highLoad/highImpact, painStop, medicalReviewReminder |
| Relationships | {kind, target} — regression/progression/equipment/pattern/lower-impact/time-saving alternatives + prerequisites |
| Relevance | positions map (core/high/medium/low), goals[], phases[], levels[] |
| Media | status (placeholder in beta), assets[], altText — no external URLs, ever |
| Ownership | source, author, reviewer, ownerClub, ownerCoach, sharedWith[], moderation, reviewNotes, lastReviewedAt, audit[] |
| Review | reviewRequired[] gates, reviewsCompleted[] |

## Validation rules

`validateExercise` / `validateCatalogue` check required fields, slug format,
taxonomy membership for every classified value, non-empty coaching and
safety content, media placeholder integrity (external URLs are a validation
error), and unique ids/slugs. `findBrokenRelationships` and
`findRelationshipCycles` guarantee referential integrity and acyclic
progression/regression chains. All rules run in
`performance/tests/exercise-schema.test.js` against the full catalogue.

## Library experience (index.html)

- **Player view** — search by name/alias, category chips, movement-pattern
  select, difficulty and equipment segments (`Any kit / Limited kit /
  Bodyweight`), favourites, recently viewed, cards, detail view.
- **Coach view** — everything above plus tier tabs (All/Validated/Club/
  Private/Drafts), review-status badges, archived visibility inside tier
  tabs, and a create-exercise placeholder (authoring is deferred).
- Favourites/recent live in `state.performanceLibrary` (see
  `exercise-prefs-store.js`); view filters are ephemeral.

## Exercise collections

`performance/domain/exercise-collections.js` +
`performance/services/exercise-collections-catalogue.js` define **ordered,
reusable lists of references to validated exercises** (warm-up, activation,
mobility, sprint-prep, recovery, cooldown, trunk blocks). Collections are
building blocks for future programme templates — **not programmes**:

- items are `{exerciseId, note}` references only, order preserved;
- the validator rejects any prescription data on items (sets, reps, load,
  tempo… → `prescription_data_forbidden`), unknown/duplicate references,
  and any reference that is not an approved, engine-eligible validated
  exercise;
- no loading, no progression, no auto-assignment.

The beta ships six curated collections (`COLLECTIONS_VERSION`), each
validating against the catalogue in
`performance/tests/exercise-collections.test.js`.

## Future API boundary

`getCatalogue()/getExerciseById()/getCatalogueMeta()` is the seam a remote
API replaces: server-side search/pagination, per-club endpoints for club
content, per-coach endpoints for private content, and assignment-time
snapshots (see exercise-ownership-and-approval.md). No production API or
database migration ships in SC3.

## Safety limitations

Beta content is **not medically approved**. Contraindication/precaution tags
are routing signals for humans, not clinical rules. Pain reports route to
stop-and-review (`painReportRouting`) — nothing in the library selects
exercises in response to pain. Programme generation is **not part of SC3**.
