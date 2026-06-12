# Mission Control V2

Mission Control V2 keeps the existing static `/mission-control` workflow and API contract intact. The page still loads telemetry from `/api/mission-control`, preserves the market, rugby, discovery, lead personalisation, node-inspection, ticker, fallback demo mode, and service-worker behaviours.

## Major Components

- `mission-header`: top command bar with product return link, operating-system title, and live/demo mode state.
- `command-grid`: responsive dashboard frame that gives a five-second read on branch, build, deployment, QA, bugs, mission, and next action.
- `intelligence-stage`: central visual field for the AI Brain, agent orbit, and existing canvas graph.
- `agentOrbit`: DOM-rendered agent network showing health, current task, and activity status for the company AI systems.
- `missionCanvas`: existing interactive canvas graph, upgraded to draw a holographic neural core, flowing connections, particles, and project nodes.
- Specialist panels: existing Market Intel, Rugby Intel, Leads, Discovery, and node detail panels restyled to match V2 without changing their data loaders.

## Run Locally

For the static V2 shell from the repository root:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/mission-control/
```

Local static mode falls back to demo telemetry if `/api/mission-control` is not available. Live telemetry requires the Vercel/API environment that serves the existing `/api/mission-control` route.
