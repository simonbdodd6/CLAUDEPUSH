# `@brain/evidence-weighting` — dormant confidence-weighting library (M47)

The pure deterministic confidence-weighting maths for the AI Brain's inbound
(evidence) half, implementing the §6 model of the approved
[M42 Evidence Ingestion Architecture](../../docs/M42-evidence-ingestion-architecture.md):
**source trust · recency · corroboration · conflict · volume saturation**.
Depends only on `@brain/evidence-contracts` (for the default `CONFIDENCE_WEIGHT_CONTRACT`).

> **Status: DORMANT (M47).** Pure functions only — **no** side effects, storage,
> network, files, clock or randomness. All inputs (including ages/counts/timestamps)
> are caller-supplied; returns are immutable. **No** recommendation generation,
> reasoning or prediction — weighting maths only. Imported by nobody yet.

## API

| Function | Returns | Behaviour |
|---|---|---|
| `applyRecencyWeight(confidence, ageDays, recency?)` | `number` | halves every `halfLifeDays`; multiplier floored at `floor`; future-dated → no decay |
| `applyCorroborationBoost(confidence, corroboratingSources, corroboration?)` | `number` | `+perIndependentSource` each, capped at `cap`; never lowers confidence |
| `applyConflictPenalty(confidence, conflictingSources, conflict?)` | `{ confidence, disputed, flag }` (frozen) | compounds `(1 - penalty)` per conflict; raises `disputed` |
| `applyVolumeSaturation(count, volume?)` | `number` | `count / (count + saturationK)` — 0 → 0, K → 0.5, →1 (never reaches 1) |
| `calculateEvidenceConfidence({ sourceTrust, ageDays }, weights?)` | `number` | source-trust ceiling (number or key) decayed by recency |
| `combineEvidenceConfidence(items, weights?)` | `{ confidence, disputed, supporting, conflicting, volumeWeight }` (frozen) | aggregate over `[{ confidence, stance?, independent? }]`; no evidence → 0 |

Also exports `DEFAULT_WEIGHTS` (the contract's parameters) and
`WeightingError` / `WEIGHTING_ERROR`. Every numeric input is validated (finite); bad
input throws `invalid_input`.

## Guarantees (asserted by `test/brain-evidence-weighting.test.js`)

- **Deterministic** — identical input → identical output; no `Date`/`Math.random`.
- **Immutable** — object results are frozen; inputs are never mutated.
- **Maths correct** — recency decay/floor, corroboration boost/cap, conflict
  compounding + `disputed`, saturation limits, source-trust resolution, aggregation.
- **Edge + invalid input** — clamping, empty/zero, negative age, unknown keys, bad types.
- **Dormant** — a repo-wide scan proves no runtime code imports the package.

## Non-goals (M47)

No ingestion, gateway wiring, storage, providers, manual capture, Core/engine/
Experience changes, or runtime behaviour. Weighting mathematics only.
