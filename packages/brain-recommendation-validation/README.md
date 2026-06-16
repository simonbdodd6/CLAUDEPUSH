# `@brain/recommendation-validation` — dormant recommendation validation (M49)

The deterministic layer that proves a future AI Brain recommendation is
**tenant-scoped · evidence-backed · citation-valid · confidence-scored ·
non-duplicated · immutable** — i.e. safe to expose through the façade in a later
milestone. It composes the evidence layer; it owns no storage (citation checks read
through an **injected** `@brain/evidence-store`).

> **Status: DORMANT (M49).** Pure deterministic validation — **no** storage of its
> own, network, files, clock or randomness; **no** recommendation generation,
> reasoning or prediction. Results immutable; caller input never mutated. Imported
> by nobody except tests.

## Expected recommendation shape

```
{ id: string, tenant: Tenant, evidence: string[] /* cited ids */, confidence: number /* 0..1 */, … }
```

## API

| Function | Kind | Purpose |
|---|---|---|
| `validateRecommendation(rec, { store })` | async | the gate — reports every failure `reason`; never throws for field-level invalidity |
| `validateRecommendationSet(recs, { store })` | async | each rec + cross-set duplicate-id detection |
| `recommendationEvidenceCoverage(rec, { store })` | async | evidence coverage via the citation gate |
| `missingRecommendationEvidence(rec, { store })` | async | unresolved cited ids |
| `duplicateRecommendations(recs)` | pure | duplicated recommendation ids |
| `recommendationConfidenceStatus(confidence)` | pure | band: `high` / `medium` / `low` / `insufficient` / `invalid` |

Also exports `RecommendationValidationError`, `REC_VALIDATION_ERROR`, `REC_REASON`,
`CONFIDENCE_STATUS`.

## Validation rules (asserted by `test/brain-recommendation-validation.test.js`)

stable id · tenant context · ≥1 cited evidence id · every cited id validates through
`@brain/evidence-citation` · finite confidence score/status · duplicate recommendation
ids invalid · cross-tenant / missing / empty evidence invalid · results frozen · caller
input never mutated · identical input → identical output. Malformed **input** (non-object
rec, missing store) throws `invalid_input`; field-level problems are **reported** in `reasons`.

## Non-goals (M49)

No ingestion/gateway wiring, no storage, no providers, no manual capture, no façade
exposure, no Core/engine/Experience changes, no runtime behaviour. Validation only.
