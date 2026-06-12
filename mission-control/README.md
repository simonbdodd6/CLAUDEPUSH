# Mission Control V4

Mission Control V4 keeps the existing static `/mission-control` workflow and API contract intact while transforming the screen into a living AI mind. The page still loads telemetry from `/api/mission-control`, preserves the market, rugby, discovery, lead personalisation, ticker, fallback demo mode, and service-worker behaviours.

## Major Components

- `missionDock`: constellation-style access points for existing Mission Control actions. It stays out of the way and reveals actions on hover or click without becoming a sidebar.
- `intelligence-stage`: full-screen consciousness field with deep-space gradients, fog, scan lines, constellation traces, drifting particles, and almost no interface furniture.
- `neural-brain.js`: React Three Fiber + Three.js centrepiece with a GPU-rendered human-brain particle silhouette, shader-driven pulsing knowledge nodes, animated reasoning links, travelling neural signals, pointer rotation, scroll depth travel, and telemetry-reactive firing rate.
- `missionCanvas`: GPU-friendly knowledge galaxy with 2,600 living particles, organic clusters, animated associations, emergent thought links, light packets, level-of-detail rendering, momentum pan, smooth wheel/pinch zoom, mouse-space bending, and double-click focus.
- `knowledgeClusters`: modular cluster model for memory, reasoning, rugby intelligence, prediction, deployment, and market intelligence. New companies or domains can add clusters without changing the rest of the workflow.
- `intelligence-cards`: retained as ambient telemetry IDs, visually reduced to tiny field readouts.
- `nodeWorkspace`: click-to-focus bloom that grows information around the selected node while nearby nodes move aside.
- `thoughtStream`: live AI thought notifications generated near the cluster that produced them.
- `soundToggle`: optional sound architecture for hover, notification, deployment, and completion events. It is disabled by default.
- Specialist panels: existing Market Intel, Rugby Intel, Leads, Discovery, and node detail panels remain wired to the same loaders.

## Run Locally

For the static V4 shell from the repository root:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/mission-control/
```

Local static mode falls back to demo telemetry if `/api/mission-control` is not available. Live telemetry requires the Vercel/API environment that serves the existing `/api/mission-control` route.
