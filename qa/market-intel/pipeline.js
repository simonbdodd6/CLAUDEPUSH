#!/usr/bin/env node
/**
 * Coach's Eye Market Intelligence Pipeline
 *
 * Usage:
 *   node qa/market-intel/pipeline.js              # full run: import → score → report
 *   node qa/market-intel/pipeline.js --import     # CSV import only
 *   node qa/market-intel/pipeline.js --score      # score unscored leads only
 *   node qa/market-intel/pipeline.js --reports    # regenerate reports only
 *   node qa/market-intel/pipeline.js --rescore    # rescore ALL leads (reset scores)
 *
 * Drop CSV files in: qa/market-input/csv/
 * CSV columns: club_name, country, website, email, social_facebook, social_instagram, level, notes
 */

import { importAllCSVs } from './import-csv.js';
import { scoreAllLeads } from './score-leads.js';
import { writeHotLeadsReport, writeCountryOpportunityReport, writeCompetitorPricingReport, writeSummaryJSON } from './generate-reports.js';
import { loadLeads } from './lead-db.js';

const args = new Set(process.argv.slice(2));
const importOnly = args.has('--import');
const scoreOnly = args.has('--score');
const reportsOnly = args.has('--reports');
const rescore = args.has('--rescore');

const runImport = importOnly || (!scoreOnly && !reportsOnly);
const runScore = scoreOnly || rescore || (!importOnly && !reportsOnly);
const runReports = reportsOnly || (!importOnly && !scoreOnly && !rescore);

async function run() {
  console.log('\n🏉 Coach\'s Eye — Market Intelligence Pipeline\n');

  if (runImport) {
    console.log('── Step 1: Import CSV files ──────────────────────────────');
    const results = await importAllCSVs();
    if (results.length) {
      const total = results.reduce((s, r) => ({ added: s.added + r.added, updated: s.updated + r.updated }), { added: 0, updated: 0 });
      console.log(`  Total: ${total.added} added, ${total.updated} updated`);
    }
    console.log(`  Database now contains ${loadLeads().length} leads`);
  }

  if (runScore) {
    console.log('\n── Step 2: Score leads ───────────────────────────────────');
    const result = await scoreAllLeads({ rescoreAll: rescore });
    console.log(`  ${result.scored} leads scored (${result.mode})`);
  }

  if (runReports) {
    console.log('\n── Step 3: Generate reports ──────────────────────────────');
    const leads = loadLeads();

    if (!leads.length) {
      console.log('  No leads in database — skipping reports');
      console.log('  Add a CSV to qa/market-input/csv/ and run with --import');
      process.exit(0);
    }

    const hot = writeHotLeadsReport(leads);
    console.log(`  ✓ HOT_LEADS_REPORT.md — ${hot.hotLeads} hot leads, €${hot.pipelineARR.toLocaleString()} expected ARR`);

    const opp = writeCountryOpportunityReport(leads);
    console.log(`  ✓ COUNTRY_OPPORTUNITY_REPORT.md — ${opp.countries} countries, €${opp.totalARR.toLocaleString()} total ARR`);

    const comp = writeCompetitorPricingReport();
    console.log(`  ✓ COMPETITOR_PRICING_REPORT.md — ${comp.competitors} competitors`);

    const summary = writeSummaryJSON(leads);
    console.log(`  ✓ market-intel-summary.json — ${summary.clubsReviewed} clubs, €${summary.totalExpectedARR.toLocaleString()} pipeline`);

    console.log(`
📊 Pipeline summary
   Leads in database:  ${leads.length}
   Hot leads (≥7.5):  ${summary.hotLeads}
   Expected ARR:       €${summary.totalExpectedARR.toLocaleString()}
   Countries:          ${Object.keys(summary.byCountry).length}${summary.topLeads[0] ? `\n   Top lead:           ${summary.topLeads[0].name} (${summary.topLeads[0].fitScore}/10, ${summary.topLeads[0].contact})` : ''}`);
  }

  console.log('\n✅ Done\n');
}

run().catch(err => {
  console.error('\n❌ Pipeline error:', err.message);
  process.exit(1);
});
