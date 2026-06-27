# Brain Readiness Wiring Plan (ADR) — getting the readiness coachView into the product

**Status:** Proposed (awaiting sign-off). Authored on `feature/coaches-eye-intelligence`. Revised after
review to keep Brain integration off the live Beta development branch.
**Scope:** Phase 1 of the Brain Activation Plan — render the readiness `coachView` (M217) in the real
product behind the existing feature flag, reusing the dormant M221–M228 view layer.
**Non-negotiable:** with the flag **off**, the product is **byte-identical** to today. Read-only only.
**Branch model (hard rule):** the active **Beta design branch (`feature/core-beta-simplification`)
stays untouched** and remains the commercial UI branch until its owner decides it is ready. All Brain
integration happens on a **separate, temporary integration branch** (see D1) — never on the live Beta
branch.

---

## 1. Context — why this needs a plan, not a merge

The Brain work and the live product have forked hard. Both branches share base `81d3f625`, but:

| | Brain branch (`feature/coaches-eye-intelligence`) | Beta branch (`feature/core-beta-simplification`) |
|---|---|---|
| commits since base | +331 | +261 |
| `index.html` | 9,202 lines (stale UI) | **24,769 lines** (the real, current UI) |
| Brain engines (`packages/`) | present | **absent** |
| Brain endpoint + `web/` view layer | present | **absent** |
| real serverless functions (`api/*.js`, non-`_`) | 13 | **12** |

`git diff` of `index.html` between the branches is **+17,904 / −2,337** — effectively two different
files. **A git merge of these branches is not viable** (multi-thousand-line manual conflict resolution
on the one file we least want to hand-merge).

Two facts make a *non-merge* path clean:

1. **Everything Brain is additive on beta.** `packages/`, `web/`, `api/_brainProviders.js`,
   `api/_brainFlags.js`, and the `brain-draft` handler are **all absent** on beta — they port as **new
   files with zero conflicts**. Every shared helper the endpoint imports (`_http`, `_kv`, `_tenant`,
   `_keys`, `_identityStore`, `_availabilityStore`) **already exists on beta** (verified).

2. **Beta is exactly on the Vercel Hobby 12-function cap.** A standalone `api/brain-draft.js` would be a
   13th function and **break the deploy**. There are two viable ways around this — folding the handler
   into an existing function (e.g. `api/mission-control.js`, which already shares brain-draft's
   `requireTenantRole(['coach','admin'])` auth and an `?action=` dispatcher) **or** freeing a slot for a
   standalone endpoint. Which one we use is an **open implementation decision** (§2 / D2), deliberately
   **not** locked into this architecture.

---

## 2. Decision

**D1 — Reconcile by porting Brain onto a *new, temporary integration branch* cut from the latest Core
Beta — not by merging branches and not onto the live Beta branch.** When integration begins (not now),
we branch from the then-current `feature/core-beta-simplification` head into a dedicated branch — working
name **`feature/core-beta-brain`** — and port the Brain assets onto *that* branch as additive files.
- The integration branch is **temporary** and **dedicated to Brain integration/testing only**.
- The active **Beta design branch stays untouched** and remains the commercial UI branch; UI work
  continues there in parallel, unaffected.
- When the integration branch has proven the wiring (and the Beta owner decides Beta is ready), the
  readiness work is brought back in as a deliberate, separate step. Until then the two never mix.
- The Brain branch (`feature/coaches-eye-intelligence`) remains the development home for the engines and
  the `web/` view layer; the integration branch is cut from Beta and *receives* those assets.

**D2 — The endpoint strategy is an OPEN implementation decision, made on the integration branch — not
fixed by this architecture.** The function-cap constraint (§1) is real, but how we satisfy it is
deferred to implementation. The two candidates, with trade-offs:

