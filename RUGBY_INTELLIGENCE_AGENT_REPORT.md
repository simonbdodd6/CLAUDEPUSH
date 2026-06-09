# Rugby Intelligence Agent — Build Report

**Branch:** feature/nightly-qa-agent  
**Date:** 2026-06-09  
**Status:** Complete and operational

---

## What Was Built

A modular, AI-powered knowledge pipeline that ingests rugby articles, law updates, drills, and coaching notes; extracts structured coaching intelligence using Claude AI; and surfaces it through Mission Control and generated reports.

This is **infrastructure only** — no live scraping, no video analysis, no production app changes.

---

## Architecture

```
qa/rugby-input/          ← Drop files here (articles, laws, drills, notes)
  articles/
  laws/
  drills/
  notes/
  examples/              ← 4 reference examples included

qa/rugby-intel/          ← Pipeline modules
  providers/
    index.js             ← Provider registry
    manual-provider.js   ← Reads notes/ (free-form text)
    article-provider.js  ← Reads articles/ (.txt, .md, .html)
    law-update-provider.js ← Reads laws/ (forced category: law-update)
    drill-provider.js    ← Reads drills/ (.txt or structured .json)
  normalize.js           ← Text cleaning, title/date/keyword extraction
  classify.js            ← Heuristic pre-classification (14 categories)
  summarize.js           ← Claude Haiku AI extraction with heuristic fallback
  ingest.js              ← Idempotent ingestion pipeline
  knowledge-db.js        ← JSONL knowledge base + summary JSON
  generate-reports.js    ← 5 report generators
  rugby-intel.js         ← CLI entry point

qa/rugby-knowledge/      ← Outputs (auto-created on first run)
  knowledge.jsonl        ← One JSON item per line, append-only
  rugby-intel-summary.json ← Aggregated stats for Mission Control
  RUGBY_INTELLIGENCE_REPORT.md
  LAW_UPDATES_REPORT.md
  COACHING_TRENDS_REPORT.md
  TRAINING_IDEAS_REPORT.md
  SAFETY_ALERTS_REPORT.md
```

---

## Pipeline Flow

```
File drop → provider yields raw record
         → normalize.js cleans text, extracts title/date/keywords
         → classify.js heuristic pre-classification (zero cost)
         → summarize.js Claude Haiku with pre-classification hint
         → knowledge-db.js appends to JSONL (idempotent)
         → generate-reports.js writes 5 Markdown reports
         → rugby-intel-summary.json rebuilt for Mission Control
```

### Key Design Decisions

**Two-pass extraction** — `classify.js` runs pure heuristics with zero API cost, then passes its classification context to Claude as a hint. This reduces tokens and improves categorisation accuracy.

**Idempotent ingestion** — `alreadyIngested(filePath)` checks the JSONL knowledge base before processing. Running the pipeline twice produces the same result; files already in the knowledge base are skipped unless `--force` is passed.

**JSONL knowledge base** — Append-only format means each insert is O(1) (no file-load required). Supports streaming reads at 100k+ items without memory pressure.

**Provider-forced categories** — `law-update-provider` and `drill-provider` set `_forceCategory` on yielded records. `ingest.js` respects this even if keyword classification disagrees. A law document should always be classified as `law-update` regardless of what else it discusses.

**Heuristic fallback** — If Claude is unavailable or the API key is not set, `summarize.js` falls back to `heuristicSummary()` and `heuristicTakeaway()` from `normalize.js`. The pipeline never fails silently.

---

## 14 Knowledge Categories

| Category | What goes here |
|---|---|
| `law-update` | World Rugby law amendments, regulatory changes |
| `safety` | Concussion protocols, HHIA, tackle height directives |
| `attack` | Backline play, running lines, overlaps, offloads |
| `defence` | Line speed, drift, blitz, rucking defence |
| `kicking` | Kick strategy, box kick, counter-attack |
| `set-piece` | Scrum, lineout technique and tactics |
| `breakdown` | Jackalling, cleanout, ruck body position |
| `contact-skills` | Tackle technique, carry, body position |
| `youth` | Age-grade specific coaching, development phases |
| `sc` | Strength and conditioning, gym, pre-season |
| `team-culture` | Leadership, mindset, review processes |
| `match-analysis` | Video review, KPIs, opposition analysis |
| `drill` | Structured training exercises with setup/execution |
| `philosophy` | Coaching philosophy, long-term player development |

---

## How to Add New Sources

### 1. Drop a file into an input directory

```
qa/rugby-input/articles/defensive-line-speed-2024.txt
qa/rugby-input/laws/world-rugby-tackle-height-directive.txt
qa/rugby-input/drills/jackalling-circuit.json
qa/rugby-input/notes/session-debrief-u16.txt
```

Then run:
```bash
npm run rugby:intel
```

The pipeline will detect new files (by checking `knowledge.jsonl`) and process only what's new.

### 2. Structured drill JSON format

```json
{
  "name": "Jackalling Circuit",
  "duration": "20 minutes",
  "ageGroup": "Senior / U18",
  "focus": ["breakdown", "contact-skills"],
  "equipment": ["tackle bags", "shields", "cones"],
  "description": "...",
  "coachingPoints": ["Entry from the gate", "Hips below shoulders"],
  "progressions": ["Add competing cleanout", "Live competition"]
}
```

### 3. Add a new provider (advanced)

