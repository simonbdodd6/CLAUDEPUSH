# M32 — Experience Layer Scaffold Spec (Coach's Eye Intelligence)

**Status:** Planning only. No code, no file moves, no Core / AI-engine / `@brain` /
live-data changes, no business logic in visuals. Build only when approved.

**Canonical decisions (locked):**
1. Base = React + Vite + Tailwind from `app/command-centre/`.
2. One neural brain = `NeuralConsciousness.jsx`.
3. `mission-control/` contributes ONLY: the 2D project-graph renderer (→ Memory
   Network visual) and useful HUD/design tokens.
4. Retired/ignored: mission-control's duplicate brain, old shell, manifest,
   service worker, and direct fetch/telemetry logic.

---

## 1. Exact `experience/` folder structure

```
experience/                                  # Intelligence Experience Layer — NOT Core, NOT @brain
  app/
    index.html · main.jsx · App.jsx          # React/Vite bootstrap + routing (recomposed)
    vite.config.js · tailwind.config.js · postcss.config.js · package.json
    pages/                                    # recomposed pages (placeholder-fed in M32)
      MissionControlPage.jsx                  # composes the 5 panels into the command centre
  design/
    globals.css                               # Tailwind base/components/utilities (from command-centre)
    tokens.css                                # ported HUD/glow/scanline tokens (from mission-control)
    theme.js                                  # Tailwind theme extension absorbing the tokens
  components/                                  # ③ reusable presentation kit (render-only)
    ui/        Card · Badge · Button · Spinner · EmptyState
    command-bar/  CommandBar · useCommandBar
  shell/                                       # ② CommandLayout · Sidebar · TopBar · StatusBar
  visuals/                                     # ① render-only
    neural-brain/    NeuralConsciousness.jsx (canonical)
    memory-network/  graph-renderer.js (salvaged 2D project-graph)
  panels/                                      # ③ the 5 areas (presentation; VisualModel via props)
    LivingNeuralBrain.jsx · MemoryNetwork.jsx · CoachDna.jsx · MatchReadiness.jsx · Season.jsx
  contracts/                                   # NEW — shapes only
    visual-model.js · visual-brain-state.js
  placeholders/                                # ⑤ quarantined synthetic providers (dev-only)
    visual-model.js · brain-state.js · mock-data.js · action-catalogs.js
  docs/
    mission-control-README.md (reference) · M32-experience-scaffold-spec.md
```

---

## 2. Exact files to COPY into `experience/` (canonical, minimal/no change)

From `app/command-centre/`:
- `src/components/ui/{Card,Badge,Button,Spinner,EmptyState}.jsx` → `experience/components/ui/`
- `src/components/command-bar/CommandBar.jsx` + `src/hooks/useCommandBar.js` → `experience/components/command-bar/`
- `src/components/layout/{CommandLayout,Sidebar,TopBar}.jsx` → `experience/shell/`
- `src/styles/globals.css` → `experience/design/globals.css`
- `src/main.jsx` → `experience/app/main.jsx`
- `vite.config.js`, `postcss.config.js` → `experience/app/`
- `tailwind.config.js` → `experience/app/` (then extend theme — see §3)

From `mission-control/`:
- `README.md` → `experience/docs/mission-control-README.md` (reference)

> Copy = duplicate; originals in `mission-control/` and `app/command-centre/` stay
> untouched until you bless the cut.

## 3. Exact files to REWRITE (copy the render, change only the seam)

