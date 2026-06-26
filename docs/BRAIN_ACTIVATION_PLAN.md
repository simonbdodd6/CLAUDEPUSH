# Brain Activation Plan — wiring the dormant boundary into the live product

> **Status: PLAN (no code yet).** This document designs how a real, flag-gated **Premium** feature would
> feed the *proven dormant* Brain boundary (M164/M167 contracts → `buildBrainInputs` → the M118–M131
> pipeline) from **real Core data**, producing a **draft** match-day squad for the coach to review —
> **without changing Core behaviour**. It commits no code. It is the bridge from "tower of dormant,
> tested modules" to "one usable, gated feature."

Related: [`BRAIN_ARCHITECTURE_ATLAS.md`](BRAIN_ARCHITECTURE_ATLAS.md), `packages/brain-decision-planner/README.md`.

---

## 1. Principles (non-negotiable)

1. **Read-only.** The Brain only *reads* Core data. It never writes to any Core Redis key.
2. **Draft-only.** Output is a *suggested* squad the coach reviews. It is never auto-saved to
   `app:matchday:current` or published to players.
3. **Flag-gated, off by default.** With the flag off, the feature does not run and Core is byte-for-byte
   unchanged. No Core code path branches on the Brain when the flag is off.
4. **Tenant-isolated.** Every read is filtered by the authenticated coach's `teamId`. No cross-club data.
5. **Deterministic & explainable.** Reuses the proven boundary: validated, frozen, deterministic output
   with the M184 explanation attached. No new selection/scoring logic in the wiring.
6. **Engines injected, not imported into Core.** Core never imports the Brain engines; the activation
   surface (a serverless function) is the only place that composes them.

## 2. What is already proven (the dormant stack)

A single call already turns two read-only providers into a complete, explained squad — see the atlas:

```
{ squadLoader (M164), decisionPlanSource (M167) }
  → buildBrainInputs (M170) → runBoundarySquadCapstone (M172)  → match-day squad (M130)
  → buildSelectionExplanation (M184) / coverage / decision-diff diagnostics
```

The **only** thing missing for activation is **real implementations of the two providers** plus a
**gated runtime** to call them. Everything downstream is built and tested (3500+ tests green).

## 3. Core data readiness (from a live-product audit)

Backend: **Upstash Redis** (REST), keys prefixed `app:` (via `_kv.js`); auth via `ce_session` cookie /
Bearer token resolved by `_identityStore.js`.

| Brain provider method (contract) | Core source | Status |
|---|---|---|
| `getActivePlayers` (M164) | `app:identity:player_profiles` ∩ active `app:identity:team_members`, filtered by `teamId` | ✅ ready |
| `getAvailabilityResponses` (M164) | `app:availability:{sessionId}` (object keyed by userId, `{response}`) | ✅ ready |
| `getCoachMemories` (M164) | **none in Core** | ❌ missing → Phase 2 |
| `getPlayerTags` (M164) | only `player_profiles[].position` (no general tags) | ⚠️ partial → Phase 2 |
| `getFixtureContext` (M167) | `app:fixtures` (pick the next fixture) + a **decision intent** | ⚠️ fixture ready; intent is new |
| `getCoachIdentity` (M167) | session → `userId` (=coachId), `teamId` (=clubId), role | ✅ ready |

**Conclusion: 4 of 6 inputs exist today.** A first feature runs on players + availability + fixture +
identity with **neutral DNA** (empty memories/tags) — exactly the path proven in the M162 end-to-end and
the M172 capstone. Memory/tag-driven DNA is a clean Phase 2 enhancement, not a blocker.

## 4. Provider mapping (real adapters, read-only)

These are thin adapters over the existing Core stores — they belong in the **activation surface**, not in
`packages/*` (which must stay store-agnostic). Each returns the exact shape the contracts validate.

```
getActivePlayers()         → profiles.filter(teamId).filter(activeMember)
                             .map(p => ({ id: p.id, userId: p.userId, displayName: p.displayName, position: p.position }))
getAvailabilityResponses() → kvGet(`app:availability:${sessionId}`)  // already { [userId]: { response } }
getCoachMemories()         → []            // Phase 1: none in Core (neutral DNA)
getPlayerTags()            → {}            // Phase 1: none (or { [userId]: { tags: [normalize(position)] } })
getFixtureContext()        → { fixture: nextFixture, match: DEFAULT_INTENT }   // see §6
getCoachIdentity()         → { coachId: session.userId, clubId: session.teamId, tags: [] }
```

Position normalization already exists in `coach-core-adapter` (M132-era), so Core position strings map to
the engine's jersey positions without new logic.

**Availability ↔ fixture linkage (a real gap, resolved for v1).** Core availability is keyed by a single
`sessionId` (default `"game"`) — it is *not* per-fixture. So "availability for the next fixture" is, in
v1, **the current availability poll (`sessionId="game"`) paired with the next upcoming `app:fixtures`
entry by date**. This is an explicit v1 simplification: the draft answers "best XV for the next fixture,
given who has responded to the current availability poll." Per-fixture availability is a later Core
enhancement, not a Phase-0 requirement. The route accepts `?sessionId=` to override the default.

