import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, stats, loadAll, rebuildSummaryJSON } from './knowledge-db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');
const KB_DIR = join(ROOT, 'qa/rugby-knowledge');

function ensure() { mkdirSync(KB_DIR, { recursive: true }); }
function write(filename, content) { ensure(); writeFileSync(join(KB_DIR, filename), content, 'utf8'); }

function ts() { return new Date().toISOString(); }

function categoryEmoji(cat) {
  const map = {
    'law-update': '📜', 'safety': '🛡️', 'attack': '⚡', 'defence': '🧱',
    'kicking': '🦶', 'set-piece': '🔩', 'breakdown': '💥', 'contact-skills': '👊',
    'youth': '🌱', 'sc': '💪', 'team-culture': '🤝', 'match-analysis': '📊',
    'drill': '🔄', 'philosophy': '💡',
  };
  return map[cat] || '📋';
}

function categoryTitle(cat) {
  const map = {
    'law-update': 'Law Update', 'safety': 'Safety / Welfare', 'attack': 'Attack',
    'defence': 'Defence', 'kicking': 'Kicking', 'set-piece': 'Set Piece',
    'breakdown': 'Breakdown', 'contact-skills': 'Contact Skills', 'youth': 'Youth Coaching',
    'sc': 'S&C', 'team-culture': 'Team Culture', 'match-analysis': 'Match Analysis',
    'drill': 'Training Drill', 'philosophy': 'Coaching Philosophy',
  };
  return map[cat] || cat;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function itemBlock(item) {
  const cats = (item.categories || []).map(c => `\`${categoryTitle(c)}\``).join(' · ');
  return `### ${item.title}
${cats} | ${formatDate(item.ingestedAt)}

${item.summary || '_No summary available._'}

> **Coaching takeaway:** ${item.takeaway || '_No takeaway extracted._'}

_Source: ${item.source} · Mode: ${item.analysisMode}_`;
}

// ── Report generators ──────────────────────────────────────────────────────────

export function writeRugbyIntelligenceReport() {
  const all = loadAll();
  const s = stats();
  const recent = all.slice(-30).reverse();

  const byCategory = {};
  all.forEach(item => (item.categories || []).forEach(c => {
    if (!byCategory[c]) byCategory[c] = [];
    byCategory[c].push(item);
  }));

  const catSections = Object.entries(byCategory)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([cat, items]) => `## ${categoryEmoji(cat)} ${categoryTitle(cat)} (${items.length})\n\n${
      items.slice(0, 3).map(itemBlock).join('\n\n---\n\n')
    }${items.length > 3 ? `\n\n_…and ${items.length - 3} more ${categoryTitle(cat)} items in the knowledge base._` : ''}`
    ).join('\n\n---\n\n');

  write('RUGBY_INTELLIGENCE_REPORT.md', `# Rugby Intelligence Report

_Generated: ${ts()}_
_Knowledge base: ${s.total} items · ${s.thisWeek} added this week_

---

## Overview

| Metric | Value |
|--------|-------|
| Total items | **${s.total}** |
| This week | ${s.thisWeek} |
| Law updates | ${s.lawUpdates} |
| Safety alerts | ${s.safetyAlerts} |
| Drills | ${s.drills} |
| Analysis mode | ${s.byMode.claude > 0 ? `Claude + heuristic` : 'Heuristic'} |

---

${catSections || '_No content yet. Add files to qa/rugby-input/ and run `npm run rugby:intel`._'}

---

_Run \`npm run rugby:intel:reports\` to regenerate._
`);
  return { items: all.length };
}

export function writeLawUpdatesReport() {
  const items = search({ isLawUpdate: true });

  const rows = items.map(i =>
    `| **${i.title}** | ${formatDate(i.date || i.ingestedAt)} | ${i.country || '—'} | ${i.source} |`
  ).join('\n');

  const details = items.map(itemBlock).join('\n\n---\n\n');

  write('LAW_UPDATES_REPORT.md', `# Law Updates Report

_Generated: ${ts()}_
_${items.length} law update(s) in knowledge base_

---

## Summary Table

| Title | Date | Country | Source |
|-------|------|---------|--------|
${rows || '| — | — | — | No law updates yet |'}

---

## Full Details

${details || '_No law updates ingested yet._\n\nAdd law update files to `qa/rugby-input/laws/` and run `npm run rugby:intel`.'}
`);
  return { lawUpdates: items.length };
}

