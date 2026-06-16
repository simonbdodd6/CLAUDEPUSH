# `@brain/evidence-normalization` — dormant normalization contracts (M50)

The single **common language** for the AI Brain's `normalize` stage of the approved
[M42 Evidence Ingestion Architecture](../../docs/M42-evidence-ingestion-architecture.md)
(§3). Every future evidence source — Frame Sports, GPS, coach observations, video
tags, post-match questionnaires — converts its raw payload into the *same*
`NormalizedSignal[]` before anything enters the Brain. This package is the contract
that makes that possible. Depends only on `@brain/evidence-contracts`.

> **Status: DORMANT (M50).** Contracts + pure validators only — **no** normalizers,
> registry, providers, storage, network, files, clock or randomness. Every input
> (including timestamps) is caller-supplied; returns are immutable; caller input is
> never mutated. Imported by nobody yet.

## What it defines

| Concern | Surface |
|---|---|
| **Normalizer interface** | `isNormalizerContract(n)`, `assertNormalizerContract(n)` → `{ sourceType, sourceFamily, version, key }`, `normalizerKey(n)` |
| **Normalization context** | `assertNormalizationContext(ctx)` → `{ now, ingestRunId }` — `now` is an ISO timestamp **passed in** (no clock); `isIsoTimestamp(s)` |
| **Signal-key grammar** | `isValidSignalKey(key)`, `assertSignalKey(key)`, `signalKeyNamespace(key)`, `signalKeySegments(key)` + `SIGNAL_KEY_*` bounds |
| **Signal validation** | `validateSignal(signal, { record })`, `validateSignals(signals, { record })` — problems **reported as data**, never thrown |

A normalizer is `{ sourceType: <SOURCE_TYPE>, version: string, normalize(record, ctx) → NormalizedSignal[] }`.
Signal keys are bounded, dot-joined `lowerCamelCase` segments (namespace + leaf, e.g.
`lineout.winRate`) — no closed enum, because sources are **additive**. A signal must
carry a scalar `value`, an optional `unit`, a `SIGNAL_POLARITY` (or null), a
`confidence` in `0..1` that may not exceed its record's, and an `evidenceId` that
back-references the owning record.

## Guarantees (asserted by `test/brain-evidence-normalization.test.js`)

- **Deterministic** — identical input → identical output; no `Date`/`Math.random`/I/O.
- **Immutable** — results are frozen; inputs are never mutated.
- **Contracts correct** — normalizer/context assertion, key grammar bounds, signal
  shape, back-reference + confidence-ceiling, error codes.
- **Reports, not throws** — signal problems surface as data; only malformed input
  (`invalid_input`) or a malformed normalizer (`invalid_contract`) throw.
- **Dormant** — a repo-wide scan proves no runtime code imports the package.

## Non-goals (M50)

No normalizers, no registry/dispatch, no providers, no ingestion or gateway wiring,
no storage, no manual capture, no Core/engine/Experience changes, no runtime
behaviour. The rules a future normalizer must satisfy — nothing that does the work.
