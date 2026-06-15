# `experience-host` — live composition root for the Experience Layer (M34)

Activates the Experience Layer against the real AI Brain by composing three
already-approved pieces — and nothing else.

```
experience-host
   ├─►  @brain/product-coaches-eye            (the façade — the only Brain surface)
   ├─►  host-coaches-eye/createCoachesEyeRuntime   (runtime port; M31.5; used, not modified)
   └─►  experience/adapter/createExperienceAdapter (the M33 adapter seam)

   getMatchReadiness  ──►  REAL data (integration layer, via the host port)
                          mapped by the adapter into VisualModel.matchReadiness
```

## Why it lives outside `experience/`

The browser Experience app is **standalone** — it must never bundle `@brain` or the
engine. So the live wiring lives here, one level out. A host shell builds the
provider and injects it into the app at runtime:

```js
import { createLiveExperienceProvider } from 'experience-host'
globalThis.__COACHES_EYE_BRAIN__ = createLiveExperienceProvider()   // app then goes live
```

The app reads that injection point (`experience/app/brain-provider.js`); when it is
absent (the default, and the whole standalone browser build) every panel stays a
placeholder.

## Boundaries

- Imports ONLY the façade + the host runtime port + the experience adapter.
- **No direct** AI-engine / Coach's Eye Core / internal-`@brain` import — the engine
  is reached only transitively through the approved host runtime port.
- Does not modify the façade, the host adapter, the engines, Core, or `@brain`.
- Pure composition: no business logic, recommendations, predictions or reasoning.

## Surface

| Export | Purpose |
|---|---|
| `createLiveExperienceProvider(opts?)` | build `{ facade, runtime }` — the injectable brain provider |
| `getLiveVisualModel(context, fallbackModel, opts?)` | headless convenience: live provider → adapter → VisualModel with a live `matchReadiness` slice |

## Status (M34)

- One live capability: **`coach.matchReadiness`**. Every other panel remains a
  placeholder (the adapter maps only matchReadiness; the rest come from the app's
  fallback model).
- Graceful fallback: if the runtime/façade is unavailable, denied, or dormant, the
  adapter preserves the placeholder slice.