## 5. Runtime architecture

```
 coach (premium, flag on)
   │  GET /api/brain-draft?sessionId=game           (read-only, coach-auth)
   ▼
 serverless function (the ONLY activation surface)
   1. resolve session  → coachId, teamId, role==coach   (else 403)
   2. check premium flag for team → off ⇒ 404/disabled   (Core untouched)
   3. build squadLoader (M164) + decisionPlanSource (M167) over Core stores (read-only, teamId-scoped)
   4. import Brain: buildBrainInputs / runBoundarySquadCapstone, inject { runCoachIntelligencePipeline,
      buildCoachRecommendation, runSelectionPipeline } as pipelineServices
   5. buildSelectionExplanation(squad)  → draft + codes
   6. return JSON draft (never writes Redis)
   ▼
 coach reviews the DRAFT in the UI → may manually accept into the normal matchday flow (their action)
```

- **Pure read path.** No `kvSet`/`LPUSH`/`DEL`. The function only `kvGet`s and computes.
- **No Core branching.** Existing endpoints/handlers are unchanged; this is an *additional*, isolated route.

## 6. The decision-intent gap (the "match")

`getFixtureContext` returns `{ fixture, match }` where `match` is the **decision intent** (`category`,
`confidence`, `matchedSignals`) — i.e. *what the coach is deciding*. Core has no such object today. For v1:

```
const DEFAULT_INTENT = { category: 'selection-preference', confidence: 0.7, matchedSignals: [] }
```

This yields a straightforward "best available XV for the next fixture" draft. Later, the intent can come
from a coach prompt or saved preference — but v1 needs no new Core data for it.

## 7. The two data gaps → Phase 2 (Brain-owned stores)

Neither exists in Core; both are **Brain-owned**, so they don't touch Core's schema:

- **Coach memories** → a new Brain-owned key, e.g. `app:brain:memories:{coachId}` (JSON array of M108
  entries), written *only* by a future Brain "capture" flow (coach confirming an insight) — still never a
  Core key. The M108 store contract (`searchCoachMemory`) already defines this interface. Until populated,
  `getCoachMemories()` returns `[]` and DNA is neutral.
- **Player tags** → `app:brain:player_tags:{teamId}` (JSON map). Until populated, `{}`.

Phase 2 turns on Coach DNA (M113/M114 → per-player confidence influence, M152–M158) once memories exist.

## 8. Flag gating

- **Global kill-switch:** env `BRAIN_ENABLED` (default off) — when unset/false the route is disabled.
- **Per-team premium flag:** `app:brain:flags:{teamId}` → `{ enabled: true }` (default absent ⇒ off).
- Both must be true to run. Flag reads are the only state the feature consults; flipping a flag is a
  deliberate, reversible op. No migration, no Core change.

## 9. Safety guarantees / invariants (testable)

