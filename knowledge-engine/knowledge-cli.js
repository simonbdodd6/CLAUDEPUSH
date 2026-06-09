#!/usr/bin/env node
// Coach's Eye Knowledge Engine — CLI
// npm run knowledge:engine

import { writeFileSync } from 'fs';
import { dirname, join }  from 'path';
import { fileURLToPath }  from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  COACH\'S EYE CLUB KNOWLEDGE ENGINE');
console.log('══════════════════════════════════════════════════════════════\n');

// ── Imports ────────────────────────────────────────────────────────────────────

const { ask, formatAnswer }       = await import('./knowledge-answer.js');
const { buildIndex, indexStats }  = await import('./knowledge-index.js');
const { parseQuery, describeQuery } = await import('./knowledge-query.js');
const { checkHealth, formatHealth } = await import('./knowledge-health.js');
const { getQueryStats }           = await import('./knowledge-history.js');
const { stats: cacheStats }       = await import('./knowledge-cache.js');

function hr(title = '') {
  const PAD = 60;
  if (title) {
    const p = Math.max(0, Math.floor((PAD - title.length - 2) / 2));
    console.log('\n' + '─'.repeat(p) + ' ' + title + ' ' + '─'.repeat(Math.max(0, PAD - p - title.length - 2)));
  } else {
    console.log('\n' + '─'.repeat(PAD));
  }
}

// ── 1. Build Index ─────────────────────────────────────────────────────────────

hr('1. BUILDING KNOWLEDGE INDEX');
console.log('Indexing all club domains...\n');

const idx = await buildIndex();
const stats = indexStats();

console.log(`Domains indexed: ${stats.domains}`);
console.log(`Total entries:   ${stats.total}`);
console.log(`Live entries:    ${stats.live}`);
console.log(`Mock entries:    ${stats.mock}`);
console.log('\nDomain breakdown:');
Object.entries(stats.byDomain).forEach(([d, n]) => console.log(`  ${d.padEnd(20)} ${n} entries`));

// ── 2. Health Check ────────────────────────────────────────────────────────────

hr('2. HEALTH CHECK');
const health = await checkHealth();
console.log(formatHealth(health));

// ── 3. Query Parser Demo ───────────────────────────────────────────────────────

hr('3. QUERY PARSER');
const sampleParses = [
  "Show all injured props.",
  "Who has missed the most training?",
  "Which sponsors expire this month?",
  "What has the U14 coach achieved this season?",
  "Summarise club health.",
  "Compare attendance this season with last season.",
  "Who hasn't volunteered recently?",
];

sampleParses.forEach(q => {
  const parsed = parseQuery(q);
  console.log(`\n"${q}"`);
  console.log(`  → ${describeQuery(parsed)}`);
});

// ── 4. Natural Language Queries ────────────────────────────────────────────────

hr('4. NATURAL LANGUAGE QUERIES');

const NL_QUERIES = [
  // Spec queries
  "Show all injured props.",
  "Who has missed the most training?",
  "Which sponsors expire this month?",
  "What has the U14 coach achieved this season?",
  "Summarise club health.",
  "Compare attendance this season with last season.",
  "Who hasn't volunteered recently?",
  // Additional queries demonstrating breadth
  "List all upcoming fixtures.",
  "Show recent match results.",
  "How many members are registered?",
  "Which players have low attendance?",
  "Show pending communications.",
  "What are the top AI recommendations for the club?",
  "Find all senior players.",
];

const results = [];
for (const query of NL_QUERIES) {
  process.stdout.write(`\nQ: "${query}"\n`);
  try {
    const result = await ask(query, { useCache: false });
    console.log(`A: ${result.answer}`);
    console.log(`   Intent: ${result.intent} · Confidence: ${result.confidence}% · ${result.timing?.durationMs}ms · ${result.count} results`);
    if (result.citations?.length > 0) {
      const engines = [...new Set(result.citations.map(c => c.engine))].join(', ');
      console.log(`   Sources: ${engines}`);
    }
    results.push({ query, ...result });
  } catch (err) {
    console.log(`   ERROR: ${err.message}`);
    results.push({ query, error: err.message });
  }
}

