#!/usr/bin/env node
/**
 * Coach's Eye Rugby Intelligence Agent — CLI Entry Point
 *
 * Usage:
 *   npm run rugby:intel                    # ingest all providers + generate reports
 *   npm run rugby:intel:reports            # regenerate reports only (no ingest)
 *   npm run rugby:intel:summary            # print knowledge base summary
 *   node qa/rugby-intel/rugby-intel.js --providers=article,law-update
 *   node qa/rugby-intel/rugby-intel.js --dry-run
 *   node qa/rugby-intel/rugby-intel.js --force     # re-ingest already-seen files
 *   node qa/rugby-intel/rugby-intel.js --list      # show providers
 *
 * Drop content in:
 *   qa/rugby-input/articles/  — saved rugby articles
 *   qa/rugby-input/laws/      — World Rugby law updates
 *   qa/rugby-input/drills/    — drill descriptions
 *   qa/rugby-input/notes/     — coaching notes, pasted text
 */

import { ingest } from './ingest.js';
import { generateAllReports } from './generate-reports.js';
import { stats, rebuildSummaryJSON } from './knowledge-db.js';
import { listProviders, DEFAULT_PROVIDERS } from './providers/index.js';

const args = process.argv.slice(2);

function hasFlag(flag) { return args.includes(flag); }
function getArg(prefix) { return args.find(a => a.startsWith(prefix))?.slice(prefix.length); }

const dryRun = hasFlag('--dry-run');
const forceReingest = hasFlag('--force');
const reportsOnly = hasFlag('--reports-only');
const summaryOnly = hasFlag('--summary');
const listMode = hasFlag('--list') || hasFlag('--list-providers');

const providerArg = getArg('--providers=');
const providers = providerArg ? providerArg.split(',').map(s => s.trim()) : DEFAULT_PROVIDERS;

async function run() {
  console.log('\n🏉 Coach\'s Eye Rugby Intelligence Agent\n');

  if (listMode) {
    console.log('Registered providers:\n');
    listProviders().forEach(p => {
      console.log(`  ${p.key.padEnd(16)} ${p.displayName.padEnd(20)} ${p.inputDir}`);
    });
    console.log();
    return;
  }

  if (summaryOnly) {
    const s = stats();
    console.log('Knowledge Base Summary');
    console.log('─'.repeat(40));
    console.log(`  Total items:    ${s.total}`);
    console.log(`  This week:      ${s.thisWeek}`);
    console.log(`  Law updates:    ${s.lawUpdates}`);
    console.log(`  Safety alerts:  ${s.safetyAlerts}`);
    console.log(`  Drills:         ${s.drills}`);
    console.log(`  Claude mode:    ${s.byMode.claude}`);
    console.log(`  Heuristic:      ${s.byMode.heuristic}`);
    console.log('\nTop categories:');
    Object.entries(s.categoryCounts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .forEach(([cat, count]) => console.log(`  ${cat.padEnd(20)} ${count}`));
    console.log();
    return;
  }

  if (!reportsOnly) {
    console.log(`── Ingesting content ${dryRun ? '[DRY RUN]' : ''} ─────────────────────────────────`);
    console.log(`   Providers: ${providers.join(', ')}\n`);

    const session = await ingest({ providers, dryRun, forceReingest });

    console.log(`\n── Ingest complete ──────────────────────────────────────────`);
    console.log(`   Seen:     ${session.stats.seen}`);
    console.log(`   Ingested: ${session.stats.ingested}`);
    console.log(`   Skipped:  ${session.stats.skipped} (already in DB)`);
    console.log(`   Errors:   ${session.stats.errors}`);

    if (session.stats.ingested === 0) {
      console.log('\n   No new content found.');
      console.log('   Add files to qa/rugby-input/ and run again.');
      if (!hasFlag('--reports-on-empty')) {
        console.log();
        return;
      }
    }
  }

  console.log('\n── Generating reports ───────────────────────────────────────');
  const result = generateAllReports();
  console.log(`
📊 Reports written to qa/rugby-knowledge/
   RUGBY_INTELLIGENCE_REPORT.md
   LAW_UPDATES_REPORT.md
   COACHING_TRENDS_REPORT.md
   TRAINING_IDEAS_REPORT.md
   SAFETY_ALERTS_REPORT.md
   rugby-intel-summary.json  (Mission Control)

📚 Knowledge base: ${result.summary?.totalItems ?? 0} items total
`);
}

run().catch(err => {
  console.error('\n❌ Rugby Intel error:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
