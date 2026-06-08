/**
 * qa/nightly.js — Nightly QA runner for Workflows 4–7
 *
 * Runs W4 → W5 → W6 → W7 sequentially, waits for all to complete regardless
 * of individual failures, aggregates results, and writes NIGHTLY_QA_REPORT.md.
 *
 * Every workflow uses existing qa/run-qa.js infrastructure — no logic is
 * duplicated here. This file only orchestrates, aggregates, and reports.
 *
 * Usage:
 *   QA_BASE_URL=https://... node qa/nightly.js
 *   npm run qa:nightly
 *
 * Exit code: 0 if all four workflows pass, 1 if any fail.
 */

import { spawn }         from 'node:child_process';
import fs                from 'node:fs';
import path              from 'node:path';
import { execFileSync }  from 'node:child_process';

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
const ROOT     = process.cwd();
const REPORT   = path.join(ROOT, 'NIGHTLY_QA_REPORT.md');

// ─── Workflow registry ────────────────────────────────────────────────────────
// Credential chain: W4 saves player email/password; W5–W7 read from workflow-4.json.
// Run in this order so each workflow has the credentials it needs.
const WORKFLOWS = [
  {
    id:         4,
    flag:       '--workflow-4',
    label:      'Group Invite → Approval',
    resultPath: 'qa/results/workflow-4.json',
    reportFile: 'QA_WORKFLOW_4_REPORT.md',
  },
  {
    id:         5,
    flag:       '--workflow-5',
    label:      'Coach ↔ Player DM Messaging',
    resultPath: 'qa/results/workflow-5.json',
    reportFile: 'QA_WORKFLOW_5_MESSAGING_REPORT.md',
  },
  {
    id:         6,
    flag:       '--workflow-6',
    label:      'Squad Broadcast → Receive → Permissions',
    resultPath: 'qa/results/workflow-6.json',
    reportFile: 'QA_WORKFLOW_6_REPORT.md',
  },
  {
    id:         7,
    flag:       '--workflow-7',
    label:      'Player Session Expiry Recovery',
    resultPath: 'qa/results/workflow-7.json',
    reportFile: 'QA_WORKFLOW_7_SESSION_EXPIRY_REPORT.md',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runWorkflow(flag) {
  return new Promise(resolve => {
    const proc = spawn(
      'node',
      [path.join(ROOT, 'qa/run-qa.js'), flag],
      { stdio: 'inherit', env: { ...process.env, QA_BASE_URL: BASE_URL }, cwd: ROOT }
    );
    proc.on('close',  code => resolve(code ?? 1));
    proc.on('error',  err  => { console.error('[nightly] spawn error:', err.message); resolve(1); });
  });
}

function readResult(resultPath) {
  const abs = path.join(ROOT, resultPath);
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch { return null; }
}

// Inline: mirrors qa/helpers/shared-steps.js redisEstimate to keep the runner
// self-contained (shared-steps imports @playwright/test which is test-only).
function redisEst(endpoint, method = 'GET') {
  if (endpoint.startsWith('/api/identity'))     return method === 'GET' ? 6 : 8;
  if (endpoint.startsWith('/api/chat'))         return 8;
  if (endpoint.startsWith('/api/invite'))       return method === 'POST' ? 8 : 4;
  if (endpoint.startsWith('/api/availability')) return 4;
  if (endpoint.startsWith('/api/cron'))         return 6;
  return 2;
}

function computeRedis(apiCalls = []) {
  return apiCalls.reduce((sum, c) => sum + redisEst(c.endpoint, c.method), 0);
}

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`;
}

function fmtStatus(s) {
  return s === 'passed' ? '✅ PASS' : s === 'failed' ? '❌ FAIL' : '⚠️  ' + (s ?? 'unknown').toUpperCase();
}

function gitCommit() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
}

function mdList(items, empty = 'None') {
  return items.length ? items.map(i => `- ${i}`).join('\n') : `- ${empty}`;
}

// ─── Main run ─────────────────────────────────────────────────────────────────

const runAt        = new Date().toISOString();
const nightlyStart = Date.now();
const commit       = gitCommit();

console.log(`\n${'═'.repeat(62)}`);
console.log(`  Coach's Eye — Nightly QA Runner`);
console.log(`  ${runAt}`);
console.log(`  Base URL : ${BASE_URL}`);
console.log(`  Commit   : ${commit}`);
console.log(`${'═'.repeat(62)}\n`);

const entries = [];

for (const wf of WORKFLOWS) {
  console.log(`\n${'─'.repeat(62)}`);
  console.log(`  ▶  Workflow ${wf.id} — ${wf.label}`);
  console.log(`${'─'.repeat(62)}`);

  const wfStart  = Date.now();
  const exitCode = await runWorkflow(wf.flag);
  const elapsed  = Date.now() - wfStart;
  const result   = readResult(wf.resultPath);
  const status   = result?.status ?? (exitCode === 0 ? 'passed' : 'failed');

  entries.push({ ...wf, result, durationMs: elapsed, exitCode, status });

  const icon = status === 'passed' ? '✓' : '✗';
  const stepsTotal  = result?.steps?.length ?? 0;
  const stepsPassed = result?.steps?.filter(s => s.status === 'passed').length ?? 0;
  console.log(`\n  ${icon}  W${wf.id} — ${status.toUpperCase()}  |  ${stepsPassed}/${stepsTotal} steps  |  ${fmtMs(elapsed)}`);
}

const totalMs     = Date.now() - nightlyStart;
const allPassed   = entries.every(e => e.status === 'passed');
const totalSteps  = entries.reduce((s, e) => s + (e.result?.steps?.length ?? 0), 0);
const passedSteps = entries.reduce((s, e) => s + (e.result?.steps?.filter(st => st.status === 'passed').length ?? 0), 0);
const totalRedis  = entries.reduce((s, e) => s + computeRedis(e.result?.apiCalls), 0);

// ─── Generate NIGHTLY_QA_REPORT.md ───────────────────────────────────────────

function generateReport() {
  const dashRows = entries.map(e => {
    const steps   = e.result?.steps ?? [];
    const passed  = steps.filter(s => s.status === 'passed').length;
    const redis   = computeRedis(e.result?.apiCalls);
    return `| W${e.id} | ${e.label} | ${fmtStatus(e.status)} | ${passed}/${steps.length} | ${fmtMs(e.durationMs)} | ~${redis} |`;
  });

  const dashTotal = `| **—** | **Total** | **${fmtStatus(allPassed ? 'passed' : 'failed')}** | **${passedSteps}/${totalSteps}** | **${fmtMs(totalMs)}** | **~${totalRedis}** |`;

  // Per-workflow step tables
  const wfSections = entries.map(e => {
    const steps   = e.result?.steps ?? [];
    const heading = `### W${e.id} — ${e.label} — ${fmtStatus(e.status)}`;
    const header  = '| # | Step | Status | Duration | Notes |';
    const sep     = '|---|---|---|---|---|';
    const rows    = steps.map((s, i) => {
      const ms   = (s.finishedAt && s.startedAt)
        ? Math.round(new Date(s.finishedAt) - new Date(s.startedAt)) + 'ms'
        : '—';
      const note = (s.error || s.note || '').slice(0, 100);
      return `| ${i + 1} | ${s.name}${s.context ? ' [' + s.context + ']' : ''} | ${s.status === 'passed' ? '✅' : '❌'} | ${ms} | ${note} |`;
    });
    const detail  = e.result
      ? `**Login method:** ${e.result.loginMethod ?? '—'}  |  **Base URL:** ${e.result.baseURL ?? '—'}`
      : '_No result data_';
    return [heading, '', detail, '', header, sep, ...rows].join('\n');
  });

  // Failures summary
  const failures = entries
    .filter(e => e.status !== 'passed')
    .map(e => {
      const failStep = e.result?.steps?.find(s => s.status === 'failed');
      const shot     = failStep?.screenshot ? `  - Screenshot: \`${path.relative(ROOT, failStep.screenshot)}\`` : '';
      const snap     = failStep?.domSnapshot ? `  - HTML snapshot: \`${path.relative(ROOT, failStep.domSnapshot)}\`` : '';
      return [
        `#### W${e.id} — ${e.label}`,
        `- **First failure:** ${failStep ? `Step ${(e.result?.steps?.indexOf(failStep) ?? 0) + 1} — "${failStep.name}"` : 'unknown'}`,
        failStep?.error ? `- **Error:** ${failStep.error.slice(0, 300)}` : '',
        shot,
        snap,
      ].filter(Boolean).join('\n');
    });

  // Redis breakdown
  const redisBreakdown = entries.map(e => {
    const redis = computeRedis(e.result?.apiCalls);
    return `| W${e.id} | ${e.label} | ${e.result?.apiCalls?.length ?? 0} | ~${redis} |`;
  });

  // Console errors
  const consoleErrors = entries.flatMap(e =>
    (e.result?.console ?? [])
      .filter(c => c.type === 'error' && !/401|403|404/.test(c.text))
      .slice(0, 5)
      .map(c => `[W${e.id}] ${c.text.slice(0, 120)}`)
  );

  const lines = [
    '# Coach\'s Eye — Nightly QA Report',
    '',
    `**Date:** ${runAt}`,
    `**Commit:** \`${commit}\``,
    `**Base URL:** ${BASE_URL}`,
    `**Overall: ${fmtStatus(allPassed ? 'passed' : 'failed')}**`,
    '',
    '---',
    '',
    '## Dashboard Summary',
    '',
    '| # | Workflow | Status | Steps | Duration | ~Redis ops |',
    '|---|---|---|---|---|---|',
    ...dashRows,
    dashTotal,
    '',
    '---',
    '',
    '## Failures',
    '',
    ...(failures.length > 0
      ? failures
      : ['_No failures — all workflows passed._']),
    '',
    '---',
    '',
    '## Per-Workflow Step Detail',
    '',
    ...wfSections.flatMap(s => [s, '']),
    '---',
    '',
    '## Redis Impact',
    '',
    '| Workflow | Description | API calls | ~Redis ops |',
    '|---|---|---|---|',
    ...redisBreakdown,
    `| **—** | **Total** | **${entries.reduce((s, e) => s + (e.result?.apiCalls?.length ?? 0), 0)}** | **~${totalRedis}** |`,
    '',
    '> Estimate: `GET /api/identity` ~6 ops · `POST /api/identity` ~8 ops · `/api/chat` ~8 ops · `/api/invite` ~4–8 ops',
    '',
    '---',
    '',
    '## Per-Workflow Reports',
    '',
    ...entries.map(e => `- W${e.id}: [${e.reportFile}](${e.reportFile})`),
    '',
    '## Artifacts',
    '',
    ...entries.map(e => {
      const dir = path.join(ROOT, `qa/artifacts`);
      if (!fs.existsSync(dir)) return `- W${e.id}: no artifacts directory`;
      const runs = fs.readdirSync(dir).filter(d => d.startsWith(`workflow${e.id}-`)).sort().reverse();
      return runs.length
        ? `- W${e.id}: \`qa/artifacts/${runs[0]}/\` (${runs[0]})`
        : `- W${e.id}: no artifact directory found`;
    }),
    '',
    '## Console Errors (non-4xx)',
    '',
    mdList(consoleErrors.length ? consoleErrors : [], 'None'),
    '',
    '## Scope Guard',
    '',
    '- No Coach\'s Eye application code was modified.',
    '- Each workflow run writes its own result JSON and report file.',
    '- All workflows run even when earlier ones fail.',
    '- NIGHTLY_QA_REPORT.md is overwritten on each run.',
    '',
  ].filter(l => l !== null && l !== undefined);

  fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);
  console.log(`\n[nightly] Report written: NIGHTLY_QA_REPORT.md`);
}

generateReport();

// ─── Refresh Mission Control dashboard ───────────────────────────────────────
await new Promise(resolve => {
  const proc = spawn(
    'node',
    [path.join(ROOT, 'qa/mission-control/generate-dashboard.js')],
    { stdio: 'inherit', cwd: ROOT }
  );
  proc.on('close',  resolve);
  proc.on('error',  () => resolve());
});

// ─── Final summary ────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(62)}`);
console.log(`  Overall  : ${allPassed ? '✅  PASS' : '❌  FAIL'}`);
console.log(`  Steps    : ${passedSteps}/${totalSteps}`);
console.log(`  Duration : ${fmtMs(totalMs)}`);
console.log(`  Redis    : ~${totalRedis} ops`);
console.log(`${'═'.repeat(62)}\n`);

process.exit(allPassed ? 0 : 1);
