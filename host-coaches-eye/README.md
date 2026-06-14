# `host-coaches-eye` — Coach's Eye Intelligence host adapter

The composition root that wires the existing AI Brain into the
`@brain/product-coaches-eye` façade's **runtime port**.

## Why this is not a `@brain/*` package

The façade must never import an engine — it reaches engines only through an
injected port. **Something** has to build that port from the real engine, and
that something is the *host adapter*. Because it imports both the façade **and**
the engine/integration layer, it deliberately lives **outside** `packages/@brain/*`
(the platform ring, where engine imports are forbidden). The adapter is host-layer
wiring, not a platform package.

```
apps / host  ──►  host-coaches-eye  ──►  @brain/product-coaches-eye (façade) ──► @brain/* platform
                        └────────────►  coach-products/match-readiness (engine)
```

## Surface

| Export | Purpose |
|---|---|
| `createCoachesEyeRuntime(opts?)` | build the façade runtime port (`{ getMatchReadiness }` only). `opts.coachAI` injects CoachAI for tests; default = the real integration layer |
| `invokeCoachesEye(key, context, opts?)` | `invoke(key, context, port)` through a freshly-built runtime |
| `ADAPTER_WIRED_CAPABILITIES` | mirrors the façade's wired set (M31.5: `coach.matchReadiness` only) |

## Status: DORMANT (M31.5)

- Imported by **nobody** yet — Core included (proven by test).
- Wires exactly **one** capability: `coach.matchReadiness`. All others stay dormant.
- Activates **no** feature flag; changes **no** Core API/UI.
- Imports the façade + the engine, never Coach's Eye Core (`app`/`api`/`src`) —
  enforced by a dependency-cruiser rule (`host-not-importing-core`, report-only).

## Verification

`test/brain-host-coaches-eye.test.js` proves:
- **Golden parity** — the adapter port (and `invokeCoachesEye(...).data`) deepEquals
  the engine's direct output for the same inputs (injected CoachAI).
- The real default wiring runs end-to-end through the integration layer.
- The runtime port exposes only `getMatchReadiness`; other capabilities resolve dormant.
- **Core does not import the adapter** (repo-wide scan).
