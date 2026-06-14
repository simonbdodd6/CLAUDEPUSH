# `@brain/*` — Shared AI Brain Platform packages

Foundation laid in **M31.0**. These packages are the dependency spine for the
shared AI Brain platform described in `ai-brain/platform/M31-contracts-and-coaches-eye-manifest.md`.

| Package | Purpose | Depends on |
|---|---|---|
| `@brain/contracts` (`brain-contracts/`) | Canonical enums + type surface | nothing |
| `@brain/products` (`brain-products/`) | `coaches-eye` manifest + pure registry | `@brain/contracts` |
| `@brain/versioning` (`brain-versioning/`) | Version contracts + pure negotiation | `@brain/contracts` |

## Status: DORMANT (M31.0)

These packages are **additive and inert**:

- **Nothing** in `ai-brain/`, `coach-products/`, `app/`, `api/`, or `src/` imports them.
- No engine or Core file was modified. There is **zero runtime behaviour change**;
  the full existing test suite passes unchanged.
- Every value (tiers, flags, versions) is copied from the live engine constants
  (M17–M28). `test/brain-platform-foundation.test.js` asserts **parity** so the
  manifest can never silently diverge from what the engines actually do.

## Why relative imports (not bare `@brain/*` specifiers) yet

To keep M31.0 install-free and provably behaviour-neutral, inter-package and test
imports use **relative paths**, so everything runs under plain `node --test` with
no `npm install` and no `node_modules` changes.

## Workspace activation — DONE in M31.1

The `packages/*` tree is now a live npm workspace, with zero runtime behaviour
change (full suite still 1815 pass / 0 fail):

1. ✅ Root `package.json` declares `"workspaces": ["packages/*"]` and a
   `dependency-cruiser` dev dependency. `@brain/contracts|products|versioning`
   are symlinked into `node_modules/@brain/*`.
2. ✅ dependency-cruiser installed; run report-only:
   ```
   npx dependency-cruiser --config .dependency-cruiser.cjs packages
   ```
   All rule severities are `warn`/`info`, so it **never fails CI** in this phase.

### Still deferred (NOT part of M31.1)

- Inter-package and test imports remain **relative paths**, not bare
  `@brain/*` specifiers. The packages stay **dormant** — no engine or Core file
  imports them. Switching to bare specifiers and wiring the first product façade
  are later, separately-reviewed steps.
