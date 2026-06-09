/**
 * Report generator — writes the three Markdown output files.
 *
 *   LEAD_PERSONALISATION_REPORT.md   — pipeline summary + per-lead stats
 *   PERSONALISED_OUTREACH_DRAFTS.md  — full outreach drafts for each club
 *   TOP_10_CLUB_PREVIEWS.md          — coaching preview for each club
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedARR } from './select-leads.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');

function write(filename, content) {
  writeFileSync(join(ROOT, filename), content, 'utf8');
  console.log(`  Written: ${filename}`);
}

function ts() {
  return new Date().toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' });
}

function scoreBar(score) {
  const filled = Math.round((score / 10) * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${score.toFixed(1)}`;
}

// ── LEAD_PERSONALISATION_REPORT.md ─────────────────────────────────────────────

export function writePersonalisationReport(results, meta = {}) {
  const totalARR = results.reduce((sum, r) => sum + expectedARR(r.lead.fitScore), 0);
  const byCountry = {};
  results.forEach(r => {
    byCountry[r.lead.country] = (byCountry[r.lead.country] || 0) + 1;
  });

  const countryRows = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `| ${c} | ${n} |`)
    .join('\n');

  const leadRows = results.map((r, i) => {
    const arr = expectedARR(r.lead.fitScore);
    const contact = r.lead.email ? `✉️ email` : `🌐 website`;
    return `| ${i + 1} | ${r.lead.clubName} | ${r.lead.country} | ${r.lead.fitScore.toFixed(1)} | €${arr} | ${contact} | ${r.preview.mode} |`;
  }).join('\n');

  const content = `# Lead Personalisation Report

Generated: ${ts()}${meta.isDemo ? '\n\n> ⚠️  **DEMO MODE** — using synthetic leads. Import real clubs via \`npm run market:import\`.' : ''}

## Summary

| Metric | Value |
|---|---|
| Leads personalised | ${results.length} |
| Pipeline expected ARR | €${totalARR.toLocaleString()} |
| Countries covered | ${Object.keys(byCountry).length} |
| Mode | ${meta.mode || 'heuristic'} |

## Leads Processed

| # | Club | Country | Fit Score | Expected ARR | Contact | Mode |
|---|---|---|---|---|---|---|
${leadRows}

## By Country

| Country | Leads |
|---|---|
${countryRows}

## How to Use This Data

1. **Review** — Read TOP_10_CLUB_PREVIEWS.md for coaching context on each club
2. **Approve** — Review PERSONALISED_OUTREACH_DRAFTS.md and personalise the drafts
3. **Send manually** — Copy approved drafts into your email client. Nothing is sent automatically.
4. **Track** — Update lead status in \`qa/market-data/leads.json\` after outreach

## Pipeline Connection

\`\`\`
Market Intelligence leads.json  →  select-leads.js (fit score filter)
                                         ↓
Rugby Intelligence knowledge.jsonl  →  coaching-preview.js (KB context)
                                         ↓
Claude Haiku / templates  →  outreach-draft.js (draft generation)
                                         ↓
         3 Markdown reports  →  Human review  →  Manual outreach
\`\`\`

## Revenue Model

| Fit Score | Conversion Rate | Expected ARR per Club |
|---|---|---|
| ≥ 9.0 | 30% | €252 |
| ≥ 8.0 | 20% | €168 |
| ≥ 7.5 | 10% | €84 |

Price: €70/month × 12 = €840/year per converting club
`;

  write('LEAD_PERSONALISATION_REPORT.md', content);
}

// ── TOP_10_CLUB_PREVIEWS.md ─────────────────────────────────────────────────────

export function writeClubPreviewsReport(results) {
  const sections = results.map((r, i) => {
    const { lead, profile, preview } = r;
    const arr = expectedARR(lead.fitScore);
    const ageGroupStr = profile.ageGroups.join(', ');
    const kbSources = preview.kbSources?.length
      ? preview.kbSources.map(s => `- ${s}`).join('\n')
      : '- No knowledge base matches (add content via `npm run rugby:intel`)';

    return `## ${i + 1}. ${lead.clubName}

**Country:** ${lead.country} · **Score:** ${scoreBar(lead.fitScore)} · **Expected ARR:** €${arr}
**Size:** ${lead.estimatedPlayers || '?'} players · **Age groups:** ${ageGroupStr}
**Contact:** ${lead.email || lead.website || 'website only'}

### Club Context

${profile.rugbyContext}

### Top Pain Points

1. ${profile.painPoints[0]}
2. ${profile.painPoints[1]}
3. ${profile.painPoints[2] || profile.painPoints[0]}

### Messaging Problem (specific to this club)

${preview.messagingPain}

### Coaching Preview — ${preview.sessionIdea.ageGroup} Session

**Theme:** ${preview.sessionIdea.theme} (${preview.sessionIdea.duration} min)

| Phase | Activity |
|---|---|
| Warm-up | ${preview.sessionIdea.warmUp} |
| Main activity | ${preview.sessionIdea.mainActivity} |
| Game | ${preview.sessionIdea.game} |

**Key coaching point:** ${preview.sessionIdea.keyCoachingPoint}

### Coaching Insight from Knowledge Base

> ${preview.coachingInsight}

### Why Coach's Eye Fits

${preview.coachesEyeValue}

### Knowledge Base Sources Used

${kbSources}

---
`;
  }).join('\n');

  const content = `# Top ${results.length} Club Previews

Generated: ${ts()}

> **Purpose:** Research and conversation context for each high-fit lead.
> Each preview combines Market Intelligence data with Rugby Coaching Assistant knowledge.

---

${sections}
`;

  write('TOP_10_CLUB_PREVIEWS.md', content);
}

// ── PERSONALISED_OUTREACH_DRAFTS.md ────────────────────────────────────────────

export function writeOutreachDraftsReport(results) {
  const sections = results.map((r, i) => {
    const { lead, profile, drafts } = r;
    const contact  = lead.email ? `To: ${lead.email}` : `Via: ${lead.website} (find contact manually)`;

    return `## ${i + 1}. ${lead.clubName} — ${lead.country}

> ${drafts.disclaimer}
> Mode: ${drafts.mode} | Status: DRAFT | Approved to send: NO
> ${contact}
> Recommended contact: **${profile.contactRole}**

### Subject Lines (choose one, personalise)

${drafts.subjectLines.map((s, n) => `${n + 1}. ${s}`).join('\n')}

### Short Email (under 100 words)

\`\`\`
${drafts.shortEmail}
\`\`\`

### Long Email (150–200 words)

\`\`\`
${drafts.longEmail}
\`\`\`

### LinkedIn / Social Message

\`\`\`
${drafts.linkedInMessage}
\`\`\`

---
`;
  }).join('\n');

  const content = `# Personalised Outreach Drafts

Generated: ${ts()}

> ⚠️  **ALL DRAFTS REQUIRE HUMAN REVIEW BEFORE SENDING**
> Nothing in this file is ready to send. Personalise with:
> - Actual contact name (replace [Name])
> - Your own name and signature
> - Any specific knowledge you have about the club
> - Remove or adjust anything that doesn't sound natural

---

${sections}
`;

  write('PERSONALISED_OUTREACH_DRAFTS.md', content);
}

// ── Orchestrator ───────────────────────────────────────────────────────────────

export function generateAllReports(results, meta = {}) {
  console.log('\n── Generating reports ──────────────────────────────────────────');
  writePersonalisationReport(results, meta);
  writeClubPreviewsReport(results);
  writeOutreachDraftsReport(results);
  console.log(`\n  Total: ${results.length} clubs personalised`);
}
