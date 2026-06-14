# Deterministic Travel Action Candidate Engine

Turns M16 insights into ranked, explainable action candidates (Milestone M17).

## This is not execution. This is not AI.

The Action Candidate Engine **proposes** possible next actions — it **never
approves or executes anything**. It is a deterministic mapping from insights to
action candidates: given the same insights it produces the same candidates, in
the same order, with the same ids. No model, no randomness, no wall-clock, no
external calls.

## It converts insights into explainable action candidates

The engine consumes the **M16 Travel Insight Engine** through an injected port
(it imports M16 nothing directly; it mirrors M16's vocabulary as local literals).
Input may be a `travellerIdentityId` (insights fetched via the port), or an
insight list passed directly.

Each candidate is a structured, traceable object:

`actionCandidateId`, `travellerIdentityId`, `candidateType`, `priority`,
`confidence`, `title`, `summary`, `whyNow`, `sourceInsightIds`, `evidenceRefs`,
`riskSignals`, `missingSignals`, `approvalRequired`, `cooldownKey`, `dedupeKey`,
`status`, `createdFrom`, `sourceContextVersion`, `audit`.

- **Candidate types:** `complete_missing_information`, `review_safety_gap`,
  `add_accommodation`, `create_itinerary`, `review_companion_opportunity`,
  `review_destination_pattern`, `review_preference_pattern`,
  `review_memory_pattern`, `improve_context_quality`, `custom`.
- **Every candidate cites its cause** — `sourceInsightIds` and `evidenceRefs`
  carry the insight(s)/evidence that produced it; `sourceContextVersion` ties it
  to the originating context. **No invented actions:** a candidate exists only
  because an insight does.
- **`actionCandidateId` is deterministic** — a hash of traveller + context
  version + candidate type + discriminator + insight id (no UUIDs).

## Priority, approval, dedupe & cooldown

- **Priority** maps from insight severity (`low`/`medium`/`high`), elevated for
  high-impact types (safety → `high`/`critical`; accommodation/itinerary → at
  least `medium`).
- **Approval:** every candidate declares `approvalRequired`. High-impact types
  (`review_safety_gap`, `add_accommodation`, `create_itinerary`) and any
  `critical` candidate default to `approvalRequired: true`. The engine itself
  approves nothing.
- **dedupeKey** collapses candidates of the same type+discriminator within one
  generation (provenance is merged, not lost).
- **cooldownKey** is a cross-time suppression key that **excludes the context
  version**, so a future notification engine can recognise the same proposal
  across context refreshes and apply its own cooldown window. This engine does
  **not** persist cooldown state.

## API

- `generateTravellerActionCandidates(id, options)` — fetch insights via the port, then generate
- `generateCandidatesFromInsights(insights, options)` — pure generation from an insight list
- `rankCandidates(candidates, options)` — stable sort (`priority` default, or `by: 'confidence'`)
- `filterCandidates(candidates, filters)` — by type(s), `minPriority`, `minConfidence`, `approvalRequired`, `status`
- `explainCandidate(candidateOrId, options)` — deterministic reasoning for one candidate

## Future consumers & human approval

Future **notification**, **recommendation**, and **approval** engines consume
these candidates: they rank/suppress via `dedupeKey`/`cooldownKey`, surface
`whyNow` and `evidenceRefs`, and route anything with `approvalRequired: true`
through a human. **Human approval remains required for high-impact actions** —
this engine only proposes, never acts.