// ── 5. Cache Demo ──────────────────────────────────────────────────────────────

hr('5. CACHE DEMONSTRATION');
console.log('Running a cached query...');
const cacheQ = "Summarise club health.";
const r1 = await ask(cacheQ, { useCache: true });
const r2 = await ask(cacheQ, { useCache: true });
console.log(`First run:  ${r1.timing?.durationMs}ms (cached: ${r1.cached})`);
console.log(`Second run: ${r2.timing?.durationMs}ms (cached: ${r2.cached})`);
const cs = cacheStats();
console.log(`Cache: ${cs.live} live entries · ${cs.totalHits} total hits`);

// ── 6. Query History ──────────────────────────────────────────────────────────

hr('6. QUERY STATISTICS');
const qs = getQueryStats();
console.log(`Total queries:    ${qs.total}`);
console.log(`Avg confidence:   ${qs.avgConfidence}%`);
console.log(`Avg duration:     ${qs.avgDurationMs}ms`);
console.log(`Cache hit rate:   ${qs.cacheHitRate}%`);
if (Object.keys(qs.byIntent ?? {}).length > 0) {
  console.log('By intent:');
  Object.entries(qs.byIntent).forEach(([intent, n]) => console.log(`  ${intent.padEnd(22)} ${n}`));
}

// ── 7. Generate KNOWLEDGE_ENGINE_REPORT.md ────────────────────────────────────

hr('7. GENERATING KNOWLEDGE_ENGINE_REPORT.md');

const REPORT_PATH = join(__dirname, '..', 'KNOWLEDGE_ENGINE_REPORT.md');
const report = buildReport(stats, health, results, qs);
writeFileSync(REPORT_PATH, report, 'utf8');
console.log(`Report written to: KNOWLEDGE_ENGINE_REPORT.md`);

hr();
console.log("\nCoach's Eye Knowledge Engine loaded successfully.\n");
console.log('Run "npm run knowledge:engine" to regenerate.\n');

// ── Report builder ─────────────────────────────────────────────────────────────

