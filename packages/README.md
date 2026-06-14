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

## Activation (deferred to M31.1, requires explicit approval)

The following turn the structure into a live npm workspace; each is a separate,
reviewable step — **not** part of M31.0:

1. Add to the root `package.json`:
   ```json
   "workspaces": ["packages/*"]
   ```
2. `npm install` to link `@brain/*` into `node_modules` (enables bare specifiers).
3. Switch inter-package/test imports from relative paths to `@brain/contracts` etc.
4. Install dependency-cruiser and run it in report-only mode:
   ```
   npx dependency-cruiser --config .dependency-cruiser.cjs packages
   ```
   (Config already present at repo root; severities are all `warn`/`info` so it
   never fails CI in this phase.)

Until then, the platform is a documented, tested, dormant foundation.
