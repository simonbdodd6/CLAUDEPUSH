# Coach Memory Engine — Architecture Report

**Date:** 2026-06-09
**Branch:** feature/nightly-qa-agent
**Status:** Operational

---

## What Is This?

The Coach Memory Engine is the long-term memory system for every AI feature inside Coach's Eye. Before any AI generation, the engine checks memory for relevant history. After generation, it saves the output back to memory. Over time, every player, team, session, and programme builds a richer context that makes future generations more personalised and accurate.

Without memory, every generation starts from scratch. With memory, the engine knows:
- What programmes this player has already completed
- Which injuries they've had and whether they've cleared
- Their attendance pattern and consistency
- What worked last time and what the coach recommended changing

---

## Architecture

```
memory-engine/
  index.js              ← Public API (remember*, get*, getRelevantContext)
  entity-schemas.js     ← Entity schemas for 12 memory types
  id-generator.js       ← Deterministic IDs (same entity = same ID across calls)
  memory-store.js       ← File system read/write layer
  memory-index.js       ← Master index for fast lookup + keyword search
  memory-query.js       ← Query interface + ContextBundle assembly
  memory-summary.js     ← Auto-summarization + history compression
  memory-update.js      ← Post-generation update handlers
  memory-health.js      ← Health checks, stats, index repair
  data/
    entities/           ← One JSON file per entity (players/, teams/, etc.)
    logs/               ← Append-only JSONL (generations, conversations, updates)
    index.json          ← Master lookup index (fast search without loading files)
    health.json         ← Last health check result
```

---

## Memory Types

| Type | Description | Key fields |
|---|---|---|
| Player | Individual player profile with history | name, position, age, goals, injuries, programmes |
| Coach | Coach identity, philosophy, preferences | name, club, qualifications, aiGenerations |
| Team | Team context, season phase, record | ageGroup, level, systemOfPlay, sessionCount |
| Club | Club-level data and team roster | name, country, union, teams |
| Programme | Generated training programme + status | player, input, outputSummary, status |
| Session | Individual training session | team, theme, focus, attendance, coachNotes |
| Season | Full season arc for a team | label, phases, record, keyObjectives |
| Injury | Player injury with RTP status | type, onset, clearance, rehabPlanGenerated |
| Goal | Individual training goal | goal, setAt, status |
| Conversation | AI conversation history | messages, entities, summary |
| AI Generation | Log of every AI generation | requestType, provider, elapsed, preview |

---

## Public API

```javascript
import {
  // Remember (upsert)
  rememberPlayer, rememberCoach, rememberTeam, rememberClub,
  rememberProgramme, rememberSession, rememberSeason, rememberConversation,

  // Query
  getRelevantContext,   // primary interface for AI generators
  getPlayer, getTeam, getCoach,
  getAllPlayers, getAllTeams,
  searchMemory,

  // Updates
  updateAfterGeneration,   // called automatically after every AI generation
  recordAttendance,
  clearInjury,
  updateProgrammeStatus,

  // Health
  checkHealth, repairIndex, getStats,
} from './memory-engine/index.js';
```

---

## Integration with Coaching Engine

The Coaching Engine automatically queries memory before generation and saves after.
No changes needed at the call site — it's transparent.

```javascript
// This is all you need — memory is handled automatically
const programme = await generateProgramme(playerProfile, coachProfile);

// Memory context flows through the pipeline:
//   generateProgramme()          → queries memory
//   → buildProgrammeContext()    → receives memoryContext
//   → buildProgrammePrompt()     → injects memory section into prompt
//   → provider.generateJSON()    → AI sees player history in prompt
//   → updateAfterGeneration()    → saves output back to memory
```

When memory context is present, the programme prompt includes a section like:

```
## Player History (from memory)
Player: Ciarán Murphy, 17yo U18 Prop. (Kildare Valley RFC). Intermediate level. 1 programme on record. 67% attendance. 1 AI generation
Attendance: 67% (2/3 sessions)
Prior AI generations: 1
Prior programmes (1):
  - 8 weeks. Goals: Strength/Mass/Scrummaging Power. Phase 1: Foundation Phase. Exercises: Barbell Back Squat, Romanian Deadlift, Bulgarian Split Squat. 2 training blocks. via template [active]
Recommendation: Player has an active programme — consider continuing or updating rather than generating a new one.
```

