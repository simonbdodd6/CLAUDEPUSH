# Programme authoring (SC8)

`Performance → Programmes → New programme`:
**pick athlete → generate → review → publish → assign.** Every step is a coach
decision. Nothing auto-publishes and nothing auto-assigns.

## Generation is deterministic, not generative

The draft comes from the SC5 engine — `engineInputFromProfile` →
`generateBlueprint` → `programmeDraftFromBlueprint`. **No AI is involved.** The
inputs are the athlete's own profile: position, training age, technical
confidence, goals, equipment, availability, rugby schedule, season phase and
restrictions, plus the group's structured `developmentCategory`.

The profile comes from the **server, for the selected athlete** — see
`athlete-profile-sync.md`. It is never read from the coach's own device: a coach
who is also an athlete would otherwise build someone else's programme from their
own body data.

If the athlete has no usable profile, generation **fails honestly** and names what
is missing. A fabricated profile would produce a real-looking programme built on
nothing, and the coach's own profile is never a fallback.

## The transformation (`blueprint-to-programme.js`)

The blueprint speaks coaching; SC4 stores structure. This seam expresses one in
the other and decides nothing:

* **Preserved**: reason codes, review flags, development context, exercise ids at
  their pinned versions, block intent, volume/intensity categories, match-week
  relationships, unfilled slots.
* **Reconciled**: SC5's `trunk` block becomes SC4 `accessory` (SC4's vocabulary
  stays closed); match placements map onto SC4's `RUGBY_RELATIONS`.
* **Never invented**: no kilograms and no percentages of an untested 1RM.
  Prescriptions are sets, reps and **effort** (RPE), which an athlete can execute
  on day one. SC6 resolves real loads later from real evidence.
* **Field-safe**: a prescription only uses fields the exercise itself declares
  (`ex.prescription`), so a bodyweight movement is never given an RPE it does not
  support.
* **Days come from the athlete**: training days are their available days minus
  rugby and match day. Unknown availability yields `unscheduled` days for the
  coach to place — admitted, not guessed.

## Review

The review screen exists to answer *why does this programme look like this?* It
shows the athlete and their development context, the frequency and dose
categories, the engine version, the days chosen and why, every warning and review
flag, unfilled slots, uncovered movement patterns, and the full week structure
with real prescriptions.

## Publication and the human gate

Publishing validates through `validateProgrammeVersion`, freezes the training
content via SC4 `publishProgrammeVersion`, and records the author.

SC5/SC6 rule tables are **provisional**. A coach must tick an explicit
acknowledgement that **they** reviewed the programme. The wording says exactly
that: it is not a medical or professional approval, and CoachEasier does not
provide one. A review-flagged programme cannot be published without it — enforced
on the server, not only in the UI.

## Deferred to SC9

Draft editing UI (session titles, reordering, substitution, per-set overrides),
templates, adaptive scheduling, team-wide compliance views, and the full
progression-approval workflow.