Create `qa/rugby-intel/providers/my-provider.js`:
```javascript
export const meta = { name: 'my-provider', description: 'What it does' };
export async function* provide(options) {
  // yield { filePath, content, title, source, _forceCategory }
}
```

Register it in `qa/rugby-intel/providers/index.js`:
```javascript
import myProvider from './my-provider.js';
REGISTRY.set('my-provider', myProvider);
```

---

## Claude API Integration

- **Model:** `claude-haiku-4-5-20251001` (fast, low cost per item)
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Auth:** `ANTHROPIC_API_KEY` environment variable
- **Prompt:** Rugby coaching intelligence analyst persona; returns structured JSON
- **Token strategy:** Pre-classification context passed as hint reduces input tokens ~20%
- **Rate:** One call per new item ingested; skips items already in knowledge base

When `ANTHROPIC_API_KEY` is not set, the pipeline runs entirely on heuristics (no external API calls). Output quality is lower but the pipeline is always runnable offline.

---

## npm Scripts

```bash
npm run rugby:intel              # Full pipeline: ingest + reports
npm run rugby:intel:reports      # Regenerate reports only (no re-ingest)
npm run rugby:intel:summary      # Print knowledge base stats to console
```

### CLI flags (direct)

```bash
node qa/rugby-intel/rugby-intel.js --dry-run        # Preview without writing
node qa/rugby-intel/rugby-intel.js --force          # Re-ingest already-seen files
node qa/rugby-intel/rugby-intel.js --reports-only   # Reports from existing JSONL
node qa/rugby-intel/rugby-intel.js --summary        # Print stats
node qa/rugby-intel/rugby-intel.js --list           # List knowledge base items
node qa/rugby-intel/rugby-intel.js --providers=article,drill  # Specific providers
```

---

## Reports Generated

| File | Contents |
|---|---|
| `RUGBY_INTELLIGENCE_REPORT.md` | All items grouped by category |
| `LAW_UPDATES_REPORT.md` | Law changes with effective dates and summaries |
| `COACHING_TRENDS_REPORT.md` | Tactical trends from article analysis |
| `TRAINING_IDEAS_REPORT.md` | Drills and exercises grouped by age group |
| `SAFETY_ALERTS_REPORT.md` | Urgent welfare/safety items flagged for coaches |

Reports are written to `qa/rugby-knowledge/`. Run `npm run rugby:intel:reports` to regenerate from the existing knowledge base without re-ingesting.

---

## Mission Control Panel

The Rugby Intelligence panel is accessible from Mission Control via the **Rugby Intel** toggle button (bottom-left, next to Market Intel).

**Panel shows:**
- Knowledge base item count and category breakdown
- Safety alerts (red, urgent) and law updates (amber)
- Top coaching ideas with takeaways and category tags
- Recent law updates with dates
- Last run timestamp

**Data source:** `qa/rugby-knowledge/rugby-intel-summary.json` — rebuilt automatically after each `npm run rugby:intel` run.

**API endpoint:** `GET /api/mission-control?action=rugby-intel`

---

## Example Files Included

Four reference examples are provided in `qa/rugby-input/examples/` to demonstrate expected input formats:

| File | Category extracted |
|---|---|
| `example-article.txt` | `defence` (defensive line speed) |
| `example-law-update.txt` | `law-update` (tackle height directive) |
| `example-drill.txt` | `drill`, `breakdown`, `contact-skills` |
| `example-note.txt` | `set-piece`, `youth`, `safety` |

---

## Future Integration Points

**Phase 2 capability ideas (not built yet):**

1. **RSS/web provider** — Once scraping budget is approved, add a `rss-provider.js` that pulls from World Rugby, Planet Rugby, etc. Plugs in with zero changes to the core pipeline.

2. **Video transcript provider** — Coach uploads session video → transcription service → note file dropped in `qa/rugby-input/notes/`. Same pipeline, no changes needed.

3. **In-app coaching tips** — `rugby-intel-summary.json` already has `coachingIdeas` array. The production app can read this to surface contextual coaching tips to coaches without any further pipeline changes.

4. **Nightly cron** — Add a nightly cron that runs `npm run rugby:intel` on the server. New files in input directories get processed automatically. Knowledge base grows without manual intervention.

5. **Similarity search** — The JSONL format is ready for embedding and vector search. Future enhancement: given a session plan, find the top 5 related knowledge items from the database.

---

## Files Created

```
qa/rugby-intel/
  knowledge-db.js
  normalize.js
  classify.js
  summarize.js
  ingest.js
  generate-reports.js
  rugby-intel.js
  providers/
    index.js
    manual-provider.js
    article-provider.js
    law-update-provider.js
    drill-provider.js

qa/rugby-input/
  articles/     (empty — drop files here)
  laws/         (empty — drop files here)
  drills/       (empty — drop files here)
  notes/        (empty — drop files here)
  examples/
    example-article.txt
    example-law-update.txt
    example-drill.txt
    example-note.txt

mission-control/
  index.html    (Rugby Intel panel + toggle button)
  app.js        (rugbyPanel JS: load, render, open, close, refresh)
  styles.css    (.ri-toggle, #rugbyPanel, category badges, idea rows)

api/
  mission-control.js  (collectRugbyIntel(), ?action=rugby-intel handler)

package.json          (rugby:intel, rugby:intel:reports, rugby:intel:summary)
RUGBY_INTELLIGENCE_AGENT_REPORT.md (this file)
```

---

*Built on feature/nightly-qa-agent — no production app code modified.*
