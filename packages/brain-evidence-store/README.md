# `@brain/evidence-store` — dormant Evidence Store skeleton (M44)

The tenant-scoped **store contract + API surface** for the inbound (evidence) half
of the AI Brain, per the approved
[M42 Evidence Ingestion Architecture](../../docs/M42-evidence-ingestion-architecture.md).
Built on `@brain/evidence-contracts` (its **only** dependency).

> **Status: DORMANT (M44).** Contract only. It **validates** (strict tenant scoping
> + EvidenceRecord/argument shape) and **persists nothing** — no in-memory state, no
> files, no database, no network, no driver. Every well-formed call resolves to
> `not_implemented`. Imported by nobody yet.

## Why a skeleton first

Mirrors the platform pattern: lock the surface before the storage. The store fixes
*how evidence is read/written and how tenants are scoped*; a later milestone injects
a storage **driver** behind this exact contract (the `EvidenceDriver` seam in
`types.js`) — in-memory first, persistent later — with no change to callers.

## API surface (`createEvidenceStore()` → frozen)

| Method | Tenant-scoped | Purpose |
|---|---|---|
| `appendEvidence(record)` | via `record.tenant` | append one immutable EvidenceRecord |
| `getEvidenceById(tenant, id)` | yes | fetch one record |
| `queryEvidence(tenant, query?)` | yes | query by optional filters |
| `listEvidenceForSubject(tenant, subject)` | yes | all records about one subject |
| `appendAuditEntry(tenant, evidenceId, auditEntry)` | yes | append-only audit |
| `resolveEvidenceCitation(tenant, evidenceIds)` | yes | resolve a recommendation's citation → records |

Also exported: `EVIDENCE_STORE_METHODS`, `EvidenceStoreError` + `STORE_ERROR`,
`assertTenant` / `sameTenant`, and the JSDoc typedefs (`EvidenceStore`,
`EvidenceQuery`, `SubjectRef`, `EvidenceDriver`).

## Guarantees (asserted by `test/brain-evidence-store.test.js`)

- **API shape** — exactly the six methods, each a function; `EVIDENCE_STORE_METHODS`
  matches; the store object is frozen.
- **Strict tenant scoping** — every method rejects `invalid_tenant` when the tenant
  is missing/malformed, *before* anything else; `appendEvidence` rejects
  `invalid_record` when `record.tenant` is absent; `sameTenant` distinguishes scopes.
- **No persistence / no I/O** — a well-formed call rejects `not_implemented`
  (nothing is stored); the package source imports **no** `fs`/`net`/`http`/db/etc.,
  and **only** `@brain/evidence-contracts`.
- **Deterministic** — same input → same outcome; no clock, no randomness.
- **Dormant** — a repo-wide scan proves no runtime code imports the package.

## Non-goals (M44)

No storage driver, no in-memory store, no Evidence Gateway, no normalizers, no
providers, no manual capture, no Core/engine/Experience changes, no runtime
behaviour. Store contract only.
