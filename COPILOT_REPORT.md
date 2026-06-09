# Coach's Eye AI Copilot — Architecture & Test Report

*Generated: 2026-06-09*

---

## What Is This?

The **AI Copilot** is the main coaching AI workspace inside Coach's Eye. It is NOT a chatbot.
It is a structured AI workspace that automatically routes coaching requests to the right engines,
returns evidence-based structured responses, and exposes quick actions for every output.

---

## Architecture

```
Coach (message)
      │
      ▼
ai-copilot/
├── index.js              ← Public API: copilot.chat(), copilot.quickAction(), etc.
├── chat-manager.js       ← Orchestrator: routes → context → tools → response
├── intent-router.js      ← Keyword-weighted intent detection (no LLM required)
├── tool-registry.js      ← Plugin registry: engines self-register on import
├── context-loader.js     ← Memory Engine + entity resolution
├── response-builder.js   ← Structured response: summary, reasoning, evidence, actions
├── stream-handler.js     ← Event-based streaming for real-time UI updates
├── action-engine.js      ← Quick actions: save, assign, pin, PDF, send
├── conversation-memory.js← Per-session turn history, pinned insights, recent actions
├── citation-engine.js    ← Source tracking — every fact traced to its engine
│
├── engines/              ← Engine adapters (plugin registry)
│   ├── index.js          ← Bootstrap: imports all adapters (self-registration)
│   ├── coaching-engine-adapter.js
│   ├── memory-engine-adapter.js
│   ├── player-development-adapter.js
│   ├── rugby-knowledge-adapter.js
│   ├── discovery-adapter.js
│   ├── market-intel-adapter.js
│   └── lead-personalisation-adapter.js
│
└── mission-control/      ← Mission Control AI Panel
    ├── ai-panel.js        ← Express router + REST API handlers
    └── ai-panel.html      ← Self-contained React-free workspace UI
```

---

## Plugin Registry Contract

Every engine exposes exactly:
```js
registerTool({
  name:           'engine-name',      // unique identifier
  version:        '1.0.0',
  description:    'one sentence',
  capabilities:   ['intent_type'],    // which intents this engine handles
  priority:       85,                 // higher = preferred
  execute:        async (intent, context, options) => ({
    success:  boolean,
    data:     any,
    summary:  string,
    evidence: string[],
  }),
});
```

The Copilot never imports engine internals. It only calls `execute()`.

---

## Intent Detection

Keyword-weighted scoring. No LLM required. Detects:

| Intent | Trigger examples |
|--------|-----------------|
| `build_session` | "Build tonight's U16 session", "Plan a training" |
| `build_programme` | "12-week prop programme", "Create a training plan" |
| `build_rehab` | "Rehab programme", "Return to play plan" |
| `player_progress` | "How is Tom progressing?", "Player status" |
| `injury_risk` | "Who is at highest injury risk?", "Injury assessment" |
| `weekly_plan` | "What should we work on this week?" |
| `session_summary` | "Summarise our last four sessions" |
| `player_compare` | "Compare our two hookers" |
| `squad_analysis` | "Find the weakest area in our squad" |
| `knowledge_query` | Fallback for any coaching question |

---

## Response Structure

Every response returns the same shape — never just paragraphs:

```json
{
  "intent":             "build_session",
  "label":              "Build Training Session",
  "summary":            "1-2 sentence headline",
  "reasoning":          "Why this intent, which engines, what context was used",
  "evidence":           ["fact 1", "fact 2"],
  "content":            {},
  "recommendedActions": ["what the coach should do next"],
  "quickActions":       [{ "id": "save_session", "label": "Save Session", "icon": "💾" }],
  "citations":          { "engines": [], "factCount": 0 },
  "warnings":           [],
  "metadata":           { "intent", "confidence", "enginesUsed", "generatedAt" }
}
```

---

## Quick Actions

Available for every response:

| Action | Description |
|--------|-------------|
| 💾 Save Session | Saves to Memory Engine |
| 📄 Create PDF | Exports via PDF engine |
| 📋 Assign Programme | Assigns to player in memory |
| 🧠 Update Memory | Saves insights to Coach Memory |
| 📱 Send to Player | Push notification to player |
| 📌 Pin Insight | Pins to Mission Control dashboard |
| 👥 Share with Coach | Generates share link |

---

## Registered Engines (7)

- **memory-engine**
- **coaching-engine**
- **player-development**
- **rugby-knowledge**
- **discovery-agent**
- **market-intel**
- **lead-personalisation**

---

## Mission Control AI Panel

The panel at `ai-copilot/mission-control/ai-panel.html` provides:
- Live conversation history with structured response cards
- Suggested prompts (all spec examples)
- Real-time engine status list
- Pinned insights panel
- Recent AI actions panel
- Recommended coaching actions (updated per response)
- Quick action buttons on every response

Mount in Mission Control:
```js
import { aiPanelRouter } from './ai-copilot/mission-control/ai-panel.js';
app.use('/ai-copilot', aiPanelRouter);
```

---

## Future Engine Integration