| Option | Pros | Cons |
|---|---|---|
| **Fold into an existing function** (e.g. `mission-control?action=brain-draft`) | No new function slot (stays ≤ 12); reuses identical `coach/admin` auth + the existing `?action=` dispatcher; smallest deploy footprint | Couples Brain to an unrelated dev/admin route; that file grows; action namespace shared; harder to reason about/observe in isolation |
| **Standalone `api/brain-draft.js`** (free a slot first, e.g. retire/merge a dev-only route) | Clean, isolated, self-describing endpoint; independent auth/observability/rate-limiting; easier to delete | Requires freeing a function slot (removing/merging an existing route) → its own risk + decision; more moving parts up front |

Either keeps the endpoint **read-only and flag-gated**. The choice is recorded as open; we decide it at
the start of Phase 1b, on the integration branch, with the real deploy in front of us.

**D3 — One product edit only: a flag-gated, read-only readiness panel in the integration branch's
`index.html`.** It is hidden unless the per-team flag returns data; flag off ⇒ the panel never renders ⇒
production unchanged. This edit lives **only on the integration branch**, never on the live Beta branch.

**Alternatives considered & rejected:**
- *Merge the branches* — rejected (§1, the `index.html` divergence).
- *Make the live Beta branch the canonical Brain branch / port directly onto it* — rejected per review:
  Beta must stay untouched as the commercial UI branch while its design is finished.
- *Port Beta's `index.html` onto the Brain branch* — rejected; inverts which branch is canonical and
  drags 261 commits of UI onto the Brain branch.
- *Preview-deploy only (Phase 0 forever)* — rejected as the end state; it never reaches a coach.

*(Endpoint fold-vs-standalone is intentionally NOT in this rejected list — it is an open decision, D2.)*

---

## 3. Porting manifest (exact, all additive)

Copy from `feature/coaches-eye-intelligence` → the **new integration branch** (`feature/core-beta-brain`,
cut from latest Beta). Nothing below ever lands on the live Beta branch.

| Asset | What | Notes |
|---|---|---|
| `packages/` | the whole tree (16 entries: `coach-intelligence`, `brain-decision-planner`, `brain-evidence-*`, `coach-memory`, `coach-core-adapter`, `brain-contracts`, `brain-products`, `brain-recommendation-validation`, `brain-versioning`, `product-coaches-eye`, `README.md`) | absent on Beta; engines `_brainProviders` transitively needs. Dormant unless the gated action runs. |
| `web/` | 8 files (M221–M228): `brain-readiness-{view,theme,snapshots,a11y-print,export,gallery,validator,docs}.js` | absent on Beta; pure view layer. |
| `api/_brainFlags.js`, `api/_brainProviders.js` | the read-only adapters + flag resolution | absent on Beta. |
| **the Brain endpoint** | per **D2 (open)**: either an `action === 'brain-draft'` branch added to an existing function, **or** a standalone `api/brain-draft.js` once a slot is freed | decided at the start of Phase 1b. |
| `index.html` | **edit**: add the flag-gated readiness panel hook (§5) | the only change to the product UI, on the integration branch only. |
| `test/` | the brain + web tests (so CI stays green on the integration branch) | additive. |

Shared helpers already on Beta (no port needed): `_http`, `_kv`, `_tenant`, `_keys`, `_identityStore`,
`_availabilityStore`.

---

## 4. Phased execution (de-risked, each phase independently verifiable)

All phases happen on the temporary integration branch — never on the live Beta branch.

- **Phase 1a — sample render behind the feature flag (no endpoint, no cap risk).** Port `web/` + the
  `coach-intelligence` sample (`buildReadinessCoachViewSample`, M219) onto the integration branch. Add
  the flag-gated panel to `index.html` rendering the **sample** coachView via the M221/M226 renderer.
  Proves the UI renders inside the real product behind the flag, with **no** new endpoint and **no**
  function-cap exposure. Smallest real "see it in the product" step.
- **Phase 1b — live coachView.** Port `packages/` + `api/_brain*` and stand up the Brain endpoint via the
  strategy chosen in **D2** (folded action route **or** standalone). Point the panel at the live
  endpoint; fall back to hidden on 404/disabled. Real data end-to-end, still read-only, still flag-gated.
- **Phase 1c — full readiness panel and export.** Surface the complete `coachView` (key numbers,
  warnings, position groups, trend) + the export/print actions (M225) behind the flag. Optional a11y
  variant (M224).

