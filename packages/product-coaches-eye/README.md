# `@brain/product-coaches-eye` — Façade contract

The stable surface a Coach's Eye host imports to reach the AI Brain (generalised
from the M17 `CoachAI` boundary). **Dormant** through M31.3a: it consumes only
the platform packages, performs no engine call, and is imported by nobody.

## Surface

| Function | Returns |
|---|---|
| `PRODUCT_ID` | `'coaches-eye'` |
| `gateCapability(key, context)` | frozen `{ capability, available, reason, version }` |
| `getCapabilities(context)` | array of gate results (one per declared capability) |
| `getManifest()` | the `coaches-eye` `ProductManifest` |
| `request(key, context)` | frozen `Envelope` `{ available, ok, reason, data, version }` |

`context` = `{ tier?: Tier, flags?: Record<string, boolean> }`.

## Envelope contract (`request`)

A `request` result **always** has exactly these keys and types:

```
{
  available: boolean,            // capability permitted for (tier, flags)
  ok:        boolean,            // a successful data result was produced
  reason:    string | null,      // a REASON when not available, else null
  data:      object | null,      // the engine output
  version:   string | null,      // negotiated output version (null if unknown capability)
}
```

**While dormant (now): `data` is always `null` and `ok` is always `false`.**

## Reason precedence

Most-fundamental first (mirrors the engines, with an added input check):

```
invalid_input  →  ai_not_enabled  →  feature_disabled  →  insufficient_tier  →  null (available)
```

- `invalid_input` — the capability key is not one this product declares.
- `ai_not_enabled` — the global kill-switch flag (`ai.enabled`) is explicitly off.
- `feature_disabled` — the capability's own flag is explicitly off.
- `insufficient_tier` — the tier does not include the capability.

## Context normalisation

The façade **never throws** for any input:

- non-object / array `context` → treated as `{}`
- unknown or missing `tier` → **`free`** (the AI-off baseline; mirrors the engines' `resolveTier`)
- non-object / array `flags` → `{}`
- a flag that is **absent** is treated as **enabled** (opt-out) — read-only; the façade never *sets* a flag.

## Guarantees

- **Deterministic & pure** — same input → deeply-equal output; no randomness, no time, no LLM.
- **Immutable** — every returned object is `Object.freeze`d; callers cannot mutate results, and the underlying manifest is never mutated.
- **Boundary-safe** — imports only `@brain/contracts | products | versioning`; it has **no import path to any engine or to Core**, so it cannot change AI runtime behaviour.

## Future wiring rules (M31.4+, NOT done here)

Wiring live capabilities must preserve every guarantee above:

1. **One capability at a time, behind its flag.** Never a big-bang.
2. **The façade still never imports an engine directly.** Engines are reached
   only through an **injected runtime / port** (dependency injection) — e.g.
   `createCoachesEyeFacade(runtime)` or `request(key, context, runtime)`. The
   dependency-cruiser ring rules must keep passing (façade → platform packages +
   injected port type only).
3. **Only the allowed branch changes.** It calls the engine via the port, maps
   the output into `data`, and sets `ok: true`. The denied branches and the
   envelope shape stay byte-identical to today.
4. **Golden parity.** A test must prove the wired façade output `deepEqual`s the
   engine's direct output for the same inputs (no behaviour drift).
5. **Core stays separate.** Core consumes the façade only behind flags and must
   keep working with `ai.enabled: false` (every capability `available: false`).
