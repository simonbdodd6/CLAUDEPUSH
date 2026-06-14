# Travel Intelligence Orchestrator

The integration layer that wires the deterministic chain to approval (Milestone M19).

## Purpose

Everything before this milestone was built but **inert** — the intelligence chain
ran only on hand-fed data and nothing was ever routed for a decision. This thin
orchestrator connects what already exists, end-to-end:

```
context (M15) → insight (M16) → action-candidate (M17) → approval (M18)
```

It generates action candidates for a traveller and routes the
`approvalRequired` ones into the **Universal Approval Platform** as approval
requests. It is the integration that proves M18 is real shared infrastructure.

## What it is — and is not

- **Pure integration, no data of its own.** No repository, no persistence, no
  new domain. It composes existing modules through **injected ports only** and
  changes none of their internals.
- **Deterministic.** No AI, no randomness, no wall-clock in its own output.
- **Never executes, never approves.** It only *submits* approval requests; the
  human decision still happens in the Approval Platform.

## Composition

The M17 action-candidate engine already encapsulates context → insight →
action-candidate, so the orchestrator injects just the top of the chain plus
approval:

```js
const orchestrator = createTravelIntelligenceOrchestrator({
  travelActionCandidateEngine, // M17 (itself wired to M16 → M15)
  approvalPlatform,            // M18
});

const { candidates, approvalRequests } = await orchestrator.generateAndRoute(travellerIdentityId);
```

## Idempotency

Each approval `requestId` is derived deterministically from the candidate's
stable `cooldownKey` (which **excludes** the context version). So:

- Re-running `generateAndRoute` never creates duplicate approval requests — an
  already-existing request is **skipped** (`outcome: 'skipped_existing'`), not
  re-submitted.
- The same logical proposal maps to the same approval request across context
  refreshes, which is exactly what a downstream notification/approval queue
  needs.

## API

- `generateAndRoute(travellerIdentityId, options)` → `{ candidates, approvalRequests }`
  - `candidates`: the full ranked candidate list (informational).
  - `approvalRequests`: a deterministic routing summary — one entry per
    approval-required candidate with `requestId`, `actionCandidateId`,
    `candidateType`, `priority`, and `outcome` (`submitted` | `skipped_existing`).
- `routeCandidates(candidates, options)` — route an existing candidate list (no regeneration).
- `buildApprovalRequestFromCandidate(candidate, options)` — pure candidate→request mapping (no side effects); useful for dry-runs and testing.

`options.approvalPolicyFor(candidate)` is an optional hook to attach a per-request
policy; otherwise the Approval Platform's default policy applies.

## Boundaries respected

- No existing module's internals are touched — orchestration is purely additive.
- Publisher adoption (writing to timeline/graph) is **not** done here; that
  remains a separate, opt-in step. The chain still runs on whatever data the
  injected platforms already hold.
