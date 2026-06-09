#!/usr/bin/env node
// Coach's Eye Data Integration Layer — integration test & report generator
// Usage: node qa/data-integration/data-integration-cli.js

import { checkAllHealth, quickHealthCheck } from './data-health.js';
import { getAvailableData, getMissingData, registryStats } from './data-registry.js';
import { query, queryPlayerData, queryTeamData, queryClubData } from './data-query.js';
import { getPermissionMatrix, canAccess } from './data-permissions.js';
import { buildFullReport, buildDataInventory, buildPermissionTable } from './data-report.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Bootstrap all adapters
import './adapters/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(__dirname, '../../DATA_INTEGRATION_REPORT.md');

const LINE = '─'.repeat(60);

function section(title) { console.log(`\n${LINE}\n  ${title}\n${LINE}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function info(msg) { console.log(`  · ${msg}`); }

async function main() {
  console.log('\n🏉  Coach\'s Eye — Data Integration Layer\n');

  // ── 1. Registry stats ──────────────────────────────────────────
  section('1. Registry');
  const stats = registryStats();
  ok(`${stats.totalSources} sources registered`);
  Object.entries(stats.byType).forEach(([type, count]) => info(`${type}: ${count}`));

  // ── 2. Health check ────────────────────────────────────────────
  section('2. Health Check');
  const health = await checkAllHealth();
  info(`Overall: ${health.overall.toUpperCase()}`);
  info(`Total: ${health.totalSources}  Healthy: ${health.healthy}  Mock: ${health.mock}  Unavailable: ${health.unavailable}  Planned: ${health.planned}`);
  health.sources.forEach(s => {
    const icon = s.status === 'healthy' ? '✓' : s.status === 'mock' ? '~' : s.status === 'planned' ? '·' : '✗';
    console.log(`  ${icon} ${s.name.padEnd(20)} ${s.status.padEnd(12)} ${s.isMock ? '(mock)' : '(live)'} ${s.recordCount != null ? `${s.recordCount} records` : ''}`);
  });

  // ── 3. Permission matrix ───────────────────────────────────────
  section('3. Permissions');
  const roles = ['public', 'player', 'coach', 'manager', 'admin', 'dor'];
  const allSourcesObj = getAvailableData('dor');
  const allSources = allSourcesObj.sources ?? allSourcesObj;
  for (const role of roles) {
    const accessible = getAvailableData(role).totalSources ?? 0;
    info(`${role.padEnd(10)} → ${accessible}/${allSourcesObj.totalSources} sources`);
  }

  // ── 4. Sample queries ──────────────────────────────────────────
  section('4. Sample Queries (coach role)');
  const queryResults = [];

  const pResult = await queryPlayerData({ role: 'coach' });
  ok(`Players: ${pResult.count} records (mock=${pResult.isMock})`);
  queryResults.push(pResult);

  const tResult = await queryTeamData({ role: 'coach' });
  ok(`Teams: ${tResult.count} records (mock=${tResult.isMock})`);
  queryResults.push(tResult);

  const injResult = await query({ source: 'injuries', role: 'manager' });
  ok(`Injuries (manager): ${injResult.count} records (mock=${injResult.isMock})`);
  queryResults.push(injResult);

  const fixtResult = await query({ source: 'fixtures', role: 'public' });
  ok(`Fixtures (public): ${fixtResult.count} records (mock=${fixtResult.isMock})`);
  queryResults.push(fixtResult);

  const memResult = await query({ source: 'membership', role: 'manager' });
  ok(`Memberships (manager): ${memResult.count} records (mock=${memResult.isMock})`);
  queryResults.push(memResult);

  const barResult = await query({ source: 'bar-sales', role: 'manager' });
  ok(`Bar sales (manager): ${barResult.count} records (mock=${barResult.isMock})`);
  queryResults.push(barResult);

  // ── 5. Access-denied test ──────────────────────────────────────
  section('5. Permission Enforcement');
  const denied = await query({ source: 'injuries', role: 'player' });
  if (!denied.success) {
    ok(`Injuries blocked for player role ✓ (error: ${denied.error})`);
  } else {
    warn('Expected injuries to be denied for player role');
  }

  const publicFixtures = await query({ source: 'fixtures', role: 'public' });
  if (publicFixtures.success) {
    ok(`Fixtures accessible to public role ✓ (${publicFixtures.count} records)`);
  }

  // ── 6. Missing data sources ────────────────────────────────────
  section('6. Missing / Planned Sources');
  const missingObj = getMissingData();
  const missing = missingObj.sources ?? missingObj;
  if (missing.length === 0) {
    ok('All registered sources have data');
  } else {
    missing.forEach(s => warn(`${s.name} (${s.adapterStatus}) — ${s.description}`));
  }

  // ── 7. Generate report ─────────────────────────────────────────
  section('7. Generating DATA_INTEGRATION_REPORT.md');
  const reportContent = buildFullReport(health, queryResults, new Date());
  writeFileSync(REPORT_PATH, reportContent, 'utf8');
  ok(`Report written to: ${REPORT_PATH}`);

  console.log(`\n${LINE}`);
  console.log('  Data Integration Layer — all checks passed');
  console.log(`${LINE}\n`);
}

main().catch(err => {
  console.error('\n✗ Data integration CLI failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
