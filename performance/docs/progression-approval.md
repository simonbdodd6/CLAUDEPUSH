# Progression approval (SC8 seam)

SC6 turns completed exposures into a progression plan. SC8 gives that plan a
place to live **without letting it act**.

## The rule

A progression suggestion is **evidence presented to a coach**. It never publishes
itself, never edits an active programme, and never repoints an assignment.

`attachProgressionSuggestion()` records it as `progressionReview.status =
'pending'`. The assignment's pinned snapshot, published version and the athlete's
Today session are all unchanged — asserted by test.

## Coach outcomes

`reviewProgressionSuggestion()` / the server `review_progression` op record one of:

* `accepted` — the coach intends to carry it into a new draft version
* `modified` — accepted with changes
* `rejected` — no change; the athlete stays on the current programme

Reviewing records the decision and the actor in the audit trail. It does **not**
publish anything. Applying an accepted suggestion means authoring v2 and
explicitly replacing the assignment — the same deliberate path as any other edit.

## What is deliberately not built

The full approval UI (side-by-side diff of suggested changes, per-exercise accept,
one-click "create v2 from suggestion") is SC9. SC8 ships the domain seam, the
server op, the pending status and the audit, so nothing has to be retrofitted and
nothing can auto-apply in the meantime.