| Source | → | Rewrite |
|---|---|---|
| `command-centre/.../NeuralConsciousness.jsx` | `visuals/neural-brain/` | replace internal/synthetic telemetry with a `brainState: VisualBrainState` prop; keep all render internals |
| `command-centre/src/App.jsx` | `app/App.jsx` | recompose routing to a single `MissionControlPage` (+ optional sub-routes); drop club-admin pages for M32 |
| `command-centre/index.html` | `app/index.html` | title/meta/mount only |
| `command-centre/package.json` | `app/package.json` | rename `@experience/coaches-eye`; keep deps (three, R3F, drei, postprocessing, tailwind, react-router); Vite scripts; **NOT** added to the root npm workspace |
| `command-centre/tailwind.config.js` | `app/tailwind.config.js` | extend theme with ported HUD tokens |
| `command-centre/src/pages/*Page.jsx` (5) | `app/pages/` (recompose) | strip `api`/hooks; receive `VisualModel` via props; lift hardcoded `*_ACTIONS` to `placeholders/` |
| `command-centre/.../dashboard/{ClubHealthCard,AIRecommendations,ApprovalsQueue,TodayPriorities,PlayerAlerts,QuickActions,ActionHistoryFeed}.jsx` | `panels/` or `components/` | strip data hooks/`api`; take `VisualModel` slice via props; become presentation only |
| `mission-control/app.js` → graph only | `visuals/memory-network/graph-renderer.js` | extract the 2D canvas project-graph renderer; **drop** `fetch('/api/mission-control')`, telemetry shaping, demo fallback, sparkline/data wiring |
| `mission-control/styles.css` → tokens only | `design/tokens.css` | port glow system, HUD framing, colour vars; **drop** domain styles (`.mi-score`, `.lp-score`) and duplicates |

**New files authored in M32 (not from source):** `contracts/{visual-model.js,visual-brain-state.js}`, `panels/{LivingNeuralBrain,MemoryNetwork,CoachDna,MatchReadiness,Season}.jsx`, `app/pages/MissionControlPage.jsx`, `placeholders/{visual-model.js,brain-state.js}`, `design/theme.js`, `shell/StatusBar.jsx`.

## 4. Exact files to QUARANTINE as placeholders (`experience/placeholders/`, dev-only)

- `command-centre/src/api/client.js` → its **`MOCK`** object only → `placeholders/mock-data.js` (labelled `// DEV-ONLY PLACEHOLDER`).
- Hardcoded **`PLAYER_ACTIONS` / `REPORT_ACTIONS` / `COMMS_ACTIONS`** (currently inline in the pages) → `placeholders/action-catalogs.js`.
- **New** synthetic providers authored in M32: `placeholders/visual-model.js` (`placeholderVisualModel()`, one factory per slice, all `state:'placeholder'`) and `placeholders/brain-state.js` (synthetic `VisualBrainState` with a breathing firing rate).

Quarantine rules: dev-only, importable **only** by `experience/app/` bootstrap; never by `visuals/`, `components/`, `shell/`, or `panels/`; never touches the façade or `/api/*`.

## 5. Exact files to DISCARD / RETIRE (not copied in M32)

From `mission-control/` (everything except §2/§3 contributions):
- `index.html` — old shell → retire
- `neural-brain.js` — duplicate brain → retire
- `manifest.json` — old PWA → retire
- `sw.js` — old service worker → retire
- `app.js` non-graph parts (fetch/telemetry/demo/sparkline wiring) → discard (only the graph renderer is salvaged in §3)

