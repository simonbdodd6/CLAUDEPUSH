
# Coach's Eye Coaching Engine — Build Report

**Date:** 2026-06-09
**Branch:** feature/nightly-qa-agent

---


## Architecture

The Coaching Engine is a modular, provider-independent AI layer that accepts structured JSON input and produces structured JSON output. It is the reusable foundation that every future coaching feature will call.

### Modules

| Module | Responsibility |
|---|---|
| `qa/coaching-engine/index.js` | Public API — generateProgramme, generateSession, generateSeasonPlan, generateRehabPlan |
| `qa/coaching-engine/player-profile.js` | Player schema, validation, position normalization, 15 position profiles |
| `qa/coaching-engine/coach-profile.js` | Coach identity, philosophy presets, coaching cues |
| `qa/coaching-engine/team-profile.js` | Team schema, age group rules, contact guidelines |
| `qa/coaching-engine/training-objectives.js` | Goals → training objectives, season phases, equipment profiles |
| `qa/coaching-engine/knowledge-search.js` | Rugby KB adapter — wraps qa/rugby-assistant/query.js |
| `qa/coaching-engine/context-builder.js` | Assembles full EngineContext from all profile/KB data |
| `qa/coaching-engine/prompt-builder.js` | Context → provider-ready prompts (zero hardcoded content) |
| `qa/coaching-engine/programme-generator.js` | Training programme + rehab generation pipeline |
| `qa/coaching-engine/session-generator.js` | Training session generation pipeline |
| `qa/coaching-engine/pdf-outline.js` | PDF data structure schema (placeholder — no PDF yet) |
| `qa/coaching-engine/report-generator.js` | Structured JSON → Markdown reports |
| `qa/coaching-engine/providers/index.js` | Provider registry — resolveProvider, createProvider, listProviders |
| `qa/coaching-engine/providers/claude.js` | Anthropic Claude provider |
| `qa/coaching-engine/providers/openai.js` | OpenAI GPT provider |
| `qa/coaching-engine/providers/gemini.js` | Google Gemini provider |
| `qa/coaching-engine/providers/local.js` | Ollama-compatible local LLM provider |
| `qa/coaching-engine/providers/base.js` | Base provider class — generate() + generateJSON() |

---


## Provider Status

| Provider | Status |
|---|---|
| claude | ✗ not configured |
| openai | ✗ not configured |
| gemini | ✗ not configured |
| local | ✓ configured |

---


## Test — Programme Generation

**Player:** U18 prop
**Mode:** template
**Duration:** 8 weeks
**Goals:** Strength, Mass, Scrummaging Power
**KB items:** 4
**Elapsed:** 39ms


### Overview

8-week Preseason programme for a 17-year-old Prop (intermediate level). Focus: Strength, Mass, Scrummaging Power.

### Key Considerations

- Near-adult loads. Allow full recovery between heavy sessions.
- Mass is a competitive advantage — hypertrophy is a legitimate primary goal for props
- Shoulder injury history — avoid overhead pressing; prioritise rotator cuff prehab
- Season phase: Pre-season — Build the engine before trying to tune it. Focus on work capacity and structural robustness.

### Weekly Split (sample)

| Day | Type | Focus | Duration | Intensity |
|---|---|---|---|---|
| Monday | training | Lower body strength + scrum conditioning | 75min | high |
| Tuesday | training | Upper body push/pull + contact conditioning | 75min | medium |
| Wednesday | active-recovery | mobility, foam rolling, aerobic base walk | — | rest |
| Thursday | training | Full body power + aerobic work | 75min | high |
| Friday | training | Accessory + sprint work | 75min | medium |

### Exercise Block (sample)

**Foundation Phase** — Weeks 1–4
| Exercise | Sets | Reps | Tempo | Rest | Notes |
|---|---|---|---|---|---|
| Barbell Back Squat | 4 | 6 | 3-0-1-0 | 3min | Prioritise depth and bracing |
| Romanian Deadlift | 3 | 8 | 3-1-1-0 | 2min | Hip hinge is the foundation of scrum drive |
| Bulgarian Split Squat | 3 | 8 per leg | 3-0-1-0 | 90s | Address any left-right imbalance |
| Hip Thrust | 3 | 12 | 1-2-1-0 | 90s | Full hip extension at top |

---


## Test — Session Generation

**Age group:** U16
**Theme:** breakdown and rucking technique — U16
**Duration:** 90min
**Mode:** template
**KB items:** 4


### Warm-Up Activities

- Dynamic warm-up with ball (7min)
- Competitive handling warm-up (7min)

### Skill Blocks

- Skill Block 1 — breakdown and rucking technique (technique)
- Skill Block 2 — breakdown and rucking technique (competitive application)

---


## Test — Rehab Plan Generation

**Player:** prop age 17
**Injury:** AC joint shoulder injury — left shoulder
**Mode:** template
**Stages:** 5


### Return-to-Play Stages

- Stage 1: Pain-free ROM
- Stage 2: Strength base
- Stage 3: Power and contact
- Stage 4: Full training
- Stage 5: Match return

### Red Flags

- Increasing pain during or after exercise — stop and review
- Swelling or instability in the affected area
- Sharp or shooting pain
- Neurological symptoms (numbness, tingling)
- If in doubt — stop and seek medical review

---


## How to Use

```bash
# Run the engine test with the example player profile
npm run coaching:engine

# Import in your own module
import { generateProgramme, generateSession } from './qa/coaching-engine/index.js';

const programme = await generateProgramme({
  age: 17, position: 'Prop', experience: 'Intermediate',
  goals: ['Strength', 'Mass', 'Scrummaging Power'],
  injuries: ['Previous shoulder injury'],
  trainingDays: 4, equipment: ['Full gym'], seasonPhase: 'Preseason'
});
```

---


## Provider Configuration

The engine auto-detects the best available provider. Set environment variables to enable AI output:
```bash
export ANTHROPIC_API_KEY=sk-...   # enables Claude (recommended)
export OPENAI_API_KEY=sk-...      # enables OpenAI GPT
export GEMINI_API_KEY=...         # enables Google Gemini
export LOCAL_LLM_URL=http://...   # enables Ollama local LLM
export COACHING_ENGINE_PROVIDER=claude  # force a specific provider
```
Without any API key the engine falls back to a structured template that produces real, usable output — no empty fields, no generic text.

---

*Built on feature/nightly-qa-agent — no production app code modified.*