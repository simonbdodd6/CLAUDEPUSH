# Executive Reasoning Layer

A **domain-agnostic explainability platform capability**. It sits *above* the
existing intelligence engines and makes every recommendation **traceable,
inspectable, and self-explaining** — without making any decisions itself.

It is reusable, unmodified, across **Website Lead Intelligence, Coach's Eye
Intelligence, Wedding Intelligence, Travel Intelligence and Hospitality
Intelligence**. Each domain maps its own recommendation/decision object onto the
neutral `ReasoningInput`; this module returns a full `ExecutiveExplanation`.

## Hard guarantees

- **No new AI.** It calls no engine and invokes no model. Every field is *composed*
  from signals the platform already produced (detector confidence, learning-engine
  calibration, decision tiers, citations, the PIF-2 approval/audit ledger,
  lifecycle timestamps). It never recomputes a probability and never calls the LLM.
- **Never decides.** It only exposes *why* a conclusion exists.
- **Pure.** Only Node built-ins (`crypto`). No engine imports, no file I/O, no
  domain logic. The Coach's-Eye-specific mapping lives in the API binding, not here.
- **UI-independent.** It returns data; a UI may consume it later.

## Inputs → Outputs

```
ReasoningInput  (any domain maps onto this)  →  ExecutiveExplanation
```

### `ExecutiveExplanation` exposes, per recommendation:

| Field | Source |
|---|---|
| `confidence` | upstream value + learning-engine calibration provenance (normalised, not recomputed) |
| `evidence` | evidence graph (citations + entity links + signals) with pure `traverse()` |
| `reasoning` | ordered step trace composed from evaluated conditions, rank factors, calibration, decision tier |
| `assumptions` | the priors actually in play |
| `uncertainty` | band + reasons + qualitative range (presentation-only, not a statistical interval) |
| `missingInformation` | gaps detected from mock/stale/absent/thin-sample signals |
| `alternatives` | the ranked runners-up that were considered but not chosen |
| `decisionOwner` | owner + AUTO/APPROVE/HUMAN tier |
| `approvalState` | linkage to the durable approval record (PIF-2) |
| `featureFlags` | the flags involved |
| `timeline` / `provenance` | lifecycle + origin trace |

## Usage

```js
import { createExecutiveReasoningPlatform } from './lib/executive-reasoning/index.js';

const reasoning = createExecutiveReasoningPlatform();           // in-memory store
const explanation = reasoning.explain(myRecommendation);       // compose only
const panel = reasoning.panel(explanation);                    // UI-agnostic panel model
reasoning.record(myRecommendation);                            // compose + store
```

Pass a durable `sink` (e.g. the PIF-2 ledger) to mirror explanations:

```js
createExecutiveReasoningPlatform({ sink: { append: (r) => ledger.append('explanations', r) } });
```

## API (binding)

Exposed via the Recommendation Inspector API in `app/api-server.js`, flag-gated
behind `isIntelligenceEnabled` (existing `intelligence.features` schema):

- `POST /api/recommendations/explain` — body carries any domain's recommendation;
  returns its `ExecutiveExplanation`. Fully generic.
- `GET  /api/recommendations/explain?approvalId=X` — explains a durable approval
  item by composing the PIF-2 ledger (approval + audit + learning outcome) with
  Knowledge-Engine evidence. Real persisted data only — never mock.

## Files

| File | Responsibility |
|---|---|
| `constants.js` | neutral vocabulary (bands, tiers, edge/evidence kinds) |
| `confidence.js` | normalise upstream confidence + calibration provenance |
| `evidence-graph.js` | build graph + pure `traverse()` |
| `missing-evidence.js` | detect gaps from existing quality signals |
| `reasoning-trace.js` | compose the step-by-step trace |
| `timeline.js` | timeline, provenance, approval linkage |
| `explanation.js` | the `ExecutiveExplanation` object + panel projection |
| `repository.js` | in-memory store (adapter boundary) |
| `service.js` | factory, input normalisation, optional durable sink |
| `index.js` | public API |