- Flag off ⇒ route returns disabled and performs **zero** Redis reads of Core selection data.
- The function performs **no writes** (assert: no `kvSet`/`kvDel`/`LPUSH` in the handler).
- Every read is `teamId`-scoped (assert: players/availability filtered by the session's `teamId`).
- Output is a draft payload only; it never targets `app:matchday:current`.
- Brain output stays deterministic/frozen (inherited from the dormant stack).

## 10. Packaging & deploy constraints (real)

- **Vercel function cap — DECISION (locked for Phase 0).** Core is already near the **12-function**
  limit. **Phase 0 runs on a preview deployment only**, so it does not consume a production function slot
  and the cap is *not* a Phase-0 blocker. The production-slot decision is deferred to **Phase 1**, where
  the options are: (a) fold the draft route into an existing low-traffic function behind an `action`
  param (no new slot); (b) retire/merge a dev-only route (`mission-control`/`system-status`). Phase 1
  must not ship without resolving this.
- **ESM import.** The Brain packages are relative-import ESM with no `package.json`; the function must
  import them by path (Vercel bundles the repo). Verify the bundler includes `packages/coach-*` and
  `packages/brain-decision-planner` (+ the one `@brain/evidence-gateway` workspace dep used by M125/M127).
- **Determinism in serverless.** The stack uses no clock/randomness, so cold starts and retries are safe.

## 11. Phased rollout

- **Phase 0 — Shadow (no UI), PREVIEW DEPLOY ONLY.** Build the gated read-only function; behind the flag
  it returns the draft JSON. Runs on a **preview deployment** (no production function slot consumed).
  Verify on the demo team (`boitsfort-rfc`/`coach-demo`) that it produces a complete XV from live data. No
  coach-facing surface yet. The committed deliverable is the **function + read-only adapters + an
  integration test that stubs `_kv`** (so it runs in CI without Redis); the preview deploy is the manual
  smoke test. *Smallest real proof that the boundary runs on production-shaped data.*
- **Phase 1 — Draft review UI.** A premium-only screen that calls the function and shows the draft XV +
  the M184 explanation codes, with a manual "use this as a starting point" that drops the coach into the
  existing matchday flow (their edit, their save). Still read-only/draft-only. *The endpoint already
  exposes the readiness `coachView` (M218) as the stable, internals-free UI contract, and
  `buildReadinessCoachViewSample()` (M219) gives a representative sample to build against before any live
  call — so the Phase-1 UI can be built without further endpoint changes.*
- **Phase 2 — Coach DNA.** Add the Brain-owned memory + tag stores and a lightweight capture flow; turn on
  DNA influence so drafts reflect the coach's style.
- **Phase 3 — Intent & breadth.** Coach-specified decision intent, multiple fixtures, more teams.

## 12. Definition of done — Phase 0

- [ ] `BRAIN_ENABLED` + per-team flag both gate the route; off ⇒ disabled, zero Core selection reads.
- [ ] Read-only adapters for the 4 ready providers (+ empty memories/tags, default intent).
- [ ] Function composes the proven boundary and returns a complete, explained draft for `boitsfort-rfc`.
- [ ] No writes; tenant-scoped; deterministic; covered by an integration test using a stubbed `_kv`.
- [ ] Runs on a **preview deploy** (no production slot); production-slot decision explicitly deferred to Phase 1 (§10).

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Exceeding the 12-function Vercel cap | Decide §10 option before Phase 1; Phase 0 can run on a preview deploy. |
| Accidental Core write / coupling | Lint/test that the handler only `kvGet`s; keep adapters in the activation surface, not `packages/*`. |
| Empty/sparse live data (no availability yet) | Boundary already handles vacant jerseys (M124 risk + coverage < 1); draft degrades gracefully. |
| Premium scope creep | Phase 0 is shadow-only; no UI until the draft is proven on real data. |
| Brain bundling in serverless | Verify import paths in a preview build before wiring any UI. |

## 14. Draft response shape (Phase 0 → readiness wired, M205–M219)

The function returns a read-only JSON envelope — a draft, explicitly labelled as such. The squad fields
landed in M205/M207; the **readiness** fields were wired read-only in M216 (`readinessBundle`) and M218
(`coachView`):

```jsonc
{
  "draft": true,                       // never a saved/published selection
  "squad": { /* M130 match-day squad: startingXV, captain, viceCaptain, bench, reserves, risk, signOff */ },
  "explanation": { /* M184: summary, starters[codes], bench[codes], risks, alternatives, confidenceNotes */ },
  "verification": { /* M178-style counts: startingCount, benchCount, reserveCount, warningCount */ },
  "readiness": { /* M206: status, codes, metrics (the squad readiness observer) */ },
  "readinessBundle": { /* M213: manifest, validation (M212 gate), confidence, warnings, sources (M206/M208/M209/M211/M212) */ },
  "coachView": { /* M217: status, confidence, gate, headline, keyNumbers, warnings, playerReadiness, squad, trend */ },
  "meta": { "readOnly": true, "preview": true, "dnaApplied": false, "intent": "selection-preference",
            "playerCount": 24, "fixtureId": "fix_…" }
}
```

`dnaApplied: false` makes the v1 "neutral DNA" explicit; `coachView` is the **stable UI contract** (no raw
internals leak — see M217). Because Core has only availability today, `coachView.confidence` reports
honestly low. No field references any Core mutation. `buildReadinessCoachViewSample()` (M219) returns a
representative `coachView` for UI development without a live call.

## 15. File layout (activation surface)

Keep the wiring **out of `packages/*`** (which must stay store-agnostic). Suggested:

```
api/
  brain-draft.js          # the gated, read-only route (resolve session → flags → adapters → boundary → draft)
  _brainProviders.js      # read-only M164/M167 adapters over _kv/_identityStore/_availabilityStore/fixtures
  _brainFlags.js          # BRAIN_ENABLED + app:brain:flags:{teamId} resolution
test/
  api-brain-draft.test.js # integration test with a stubbed _kv (no Redis), asserts complete XV + no writes
```

The route imports the proven boundary from `packages/brain-decision-planner` and injects the
`coach-intelligence` engines as `pipelineServices`. `_brainProviders.js` is the *only* new Core-coupled
code, and it is read-only.

## 16. Open design questions (decide during refinement / Phase 0)

1. **"Next fixture" selection** — earliest `app:fixtures` entry with `date >= today`? Tie-break by
   `kickoff`/`createdAt`? (v1: earliest future date, then `createdAt`.)
2. **Decision intent source** — fixed `DEFAULT_INTENT` for v1 (agreed); when does a coach-specified intent
   arrive (Phase 3)?
3. **Memory capture flow (Phase 2)** — how does a coach insight become an M108 entry in
   `app:brain:memories:{coachId}`? (Out of scope for Phase 0.)
4. **Bench/formation defaults** — confirm the formation (DEFAULT_FORMATION, 15-a-side union) and bench
   size for the draft; expose as route options later.
5. **Empty-data behaviour** — no fixtures ⇒ 200 with `squad: null` + reason, or 422? (Proposed: 200 with a
   clear `reason`, so the UI can message "add a fixture / collect availability".)

---

*This document is a plan only. It adds no exports, changes no runtime behaviour, and wires nothing —
the next step (Phase 0) is a separate, explicitly-approved change.*
