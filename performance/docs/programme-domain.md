# Programme Domain (SC4)

Source of truth: `performance/types/programme.js` (shapes + vocabularies)
and `performance/domain/programme.js` (builders + deep validation). Tested
in `performance/tests/programme.test.js`.

This is the data model every future programme feature builds on. SC4
deliberately creates **no programmes, no generated workouts and no
calculated values** — the engine, coach tools, assignment and execution all
arrive in later milestones and must obey the contracts defined here.

## Hierarchy

```
Programme
└─ Programme Version        (immutable once published)
   └─ Phase                 (off/pre/in-season, peak, taper, return-to-general-training)
      └─ Week               (weekNumber, objective, placeholder volume/intensity)
         └─ Training Day    (day, priority, rugby relationship, optional)
            └─ Session      (title, purpose, duration, objective, coach notes)
               └─ Block     (warm-up…cooldown, optional, coach notes,
                  │          optional ordered Exercise Collection refs)
                  └─ Exercise Prescription   (reference to a validated exercise)
                     └─ Set Prescription     (authored structure only)
```

## The node spine

Every node carries: unique hierarchical `id` (child ids nest under the
parent id), `kind`, `schemaVersion`, planning `status`
(planned/optional/removed), sibling `order`, `meta` (created/updated) and an
`audit` seam. **Ownership and visibility are declared once, on the
Programme, and inherited by every node** — the tree cannot drift into
per-node ownership disagreements. Version identity lives on the Programme
Version; all descendants belong to exactly one version tree.

## Level-by-level fields

- **Programme** — slug/title/description, sport, goal (SC2-aligned ids),
  season, status (draft/in_review/approved/archived), `template` flag,
  `archived` flag, ownership {ownerType: coacheasier|club|coach, ownerClub,
  ownerCoach, author, reviewer}, approval record, audit, versions[].
- **Programme Version** — versionNumber, versionStatus
  (draft/published/superseded), createdBy, publishedAt, notes, phases[].
- **Phase** — phaseType from the six phase vocabularies. There is **no
  rehabilitation phase**; return_to_general_training is a normal training
  phase for athletes coming back from a break.
- **Week** — sequential weekNumber (validated), objective, notes, and
  `plannedVolume`/`plannedIntensity` as STRING PLACEHOLDERS — the validator
  rejects numeric values so nothing can quietly start computing with them.
- **Training Day** — day name (or `unscheduled`), priority
  (primary/secondary/optional), `rugbyRelation` (descriptive: same-day
  before/after rugby, day-before-match, match day, day-after), optional flag.
- **Session** — title, purpose (strength/power/speed/conditioning/mixed/
  recovery/testing/primer), estimatedMinutes, objective, coachNotes.
- **Block** — blockType (warmup, activation, power, main_strength,
  accessory, conditioning, mobility, cooldown), optional flag, coachNotes,
  `collectionRefs` (ordered references to SC3 collections, pinning the
  collections version), prescriptions[].
- **Exercise Prescription** — `exerciseId` + pinned `exerciseVersion`,
  display order, coachingNotes, substitutionPolicy (coach_only /
  structural_allowed / none), collectionOrigin, sets[]. **Reference-only:**
  the validator rejects any prescription carrying definition fields (name,
  classification, coaching, safety, media) — exercise definitions are never
  duplicated into programme trees.
- **Set Prescription** — `fields` restricted to the SET_FIELDS vocabulary:
  sets, reps (int or "5-8" range), load, percentage, rpe, rir, tempo,
  restSec, distanceM, durationSec, speed, holdSec, perSide, rounds,
  densityMin, workRest. Values are stored exactly as authored. **Nothing is
  calculated**: a percentage is just a number; no 1RM resolution exists.
  Each field maps to an SC3 prescription-type id, and a field may only be
  used when the referenced exercise declares that type.

## Validation

`validateProgramme` / `validateProgrammeVersion` walk the entire tree and
report every problem: vocabulary membership at all levels, unique ids
across the tree, unique sibling ordering, sequential week numbers,
reference resolution (exercises must be engine-eligible — approved
CoachEasier-validated; collections must exist), definition-duplication
leaks, set-field legality/typing/declaration, ownership consistency, and
duplicate version numbers. `sortedByOrder`/`reorderSiblings` provide pure
ordering helpers that renumber contiguously.

## Deferred (later milestones)

Workout generation, AI generation, loading recommendations, progression,
analytics, coach assignment tools, execution/logging, notifications and
scheduling. See programme-versioning.md for the contracts those features
must respect.
