# Deterministic Travel Insight Engine

Explainable, deterministic travel insights over the M15 context (Milestone M16).

## This is deterministic, not AI

The Insight Engine is a **rules layer**, not AI and not (yet) recommendations.
Given the same context snapshot it always produces the same insights, in the same
order, with the same ids. There is no model, no randomness, no wall-clock. It
**never executes actions** — it only describes what the deterministic evidence
shows.

## It consumes the M15 context

The engine takes the **Travel Intelligence Context** (M15) through an injected
port and reads a context snapshot. It imports M15 nothing directly; it mirrors
M15's vocabulary as local string literals (the established decoupling pattern).

```js
const engine = createTravelInsightEngine({ travelIntelligenceContext });
await engine.generateTravellerInsights(travellerIdentityId, options);
engine.generateInsightsFromContext(contextSnapshot, options);
```

## It creates explainable insights

Each insight is a structured, traceable object:

`insightId`, `travellerIdentityId`, `insightType`, `severity`, `confidence`,
`title`, `summary`, `evidenceRefs`, `riskSignals`, `missingSignals`,
`sourceContextVersion`, `createdFrom`, `status`, `audit`.

- **Insight types:** `missing_information`, `safety_gap`, `planning_gap`,
  `preference_pattern`, `memory_pattern`, `companion_opportunity`,
  `destination_pattern`, `timeline_pattern`, `relationship_pattern`,
  `context_quality`, `custom`.
- **Evidence is traceable:** `evidenceRefs` are the exact M15 evidence entries
  the insight drew on; `riskSignals` / `missingSignals` cite the context codes;
  `sourceContextVersion` ties the insight to the precise context it came from.
- **`insightId` is deterministic** — a hash of `travellerId + contextVersion +
  rule`, so the same context yields identical, stable ids (no UUIDs).

### Never invents facts

Every rule fires only when its supporting signal exists in the context. If data
is missing, the engine says it is missing (e.g. emergency contact / passport are
surfaced as honest placeholders, never as confirmed problems) — it does not
fabricate patterns or positives that the evidence does not support.

## Rules (deterministic)

Missing emergency contact (placeholder) · passport placeholder · missing
preferences · missing accommodation · missing itinerary · sparse travel history ·
no companions · low evidence coverage · conflicting preference/memory signals ·
strong destination pattern · strong companion opportunity · strong memory
pattern · relationship hub · dominant timeline pattern. Thresholds and severities
live in `constants.js`.

## API

- `generateTravellerInsights(id, options)` — fetch the context via the port, then generate
- `generateInsightsFromContext(contextSnapshot, options)` — pure generation from a snapshot
- `explainInsight(insightOrId, options)` — deterministic reasoning for one insight
- `rankInsights(insights, options)` — stable sort (`severity` default, or `by: 'confidence'`)
- `filterInsights(insights, filters)` — by type(s), `minSeverity`, `minConfidence`, `status`

## Future substrate

This engine is the deterministic foundation that future **recommendation
engines**, **notification engines**, and **AI reasoning** sit on top of: they
consume explainable, evidence-cited insights instead of re-deriving them, and any
AI layer can cite the same evidence the rules used. The engine itself stays pure,
explainable, and action-free.