export function writeCoachingTrendsReport() {
  const all = loadAll();
  const tactical = all.filter(i => i.isTactical);
  const philosophy = all.filter(i => (i.categories || []).includes('philosophy'));

  const catCounts = {};
  all.forEach(i => (i.categories || []).forEach(c => { catCounts[c] = (catCounts[c] || 0) + 1; }));

  const topCats = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, count]) => `| ${categoryEmoji(cat)} ${categoryTitle(cat)} | ${count} | ${'█'.repeat(Math.min(count, 20))} |`)
    .join('\n');

  const tacticalSection = tactical.slice(0, 5).map(itemBlock).join('\n\n---\n\n');
  const philosophySection = philosophy.slice(0, 3).map(itemBlock).join('\n\n---\n\n');

  write('COACHING_TRENDS_REPORT.md', `# Coaching Trends Report

_Generated: ${ts()}_
_Based on ${all.length} items in knowledge base_

---

## Topic Distribution

| Category | Count | Bar |
|----------|-------|-----|
${topCats || '| — | 0 | No content yet |'}

---

## Latest Tactical Intelligence

${tacticalSection || '_No tactical content yet. Add articles to `qa/rugby-input/articles/`._'}

---

## Coaching Philosophy

${philosophySection || '_No philosophy content yet._'}
`);
  return { items: all.length, tactical: tactical.length };
}

export function writeTrainingIdeasReport() {
  const drills = search({ isPractical: true });

  const byAgeGroup = {};
  drills.forEach(i => (i.ageGroup || ['all']).forEach(g => {
    if (!byAgeGroup[g]) byAgeGroup[g] = [];
    byAgeGroup[g].push(i);
  }));

  const ageSections = Object.entries(byAgeGroup).map(([group, items]) => {
    const label = group === 'all' ? 'All Age Groups' : group.charAt(0).toUpperCase() + group.slice(1);
    return `## ${label}\n\n${items.slice(0, 4).map(itemBlock).join('\n\n---\n\n')}`;
  }).join('\n\n---\n\n');

  write('TRAINING_IDEAS_REPORT.md', `# Training Ideas Report

_Generated: ${ts()}_
_${drills.length} practical training item(s) in knowledge base_

---

${ageSections || `_No training drills or exercises ingested yet._

Add drill files to \`qa/rugby-input/drills/\` and run \`npm run rugby:intel\`.`}

---

_Add new drills: save descriptions to \`qa/rugby-input/drills/\` then run \`npm run rugby:intel\`._
`);
  return { drills: drills.length };
}

export function writeSafetyAlertsReport() {
  const alerts = search({ isSafetyAlert: true });

  const urgentHeader = alerts.length > 0
    ? `> ⚠️ **${alerts.length} safety alert(s) in knowledge base. Review before next training session.**`
    : '> ✅ No active safety alerts in knowledge base.';

  const details = alerts.map(i => `### 🛡️ ${i.title}
_${formatDate(i.date || i.ingestedAt)} · Source: ${i.source}_

${i.summary}

> **Action required:** ${i.takeaway}
`).join('\n---\n\n');

  write('SAFETY_ALERTS_REPORT.md', `# Safety Alerts Report

_Generated: ${ts()}_

${urgentHeader}

---

${details || `_No safety alerts currently in knowledge base._

When safety-relevant content is ingested (tackle laws, welfare guidance, concussion protocols),
it will appear here automatically.`}

---

_Always check World Rugby welfare resources: worldrugby.org/welfare_
`);
  return { alerts: alerts.length };
}

export function generateAllReports() {
  console.log('  Writing Rugby Intelligence Report…');
  const ri = writeRugbyIntelligenceReport();

  console.log('  Writing Law Updates Report…');
  const lu = writeLawUpdatesReport();

  console.log('  Writing Coaching Trends Report…');
  const ct = writeCoachingTrendsReport();

  console.log('  Writing Training Ideas Report…');
  const ti = writeTrainingIdeasReport();

  console.log('  Writing Safety Alerts Report…');
  const sa = writeSafetyAlertsReport();

  console.log('  Rebuilding Mission Control summary…');
  const summary = rebuildSummaryJSON();

  return { ...ri, ...lu, ...ct, ...ti, ...sa, summary };
}