From `app/command-centre/`:
- `src/api/client.js` **endpoint map** (`api` object) → **deferred to M33** (becomes the Experience Adapter's data source); not used in M32.
- `src/hooks/{useClubData,useActions}.js` — data/fetch/filter hooks → **deferred to M33**; not copied in M32 (their mapping role belongs to the adapter, reviewed for logic leakage then).

> Nothing is deleted from the repo; "retire" = not carried into `experience/`.

## 6. VisualModel contract spec (`experience/contracts/visual-model.js`) — shapes only

```
VisualState = 'live' | 'placeholder' | 'locked' | 'idle'   // M32: every slice = 'placeholder'

VisualModel = {
  system: {
    state: VisualState, capabilitiesOnline: int, confidence: 0..1, tier: string, latencyMs: int,
  },
  brain: VisualBrainState,                                   // see §7
  matchReadiness: {
    state: VisualState, confidence: 0..1, verdict: string,
    gauges: { overall: 0..100, availability: 0..100, fitness: 0..100, cohesion: 0..100 },
    risks: [{ label: string, severity: 'high'|'medium'|'low' }],
    evidence: [{ label: string }],
  },
  coachDna: {
    state: VisualState, maturity: 0..1, summary: string,
    traits: [{ key: string, label: string, score: 0..100, confidence: 0..1, descriptor: string }],  // 10
  },
  season: {
    state: VisualState,
    trajectory: [{ round: int, value: number }],
    projection: { points: int, position: int },
    probabilities: { title: 0..100, playoff: 0..100, relegation: 0..100 },
  },
  memory: {
    state: VisualState,
    nodes: [{ id: string, label: string, cluster: string, activated: bool }],
    edges: [{ from: string, to: string, weight: 0..1 }],
    recentlyActivated: [string],
  },
}
```
Render layers consume `VisualModel` **via props only** — no compute, no fetch, no
adapter import. The `app/` bootstrap is the only injector (synthetic in M32).

## 7. VisualBrainState contract spec (`experience/contracts/visual-brain-state.js`)

```
VisualBrainState = {
  state: 'live' | 'placeholder' | 'idle',     // M32: 'placeholder'
  firingRate: 0..1,                            // drives pulse frequency / energy
  globalHue: 0..360,                           // overall mood / posture colour
  maturity: 0..1,                              // how "formed" the brain looks
  regions: [{ id: string, label: string, weight: 0..1, hue: 0..360, confidence: 0..1, awake: bool }],
  pulses:  [{ from: string, to: string, intensity: 0..1, hue: 0..360 }],
}
```
The brain renderer knows ONLY this shape — never rugby/coaching. M32 feeds it a
synthetic, gently-breathing state from `placeholders/brain-state.js`.

## 8. Dependency-cruiser rules (add to `.dependency-cruiser.cjs`, report-only)

```
experience-imports-facade-and-self-only   from ^experience/   forbid to ^(ai-brain|coach-products|api|src)/,
                                            Core, and @brain/{contracts,products,versioning} internals
                                            (platform reachable only via @brain/product-coaches-eye)
render-layers-are-pure                     from ^experience/(visuals|components|shell|panels)/
                                            forbid to ^experience/(adapter|placeholders)/  and any fetch/api module
placeholders-are-dev-only                  ^experience/placeholders/ importable only by ^experience/app/
no-reverse-into-experience                 nothing in ^(ai-brain|coach-products|@brain|app|api|src)/ may import ^experience/
```
All severities `warn`/`info` (report-only), matching the existing config and the
`host-not-importing-core` precedent. Run: `npx dependency-cruiser --config .dependency-cruiser.cjs experience packages host-coaches-eye`.

## 9. Testing / build verification steps

1. **Boundary:** dependency-cruiser (report-only) shows **no** `experience → engine/Core/@brain-internal` edges and **no** reverse edges.
2. **Build/serve:** `experience/app` builds and serves under Vite standalone; the five panels render with **animated placeholders**; the canonical brain visibly reacts to `firingRate`; the memory-network 2D graph renders (placeholder nodes, no fetch).
3. **Isolation:** `experience/app/package.json` is **not** added to the root npm workspace; no `*.test.js` under `experience/` touches engines.
4. **Regression:** the repo's existing **`node --test` suite stays green and unchanged** (currently 1853 pass) — M32 adds no engine logic and touches nothing under `ai-brain/`, `coach-products/`, `@brain/*`, or Core.
5. **No live data:** grep confirms the render paths make **no** façade calls and **no** `/api/*` calls; data comes only from `placeholders/`.

## 10. Commit message (for when M32 is built)

```
M32 Experience Layer foundation — neural command centre (visual framework only)

Scaffold experience/ as the Coach's Eye Intelligence Experience Layer: a
React/Vite/Tailwind command centre (canonical base from app/command-centre) with
NeuralConsciousness.jsx as the one canonical neural brain, and the 2D project-graph
renderer + HUD design tokens salvaged from mission-control. Visual framework only —
no live data, no business logic in visuals, no Core/AI-engine/@brain changes.

- experience/{app,design,components,shell,visuals,panels,contracts,placeholders,docs}
- five areas as ANIMATED PLACEHOLDERS: Living Neural Brain, Memory Network,
  Coach DNA, Match Readiness, Season — fed by synthetic VisualModel/VisualBrainState
  from experience/placeholders/ (dev-only, quarantined)
- VisualModel + VisualBrainState view contracts (render layers take props only)
- duplicates retired (mission-control brain/shell/manifest/sw/fetch); one design
  system (Tailwind + ported HUD tokens), one brain
- dependency-cruiser (report-only): experience imports only the façade + self;
  no engine/Core edges; no reverse edges
- root test suite unchanged/green; Vite app isolated from the root workspace

Deferred: Experience Adapter + façade wiring (M33); brain reacts to real AI
activity (M34).
```
