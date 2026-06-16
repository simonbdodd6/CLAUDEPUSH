# `@brain/evidence-gateway` — dormant Evidence Gateway (M45)

The **write-side composition root** for AI Brain evidence ingestion, per the approved
[M42 Evidence Ingestion Architecture](../../docs/M42-evidence-ingestion-architecture.md).
It sits between evidence sources and the [`@brain/evidence-store`](../brain-evidence-store),
and defines the deterministic write pipeline. Built on `@brain/evidence-contracts`
+ `@brain/evidence-store` (its **only** dependencies).

> **Status: DORMANT (M45).** Defines the pipeline contract only. **No stage performs
> work** and the gateway **persists nothing** — no files, no database, no network,
> no engine calls, no store writes, no LLM, no randomness, no clock. Imported by
> nobody yet.

## Pipeline (the fixed, ordered stage registry)

```
receive → validate → normalize → deduplicate
        → prepareConfidenceUpdate → prepareMemoryLink → prepareAudit → prepareEngineExposure
```

- **`receive`** — wrap the inbound submission (pure echo).
- **`validate`** — **tenant validation FIRST** (the gateway's first gate), reusing
  the store's pure `assertTenant`; throws `invalid_tenant` before any later stage.
  This is the only behaviour beyond placeholders.
- **`normalize` … `prepareEngineExposure`** — pure **deferred** placeholders, each
  returning an empty, typed output contract. No normalization, dedupe, confidence
  math, memory link, audit write, exposure or storage happens yet.

`EVIDENCE_GATEWAY_STAGES` / `EVIDENCE_GATEWAY_STAGE_NAMES` are the single source of
truth for order.

## Surface

| Export | Purpose |
|---|---|
| `createEvidenceGateway({ store?, onStage? })` | build the gateway; `submit(context)` runs the pipeline. `store` is held for future stages (never called for persistence in M45); `onStage` is an optional observability hook |
| `createGatewayContext({ ingestRunId, tenant, submission })` / `isGatewayContext` | build/recognise the immutable `GatewayContext` |
| `EVIDENCE_GATEWAY_STAGES` / `EVIDENCE_GATEWAY_STAGE_NAMES` / `STAGE_BY_NAME` | the canonical stage registry |
| typedefs | `EvidenceGateway`, `GatewayContext`, `GatewayStage`, `StageResult`, `GatewayResult` |

## Guarantees (asserted by `test/brain-evidence-gateway.test.js`)

- **Deterministic stage order** — the registry + each run's `stages`/`results` match
  the canonical order, repeatably.
- **Tenant validation first** — a bad tenant rejects `invalid_tenant`; an `onStage`
  trace proves `validate` ran (and halted) before `normalize`.
- **No stage performs storage** — a spy `EvidenceStore` injected into the gateway
  receives **zero** calls during `submit`.
- **No I/O** — package source imports only `@brain/evidence-contracts` +
  `@brain/evidence-store`; no `fs`/`net`/db; no `Date`/`Math.random`.
- **Dormant** — a repo-wide scan proves no runtime code imports the package.

## Non-goals (M45)

No real stage work, no persistence, no storage driver, no providers, no manual
capture, no normalizers, no confidence math, no Core/engine/Experience changes, no
runtime behaviour. Pipeline contract only.