function buildReport(idxStats, health, queryResults, queryStats) {
  const generated = new Date().toISOString();

  const queryRows = queryResults
    .filter(r => !r.error)
    .map(r => `| "${r.query.slice(0, 50)}" | ${r.intent ?? '—'} | ${r.count ?? 0} | ${r.confidence ?? 0}% | ${r.timing?.durationMs ?? 0}ms |`)
    .join('\n');

  const domainRows = Object.entries(idxStats.byDomain)
    .map(([d, n]) => `| ${d} | ${n} | ${health.domains[d]?.status ?? '?'} | ${health.domains[d]?.engine ?? '—'} |`)
    .join('\n');

  return `# Coach's Eye — Club Knowledge Engine
## Architecture Report

**Generated:** ${generated}

---

## Purpose

The Knowledge Engine is the searchable knowledge layer for the entire Coach's Eye platform. It gives every AI feature structured, evidence-backed answers about any aspect of the club — players, fixtures, sponsors, attendance, health, volunteers, membership, and more.

Every answer includes:
- **Structured JSON data** ready for any consumer
- **Evidence citations** tracing each fact to its source engine
- **Confidence score** based on data quality and source count
- **Intent classification** for query analytics

---

## Architecture

\`\`\`
knowledge-engine/
├── index.js                  ← Public API: ask(), search(), buildIndex()
├── knowledge-answer.js       ← Main orchestrator — dispatches to intent handlers
├── knowledge-query.js        ← NL → structured Query (intent, filters, timeRange)
├── knowledge-search.js       ← Structured query → ranked results from index
├── knowledge-index.js        ← Unified in-memory index across all engines
├── knowledge-citations.js    ← Citation model and formatting
├── knowledge-ranking.js      ← Relevance scoring and intent-specific sort
├── knowledge-cache.js        ← TTL cache with domain invalidation
├── knowledge-history.js      ← Query audit log (ring buffer + JSONL)
├── knowledge-health.js       ← Index coverage + engine connectivity check
└── knowledge-cli.js          ← npm run knowledge:engine
\`\`\`

---

## Domains

| Domain | Entries | Status | Source Engine |
|---|---|---|---|
${domainRows}

**Total:** ${idxStats.total} entries across ${idxStats.domains} domains

---

## Supported Intents

| Intent | Example Query | Domain |
|---|---|---|
| \`injury_report\` | "Show all injured props." | medical |
| \`attendance_worst\` | "Who has missed the most training?" | players |
| \`attendance_compare\` | "Compare attendance this season with last season." | attendance |
| \`attendance_report\` | "What is the average attendance rate?" | attendance |
| \`sponsor_expiry\` | "Which sponsors expire this month?" | sponsors |
| \`sponsor_report\` | "List all active sponsors." | sponsors |
| \`coach_summary\` | "What has the U14 coach achieved this season?" | teams |
| \`health_summary\` | "Summarise club health." | club-intelligence |
| \`volunteer_inactive\` | "Who hasn't volunteered recently?" | volunteers |
| \`volunteer_report\` | "Show all volunteers." | volunteers |
| \`player_find\` | "Find all senior players." | players |
| \`team_report\` | "How is the U18 team performing?" | teams |
| \`membership_report\` | "How many members are registered?" | membership |
| \`fixture_upcoming\` | "List all upcoming fixtures." | fixtures |
| \`match_history\` | "Show recent match results." | match_history |
| \`training_report\` | "What sessions ran this week?" | training |
| \`comms_pending\` | "Show pending communications." | communications |
| \`general\` | Any other query | cross-domain |

---

## Query Results (this run)

| Query | Intent | Results | Confidence | Time |
|---|---|---|---|---|
${queryRows}

**Query stats:** ${queryStats.total} total · avg ${queryStats.avgConfidence}% confidence · avg ${queryStats.avgDurationMs}ms

---

## Answer Shape

\`\`\`json
{
  "question":    "Show all injured props.",
  "intent":      "injury_report",
  "domain":      "medical",
  "answer":      "2 injured players (props): Tom Kelly, Jack Ryan.",
  "summary":     "2 active injuries (2 prop)",
  "data":        [ { "name": "Tom Kelly", "injuryType": "hamstring", "status": "active" } ],
  "count":       2,
  "confidence":  85,
  "citations":   [ { "engine": "memory-engine", "fact": "Tom Kelly: hamstring injury" } ],
  "parsedQuery": { "intent": "injury_report", "filters": { "positions": ["prop"] } },
  "timing":      { "durationMs": 12 },
  "cached":      false
}
\`\`\`

---

## Integration Points

| Engine | Role | Data Provided |
|---|---|---|
| Memory Engine | Primary player/team store | Players, teams, injuries, coaches |
| Data Integration | Structured queries | Fixtures, attendance, sessions, membership |
| Club Intelligence | Health & insights | Scores, insights, recommendations |
| Communications Engine | Comms data | Sponsors, volunteers, membership stats |
| Dashboard Approval Queue | Pending items | Approval queue contents |

---

## Health Summary (latest run)

- Coverage: ${health.coverage}%
- Live data ratio: ${health.liveRatio}%
- Index age: ${health.indexAgeMinutes} minutes
- Warnings: ${health.warnings.length}
- Errors: ${health.errors.length}

---

## npm Script

\`\`\`bash
npm run knowledge:engine
\`\`\`

---

## Design Principles

1. **Evidence-backed** — every answer cites its source engine and the specific fact.
2. **No logic duplication** — the Knowledge Engine reads from existing engines, never reimplements.
3. **Parallel index build** — all domain builders run with \`Promise.all\`.
4. **Graceful degradation** — missing engines return empty domains, never crash queries.
5. **Intent-aware sorting** — attendance queries sort by absences, sponsor queries by expiry, volunteer queries by last-active.
6. **TTL cache** — repeated queries hit the cache; domain refreshes invalidate only their domain.
7. **Audit trail** — every query is logged to JSONL for analytics.

---

*Report generated by Coach's Eye Knowledge Engine v1.0.0*
`;
}
