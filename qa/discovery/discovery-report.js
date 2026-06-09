import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confidenceLabel, CONFIDENCE_READY } from './confidence.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');
const REPORTS_DIR = join(ROOT, 'qa/market-reports');
const STATE_DIR = join(ROOT, 'qa/discovery-state');

function ensure(dir) { mkdirSync(dir, { recursive: true }); }
function write(path, content) { ensure(dirname(path)); writeFileSync(path, content, 'utf8'); }

function formatPct(n) { return `${Math.round(n * 100)}%`; }

export function writeDiscoverySummaryJSON(session) {
  const { stats, providers, startedAt, sessionId } = session;
  const today = new Date().toISOString().slice(0, 10);

  const summary = {
    lastRunAt: session.completedAt || new Date().toISOString(),
    lastRunId: sessionId,
    lastRunDate: today,
    providers,
    todayDiscovered: stats.discovered,
    todayNew: stats.newLeads,
    todayUpdated: stats.updatedLeads,
    duplicates: stats.duplicates,
    duplicateRate: stats.duplicateRate ?? 0,
    readyForScoring: stats.readyForScoring ?? 0,
    newCountries: session.newCountries || [],
    totalLeadsInDb: stats.totalLeadsInDb ?? 0,
    health: deriveHealth(stats),
    analysisMode: 'discovery-agent',
  };

  ensure(STATE_DIR);
  writeFileSync(join(STATE_DIR, 'discovery-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}

function deriveHealth(stats) {
  if (!stats.discovered) return 'empty';
  const dupRate = stats.duplicateRate ?? 0;
  const hasNew = stats.newLeads > 0;
  if (dupRate > 0.5 && !hasNew) return 'yellow';
  if (stats.errors > 0) return 'yellow';
  return 'green';
}

export function writeDiscoveryReport(session, allRecords = []) {
  const { stats, providers, startedAt, sessionId } = session;

  const topCountries = countByField(allRecords.filter(r => !r.isDuplicate), 'country')
    .slice(0, 10);

  const bySource = countByField(allRecords, 'source').slice(0, 10);

  const readyRecords = allRecords.filter(r => !r.isDuplicate && (r.confidence ?? 0) >= CONFIDENCE_READY);
  const reviewRecords = allRecords.filter(r => !r.isDuplicate && (r.confidence ?? 0) >= 0.45 && (r.confidence ?? 0) < CONFIDENCE_READY);

  const topReady = readyRecords
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 15);

  const sourceTable = bySource.map(({ key, count }) =>
    `| ${key} | ${count} |`).join('\n');

  const countryTable = topCountries.map(({ key, count }) =>
    `| ${key} | ${count} | ${allRecords.filter(r => !r.isDuplicate && r.country === key && r.email).length} |`).join('\n');

  const readyTable = topReady.map(r =>
    `| **${r.clubName}** | ${r.country} | ${r.level} | ${(r.confidence ?? 0).toFixed(2)} | ${r.email ? `\`${r.email}\`` : '—'} |`
  ).join('\n');

  const content = `# Discovery Agent Report

_Session: ${sessionId}_
_Run at: ${new Date(startedAt).toLocaleString()}_
_Providers: ${providers.join(', ')}_

---

## Session Summary

| Metric | Value |
|--------|-------|
| Clubs discovered | **${stats.discovered}** |
| After deduplication | **${stats.unique ?? stats.discovered - stats.duplicates}** |
| Duplicates removed | ${stats.duplicates} (${formatPct(stats.duplicateRate ?? 0)}) |
| New leads added to DB | **${stats.newLeads}** |
| Existing leads updated | ${stats.updatedLeads} |
| Ready for scoring | **${readyRecords.length}** (confidence ≥ 0.70) |
| Needs review | ${reviewRecords.length} (confidence 0.45–0.69) |
| Low confidence (skipped) | ${allRecords.filter(r => !r.isDuplicate && (r.confidence ?? 0) < 0.45).length} |
| Errors | ${stats.errors} |

---

## Clubs by Country (Top 10)

| Country | Unique Clubs | With Email |
|---------|-------------|-----------|
${countryTable || '| — | 0 | 0 |'}

---

## Sources

| Source | Records |
|--------|---------|
${sourceTable || '| — | 0 |'}

---

## Top Ready-to-Score Clubs

These clubs have confidence ≥ 0.70 and are in the lead database awaiting fit scoring.

| Club | Country | Level | Confidence | Email |
|------|---------|-------|-----------|-------|
${readyTable || '| — | — | — | — | — |'}

---

## Next Steps

1. **Score leads**: \`node qa/market-intel/pipeline.js --score\`
2. **Review low-confidence**: check \`qa/discovery-state/sessions/${sessionId}.json\`
3. **Add more data**: drop CSVs in \`qa/market-input/csv/\` or JSON in \`qa/market-input/manual/\`
4. **Run full pipeline**: \`node qa/market-intel/pipeline.js\`

---

_Discovery agent does not scrape the web. All data comes from manually provided files._
`;

  write(join(REPORTS_DIR, 'DISCOVERY_REPORT.md'), content);
  return content;
}

function countByField(records, field) {
  const counts = {};
  records.forEach(r => {
    const v = r[field] || 'Unknown';
    counts[v] = (counts[v] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
