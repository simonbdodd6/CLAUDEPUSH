# `experience/adapter/` — Experience Adapter (M33)

The seam between the AI Brain and the Experience Layer's view layer. It turns the
façade's output into a `VisualModel` / `VisualBrainState`; the render layers keep
receiving those **via props only**.

## How it is isolated from engines and visuals

```
                        injected (never imported)
  host composition root ────────────────┐
   (outside experience, future)         │ facade: @brain/product-coaches-eye
                                         │ runtime: host port (built from engine)
                                         ▼
  experience/app  ──►  experience/adapter  ──►  VisualModel / VisualBrainState
   (composer:           (pure mapping +              │  props only
    injects deps +       gating via façade)          ▼
    placeholder      ────────────────────────►  experience/{panels,visuals,shell,components}
    fallback model)                              (render layers — never import the adapter,
                                                  the façade, an engine, or Core)
```

- **Consumes the façade ONLY, by injection.** The adapter never `import`s
  `@brain/product-coaches-eye`; the façade is passed in. This keeps the Experience
  Layer standalone (no `@brain` in its `node_modules`; it builds without the
  platform) and means the adapter's only Brain collaborator is the façade surface
  documented in `facade-contract.js`.
- **No engine / Core / internal-@brain imports.** Verified by `git grep` and by the
  `experience-imports-facade-and-self-only` dependency-cruiser rule.
- **Render layers stay pure.** They never import the adapter or the placeholders;
  the `render-layers-are-pure` rule forbids `experience/(visuals|components|shell|
  panels)/ → experience/(adapter|placeholders)/`. Only `experience/app/` composes
  the adapter and injects data downward as props.
- **No business logic.** Only gating-through-the-façade and pure, guarded field
  reshaping (`shape-guards.js`, `mappers/`). No scoring, recommendations,
  predictions or reasoning — the engine produced all of that; the adapter presents it.

## M33 status

- One capability is mapped end-to-end: **`coach.matchReadiness`**
  (`mappers/match-readiness.js`).
- **Real wiring is deferred:** the façade reaches the engine only through a runtime
  port, and building that port needs the host/engine — outside this milestone's
  scope. So the standalone app injects `facade: null`: every slice resolves to the
  placeholder fallback, and the wiring activates the moment a composition root
  injects the façade + port (M34).
- All non-wired capabilities remain placeholders.

## Surface

| Export | Purpose |
|---|---|
| `createExperienceAdapter({ facade, runtime, fallbackModel })` | build the adapter; returns `{ getVisualModel(context), getBrainState(t, base) }` |
| `CAP_MATCH_READINESS` | `'coach.matchReadiness'` — the mapped capability key |
| `mapMatchReadiness(data, fallback)` | pure mapper: match-readiness product → `matchReadiness` slice |
