#!/usr/bin/env node
/**
 * Lead Personalisation Agent — main orchestrator
 *
 * Connects:
 *   Market Intelligence  →  lead database (qa/market-data/leads.json)
 *   Rugby Intelligence   →  knowledge base (qa/rugby-knowledge/knowledge.jsonl)
 *   Coaching Assistant   →  query engine (qa/rugby-assistant/query.js)
 *
 * Produces:
 *   LEAD_PERSONALISATION_REPORT.md
 *   TOP_10_CLUB_PREVIEWS.md
 *   PERSONALISED_OUTREACH_DRAFTS.md
 *   qa/lead-personalisation/data/personalisation-summary.json  (Mission Control)
 *
 * Usage:
 *   npm run lead:personalise
 *   npm run lead:personalise -- --demo
 *   npm run lead:personalise -- --threshold=8.0 --limit=5
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectLeads, expectedARR }       from './select-leads.js';
import { buildClubProfile }               from './club-profile.js';
import { generateCoachingPreview }        from './coaching-preview.js';
import { generateOutreachDrafts }         from './outreach-draft.js';
import { generateAllReports }             from './generate-report.js';

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '../../');
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');

// ── CLI arg parsing ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { demo: false, threshold: 7.5, limit: 10, dryRun: false };

  for (const arg of args) {
    if (arg === '--demo')        opts.demo = true;
    if (arg === '--dry-run')     opts.dryRun = true;
    if (arg.startsWith('--threshold=')) opts.threshold = parseFloat(arg.split('=')[1]);
    if (arg.startsWith('--limit='))     opts.limit = parseInt(arg.split('=')[1]);
  }
  return opts;
}

// ── Progress logger ────────────────────────────────────────────────────────────

function log(msg)  { process.stdout.write(`  ${msg}\n`); }
function step(msg) { process.stdout.write(`\n── ${msg} ${'─'.repeat(Math.max(0, 52 - msg.length))}\n`); }

// ── Summary JSON for Mission Control ──────────────────────────────────────────

function writeSummaryJSON(results, meta) {
  mkdirSync(DATA_DIR, { recursive: true });

  const totalARR = results.reduce((sum, r) => sum + expectedARR(r.lead.fitScore), 0);
  const byCountry = {};
  results.forEach(r => {
    byCountry[r.lead.country] = (byCountry[r.lead.country] || 0) + 1;
  });

  const summary = {
    generatedAt:      new Date().toISOString(),
    isDemo:           meta.isDemo,
    totalLeads:       results.length,
    totalExpectedARR: totalARR,
    byCountry,
    mode:             meta.mode,
    topLeads: results.slice(0, 5).map(r => ({
      clubName:      r.lead.clubName,
      country:       r.lead.country,
      fitScore:      r.lead.fitScore,
      expectedARR:   expectedARR(r.lead.fitScore),
      hasEmail:      !!r.lead.email,
      ageGroups:     r.profile.ageGroups,
      draftStatus:   'draft',
      approvedToSend: false,
      nextAction:    r.lead.email
        ? `Send short email to ${r.lead.email} (review draft first)`
        : `Find contact at ${r.lead.website || r.lead.clubName + '.com'}`,
      sessionHook:   `${r.preview.sessionIdea.ageGroup} ${r.preview.sessionIdea.theme} session idea`,
    })),
    draftStatusBreakdown: {
      draft:    results.length,
      approved: 0,
      sent:     0,
    },
    reportFiles: [
      'LEAD_PERSONALISATION_REPORT.md',
      'TOP_10_CLUB_PREVIEWS.md',
      'PERSONALISED_OUTREACH_DRAFTS.md',
    ],
  };

  writeFileSync(join(DATA_DIR, 'personalisation-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log('\n🏉 Coach\'s Eye Lead Personalisation Agent');
  console.log('   Connects Market Intelligence + Rugby Coaching Assistant\n');

  if (opts.dryRun) console.log('   [DRY RUN — no files will be written]\n');
  if (opts.demo)   console.log('   [DEMO MODE — using synthetic leads]\n');

  // ── Step 1: Select leads
  step('Selecting leads');
  const { leads, isDemo, totalInDb, filtered } = selectLeads({
    threshold: opts.threshold,
    limit:     opts.limit,
    demo:      opts.demo,
  });

  if (isDemo && !opts.demo) {
    log('⚠  Lead database is empty — running in demo mode');
    log('   To use real leads: add CSVs to qa/market-input/csv/ and run npm run market:import');
  }
  log(`Database: ${totalInDb} leads · Qualifying (score ≥${opts.threshold}): ${filtered} · Processing: ${leads.length}`);

  if (!leads.length) {
    log('No qualifying leads found. Exiting.');
    process.exit(0);
  }

  // ── Step 2: Process each lead
  step('Building profiles and previews');

  const results = [];
  const modes   = new Set();

  for (const lead of leads) {
    process.stdout.write(`  Processing ${lead.clubName} (${lead.country})…`);

    const profile  = buildClubProfile(lead);
    const preview  = await generateCoachingPreview(lead, profile);
    const drafts   = opts.dryRun ? null : await generateOutreachDrafts(lead, profile, preview);

    modes.add(preview.mode);
    results.push({ lead, profile, preview, drafts: drafts ?? { status: 'skipped (dry-run)', subjectLines: [], shortEmail: '', longEmail: '', linkedInMessage: '' } });

    process.stdout.write(` ✓ [${preview.mode}]\n`);
  }

  // ── Step 3: Write reports
  if (!opts.dryRun) {
    const mode = modes.has('claude') ? 'claude' : 'template';
    generateAllReports(results, { isDemo, mode });

    // ── Step 4: Write Mission Control summary
    const summary = writeSummaryJSON(results, { isDemo, mode });
    log(`Written: qa/lead-personalisation/data/personalisation-summary.json`);

    // ── Step 5: Console summary
    const totalARR = summary.totalExpectedARR;
    console.log(`
── Results ─────────────────────────────────────────────────────
   Leads personalised: ${results.length}
   Pipeline expected ARR: €${totalARR.toLocaleString()}
   Mode: ${mode}${isDemo ? ' (DEMO)' : ''}

   Reports:
     LEAD_PERSONALISATION_REPORT.md
     TOP_10_CLUB_PREVIEWS.md
     PERSONALISED_OUTREACH_DRAFTS.md

   ⚠️  Review all drafts before sending. Nothing was sent.
────────────────────────────────────────────────────────────────`);

    // Top leads preview
    console.log('\n   Top leads by expected value:');
    results.slice(0, 5).forEach((r, i) => {
      const arr = expectedARR(r.lead.fitScore);
      const tag = r.lead.email ? '✉️' : '🌐';
      console.log(`   ${i + 1}. ${r.lead.clubName} (${r.lead.country}) — €${arr} ARR ${tag}`);
    });
    console.log('');

  } else {
    console.log('\n── DRY RUN COMPLETE ─────────────────────────────────────────────');
    results.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.lead.clubName} · score ${r.lead.fitScore} · ${r.profile.ageGroups.join(',')} · ${r.preview.mode}`);
    });
    console.log('   (no files written)');
  }
}

main().catch(err => {
  console.error(`\n  Error: ${err.message}`);
  process.exit(1);
});
