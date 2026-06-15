# Platform Kernel

The zero-dependency shared foundation for every platform (Milestone M22a).

## Purpose

Across 20 modules the same low-level primitives were re-implemented dozens of
times — `clone` ~28×, the exact-location field list ~15×, audit-record shapes
~26×, plus repeated reference, idempotency, and validation helpers. The kernel
centralises **only** these generic, domain-free primitives so the infrastructure
lives in one place while every module keeps its own behaviour, errors, and
public API.

This is **not** a domain module and **not** a product module. It is the bottom of
the dependency graph.

## Zero-dependency rule

- The kernel imports **nothing** except Node built-ins (`crypto`).
- It imports **nothing** from any platform, domain, or product module.
- **All dependencies point downward into the kernel.** No module-to-module
  coupling is introduced; the kernel never creates a cycle.

## What belongs in the kernel

Generic, behaviour-stable primitives reused across products:

- `clone` / `deepClone`
- exact-location protection: `EXACT_LOCATION_FIELDS`, `findExactLocationFields`,
  `assertNoExactLocation`, `scrubExactLocation`
- the `Reference` type: `normalizeReference`, `assertReference`, `stableReferenceKey`
- audit shape: `createAuditEvent`, `nowIso`
- idempotency/identity: `stableHash`, `buildIdempotencyKey`, `slug`
- validation/ordering: `assertNonEmptyString`, `assertPlainObject`,
  `isPlainObject`, `compareStrings`, `byKeys`
- dumb-repo helper: `cloneCollection`

### Error identity is preserved

Throwing helpers accept an **injected `errorFactory`** (and a `label`). Each
module passes its own `validationError`, so the centralised logic still throws
the module's own error type, code, and message — behaviour is unchanged.

## What does NOT belong in the kernel

- Any domain concept (trips, events, approvals, identities, …).
- Any persistence decision or storage base-class with behaviour.
- Any business rule, policy, or workflow.
- Anything that would make the kernel depend on a module above it.

## Import direction

```
products ─┐
domain   ─┼─► platform modules ─► platform-kernel ─► (Node built-ins only)
          ┘
```

## Migration plan

- **M22a (this milestone):** create the kernel; migrate the safest modules
  (those whose helpers are byte-for-byte identical to the kernel's) — currently
  the event, relationship-graph, and the three intelligence-chain modules.
- **M22b+:** migrate the remaining modules (approval, timeline, memory, trip,
  destination, …), reconciling the small variations in their location/audit
  helpers one at a time, each behind its existing tests. Then revisit a shared
  persistence-adapter contract once a real backing store is chosen.