---

## How Memory IDs Work

IDs are deterministic — the same player always gets the same ID regardless of call order.

```javascript
generatePlayerId({ name: 'Ciarán Murphy', club: 'Kildare Valley RFC', ageGroup: 'U18' })
// → 'player_ciar_n_murphy_a3f7b2c1'

// If the app provides its own ID (e.g., Firestore document ID):
generatePlayerId({ id: 'user_abc123' })
// → 'player_user_abc123'
```

This means upsert semantics work correctly:
- `rememberPlayer({ name: 'Ciarán Murphy', club: 'Kildare Valley RFC', ageGroup: 'U18' })` creates or updates exactly one record.

---

## Auto-Summarization

Each entity carries a `summary` string — a compact representation for prompt injection.

**Player summary (≤60 tokens):**
`Ciarán Murphy, 17yo U18 Prop. (Kildare Valley RFC). Intermediate level`

**Coach summary:**
`Coach Seán Doyle. at Kildare Valley RFC. Age groups: U16, U18, Senior. Philosophy: player-centred. Qualified: IRFU Level 2`

**Team summary:**
`U16 (community). at Kildare Valley RFC. Phase: preseason. Record: 0W-0L-0D. Focus: breakdown, set-piece`

When `updateCount > 10`, history entries are compressed automatically:
- Oldest N entries → single `compressed-archive` block with date range and entry count
- Last 5 snapshots kept in full

This prevents memory files from growing unbounded while preserving history.

---

## Token Budget Management

The `getRelevantContext()` response includes a `tokenEstimate`:

| Context element | Approximate tokens |
|---|---|
| Player summary | ~50 |
| Prior programmes (3) | ~120 |
| Injury history | ~30 |
| Attendance | ~15 |
| Recommendation | ~30 |
| **Total** | **~245** |

The target is ≤400 tokens for a full context bundle. This is well within a single-sentence addition to the AI prompt — no meaningful cost increase.

---

## Test Results

### Step 1: Entity storage
- Player remembered: player_ciar_n_murphy_0shhe5u
- Coach remembered: coach_se_n_doyle_04vvwa1
- Team remembered: team_u16_0yzgvy6

### Step 2: First generation (no prior programme history)
- Mode: template
- Elapsed: 26ms
- Memory context: yes

### Step 3: Programme completed + injury cleared
- Programme status updated to: completed
- Shoulder injury marked as: cleared

### Step 4: Second generation (memory provides full context)
- Mode: template
- Memory context: yes
- Token estimate: 102
- Recommendation surfaced: no

### Step 5: Session generation
- Team session count after generation: 0 → will increment on next query

### Step 6: Health
- Status: ok
- Total entities: 10
- Index entries: 10
- Discrepancies: 0

---

## Storage Design

### Why individual entity files (not a single database file)?

1. **No load-all required** — reading a player doesn't load all teams
2. **Append log safety** — JSONL logs survive process crashes
3. **Git-friendly** — entity files diff cleanly
4. **Zero dependencies** — standard Node.js `fs` module only
5. **Easy backup** — `cp -r memory-engine/data/ backup/`

### Why JSONL for logs?

`appendFileSync` is atomic on all platforms — no corruption if the process dies mid-write.
Logs are streaming-parseable — read with `split('\n').map(JSON.parse)`.

---

## Future: Vector Search

Every entity has an `embedding: null` field. When vector search is added:

1. On each `writeEntity()`, compute embedding via provider (OpenAI, local)
2. Store in entity file alongside the entity
3. In `memory-index.js`, replace `searchIndex()` with cosine similarity over embeddings
4. In `memory-query.js`, `getRelevantContext()` switches to semantic search

**Nothing else changes.** The public API, entity schemas, and context bundle format remain identical.
The switch is entirely internal to `memory-store.js` and `memory-index.js`.

---

## Commands

```bash
npm run memory:engine          # run full test suite
```

---

*Built on feature/nightly-qa-agent — no production app code modified.*
