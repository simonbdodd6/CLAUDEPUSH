# Discovery Agent Report

_Built: 2026-06-09_
_Branch: feature/nightly-qa-agent_

---

## Files Created

### Core Engine

| File | Purpose |
|------|---------|
| `qa/discovery/discovery.js` | Orchestrator — CLI entry point, session management, full pipeline |
| `qa/discovery/normalize.js` | Field normalization: country aliases, club name cleaning, URL/email/social canonicalization |
| `qa/discovery/deduplicate.js` | Jaro-Winkler fuzzy deduplication, bucketed by country for O(n) scale |
| `qa/discovery/confidence.js` | Confidence scoring (0.0–1.0) by source reliability + field completeness |
| `qa/discovery/discovery-report.js` | Writes `DISCOVERY_REPORT.md` and `discovery-summary.json` |

### Provider Layer

| File | Purpose |
|------|---------|
| `qa/discovery/providers/index.js` | Provider registry — add new providers here with zero core changes |
| `qa/discovery/providers/csv-provider.js` | Reads CSVs from `qa/market-input/csv/` via async generator |
| `qa/discovery/providers/manual-provider.js` | Reads JSON arrays from `qa/market-input/manual/` |
| `qa/discovery/providers/rugby-directory-provider.js` | Reads pre-downloaded HTML/JSON/CSV/TXT directory files |

### Mission Control Integration

| File | Change |
|------|--------|
| `api/mission-control.js` | Added `?action=discovery` handler + `collectDiscovery()` |
| `mission-control/index.html` | Added `#discoveryCard` section |
| `mission-control/app.js` | Added `loadDiscoveryData()` + `renderDiscoveryCard()` |
| `mission-control/styles.css` | Added `.discovery-card`, `.disc-stats`, `.disc-meta`, `.disc-health` |

### Input Directories Created

| Directory | Purpose |
|-----------|---------|
| `qa/market-input/csv/` | CSV files (existing + discovery) |
| `qa/market-input/manual/` | Manually curated JSON files |
| `qa/market-input/directories/` | Pre-downloaded directory HTML/JSON |
| `qa/discovery-state/` | Session log + dashboard summary JSON |
| `qa/discovery-state/sessions/` | One JSON file per discovery run |

### Example Files

| File | Purpose |
|------|---------|
| `qa/market-input/examples/manual-example.json` | Schema reference for manual provider |

---

## Architecture

```
┌─────────────────── Provider Layer ────────────────────────────────┐
│  csv-provider     →  qa/market-input/csv/*.csv                    │
│  manual-provider  →  qa/market-input/manual/*.json                │
│  rugby-directory  →  qa/market-input/directories/*.(json/html/csv)│
│  [future]         →  plug in via providers/index.js               │
└───────────────────────────────────────────────────────────────────┘
                    │  async generator yield DiscoveryRecord
                    ▼
┌─────────────────── Core Engine ───────────────────────────────────┐
│  normalize.js     →  canonical fields, match keys                 │
│  deduplicate.js   →  exact → domain → fuzzy (Jaro-Winkler)       │
│  confidence.js    →  0.0–1.0 score per record                     │
└───────────────────────────────────────────────────────────────────┘
                    │  unique DiscoveryRecord[]
                    ▼
┌─────────────────── Persistence ───────────────────────────────────┐
│  lead-db.upsertLead()  →  qa/market-data/leads.json               │
│  discovery-report.js   →  qa/market-reports/DISCOVERY_REPORT.md   │
│                        →  qa/discovery-state/discovery-summary.json│
│                        →  qa/discovery-state/sessions/<id>.json    │
└───────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────── Downstream Pipeline ───────────────────────────┐
│  pipeline.js --score   →  fit scoring (heuristic or Claude)       │
│  pipeline.js --reports →  HOT_LEADS, COUNTRY_OPPORTUNITY, etc.    │
└───────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Async generators for providers.** Providers yield records lazily — the engine processes clubs as they arrive rather than loading everything into memory. This is the same approach used by Node.js streams and is what allows the system to handle 100,000+ clubs without modification.

**Country-bucketed deduplication.** Exact-key matching is O(1). Fuzzy matching (Jaro-Winkler) only runs within the same country bucket, giving roughly O(n) overall rather than O(n²). An Ireland bucket of 500 clubs does 500 comparisons, not 500 × total comparisons.

**DiscoveryRecord vs. LeadRecord.** The discovery system has its own schema. The `discoveryToLead()` function in `discovery.js` is the only integration seam. If the `lead-db.js` schema changes, only that function needs updating.

**Provider registry over dynamic imports.** `providers/index.js` is an explicit map. Adding a new provider means: create the file, import it in index.js, add a registry entry. No file-system scanning, no `require()` magic.

**Confidence ≠ Fit Score.** Confidence measures data quality (is this record reliable?). Fit score (from `score-leads.js`) measures sales potential (is this club worth pursuing?). These are intentionally separate and run at different stages.

---

## Integration with Market Intelligence

The Discovery Agent feeds the **upstream** of the existing Market Intelligence pipeline:

```
Discovery → Lead DB → pipeline.js (score + report)
```

**To run a full pipeline:**
```bash
node qa/discovery/discovery.js              # discover + feed DB
node qa/market-intel/pipeline.js --score    # score fit (heuristic or Claude)
node qa/market-intel/pipeline.js --reports  # generate all reports
```

**Or use the combined runner:**
```bash
node qa/market-intel/pipeline.js            # imports CSVs + scores + reports
```

The discovery agent writes to the same `leads.json` database that the pipeline reads from. They are fully compatible — `upsertLead()` handles deduplication at the database level too.

---

## Integration with Lead Database

| Integration Point | Method |
|------------------|--------|
| Read existing leads | `loadLeads()` from `lead-db.js` |
| Write new clubs | `upsertLead(lead, existingDb)` — batch mode, then manual save |
| Deduplicate | `dedupeKey(clubName, country)` in lead-db is a secondary check |
| Confidence threshold | Records with confidence < 0.10 are not written to the DB |

The discovery agent sets no `fitScore` on records it writes. Fit scoring is the pipeline's responsibility. Records from discovery enter with `status: 'new'` and `fitScore: null`.

---

## Mission Control Discovery Card

The `#discoveryCard` section auto-appears after a discovery run. It shows:

