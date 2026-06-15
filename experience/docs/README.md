# `experience/` — Coach's Eye Intelligence Experience Layer

The neural command-centre **visual framework**. A standalone React/Vite/Tailwind
app that renders the Intelligence as a premium operating-system experience.

> **M32 status: visual framework only.** No live data, no `/api` calls, no business
> logic, no calculations, no feature flags. Every surface is an **animated
> placeholder** fed by synthetic providers in `experience/placeholders/`.

## Boundaries (enforced report-only by `.dependency-cruiser.cjs`)

- `experience/` imports **only itself** (+ React/three/router from npm). It never
  imports an AI engine, Coach's Eye Core (`app`/`api`/`src`), or a `@brain/*`
  platform package. (When the Experience Adapter lands in M33 it will reach the
  brain **only** through the `@brain/product-coaches-eye` façade.)
- Nothing in the engines / Core / `@brain` / host imports `experience/`.
- Render layers (`visuals`, `components`, `shell`, `panels`) are **pure**: they take
  a `VisualModel` / `VisualBrainState` via props and never fetch or compute.
- `placeholders/` is **dev-only** and importable only by `experience/app/`.

## Layout

| Folder | Role |
|---|---|
| `app/` | Standalone Vite bootstrap + routing + the `MissionControlPage` (the only data injector). **Not** in the root workspace. |
| `contracts/` | `VisualModel` + `VisualBrainState` view-contracts (shapes only). |
| `design/` | `globals.css` (from command-centre), ported HUD `tokens.css`, Tailwind `theme.js`. |
| `components/` | Reusable UI kit (`ui/*`) + the command bar. |
| `shell/` | `CommandLayout`, `Sidebar`, `TopBar`, `StatusBar`. |
| `visuals/` | `neural-brain/NeuralConsciousness.jsx` (canonical brain), `memory-network/graph-renderer.js` (salvaged 2D graph). |
| `panels/` | The five areas: Living Neural Brain, Memory Network, Coach DNA, Match Readiness, Season. |
| `placeholders/` | Dev-only synthetic `VisualModel` / `VisualBrainState` + quarantined catalogs/mock-data. |

## Provenance

- **Canonical base** — `app/command-centre` (React/Vite/Tailwind). UI kit, command
  bar, shell, `globals.css` copied; pages recomposed to a single command centre.
- **Canonical brain** — `NeuralConsciousness.jsx` (R3F + EffectComposer Bloom/DoF/
  Vignette). Sourced from the `main` checkout, where it lives; adapted to accept a
  `VisualBrainState` prop and fill its container.
- **Mission Control salvage** — ONLY the 2D project-graph renderer (→ `visuals/
  memory-network/graph-renderer.js`, fetch/telemetry/demo/sw stripped) and the HUD
  design tokens (→ `design/tokens.css`).
- **Retired** (not carried in): mission-control's duplicate neural brain, old shell
  (`index.html`), `manifest.json`, `sw.js`, and all direct fetch/telemetry logic;
  the command-centre `api/client.js` endpoint map + `useClubData`/`useActions` hooks
  are **deferred to M33** (the Experience Adapter).

## Run

```
cd experience/app
npm install      # standalone — installs three / @react-three/fiber / postprocessing / tailwind / vite
npm run dev      # http://localhost:5273
npm run build
```

## Roadmap

- **M33** — Experience Adapter: map the façade (`@brain/product-coaches-eye`) output
  into a `VisualModel`; replace the placeholders.
- **M34** — the brain reacts to real AI activity (live `VisualBrainState`).

See `experience/docs/M32-experience-scaffold-spec.md` for the full scaffold spec.
