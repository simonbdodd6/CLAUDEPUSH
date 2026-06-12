# Mission Control V4

Mission Control V4 keeps the existing static `/mission-control` workflow and API contract intact while transforming the screen into a living AI mind. The page still loads telemetry from `/api/mission-control`, preserves the market, rugby, discovery, lead personalisation, node-inspection, ticker, fallback demo mode, and service-worker behaviours.

## Major Components

- `missionDock`: icon-first floating dock for existing Mission Control actions. It collapses by default, expands on hover or click, auto-hides after inactivity, and keeps the graph visible.
- `intelligence-stage`: full-screen AI operating space with deep-space gradients, fog, scan lines, constellation traces, drifting particles, and graph-focused captions.
- `missionCanvas`: GPU-friendly canvas knowledge graph with 1,450 living nodes, organic clusters, animated associations, emergent thought links, light packets, level-of-detail rendering, momentum pan, smooth wheel/pinch zoom, and double-click focus.
- `knowledgeClusters`: modular cluster model for memory, reasoning, rugby intelligence, prediction, deployment, and market intelligence. New companies or domains can add clusters without changing the rest of the workflow.
- `intelligence-cards`: floating glass signal cards for system health, reasoning confidence, memory growth, prediction accuracy, deployments, and live metrics. Counters and sparklines update continuously.
- `nodeWorkspace`: click-to-focus workspace for each node with status, memory, reasoning, tasks, logs, confidence, learning, and telemetry.
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
