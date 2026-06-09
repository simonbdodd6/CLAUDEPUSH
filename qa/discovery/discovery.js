#!/usr/bin/env node
/**
 * Coach's Eye Discovery Agent — Core Engine
 *
 * Orchestrates the full discovery pipeline:
 *   Providers → Normalize → Deduplicate → Confidence → Lead DB → Reports
 *
 * Usage:
 *   node qa/discovery/discovery.js                        # run all providers
 *   node qa/discovery/discovery.js --providers csv,manual # specific providers
 *   node qa/discovery/discovery.js --dry-run              # don't write to DB
 *   node qa/discovery/discovery.js --list-providers       # show registered providers
 *
 * Output:
 *   qa/market-data/leads.json         — updated lead database
 *   qa/discovery-state/discovery-summary.json — Mission Control card data
 *   qa/discovery-state/sessions/<id>.json     — full session log
 *   qa/market-reports/DISCOVERY_REPORT.md     — human-readable report
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { normalizeRecord } from './normalize.js';
import { deduplicate } from './deduplicate.js';
import { calculateConfidence, CONFIDENCE_READY } from './confidence.js';
import { writeDiscoveryReport, writeDiscoverySummaryJSON } from './discovery-report.js';
import { getProvider, listProviders, DEFAULT_PROVIDERS } from './providers/index.js';
import { upsertLead, loadLeads } from '../market-intel/lead-db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../');
const STATE_DIR = join(ROOT, 'qa/discovery-state');
const SESSIONS_DIR = join(STATE_DIR, 'sessions');

function ensure(dir) { mkdirSync(dir, { recursive: true }); }

// ── Session management ────────────────────────────────────────────────────────

function createSession(providers) {
  return {
    sessionId: `disc_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${randomUUID().slice(0, 8)}`,
    startedAt: new Date().toISOString(),
    completedAt: null,
    providers,
    newCountries: [],
    stats: {
      discovered: 0,
      normalized: 0,
      unique: 0,
      duplicates: 0,
      duplicateRate: 0,
      readyForScoring: 0,
      newLeads: 0,
      updatedLeads: 0,
      errors: 0,
      totalLeadsInDb: 0,
    },
  };
}

function saveSession(session) {
  ensure(SESSIONS_DIR);
  const id = session.sessionId.replace(/\s/g, '');
  writeFileSync(join(SESSIONS_DIR, `${id}.json`), JSON.stringify(session, null, 2), 'utf8');
}

// ── Lead DB integration ───────────────────────────────────────────────────────

function discoveryToLead(record) {
  return {
    clubName: record.clubName,
    country: record.country,
    website: record.website || null,
    email: record.email || null,
    phone: null,
    socialFacebook: record.facebook || null,
    socialInstagram: record.instagram || null,
    level: record.level || 'unknown',
    estimatedPlayers: null,
    notes: record.notes || '',
    source: record.source || 'discovery',
  };
}

// ── Main discovery pipeline ───────────────────────────────────────────────────

export async function runDiscovery({
  providers = DEFAULT_PROVIDERS,
  dryRun = false,
  providerOptions = {},
} = {}) {
  const session = createSession(providers);
  console.log(`\n🔭 Discovery Agent — session ${session.sessionId.replace(/\s/g, '')}`);
  console.log(`   Providers: ${providers.join(', ')}${dryRun ? '  [DRY RUN]' : ''}\n`);

  // ── Step 1: Collect from all providers ──────────────────────────────────────
  const raw = [];
  for (const providerName of providers) {
    let count = 0;
    try {
      const provider = getProvider(providerName);
      console.log(`── Collecting: ${provider.meta.displayName} ──`);
      for await (const record of provider.provide(providerOptions[providerName] ?? {})) {
        raw.push(record);
        count++;
      }
      console.log(`   ${count} records from ${provider.meta.displayName}`);
    } catch (err) {
      console.warn(`   ⚠️  Provider "${providerName}" error: ${err.message}`);
      session.stats.errors++;
    }
  }
  session.stats.discovered = raw.length;
  console.log(`\n   Total collected: ${raw.length} records`);

  if (!raw.length) {
    console.log('\n   No records to process. Add files to qa/market-input/ and retry.\n');
    session.completedAt = new Date().toISOString();
    saveSession(session);
    writeDiscoverySummaryJSON(session);
    return session;
  }

  // ── Step 2: Normalize ────────────────────────────────────────────────────────
  const normalized = raw.map(r => {
    try { return normalizeRecord(r); }
    catch { session.stats.errors++; return null; }
  }).filter(Boolean);
  session.stats.normalized = normalized.length;

  // ── Step 3: Deduplicate ──────────────────────────────────────────────────────
  const { unique, duplicates, stats: dedupStats } = deduplicate(normalized);
  session.stats.unique = unique.length;
  session.stats.duplicates = duplicates.length;
  session.stats.duplicateRate = dedupStats.duplicateRate;
  console.log(`\n── Deduplication ─────────────────────────────────────────`);
  console.log(`   ${unique.length} unique  /  ${duplicates.length} duplicates (${Math.round(dedupStats.duplicateRate * 100)}%)`);

  // ── Step 4: Confidence scoring ───────────────────────────────────────────────
  for (const record of unique) {
    const corroborations = (record.providers || []).length;
    const { score, factors, tier } = calculateConfidence(record, corroborations);
    record.confidence = score;
    record.confidenceFactors = factors;
    record.confidenceTier = tier;
  }
  session.stats.readyForScoring = unique.filter(r => (r.confidence ?? 0) >= CONFIDENCE_READY).length;
  console.log(`\n── Confidence ────────────────────────────────────────────`);
  console.log(`   Ready (≥0.70): ${session.stats.readyForScoring}  /  Review: ${unique.filter(r => r.confidence >= 0.45 && r.confidence < 0.70).length}  /  Low: ${unique.filter(r => r.confidence < 0.45).length}`);

  // ── Step 5: New countries ────────────────────────────────────────────────────
  const existingLeads = loadLeads();
  const existingCountries = new Set(existingLeads.map(l => l.country));
  const discoveredCountries = new Set(unique.map(r => r.country));
  session.newCountries = [...discoveredCountries].filter(c => !existingCountries.has(c) && c !== 'Unknown');

  // ── Step 6: Feed to lead database ────────────────────────────────────────────
  console.log(`\n── Writing to lead database ${dryRun ? '(DRY RUN)' : ''} ──────────────────────`);
  const { newLeads, updatedLeads } = await feedToLeadDbSimple(unique, existingLeads, dryRun);
  session.stats.newLeads = newLeads;
  session.stats.updatedLeads = updatedLeads;
  session.stats.totalLeadsInDb = existingLeads.length + (dryRun ? 0 : newLeads);
  console.log(`   ${newLeads} new leads added  /  ${updatedLeads} existing leads updated`);
  if (session.newCountries.length) console.log(`   🌍 New countries: ${session.newCountries.join(', ')}`);

  // ── Step 7: Reports ───────────────────────────────────────────────────────────
  const allRecords = [...unique, ...duplicates];
  session.completedAt = new Date().toISOString();
  writeDiscoveryReport(session, allRecords);
  const summary = writeDiscoverySummaryJSON(session);
  saveSession(session);

  console.log(`\n📊 Session complete`);
  console.log(`   New:       ${session.stats.newLeads}`);
  console.log(`   Updated:   ${session.stats.updatedLeads}`);
  console.log(`   Ready:     ${session.stats.readyForScoring}`);
  console.log(`   Countries: ${discoveredCountries.size} (${session.newCountries.length} new)`);
  console.log(`   Report:    qa/market-reports/DISCOVERY_REPORT.md\n`);

  return session;
}

// Simpler db writer that avoids dynamic imports
async function feedToLeadDbSimple(unique, existingDb, dryRun) {
  let newLeads = 0, updatedLeads = 0;

  for (const record of unique) {
    if ((record.confidence ?? 0) < 0.10) continue;
    const lead = discoveryToLead(record);
    if (!dryRun) {
      const result = upsertLead(lead, existingDb);
      if (result.isNew) newLeads++;
      else updatedLeads++;
    } else {
      const normKey = `${(lead.clubName || '').trim().toLowerCase()}::${(lead.country || '').trim().toLowerCase()}`;
      const exists = existingDb.some(l =>
        `${(l.clubName || '').trim().toLowerCase()}::${(l.country || '').trim().toLowerCase()}` === normKey
      );
      if (exists) updatedLeads++; else newLeads++;
    }
  }

  if (!dryRun) {
    const { writeFileSync } = await import('node:fs');
    const dataPath = join(ROOT, 'qa/market-data/leads.json');
    writeFileSync(dataPath, JSON.stringify(existingDb, null, 2), 'utf8');
  }

  return { newLeads, updatedLeads };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--list-providers')) {
  console.log('\nRegistered providers:\n');
  listProviders().forEach(p => {
    console.log(`  ${p.key.padEnd(24)} ${p.displayName}`);
    console.log(`  ${''.padEnd(24)} Input: ${p.inputDir}`);
  });
  console.log();
  process.exit(0);
}

const providerArg = args.find(a => a.startsWith('--providers='))?.split('=')[1];
const providers = providerArg ? providerArg.split(',').map(s => s.trim()) : DEFAULT_PROVIDERS;
const dryRun = args.includes('--dry-run');

runDiscovery({ providers, dryRun }).catch(err => {
  console.error('\n❌ Discovery error:', err.message);
  process.exit(1);
});
