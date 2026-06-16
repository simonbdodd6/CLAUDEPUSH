# `@brain/evidence-citation` — dormant citation validation (M48)

The deterministic validation layer that guarantees every future Brain recommendation
can be traced back to **real, same-tenant, non-duplicate** evidence — the citation
gate from §4a of the approved
[M42 Evidence Ingestion Architecture](../../docs/M42-evidence-ingestion-architecture.md).
Depends only on `@brain/evidence-store` (its pure `assertTenant` / `sameTenant`); it
owns no storage and reads through an **injected** store.

> **Status: DORMANT (M48).** Pure deterministic validation — **no** storage of its
> own, network, files, clock or randomness; store-backed checks read via an injected
> `@brain/evidence-store` (tenant-scoped). All results immutable; caller input never
> mutated. **No** recommendation generation, reasoning or prediction. Imported by nobody.

## API

| Function | Kind | Purpose |
|---|---|---|
| `validateEvidenceCitation(ids, { store, tenant })` | async | the gate: valid iff non-empty, no duplicates, every id resolves to a same-tenant record; reports `missing` / `duplicates` / `crossTenant` / `resolved` / `coverage` |
| `resolveCitationChain(ids, { store, tenant, maxDepth? })` | async | resolve a citation + its `provenance.derivedFrom` chain, BFS, deterministic, cycle-safe |
| `validateEvidenceSet(records, { tenant })` | pure | validate an already-resolved record set (same tenant, unique ids) |
| `citationCoverage(ids, records)` | pure | `{ cited, resolved, missing, coverage }` over unique cited ids |
| `missingEvidence(ids, records)` | pure | cited ids with no matching record, in citation order |
| `duplicateEvidence(ids)` | pure | cited ids appearing more than once |

Also exports `CitationError` / `CITATION_ERROR`. Malformed **input** throws
`invalid_input`; missing/duplicate/cross-tenant citations are **reported**, not thrown.

## Invariants (asserted by `test/brain-evidence-citation.test.js`)

- every cited id must exist; every record same tenant; duplicate citations rejected;
  missing citations reported; empty citation → invalid (no evidence ⇒ no claim).
- deterministic ordering (citation order; BFS chain order); identical input →
  identical output; results frozen; caller input never mutated.

## Non-goals (M48)

No ingestion/gateway wiring, no storage, no providers, no manual capture, no
Core/engine/Experience changes, no runtime behaviour. Citation validation only.