Each phase ends green (full suite + depcruise + the M227 validator) and **flag-off byte-identical**.

---

## 5. The `index.html` hook (design)

A single self-contained, premium-gated block, off by default:

```js
// flag-gated, read-only; absent from the DOM unless the team flag returns data.
// BRAIN_DRAFT_URL is resolved per D2 (folded action route OR standalone endpoint) at Phase 1b.
// In Phase 1a there is no fetch at all — the panel renders the M219 sample coachView.
async function maybeRenderReadiness() {
  if (!isCoach()) return                                  // coach/admin only
  let coachView
  try {
    const res = await fetch(BRAIN_DRAFT_URL)              // e.g. ?action=brain-draft OR /api/brain-draft
    if (!res.ok) return                                   // 404/disabled ⇒ flag off ⇒ render nothing
    coachView = (await res.json()).coachView
  } catch { return }
  if (!coachView) return
  document.getElementById('readinessMount').innerHTML = renderReadinessCoachView(coachView) // M221
}
```

Invariants: (a) no call, no DOM, no styles when the flag is off; (b) read-only — the panel never writes;
(c) the renderer is the committed, escaped M221 view; (d) `renderReadinessCoachView` ships as a small
inlined/bundled function (the `web/` modules are ESM — decide bundling vs inline copy in 1a).

---

## 6. Verification & rollback

**Verification (every phase):** `npm test` green · `npx depcruise packages` 0 violations ·
`validateReadinessRendering()` all-pass · **flag-off diff of rendered `index.html` output = empty** ·
preview deploy smoke test on the demo team (`boitsfort-rfc`/`coach-demo`).

**Rollback:** because all work is isolated on the temporary integration branch, the ultimate rollback is
simply to **abandon/delete that branch** — the live Beta branch is never touched, so there is nothing to
revert there. Within the integration branch, rollback is also clean (everything is additive + one flag):
delete the ported `packages/`/`web/`/`api/_brain*`, revert the endpoint change and the `index.html` hook
— no data migration, no schema change.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| ESM `web/` modules vs `index.html`'s inline script | Phase 1a decides: small inline copy of the renderer, or a bundled `web/brain-readiness.bundle.js`. |
| `packages/` bundling in serverless (Vercel) | Verify import paths in a preview build *before* wiring 1b (already a Phase-0 open item). |
| Integration branch goes stale as Beta keeps moving | Cut the integration branch fresh from latest Beta only when integration begins; keep it short-lived; if Beta advances materially, re-cut from Beta and re-port (cheap, because everything is additive). |
| Hook drift inside the integration branch | Keep the hook to one mount point + one function; no edits to existing UI code. |
| Accidental write / coupling | `_brainProviders` is read-only (`kvGet` only); lint/grep in CI; engines never imported by Core. |
| Treating any branch as "merged canonical" prematurely | No branch is merged; the integration branch is temporary and disposable. Beta remains the commercial UI branch until its owner decides it is ready; bring-back is a later, separate, explicit step. |

---

## 8. Open decisions for sign-off

1. **Branch model (decided per review):** a new, temporary integration branch (working name
   `feature/core-beta-brain`) is cut from latest Beta when integration begins; the live Beta branch stays
   untouched. — *Confirm the working name, or supply a preferred one.*
2. **Endpoint strategy (open — D2):** fold into an existing function **vs** standalone endpoint (free a
   slot). Decide at the start of Phase 1b, on the integration branch, with the real deploy in front of
   us. *(Recorded as open; not part of this architecture.)*
3. **Phase 1a bundling:** inline the single renderer into `index.html`, or add a built
   `web/brain-readiness.bundle.js`?
4. **Timing / trigger:** when does integration begin? Per review, **not until the Beta design is
   finished** — the integration branch is not cut, and no code is ported, before then.

*Nothing in this document changes any code, creates any branch, or touches the Beta branch. It is a plan
on the Brain branch for review; cutting the integration branch and executing Phase 1a are separate,
explicitly-approved steps.*
