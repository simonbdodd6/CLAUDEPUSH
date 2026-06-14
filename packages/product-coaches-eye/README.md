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
| `request(key, context)` | frozen dormant `Envelope` `{ available, ok, reason, data, version }` (always `data:null`, `ok:false`) |
| `invoke(key, context, runtime)` | **async** — frozen `Envelope`; live result when wired + a port is supplied (M31.4) |
| `WIRED_CAPABILITIES` | capability → port-method map (M31.4: `coach.matchReadiness` only) |
| `isWired(key)` | whether a capability is wired to a runtime port |

`context` = `{ tier?: Tier, flags?: Record<string, boolean>, payload?: any }`
(`payload` is handed to the runtime port; gating uses `tier`/`flags`).

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

## Live wiring via an injected runtime port (M31.4)

`invoke(key, context, runtime)` is the **async** live counterpart of `request`.
The façade still **never imports an engine** — a live capability is reached only
through an injected `runtime` **port**, an object exposing the wired method(s):

```js
// the HOST builds this around the real engine; the façade only calls the port.
const runtime = { getMatchReadiness: async (payload) => /* engine output */ }
const r = await invoke('coach.matchReadiness', { tier: 'professional', payload }, runtime)
// → { available: true, ok: true, reason: null, data: <engine output>, version: '2.0' }
```

Behaviour (the gate is always evaluated first):

| Situation | Result | Port called? |
|---|---|---|
| gate denied / disabled / invalid | denied envelope (`ok:false`, `data:null`, `reason`) | **no** |
| allowed, capability not in `WIRED_CAPABILITIES` | dormant (`ok:false`, `data:null`) | no |
| allowed, wired, **no** port supplied (Core default) | dormant (`ok:false`, `data:null`) | no |
| allowed, wired, port supplied | `{ ok:true, data:<engine output> }` | **yes** |
| allowed, wired, port throws | `{ ok:false, reason:'brain_unavailable', data:null }` | yes |

Wired in M31.4: **`coach.matchReadiness` only** (`WIRED_CAPABILITIES`). All other
capabilities remain dormant through `invoke`.

### Rules preserved

1. **One capability at a time.** Only `coach.matchReadiness` is wired.
2. **No direct engine import.** Engines are reached solely through the injected
   port; the dependency-cruiser ring rules keep passing.
3. **Envelope shape unchanged.** `invoke` returns the same 5-key frozen envelope
   as `request`; denied branches are byte-identical.
4. **Golden parity.** Tests prove `invoke(...).data` `deepEqual`s the engine's
   direct output for the same inputs.
5. **Disabled/denied never call the port.** Proven with a spy port.
6. **Core stays separate.** Core supplies no port, so every capability resolves
   dormant — Core needs no change and keeps working with `ai.enabled:false`.
