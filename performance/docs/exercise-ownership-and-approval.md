# Exercise Ownership, Tiers & Approval (SC3)

Source of truth: `performance/domain/exercise-visibility.js`; tested in
`performance/tests/exercise-visibility.test.js`.

## Content tiers

| Tier | Who sees it | Engine-eligible | Coach-assignable |
|---|---|---|---|
| **CoachEasier Validated** | everyone (approved only) | ✔ (approved + not archived) | ✔ |
| **CoachEasier Draft** | CoachEasier/staff views only | ✖ | ✖ — never pre-review |
| **Club Exercise** | that club only | ✖ | ✔ once club-approved |
| **Coach Private** | author (+ explicit shares) | ✖ | ✔ by the author only |

The future programme engine may AUTOMATICALLY select only approved,
non-archived, CoachEasier-validated records (`isEngineEligible`). Club and
private content reaches athletes exclusively through explicit coach
assignment (`isAssignableByCoach`).

## Action permissions

| Action | validated/draft tier | club tier | private tier |
|---|---|---|---|
| create/edit | platform (system_admin) | S&C coach + club admin | owning S&C coach |
| approve | platform | club admin only — never the author (`canApproveRecord`) | owning coach (self-published, clearly labelled unverified) |
| archive/restore | platform | club admin | owning coach |
| publish | platform | club admin | owning coach |

Players, team coaches, medical staff and parents have no authoring powers.

## Update & snapshot rules

- Editing an exercise that has ever been assigned bumps `version`
  (`nextVersionOnEdit`); unassigned edits may stay in place.
- At assignment time a workout stores a frozen snapshot
  (`snapshotForAssignment`): exercise id + version, names, category/pattern,
  the prescription-type list, safety notes and pain-stop text.
- **Approved historical prescriptions never silently change** — they render
  from their snapshot; only new assignments pick up new versions.
- Archiving hides a record from selection everywhere but keeps it resolvable
  for historical workouts.

## Approval lifecycle

draft → in_review → approved → (archived ⇄ restored). Approval always
requires a reviewer other than the author. Audit entries (`ownership.audit`)
record create/review/approve/archive events.

## Human review requirements (Part 13)

| Gate | Required for |
|---|---|
| Qualified S&C coach | every exercise before production publication; all high-skill and high-load flags |
| Physio / sports-medicine adviser | contraindication tags, youth suitability, all neck and contact-preparation content |
| Safeguarding adviser | youth-facing content; all partner-resisted neck/contact drills |
| Privacy adviser | any media featuring identifiable people; consent records |
| Media / copyright owner | every media asset before `published` status |

Beta status: the catalogue ships with `reviewRequired` gates OPEN (nothing
is presented as medically approved). The library UI shows a "Review
required" badge wherever gates are pending, and the beta disclaimer appears
under every list view.

## Deferred decisions

- Club-admin role wiring into real CoachEasier identities (currently coach →
  `snc_coach` via the SC2 role seam).
- Cross-club sharing/marketplace for club content.
- AI-assisted drafting workflow (drafts only, never silent publication).