| Stat | Source field |
|------|-------------|
| Today | `todayDiscovered` |
| Ready | `readyForScoring` (confidence ≥ 0.70) |
| Dup rate | `duplicateRate` (0.0–1.0 → displayed as %) |
| Health | `health` (green / yellow / empty) |
| New countries | `newCountries[]` |

The card hides itself when `todayDiscovered === 0` or the summary file doesn't exist.

---

## CLI Reference

```bash
# Full discovery run (all providers)
node qa/discovery/discovery.js

# Specific providers only
node qa/discovery/discovery.js --providers=csv,manual

# Dry run — don't write to lead database
node qa/discovery/discovery.js --dry-run

# List registered providers
node qa/discovery/discovery.js --list-providers

# Combined: discover + score + report
node qa/discovery/discovery.js && node qa/market-intel/pipeline.js
```

---

## Phase 2 Recommendations

### Short-term (< 1 week)

1. **IRFU directory fixture** — download `https://www.irishrugby.ie/clubs/` as HTML, save to `qa/market-input/directories/irfu-clubs.html`. The rugby-directory provider will parse it immediately.

2. **France FFR clubs export** — request a clubs CSV from the Fédération Française de Rugby via their data portal. Drop into `qa/market-input/csv/`. Estimated: 1,500 French amateur clubs added in one run.

3. **Confidence tuning** — after the first real data run, review `qa/discovery-state/sessions/` to see which records scored 0.45–0.70. Adjust source base scores in `confidence.js` if a specific provider is systematically under- or over-trusted.

### Medium-term (1–4 weeks)

4. **World Rugby club finder integration** — World Rugby publishes a club-finder API (no key required for basic queries). Add a `world-rugby-provider.js` that reads a pre-prepared query result JSON — stays within the "no live scraping" constraint while accessing structured data.

5. **Incremental discovery** — track `lastDiscoveredAt` per club in `lead-db.js`. Add a `--since=YYYY-MM-DD` flag to discovery to skip clubs already discovered after that date. Prevents re-processing 100k clubs every run.

6. **CRM status webhook** — when a club's `status` changes to `contacted` or `responded` in the lead DB, emit an event that `pipeline.js --reports` picks up to regenerate hot-leads with updated pipeline ARR.

### Long-term (1+ month)

7. **Scheduled discovery** — add a cron entry via the Coach's Eye cron endpoint to run `node qa/discovery/discovery.js` nightly. Use the `QA_BASE_URL` + `ANTHROPIC_API_KEY` env vars already present.

8. **Country-level scoring model** — train a lightweight country-specific model for fit scoring. Ireland clubs have different characteristics than Japanese clubs; a single global scoring formula loses precision at scale.

9. **Provider health monitoring** — if a provider yields 0 records 3 runs in a row, set `health: 'yellow'` in the discovery summary and surface it in Mission Control.

---

_Discovery Agent is pure infrastructure. It adds no production routes, modifies no production data models, and has zero coupling to the live application._