To add a new engine (e.g., Video Analysis Engine):
```js
// ai-copilot/engines/video-engine-adapter.js
import { registerTool } from '../tool-registry.js';

registerTool({
  name:         'video-analysis',
  description:  'Analyses training video and match footage',
  capabilities: ['session_summary', 'player_progress'],
  execute:      async (intent, context) => { /* ... */ },
});
```
Then add one import line to `engines/index.js`. Done.

---

## Live Test Results (2026-06-09)

**10/10 passed · avg 31ms**

### 1. "Build tonight's U16 session."

- **Intent:** `build_session` (Build Training Session) — confidence: 0.99
- **Engines:** coaching-engine
- **Duration:** 157ms
- **Summary:** Training session generated for U16 — focus: General fitness and skills
- **Evidence:** Age group: U16 · Session focus: General fitness and skills
- **Top action:** Review the session plan before training and adjust for available players
- **Quick actions:** Save Session, Create PDF, Send to Player, Update Memory
- **Warnings:** rugby-knowledge: ageGroup.toLowerCase is not a function

### 2. "Create a 12-week prop programme."

- **Intent:** `build_programme` (Build Training Programme) — confidence: 0.89
- **Engines:** memory-engine, coaching-engine
- **Duration:** 5ms
- **Summary:** 12-week programme template for Player
- **Evidence:** Generated from template — install Coaching Engine for AI-powered programmes
- **Top action:** Set calendar reminders for programme review at weeks 4 and 8
- **Quick actions:** Assign Programme, Create PDF, Save Session, Send to Player


### 3. "How is Tom progressing?"

- **Intent:** `player_progress` (Player Progress Check) — confidence: 0.86
- **Engines:** none
- **Duration:** 45ms
- **Summary:** Analysis complete.


- **Quick actions:** Pin Insight, Send to Player, Update Memory, Share with Coach
- **Warnings:** memory-engine: No player resolved — specify a player name, player-development: No player resolved — specify a player name

### 4. "Who is at highest injury risk?"

- **Intent:** `injury_risk` (Injury Risk Assessment) — confidence: 0.99
- **Engines:** memory-engine, player-development
- **Duration:** 25ms
- **Summary:** Injury risk: 0 high-risk players, 0 with active injuries
- **Evidence:** 1 player(s) analysed · 1 players assessed
- **Top action:** Flag highest-risk players to the club physio or first-aider
- **Quick actions:** Pin Insight, Update Memory, Send to Player


### 5. "What should we work on this week?"

- **Intent:** `weekly_plan` (Weekly Coaching Plan) — confidence: 0.73
- **Engines:** coaching-engine, rugby-knowledge
- **Duration:** 19ms
- **Summary:** Training session generated for Senior — focus: General fitness and skills
- **Evidence:** Age group: Senior · Session focus: General fitness and skills
- **Top action:** Review the output and apply relevant insights at your next session
- **Quick actions:** Save Session, Create PDF, Pin Insight


### 6. "Summarise our last four training sessions."

- **Intent:** `session_summary` (Session Summary) — confidence: 0.76
- **Engines:** memory-engine
- **Duration:** 5ms
- **Summary:** Memory context: 1 players, 3 teams
- **Evidence:** 1 player(s) in memory · 1 player(s) have programme history
- **Top action:** Review the output and apply relevant insights at your next session
- **Quick actions:** Pin Insight, Update Memory, Create PDF


### 7. "Compare our two hookers."

- **Intent:** `player_compare` (Player Comparison) — confidence: 0.99
- **Engines:** memory-engine, player-development
- **Duration:** 1ms
- **Summary:** Not enough players found for comparison (need ≥2, found 0)
- **Evidence:** 1 player(s) analysed · Add more players to Memory Engine to enable comparison
- **Top action:** Use comparison to inform selection decisions for the next fixture
- **Quick actions:** Pin Insight, Share with Coach, Update Memory


### 8. "Build next week's preseason plan."

- **Intent:** `build_programme` (Build Training Programme) — confidence: 0.67
- **Engines:** memory-engine, coaching-engine
- **Duration:** 1ms
- **Summary:** 8-week programme template for Player
- **Evidence:** Generated from template — install Coaching Engine for AI-powered programmes
- **Top action:** Set calendar reminders for programme review at weeks 4 and 8
- **Quick actions:** Assign Programme, Create PDF, Save Session, Send to Player


### 9. "Generate a rehab programme."

- **Intent:** `build_rehab` (Rehabilitation Programme) — confidence: 0.6
- **Engines:** memory-engine, coaching-engine
- **Duration:** 5ms
- **Summary:** Rehabilitation plan template for Player
- **Evidence:** Template plan — specify injury type for targeted rehab
- **Top action:** Review the output and apply relevant insights at your next session
- **Quick actions:** Assign Programme, Create PDF, Send to Player, Update Memory


### 10. "Find the weakest area in our squad."

- **Intent:** `squad_analysis` (Squad Analysis) — confidence: 0.99
- **Engines:** memory-engine, player-development, discovery-agent
- **Duration:** 44ms
- **Summary:** Squad: 1 players, average dev score 71/100
- **Evidence:** 1 player(s) analysed · Players analysed: 1
- **Top action:** Share the squad analysis at the next coaches' meeting
- **Quick actions:** Pin Insight, Create PDF, Update Memory




---

*Report generated by the Coach's Eye AI Copilot CLI*
