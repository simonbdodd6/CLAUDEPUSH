# `@brain/evidence-contracts` — Evidence ingestion contracts (M43)

The pure-data spine for the **inbound** (evidence) half of the AI Brain
intelligence loop, defined by the approved
[M42 Evidence Ingestion Architecture](../../docs/M42-evidence-ingestion-architecture.md).

> **Status: DORMANT (M43).** Pure data only — canonical enums + the confidence-weight
> contract + the documented type surface. **No** storage, ingestion, providers,
> manual capture, network, browser code, engine/Core imports, or runtime logic.
> Imported by nobody yet; a later **Evidence Gateway** milestone will build on it.

## Why this is the first implementation step

It mirrors the platform-contracts pattern (`@brain/contracts`): lock the shared
shapes first, additive and dormant, parity-tested against the architecture, so every
later milestone (store skeleton → gateway → confidence weighting → manual capture →
provider adapters) composes against a fixed surface without behaviour change.

## Surface

| Export | Kind | From |
|---|---|---|
| `EVIDENCE_CONTRACT_VERSION` | `'1.0'` | enums.js |
| `SOURCE_FAMILY` | enum (`provider` / `manual`) | enums.js |
| `SOURCE_TYPE` | enum (`provider.*` / `manual.*`) | enums.js |
| `SUBJECT_TYPE` | enum (player/team/coach/fixture/opponent/club/drill/session) | enums.js |
| `AUTHOR_KIND` | enum (coach/provider/system) | enums.js |
| `SIGNAL_POLARITY` | enum (strength/weakness/neutral) | enums.js |
| `SENSITIVITY` | enum (public/club/medical/restricted) | enums.js |
| `AUDIT_ACTION` | enum (received…redacted) | enums.js |
| `DISPUTED_FLAG` | `'disputed'` | enums.js |
| `CONFIDENCE_WEIGHT_CONTRACT` | frozen data (declared weighting params) | weights.js |
| `EvidenceRecord`, `NormalizedSignal`, `AuditEntry`, `Provenance`, `Tenant`, `Author`, `Sensitivity`, `ConfidenceWeightContract` | JSDoc typedefs | types.js |

## Guarantees (asserted by `test/brain-evidence-contracts.test.js`)

- All enums are **frozen**; every `SOURCE_TYPE` is namespaced by a `SOURCE_FAMILY`.
- Enum value sets match the M42 architecture exactly.
- `CONFIDENCE_WEIGHT_CONTRACT` is deeply frozen, versioned, and is **data only**
  (no functions) — the weighting *logic* is a future milestone.
- **Dormant:** a repo-wide scan proves no runtime code imports
  `@brain/evidence-contracts`.

## Non-goals (M43)

No storage, no ingestion pipeline, no Evidence Gateway, no normalizers, no provider
adapters, no manual-capture UI, no Core/engine/Experience changes, no runtime
behaviour. This package is *contracts only*.
